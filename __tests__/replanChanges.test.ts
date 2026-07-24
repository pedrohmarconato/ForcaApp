// __tests__/replanChanges.test.ts
// O contrato da tradução "proposta do motor → mudanças legíveis".
// Modo de falha que motivou o módulo: o banner mostrava deltas soltos
// ("+2 séries em Treino D") sem o resultado ("12 → 15"), e devolvia o enum do
// motor ao aluno ("deload não compensa", "perda registrada").

import {
  MOTIVO_DA_PERDA,
  diaDaSemana,
  montarMudancas,
  resumoDasMudancas,
  rotuloDaSessao,
  seriesDaSessao,
} from '../src/engine/replanChanges';
import type {
  ReplanSession,
  WeeklyReplanProposal,
} from '../src/engine/weeklyReplanner';

const sessao = (
  id: string,
  title: string,
  data: string | null,
  seriesPorExercicio: number[],
): ReplanSession =>
  ({
    id,
    weekNumber: 1,
    title,
    sessionType: null,
    scheduledDate: data,
    status: 'pending',
    estimatedMinutes: 52,
    exercises: seriesPorExercicio.map((qtd, i) => ({
      id: `${id}-ex-${i}`,
      name: `Exercício ${i}`,
      muscleGroup: 'peito',
      priority: 'primary' as const,
      exerciseOrder: i,
      sets: Array.from({ length: qtd }, (_, j) => ({ id: `${id}-s-${i}-${j}`, setOrder: j + 1 })),
    })),
  }) as ReplanSession;

const proposta = (over: Partial<WeeklyReplanProposal>): WeeklyReplanProposal =>
  ({
    adherence: {
      sessionsDue: 2,
      sessionsCompleted: 0,
      sessionRate: 0,
      setsDue: 12,
      setsCompleted: 0,
      volumeRate: 0,
    },
    timeCut: null,
    redistribution: null,
    hasChanges: true,
    ...over,
  }) as WeeklyReplanProposal;

describe('rótulo de sessão', () => {
  it('usa o dia da semana em pt-BR, lido como data de calendário', () => {
    // 2026-07-18 é um sábado.
    expect(diaDaSemana('2026-07-18')).toBe('sáb');
    expect(rotuloDaSessao(sessao('a', 'Treino B', '2026-07-18', [3]))).toBe('Treino B · sáb');
  });

  it('cai para o título puro quando a sessão não tem data', () => {
    expect(rotuloDaSessao(sessao('a', 'Treino B', null, [3]))).toBe('Treino B');
    expect(diaDaSemana(null)).toBeNull();
    expect(diaDaSemana('data-invalida')).toBeNull();
  });

  it('conta as séries planejadas da sessão', () => {
    expect(seriesDaSessao(sessao('a', 'T', null, [3, 4, 5]))).toBe(12);
  });
});

describe('montagem das mudanças', () => {
  const sessions = [
    sessao('s1', 'Treino B', '2026-07-15', [3, 3, 3, 3]), // 12 séries, quarta
    sessao('s2', 'Treino D', '2026-07-17', [4, 4, 4]), // 12 séries, sexta
  ];

  it('a sessão que recebe volume mostra antes → depois, não o delta solto', () => {
    const mudancas = montarMudancas({
      proposal: proposta({
        redistribution: {
          kind: 'missed_redistribution',
          missedSessionIds: ['s1'],
          additions: [
            { targetSessionId: 's2', exerciseId: 'e1', exerciseName: 'Supino', muscleGroup: 'peito', addSets: 2 },
            { targetSessionId: 's2', exerciseId: 'e2', exerciseName: 'Remada', muscleGroup: 'costas', addSets: 1 },
          ],
          losses: [],
        },
      }),
      sessions,
    });

    const reforco = mudancas.find((m) => m.tipo === 'sessao_reforcada');
    expect(reforco).toMatchObject({
      rotulo: 'Treino D · sex',
      seriesAntes: 12,
      seriesDepois: 15,
      adicionadas: 3,
      porGrupo: [
        { grupo: 'peito', sets: 2 },
        { grupo: 'costas', sets: 1 },
      ],
    });
  });

  it('soma adições do mesmo grupo na mesma sessão em uma linha', () => {
    const mudancas = montarMudancas({
      proposal: proposta({
        redistribution: {
          kind: 'missed_redistribution',
          missedSessionIds: [],
          additions: [
            { targetSessionId: 's2', exerciseId: 'e1', exerciseName: 'Supino', muscleGroup: 'peito', addSets: 2 },
            { targetSessionId: 's2', exerciseId: 'e2', exerciseName: 'Crucifixo', muscleGroup: 'peito', addSets: 2 },
          ],
          losses: [],
        },
      }),
      sessions,
    });

    const reforco = mudancas.find((m) => m.tipo === 'sessao_reforcada');
    expect(reforco).toMatchObject({ porGrupo: [{ grupo: 'peito', sets: 4 }], adicionadas: 4 });
  });

  it('a sessão pulada diz quanto volume some com ela', () => {
    const mudancas = montarMudancas({
      proposal: proposta({
        redistribution: {
          kind: 'missed_redistribution',
          missedSessionIds: ['s1'],
          additions: [],
          losses: [],
        },
      }),
      sessions,
    });

    expect(mudancas[0]).toMatchObject({
      tipo: 'sessao_pulada',
      rotulo: 'Treino B · qua',
      seriesQuePerdeu: 12,
    });
  });

  it('traduz o motivo da perda e agrupa por grupo+motivo', () => {
    const mudancas = montarMudancas({
      proposal: proposta({
        redistribution: {
          kind: 'missed_redistribution',
          missedSessionIds: [],
          additions: [],
          losses: [
            { missedSessionId: 's1', muscleGroup: 'perna', sets: 2, reason: 'nao_coube' },
            { missedSessionId: 's1', muscleGroup: 'perna', sets: 1, reason: 'nao_coube' },
            { missedSessionId: 's1', muscleGroup: 'ombro', sets: 2, reason: 'deload_nao_compensa' },
          ],
        },
      }),
      sessions,
    });

    const perdas = mudancas.filter((m) => m.tipo === 'sem_espaco');
    expect(perdas).toHaveLength(2);
    expect(perdas[0]).toMatchObject({
      grupo: 'perna',
      sets: 3,
      motivo: 'não cabe no que sobrou da semana',
    });
    // Nada de enum cru chegando ao aluno.
    for (const motivo of Object.values(MOTIVO_DA_PERDA)) {
      expect(motivo).not.toMatch(/_/);
    }
  });

  it('o corte de tempo vira minutos antes → depois com o que sai', () => {
    const mudancas = montarMudancas({
      proposal: proposta({
        timeCut: {
          kind: 'time_cut',
          sessionId: 's2',
          availableMinutes: 35,
          estimatedMinutes: 52,
          ratio: 0.67,
          keptPriorities: ['primary'],
          cutExercises: [
            { exerciseId: 'e9', name: 'Rosca Martelo', priority: 'accessory', muscleGroup: 'bíceps', setsCut: 3 },
          ],
        },
      }),
      sessions,
    });

    expect(mudancas[0]).toMatchObject({
      tipo: 'corte_de_tempo',
      minutosAntes: 52,
      minutosDepois: 35,
      mantem: 'Mantém só os principais',
      cortados: [{ nome: 'Rosca Martelo', sets: 3 }],
    });
  });

  it('resume a quantidade sem inventar plural', () => {
    expect(resumoDasMudancas([])).toBe('Nada muda na sua semana');
    expect(resumoDasMudancas([{ tipo: 'sem_espaco' } as never])).toBe('1 mudança na sua semana');
    expect(resumoDasMudancas([{} as never, {} as never])).toBe('2 mudanças na sua semana');
  });
});
