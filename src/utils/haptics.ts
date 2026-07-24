// src/utils/haptics.ts
// Feedback tátil seguro por plataforma. No PWA (web) é no-op — expo-haptics
// não existe lá e qualquer chamada viraria erro no console. No nativo, falha
// de vibrador NUNCA pode derrubar o toque: o haptic é acessório, o toque é o
// evento. Por isso todo caminho engole exceção.

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isWeb = () => Platform.OS === 'web';

/** Toque leve de seleção — ações primárias e escolhas (chips, dias, RIR). */
export const tapLight = async (): Promise<void> => {
  if (isWeb()) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // acessório: segue sem vibrar
  }
};

/** Confirmação de conquista real (série concluída, treino fechado). */
export const notifySuccess = async (): Promise<void> => {
  if (isWeb()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // acessório: segue sem vibrar
  }
};

/** Aviso tátil discreto (proposta do treinador, erro recuperável). */
export const notifyWarning = async (): Promise<void> => {
  if (isWeb()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // acessório: segue sem vibrar
  }
};
