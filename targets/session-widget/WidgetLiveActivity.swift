import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private let activityBackground = Color(red: 0.039, green: 0.039, blue: 0.039)
private let activityNeon = Color(red: 0.922, green: 1.0, blue: 0.0)
private let activitySecondary = Color(red: 0.545, green: 0.565, blue: 0.596)

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
        }
    case .measuring:
        VStack(alignment: .leading, spacing: 4) {
            primaryValue(state)
            secondaryLine(state)
        }
    case .readyOvertime:
        VStack(alignment: .leading, spacing: 4) {
            primaryValue(state)
            secondaryLine(state)
            overtimeValue(state)
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
