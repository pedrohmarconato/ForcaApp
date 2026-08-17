// src/engine/sessionFlow.ts
// Onde o aluno está DENTRO do treino, não dentro da série.
//
// Lacuna que isto fecha (relatada pelo dono em 24/07/2026): o player trocava de
// exercício sem avisar. Como o card tem sempre a mesma forma, terminar a última
// série do supino e cair na primeira da remada parecia "mais uma série" — o
// aluno só percebia lendo o nome. Estas funções são puras para que a UI possa
// dizer "exercício 3 de 7" e "supino concluído" sem inventar estado.

import {
  exercicioForaDeJogo,
  isTimeBased,
  metricOf,
  type SessionDraft,
  type DraftExercise,
} from './sessionModel';

/**
 * Exercícios que ainda contam no treino. Saem os cortados pela escada de tempo
 * e os recusados pelo aluno (0020) — a mesma pergunta que o contador de
 * progresso faz, respondida pelo mesmo helper.
 */
export const exerciciosEmJogo = (draft: SessionDraft): DraftExercise[] =>
  draft.exercises.filter((ex) => !exercicioForaDeJogo(ex));

/**
 * Posição do exercício no treino, 1-based, ignorando os cortados.
 * `null` quando o exercício não está em jogo (cortado ou inexistente).
 */
export const posicaoDoExercicio = (
  draft: SessionDraft,
  exerciseId: string,
): { indice: number; total: number } | null => {
  const emJogo = exerciciosEmJogo(draft);
  const i = emJogo.findIndex((ex) => ex.exerciseId === exerciseId);
  if (i < 0) return null;
  return { indice: i + 1, total: emJogo.length };
};

/**
 * Posição do exercício dentro do bloco da mesma métrica, 1-based.
 * Blocos de tempo não devem expor a musculação no denominador do card reduzido
 * (`Alongamento 2/6`). Para exercícios de carga × repetição, a função não se
 * aplica e devolve `null`.
 */
export const posicaoNoBlocoDeMetrica = (
  draft: SessionDraft,
  exerciseId: string,
): { indice: number; total: number } | null => {
  const exercicio = draft.exercises.find((ex) => ex.exerciseId === exerciseId);
  if (!exercicio || !isTimeBased(metricOf(exercicio))) return null;

  const bloco = exerciciosEmJogo(draft).filter(
    (ex) => isTimeBased(metricOf(ex)) && metricOf(ex) === metricOf(exercicio),
  );
  const indice = bloco.findIndex((ex) => ex.exerciseId === exerciseId);
  if (indice < 0) return null;
  return { indice: indice + 1, total: bloco.length };
};

/**
 * O exercício está inteiro registrado? É o que troca o texto do descanso de
 * "série registrada" para "<exercício> concluído" — o aviso só é honesto
 * quando não sobra nada a fazer nele. Avaliado sobre o rascunho JÁ atualizado
 * por `completeSet`, então não depende da ordem em que as séries foram feitas.
 */
export const exercicioConcluido = (exercise: DraftExercise): boolean =>
  exercise.sets.length > 0 && exercise.sets.every((s) => s.status === 'done');
