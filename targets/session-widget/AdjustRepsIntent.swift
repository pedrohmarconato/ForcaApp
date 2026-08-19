import AppIntents

/// Stub de compilação para a extensão `session-widget`. `perform()` nunca
/// executa de fato (mesmo motivo documentado em
/// `targets/session-widget/CompleteSetIntent.swift`) — existe só para
/// `Button(intent: AdjustRepsIntent(deltaReps:))` compilar no target da
/// extensão, que também precisa do `@Parameter deltaReps` para a chamada
/// com argumento compilar.
struct AdjustRepsIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar repetições" }

  @Parameter(title: "Delta em repetições")
  var deltaReps: Int

  init() {}

  init(deltaReps: Int) {
    self.deltaReps = deltaReps
  }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
