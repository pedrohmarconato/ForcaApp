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
    let actionId = UUID().uuidString

    // Durável PRIMEIRO — sobrevive mesmo se o processo do app não estiver
    // vivo para receber o sendEvent abaixo (caminho de cold-launch, Plano 16-02).
    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .completeSet,
        deltaSeconds: nil,
        deltaValue: nil,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date()),
        id: actionId
      )
    )

    // Round-trip in-process — só chega ao JS se a bridge já estiver viva. O
    // mesmo `id` viaja aqui para o lado JS confirmar (ackIntentAction) a
    // remoção desta entrada da fila durável depois de aplicá-la — fecha
    // 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02. `sessionLogId` (CR-01,
    // review 2026-08-19) é o id da sessão da Activity de onde veio o toque:
    // a bridge recusa sem aplicar o evento cujo id divirja do draft atual —
    // um toque num card de sessão antiga nunca mais conclui série na sessão
    // errada. `?? ""` preserva a ausência (atributo irresolvível) como
    // "origem desconhecida" — o CAS da reconciliação decide.
    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "completeSet", "sessionLogId": sessionLogId ?? "", "id": actionId])

    return .result()
  }
}
