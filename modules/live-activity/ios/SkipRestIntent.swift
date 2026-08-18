import ActivityKit
import AppIntents

/// Roda no processo do APP (RESEARCH.md Pattern 1) — mesma estrutura de
/// `CompleteSetIntent`: enfileira ANTES de emitir o evento in-process.
@available(iOS 16.2, *)
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Pular descanso" }

  func perform() async throws -> some IntentResult {
    let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId
    let actionId = UUID().uuidString

    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .skipRest,
        deltaSeconds: nil,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date()),
        id: actionId
      )
    )

    // O mesmo `id` viaja aqui para o lado JS confirmar (ackIntentAction) a
    // remoção desta entrada da fila durável depois de aplicá-la — fecha
    // 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02.
    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "skipRest", "id": actionId])

    return .result()
  }
}
