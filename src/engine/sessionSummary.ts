// src/engine/sessionSummary.ts
// Resumo honesto da sessão (Direção 03) e ajuste do descanso. Módulo puro.
//
// Regra que atravessa este arquivo: nenhum número inventado. Volume só soma
// série CONCLUÍDA com reps E carga reais (peso corporal e cardio contam
// série, não quilos); duração só existe com o carimbo real de início.

import { sessionProgress, type SessionDraft } from './sessionModel';

export type ResumoSessao = {
  series: { done: number; total: number };
  /** Soma de reps × carga das séries concluídas com os dois valores reais. */
  volumeKg: number;
  /** Minutos entre startedAt e o fim; null sem carimbo válido. */
  duracaoMin: number | null;
};

export const montarResumoSessao = (draft: SessionDraft, agora: Date = new Date()): ResumoSessao => {
  let volumeKg = 0;
  for (const ex of draft.exercises) {
    if (ex.isBodyweight) continue; // reps sem carga externa: sem quilos a somar
    for (const s of ex.sets) {
      if (s.status !== 'done') continue;
      if (s.actualReps == null || s.actualLoadKg == null) continue; // cardio/isometria caem aqui
      volumeKg += s.actualReps * s.actualLoadKg;
    }
  }
  // Arredonda para 1 casa: cargas .5 são comuns e 42.5×8 não pode virar dízima.
  volumeKg = Math.round(volumeKg * 10) / 10;

  let duracaoMin: number | null = null;
  if (draft.startedAt) {
    const inicio = new Date(draft.startedAt).getTime();
    const fim = agora.getTime();
    if (Number.isFinite(inicio) && fim > inicio) {
      duracaoMin = Math.max(1, Math.round((fim - inicio) / 60000));
    }
  }

  return { series: sessionProgress(draft), volumeKg, duracaoMin };
};

/**
 * ±30s do descanso. O restante nunca cai abaixo de 1s (zero dispararia o
 * auto-avanço imediato); o total acompanha quando o restante o ultrapassa,
 * para o anel nunca passar de 100%.
 */
export const ajustarDescanso = (
  remaining: number,
  total: number,
  deltaSeconds: number,
): { remaining: number; total: number } => {
  const novoRestante = Math.max(1, remaining + deltaSeconds);
  return { remaining: novoRestante, total: Math.max(total, novoRestante) };
};
