// src/engine/weekShortfall.ts
// Nível 2 da escada de reencaixe — "a semana fecha com menos volume, e isso é
// dito". Puro de propósito (sem I/O): recebe a aderência que o motor já
// calculou (weeklyReplanner) e as sessões que o reencaixe (scheduleShift) não
// conseguiu salvar, e devolve o fechamento honesto da semana.
//
// Mesma honestidade de weekSummary.ts: nada de número inventado. Sem série
// devida, `seriesQueNaoAconteceram` é null (ausência de base não é zero) e o
// déficit nunca é negativo — volume executado acima do previsto é 0, não -X.

import type { ReplanSession, WeekAdherence } from './weeklyReplanner';
import { rotuloDaSessao } from './replanChanges';

export type FechamentoDaSemana = {
  /** Sessões que deviam ter acontecido (aderência do motor). */
  sessoesPrevistas: number;
  /** Sessões concluídas entre as devidas. */
  sessoesFeitas: number;
  /** Sessões que o reencaixe não conseguiu salvar nesta semana. */
  sessoesQueNaoCabem: number;
  seriesPrevistas: number;
  seriesFeitas: number;
  /**
   * Séries planejadas que não foram executadas. null quando não há série
   * devida — sem base, sem déficit inventado.
   */
  seriesQueNaoAconteceram: number | null;
  /** Rótulos ("Treino C · sex") das sessões que não couberam na semana. */
  rotulosSemEncaixe: string[];
};

export const fecharSemana = (params: {
  adherence: WeekAdherence;
  sessions: ReplanSession[];
  /** Ids das sessões que não couberam no resto da semana (scheduleShift). */
  semEncaixe: string[];
}): FechamentoDaSemana => {
  const { adherence, sessions, semEncaixe } = params;
  const porId = new Map(sessions.map((s) => [s.id, s]));
  const rotulosSemEncaixe = semEncaixe.map((id) => {
    const s = porId.get(id);
    return s ? rotuloDaSessao(s) : id;
  });
  const naoAconteceram =
    adherence.setsDue > 0
      ? Math.max(0, adherence.setsDue - adherence.setsCompleted)
      : null;
  return {
    sessoesPrevistas: adherence.sessionsDue,
    sessoesFeitas: adherence.sessionsCompleted,
    sessoesQueNaoCabem: semEncaixe.length,
    seriesPrevistas: adherence.setsDue,
    seriesFeitas: adherence.setsCompleted,
    seriesQueNaoAconteceram: naoAconteceram,
    rotulosSemEncaixe,
  };
};
