import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private let activityBackground = Color(red: 0.039, green: 0.039, blue: 0.039)
private let activityNeon = Color(red: 0.922, green: 1.0, blue: 0.0)
private let activitySecondary = Color(red: 0.545, green: 0.565, blue: 0.596)
/// IN-01 (review 2026-08-19): fallback do passo de carga quando o incremento
/// configurado do exercício não chega ao widget — o MESMO 2.5 que o app usa
/// como incremento default de carga. Extraído do literal duplicado nos dois
/// botões do stepper de carga da Lock Screen.
private let defaultLoadIncrementKg: Double = 2.5

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
                .foregroundColor(destaque ? activityNeon : activitySecondary)
            Text(nextUpDetailText(state))
                .font(.caption2)
                .fontWeight(destaque ? .bold : .regular)
                .foregroundColor(destaque ? activityNeon : activitySecondary)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

private func overtimeText(_ state: SessionActivityAttributes.ContentState) -> String {
    guard let restEndsAt = state.restEndsAt else {
        return "+0:00"
    }

    let elapsedSeconds = Int(Date.now.timeIntervalSince(restEndsAt))
    let clampedSeconds = min(59 * 60 + 59, max(0, elapsedSeconds))
    return String(format: "+%d:%02d", clampedSeconds / 60, clampedSeconds % 60)
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
                .foregroundColor(activityNeon)
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
            .foregroundColor(activityNeon)
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
private func overtimeValue(_ state: SessionActivityAttributes.ContentState) -> some View {
    Text(overtimeText(state))
        .font(.caption2)
        .fontWeight(.regular)
        .monospacedDigit()
        .foregroundColor(activitySecondary)
        .lineLimit(1)
}

@ViewBuilder
private func lockScreenBody(_ state: SessionActivityAttributes.ContentState) -> some View {
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
            .tint(activityNeon)
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
            .tint(activityNeon)
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
                .tint(activityNeon)
            }
            Button(intent: CompleteSetIntent()) {
                Text("Concluir série")
            }
            .tint(activityNeon)
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
            overtimeValue(state)
            nextUpLine(state)
        }
    case .blockOnly:
        primaryValue(state)
    }
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
            lockScreenBody(context.state)
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
                        overtimeValue(context.state)
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
                    .foregroundColor(context.state.phase == .resting ? activityNeon : activitySecondary)
            }
            .keylineTint(activityNeon)
        }
    }
}
