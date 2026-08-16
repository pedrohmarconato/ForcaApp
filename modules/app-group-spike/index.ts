import { NativeModule, requireNativeModule } from 'expo';

declare class AppGroupSpikeModuleType extends NativeModule<Record<string, never>> {
  readAppGroupSpikeValue(): Promise<string | null>;
}

// This call loads the native module object from the JSI.
const AppGroupSpikeModule = requireNativeModule<AppGroupSpikeModuleType>('AppGroupSpikeModule');

// SPIKE-ONLY (14-05) — remover em 14-07 (junto com o resto de
// modules/app-group-spike/) se o round-trip físico não confirmar App Groups
// no time pessoal gratuito (Pitfall 3, PITFALLS.md). Lê de volta o valor que
// o target de widget grava em UserDefaults(suiteName:) — `null` quando o
// App Group não existe/não está acessível (esperado se a capability não
// funcionar em time gratuito, ou antes do widget rodar pela primeira vez).
export async function readAppGroupSpikeValue(): Promise<string | null> {
  return AppGroupSpikeModule.readAppGroupSpikeValue();
}
