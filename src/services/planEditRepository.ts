// src/services/planEditRepository.ts
// Escrita de EDIÇÃO do plano persistido (reordenação pós-criação).
// O trainingRepository segue read-only por contrato; toda mutação de ordem
// passa por RPC transacional (migrations 0016/0017) — nunca UPDATE parcial
// via PostgREST, porque permuta pela metade deixaria estado corrompido
// indistinguível de estado válido (não há unique em exercise_order nem
// em scheduled_date).
//
// Limitação consciente: training_plans.raw_plan NÃO é atualizado aqui. O
// round-trip do editor manual (backend, manual_plan_builder) continua lendo a
// ordem original do raw_plan; salvar por lá recria o plano com a ordem antiga.

import { supabase } from '../config/supabaseClient';

export type EscopoReordenacao = 'semana' | 'futuras';

export type SemanaPulada = { weekNumber: number; reason: string };

export type ResultadoReordenacaoSemana = {
  appliedWeeks: number[];
  skippedWeeks: SemanaPulada[];
};

/** Erro de edição do plano com o errcode do Postgres preservado.
 *  '40001' = a lista enviada divergiu do estado vivo — recarregar e refazer. */
export class PlanEditError extends Error {
  code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'PlanEditError';
    this.code = code;
  }
}

/** Erros em que RETRY jamais funciona — o estado mudou fora desta tela:
 *  40001 lista divergente · 55000 sessão deixou de ser pendente ·
 *  42501 sessão/plano sumiu ou foi arquivado. O tratamento certo é descartar
 *  o rascunho e recarregar, nunca "verifique a conexão e tente novamente". */
export const isPlanoDesatualizado = (err: unknown): boolean =>
  err instanceof PlanEditError && ['40001', '55000', '42501'].includes(err.code ?? '');

/** Lista de IDs precisa ter 2+ itens, todos preenchidos e sem repetição —
 *  qualquer coisa fora disso é bug de chamada, falha antes de tocar a rede. */
const validarLista = (ids: string[], rotulo: string): void => {
  if (!Array.isArray(ids) || ids.length < 2) {
    throw new PlanEditError(`Reordenação de ${rotulo} exige ao menos 2 itens.`);
  }
  if (ids.some((id) => !id)) {
    throw new PlanEditError(`Lista de ${rotulo} contém ID vazio.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new PlanEditError(`Lista de ${rotulo} contém ID duplicado.`);
  }
};

const chamarRpc = async (fn: string, params: Record<string, unknown>): Promise<unknown> => {
  let response: any;
  try {
    response = await supabase.rpc(fn, params);
  } catch (error) {
    throw new PlanEditError(
      error instanceof Error ? error.message : 'Falha de rede ao salvar a nova ordem.',
    );
  }
  const { data, error } = response ?? {};
  if (error) {
    throw new PlanEditError(
      typeof error.message === 'string' ? error.message : 'Falha ao salvar a nova ordem.',
      typeof error.code === 'string' ? error.code : null,
    );
  }
  return data;
};

/**
 * Reordena TODOS os exercícios de uma sessão pendente. `orderedExerciseIds`
 * precisa ser o conjunto exato dos exercícios da sessão, na nova ordem — a RPC
 * valida contra o estado vivo e falha com 40001 se divergir.
 */
export const reordenarExercicios = async (
  sessionId: string,
  orderedExerciseIds: string[],
): Promise<void> => {
  validarLista(orderedExerciseIds, 'exercícios');
  await chamarRpc('reorder_planned_exercises', {
    p_session_id: sessionId,
    p_exercise_ids: orderedExerciseIds,
  });
};

/**
 * Reordena os treinos PENDENTES de uma semana permutando as datas entre eles
 * (fila real). `orderedSessionIds` é só o subconjunto pendente, na nova ordem.
 * Com escopo 'futuras', o servidor propaga o padrão (casado por título) às
 * semanas seguintes elegíveis e reporta as que ficaram de fora.
 */
export const reordenarSessoesDaSemana = async (params: {
  planId: string;
  weekNumber: number;
  orderedSessionIds: string[];
  escopo: EscopoReordenacao;
}): Promise<ResultadoReordenacaoSemana> => {
  validarLista(params.orderedSessionIds, 'treinos');
  const data = (await chamarRpc('reorder_week_sessions', {
    p_plan_id: params.planId,
    p_week_number: params.weekNumber,
    p_session_ids: params.orderedSessionIds,
    p_apply_future: params.escopo === 'futuras',
  })) as {
    applied_weeks?: unknown;
    skipped_weeks?: { week?: unknown; reason?: unknown }[];
  } | null;

  const appliedWeeks = Array.isArray(data?.applied_weeks)
    ? data!.applied_weeks!.filter((w: unknown): w is number => typeof w === 'number')
    : [];
  const skippedWeeks = Array.isArray(data?.skipped_weeks)
    ? data!.skipped_weeks!
        .filter((s) => typeof s?.week === 'number')
        .map((s) => ({ weekNumber: s.week as number, reason: String(s.reason ?? '') }))
    : [];
  return { appliedWeeks, skippedWeeks };
};
