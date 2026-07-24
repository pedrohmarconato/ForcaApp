// __tests__/sessionFlow.test.ts
// Contrato do "onde estou no treino" — a base do aviso de troca de exercício.
// O modo de falha que motivou isto: terminar a última série do supino e cair na
// primeira da remada era indistinguível de "mais uma série", porque o card tem
// sempre a mesma forma.

import {
  classificarTransicao,
  ehUltimaSerieDoExercicio,
  exercicioConcluido,
  exerciciosEmJogo,
  posicaoDoExercicio,
  seriesRestantes,
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
  it('a última série é a única que falta, mesmo fora de ordem', () => {
    // Série 2 ainda ativa, 1 e 3 já registradas: concluir a 2 fecha o exercício.
    const ex = exercicio('a', 'Supino', ['done', 'active', 'done']);
    expect(ehUltimaSerieDoExercicio(ex, ex.sets[1])).toBe(true);
  });

  it('não anuncia fim quando ainda sobra série pendente', () => {
    const ex = exercicio('a', 'Supino', ['done', 'active', 'pending']);
    expect(ehUltimaSerieDoExercicio(ex, ex.sets[1])).toBe(false);
    expect(seriesRestantes(ex)).toBe(2);
  });

  it('exercicioConcluido exige todas registradas e não vale para lista vazia', () => {
    expect(exercicioConcluido(exercicio('a', 'X', ['done', 'done']))).toBe(true);
    expect(exercicioConcluido(exercicio('a', 'X', ['done', 'pending']))).toBe(false);
    expect(exercicioConcluido(exercicio('a', 'X', []))).toBe(false);
  });
});

describe('classificação da transição', () => {
  const draft = rascunho([
    exercicio('a', 'Supino', ['active', 'pending']),
    exercicio('c', 'Remada', ['pending']),
  ]);
  const supino = draft.exercises[0];
  const remada = draft.exercises[1];

  it('mesma série quando não há para onde ir', () => {
    expect(classificarTransicao(draft, { exercise: supino, set: supino.sets[0] }, null))
      .toEqual({ tipo: 'mesma_serie' });
  });

  it('próxima série quando o exercício continua', () => {
    const t = classificarTransicao(
      draft,
      { exercise: supino, set: supino.sets[0] },
      { exercise: supino, set: supino.sets[1] },
    );
    expect(t.tipo).toBe('proxima_serie');
  });

  it('novo exercício traz de/para e a posição no treino', () => {
    const t = classificarTransicao(
      draft,
      { exercise: supino, set: supino.sets[1] },
      { exercise: remada, set: remada.sets[0] },
    );
    expect(t).toEqual({
      tipo: 'novo_exercicio',
      de: supino,
      para: remada,
      posicao: { indice: 2, total: 2 },
    });
  });
});
