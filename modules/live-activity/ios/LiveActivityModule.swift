import ActivityKit
import ExpoModulesCore

public struct LiveActivityContentStateRecord: Record {
  @Field var phase: String = "measuring"
  @Field var exerciseName: String = ""
  @Field var setIndex: Int = 0
  @Field var setTotal: Int = 0
  @Field var targetRepsMin: Int? = nil
  @Field var targetRepsMax: Int? = nil
  @Field var targetLoadKg: Double? = nil
  @Field var isBodyweight: Bool = false
  @Field var restEndsAt: String? = nil
  @Field var blockLabel: String? = nil
  @Field var blockIndex: Int? = nil
  @Field var blockTotal: Int? = nil

  public init() {}
}

@available(iOS 16.2, *)
public class LiveActivityModule: Module {
  /// Referência fraca à instância viva do módulo — permite que os
  /// `LiveActivityIntent`s (Fase 16, processo do app) emitam `onIntentAction`
  /// sem passar pela ponte de invocação normal do Expo Modules (que exige
  /// vir do lado JS). `weak` evita reter o módulo além do ciclo de vida que
  /// o próprio Expo Modules Core já gerencia.
  static weak var shared: LiveActivityModule?

  private var currentActivity: Activity<SessionActivityAttributes>?

  private func iso8601Date(from value: String?) -> Date? {
    guard let value, !value.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)
  }

  private func contentState(from record: LiveActivityContentStateRecord) -> SessionActivityAttributes.ContentState {
    SessionActivityAttributes.ContentState(
      phase: SessionActivityPhase(rawValue: record.phase) ?? .measuring,
      exerciseName: record.exerciseName,
      setIndex: record.setIndex,
      setTotal: record.setTotal,
      targetRepsMin: record.targetRepsMin,
      targetRepsMax: record.targetRepsMax,
      targetLoadKg: record.targetLoadKg,
      isBodyweight: record.isBodyweight,
      restEndsAt: iso8601Date(from: record.restEndsAt),
      blockLabel: record.blockLabel,
      blockIndex: record.blockIndex,
      blockTotal: record.blockTotal
    )
  }

  public func definition() -> ModuleDefinition {
    Name("LiveActivityModule")

    OnCreate {
      LiveActivityModule.shared = self
    }

    Events("onIntentAction")

    AsyncFunction("startActivity") { (record: LiveActivityContentStateRecord, sessionLogId: String) -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      let attributes = SessionActivityAttributes(sessionLogId: sessionLogId)
      let state = contentState(from: record)
      do {
        currentActivity = try Activity.request(
          attributes: attributes,
          content: ActivityContent(state: state, staleDate: nil),
          pushType: nil
        )
        return true
      } catch {
        currentActivity = nil
        return false
      }
    }

    AsyncFunction("updateActivity") { (record: LiveActivityContentStateRecord) async -> Bool in
      guard #available(iOS 16.2, *), let activity = currentActivity else { return false }
      await activity.update(ActivityContent(state: contentState(from: record), staleDate: nil))
      return true
    }

    AsyncFunction("endActivity") { (dismissalPolicy: String, afterSeconds: Int?) async -> Bool in
      guard #available(iOS 16.2, *), let activity = currentActivity else { return false }
      let policy: ActivityUIDismissalPolicy
      switch dismissalPolicy {
      case "afterDate":
        policy = .after(Date().addingTimeInterval(TimeInterval(afterSeconds ?? 0)))
      default:
        policy = .immediate
      }
      await activity.end(nil, dismissalPolicy: policy)
      currentActivity = nil
      return true
    }

    AsyncFunction("isActivityRunning") { () -> Bool in
      return currentActivity != nil
    }

    AsyncFunction("reconcileOrphans") { (stillActiveSessionLogId: String?) async -> Bool in
      guard #available(iOS 16.2, *) else { return stillActiveSessionLogId != nil }
      for activity in Activity<SessionActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      currentActivity = nil
      return stillActiveSessionLogId != nil
    }
  }
}
