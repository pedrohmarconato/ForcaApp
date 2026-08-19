import AppIntents

/// Stub de compilação para a extensão `session-widget`. `perform()` nunca
/// executa de fato (mesmo motivo documentado em
/// `targets/session-widget/CompleteSetIntent.swift`) — existe só para
/// `Button(intent: AdjustLoadIntent(deltaLoadKg:))` compilar no target da
/// extensão, que também precisa do `@Parameter deltaLoadKg` para a chamada
/// com argumento compilar.
struct AdjustLoadIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar carga" }

  @Parameter(title: "Delta em kg")
  var deltaLoadKg: Double

  init() {}

  init(deltaLoadKg: Double) {
    self.deltaLoadKg = deltaLoadKg
  }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
