// src/engine/sessionFlow.ts
// Onde o aluno está DENTRO do treino, não dentro da série.
//
// Lacuna que isto fecha (relatada pelo dono em 24/07/2026): o player trocava de
// exercício sem avisar. Como o card tem sempre a mesma forma, terminar a última
// série do supino e cair na primeira da remada parecia "mais uma série" — o
// aluno só percebia lendo o nome. Estas funções são puras para que a UI possa
// dizer "exercício 3 de 7" e "supino concluído" sem inventar estado.

import type { SessionDraft, DraftExercise, DraftSet } from './sessionModel';

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

/** Séries que ainda faltam registrar neste exercício (pendentes ou ativa). */
export const seriesRestantes = (exercise: DraftExercise): number =>
  exercise.sets.filter((s) => s.status !== 'done').length;

/**
 * Esta é a última série a registrar do exercício? Usado para trocar o texto do
 * descanso de "série registrada" para "exercício concluído" — o aviso só é
 * honesto quando não sobra nada além dela.
 */
export const ehUltimaSerieDoExercicio = (
  exercise: DraftExercise,
  set: DraftSet,
): boolean =>
  exercise.sets.every((s) => s.setOrder === set.setOrder || s.status === 'done');

/** O exercício está inteiro registrado? */
export const exercicioConcluido = (exercise: DraftExercise): boolean =>
  exercise.sets.length > 0 && exercise.sets.every((s) => s.status === 'done');

/**
 * A transição que a UI precisa anunciar. Compara de onde o aluno veio com para
 * onde vai: mesma série, próxima série do mesmo exercício, ou exercício novo.
 */
export type TransicaoDoTreino =
  | { tipo: 'mesma_serie' }
  | { tipo: 'proxima_serie'; exercicio: DraftExercise }
  | {
      tipo: 'novo_exercicio';
      de: DraftExercise;
      para: DraftExercise;
      posicao: { indice: number; total: number } | null;
    };

export const classificarTransicao = (
  draft: SessionDraft,
  atual: { exercise: DraftExercise; set: DraftSet } | null,
  proxima: { exercise: DraftExercise; set: DraftSet } | null,
): TransicaoDoTreino => {
  if (!atual || !proxima) return { tipo: 'mesma_serie' };
  if (atual.exercise.exerciseId === proxima.exercise.exerciseId) {
    return { tipo: 'proxima_serie', exercicio: proxima.exercise };
  }
  return {
    tipo: 'novo_exercicio',
    de: atual.exercise,
    para: proxima.exercise,
    posicao: posicaoDoExercicio(draft, proxima.exercise.exerciseId),
  };
};
