// __tests__/sessionFlow.test.ts
// Contrato do "onde estou no treino" — a base do aviso de troca de exercício.
// O modo de falha que motivou isto: terminar a última série do supino e cair na
// primeira da remada era indistinguível de "mais uma série", porque o card tem
// sempre a mesma forma.
//
// Só cobre o que o app realmente chama. A primeira versão testava mais quatro
// funções (classificarTransicao, ehUltimaSerieDoExercicio, seriesRestantes e o
// tipo TransicaoDoTreino) que nenhuma tela usava — teste verde sobre código
// morto dá falsa sensação de cobertura, então elas saíram junto.

import {
  exercicioConcluido,
  exerciciosEmJogo,
  posicaoDoExercicio,
} from '../src/engine/sessionFlow';
import type { SessionDraft, DraftExercise, DraftSet } from '../src/engine/sessionModel';

const serie = (setOrder: number, status: DraftSet['status']): DraftSet =>
  ({
    plannedSetId: `set-${setOrder}`,
    setOrder,
    targetRepsMin: 8,
    targetRepsMax: 10,
    targetLoadKg: null,
    targetRir: null,
    actualReps: null,
    actualLoadKg: null,
    actualRir: null,
    status,
    outcome: null,
  }) as DraftSet;

const exercicio = (
  id: string,
  nome: string,
  status: DraftSet['status'][],
  extra: Partial<DraftExercise> = {},
): DraftExercise =>
  ({
    exerciseId: id,
    name: nome,
    order: 1,
    equipment: null,
    isBodyweight: false,
    hasInjury: false,
    loadIncrementKg: 2.5,
    restSeconds: 90,
    priority: 'primary',
    sets: status.map((s, i) => serie(i + 1, s)),
    ...extra,
  }) as DraftExercise;

const rascunho = (exercises: DraftExercise[]): SessionDraft =>
  ({
    version: 1,
    plannedSessionId: 'ps-1',
    sessionLogId: 'sl-1',
    userId: 'u-1',
    title: 'Treino A',
    weekNumber: 1,
    startedAt: null,
    status: 'active',
    exercises,
    lastLoadByExercise: {},
  }) as SessionDraft;

describe('posição no treino', () => {
  it('conta a posição ignorando exercícios cortados pelo replan', () => {
    const draft = rascunho([
      exercicio('a', 'Supino', ['done']),
      exercicio('b', 'Crucifixo', ['pending'], { cutByReplan: true }),
      exercicio('c', 'Remada', ['pending']),
    ]);

    expect(exerciciosEmJogo(draft)).toHaveLength(2);
    expect(posicaoDoExercicio(draft, 'c')).toEqual({ indice: 2, total: 2 });
  });

  it('devolve null para exercício cortado — ele não tem posição no treino', () => {
    const draft = rascunho([
      exercicio('a', 'Supino', ['pending']),
      exercicio('b', 'Crucifixo', ['pending'], { cutByReplan: true }),
    ]);

    expect(posicaoDoExercicio(draft, 'b')).toBeNull();
    expect(posicaoDoExercicio(draft, 'inexistente')).toBeNull();
  });
});

describe('fim do exercício', () => {
  it('só anuncia o fim quando todas as séries estão registradas', () => {
    expect(exercicioConcluido(exercicio('a', 'X', ['done', 'done']))).toBe(true);
    expect(exercicioConcluido(exercicio('a', 'X', ['done', 'pending']))).toBe(false);
    expect(exercicioConcluido(exercicio('a', 'X', ['done', 'active']))).toBe(false);
  });

  it('não trata exercício sem séries como concluído', () => {
    expect(exercicioConcluido(exercicio('a', 'X', []))).toBe(false);
  });
});
