// src/services/auth/secureStorage.ts
// Armazenamento seguro baseado em expo-secure-store (Keychain no iOS,
// Keystore no Android). Substitui o AsyncStorage para dados sensíveis
// (sessão/tokens). O SecureStore limita cada valor a ~2048 bytes, então
// valores maiores são divididos em chunks e recompostos na leitura.

import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800; // margem abaixo do limite de 2048 bytes por chave

// SecureStore aceita apenas [a-zA-Z0-9._-] nas chaves
const sanitizeKey = (key: string): string => key.replace(/[^a-zA-Z0-9._-]/g, '_');

const countKey = (safeKey: string): string => `${safeKey}_count`;
const chunkKey = (safeKey: string, index: number): string => `${safeKey}_chunk_${index}`;

export const setItem = async (key: string, value: string): Promise<void> => {
  const safeKey = sanitizeKey(key);
  // Remove chunks antigas antes de gravar (evita sobras de valores maiores)
  await removeItem(safeKey);

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  await SecureStore.setItemAsync(countKey(safeKey), String(chunks.length));
  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(safeKey, index), chunk)),
  );
};

export const getItem = async (key: string): Promise<string | null> => {
  const safeKey = sanitizeKey(key);
  const storedCount = await SecureStore.getItemAsync(countKey(safeKey));
  if (storedCount === null) return null;

  const count = parseInt(storedCount, 10);
  if (Number.isNaN(count)) return null;

  const parts = await Promise.all(
    Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(safeKey, index))),
  );

  // Se alguma chunk sumiu, o valor está corrompido: trata como inexistente
  if (parts.some((part) => part === null)) return null;
  return parts.join('');
};

export const removeItem = async (key: string): Promise<void> => {
  const safeKey = sanitizeKey(key);
  const storedCount = await SecureStore.getItemAsync(countKey(safeKey));

  if (storedCount !== null) {
    const count = parseInt(storedCount, 10);
    if (!Number.isNaN(count)) {
      await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(safeKey, index))),
      );
    }
    await SecureStore.deleteItemAsync(countKey(safeKey));
  }
};

/**
 * Adapter compatível com a interface `storage` do supabase-js.
 * Uso: createClient(URL, KEY, { auth: { storage: supabaseSecureStorage } })
 */
export const supabaseSecureStorage = {
  getItem,
  setItem,
  removeItem,
};

export default supabaseSecureStorage;
