import ExpoModulesCore

// SPIKE-ONLY (14-05) — remover em 14-07 (junto com o resto de
// modules/app-group-spike/) conforme o resultado físico do spike de App
// Groups (D-09, Sessão 1 física — Plano 14-06). Lê de volta, no app
// principal, o valor trivial que o target de widget grava em
// UserDefaults(suiteName:) — round-trip mínimo que confirma (ou não) que a
// capability funciona de fato no time pessoal gratuito (PITFALLS.md
// Pitfall 3). Payload é uma string trivial com timestamp, sem dado de
// sessão real (T-14-05-01 do threat model desta plano).
let appGroupSpikeSuiteName = "group.com.pmarconato.forcaapp.shared"
let appGroupSpikeKey = "appGroupSpikeValue"

func readAppGroupSpikeValueFromSharedDefaults() -> String? {
  NSLog("[AppGroupSpike] read invoked for suiteName \(appGroupSpikeSuiteName)")
  guard let defaults = UserDefaults(suiteName: appGroupSpikeSuiteName) else {
    NSLog("[AppGroupSpike] read FAILED — UserDefaults(suiteName:) returned nil for \(appGroupSpikeSuiteName)")
    return nil
  }
  guard let value = defaults.string(forKey: appGroupSpikeKey) else {
    NSLog("[AppGroupSpike] read OK — suite accessible but key \(appGroupSpikeKey) is absent (nil value)")
    return nil
  }
  NSLog("[AppGroupSpike] read OK — value=\(value)")
  return value
}

public class AppGroupSpikeModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('AppGroupSpikeModule')` in JavaScript.
    Name("AppGroupSpikeModule")

    // Lê de volta o valor gravado pelo target de widget no App Group
    // compartilhado — `nil` quando o App Group não existe/não é acessível
    // (esperado se a capability não funcionar em time gratuito).
    AsyncFunction("readAppGroupSpikeValue") { () -> String? in
      return readAppGroupSpikeValueFromSharedDefaults()
    }
  }
}
