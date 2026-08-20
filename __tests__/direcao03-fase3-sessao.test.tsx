// __tests__/direcao03-fase3-sessao.test.tsx
// Fase 3 da Direção 03 — sessão: resumo honesto, descanso ajustável e
// check-in de foco. Modos de falha cobertos antes da implementação:
//  1. volume somando série não concluída, cardio ou peso corporal (número
//     inventado — viola a regra "nada de dado inventado");
//  2. duração derivada sem startedAt (teria que ser null, nunca 0 ou NaN);
//  3. −30s deixando o descanso negativo/zerado (auto-avanço fantasma);
//  4. check-in de foco perdendo o gate das duas respostas ao sair do Modal.

import React from 'react';
import { render as renderNative, fireEvent } from '@testing-library/react-native';

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', neon_color: 'yellow' },
  }),
}));
jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));

import {
  montarResumoSessao,
  ajustarDescanso,
} from '../src/engine/sessionSummary';
import type { SessionDraft, DraftExercise, DraftSet } from '../src/engine/sessionModel';
import CheckInSheet from '../src/components/session/CheckInSheet';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const render = (element: React.ReactElement) => {
  const utils = renderNative(<ThemeProvider>{element}</ThemeProvider>);
  return {
    ...utils,
    rerender: (nextElement: React.ReactElement) =>
      utils.rerender(<ThemeProvider>{nextElement}</ThemeProvider>),
  };
};

const setBase = (n: number, extra: Partial<DraftSet> = {}): DraftSet => ({
  plannedSetId: `set-${n}`,
  setOrder: n,
  targetRepsMin: 8,
  targetRepsMax: 10,
  targetLoadKg: null,
  targetDurationSeconds: null,
  targetDistanceM: null,
  status: 'pending',
  actualReps: null,
  actualLoadKg: null,
  actualDurationSeconds: null,
  actualDistanceM: null,
  actualRir: null,
  perceivedEffort: null,
  outcome: null,
  setLogId: null,
  adaptation: null,
  activatedAt: null,
  ...extra,
} as DraftSet);

const exercicioBase = (
  nome: string,
  sets: DraftSet[],
  extra: Partial<DraftExercise> = {},
): DraftExercise => ({
  exerciseId: `ex-${nome}`,
  exerciseKey: null,
  name: nome,
  order: 1,
  metric: 'carga_reps',
  equipment: null,
  isBodyweight: false,
  hasInjury: false,
  cutByReplan: false,
  loadIncrementKg: 2.5,
  restSeconds: 90,
  priority: 'primary',
  targetRmPercent: null,
  repsRaw: null,
  sets,
  ...extra,
});

const draftBase = (exercises: DraftExercise[], startedAt: string | null): SessionDraft => ({
  version: 1,
  plannedSessionId: 'sessao-1',
  sessionLogId: 'log-1',
  userId: 'user-123',
  title: 'Push A',
  weekNumber: 3,
  startedAt,
  status: 'active',
  restEndsAt: null,
  exercises,
  lastLoadByExercise: {},
  lastRepsByExercise: {},
});

describe('Fase 3 — montarResumoSessao (nada de número inventado)', () => {
  it('soma volume só de série CONCLUÍDA com reps E carga', () => {
    const draft = draftBase(
      [
        exercicioBase('Supino', [
          setBase(1, { status: 'done', actualReps: 10, actualLoadKg: 40 }), // 400
          setBase(2, { status: 'done', actualReps: 8, actualLoadKg: 42.5 }), // 340
          setBase(3, { status: 'pending', actualReps: 12, actualLoadKg: 50 }), // NÃO conta
        ]),
      ],
      null,
    );

    const resumo = montarResumoSessao(draft, new Date('2026-07-24T12:00:00Z'));
    expect(resumo.volumeKg).toBe(740);
    expect(resumo.series).toEqual({ done: 2, total: 3 });
  });

  it('peso corporal e cardio contam série, mas nunca inventam volume', () => {
    const draft = draftBase(
      [
        exercicioBase('Flexão', [setBase(1, { status: 'done', actualReps: 15 })], {
          isBodyweight: true,
        }),
        exercicioBase('Corrida', [
          setBase(1, { status: 'done', actualDurationSeconds: 900 }),
        ], { metric: 'tempo_distancia' } as Partial<DraftExercise>),
      ],
      null,
    );

    const resumo = montarResumoSessao(draft, new Date());
    expect(resumo.volumeKg).toBe(0);
    expect(resumo.series).toEqual({ done: 2, total: 2 });
  });

  it('duração é o TEMPO EFETIVO (soma dos intervalos reais); sem início válido é null (nunca 0 ou NaN)', () => {
    // Linha do tempo real: 4 séries concluídas a cada 10 min a partir de
    // 11:13, última 11:53, "agora" 12:00:30 → 10+10+10+10+8 = 48 min efetivos.
    const base = '2026-07-24T11:13:00.000Z';
    const comInicio = draftBase(
      [
        exercicioBase('Supino', [
          setBase(1, { status: 'done', actualReps: 10, actualLoadKg: 40, completedAt: '2026-07-24T11:23:00.000Z' }),
          setBase(2, { status: 'done', actualReps: 8, actualLoadKg: 40, completedAt: '2026-07-24T11:33:00.000Z' }),
          setBase(3, { status: 'done', actualReps: 10, actualLoadKg: 40, completedAt: '2026-07-24T11:43:00.000Z' }),
          setBase(4, { status: 'done', actualReps: 8, actualLoadKg: 40, completedAt: '2026-07-24T11:53:00.000Z' }),
        ]),
      ],
      base,
    );
    const resumo = montarResumoSessao(comInicio, new Date('2026-07-24T12:00:30.000Z'));
    expect(resumo.duracaoMin).toBe(48);

    const semInicio = montarResumoSessao(
      draftBase([exercicioBase('Supino', [setBase(1)])], null),
      new Date(),
    );
    expect(semInicio.duracaoMin).toBeNull();

    const inicioInvalido = montarResumoSessao(
      draftBase([exercicioBase('Supino', [setBase(1)])], 'não-é-data'),
      new Date(),
    );
    expect(inicioInvalido.duracaoMin).toBeNull();
  });

  it('exercício cortado pelo replanejamento fica fora do total de séries', () => {
    const draft = draftBase(
      [
        exercicioBase('Supino', [setBase(1, { status: 'done', actualReps: 10, actualLoadKg: 40 })]),
        exercicioBase('Crucifixo', [setBase(1)], { cutByReplan: true }),
      ],
      null,
    );

    const resumo = montarResumoSessao(draft, new Date());
    expect(resumo.series.total).toBe(1);
  });
});

describe('Fase 3 — ajustarDescanso (±30s sem estados impossíveis)', () => {
  it('+30s estende o restante e o total acompanha quando ultrapassa', () => {
    expect(ajustarDescanso(80, 90, +30)).toEqual({ remaining: 110, total: 110 });
    expect(ajustarDescanso(20, 90, +30)).toEqual({ remaining: 50, total: 90 });
  });

  it('−30s nunca derruba abaixo de 1s (zero dispararia o auto-avanço na hora)', () => {
    expect(ajustarDescanso(20, 90, -30)).toEqual({ remaining: 1, total: 90 });
    expect(ajustarDescanso(75, 90, -30)).toEqual({ remaining: 45, total: 90 });
  });
});

describe('Fase 3 — check-in de foco mantém o contrato do sheet', () => {
  it('renderiza como tela de foco (sem Modal) e some quando visible=false', () => {
    const { queryByTestId, rerender } = render(
      <CheckInSheet visible sessionTitle="Push A" onConfirm={jest.fn()} />,
    );
    expect(queryByTestId('checkin-foco')).toBeTruthy();

    rerender(<CheckInSheet visible={false} sessionTitle="Push A" onConfirm={jest.fn()} />);
    expect(queryByTestId('checkin-foco')).toBeNull();
  });

  it('o gate das duas respostas continua de pé na tela de foco', () => {
    const onConfirm = jest.fn();
    const { getByLabelText } = render(
      <CheckInSheet visible sessionTitle="Push A" onConfirm={onConfirm} />,
    );

    fireEvent.press(getByLabelText('Começar treino'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Com energia'));
    fireEvent.press(getByLabelText('Tempo cheio'));
    fireEvent.press(getByLabelText('Começar treino'));
    expect(onConfirm).toHaveBeenCalledWith({ mood: 'com_energia', availableMinutes: null });
  });
});
