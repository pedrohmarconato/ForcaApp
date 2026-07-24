// src/engine/sessionModel.ts
// Fase 4 — Modelo PURO da sessão em execução (sem I/O, testável offline).
// Só transforma dados e calcula o outcome; QUEM decide o que fazer com o desvio
// (subir/baixar carga) é a Fase 5. Aqui nada é inventado: sem carga conhecida,
// devolvemos null e a tela pergunta ao aluno.

import type { SessionDetail } from '../services/trainingRepository';

export type Outcome = 'on_target' | 'under' | 'over';

export type SetStatus = 'pending' | 'active' | 'done';

export type DraftSet = {
  plannedSetId: string;
  setOrder: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetLoadKg: number | null;
  targetRir: number | null;
  actualReps: number | null;
  actualLoadKg: number | null;
  actualRir: number | null;
  status: SetStatus;
  outcome: Outcome | null;
  // id do set_log no servidor; preenchido após gravar com sucesso.
  // Guarda contra gravação dupla ao retomar uma sessão.
  setLogId: string | null;
  // Decisão de adaptação registrada nesta série (Fase 5). Null até o aluno decidir.
  // Tipo importado só como tipo (sem ciclo em runtime — sessionModel não importa o motor).
  adaptation: import('./intraSessionAdaptation').Adjustment | null;
  // Momento em que o aluno ativou a série (lacuna 2: tempo real por série).
  // Null enquanto pendente; ISO string ao ativar. Opcional: rascunhos e fixtures
  // anteriores à 0012 não têm o campo (default null na leitura).
  activatedAt?: string | null;
};

export type DraftExercise = {
  exerciseId: string;
  name: string;
  order: number;
  // Chave canônica do catálogo (planned_exercises.exercise_key). Null em planos
  // gerados antes do catálogo — aí a identidade cai no nome normalizado.
  exerciseKey?: string | null;
  equipment: string | null;
  isBodyweight: boolean;
  // Há alguma flag de lesão? Guardrail da Fase 5: nunca sugere subir carga (F5).
  hasInjury: boolean;
  // Cortado pela escada de tempo confirmada (Fase 6). Séries pendentes dele não
  // contam no progresso/conclusão; as já feitas permanecem no histórico.
  cutByReplan?: boolean;
  loadIncrementKg: number;
  restSeconds: number | null;
  priority: 'primary' | 'secondary' | 'accessory';
  targetRmPercent: number | null;
  repsRaw: string | null;
  sets: DraftSet[];
};

export type SessionDraft = {
  version: 1;
  plannedSessionId: string;
  sessionLogId: string | null;
  userId: string;
  title: string;
  weekNumber: number;
  startedAt: string | null;
  status: 'active' | 'finished';
  exercises: DraftExercise[];
  // Última carga conhecida por exercício (identidade → kg). Semeada do histórico
  // no início e atualizada a cada série concluída na sessão. A identidade é a
  // chave do catálogo quando existe — antes disso era o nome, e "Supino com
  // Halteres (Deload)" perdia o histórico de "Supino com Halteres".
  lastLoadByExercise: Record<string, number>;
};

/**
 * Identidade de um exercício para casar histórico entre sessões.
 * Chave do catálogo quando existe; senão o nome normalizado (planos legados).
 */
export const exerciseIdentity = (ex: {
  exerciseKey?: string | null;
  name: string;
}): string => (ex.exerciseKey ? `k:${ex.exerciseKey}` : normalizeName(ex.name));

/**
 * Compara reps realizadas com a faixa-alvo.
 * Abaixo do mínimo = under; acima do máximo = over; dentro (inclusive) = on_target.
 */
export const computeOutcome = (
  actualReps: number,
  targetRepsMin: number,
  targetRepsMax: number,
): Outcome => {
  if (actualReps < targetRepsMin) return 'under';
  if (actualReps > targetRepsMax) return 'over';
  return 'on_target';
};

/**
 * Coerção de coluna `numeric` do PostgREST para number. O PostgREST serializa
 * numeric como STRING (para preservar precisão): sem isso, "50" + incremento vira
 * concatenação ("502.5") ou NaN no stepper. Devolve null se não for número finito.
 */
export const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normaliza texto: sem acento, minúsculo, hífens/underscores viram espaço. */
export const normalizeName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Tokens que caracterizam exercício sem carga externa (peso do corpo).
const BODYWEIGHT_TOKENS = [
  'peso corporal',
  'peso do corpo',
  'corporal',
  'bodyweight',
  'body weight',
  'calistenia',
  'sem carga',
  'sem equipamento',
  'nenhum',
];

/**
 * Exercício de peso corporal? Depende do EQUIPAMENTO declarado (peso-corporal),
 * não de a carga-alvo estar nula — um exercício com barra também nasce sem kg.
 */
export const isBodyweightEquipment = (equipment: string | null | undefined): boolean => {
  if (!equipment) return false;
  const n = normalizeName(equipment);
  return BODYWEIGHT_TOKENS.some((t) => n === t || n.includes(t));
};

/**
 * Carga sugerida para uma série. NUNCA inventa: sem nenhuma fonte, devolve null
 * e a tela pede ao aluno. Precedência:
 *  1. carga já digitada pelo aluno nesta série;
 *  2. carga-alvo do plano (target_load_kg), quando existir;
 *  3. última carga conhecida do exercício (histórico ou série anterior da sessão).
 */
export const suggestLoad = (params: {
  actualLoadKg: number | null;
  targetLoadKg: number | null;
  lastLoad: number | null | undefined;
}): number | null => {
  if (params.actualLoadKg != null) return params.actualLoadKg;
  if (params.targetLoadKg != null) return params.targetLoadKg;
  if (params.lastLoad != null) return params.lastLoad;
  return null;
};

/** Arredonda a 2 casas para não acumular ruído de ponto flutuante nos steps. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Um passo do stepper de carga. Parte da carga atual (ou da sugestão, ou 0),
 * soma/subtrai o incremento do exercício e nunca desce abaixo de 0.
 */
export const stepLoad = (
  current: number | null,
  incrementKg: number,
  direction: 1 | -1,
  fallback: number | null = null,
): number => {
  const base = current ?? fallback ?? 0;
  return round2(Math.max(0, base + direction * incrementKg));
};

/**
 * Uma série pode ser concluída? Exige reps informadas (>= 0). Para exercício com
 * carga, exige também carga informada (> 0) — é aqui que a "primeira carga sem
 * histórico" barra a conclusão até o aluno informar. Bodyweight ignora a carga.
 */
export const canCompleteSet = (
  set: Pick<DraftSet, 'actualReps' | 'actualLoadKg'>,
  isBodyweight: boolean,
): boolean => {
  if (set.actualReps == null || set.actualReps < 0) return false;
  if (isBodyweight) return true;
  return set.actualLoadKg != null && set.actualLoadKg > 0;
};

/**
 * Monta o rascunho da sessão a partir do detalhe lido do plano (Fase 3).
 * `lastLoadSeed` traz a última carga por nome de exercício vinda do histórico —
 * usada como sugestão inicial (sem inventar).
 */
export const buildDraftFromDetail = (
  detail: SessionDetail,
  userId: string,
  lastLoadSeed: Record<string, number> = {},
): SessionDraft => {
  const exercises: DraftExercise[] = (detail.planned_exercises ?? []).map((ex) => ({
    exerciseId: ex.id,
    name: ex.name,
    order: ex.exercise_order,
    exerciseKey: ex.exercise_key ?? null,
    equipment: ex.equipment,
    isBodyweight: isBodyweightEquipment(ex.equipment),
    hasInjury: (ex.injury_flags ?? []).length > 0,
    // numeric do PostgREST pode vir como string → coage (F4 do review).
    loadIncrementKg: toNum(ex.load_increment_kg) ?? 2.5,
    restSeconds: ex.rest_seconds,
    priority: ex.priority,
    targetRmPercent: toNum(ex.target_rm_percent),
    repsRaw: ex.reps_raw,
    sets: (ex.planned_sets ?? []).map((s) => ({
      plannedSetId: s.id,
      setOrder: s.set_order,
      targetRepsMin: s.target_reps_min,
      targetRepsMax: s.target_reps_max,
      targetLoadKg: toNum(s.target_load_kg),
      targetRir: s.target_rir,
      actualReps: null,
      actualLoadKg: null,
      actualRir: null,
      status: 'pending',
      outcome: null,
      setLogId: null,
      adaptation: null,
      activatedAt: null,
    })),
  }));

  return {
    version: 1,
    plannedSessionId: detail.id,
    sessionLogId: null,
    userId,
    title: detail.title,
    weekNumber: detail.week_number,
    startedAt: null,
    status: 'active',
    exercises,
    lastLoadByExercise: { ...lastLoadSeed },
  };
};

/**
 * Sanitiza os campos numéricos de um rascunho PERSISTIDO (F8). Um rascunho gravado
 * por versão antiga do app — ou vindo de numeric-string do PostgREST antes da coerção —
 * pode ter "40" em vez de 40. No stepper, `"40" + incremento` vira "402.5" (concatena)
 * ou NaN. Reforçamos a coerção na fronteira de LEITURA, sem confiar em quem gravou.
 * Os campos que alimentam aritmética (carga/incremento) são os críticos; coagimos
 * todos por robustez. Mantém `null` como `null`.
 */
export const coerceDraftNumerics = (draft: SessionDraft): SessionDraft => ({
  ...draft,
  weekNumber: toNum(draft.weekNumber) ?? 0,
  // O mapa de última carga também alimenta a sugestão/stepper — um "40" legado aqui
  // contaminaria do mesmo jeito. Coage os valores (descarta os que não são número).
  lastLoadByExercise: Object.fromEntries(
    Object.entries(draft.lastLoadByExercise ?? {}).flatMap(([k, v]) => {
      const n = toNum(v);
      return n == null ? [] : [[k, n] as [string, number]];
    }),
  ),
  exercises: (draft.exercises ?? []).map((ex) => ({
    ...ex,
    // Rascunho anterior à Fase 6 não tem o campo → default seguro (não cortado).
    cutByReplan: ex.cutByReplan === true,
    order: toNum(ex.order) ?? 0,
    loadIncrementKg: toNum(ex.loadIncrementKg) ?? 2.5,
    restSeconds: ex.restSeconds == null ? null : toNum(ex.restSeconds),
    targetRmPercent: ex.targetRmPercent == null ? null : toNum(ex.targetRmPercent),
    sets: (ex.sets ?? []).map((s) => ({
      ...s,
      setOrder: toNum(s.setOrder) ?? 0,
      targetRepsMin: toNum(s.targetRepsMin) ?? 0,
      targetRepsMax: toNum(s.targetRepsMax) ?? 0,
      targetLoadKg: s.targetLoadKg == null ? null : toNum(s.targetLoadKg),
      targetRir: s.targetRir == null ? null : toNum(s.targetRir),
      actualReps: s.actualReps == null ? null : toNum(s.actualReps),
      actualLoadKg: s.actualLoadKg == null ? null : toNum(s.actualLoadKg),
      actualRir: s.actualRir == null ? null : toNum(s.actualRir),
      // Rascunho de versão anterior à Fase 5 não tem o campo → default seguro.
      adaptation: s.adaptation ?? null,
      activatedAt: s.activatedAt ?? null,
    })),
  })),
});

/**
 * Reconcilia o flag de lesão de um rascunho contra o SessionDetail AUTORITATIVO.
 * Um rascunho persistido antes da Fase 5 não tem `hasInjury` (fica undefined) e, se
 * adotado direto na retomada offline, DESLIGA silenciosamente o guardrail de lesão.
 * Aqui o `hasInjury` é sempre re-derivado de `injury_flags` do plano — ausência no
 * rascunho NUNCA é lida como "sem lesão".
 */
export const reconcileInjuryFlags = (
  draft: SessionDraft,
  detail: SessionDetail,
): SessionDraft => {
  const byId = new Map(detail.planned_exercises.map((e) => [e.id, e]));
  return {
    ...draft,
    exercises: draft.exercises.map((ex) => {
      const d = byId.get(ex.exerciseId);
      // No plano → autoritativo. Fora do plano (não deveria ocorrer) → preserva o que houver.
      return {
        ...ex,
        hasInjury: d ? (d.injury_flags ?? []).length > 0 : ex.hasInjury === true,
      };
    }),
  };
};

/**
 * Total de séries e quantas já foram concluídas (para cabeçalho de progresso).
 * Exercício cortado pela escada de tempo (Fase 6): as séries PENDENTES dele saem
 * da conta (não seguram o "Concluir treino"); as já feitas continuam contando.
 */
export const sessionProgress = (draft: SessionDraft): { done: number; total: number } => {
  let done = 0;
  let total = 0;
  for (const ex of draft.exercises) {
    for (const s of ex.sets) {
      if (ex.cutByReplan === true && s.status !== 'done') continue;
      total += 1;
      if (s.status === 'done') done += 1;
    }
  }
  return { done, total };
};

/** Todas as séries concluídas? (para habilitar "Concluir treino"). */
export const isSessionComplete = (draft: SessionDraft): boolean => {
  const { done, total } = sessionProgress(draft);
  return total > 0 && done === total;
};
