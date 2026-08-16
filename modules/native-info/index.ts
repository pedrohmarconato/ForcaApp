import { NativeModule, requireNativeModule } from 'expo';

export type NativeInfoModuleEvents = {
  onChange: (params: { value: string }) => void;
};

declare class NativeInfoModuleType extends NativeModule<NativeInfoModuleEvents> {
  getProvisioningProfileExpiry(): Promise<string | null>;
}

// This call loads the native module object from the JSI.
const NativeInfoModule = requireNativeModule<NativeInfoModuleType>('NativeInfoModule');

// Só a data de expiração do provisioning profile embarcado (D-03) — NUNCA o
// plist inteiro. `null` quando o arquivo não existe (esperado no Simulator;
// D-02 já fixa instalação por cabo em device físico).
export async function getProvisioningProfileExpiry(): Promise<string | null> {
  return NativeInfoModule.getProvisioningProfileExpiry();
}
