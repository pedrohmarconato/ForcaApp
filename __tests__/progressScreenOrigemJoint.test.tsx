// __tests__/progressScreenOrigemJoint.test.tsx
// Achado A4 (remediação Treino Conjunto 2.0) — "Recorde sem origem".
//
// progressStats/getCompletedSessions não distinguiam purpose='joint': um
// recorde ou uma sessão do histórico vindos de um treino EM DUPLA apareciam
// como se fossem solo, sem qualquer marcador visual. Este teste cobre as
// duas seções da aba Progresso que exibem esse dado (Recordes e Histórico).
//
// Investigação de flakiness (achado P5, 2026-08-06): falha relatada 1x em
// 30+ execuções (chip "Dupla" ausente em registro solo). 100 execuções
// seriais (--runInBand, 4 blocos de 25) rodaram sem nenhuma falha. Análise
// estática não achou poluição de estado inequívoca: (1) RNTL 13.3.3 chama
// afterEach(cleanup) automático, cada it já desmonta a árvore anterior;
// (2) mockSessoes/mockSetLogs são resetados em beforeEach e as factories
// capturam o valor no momento da chamada síncrona, sem leitura tardia;
// (3) recordesPorExercicio (src/engine/progressStats.ts:40-71) é função
// pura, sem cache; (4) Chip/ListRow são apresentacionais sem estado; (5) as
// keys de React em ProgressScreen.tsx:285 são distintas nos fixtures, sem
// colisão; (6) o único timer real (Animated.loop do Skeleton) tem cleanup
// correto. Hipótese mais provável para o 1-em-30+: jitter transitório de
// agendamento sob carga da máquina, não defeito determinístico.
// Classificação: flaky de infra, não reproduzido — se falhar de novo em CI,
// re-rodar isolado antes de suspeitar de regressão.

import React from 'react';
import { render, waitFor, within } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

let mockSessoes: any[] = [];
let mockSetLogs: any[] = [];

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => mockSessoes),
  getSetLogsResumo: jest.fn(async () => mockSetLogs),
}));

jest.mock('../src/services/cardioGoalRepository', () => ({
  getCardioLogs: jest.fn(async () => []),
  getMetasAtivas: jest.fn(async () => []),
  arquivarMeta: jest.fn(),
  definirMeta: jest.fn(),
  registrarMetaBatida: jest.fn(),
}));

import ProgressScreen from '../src/screens/ProgressScreen';

/**
 * Sobe pela árvore de instâncias a partir do nó de texto do título até achar
 * o ancestral mais estreito que contém `alvo` mas não `outro` — a linha
 * (ListRow) daquele registro específico. Evita contar "quantos níveis de
 * View/composite o RN intercala" (detalhe de implementação instável) e
 * evita amarrar o teste a um testID que teria que ser adicionado ao
 * ProgressScreen só para o teste existir.
 */
function linhaDoRegistro(node: ReturnType<typeof render>['getByText'] extends (
  ...args: any[]
) => infer R
  ? R
  : never, alvo: string, outro: string) {
  let atual: any = node;
  let melhor: any = null;
  while (atual) {
    const temAlvo = !!within(atual).queryByText(alvo);
    const temOutro = !!within(atual).queryByText(outro);
    if (temAlvo && !temOutro) {
      melhor = atual;
    } else if (temAlvo && temOutro) {
      break;
    }
    atual = atual.parent;
  }
  return melhor;
}

describe('ProgressScreen — marcador de origem conjunta (achado A4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessoes = [];
    mockSetLogs = [];
  });

  it('Recordes: mostra "Dupla" no recorde vindo de plano joint e NÃO mostra no solo', async () => {
    mockSetLogs = [
      {
        identity: 'k:supino',
        name: 'Supino Reto',
        loadKg: 50,
        reps: 8,
        completedAt: '2026-07-20T10:00:00Z',
        origemJoint: true,
      },
      {
        identity: 'k:agachamento',
        name: 'Agachamento',
        loadKg: 80,
        reps: 5,
        completedAt: '2026-07-21T10:00:00Z',
        origemJoint: false,
      },
    ];

    const { getByText, queryAllByText } = render(<ProgressScreen />);

    await waitFor(() => expect(getByText('Supino Reto')).toBeTruthy());
    expect(getByText('Agachamento')).toBeTruthy();

    // Amarra o chip ao registro certo (não só "existe algum 'Dupla' na tela"):
    // a linha do Supino Reto (origemJoint: true) carrega o marcador, e a
    // linha do Agachamento (origemJoint: false) não.
    const linhaSupino = linhaDoRegistro(getByText('Supino Reto'), 'Supino Reto', 'Agachamento');
    const linhaAgachamento = linhaDoRegistro(getByText('Agachamento'), 'Agachamento', 'Supino Reto');
    if (!linhaSupino || !linhaAgachamento) {
      throw new Error('Não encontrou o container da linha (ListRow) do recorde.');
    }
    expect(within(linhaSupino).queryByText('Dupla')).toBeTruthy();
    expect(within(linhaAgachamento).queryByText('Dupla')).toBeNull();

    // E em quantidade exata: só um marcador na tela inteira.
    expect(queryAllByText('Dupla')).toHaveLength(1);
  });

  it('Recordes: nenhum marcador quando TODOS os recordes são solo', async () => {
    mockSetLogs = [
      {
        identity: 'k:agachamento',
        name: 'Agachamento',
        loadKg: 80,
        reps: 5,
        completedAt: '2026-07-21T10:00:00Z',
        origemJoint: false,
      },
    ];

    const { getByText, queryByText } = render(<ProgressScreen />);

    await waitFor(() => expect(getByText('Agachamento')).toBeTruthy());
    expect(queryByText('Dupla')).toBeNull();
  });

  it('Histórico: mostra "Dupla" na sessão vinda de plano joint e NÃO mostra na solo', async () => {
    mockSessoes = [
      {
        sessionLogId: 'sl-joint',
        plannedSessionId: 'ps-joint',
        title: 'Treino em Dupla A',
        weekNumber: 1,
        muscleGroups: ['Peito'],
        startedAt: '2026-07-20T09:00:00Z',
        finishedAt: '2026-07-20T10:00:00Z',
        activeSeconds: 3000,
        origemJoint: true,
      },
      {
        sessionLogId: 'sl-solo',
        plannedSessionId: 'ps-solo',
        title: 'Treino Solo B',
        weekNumber: 1,
        muscleGroups: ['Pernas'],
        startedAt: '2026-07-21T09:00:00Z',
        finishedAt: '2026-07-21T10:00:00Z',
        activeSeconds: 3000,
        origemJoint: false,
      },
    ];

    const { getByText, queryAllByText } = render(<ProgressScreen />);

    await waitFor(() => expect(getByText('Treino em Dupla A')).toBeTruthy());
    expect(getByText('Treino Solo B')).toBeTruthy();

    // Exatamente um marcador — o da sessão joint, não o da solo.
    expect(queryAllByText('Dupla')).toHaveLength(1);
  });
});
