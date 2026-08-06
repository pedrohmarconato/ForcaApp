// __tests__/featureFlagsEnvInline.test.ts
// Achado A4 (review PR #73): o babel-preset-expo (inline-env-vars, via
// expo/virtual/env) só substitui member expressions ESTÁTICAS de EXPO_PUBLIC_*
// — `process.env[FLAG]` com a chave em variável nunca é inlinado em NENHUM
// build real, e a flag caía sempre no __DEV__: ligar o treino conjunto pelo
// painel de HML (mecanismo documentado no próprio featureFlags.ts) não
// funcionava. Este teste roda o babel.config.js REAL sobre o arquivo de
// produção e prova que o acesso estático é substituído — se alguém
// reintroduzir o acesso computado, `process.env[` reaparece no output.
import { transformSync } from '@babel/core';
import { readFileSync } from 'fs';
import { join } from 'path';

const configFactory = require('../babel.config.js');
const babelConfig = configFactory({ cache: () => {} });

const originalEnv = process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING;
const originalEnvOffline = process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE;

const transformaFeatureFlags = (env: string | undefined): string => {
  if (env === undefined) delete process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING;
  else process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = env;
  const code = readFileSync(join(process.cwd(), 'src/config/featureFlags.ts'), 'utf8');
  const out = transformSync(code, {
    ...babelConfig,
    filename: 'src/config/featureFlags.ts',
    babelrc: false,
    configFile: false,
  });
  return out?.code ?? '';
};

// R4 (review PR #73): o mesmo padrão que quebrou a flag do treino conjunto
// sobrevivia no trainingPlanService — `process.env[OFFLINE_FLAG]` com a chave
// em constante local nunca é inlinado pelo babel, então
// EXPO_PUBLIC_ENABLE_OFFLINE_MODE era ignorada em QUALQUER build real (o bug
// é pré-existente na main, não nasceu no PR #73). O transform real sobre o
// arquivo de produção prova que o acesso estático é substituído.
const transformaTrainingPlanService = (env: string | undefined): string => {
  if (env === undefined) delete process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE;
  else process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE = env;
  const code = readFileSync(join(process.cwd(), 'src/services/api/trainingPlanService.ts'), 'utf8');
  const out = transformSync(code, {
    ...babelConfig,
    filename: 'src/services/api/trainingPlanService.ts',
    babelrc: false,
    configFile: false,
  });
  return out?.code ?? '';
};

afterEach(() => {
  if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING;
  else process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = originalEnv;
  if (originalEnvOffline === undefined) delete process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE;
  else process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE = originalEnvOffline;
});

describe('A4 — env EXPO_PUBLIC_* é inlinada no transform real', () => {
  it('com valor setado, o transform substitui o acesso — nenhum process.env computado sobrevive', () => {
    const out = transformaFeatureFlags('true');
    // Modo de falha: `process.env[JOINT_TRAINING_FLAG]` (chave em variável)
    // ficava intacto no bundle e a env explícita era ignorada em qualquer
    // build. O acesso estático é inlinado (expo/virtual/env) e não sobra
    // nenhum `process.env[` no output.
    expect(out).not.toContain('process.env[');
    expect(out).toContain('expo/virtual/env');
  });

  it('R4: trainingPlanService usa acesso ESTÁTICO — `process.env[` computado não sobrevive ao transform', () => {
    const out = transformaTrainingPlanService('true');
    expect(out).not.toContain('process.env[');
    expect(out).toContain('expo/virtual/env');
  });
});
