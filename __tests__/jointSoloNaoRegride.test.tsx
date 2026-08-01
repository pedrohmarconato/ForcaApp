// __tests__/jointSoloNaoRegride.test.tsx
// Treino Conjunto 2.0 — Sprint 02. O treino solo continua intacto.
//
// O Sprint 02 mexeu em quatro arquivos existentes. Estes testes existem para
// que a próxima pessoa saiba, sem ler o diff, que a Home, as rotas antigas e o
// tipo de navegação continuam como estavam.

import { readFileSync } from 'fs';
import { join } from 'path';

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('L4 — nenhuma rota pré-existente mudou', () => {
  const nav = ler('src/navigation/MainNavigator.tsx');

  it.each([
    ['HomeMain', 'HomeScreen'],
    ['WorkoutDetail', 'WorkoutDetailScreen'],
    ['ActiveSession', 'ActiveSessionScreen'],
    ['TrainingOverview', 'TrainingSessionScreen'],
    ['ProgressMain', 'ProgressScreen'],
    ['SessionHistory', 'SessionHistoryScreen'],
    ['SessionHistoryDetail', 'SessionHistoryDetailScreen'],
    ['ProfileMain', 'ProfileScreen'],
  ])('rota %s continua apontando para %s', (rota, tela) => {
    expect(nav).toMatch(new RegExp(`name="${rota}"\\s+component=\\{${tela}\\}`));
  });

  it('os params das rotas antigas não mudaram', () => {
    expect(nav).toContain('WorkoutDetail: { sessionId: string };');
    expect(nav).toContain('ActiveSession: { sessionId: string };');
    expect(nav).toContain('SessionHistoryDetail: { sessionLogId: string; title?: string };');
  });
});

describe('L5 — fonte única do tipo de rota', () => {
  const home = ler('src/screens/HomeScreen.tsx');

  it('HomeScreen IMPORTA o tipo em vez de redeclarar', () => {
    expect(home).toContain("import type { HomeStackParamList } from '../navigation/MainNavigator'");
  });

  it('a cópia local não voltou — ela só quebraria em runtime', () => {
    expect(home).not.toMatch(/^type HomeStackParamList = \{/m);
  });
});

describe('L1 — ordem da Home: o treino do dia vem primeiro', () => {
  const home = ler('src/screens/HomeScreen.tsx');

  it('o cartão conjunto aparece DEPOIS do bloco do treino do dia', () => {
    const fimDoTreinoDoDia = home.indexOf('Nenhum treino pendente');
    // O USO no JSX, não o import do topo do arquivo.
    const cartaoConjunto = home.indexOf('<JointEntryCard');
    expect(fimDoTreinoDoDia).toBeGreaterThan(0);
    expect(cartaoConjunto).toBeGreaterThan(fimDoTreinoDoDia);
  });

  it('e ANTES de "Sua semana" — descobrível sem enterrar', () => {
    // Compara com o CABEÇALHO da seção, não com a primeira menção do texto —
    // há um comentário sobre "Sua semana" no topo do arquivo.
    expect(home.indexOf('<JointEntryCard'))
      .toBeLessThan(home.indexOf('<SectionHeader title="Sua semana"'));
  });

  it('o bloco do treino do dia continua chamando ActiveSession como antes', () => {
    expect(home).toContain("navigation.navigate('ActiveSession', { sessionId: todaySession.id })");
  });
});

describe('E4 — a allowlist foi respeitada', () => {
  it('RootNavigator entrega a config certa para cada árvore', () => {
    const root = ler('src/navigation/RootNavigator.js');
    // Auth recebe a interceptora.
    expect(root).toMatch(/linking=\{linkingInterceptor\}[\s\S]{0,80}<AuthNavigator/);
    // O segundo container escolhe por árvore: Main recebe linkingMain.
    expect(root).toContain('linking={ehMain ? linkingMain : linkingInterceptor}');
    expect(root).toContain('const ehMain = Boolean(profile && profile.onboarding_completed)');
  });

  it('o consumo do pendente NÃO entra sozinho: só despacha para a tela', () => {
    const root = ler('src/navigation/RootNavigator.js');
    expect(root).toContain("mainNavigationRef.navigate('Home', { screen: 'JointJoin'");
    expect(root).not.toMatch(/joinJointSession/);
  });

  it('app.json declara o scheme', () => {
    const app = JSON.parse(ler('app.json'));
    expect(app.expo.scheme).toBe('forcaapp');
  });
});

describe('o repositório do Sprint 01 não foi alterado', () => {
  const repo = ler('src/services/jointSessionRepository.ts');

  it.each([
    'createJointSession', 'joinJointSession', 'setJointSessionMode',
    'confirmJointParticipantSession', 'materializeJointSessionCopy',
    'setJointParticipantReady', 'advanceJointTurn', 'markJointQueueFinished',
    'pauseJointSession', 'resumeJointSession', 'touchJointPresence',
    'completeJointParticipant', 'abandonJointSession', 'getJointPartnerProfile',
    'getJointSessionSnapshot',
  ])('%s continua exportada', (fn) => {
    expect(repo).toMatch(new RegExp(`export const ${fn}\\b`));
  });

  it('a única adição é a leitura do convite do host', () => {
    expect(repo).toContain('export const getJointInviteForHost');
    // E ela é honesta sobre o que é: restrição de aplicação, não fronteira nova.
    expect(repo).toContain('NÃO FRONTEIRA DE SEGURANÇA');
  });
});
