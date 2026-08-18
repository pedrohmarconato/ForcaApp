import ActivityKit
import AppIntents

/// Roda no processo do APP (RESEARCH.md Pattern 1) — mesma estrutura de
/// `CompleteSetIntent`/`SkipRestIntent`. `deltaSeconds` é o parâmetro exato
/// do botão tocado (-30/+30) — nenhum valor inventado.
@available(iOS 16.2, *)
struct AdjustRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar descanso" }

  @Parameter(title: "Delta em segundos")
  var deltaSeconds: Int

  init() {}

  init(deltaSeconds: Int) {
    self.deltaSeconds = deltaSeconds
  }

  func perform() async throws -> some IntentResult {
    let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId
    let actionId = UUID().uuidString

    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .adjustRest,
        deltaSeconds: deltaSeconds,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date()),
        id: actionId
      )
    )

    // O mesmo `id` viaja aqui para o lado JS confirmar (ackIntentAction) a
    // remoção desta entrada da fila durável depois de aplicá-la — fecha
    // 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02.
    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustRest", "deltaSeconds": deltaSeconds, "id": actionId])

    return .result()
  }
}
