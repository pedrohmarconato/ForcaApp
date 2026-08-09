// src/services/cardioPrescritoRepository.ts
// REQ-02 (D-02/CONTEXT.md): leitura da prescrição de cardio da semana
// corrente, direto de `planned_sets` do plano ATIVO do usuário — nenhuma
// tabela paralela, nenhuma migration.
//
// Mesma disciplina do resto do repositório: erro do banco SEMPRE propaga
// (`if (error) throw error;`), a query nunca confia só na RLS (T-02-01: filtro
// explícito de `user_id`/`plan_id` no client é defesa em profundidade além da
// RLS "own sessions"/"own exercises"/"own sets"), e sem plano ativo a função
// devolve a prescrição vazia sem sequer consultar `planned_sessions` — mesmo
// padrão de `getUpcomingSessions`/`getTodaySession` em `trainingRepository.ts`.

import { supabase } from '../config/supabaseClient';
import { toNum } from '../engine/sessionModel';
import { inicioDaSemana } from '../utils/weekSummary';
import { getActivePlanId } from './trainingRepository';
import {
  somarPrescricaoSemana,
  type PlannedCardioSet,
  type PrescricaoCardio,
} from '../engine/cardioPrescrito';

const PRESCRICAO_VAZIA: PrescricaoCardio = { distanciaM: null, duracaoSegundos: null, sessoes: 0 };

/** Data local (YYYY-MM-DD) para comparar com `scheduled_date`, que é `date` no Postgres. */
const dataISO = (d: Date): string => {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

/**
 * Prescrição de cardio (soma de distância/duração + sessões) da semana que
 * contém `referencia`, lida do plano ATIVO do usuário.
 *
 * O corte de semana usa `scheduled_date` (NÃO `week_number`) — mesmo
 * raciocínio de `getUpcomingSessions`: `week_number` faria a aba Progresso
 * discordar de si mesma quando a semana do calendário e a semana do plano
 * não coincidem (ex.: sessão adiada por replanejamento).
 */
export const getPrescricaoSemanaCorrente = async (
  userId: string,
  referencia: Date = new Date(),
): Promise<PrescricaoCardio> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return PRESCRICAO_VAZIA;

  const inicio = inicioDaSemana(referencia);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);

  const { data, error } = await supabase
    .from('planned_sessions')
    .select(
      'id, scheduled_date, planned_exercises!inner(muscle_group, planned_sets!inner(target_distance_m, target_duration_seconds))',
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .gte('scheduled_date', dataISO(inicio))
    .lt('scheduled_date', dataISO(fim))
    .eq('planned_exercises.muscle_group', 'Cardio');
  if (error) throw error;

  const sets: PlannedCardioSet[] = [];
  for (const sessao of (data ?? []) as any[]) {
    const sessionKey: string = sessao?.scheduled_date ?? sessao?.id ?? '';
    for (const exercicio of sessao?.planned_exercises ?? []) {
      // Defesa local além do filtro PostgREST: uma resposta deformada (mock,
      // cache) não transforma outro grupo muscular em cardio — mesmo padrão
      // de `getCardioLogs` em `cardioGoalRepository.ts`.
      if (exercicio?.muscle_group !== 'Cardio') continue;
      for (const s of exercicio?.planned_sets ?? []) {
        sets.push({
          targetDistanceM: toNum(s.target_distance_m),
          targetDurationSeconds: toNum(s.target_duration_seconds),
          sessionKey,
        });
      }
    }
  }

  return somarPrescricaoSemana(sets);
};
