import AppIntents

/// Stub de compilação para a extensão `session-widget`. Este `perform()`
/// NUNCA executa de fato: quando o mesmo `LiveActivityIntent` também está
/// presente no target do app (ver `modules/live-activity/ios/CompleteSetIntent.swift`),
/// o iOS SEMPRE roteia `perform()` para o processo do app (RESEARCH.md
/// Pattern 1, confirmado por fonte Apple DTS). Esta cópia existe só para o
/// `Button(intent: CompleteSetIntent())` do SwiftUI compilar no target da
/// extensão, que não linka `ExpoModulesCore` e portanto não pode referenciar
/// `IntentActionQueue`/`LiveActivityModule`.
struct CompleteSetIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Concluir série" }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
