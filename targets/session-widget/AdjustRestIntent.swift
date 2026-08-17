import AppIntents

/// Stub de compilação para a extensão `session-widget`. `perform()` nunca
/// executa de fato (mesmo motivo documentado em
/// `targets/session-widget/CompleteSetIntent.swift`) — existe só para
/// `Button(intent: AdjustRestIntent(deltaSeconds:))` compilar no target da
/// extensão, que também precisa do `@Parameter deltaSeconds` para a chamada
/// com argumento compilar.
struct AdjustRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar descanso" }

  @Parameter(title: "Delta em segundos")
  var deltaSeconds: Int

  init() {}

  init(deltaSeconds: Int) {
    self.deltaSeconds = deltaSeconds
  }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
