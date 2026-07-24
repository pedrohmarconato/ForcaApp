// src/engine/sessionFlow.ts
// Onde o aluno está DENTRO do treino, não dentro da série.
//
// Lacuna que isto fecha (relatada pelo dono em 24/07/2026): o player trocava de
// exercício sem avisar. Como o card tem sempre a mesma forma, terminar a última
// série do supino e cair na primeira da remada parecia "mais uma série" — o
// aluno só percebia lendo o nome. Estas funções são puras para que a UI possa
// dizer "exercício 3 de 7" e "supino concluído" sem inventar estado.

import type { SessionDraft, DraftExercise } from './sessionModel';

/** Exercícios que ainda contam no treino (os cortados pelo replan saem). */
export const exerciciosEmJogo = (draft: SessionDraft): DraftExercise[] =>
  draft.exercises.filter((ex) => !ex.cutByReplan);

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
 * O exercício está inteiro registrado? É o que troca o texto do descanso de
 * "série registrada" para "<exercício> concluído" — o aviso só é honesto
 * quando não sobra nada a fazer nele. Avaliado sobre o rascunho JÁ atualizado
 * por `completeSet`, então não depende da ordem em que as séries foram feitas.
 */
export const exercicioConcluido = (exercise: DraftExercise): boolean =>
  exercise.sets.length > 0 && exercise.sets.every((s) => s.status === 'done');
