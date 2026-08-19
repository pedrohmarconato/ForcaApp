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
        deltaValue: nil,
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
    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustRest", "sessionLogId": sessionLogId ?? "", "id": actionId])

    return .result()
  }
}
