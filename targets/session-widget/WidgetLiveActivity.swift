import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private let activityBackground = Color(red: 0.039, green: 0.039, blue: 0.039)
private let activitySecondary = Color(red: 0.545, green: 0.565, blue: 0.596)
/// IN-01 (review 2026-08-19): fallback do passo de carga quando o incremento
/// configurado do exercício não chega ao widget — o MESMO 2.5 que o app usa
/// como incremento default de carga. Extraído do literal duplicado nos dois
/// botões do stepper de carga da Lock Screen.
private let defaultLoadIncrementKg: Double = 2.5

/// Acento neon derivado do ContentState (D-01/D-10). Switch fechado sobre as
/// quatro chaves com os canais RGB exatos dos hexes aprovados; `default`
/// cobre nil e string desconhecida — Activities legadas ou valores fora do
/// contrato convergem sempre para yellow, nunca para uma cor arbitrária.
private func neonAccent(for state: SessionActivityAttributes.ContentState) -> Color {
    switch state.neonColor {
    case "yellow":
        return Color(red: 235.0 / 255.0, green: 255.0 / 255.0, blue: 0.0 / 255.0)
    case "blue":
        return Color(red: 0.0 / 255.0, green: 229.0 / 255.0, blue: 255.0 / 255.0)
    case "green":
        return Color(red: 57.0 / 255.0, green: 255.0 / 255.0, blue: 20.0 / 255.0)
    case "red":
        return Color(red: 255.0 / 255.0, green: 49.0 / 255.0, blue: 49.0 / 255.0)
    default:
        return Color(red: 235.0 / 255.0, green: 255.0 / 255.0, blue: 0.0 / 255.0)
    }
}

private func prescriptionText(_ state: SessionActivityAttributes.ContentState) -> String {
    if state.isBodyweight {
        return "Peso corporal"
    }

    let min = state.targetRepsMin.map(String.init) ?? "—"
    let max = state.targetRepsMax.map(String.init) ?? "—"
    guard let load = state.targetLoadKg else {
        return "\(min)–\(max) reps"
    }
    return "\(min)–\(max) reps × \(String(format: "%g", load)) kg"
}

private func seriesText(_ state: SessionActivityAttributes.ContentState) -> String {
    "Série \(state.setIndex)/\(state.setTotal)"
}

/// Conteúdo da linha "A SEGUIR" (Fase 17, PRED-01): o MESMO valor que vai
/// nascer pré-preenchido quando essa série virar a atual (`suggestReps()`/
/// `suggestLoad()`), nunca o número cru da prescrição. Quando só
/// `nextExerciseName` existe (virada para bloco de cardio/alongamento, D-03
/// da Fase 15), mostra só o nome — sem detalhes de série.
private func nextUpDetailText(_ state: SessionActivityAttributes.ContentState) -> String {
    guard let name = state.nextExerciseName else { return "" }
    guard let setIndex = state.nextSetIndex, let setTotal = state.nextSetTotal else {
        return name
    }
    var valor = state.nextIsBodyweight == true
        ? "peso corporal"
        : state.nextSuggestedReps.map { "\($0) reps" } ?? "—"
    if state.nextIsBodyweight != true, let load = state.nextSuggestedLoadKg {
        valor += ", \(String(format: "%g", load)) kg"
    }
    return "\(name) · Série \(setIndex)/\(setTotal) · \(valor)"
}

/// Muda de exercício na virada? É a ÚNICA transição que altera o que o dono
/// faz fisicamente (D-15) — só ela recebe destaque visual.
private func nextUpIsExerciseChange(_ state: SessionActivityAttributes.ContentState) -> Bool {
    state.nextExerciseName != nil && state.nextExerciseName != state.exerciseName
}

@ViewBuilder
private func nextUpLine(_ state: SessionActivityAttributes.ContentState) -> some View {
    if state.nextExerciseName != nil {
        let destaque = nextUpIsExerciseChange(state)
        VStack(alignment: .leading, spacing: 2) {
            Text("A SEGUIR")
                .font(.caption2)
                .fontWeight(.regular)
                .foregroundColor(destaque ? neonAccent(for: state) : activitySecondary)
            Text(nextUpDetailText(state))
                .font(.caption2)
                .fontWeight(destaque ? .bold : .regular)
                .foregroundColor(destaque ? neonAccent(for: state) : activitySecondary)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

/// D-04 (Fase 15, Plano 15-07): `now` vem de `timeline.date` de um
/// `TimelineView` periódico no Lock Screen, para que o overtime reavalie a
/// cada tick do WidgetKit em vez de congelar no instante do último
/// `Activity.update`. No Dynamic Island (fora do escopo físico do dono, sem
/// hardware compatível), `now` continua vindo de `Date.now` no ponto de
/// chamada — comportamento inalterado ali.
private func overtimeText(_ state: SessionActivityAttributes.ContentState, now: Date) -> String {
    let elapsedSeconds = RestPhaseResolver.overtimeSeconds(restEndsAt: state.restEndsAt, now: now)
    return OvertimeFormatter.format(elapsedSeconds: elapsedSeconds)
}

@ViewBuilder
private func secondaryLine(_ state: SessionActivityAttributes.ContentState) -> some View {
    switch state.phase {
    case .resting:
        Text(state.exerciseName)
            .font(.subheadline)
            .fontWeight(.regular)
            .foregroundColor(activitySecondary)
            .lineLimit(1)
            .truncationMode(.tail)
    case .measuring, .readyOvertime:
        Text(seriesText(state))
            .font(.subheadline)
            .fontWeight(.regular)
            .foregroundColor(.white)
            .lineLimit(1)
    case .blockOnly:
        EmptyView()
    }
}

@ViewBuilder
private func primaryValue(_ state: SessionActivityAttributes.ContentState) -> some View {
    switch state.phase {
    case .resting:
        if let restEndsAt = state.restEndsAt {
            Text(timerInterval: Date.now...restEndsAt, countsDown: true)
                .font(.title2)
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundColor(neonAccent(for: state))
                .lineLimit(1)
        } else {
            Text("—")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .lineLimit(1)
        }
    case .measuring:
        Text(prescriptionText(state))
            .font(.title2)
            .fontWeight(.bold)
            .monospacedDigit()
            .foregroundColor(.white)
            .minimumScaleFactor(0.8)
            .lineLimit(1)
    case .readyOvertime:
        Text("Pronto")
            .font(.title2)
            .fontWeight(.bold)
                .foregroundColor(neonAccent(for: state))
            .lineLimit(1)
    case .blockOnly:
        Text("\(state.blockLabel ?? "") \(state.blockIndex ?? 0)/\(state.blockTotal ?? 0)")
            .font(.caption2)
            .fontWeight(.regular)
            .foregroundColor(activitySecondary)
            .lineLimit(1)
            .truncationMode(.tail)
    }
}

@ViewBuilder
private func overtimeValue(_ state: SessionActivityAttributes.ContentState, now: Date) -> some View {
    Text(overtimeText(state, now: now))
        .font(.caption2)
        .fontWeight(.regular)
        .monospacedDigit()
        .foregroundColor(activitySecondary)
        .lineLimit(1)
}

/// D-04 (Fase 15, Plano 15-07): `state.phase` já foi resolvido pelo chamador
/// via `RestPhaseResolver.effectivePhase` a partir de `timeline.date` — este
/// switch nunca vê `.resting` sobrevivendo além de `restEndsAt`, mesmo com o
/// processo JS suspenso.
@ViewBuilder
private func lockScreenBody(_ state: SessionActivityAttributes.ContentState, now: Date) -> some View {
    switch state.phase {
    case .resting:
        VStack(alignment: .leading, spacing: 4) {
            primaryValue(state)
            secondaryLine(state)
            HStack {
                Button(intent: AdjustRestIntent(deltaSeconds: -30)) {
                    Text("-30s")
                }
                Button(intent: SkipRestIntent()) {
                    Text("Pular")
                }
                Button(intent: AdjustRestIntent(deltaSeconds: 30)) {
                    Text("+30s")
                }
            }
            .tint(neonAccent(for: state))
            nextUpLine(state)
        }
    case .measuring:
        VStack(alignment: .leading, spacing: 4) {
            secondaryLine(state)
            // Reps sempre existem, inclusive bodyweight (D-09) — só a carga é
            // omitida para bodyweight, nunca as reps.
            HStack {
                Button(intent: AdjustRepsIntent(deltaReps: -1)) {
                    Text("−")
                }
                Text(state.currentReps.map(String.init) ?? "—")
                    .font(.title2)
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .opacity(state.isRepsInherited ? 0.6 : 1.0)
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
                Button(intent: AdjustRepsIntent(deltaReps: 1)) {
                    Text("+")
                }
            }
            .tint(neonAccent(for: state))
            if !state.isBodyweight {
                HStack {
                    Button(intent: AdjustLoadIntent(deltaLoadKg: -(state.loadIncrementKg ?? defaultLoadIncrementKg))) {
                        Text("−")
                    }
                    Text("\(state.currentLoadKg.map { String(format: "%g", $0) } ?? "—") kg")
                        .font(.title2)
                        .fontWeight(.bold)
                        .monospacedDigit()
                        .foregroundColor(.white)
                        .opacity(state.isLoadInherited ? 0.6 : 1.0)
                        .minimumScaleFactor(0.8)
                        .lineLimit(1)
                    Button(intent: AdjustLoadIntent(deltaLoadKg: state.loadIncrementKg ?? defaultLoadIncrementKg)) {
                        Text("+")
                    }
                }
                .tint(neonAccent(for: state))
            }
            Button(intent: CompleteSetIntent()) {
                Text("Concluir série")
            }
            .tint(neonAccent(for: state))
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.forward.app")
                Text("Ajustar no app")
            }
            .font(.caption2)
            .foregroundColor(activitySecondary)
            nextUpLine(state)
        }
    case .readyOvertime:
        VStack(alignment: .leading, spacing: 4) {
            primaryValue(state)
            secondaryLine(state)
            overtimeValue(state, now: now)
            nextUpLine(state)
        }
    case .blockOnly:
        primaryValue(state)
    }
}

/// D-04 (Fase 15, Plano 15-07): retorna uma cópia de `state` com `phase`
/// substituída pela fase efetiva resolvida por `RestPhaseResolver` a partir
/// de `restEndsAt` e `now`. Os demais campos (reps, carga, próxima série)
/// não são tocados — apenas a apresentação temporal muda sozinha com o
/// tempo, nunca por mutação do draft.
private func effectiveState(
    _ state: SessionActivityAttributes.ContentState,
    now: Date
) -> SessionActivityAttributes.ContentState {
    var resolved = state
    resolved.phase = RestPhaseResolver.effectivePhase(
        receivedPhase: state.phase,
        restEndsAt: state.restEndsAt,
        now: now
    )
    return resolved
}

@ViewBuilder
private func compactValue(_ state: SessionActivityAttributes.ContentState) -> some View {
    if state.phase == .resting, let restEndsAt = state.restEndsAt {
        Text(timerInterval: Date.now...restEndsAt, countsDown: true)
            .font(.caption)
            .fontWeight(.bold)
            .monospacedDigit()
            .lineLimit(1)
    } else {
        Text("\(state.setIndex)/\(state.setTotal)")
            .font(.caption)
            .fontWeight(.bold)
            .monospacedDigit()
            .lineLimit(1)
    }
}

private func minimalSymbol(for state: SessionActivityAttributes.ContentState) -> String {
    switch state.phase {
    case .resting:
        return "timer"
    case .readyOvertime:
        return "checkmark"
    case .blockOnly:
        return "figure.run"
    case .measuring:
        return "bolt.fill"
    }
}

struct WidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionActivityAttributes.self) { context in
            // D-04 (Fase 15, Plano 15-07): TimelineView periódico reavalia a
            // fase efetiva e o overtime a cada tick do WidgetKit a partir de
            // timeline.date — o card sai sozinho de resting para
            // readyOvertime/Pronto ao vencer restEndsAt, mesmo com o
            // processo JS suspenso, sem update de Activity nem timeout JS.
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                lockScreenBody(effectiveState(context.state, now: timeline.date), now: timeline.date)
            }
            .padding()
            .activityBackgroundTint(activityBackground)
            .activitySystemActionForegroundColor(Color.white)
            .widgetURL(URL(string: "forcaapp://home/active-session/\(context.attributes.sessionLogId)"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    secondaryLine(context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    primaryValue(context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    switch context.state.phase {
                    case .readyOvertime:
                        overtimeValue(context.state, now: .now)
                    case .blockOnly:
                        Text("\(context.state.blockLabel ?? "") \(context.state.blockIndex ?? 0)/\(context.state.blockTotal ?? 0)")
                            .font(.caption2)
                            .fontWeight(.regular)
                            .foregroundColor(activitySecondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    case .measuring, .resting:
                        EmptyView()
                    }
                }
            } compactLeading: {
                compactValue(context.state)
            } compactTrailing: {
                compactValue(context.state)
            } minimal: {
                Image(systemName: minimalSymbol(for: context.state))
                    .foregroundColor(
                        context.state.phase == .resting
                            ? neonAccent(for: context.state)
                            : activitySecondary
                    )
            }
            .keylineTint(neonAccent(for: context.state))
        }
    }
}
