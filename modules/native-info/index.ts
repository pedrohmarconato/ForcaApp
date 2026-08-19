import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type NativeInfoModuleEvents = {
  onChange: (params: { value: string }) => void;
};

declare class NativeInfoModuleType extends NativeModule<NativeInfoModuleEvents> {
  getProvisioningProfileExpiry(): Promise<string | null>;
}

/**
 * Leitura do provisioning profile embarcado é uma API exclusiva de iOS
 * (embedded.mobileprovision só existe em build iOS). Fora do ramo iOS,
 * `NativeInfoModule` permanece `null` e o bootstrap NUNCA lança:
 * `requireOptionalNativeModule` só é avaliado quando `Platform.OS ===
 * 'ios'`, espelhando exatamente o padrão que `modules/live-activity/index.ts`
 * fixou para o CR-03 (irmão deste bug — 15-09b: `npx expo start --web`
 * crashava no mount com "Cannot find native module 'NativeInfoModule'",
 * mesmo depois do fix do 15-09, porque `ProvisioningBanner.tsx` importa este
 * módulo incondicionalmente). No iOS, se o módulo não estiver instalado
 * (build errado, Simulator sem entitlement), o mesmo `null` alimenta o
 * retorno `null` do wrapper abaixo — sinal já tratado como "sem provisioning
 * profile para mostrar" por `ProvisioningBanner.tsx` (o banner simplesmente
 * não aparece, sem erro). Quando presente, o wrapper delega ao módulo real
 * sem qualquer mudança de comportamento observável no iOS.
 */
const NativeInfoModule: NativeInfoModuleType | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<NativeInfoModuleType>('NativeInfoModule')
    : null;

// Só a data de expiração do provisioning profile embarcado (D-03) — NUNCA o
// plist inteiro. `null` quando o arquivo não existe (esperado no Simulator;
// D-02 já fixa instalação por cabo em device físico) OU quando o módulo
// nativo não está disponível (fora do iOS, ou iOS sem módulo instalado).
export async function getProvisioningProfileExpiry(): Promise<string | null> {
  return NativeInfoModule ? NativeInfoModule.getProvisioningProfileExpiry() : null;
}
