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
  @Field var currentLoadKg: Double? = nil
  @Field var isLoadInherited: Bool = false
  @Field var loadIncrementKg: Double? = nil
  @Field var currentReps: Int? = nil
  @Field var isRepsInherited: Bool = false
  @Field var nextExerciseName: String? = nil
  @Field var nextSetIndex: Int? = nil
  @Field var nextSetTotal: Int? = nil
  @Field var nextSuggestedReps: Int? = nil
  @Field var nextSuggestedLoadKg: Double? = nil
  @Field var nextIsBodyweight: Bool? = nil

  public init() {}
}

/// Espelho serializável (para a ponte Expo) de `QueuedIntentAction`
/// (`IntentActionQueue.swift`, Fase 16 Plano 16-01). Conversão pura, sem
/// lógica de negócio nova — a Plano 16-02 só expõe a LEITURA da fila já
/// existente para o lado JS.
public struct QueuedIntentActionRecord: Record {
  @Field var kind: String = ""
  @Field var deltaSeconds: Int? = nil
  @Field var sessionLogId: String? = nil
  @Field var queuedAt: String = ""
  @Field var id: String = ""

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
      currentLoadKg: record.currentLoadKg,
      isLoadInherited: record.isLoadInherited,
      loadIncrementKg: record.loadIncrementKg,
      currentReps: record.currentReps,
      isRepsInherited: record.isRepsInherited,
      isBodyweight: record.isBodyweight,
      restEndsAt: iso8601Date(from: record.restEndsAt),
      blockLabel: record.blockLabel,
      blockIndex: record.blockIndex,
      blockTotal: record.blockTotal,
      nextExerciseName: record.nextExerciseName,
      nextSetIndex: record.nextSetIndex,
      nextSetTotal: record.nextSetTotal,
      nextSuggestedReps: record.nextSuggestedReps,
      nextSuggestedLoadKg: record.nextSuggestedLoadKg,
      nextIsBodyweight: record.nextIsBodyweight
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

    // Fase 16 Plano 16-07: expõe a fila durável do App Group (gravada pelos
    // LiveActivityIntents mesmo com o app force-quit) para o lado JS LER de
    // forma NÃO-destrutiva no boot — a remoção de cada entrada é seletiva e
    // condicionada ao resultado real da aplicação (ver `ackIntentAction`
    // abaixo), nunca acontece só por ter sido lida. Conversão pura
    // QueuedIntentAction -> QueuedIntentActionRecord, sem lógica de negócio
    // nova aqui.
    AsyncFunction("peekIntentQueue") { () -> [QueuedIntentActionRecord] in
      IntentActionQueue.peekAll().map { action in
        var record = QueuedIntentActionRecord()
        record.kind = action.kind.rawValue
        record.deltaSeconds = action.deltaSeconds
        record.sessionLogId = action.sessionLogId
        record.queuedAt = action.queuedAt
        record.id = action.id
        return record
      }
    }

    // Fase 16 Plano 16-05: remove SELETIVAMENTE a entrada cuja entrega
    // in-process (app vivo, bridge JS registrada) já teve sucesso — chamado
    // pelo lado JS logo após aplicar a ação contra um alvo resolvido. Fecha
    // 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02: sem isto, uma ação já
    // aplicada pelo caminho quente sobreviveria na fila durável para ser
    // reaplicada por uma reconciliação de cold-launch posterior.
    AsyncFunction("ackIntentAction") { (id: String) in
      IntentActionQueue.remove(ids: [id])
    }
  }
}
