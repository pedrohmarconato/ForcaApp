// src/engine/musclePriority.ts
// COMMIT C — Nível 3 (PRIORIDADE) da escada de reencaixe. Motor PURO (sem I/O).
//
// Dado o estado da semana, responde duas perguntas:
//  1. Quais grupos musculares ficaram SEM treino? (gruposNegligenciados)
//     "Sem treino" = escalado em alguma sessão devida (data ESTRITAMENTE
//     passada e zero séries concluídas, qualquer status) e sem UMA série
//     concluída na semana. Limiar binário: uma série já tira o grupo da lista.
//  2. Para uma sessão pendente, vale propor subir o primário do grupo para o
//     primeiro lugar REAL — logo depois do prefixo de abertura (acessórios
//     medidos por tempo)? (promoverPrimarioDoGrupo)
//
// A proposta é uma PERMUTAÇÃO exata dos ids da sessão (contrato da RPC
// reorder_planned_exercises, migration 0018): nada de volume adicional, nada
// de inventar treino — o treino é o mesmo, só muda a ordem.

import { REPLAN_CONFIG, type ReplanConfig } from './config';
import { isTimeBased, normalizeName } from './sessionModel';
import {
  isDeloadSession,
  trainsGroup,
  type ReplanExercise,
  type ReplanSession,
} from './weeklyReplanner';
import { moveItem } from './planReorder';

export type GrupoNegligenciado = {
  /** Nome do grupo como veio do plano (rótulo exibível). */
  grupo: string;
  /** Séries planejadas na semana INTEIRA para o grupo (molde, sem cortados). */
  seriesPlanejadas: number;
};

export type PropostaPrioridade = {
  /** Grupo negligenciado promovido (rótulo exibível, como veio da semana). */
  grupo: string;
  /** Exercício primário que sobe para o 1º lugar real da sessão. */
  exercicio: ReplanExercise;
  /** Demais grupos negligenciados que a sessão treina (rótulo + volume planejado da semana). */
  outrosGrupos: { grupo: string; seriesPlanejadas: number }[];
  /** Nova ordem dos exercícios: permutação EXATA dos ids da sessão. */
  ordemProposta: string[];
};

/** Dia do calendário como inteiro (dias desde a época), só a parte YYYY-MM-DD. */
const dayIndex = (isoDate: string | null): number | null => {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

/**
 * Grupos negligenciados da semana, na ordem de aparição. `seriesPlanejadas`
 * conta a semana TODA (o molde), não só as sessões devidas — é o volume que
 * desempata qual grupo a sessão pendente promove.
 *
 * `executedSetsByGroup` (grupo normalizado → séries) é a fonte EXATA do "grupo
 * treinou?"; sem ele, vale a aproximação por sessão: grupo treinou se está
 * escalado em alguma sessão com pelo menos uma série concluída. Limitação
 * consciente do COMMIT C — o contexto da semana só agrega séries por sessão.
 *
 * `cutExerciseIdsBySession` remove da conta os exercícios cortados pela escada
 * de tempo (COMMIT B): quem foi cortado não está no plano aplicado, logo não
 * conta como planejado nem vira candidato.
 *
 * `excluirSessaoId` tira uma sessão das DEVIDAS — e só delas. É a sessão aberta
 * na tela agora: ela não pode se declarar "de fora" quando vai ser treinada nos
 * próximos minutos (achado nº 5 do review do PR #67). O volume dela continua no
 * molde: `seriesPlanejadas` é a semana INTEIRA por definição, e é ele que
 * desempata qual grupo a sessão promove — removê-la da entrada inteira mudava
 * a escolha do grupo.
 */
export const gruposNegligenciados = (
  sessions: ReplanSession[],
  completedSetsBySession: Record<string, number>,
  todayISO: string,
  cutExerciseIdsBySession?: Record<string, string[]>,
  executedSetsByGroup?: Record<string, number>,
  excluirSessaoId?: string,
): GrupoNegligenciado[] => {
  const hoje = dayIndex(todayISO);
  if (hoje == null) return [];

  const cortados = new Set<string>();
  for (const ids of Object.values(cutExerciseIdsBySession ?? {})) {
    for (const id of ids) cortados.add(id);
  }

  const treinouExato = executedSetsByGroup != null;
  const treinou = (chave: string): boolean =>
    treinouExato
      ? (executedSetsByGroup![chave] ?? 0) > 0
      : sessions.some(
          (s) => (completedSetsBySession[s.id] ?? 0) > 0 && trainsGroup(s, chave),
        );

  // Volume planejado do molde da semana, por grupo (sem cortados).
  const planejado = new Map<string, { grupo: string; series: number }>();
  const acumular = (s: ReplanSession): void => {
    for (const ex of [...s.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder)) {
      if (ex.muscleGroup == null || cortados.has(ex.id)) continue;
      const chave = normalizeName(ex.muscleGroup);
      const atual = planejado.get(chave);
      if (atual) {
        atual.series += ex.sets.length;
      } else {
        planejado.set(chave, { grupo: ex.muscleGroup, series: ex.sets.length });
      }
    }
  };
  for (const s of sessions) acumular(s);

  // Sessões devidas: passadas E sem nenhuma série concluída (qualquer status),
  // EXCETO as recusadas pelo próprio aluno (skip_source 'user'): recusa é
  // decisão declarada — pode ser dor/lesão — e promover o grupo recusado ao
  // 1º lugar do treino seguinte iria contra o aluno. (O fechador por replan
  // continua contando: é falta não resolvida, não decisão.)
  const devidas = sessions.filter((s) => {
    if (excluirSessaoId != null && s.id === excluirSessaoId) return false;
    if ((completedSetsBySession[s.id] ?? 0) !== 0) return false;
    if (s.skipSource === 'user') return false;
    const dia = dayIndex(s.scheduledDate);
    return dia != null && dia < hoje;
  });

  const negligenciados: GrupoNegligenciado[] = [];
  const vistos = new Set<string>();
  for (const s of devidas) {
    for (const ex of [...s.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder)) {
      if (ex.muscleGroup == null || cortados.has(ex.id)) continue;
      const chave = normalizeName(ex.muscleGroup);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const vol = planejado.get(chave);
      if (vol && !treinou(chave)) {
        negligenciados.push({ grupo: vol.grupo, seriesPlanejadas: vol.series });
      }
    }
  }
  return negligenciados;
};

/**
 * Proposta de promover o primário do grupo negligenciado de MAIOR volume
 * planejado (empate → ordem de aparição na lista) para o fim do prefixo de
 * abertura da sessão — o 1º lugar REAL, depois do aquecimento. Devolve null
 * quando não há o que propor: deload, grupo sem primário na sessão, primário
 * já no lugar, ou nenhum grupo negligenciado treinado aqui.
 */
export const promoverPrimarioDoGrupo = (
  session: ReplanSession,
  negligenciados: GrupoNegligenciado[],
  config?: ReplanConfig,
): PropostaPrioridade | null => {
  if (isDeloadSession(session, config ?? REPLAN_CONFIG)) return null;

  let melhor: GrupoNegligenciado | null = null;
  const exercicios = [...session.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  const primarioDe = (grupo: string): ReplanExercise | null => {
    const chave = normalizeName(grupo);
    const candidatos = exercicios.filter(
      (ex) =>
        ex.priority === 'primary' &&
        ex.muscleGroup != null &&
        normalizeName(ex.muscleGroup) === chave,
    );
    return candidatos[0] ?? null;
  };
  // Melhor candidato = maior volume planejado ENTRE os que a sessão treina E
  // têm primário aqui (empate → ordem de aparição). Grupo sem primário na
  // sessão é pulado — outro candidato é tentado; um grupo de aquecimento de
  // volume alto não desliga o Nível 3 em silêncio.
  let exercicio: ReplanExercise | null = null;
  for (const n of negligenciados) {
    if (!trainsGroup(session, normalizeName(n.grupo))) continue;
    if (melhor != null && n.seriesPlanejadas <= melhor.seriesPlanejadas) continue;
    const primario = primarioDe(n.grupo);
    if (primario == null) continue;
    melhor = n;
    exercicio = primario;
  }
  if (melhor == null || exercicio == null) return null;

  const ids = exercicios.map((e) => e.id);
  const origem = ids.indexOf(exercicio.id);

  // Prefixo de abertura: do início até o primeiro exercício que não seja
  // acessório medido por tempo. O destino é o FIM desse prefixo.
  let destino = 0;
  while (
    destino < exercicios.length &&
    exercicios[destino].priority === 'accessory' &&
    isTimeBased(exercicios[destino].metric)
  ) {
    destino += 1;
  }
  if (origem === destino) return null;

  const outrosGrupos = negligenciados
    .filter((n) => n !== melhor && trainsGroup(session, normalizeName(n.grupo)))
    .map((n) => ({ grupo: n.grupo, seriesPlanejadas: n.seriesPlanejadas }));

  return {
    grupo: melhor.grupo,
    exercicio,
    outrosGrupos,
    ordemProposta: moveItem(ids, origem, destino),
  };
};
