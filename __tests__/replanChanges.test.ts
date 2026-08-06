// __tests__/replanChanges.test.ts
// O contrato da tradução "proposta do motor → mudanças legíveis".
// Modo de falha que motivou o módulo: o banner mostrava deltas soltos
// ("+2 séries em Treino D") sem o resultado ("12 → 15"), e devolvia o enum do
// motor ao aluno ("deload não compensa", "perda registrada").

import {
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

    // Antes → depois em SÉRIES (12 planejadas na s2, menos as 3 cortadas). Os
    // minutos ficam como contexto: `planTimeCut` corta por prioridade e NUNCA
    // reestima a duração, então "52 → 35 min" seria um número que ninguém
    // apurou — o disponível apresentado como resultado.
    expect(mudancas[0]).toMatchObject({
      tipo: 'corte_de_tempo',
      minutosDisponiveis: 35,
      minutosEstimados: 52,
      seriesAntes: 12,
      seriesDepois: 9,
      mantem: 'Mantém só os principais',
      cortados: [{ nome: 'Rosca Martelo', sets: 3 }],
    });
  });

  it('sem a sessão de hoje no contexto, o corte não inventa contagem de séries', () => {
    const mudancas = montarMudancas({
      proposal: proposta({
        timeCut: {
          kind: 'time_cut',
          sessionId: 'desconhecida',
          availableMinutes: 35,
          estimatedMinutes: 52,
          ratio: 0.67,
          keptPriorities: ['primary'],
          cutExercises: [
            { exerciseId: 'e9', name: 'Rosca', priority: 'accessory', muscleGroup: 'bíceps', setsCut: 3 },
          ],
        },
      }),
      sessions,
    });

    expect(mudancas[0]).toMatchObject({ seriesAntes: null, seriesDepois: null });
  });

  it('resume a quantidade sem inventar plural', () => {
    expect(resumoDasMudancas([])).toBe('Nada muda na sua semana');
    expect(resumoDasMudancas([{ tipo: 'corte_de_tempo' } as never])).toBe('1 mudança na sua semana');
    expect(resumoDasMudancas([{} as never, {} as never])).toBe('2 mudanças na sua semana');
  });
});
