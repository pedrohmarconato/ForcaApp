// __tests__/jointSoloNaoRegride.test.tsx
// Treino Conjunto 2.0 — Sprint 02. O treino solo continua intacto.
//
// O Sprint 02 mexeu em quatro arquivos existentes. Estes testes existem para
// que a próxima pessoa saiba, sem ler o diff, que a Home, as rotas antigas e o
// tipo de navegação continuam como estavam.
//
// Achado A5 (review 2026-08-05): os describes abaixo que leem o arquivo com
// `ler()` e comparam com regex são guarda TEXTUAL — provam que a fonte diz
// determinada coisa, não que o app FAZ aquilo em execução. Isso é suficiente
// para invariantes estruturais (nome de rota, export, import), mas não prova
// que a Home renderiza nem que "Começar"/"Detalhes" navegam de verdade. O
// describe "L1 (comportamental)" abaixo cobre essa lacuna com render real
// (@testing-library/react-native) da HomeScreen e navegação exercitada de
// verdade — inclusive com o JointEntryCard no ar (achado A1: a flag
// EXPO_PUBLIC_ENABLE_JOINT_TRAINING cai em __DEV__ quando não setada, e o
// ambiente de teste do jest-expo tem __DEV__=true por padrão, então o cartão
// conjunto renderiza junto — o teste tem que continuar passando com ele lá).

import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

// --- Mocks para o describe comportamental (L1). Os describes textuais abaixo
// não importam HomeScreen nem dependem destes mocks — continuam lendo a
// fonte crua com `ler()`. ---
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: jest.fn((cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, [cb]);
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@example.com' },
    profile: { full_name: 'Atleta de Teste' },
  }),
}));

// Prefixo "mock" é exigido pelo babel-plugin-jest-hoist: são as únicas
// variáveis externas que uma factory de jest.mock() pode referenciar (o mock
// é hoistado para ANTES da declaração de qualquer const comum do módulo).
const mockSessionId = 'sess-solo-l1';
// Data local de hoje, no mesmo formato que useDiaLocal/localTodayISO usam —
// não importa qual data é, só que a sessão mockada exista e seja renderizável.
const mockHojeISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => ({
    id: mockSessionId,
    plan_id: 'plan-1',
    user_id: 'user-123',
    week_number: 3,
    day_of_week: 'monday',
    order_in_week: 1,
    title: 'Treino de Pernas',
    session_type: 'strength',
    scheduled_date: mockHojeISO,
    estimated_minutes: 45,
    status: 'pending',
    muscle_groups: ['Quadríceps', 'Glúteos'],
  })),
  getUpcomingSessions: jest.fn(async () => []),
  fecharSessoesDeSemanasVencidas: jest.fn(async () => ({ fechadas: 0 })),
}));

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => []),
}));

import HomeScreen from '../src/screens/HomeScreen';

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

describe('L1 (comportamental) — o fluxo solo executa de verdade, com o cartão conjunto ao lado', () => {
  // Diferente do describe acima (regex sobre a fonte), este renderiza a
  // HomeScreen de verdade e exercita a navegação. Cobre exatamente o que o
  // nome do arquivo promete: solo não regride — inclusive com o JointEntryCard
  // no ar por padrão no jest (achado A1 + nota do achado A5).

  it('renderiza o treino do dia E o cartão de treino conjunto juntos, sem um atropelar o outro', async () => {
    const { getByTestId, getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('card-treino-destaque')).toBeTruthy());
    expect(getByText('Treino de Pernas')).toBeTruthy();
    // O cartão conjunto (flag ON por padrão no teste) continua no ar ao lado —
    // é exatamente o cenário que quebraria se A1 tivesse feito o gate errado.
    expect(getByTestId('card-treino-conjunto')).toBeTruthy();
  });

  it('"Começar" navega para ActiveSession com o id da sessão do dia', async () => {
    const { getByTestId, getByText } = render(<HomeScreen />);
    await waitFor(() => expect(getByTestId('card-treino-destaque')).toBeTruthy());

    fireEvent.press(getByText('Começar'));

    expect(mockNavigate).toHaveBeenCalledWith('ActiveSession', { sessionId: mockSessionId });
  });

  it('"Detalhes" navega para WorkoutDetail com o id da sessão do dia', async () => {
    const { getByTestId, getByText } = render(<HomeScreen />);
    await waitFor(() => expect(getByTestId('card-treino-destaque')).toBeTruthy());

    fireEvent.press(getByText('Detalhes'));

    expect(mockNavigate).toHaveBeenCalledWith('WorkoutDetail', { sessionId: mockSessionId });
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
