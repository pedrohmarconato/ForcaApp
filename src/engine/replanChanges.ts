// src/engine/replanChanges.ts
// Traduz a PROPOSTA do motor de replanejamento (weeklyReplanner) para as
// mudanças que o aluno lê na tela.
//
// COMMIT B da escada de reencaixe (jul/2026): a redistribuição pós-falta foi
// removida da proposta — o que resta a mostrar é só o corte de tempo (escada
// ~100/66/45%) da sessão de hoje. Cada mudança vira uma unidade com antes →
// depois explícito e motivo em português.
//
// Puro de propósito: a UI só desenha o que este módulo decidiu.

import type {
  ReplanSession,
  WeeklyReplanProposal,
} from './weeklyReplanner';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Dia da semana em pt-BR a partir de YYYY-MM-DD, lido como data de calendário. */
export const diaDaSemana = (isoDate: string | null): string | null => {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const i = d.getUTCDay();
  return DIAS[i] ?? null;
};

/** "Treino B · qua" — o rótulo que o aluno reconhece na agenda dele. */
export const rotuloDaSessao = (sessao: ReplanSession): string => {
  const dia = diaDaSemana(sessao.scheduledDate);
  return dia ? `${sessao.title} · ${dia}` : sessao.title;
};

/** Séries planejadas de uma sessão (é o "volume" que o cartão compara). */
export const seriesDaSessao = (sessao: ReplanSession): number =>
  sessao.exercises.reduce((total, ex) => total + ex.sets.length, 0);

/**
 * Séries que o corte de tempo remove da sessão de hoje.
 */
const seriesCortadasPorTempo = (proposal: WeeklyReplanProposal): number =>
  proposal.timeCut?.cutExercises.reduce((t, c) => t + c.setsCut, 0) ?? 0;

export type MudancaDoReplan =
  /**
   * Corte de tempo da sessão de hoje.
   *
   * O antes → depois aqui é de SÉRIES, não de minutos, porque só as séries são
   * calculadas: `planTimeCut` corta por escada de prioridade e nunca reestima a
   * duração do treino resultante. Mostrar "60 → 40 min" apresentava o tempo que
   * o aluno DISSE ter como se fosse o tempo que o treino passou a levar — um
   * número que ninguém apurou. Os minutos continuam no cartão, mas como
   * contexto ("você tem 40 dos 60 estimados"), que é o que se sabe.
   */
  | {
      tipo: 'corte_de_tempo';
      chave: string;
      minutosDisponiveis: number;
      minutosEstimados: number;
      /** null quando a sessão de hoje não veio no contexto. */
      seriesAntes: number | null;
      seriesDepois: number | null;
      mantem: string;
      cortados: { nome: string; sets: number }[];
    };

/**
 * Monta as mudanças na ordem em que fazem sentido para quem lê — hoje só o
 * corte de tempo resta na proposta.
 */
export const montarMudancas = (params: {
  proposal: WeeklyReplanProposal;
  sessions: ReplanSession[];
}): MudancaDoReplan[] => {
  const { proposal, sessions } = params;
  const porId = new Map(sessions.map((s) => [s.id, s]));
  const mudancas: MudancaDoReplan[] = [];

  if (proposal.timeCut) {
    const tc = proposal.timeCut;
    const sessaoDeHoje = porId.get(tc.sessionId);
    const antes = sessaoDeHoje ? seriesDaSessao(sessaoDeHoje) : null;
    mudancas.push({
      tipo: 'corte_de_tempo',
      chave: `tempo-${tc.sessionId}`,
      minutosDisponiveis: tc.availableMinutes,
      minutosEstimados: tc.estimatedMinutes,
      seriesAntes: antes,
      seriesDepois: antes == null ? null : antes - seriesCortadasPorTempo(proposal),
      mantem: tc.keptPriorities.includes('secondary')
        ? 'Mantém principais e secundários'
        : 'Mantém só os principais',
      cortados: tc.cutExercises.map((c) => ({ nome: c.name, sets: c.setsCut })),
    });
  }

  return mudancas;
};

/** Frase única do topo — o resumo que dispensa ler os cartões. */
export const resumoDasMudancas = (mudancas: MudancaDoReplan[]): string => {
  const n = mudancas.length;
  if (n === 0) return 'Nada muda na sua semana';
  return n === 1 ? '1 mudança na sua semana' : `${n} mudanças na sua semana`;
};
