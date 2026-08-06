// src/config/featureFlags.ts
// Feature flags lidas de env EXPO_PUBLIC_* (inlinadas pelo babel no bundle no
// momento do build), no mesmo padrão de EXPO_PUBLIC_ENABLE_OFFLINE_MODE
// (trainingPlanService.ts).
//
// Achado A1 (review 2026-08-05): o card de treino conjunto (JointEntryCard) e
// o lobby que ele abre (JointLobbyScreen) dependem da migration 0026, ainda
// não aplicada em produção — lá o card quebra já na criação, e a única saída
// do lobby encerra a sessão para os dois lados. Gate por flag até a migration
// a produção. Decisão do dono: default OFF em QUALQUER build de release —
// HML incluído — até a env ser setada explicitamente no ambiente (R6, review PR #73).
//
// Regra: valor explícito de env ('true'/'false') sempre vence. Sem valor
// setado, cai no __DEV__ do bundle — dev local (expo start) = ON; build de
// release, HML incluído, = OFF até a env ser setada explicitamente no ambiente
// (ver docs/DEPLOY_WEB.md — envs vivem no painel do projeto Vercel).
//
// O ACESSO À ENV É ESTÁTICO de propósito (achado A4, review PR #73): o
// babel-preset-expo inlina member expressions ESTÁTICAS de EXPO_PUBLIC_* em
// tempo de build (babel.config.js), e `process.env[FLAG]` com a chave em
// variável NUNCA era substituído — em qualquer build real a env explícita era
// ignorada e a flag caía sempre no __DEV__ (ligar pelo painel de HML não
// funcionava). Quem precisar simular os dois estados em teste NÃO muta
// process.env (o transform já o substituiu): injeta a leitura via
// __setJointTrainingEnvReader.

const readExplicitBooleanFlag = (envValue: string | undefined): boolean | null => {
  if (envValue === 'true') return true;
  if (envValue === 'false') return false;
  return null;
};

// Leitura injetável: em Jest o transform já inlinou o acesso estático, então
// mutar process.env depois não surte efeito — os testes trocam o reader.
let lerEnv = (): string | undefined => process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING;

/** Só para teste: injeta a leitura da env (simula os dois estados do gate). */
export const __setJointTrainingEnvReader = (fn: () => string | undefined): void => {
  lerEnv = fn;
};

/**
 * Treino conjunto: card na Home + fluxo de convite/lobby (achado A1).
 * Setar EXPO_PUBLIC_ENABLE_JOINT_TRAINING=true no ambiente (painel Vercel do
 * projeto forca-app, ambiente Preview/HML) para ligar antes da migration 0026
 * chegar a produção.
 */
export const isJointTrainingEnabled = (): boolean => {
  const explicit = readExplicitBooleanFlag(lerEnv());
  if (explicit !== null) return explicit;
  return typeof __DEV__ !== 'undefined' && __DEV__;
};
