// __tests__/recusaDeclarada.test.ts
// Fase 1 da flexibilidade: "não vou fazer este exercício".
//
// Cada bloco aqui nasceu de um modo de falha PROVÁVEL desta feature, escrito
// antes da implementação:
//
//  1. marcar a recusa só no progresso e esquecer `exerciciosEmJogo` — o
//     contador some, mas o player continua abrindo o exercício recusado;
//  2. tirar do progresso as séries JÁ FEITAS do exercício recusado — recusar
//     depois de 2 séries apagaria trabalho real do contador;
//  3. recusar tudo e deixar o aluno preso: sem série em jogo, `isSessionComplete`
//     é falso para sempre e não existe caminho para fechar a tela;
//  4. série ATIVA num exercício recusado — o player continuaria com o card de
//     medição aberto em cima de algo que o aluno acabou de dispensar;
//  5. rascunho gravado por versão anterior (sem o campo) lido como recusado;
//  6. desfazer a recusa e as séries pendentes não voltarem para a conta.

import {
  applyExerciseSkipToDraft,
  coerceDraftNumerics,
  exercicioForaDeJogo,
  isSessionComplete,
  removeExerciseSkipFromDraft,
  sessionProgress,
  sessionSemNadaAFazer,
  SKIP_REASONS,
  type DraftExercise,
  type DraftSet,
  type SessionDraft,
} from '../src/engine/sessionModel';
import { exerciciosEmJogo, posicaoDoExercicio } from '../src/engine/sessionFlow';

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
    setLogId: null,
    adaptation: null,
    activatedAt: status === 'active' ? '2026-07-30T10:00:00.000Z' : null,
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

describe('vocabulário de motivos', () => {
  it('é fechado e igual ao da migration 0020', () => {
    // A lista do app tem de casar com _forca_motivo_recusa_valido no banco:
    // um motivo só no cliente vira 22023 no meio da recusa.
    expect([...SKIP_REASONS].sort()).toEqual([
      'cansaco',
      'dor_ou_lesao',
      'nao_gosto',
      'sem_equipamento',
      'sem_tempo',
    ].concat('outro').sort());
  });
});

describe('exercício recusado sai do caminho de conclusão', () => {
  it('modo de falha 1: sai também de exerciciosEmJogo, não só do progresso', () => {
    const draft = applyExerciseSkipToDraft(
      rascunho([
        exercicio('e1', 'Supino', ['done', 'pending']),
        exercicio('e2', 'Corrida', ['pending', 'pending']),
      ]),
      'e2',
      'nao_gosto',
    );

    expect(exerciciosEmJogo(draft).map((e) => e.exerciseId)).toEqual(['e1']);
    expect(posicaoDoExercicio(draft, 'e2')).toBeNull();
    expect(posicaoDoExercicio(draft, 'e1')).toEqual({ indice: 1, total: 1 });
  });

  it('modo de falha 2: as séries JÁ FEITAS do exercício recusado continuam contando', () => {
    const draft = applyExerciseSkipToDraft(
      rascunho([
        exercicio('e1', 'Supino', ['done', 'done']),
        // Recusou a Corrida depois de já ter feito uma série dela.
        exercicio('e2', 'Corrida', ['done', 'pending', 'pending']),
      ]),
      'e2',
      'dor_ou_lesao',
    );

    // 2 do supino + a série real da corrida = 3 feitas de 3 em jogo.
    expect(sessionProgress(draft)).toEqual({ done: 3, total: 3 });
    expect(isSessionComplete(draft)).toBe(true);
  });

  it('modo de falha 4: a série ativa do exercício recusado volta a pendente', () => {
    const draft = applyExerciseSkipToDraft(
      rascunho([exercicio('e1', 'Corrida', ['active', 'pending'])]),
      'e1',
      'sem_equipamento',
    );

    const alvo = draft.exercises[0];
    expect(alvo.sets.map((s) => s.status)).toEqual(['pending', 'pending']);
    expect(alvo.sets[0].activatedAt).toBeNull();
    expect(alvo.skippedByUser).toBe(true);
    expect(alvo.skipReason).toBe('sem_equipamento');
  });

  it('preserva o que o aluno já havia digitado (desfazer não pode perder dado)', () => {
    const base = rascunho([exercicio('e1', 'Supino', ['active', 'pending'])]);
    base.exercises[0].sets[0].actualReps = 9;
    base.exercises[0].sets[0].actualLoadKg = 40;

    const recusado = applyExerciseSkipToDraft(base, 'e1', 'cansaco', 'ombro incomodou');
    const voltou = removeExerciseSkipFromDraft(recusado, 'e1');

    expect(voltou.exercises[0].sets[0].actualReps).toBe(9);
    expect(voltou.exercises[0].sets[0].actualLoadKg).toBe(40);
  });
});

describe('modo de falha 3: recusar tudo não pode prender o aluno', () => {
  it('sem série em jogo e sem nada feito, a sessão não é "completa" mas é encerrável', () => {
    let draft = rascunho([
      exercicio('e1', 'Supino', ['pending', 'pending']),
      exercicio('e2', 'Corrida', ['pending']),
    ]);
    draft = applyExerciseSkipToDraft(draft, 'e1', 'sem_tempo');
    draft = applyExerciseSkipToDraft(draft, 'e2', 'sem_tempo');

    expect(sessionProgress(draft)).toEqual({ done: 0, total: 0 });
    // Nada feito não é treino concluído — a tela oferece recusar a SESSÃO.
    expect(isSessionComplete(draft)).toBe(false);
    expect(sessionSemNadaAFazer(draft)).toBe(true);
  });

  it('com alguma série feita, não é "nada a fazer": o treino fecha normalmente', () => {
    const draft = applyExerciseSkipToDraft(
      rascunho([exercicio('e1', 'Supino', ['done', 'pending'])]),
      'e1',
      'cansaco',
    );

    expect(sessionSemNadaAFazer(draft)).toBe(false);
    expect(isSessionComplete(draft)).toBe(true);
  });
});

describe('modo de falha 5: rascunho de versão anterior', () => {
  it('ausência do campo nunca é lida como recusa', () => {
    const legado = rascunho([exercicio('e1', 'Supino', ['pending'])]);
    delete (legado.exercises[0] as Partial<DraftExercise>).skippedByUser;

    const saneado = coerceDraftNumerics(legado);

    expect(saneado.exercises[0].skippedByUser).toBe(false);
    expect(saneado.exercises[0].skipReason).toBeNull();
    expect(exercicioForaDeJogo(saneado.exercises[0])).toBe(false);
    expect(sessionProgress(saneado)).toEqual({ done: 0, total: 1 });
  });

  it('recusa persistida no rascunho sobrevive à sanitização', () => {
    const draft = coerceDraftNumerics(
      applyExerciseSkipToDraft(
        rascunho([exercicio('e1', 'Corrida', ['pending'])]),
        'e1',
        'nao_gosto',
        'prefiro bike',
      ),
    );

    expect(draft.exercises[0].skippedByUser).toBe(true);
    expect(draft.exercises[0].skipReason).toBe('nao_gosto');
    expect(draft.exercises[0].skipNote).toBe('prefiro bike');
  });
});

describe('modo de falha 6: desfazer devolve as séries à conta', () => {
  it('as pendentes voltam a ser exigidas para concluir', () => {
    const recusado = applyExerciseSkipToDraft(
      rascunho([exercicio('e1', 'Supino', ['done', 'pending'])]),
      'e1',
      'sem_tempo',
    );
    expect(sessionProgress(recusado)).toEqual({ done: 1, total: 1 });

    const voltou = removeExerciseSkipFromDraft(recusado, 'e1');

    expect(voltou.exercises[0].skippedByUser).toBe(false);
    expect(voltou.exercises[0].skipReason).toBeNull();
    expect(sessionProgress(voltou)).toEqual({ done: 1, total: 2 });
    expect(isSessionComplete(voltou)).toBe(false);
  });
});

describe('recusa e corte da escada de tempo convivem', () => {
  it('cortado pelo replan continua fora de jogo mesmo sem recusa do aluno', () => {
    const draft = rascunho([
      exercicio('e1', 'Supino', ['pending'], { cutByReplan: true }),
      exercicio('e2', 'Remada', ['pending']),
    ]);

    expect(exercicioForaDeJogo(draft.exercises[0])).toBe(true);
    expect(exercicioForaDeJogo(draft.exercises[1])).toBe(false);
    expect(exerciciosEmJogo(draft).map((e) => e.exerciseId)).toEqual(['e2']);
  });

  it('desfazer a recusa não ressuscita um exercício cortado pelo replan', () => {
    // O aluno recusou o que a escada já havia cortado; desfazer a recusa dele
    // não pode desfazer o corte por tempo (decisão de outro nível).
    let draft = rascunho([exercicio('e1', 'Tríceps', ['pending'], { cutByReplan: true })]);
    draft = applyExerciseSkipToDraft(draft, 'e1', 'sem_tempo');
    draft = removeExerciseSkipFromDraft(draft, 'e1');

    expect(draft.exercises[0].cutByReplan).toBe(true);
    expect(exercicioForaDeJogo(draft.exercises[0])).toBe(true);
  });
});
