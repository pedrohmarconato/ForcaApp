import ActivityKit
import AppIntents

/// Roda no processo do APP (RESEARCH.md Pattern 1) porque este arquivo
/// também está presente no target do app — nunca no target da extensão de
/// widget. `LiveActivityIntent`, nunca `AppIntent` genérico (Pitfall 5).
@available(iOS 16.2, *)
struct CompleteSetIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Concluir série" }

  func perform() async throws -> some IntentResult {
    let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId

    // Durável PRIMEIRO — sobrevive mesmo se o processo do app não estiver
    // vivo para receber o sendEvent abaixo (caminho de cold-launch, Plano 16-02).
    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .completeSet,
        deltaSeconds: nil,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date())
      )
    )

    // Round-trip in-process — só chega ao JS se a bridge já estiver viva.
    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "completeSet"])

    return .result()
  }
}
