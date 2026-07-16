// src/utils/logger.ts
// Logger condicionado ao ambiente de desenvolvimento.
// Em produção (__DEV__ === false) os logs são suprimidos para não vazar
// informações sensíveis (tokens, dados pessoais) nos logs do dispositivo.

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/* eslint-disable no-console */
export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (isDev) console.error(...args);
  },
};
/* eslint-enable no-console */

export default logger;
