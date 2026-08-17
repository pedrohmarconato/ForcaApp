import Foundation

/// Tipo de ação enfileirada por um `LiveActivityIntent` tocado na tela
/// bloqueada. Fase 16 (CMD): três tipos, um por Intent.
public enum QueuedIntentActionKind: String, Codable {
  case completeSet
  case skipRest
  case adjustRest
}

/// Entrada durável da fila do App Group. Gravada ANTES de qualquer tentativa
/// de round-trip in-process (`LiveActivityModule.shared?.sendEvent`) — é o
/// contrato que sobrevive a um app force-quit e que a Plano 16-02 (drenagem
/// no cold-launch) consome via `drainAll()`.
public struct QueuedIntentAction: Codable {
  public let kind: QueuedIntentActionKind
  public let deltaSeconds: Int?
  public let sessionLogId: String?
  public let queuedAt: String

  public init(kind: QueuedIntentActionKind, deltaSeconds: Int?, sessionLogId: String?, queuedAt: String) {
    self.kind = kind
    self.deltaSeconds = deltaSeconds
    self.sessionLogId = sessionLogId
    self.queuedAt = queuedAt
  }
}

/// Fila durável compartilhada entre a extensão de widget e o processo do
/// app, via `UserDefaults(suiteName:)` do App Group. `enqueue` é chamado
/// pelos três `LiveActivityIntent`s desta fase; `drainAll` fica pronto para
/// a Plano 16-02 (reconciliação de cold-launch), mesmo padrão de código
/// pronto-e-não-invocado que `reconcileOrphans` teve na Plano 15-01.
public enum IntentActionQueue {
  private static let suiteName = "group.com.pmarconato.forcaapp.shared"
  private static let key = "pendingLiveActivityIntentActions"
  /// Cap explícito — mitigação de DoS local (T-16-01-01): a fila nunca
  /// acumula indefinidamente mesmo se o app nunca reabrir.
  private static let maxEntries = 20

  private static func defaults() -> UserDefaults? {
    UserDefaults(suiteName: suiteName)
  }

  private static func readAll() -> [QueuedIntentAction] {
    guard let data = defaults()?.data(forKey: key) else { return [] }
    return (try? JSONDecoder().decode([QueuedIntentAction].self, from: data)) ?? []
  }

  private static func writeAll(_ actions: [QueuedIntentAction]) {
    guard let data = try? JSONEncoder().encode(actions) else { return }
    defaults()?.set(data, forKey: key)
  }

  /// Grava uma nova ação, aparando as mais antigas se o cap for excedido.
  public static func enqueue(_ action: QueuedIntentAction) {
    var actions = readAll()
    actions.append(action)
    if actions.count > maxEntries {
      actions.removeFirst(actions.count - maxEntries)
    }
    writeAll(actions)
  }

  /// Lê e limpa a fila inteira. Não é chamado pelo lado JS ainda nesta
  /// plano — a Plano 16-02 adiciona o `AsyncFunction` que o expõe.
  public static func drainAll() -> [QueuedIntentAction] {
    let actions = readAll()
    defaults()?.removeObject(forKey: key)
    return actions
  }
}
