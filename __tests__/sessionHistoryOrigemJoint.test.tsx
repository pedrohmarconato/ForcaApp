// __tests__/sessionHistoryOrigemJoint.test.tsx
// Achado A4 (remediação Treino Conjunto 2.0), lacuna do painel adversarial —
// getCompletedSessions já devolve `origemJoint` (desde b598ce5) e a prévia da
// aba Progresso (ProgressScreen) já mostra o marcador "Dupla" com ele. Mas a
// tela cheia de "Ver histórico completo" (SessionHistoryScreen) renderiza
// ListRow sem o prop `leading` — a MESMA sessão perde o marcador ao abrir o
// histórico completo. Molde de setup/mocks copiado de
// progressScreenOrigemJoint.test.tsx.

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

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => mockSessoes),
}));

import SessionHistoryScreen from '../src/screens/SessionHistoryScreen';

/**
 * Sobe pela árvore de instâncias a partir do nó de texto do título até achar
 * o ancestral mais estreito que contém `alvo` mas não `outro` — a linha
 * (ListRow) daquele registro específico. Evita contar níveis internos do
 * RN/ListRow (detalhe de implementação instável) e evita amarrar o teste a um
 * testID que teria que ser adicionado só para o teste existir.
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

describe('SessionHistoryScreen — marcador de origem conjunta (achado A4, painel)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessoes = [];
  });

  it('mostra "Dupla" na sessão vinda de plano joint e NÃO mostra na solo', async () => {
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

    const { getByText, queryAllByText } = render(<SessionHistoryScreen />);

    await waitFor(() => expect(getByText('Treino em Dupla A')).toBeTruthy());
    expect(getByText('Treino Solo B')).toBeTruthy();

    // Amarra o chip ao registro certo — não só "existe algum 'Dupla' na tela".
    const linhaJoint = linhaDoRegistro(getByText('Treino em Dupla A'), 'Treino em Dupla A', 'Treino Solo B');
    const linhaSolo = linhaDoRegistro(getByText('Treino Solo B'), 'Treino Solo B', 'Treino em Dupla A');
    if (!linhaJoint || !linhaSolo) {
      throw new Error('Não encontrou o container da linha (ListRow) da sessão.');
    }
    expect(within(linhaJoint).queryByText('Dupla')).toBeTruthy();
    expect(within(linhaSolo).queryByText('Dupla')).toBeNull();

    // E em quantidade exata: só um marcador na tela inteira.
    expect(queryAllByText('Dupla')).toHaveLength(1);
  });
});
