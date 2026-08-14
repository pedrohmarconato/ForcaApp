// src/utils/alertShim.ts
// Shim central de Alert.alert (WEB-01). react-native-web NÃO implementa
// Alert.alert — a chamada vira no-op silencioso, e no PWA o botão "Concluir
// treino" parece morto (dívida conhecida do v1.1, PROJECT.md). Molde de
// shim por Platform.OS: src/utils/haptics.ts (isWeb() função) e
// src/services/auth/secureStorage.ts (isWeb valor).
//
// MESMA assinatura de Alert.alert (D-01): call sites trocam só o nome da
// função, sem tocar nos argumentos.
//
// No nativo (Platform.OS !== 'web'): repasse puro para Alert.alert real —
// nenhuma mudança de comportamento (D-03). No web: escreve no alertStore,
// que o AlertHost.tsx monitora e renderiza como Modal custom.

import { Alert, Platform } from 'react-native';

import { useAlertStore, type AlertButton } from '../store/alertStore';

export type { AlertButton };

export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void => {
  if (Platform.OS !== 'web') {
    // Repasse com a MESMA aridade da chamada original (D-03): forçar sempre
    // 3 argumentos passaria `undefined` explícito onde o call site nunca
    // passou nada, quebrando spies que verificam a lista exata de
    // argumentos (ex.: toHaveBeenCalledWith('t', 'm') falha se o terceiro
    // arg for `undefined` em vez de ausente).
    if (buttons !== undefined) {
      Alert.alert(title, message, buttons);
    } else if (message !== undefined) {
      Alert.alert(title, message);
    } else {
      Alert.alert(title);
    }
    return;
  }
  useAlertStore.getState().show({
    title,
    message: message ?? null,
    buttons: buttons ?? null,
  });
};
