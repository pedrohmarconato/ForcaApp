// src/services/auth/secureStorage.ts
// Armazenamento seguro baseado em expo-secure-store (Keychain no iOS,
// Keystore no Android) para dados sensíveis (sessão/tokens/saúde).
//
// Garantias (review de segurança):
// - O limite do SecureStore é em BYTES (~2048): o chunking é por bytes UTF-8,
//   não por caracteres (emoji = 4 bytes).
// - Escrita atômica por GERAÇÃO: chunks novas → manifesto → remoção das antigas.
//   Falha parcial nunca destrói o valor anterior.
// - Operações na mesma chave são serializadas (mutex por chave).
// - Chaves físicas são hex do UTF-8 da chave lógica: injetivo (sem colisões)
//   e sempre válido para o SecureStore ([a-zA-Z0-9._-]).

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Caminho WEB (PWA) ---
//
// O expo-secure-store NÃO tem implementação para web: chamar getItemAsync no
// navegador estoura `getValueWithKeyAsync is not a function` e derruba a
// inicialização da sessão. Na web usamos localStorage — o mesmo storage que o
// supabase-js adota por padrão ali.
//
// LIMITAÇÃO ACEITA CONSCIENTEMENTE: localStorage não tem o isolamento do
// Keychain/Keystore (é legível por qualquer script na origem, logo por XSS).
// Isso é uma característica da plataforma web, não uma regressão do nativo —
// no iOS/Android o caminho seguro abaixo continua valendo. Nada de chunking
// aqui: localStorage não tem o limite de ~2048 bytes do SecureStore.
const isWeb = Platform.OS === 'web';

const webStorage = {
  getItem: (key: string): string | null => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null; // modo privado/storage bloqueado: trata como ausência
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // cota estourada ou storage bloqueado — não derruba o app
    }
  },
  removeItem: (key: string): void => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // idem
    }
  },
};

const CHUNK_BYTES = 1800; // margem abaixo do limite de ~2048 bytes por valor

// --- Utilidades de bytes UTF-8 (sem depender de TextEncoder do Hermes) ---

const utf8ByteLengthOfChar = (char: string): number => {
  const codePoint = char.codePointAt(0)!;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

/** Divide a string em chunks de no máximo CHUNK_BYTES bytes UTF-8 cada. */
const splitIntoChunks = (value: string): string[] => {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of value) { // itera por code points (par de surrogates junto)
    const charBytes = utf8ByteLengthOfChar(char);
    if (currentBytes + charBytes > CHUNK_BYTES) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
};

// --- Chaves físicas injetivas: hex dos bytes UTF-8 da chave lógica ---

const toPhysicalKey = (logicalKey: string): string => {
  let hex = '';
  for (const char of logicalKey) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint <= 0x7f) {
      hex += codePoint.toString(16).padStart(2, '0');
    } else {
      // Reconstroi os bytes UTF-8 do code point
      const bytes: number[] = [];
      if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint <= 0xffff) {
        bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      } else {
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      }
      for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
    }
  }
  return `k_${hex}`;
};

const manifestKey = (physical: string): string => `${physical}_manifest`;
const chunkKeyOf = (physical: string, generation: string, index: number): string =>
  `${physical}_g${generation}_${index}`;

// --- Mutex por chave: serializa operações concorrentes na mesma chave ---

const keyLocks = new Map<string, Promise<unknown>>();

const withKeyLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const previous = keyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  keyLocks.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (keyLocks.get(key) === tail) keyLocks.delete(key);
  }
};

// --- Gerações únicas para escrita atômica ---

let generationCounter = 0;
const newGeneration = (): string => `${Date.now().toString(36)}_${(generationCounter++).toString(36)}`;

const parseManifest = (manifest: string | null): { generation: string; count: number } | null => {
  if (!manifest) return null;
  const separatorIndex = manifest.lastIndexOf(':');
  if (separatorIndex < 0) return null;
  const generation = manifest.slice(0, separatorIndex);
  const count = parseInt(manifest.slice(separatorIndex + 1), 10);
  if (!generation || Number.isNaN(count)) return null;
  return { generation, count };
};

// --- Limpeza do esquema legado (versão anterior com sanitize por replace) ---

const deleteLegacyKeys = async (logicalKey: string): Promise<void> => {
  const legacySafe = logicalKey.replace(/[^a-zA-Z0-9._-]/g, '_');
  try {
    const legacyCount = await SecureStore.getItemAsync(`${legacySafe}_count`);
    if (legacyCount !== null) {
      const count = parseInt(legacyCount, 10);
      if (!Number.isNaN(count)) {
        await Promise.all(
          Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${legacySafe}_chunk_${i}`)),
        );
      }
      await SecureStore.deleteItemAsync(`${legacySafe}_count`);
    }
  } catch {
    // melhor esforço: falha na limpeza do legado não impede a operação principal
  }
};

// --- API pública (mesma interface de antes) ---

export const setItem = async (key: string, value: string): Promise<void> => {
  if (isWeb) {
    webStorage.setItem(key, value);
    return;
  }
  const physical = toPhysicalKey(key);
  return withKeyLock(physical, async () => {
    const oldManifest = parseManifest(await SecureStore.getItemAsync(manifestKey(physical)));

    // 1. Grava as chunks da NOVA geração primeiro (falha aqui não toca no valor antigo)
    const generation = newGeneration();
    const chunks = splitIntoChunks(value);
    try {
      for (let index = 0; index < chunks.length; index++) {
        await SecureStore.setItemAsync(chunkKeyOf(physical, generation, index), chunks[index]);
      }
    } catch (error) {
      // Limpa as chunks parciais da geração abortada (melhor esforço) para
      // não deixar blobs órfãos — o manifesto continua no valor antigo
      await Promise.all(
        chunks.map((_, index) => SecureStore.deleteItemAsync(chunkKeyOf(physical, generation, index))),
      ).catch(() => undefined);
      throw error;
    }

    // 2. Commit: o manifesto passa a apontar para a nova geração
    await SecureStore.setItemAsync(manifestKey(physical), `${generation}:${chunks.length}`);

    // 3. Remove a geração anterior e o esquema legado (melhor esforço)
    if (oldManifest) {
      await Promise.all(
        Array.from({ length: oldManifest.count }, (_, i) =>
          SecureStore.deleteItemAsync(chunkKeyOf(physical, oldManifest.generation, i)),
        ),
      );
    }
    await deleteLegacyKeys(key);
  });
};

export const getItem = async (key: string): Promise<string | null> => {
  if (isWeb) return webStorage.getItem(key);
  const physical = toPhysicalKey(key);
  return withKeyLock(physical, async () => {
    const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(physical)));
    if (!manifest) return null;

    const parts = await Promise.all(
      Array.from({ length: manifest.count }, (_, i) =>
        SecureStore.getItemAsync(chunkKeyOf(physical, manifest.generation, i)),
      ),
    );
    if (parts.some((part) => part === null)) return null; // geração corrompida
    return parts.join('');
  });
};

export const removeItem = async (key: string): Promise<void> => {
  if (isWeb) {
    webStorage.removeItem(key);
    return;
  }
  const physical = toPhysicalKey(key);
  return withKeyLock(physical, async () => {
    const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(physical)));
    if (manifest) {
      await Promise.all(
        Array.from({ length: manifest.count }, (_, i) =>
          SecureStore.deleteItemAsync(chunkKeyOf(physical, manifest.generation, i)),
        ),
      );
    }
    await SecureStore.deleteItemAsync(manifestKey(physical));
    await deleteLegacyKeys(key);
  });
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

/**
 * Migra a sessão Supabase gravada em texto puro no AsyncStorage por versões
 * ANTIGAS do app (que usavam AsyncStorage como storage do supabase-js) para o
 * SecureStore, na mesma chave lógica (formato `sb-<ref>-auth-token`), e APAGA
 * a cópia em texto puro. Não sobrescreve uma sessão já existente no SecureStore.
 *
 * @param supabaseUrl URL do projeto Supabase (de onde se extrai o ref do projeto).
 */
export const migrateLegacySupabaseSession = async (supabaseUrl: string): Promise<void> => {
  // Migração é um conceito NATIVO (AsyncStorage → SecureStore). No web não
  // existe sessão legada: o AsyncStorage também é window.localStorage sem
  // prefixo, então a "cópia legada" seria a própria sessão viva do
  // supabase-js — e o removeItem final a apagaria a cada boot do PWA.
  if (isWeb) return;
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    if (!ref) return;
    const legacyKey = `sb-${ref}-auth-token`;

    const legacyValue = await AsyncStorage.getItem(legacyKey);
    if (legacyValue === null) return;

    // Só migra se ainda não houver sessão (mais nova) no SecureStore
    const existing = await getItem(legacyKey);
    if (existing === null) {
      await setItem(legacyKey, legacyValue);
    }

    // A cópia em texto puro SEMPRE é apagada
    await AsyncStorage.removeItem(legacyKey);
  } catch {
    // melhor esforço: falha na migração não pode impedir o boot do app
  }
};

export default supabaseSecureStorage;
