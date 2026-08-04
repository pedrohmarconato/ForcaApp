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
import { montarResumoSessao } from '../src/engine/sessionSummary';
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

describe('resumo ao vivo (tempo efetivo, 0028)', () => {
  const T0 = new Date('2026-07-15T19:00:00.000Z');

  it('rascunho ativo há 20 min mostra duração normal', () => {
    // Sem nenhuma série concluída: o resumo ao vivo vale min(20min, teto) = 20.
    const draft = rascunho([exercicio('a', 'Supino', ['pending', 'pending'])]);
    draft.startedAt = new Date(T0.getTime() - 20 * 60000).toISOString();

    expect(montarResumoSessao(draft, T0).duracaoMin).toBe(20);
  });

  it('rascunho retomado com 13 h de intervalo fica limitado, coerente com o histórico', () => {
    // Início ontem 06h; uma série concluída 5 min depois; "agora" é 13 h depois.
    // O vão de 13 h contribui no máximo o teto (20 min): 5 + 20 = 25 min —
    // exatamente o que a finish_session gravará em active_seconds.
    const inicio = T0.getTime() - 13 * 3600000;
    const draft = rascunho([
      {
        ...exercicio('a', 'Supino', ['done', 'pending']),
        sets: [
          {
            ...serie(1, 'done'),
            setLogId: 'setlog-1',
            completedAt: new Date(inicio + 5 * 60000).toISOString(),
          },
          serie(2, 'pending'),
        ],
      },
    ]);
    draft.startedAt = new Date(inicio).toISOString();

    expect(montarResumoSessao(draft, T0).duracaoMin).toBe(25);
  });

  it('sem startedAt não há duração (null, nunca zero)', () => {
    const draft = rascunho([exercicio('a', 'Supino', ['done', 'pending'])]);
    expect(montarResumoSessao(draft, T0).duracaoMin).toBeNull();
  });
});
