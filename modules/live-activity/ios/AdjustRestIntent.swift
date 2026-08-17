import ActivityKit
import AppIntents

/// Roda no processo do APP (RESEARCH.md Pattern 1) — mesma estrutura de
/// `CompleteSetIntent`/`SkipRestIntent`. `deltaSeconds` é o parâmetro exato
/// do botão tocado (-30/+30) — nenhum valor inventado.
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

    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .adjustRest,
        deltaSeconds: deltaSeconds,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date())
      )
    )

    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustRest", "deltaSeconds": deltaSeconds])

    return .result()
  }
}
