// src/services/auth/tokenStorage.ts
// Compatibilidade para consumidores legados (ex.: interceptors.ts).
// Os tokens agora são persistidos no SecureStore (criptografado),
// não mais no AsyncStorage em texto puro.

import { setItem, getItem, removeItem } from './secureStorage';

const TOKEN_KEY = '@FORCA:auth_token';

// Salvar token no SecureStore
export const saveToken = async (token: string): Promise<void> => {
  try {
    await setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error('Erro ao salvar token:', error);
  }
};

// Obter token do SecureStore
export const getToken = async (): Promise<string | null> => {
  try {
    return await getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Erro ao obter token:', error);
    return null;
  }
};

// Remover token do SecureStore
export const removeToken = async (): Promise<void> => {
  try {
    await removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('Erro ao remover token:', error);
  }
};
