import ActivityKit
import Foundation

/// Resolução Swift pura da fase efetiva `resting`/`readyOvertime` e do
/// overtime a partir de `restEndsAt` e do instante corrente (D-04, Fase 15
/// Plano 15-07). Existe para que o WidgetKit derive sozinho a transição de
/// descanso -> Pronto/overtime a cada tick de um `TimelineView`, sem
/// depender de uma atualização JS de `updateLiveActivity` no vencimento do
/// prazo — D-05/D-06/D-09/D-10 continuam intactos: nada aqui muta Zustand
/// nem chama `activateSet`.
enum RestPhaseResolver {
    /// Resolve a fase efetiva a exibir dado o `receivedPhase` do
    /// `ContentState` (o valor gravado por `buildLiveActivityContentState`),
    /// `restEndsAt` e `now` (tipicamente `timeline.date` de um
    /// `TimelineView` periódico).
    ///
    /// - Quando `restEndsAt` existe e `receivedPhase` é `.resting` ou
    ///   `.readyOvertime`: resolve para `.resting` estritamente antes do
    ///   prazo e para `.readyOvertime` no instante exato do prazo e depois
    ///   dele.
    /// - Para qualquer outra fase recebida (`.measuring`, `.blockOnly`) ou
    ///   quando `restEndsAt` é nil, preserva `receivedPhase` sem fabricar
    ///   overtime.
    static func effectivePhase(
        receivedPhase: SessionActivityPhase,
        restEndsAt: Date?,
        now: Date
    ) -> SessionActivityPhase {
        guard let restEndsAt,
              receivedPhase == .resting || receivedPhase == .readyOvertime
        else {
            return receivedPhase
        }
        return now < restEndsAt ? .resting : .readyOvertime
    }

    /// Segundos não negativos decorridos desde `restEndsAt`. Retorna 0
    /// quando não há prazo ou quando `now` ainda está antes dele — o
    /// chamador só usa este valor quando a fase efetiva já resolveu para
    /// `.readyOvertime`.
    static func overtimeSeconds(restEndsAt: Date?, now: Date) -> Int {
        guard let restEndsAt else { return 0 }
        return max(0, Int(now.timeIntervalSince(restEndsAt)))
    }
}
