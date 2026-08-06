// src/config/featureFlags.ts
// Feature flags lidas de env EXPO_PUBLIC_* (inlinadas pelo babel no bundle no
// momento do build), no mesmo padrão de EXPO_PUBLIC_ENABLE_OFFLINE_MODE
// (trainingPlanService.ts).
//
// Achado A1 (review 2026-08-05): o card de treino conjunto (JointEntryCard) e
// o lobby que ele abre (JointLobbyScreen) dependem da migration 0026, ainda
// não aplicada em produção — lá o card quebra já na criação, e a única saída
// do lobby encerra a sessão para os dois lados. Gate por flag até a migration
// chegar a produção. Decisão do dono: default OFF em produção, ON em dev/HML.
//
// Regra: valor explícito de env ('true'/'false') sempre vence. Sem valor
// setado, cai no __DEV__ do bundle — dev local (expo start) = ON; build de
// release, HML incluído, = OFF até a env ser setada explicitamente no ambiente
// (ver docs/DEPLOY_WEB.md — envs vivem no painel do projeto Vercel).

const readExplicitBooleanFlag = (envValue: string | undefined): boolean | null => {
  if (envValue === 'true') return true;
  if (envValue === 'false') return false;
  return null;
};

// Nome em variável (não `process.env.EXPO_PUBLIC_...` direto): o babel-preset-expo
// inlina member expressions ESTÁTICAS de EXPO_PUBLIC_* em tempo de build/transform
// (ver babel.config.js) — inclusive no jest, travando o valor no momento do
// transform e ignorando qualquer atribuição feita depois em runtime/teste.
// `process.env[FLAG]` com variável escapa dessa inlinagem e mantém a leitura em
// runtime, mesmo padrão já usado por EXPO_PUBLIC_ENABLE_OFFLINE_MODE em
// trainingPlanService.ts.
const JOINT_TRAINING_FLAG = 'EXPO_PUBLIC_ENABLE_JOINT_TRAINING';

/**
 * Treino conjunto: card na Home + fluxo de convite/lobby (achado A1).
 * Setar EXPO_PUBLIC_ENABLE_JOINT_TRAINING=true no ambiente (painel Vercel do
 * projeto forca-app, ambiente Preview/HML) para ligar antes da migration 0026
 * chegar a produção.
 */
export const isJointTrainingEnabled = (): boolean => {
  const explicit = readExplicitBooleanFlag(process.env[JOINT_TRAINING_FLAG]);
  if (explicit !== null) return explicit;
  return typeof __DEV__ !== 'undefined' && __DEV__;
};
