import ActivityKit
import AppIntents

/// Roda no processo do APP (RESEARCH.md Pattern 1) — mesma estrutura de
/// `AdjustRestIntent`. `deltaLoadKg` é o parâmetro exato do botão tocado
/// (±loadIncrementKg do exercício) — nenhum valor inventado. `perform()`
/// SÓ enfileira e dispara `sendEvent`, nunca chama `Activity.update()`
/// diretamente (a Live Activity é espelho, nunca fonte de verdade).
@available(iOS 16.2, *)
struct AdjustLoadIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar carga" }

  @Parameter(title: "Delta em kg")
  var deltaLoadKg: Double

  init() {}

  init(deltaLoadKg: Double) {
    self.deltaLoadKg = deltaLoadKg
  }

  func perform() async throws -> some IntentResult {
    let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId
    let actionId = UUID().uuidString

    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .adjustLoad,
        deltaSeconds: nil,
        deltaValue: deltaLoadKg,
        sessionLogId: sessionLogId,
        queuedAt: IntentActionQueue.queuedAtNow(),
        id: actionId
      )
    )

    // O mesmo `id` viaja aqui para o lado JS confirmar (ackIntentAction) a
    // remoção desta entrada da fila durável depois de aplicá-la — fecha
    // 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02. `sessionLogId` (CR-01,
    // review 2026-08-19) é o id da sessão da Activity de onde veio o toque:
    // a bridge recusa sem aplicar o evento cujo id divirja do draft atual.
    // `?? ""` preserva a ausência (atributo irresolvível) como "origem
    // desconhecida" — o CAS da reconciliação decide.
    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustLoad", "sessionLogId": sessionLogId ?? "", "id": actionId])

    return .result()
  }
}
