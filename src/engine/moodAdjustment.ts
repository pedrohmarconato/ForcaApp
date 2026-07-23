// src/engine/moodAdjustment.ts
// Check-in pré-treino — modulação FORTE por humor (decisão do dono, 22/07/2026).
//
// "Cansado" vira um fator de capacidade efetiva sobre os minutos do dia e
// alimenta a MESMA escada de corte por tempo da Fase 6 (planTimeCut): nunca
// corta exercícios primários, a proposta passa pelo banner com Aplicar/Manter
// e nada é aplicado sem confirmação do aluno. Módulo puro: sem I/O, sem datas.

import { MOOD_CONFIG, type MoodConfig } from './config';

export type SessionMood = 'cansado' | 'normal' | 'com_energia';

export const SESSION_MOODS: SessionMood[] = ['cansado', 'normal', 'com_energia'];

/**
 * Minutos EFETIVOS para o cálculo de corte da sessão de hoje.
 *
 * - normal / com_energia (ou sem check-in): devolve os minutos como vieram —
 *   null significa "tempo cheio" e o replanejador não propõe corte por tempo.
 * - cansado: aplica o fator sobre a base (minutos informados; na falta deles,
 *   a estimativa da sessão). Sem NENHUMA base → null: nada é inventado.
 */
export const effectiveMinutesForMood = (params: {
  mood: SessionMood | null;
  availableMinutes: number | null;
  estimatedMinutes: number | null;
  config?: MoodConfig;
}): number | null => {
  if (params.mood !== 'cansado') return params.availableMinutes;
  const cfg = params.config ?? MOOD_CONFIG;
  const base = params.availableMinutes ?? params.estimatedMinutes;
  if (base == null || base <= 0) return params.availableMinutes;
  return Math.floor(base * cfg.tiredCapacityFactor);
};
