// Reconstrói o rascunho editável a partir da semana 1 persistida. A função é
// pura: leitura do Supabase fica no store, e nenhum valor de progressão é
// deduzido quando o plano antigo não preservou progression_rules.

import type { CatalogMetric } from './exerciseCatalogService';
import type { PlannedExercise, SessionDetail } from './trainingRepository';
import type {
  ManualExerciseDraft,
  ManualExercisePriority,
  ManualPlanDraft,
  ManualProgression,
} from '../types/manualPlan';

export type ExistingManualPlanMetadata = {
  id: string;
  name: string;
  duration_weeks: number;
  progression_rules: unknown[] | null;
};

export type ManualPlanImportResult = {
  draft: ManualPlanDraft;
  progressionUnavailable: boolean;
  /**
   * Regras que o plano tinha e o editor NÃO consegue representar fielmente.
   *
   * O editor só sabe expressar uma regra por tipo, valendo para o plano
   * inteiro e para todos os exercícios. Regras com janela parcial, `grupo_alvo`
   * específico ou campos que o editor não lê seriam reescritas na gravação —
   * um plano da IA com "+2,5 %RM só nos primários, semanas 5–12" voltaria como
   * "+2,5 %RM em tudo, semanas 1–12" sem ninguém avisar. Aqui a diferença é
   * declarada em texto para a tela mostrar antes de salvar; nada é inferido.
   */
  progressionChanges: string[];
};

const WARMUP_KEY = 'aquecimento_articular';
const STRETCH_KEY = 'alongamento_dinamico';
// Assinatura exata do bloco que o pipeline injeta (manual_plan_builder):
// 1 série, 5 minutos, prioridade acessória. Só isso vira toggle.
const INJECTED_BLOCK_SETS = 1;
const INJECTED_BLOCK_SECONDS = 300;

/**
 * O bloco é o que o pipeline injetou — e não um exercício do próprio aluno.
 *
 * Inferir pelo `exercise_key` sozinho fazia um exercício que o aluno criou por
 * nome livre ("Aquecimento", 1 série de 10 min) desaparecer da lista editável:
 * o toggle aparecia ligado, ele não conseguia editar nem remover, e ao salvar
 * o pipeline reinjetava o bloco padrão de 5 min por cima dos 10 min dele.
 */
const isInjectedBlock = (exercise: PlannedExercise, key: string): boolean => {
  if (exercise.exercise_key !== key) return false;
  if (exercise.sets_planned !== INJECTED_BLOCK_SETS) return false;
  if (exercise.priority !== 'accessory') return false;
  const firstSet = exercise.planned_sets?.[0];
  return firstSet?.target_duration_seconds === INJECTED_BLOCK_SECONDS;
};
const VALID_METRICS = new Set<CatalogMetric>([
  'carga_reps',
  'tempo',
  'tempo_distancia',
]);

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const integer = (value: unknown): value is number =>
  finiteNumber(value) && Number.isInteger(value);

const priorityFromDatabase = (
  priority: PlannedExercise['priority'],
): ManualExercisePriority => {
  switch (priority) {
    case 'primary':
      return 'primario';
    case 'secondary':
      return 'secundario';
    case 'accessory':
    default:
      return 'acessorio';
  }
};

const metricFromExercise = (exercise: PlannedExercise): CatalogMetric =>
  VALID_METRICS.has(exercise.metric as CatalogMetric)
    ? (exercise.metric as CatalogMetric)
    : 'carga_reps';

const OFFSET_BY_DAY_LABEL: Record<string, number> = {
  segunda: 0,
  terca: 1,
  quarta: 2,
  quinta: 3,
  sexta: 4,
  sabado: 5,
  domingo: 6,
};

const normalizeDayLabel = (label: string): string =>
  label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/-feira$/, '')
    .trim();

const dayOffsetFromScheduledDate = (scheduledDate: string | null): number | null => {
  if (!scheduledDate) return null;
  const date = new Date(`${scheduledDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
};

/**
 * Dia do treino a partir do RÓTULO persistido, não da data agendada.
 *
 * `scheduled_date` da semana 1 pode estar comprimido: o mapper não agenda antes
 * de `start_date`, então um plano criado numa sexta empurra segunda e quarta da
 * primeira semana para a mesma sexta — comportamento deliberado. Derivar o dia
 * dessa data devolvia "sexta / sexta / sexta", o editor mostrava um schedule que
 * o plano não tem e o save morria em "dois treinos no mesmo dia".
 * `day_of_week` guarda o dia pretendido e é a fonte certa.
 */
const dayOffsetFromSession = (session: SessionDetail): number | null => {
  const rotulo = session.day_of_week ? normalizeDayLabel(session.day_of_week) : '';
  const offset = OFFSET_BY_DAY_LABEL[rotulo];
  if (offset != null) return offset;
  return dayOffsetFromScheduledDate(session.scheduled_date);
};

const sessionDurationFromPlan = (minutes: number | null): number | null =>
  integer(minutes) && minutes >= 15 && minutes <= 180 ? minutes : null;

const exerciseFromPlan = (exercise: PlannedExercise): ManualExerciseDraft => {
  const firstSet = exercise.planned_sets?.[0];
  const durationSeconds = firstSet?.target_duration_seconds;
  const distanceMeters = firstSet?.target_distance_m;

  return {
    exercise_key: exercise.exercise_key ?? null,
    nome: exercise.name,
    equipamento: exercise.equipment ?? null,
    metrica: metricFromExercise(exercise),
    series: exercise.sets_planned,
    repeticoes: exercise.reps_raw ?? null,
    // Segundos → minutos com 2 casas: 45 s vira 0,75 e o contrato aceita
    // (piso 0,25 min). Arredondar para 1 minuto mudaria a prescrição do plano
    // sem avisar ninguém.
    duracao_minutos: finiteNumber(durationSeconds)
      ? Math.round((durationSeconds / 60) * 100) / 100
      : null,
    distancia_km: finiteNumber(distanceMeters)
      ? Math.round((distanceMeters / 1000) * 1000) / 1000
      : null,
    tempo_descanso: exercise.rest_seconds ?? null,
    prioridade: priorityFromDatabase(exercise.priority),
    percentual_rm: exercise.target_rm_percent ?? null,
    observacoes: exercise.notes ?? null,
    tem_limitacao: (exercise.injury_flags?.length ?? 0) > 0,
  };
};

const emptyProgression = (): ManualProgression => ({
  series: null,
  cardio: null,
  intensidade: null,
  deload: null,
});

type ProgressionImport = {
  progression: ManualProgression;
  changes: string[];
};

const progressionFromRules = (
  rules: unknown[],
  durationWeeks: number,
): ProgressionImport => {
  const progression = emptyProgression();
  const changes: string[] = [];
  const registrar = (mensagem: string) => {
    if (!changes.includes(mensagem)) changes.push(mensagem);
  };
  const conferirEscopo = (rule: Record<string, unknown>, rotulo: string) => {
    const grupo = rule.grupo_alvo;
    if (typeof grupo === 'string' && grupo !== 'todos') {
      registrar(
        `A regra de ${rotulo} valia só para exercícios "${grupo}" e passará a valer para todos.`,
      );
    }
  };
  const conferirJanela = (rule: Record<string, unknown>, rotulo: string) => {
    const inicio = rule.semana_inicio;
    const fim = rule.semana_fim;
    const janelaCheia =
      (!integer(inicio) || inicio <= 2) && (!integer(fim) || fim >= durationWeeks);
    if (!janelaCheia) {
      registrar(
        `A regra de ${rotulo} valia da semana ${String(inicio)} à ${String(fim)} e passará a valer do começo ao fim do plano.`,
      );
    }
  };

  for (const rawRule of rules) {
    if (!rawRule || typeof rawRule !== 'object') {
      registrar('Havia uma regra de progressão em formato desconhecido, que não será mantida.');
      continue;
    }
    const rule = rawRule as Record<string, unknown>;
    switch (rule.tipo) {
      case 'delta_series':
        // O editor guarda a janela de séries, então aqui só o grupo pode
        // divergir. Regra sem os campos obrigatórios não é adivinhada.
        if (
          integer(rule.valor) &&
          integer(rule.semana_inicio) &&
          integer(rule.semana_fim)
        ) {
          if (progression.series) {
            registrar('Havia mais de uma regra de séries; só a última será mantida.');
          }
          conferirEscopo(rule, 'aumento de séries');
          // A janela precisa caber no plano: um plano da IA que prometia 12
          // semanas mas mapeou 4 trazia a janela 2→8, o Salvar ficava
          // habilitado e o POST voltava 400 "progressão termina depois do
          // plano" — sem que nada na tela apontasse o campo.
          const inicioSeries = Math.max(2, Math.min(rule.semana_inicio, durationWeeks));
          const fimSeries = Math.max(inicioSeries, Math.min(rule.semana_fim, durationWeeks));
          if (inicioSeries !== rule.semana_inicio || fimSeries !== rule.semana_fim) {
            registrar(
              `A janela do aumento de séries ia da semana ${rule.semana_inicio} à ${rule.semana_fim} e não cabe num plano de ${durationWeeks} semanas; passa a valer da ${inicioSeries} à ${fimSeries}.`,
            );
          }
          progression.series =
            durationWeeks >= 2
              ? {
                  ativa: true,
                  valor: rule.valor,
                  semana_inicio: inicioSeries,
                  semana_fim: fimSeries,
                }
              : null;
          if (durationWeeks < 2) {
            registrar('O plano tem só uma semana, então o aumento de séries não se aplica.');
          }
        } else {
          registrar('A regra de aumento de séries estava incompleta e não será mantida.');
        }
        break;
      case 'delta_cardio_percentual':
        if (finiteNumber(rule.valor)) {
          if (progression.cardio) {
            registrar('Havia mais de uma regra de cardio; só a última será mantida.');
          }
          conferirJanela(rule, 'progressão de cardio');
          const alvo = String(rule.alvo);
          progression.cardio = {
            ativa: true,
            valor: rule.valor,
            // `alvo` ausente equivale a "ambos" no expansor (mesmo default do
            // motor, não uma inferência nossa).
            alvo: ['duracao', 'distancia', 'ambos'].includes(alvo)
              ? (alvo as 'duracao' | 'distancia' | 'ambos')
              : 'ambos',
          };
        } else {
          registrar('A regra de progressão de cardio estava incompleta e não será mantida.');
        }
        break;
      case 'delta_rm_percentual':
        if (finiteNumber(rule.valor)) {
          if (progression.intensidade) {
            registrar('Havia mais de uma regra de intensidade; só a última será mantida.');
          }
          conferirEscopo(rule, 'intensidade (%RM)');
          conferirJanela(rule, 'intensidade (%RM)');
          progression.intensidade = { ativa: true, valor: rule.valor };
        } else {
          registrar('A regra de intensidade estava incompleta e não será mantida.');
        }
        break;
      case 'deload_percentual':
        if (integer(rule.semana)) {
          if (progression.deload) {
            registrar('Havia mais de uma semana de descarga; só a última será mantida.');
          }
          if (rule.semana > durationWeeks) {
            registrar(
              `A semana de descarga era a ${rule.semana} e o plano tem ${durationWeeks} semanas; passa a ser a ${durationWeeks}.`,
            );
          }
          progression.deload = {
            ativa: true,
            semana: Math.min(rule.semana, durationWeeks),
            // Mesmos defaults do expansor quando o molde omite os fatores.
            fator_rm: finiteNumber(rule.fator_rm) ? rule.fator_rm : 0.8,
            fator_series: finiteNumber(rule.fator_series) ? rule.fator_series : 0.8,
          };
        } else {
          registrar('A regra de descarga estava incompleta e não será mantida.');
        }
        break;
      default:
        registrar(
          `A regra "${String(rule.tipo)}" não existe no editor manual e não será mantida.`,
        );
        break;
    }
  }

  return { progression, changes };
};

export const manualDraftFromExistingPlan = (
  metadata: ExistingManualPlanMetadata,
  sessions: SessionDetail[],
): ManualPlanImportResult => {
  const weekOne = sessions
    .filter((session) => session.week_number === 1 && session.plan_id === metadata.id)
    .slice()
    .sort((a, b) => a.order_in_week - b.order_in_week);
  if (weekOne.length === 0) {
    throw new Error('A semana 1 do plano não foi encontrada.');
  }

  const progressionUnavailable = metadata.progression_rules === null;
  const importada = progressionUnavailable
    ? { progression: emptyProgression(), changes: [] }
    : progressionFromRules(metadata.progression_rules, metadata.duration_weeks);
  const progression = importada.progression;

  return {
    progressionUnavailable,
    progressionChanges: importada.changes,
    draft: {
      nome: metadata.name,
      duracao_semanas: metadata.duration_weeks,
      progressao: progression,
      treinos: weekOne.map((session) => {
        const exercises = session.planned_exercises ?? [];
        return {
          nome: session.title,
          dia_offset: dayOffsetFromSession(session),
          // O contrato manual aceita 15..180. Estimativas fora dessa faixa
          // voltam a null para o mesmo servidor recalculá-las pelo volume.
          duracao_minutos: sessionDurationFromPlan(session.estimated_minutes),
          incluir_aquecimento: exercises.some((exercise) =>
            isInjectedBlock(exercise, WARMUP_KEY),
          ),
          incluir_alongamento: exercises.some((exercise) =>
            isInjectedBlock(exercise, STRETCH_KEY),
          ),
          exercicios: exercises
            .filter(
              (exercise) =>
                !isInjectedBlock(exercise, WARMUP_KEY) &&
                !isInjectedBlock(exercise, STRETCH_KEY),
            )
            .map(exerciseFromPlan),
        };
      }),
    },
  };
};
