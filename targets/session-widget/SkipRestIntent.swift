import AppIntents

/// Stub de compilação para a extensão `session-widget`. `perform()` nunca
/// executa de fato (mesmo motivo documentado em
/// `targets/session-widget/CompleteSetIntent.swift`) — existe só para
/// `Button(intent: SkipRestIntent())` compilar no target da extensão.
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Pular descanso" }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
