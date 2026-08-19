import Foundation

/// Tipo de ação enfileirada por um `LiveActivityIntent` tocado na tela
/// bloqueada. Fase 16 (CMD): três tipos, um por Intent. Fase 17 (REG-02):
/// `.adjustReps` (Plano 17-03) e `.adjustLoad` (este plano) — dois tipos
/// novos declarados juntos para não reabrir o enum entre planos.
public enum QueuedIntentActionKind: String, Codable {
  case completeSet
  case skipRest
  case adjustRest
  case adjustReps
  case adjustLoad
}

/// Entrada durável da fila do App Group. Gravada ANTES de qualquer tentativa
/// de round-trip in-process (`LiveActivityModule.shared?.sendEvent`) — é o
/// contrato que sobrevive a um app force-quit e que a reconciliação de
/// cold-launch (Plano 16-07) consome via `peekAll()` (leitura não-destrutiva).
public struct QueuedIntentAction: Codable {
  public let kind: QueuedIntentActionKind
  public let deltaSeconds: Int?
  /// Delta genérico para `.adjustReps` (inteiro, ex.: 1.0/-1.0) e
  /// `.adjustLoad` (fracionário, ex.: 2.5/-2.5) — `deltaSeconds` continua
  /// servindo só `.adjustRest`. Sem valor default: omissão em call sites
  /// precisa ser explícita, nunca mascarada.
  public let deltaValue: Double?
  public let sessionLogId: String?
  public let queuedAt: String
  /// Identificador estável (UUID) por entrada — gerado uma vez em `perform()`
  /// e usado TANTO aqui QUANTO no payload do `sendEvent` in-process. Permite
  /// que o lado JS confirme (`ackIntentAction`) a remoção seletiva desta
  /// entrada assim que a entrega "quente" é aplicada com sucesso, fechando
  /// 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02.
  public let id: String

  public init(
    kind: QueuedIntentActionKind,
    deltaSeconds: Int?,
    deltaValue: Double?,
    sessionLogId: String?,
    queuedAt: String,
    id: String = UUID().uuidString
  ) {
    self.kind = kind
    self.deltaSeconds = deltaSeconds
    self.deltaValue = deltaValue
    self.sessionLogId = sessionLogId
    self.queuedAt = queuedAt
    self.id = id
  }
}

/// Fila durável compartilhada entre a extensão de widget e o processo do
/// app, via `UserDefaults(suiteName:)` do App Group. `enqueue` é chamado
/// pelos três `LiveActivityIntent`s desta fase; `peekAll` (leitura
/// não-destrutiva, Plano 16-07) é usada pela reconciliação de cold-launch;
/// `remove(ids:)` confirma seletivamente cada entrada depois de aplicada ou
/// definitivamente descartada.
public enum IntentActionQueue {
  private static let suiteName = "group.com.pmarconato.forcaapp.shared"
  private static let key = "pendingLiveActivityIntentActions"
  /// Cap explícito — mitigação de DoS local (T-16-01-01): a fila nunca
  /// acumula indefinidamente mesmo se o app nunca reabrir.
  private static let maxEntries = 20
  /// WR-02 (review 2026-08-19): serializa TODO o acesso à fila — leitura,
  /// mutação e escrita rodam como uma unidade nesta fila serial. Sem isto,
  /// enqueue/remove faziam read-modify-write sobrepostos no UserDefaults do
  /// App Group e toques rápidos sucessivos na Lock Screen perdiam entradas
  /// (reproduzido: 16-19 de 20 enqueues concorrentes sumiam). O mecanismo de
  /// persistência não mudou — UserDefaults continua o mesmo.
  private static let queue = DispatchQueue(label: "com.pmarconato.forcaapp.intent-action-queue")

  /// WR-03 (review 2026-08-19): carimbo ISO8601 de `queuedAt` COM fração de
  /// segundos. O `ISO8601DateFormatter()` padrão emite só segundos — e o
  /// `startedAt` da sessão vem do servidor COM milissegundos: um toque no
  /// mesmo segundo do início da sessão perdia a comparação `>=` da
  /// heurística de órfã (`nasceuNestaSessao`), que também ganhou tolerância
  /// de skew no lado JS. Formatter é stateless e thread-safe.
  private static let queuedAtFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  /// Grava o carimbo de enfileiramento no formato canônico da fila.
  public static func queuedAtNow() -> String {
    queuedAtFormatter.string(from: Date())
  }

  private static func defaults() -> UserDefaults? {
    UserDefaults(suiteName: suiteName)
  }

  /// Lê SEM serializar — quem chama já está dentro de `queue.sync`.
  private static func rawReadAll() -> [QueuedIntentAction] {
    guard let data = defaults()?.data(forKey: key) else { return [] }
    // Caminho feliz: decode do array inteiro de uma vez (rápido, sem
    // alocação extra por entrada).
    if let actions = try? JSONDecoder().decode([QueuedIntentAction].self, from: data) {
      return actions
    }
    // IN-03 (review 2026-08-19): o decode do array acima é atômico — uma
    // ÚNICA entrada em formato antigo (anterior ao campo `id` da 16-05 ou ao
    // `deltaValue` do CR-01, ambos SEM default por design: o comentário do
    // struct exige omissão explícita, nunca mascarada) fazia a fila INTEIRA
    // — inclusive entradas válidas novas — retornar vazia, perdendo toques
    // pendentes em silêncio num upgrade de app. Fallback: decodifica
    // elemento a elemento via wrapper tolerante e descarta só a inválida.
    let seguras = (try? JSONDecoder().decode([EntradaSegura].self, from: data)) ?? []
    return seguras.compactMap(\.acao)
  }

  /// Wrapper Decodable usado SÓ no fallback de `rawReadAll()` acima —
  /// isola o decode de UMA entrada para que uma entrada corrompida não
  /// derrube as demais. Não adiciona valor default a `QueuedIntentAction`
  /// (contrato do struct); em vez disso, `try?` a falha por entrada e
  /// `compactMap` descarta a `nil`.
  private struct EntradaSegura: Decodable {
    let acao: QueuedIntentAction?

    init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      acao = try? container.decode(QueuedIntentAction.self)
    }
  }

  /// Escreve SEM serializar — quem chama já está dentro de `queue.sync`.
  private static func rawWriteAll(_ actions: [QueuedIntentAction]) {
    guard let data = try? JSONEncoder().encode(actions) else { return }
    defaults()?.set(data, forKey: key)
  }

  /// Grava uma nova ação, aparando as mais antigas se o cap for excedido.
  /// Read-modify-write inteiro dentro de um único `queue.sync` — atômico
  /// entre threads do MESMO processo (app ou extensão).
  public static func enqueue(_ action: QueuedIntentAction) {
    queue.sync {
      var actions = rawReadAll()
      actions.append(action)
      if actions.count > maxEntries {
        actions.removeFirst(actions.count - maxEntries)
      }
      rawWriteAll(actions)
    }
  }

  /// Lê a fila inteira SEM removê-la (Plano 16-07 / D1, 16-VERIFICATION.md
  /// gap 1): usada por `activeSessionStore.reconcileLiveActivityIntents()`
  /// via `AsyncFunction("peekIntentQueue")`. Cada entrada só é removida via
  /// `remove(ids:)` (chamado por `ackIntentAction`) DEPOIS de confirmado que
  /// foi aplicada com sucesso ou definitivamente descartada por CAS — nunca
  /// só por ter sido lida. O antigo primitivo de leitura-e-remoção-na-mesma-
  /// chamada foi removido por destruir entradas reprovadas por
  /// `canCompleteSet()` antes da validação sequer rodar. Snapshot consistente
  /// (uma unidade na fila serial): nunca mistura metade de um estado antigo
  /// com metade de um estado novo.
  public static func peekAll() -> [QueuedIntentAction] {
    queue.sync { rawReadAll() }
  }

  /// Remove seletivamente as entradas cujo `id` está em `ids`, preservando
  /// as demais. Usada por `ackIntentAction` (LiveActivityModule.swift) assim
  /// que o lado JS confirma que aplicou uma entrega in-process com sucesso —
  /// fecha 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02: uma ação já
  /// aplicada pelo caminho quente não deve sobreviver na fila para ser
  /// redescoberta e reaplicada num cold-launch futuro. Read-modify-write
  /// inteiro dentro de um único `queue.sync`.
  public static func remove(ids: Set<String>) {
    queue.sync {
      let actions = rawReadAll()
      let remaining = actions.filter { !ids.contains($0.id) }
      rawWriteAll(remaining)
    }
  }
}
