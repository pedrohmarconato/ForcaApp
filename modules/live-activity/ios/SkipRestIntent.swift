import ActivityKit
import AppIntents

/// Roda no processo do APP (RESEARCH.md Pattern 1) — mesma estrutura de
/// `CompleteSetIntent`: enfileira ANTES de emitir o evento in-process.
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Pular descanso" }

  func perform() async throws -> some IntentResult {
    let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId

    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .skipRest,
        deltaSeconds: nil,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date())
      )
    )

    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "skipRest"])

    return .result()
  }
}
