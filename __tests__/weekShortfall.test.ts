// __tests__/weekShortfall.test.ts
// Fase 2 do COMMIT A — fechamento honesto da semana com menos volume.
//
// Semana fechada com menos volume do que o previsto (nada de treinos reencaixáveis
// no restante da semana) não é encoberto: o aluno lê quantos treinos e séries
// aconteceram e quantas séries não aconteceram. Mesma honestidade de
// weekSummary.ts — nada de número inventado: sem série devida, o déficit é null.

import type { ReplanSession, WeekAdherence } from '../src/engine/weeklyReplanner';
import { fecharSemana } from '../src/engine/weekShortfall';

const sessao = (
  id: string,
  title: string,
  scheduledDate: string | null,
  series: number
): ReplanSession => ({
  id,
  weekNumber: 1,
  title,
  sessionType: 'Treino',
  scheduledDate,
  status: 'pending',
  estimatedMinutes: 60,
  exercises: [
    {
      id: `${id}-ex`,
      name: 'Exercício A',
      muscleGroup: 'Peito',
      priority: 'primary',
      exerciseOrder: 1,
      sets: Array.from({ length: series }, (_, i) => ({
        id: `${id}-s${i}`,
        setOrder: i + 1,
      })),
    },
  ],
});

const ADERENCIA_BASE: WeekAdherence = {
  sessionsDue: 4,
  sessionsCompleted: 2,
  sessionRate: 0.5,
  setsDue: 34,
  setsCompleted: 18,
  volumeRate: 18 / 34,
};

describe('fecharSemana', () => {
  it('semana com menos volume: "2 de 4 treinos · 18 de 34 séries · 16 séries não aconteceram"', () => {
    const sessoes = [
      sessao('s-1', 'Treino A', '2026-07-13', 9),
      sessao('s-2', 'Treino B', '2026-07-15', 12),
      sessao('s-3', 'Treino C', '2026-07-17', 12),
      sessao('s-4', 'Treino D', '2026-07-19', 1),
    ];

    const fechamento = fecharSemana({
      adherence: ADERENCIA_BASE,
      sessions: sessoes,
      semEncaixe: ['s-3', 's-4'],
    });

    expect(fechamento.sessoesFeitas).toBe(2);
    expect(fechamento.sessoesPrevistas).toBe(4);
    expect(fechamento.sessoesQueNaoCabem).toBe(2);
    expect(fechamento.seriesFeitas).toBe(18);
    expect(fechamento.seriesPrevistas).toBe(34);
    expect(fechamento.seriesQueNaoAconteceram).toBe(16);
    // Rótulos que o cartão mostra: título + dia do calendário.
    expect(fechamento.rotulosSemEncaixe).toEqual(['Treino C · sex', 'Treino D · dom']);
  });

  it('sem série devida, o déficit é null — ausência de base não é zero', () => {
    const vazia: WeekAdherence = {
      sessionsDue: 0,
      sessionsCompleted: 0,
      sessionRate: null,
      setsDue: 0,
      setsCompleted: 0,
      volumeRate: null,
    };

    const fechamento = fecharSemana({ adherence: vazia, sessions: [], semEncaixe: [] });

    expect(fechamento.seriesQueNaoAconteceram).toBeNull();
    expect(fechamento.sessoesPrevistas).toBe(0);
    expect(fechamento.sessoesQueNaoCabem).toBe(0);
  });

  it('volume executado acima do previsto não vira déficit negativo — é 0', () => {
    const acima: WeekAdherence = { ...ADERENCIA_BASE, setsCompleted: 40 };

    const fechamento = fecharSemana({ adherence: acima, sessions: [], semEncaixe: [] });

    expect(fechamento.seriesQueNaoAconteceram).toBe(0);
    expect(fechamento.sessoesQueNaoCabem).toBe(0);
  });

  it('sessão sem encaixe que não está na lista de sessões cai para o próprio id', () => {
    const fechamento = fecharSemana({
      adherence: ADERENCIA_BASE,
      sessions: [sessao('s-1', 'Treino A', '2026-07-13', 9)],
      semEncaixe: ['s-9'],
    });

    expect(fechamento.rotulosSemEncaixe).toEqual(['s-9']);
  });

  it('sessão sem data agendada aparece só com o título', () => {
    const fechamento = fecharSemana({
      adherence: ADERENCIA_BASE,
      sessions: [sessao('s-1', 'Treino A', null, 9)],
      semEncaixe: ['s-1'],
    });

    expect(fechamento.rotulosSemEncaixe).toEqual(['Treino A']);
  });

  it('não muta os argumentos — é puro', () => {
    const sessoes = [sessao('s-1', 'Treino A', '2026-07-13', 9)];
    const semEncaixe = ['s-1'];
    const adherence = { ...ADERENCIA_BASE };
    Object.freeze(sessoes);
    Object.freeze(semEncaixe);
    Object.freeze(adherence);

    expect(() =>
      fecharSemana({ adherence, sessions: sessoes, semEncaixe })
    ).not.toThrow();
  });
});
