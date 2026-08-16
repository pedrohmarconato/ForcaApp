import ExpoModulesCore

// Lê a data de expiração do provisioning profile embarcado no bundle
// (`embedded.mobileprovision`) para alimentar o banner de validade (D-03,
// Fase 14 Plano 03). Só existe em builds instalados em device físico via
// perfil de desenvolvimento/ad-hoc — ausente no Simulator (esperado, D-02
// já fixa instalação por cabo em device físico; sem fallback necessário).
//
// Fonte do padrão: process-one.net/blog/reading-ios-provisioning-profile-in-swift/
// (RESEARCH.md Pattern 3) — Bundle.main.path -> NSString Latin-1 -> Scanner
// isola o bloco <plist>...</plist> -> PropertyListDecoder decodifica só
// ExpirationDate. NUNCA expor o plist inteiro para a camada JS (T-14-03-01):
// o profile contém Team ID, UUIDs de device e entitlements.
struct MobileProvision: Decodable {
  let expirationDate: Date

  enum CodingKeys: String, CodingKey {
    case expirationDate = "ExpirationDate"
  }
}

func readProvisioningProfileExpiry() -> Date? {
  guard let path = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
        let profileString = try? NSString(contentsOfFile: path, encoding: String.Encoding.isoLatin1.rawValue)
  else { return nil }

  let scanner = Scanner(string: profileString as String)
  guard scanner.scanUpToString("<plist") != nil else { return nil }
  guard let plistBody = scanner.scanUpToString("</plist>") else { return nil }
  let fullPlist = plistBody + "</plist>"
  guard let plistData = fullPlist.data(using: .utf8) else { return nil }

  let decoder = PropertyListDecoder()
  return try? decoder.decode(MobileProvision.self, from: plistData).expirationDate
}

public class NativeInfoModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('NativeInfoModule')` in JavaScript.
    Name("NativeInfoModule")

    // Lê o embedded.mobileprovision do bundle e devolve só a data de
    // expiração em ISO-8601 — nunca o plist decodificado inteiro (D-03,
    // T-14-03-01). `nil` quando o arquivo não existe (Simulator).
    AsyncFunction("getProvisioningProfileExpiry") { () -> String? in
      guard let expirationDate = readProvisioningProfileExpiry() else { return nil }
      return ISO8601DateFormatter().string(from: expirationDate)
    }
  }
}
