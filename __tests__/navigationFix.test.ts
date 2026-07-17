// __tests__/navigationFix.test.ts
// Fase 4 — os 4 FIXME(Fase 5) de navegação foram resolvidos: nada de reset
// cross-navigator para rotas inexistentes ('App'/'Login') com `as any`. A
// transição pós-onboarding/logout é dirigida pelo AuthContext (RootNavigator).
// Guarda de fonte para impedir que os `as any` voltem sorrateiramente.

import { readFileSync } from 'fs';
import { join } from 'path';

const lerFonte = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('FIXMEs de navegação resolvidos', () => {
  const questionnaire = lerFonte('src/screens/QuestionnaireScreen.tsx');
  const chat = lerFonte('src/screens/PostQuestionnaireChat.tsx');

  it('não há mais FIXME(Fase 5) de navegação nessas telas', () => {
    expect(questionnaire).not.toMatch(/FIXME\(Fase 5\)/);
    expect(chat).not.toMatch(/FIXME\(Fase 5\)/);
  });

  it('não há reset cross-navigator para rotas inexistentes com as any', () => {
    expect(chat).not.toMatch(/name:\s*'App'\s+as any/);
    expect(questionnaire).not.toMatch(/name:\s*'Login'\s+as any/);
    // e nenhum navigation.reset sobrou nessas telas de onboarding
    expect(chat).not.toMatch(/navigation\.reset/);
    expect(questionnaire).not.toMatch(/navigation\.reset/);
  });
});

describe('ActiveSession registrada na navegação tipada', () => {
  const main = lerFonte('src/navigation/MainNavigator.tsx');
  it('ActiveSession existe na Home e no Training stack; histórico no Profile', () => {
    expect(main).toMatch(/name="ActiveSession"/);
    expect(main).toMatch(/name="SessionHistory"/);
    expect(main).toMatch(/name="SessionHistoryDetail"/);
  });
});
