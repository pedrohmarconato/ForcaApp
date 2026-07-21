// src/services/postQuestionnaireChatStorage.ts
// Chaves do estado do chat pós-questionário — compartilhadas entre a tela de
// chat (grava/lê) e o questionário (reseta ao abrir uma rodada nova).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeItem as secureRemoveItem } from './auth/secureStorage';

export const STORAGE_KEY_CHAT_PREFIX = '@chat_messages_';
// Substitui @chat_completed_: agora é máquina de estados, não booleano.
// "in_progress" | "generating" | "completed"
// NUNCA bloqueia reentrada na conversa com base em estado armazenado (R1).
export const STORAGE_KEY_CHAT_STATE_PREFIX = '@chat_state_';

/**
 * Apaga a conversa persistida da rodada anterior. Uma submissão NOVA do
 * questionário abre uma rodada nova: sem o reset, um isChatEnded=true salvo
 * (ex.: geração que falhou depois do encerramento do chat) ressuscita e a
 * tela abre como "Chat finalizado", sem caminho para voltar a conversar.
 * Nunca lança: falha aqui não pode impedir a navegação para o chat.
 */
export const resetPostQuestionnaireChatState = async (userId: string): Promise<void> => {
  const keys = [
    `${STORAGE_KEY_CHAT_PREFIX}${userId}`,
    `${STORAGE_KEY_CHAT_STATE_PREFIX}${userId}`,
  ];
  for (const key of keys) {
    await secureRemoveItem(key).catch(() => undefined);
    // Remove também a cópia legada em texto puro (versões antigas usavam AsyncStorage)
    await AsyncStorage.removeItem(key).catch(() => undefined);
  }
};
