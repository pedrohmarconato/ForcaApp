// __tests__/weeklyReplanner.test.ts
// Fase 6 — cobre o replanejador semanal por regras: aderência honesta (sem dado
// inventado), escadas de tempo (~100%/66%/45%), redistribuição pós-falta com teto
// (+25% por grupo) e recuperação (não empilhar grupo em dias consecutivos), faltas
// múltiplas (teto sobre o TOTAL, não por falta), deload (reduz e não compensa;
// nunca recebe) e "nada a replanejar".

import {
  computeAdherence,
  isDeloadSession,
  planTimeCut,
  planMissedRedistribution,
  replanByRules,
  type ReplanSession,
  type ReplanExercise,
  type ReplanSetRef,
} from '../src/engine/weeklyReplanner';
import { REPLAN_CONFIG } from '../src/engine/config';

// ---------------------------------------------------------------
// Fixtures compactas
// ---------------------------------------------------------------

const sets = (exerciseId: string, n: number, addedByReplan = false): ReplanSetRef[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${exerciseId}-s${i + 1}`,
    setOrder: i + 1,
    addedByReplan,
  }));

const ex = (
  id: string,
  muscleGroup: string | null,
  priority: ReplanExercise['priority'],
  nSets: number,
  over: Partial<ReplanExercise> = {},
): ReplanExercise => ({
  id,
  name: `Exercício ${id}`,
  muscleGroup,
  priority,
  exerciseOrder: 1,
  sets: sets(id, nSets),
  ...over,
});

const sess = (
  id: string,
  scheduledDate: string | null,
  exercises: ReplanExercise[],
  over: Partial<ReplanSession> = {},
): ReplanSession => ({
  id,
  weekNumber: 1,
  title: `Treino ${id}`,
  sessionType: 'Hipertrofia',
  scheduledDate,
  status: 'pending',
  estimatedMinutes: 60,
  exercises,
  ...over,
});

// ---------------------------------------------------------------
// computeAdherence — planejado × feito, sem inventar
// ---------------------------------------------------------------

describe('computeAdherence', () => {
  it('conta sessões devidas (data <= hoje ou já resolvidas) e o volume em séries', () => {
    const sessions = [
      sess('a', '2026-07-13', [ex('a1', 'peito', 'primary', 4)], { status: 'completed' }),
      sess('b', '2026-07-15', [ex('b1', 'costas', 'primary', 6)], { status: 'completed' }),
      sess('c', '2026-07-16', [ex('c1', 'pernas', 'primary', 5)]), // pendente atrasada
      sess('d', '2026-07-20', [ex('d1', 'ombros', 'primary', 8)]), // futura — não conta
    ];
    const adherence = computeAdherence({
      sessions,
      completedSetsBySession: { a: 4, b: 5 },
      todayISO: '2026-07-17',
    });
    expect(adherence.sessionsDue).toBe(3);
    expect(adherence.sessionsCompleted).toBe(2);
    expect(adherence.sessionRate).toBeCloseTo(2 / 3);
    expect(adherence.setsDue).toBe(15); // 4 + 6 + 5
    expect(adherence.setsCompleted).toBe(9);
    expect(adherence.volumeRate).toBeCloseTo(9 / 15);
  });

  it('sem sessão devida → taxas NULAS (não inventa 100%)', () => {
    const adherence = computeAdherence({
      sessions: [sess('d', '2026-07-20', [ex('d1', 'ombros', 'primary', 8)])],
      completedSetsBySession: {},
      todayISO: '2026-07-17',
    });
    expect(adherence.sessionsDue).toBe(0);
    expect(adherence.sessionRate).toBeNull();
    expect(adherence.volumeRate).toBeNull();
  });
});

// ---------------------------------------------------------------
// isDeloadSession
// ---------------------------------------------------------------

describe('isDeloadSession', () => {
  it('detecta pelo session_type ou pelo título (case/acentos-insensível)', () => {
    expect(isDeloadSession({ sessionType: 'Deload', title: 'Treino A' })).toBe(true);
    expect(isDeloadSession({ sessionType: null, title: 'Semana de DELOAD' })).toBe(true);
    expect(isDeloadSession({ sessionType: 'Descarga', title: 'Treino B' })).toBe(true);
    expect(isDeloadSession({ sessionType: 'Hipertrofia', title: 'Peito/Tríceps' })).toBe(false);
  });
});

// ---------------------------------------------------------------
// planTimeCut — escadas ~100% / 66% / 45%
// ---------------------------------------------------------------

const sessaoMista = (over: Partial<ReplanSession> = {}): ReplanSession =>
  sess(
    'hoje',
    '2026-07-17',
    [
      ex('p1', 'peito', 'primary', 4, { exerciseOrder: 1 }),
      ex('s1', 'ombros', 'secondary', 3, { exerciseOrder: 2 }),
      ex('a1', 'triceps', 'accessory', 3, { exerciseOrder: 3 }),
    ],
    over,
  );

describe('planTimeCut', () => {
  it('tempo cheio (~100%) → nada a cortar (null)', () => {
    expect(planTimeCut({ session: sessaoMista(), availableMinutes: 60 })).toBeNull();
  });

  it('no limiar de sessão cheia (ratio = fullMinRatio) ainda não corta', () => {
    const minutos = Math.ceil(REPLAN_CONFIG.timeLadder.fullMinRatio * 60);
    expect(planTimeCut({ session: sessaoMista(), availableMinutes: minutos })).toBeNull();
  });

  it('~66% do tempo → corta ACESSÓRIOS, mantém primários e secundários', () => {
    const cut = planTimeCut({ session: sessaoMista(), availableMinutes: 40 });
    expect(cut).not.toBeNull();
    expect(cut!.keptPriorities).toEqual(['primary', 'secondary']);
    expect(cut!.cutExercises.map((c) => c.exerciseId)).toEqual(['a1']);
    expect(cut!.cutExercises[0].setsCut).toBe(3);
  });

  it('~45% do tempo → só PRIMÁRIOS ficam', () => {
    const cut = planTimeCut({ session: sessaoMista(), availableMinutes: 27 });
    expect(cut).not.toBeNull();
    expect(cut!.keptPriorities).toEqual(['primary']);
    expect(cut!.cutExercises.map((c) => c.exerciseId).sort()).toEqual(['a1', 's1']);
  });

  it('sessão só de primários com pouco tempo → nada a cortar (null)', () => {
    const soPrimarios = sess('hoje', '2026-07-17', [ex('p1', 'peito', 'primary', 4)]);
    expect(planTimeCut({ session: soPrimarios, availableMinutes: 27 })).toBeNull();
  });

  it('sem estimated_minutes → não inventa razão de tempo (null)', () => {
    const semEstimativa = sessaoMista({ estimatedMinutes: null });
    expect(planTimeCut({ session: semEstimativa, availableMinutes: 30 })).toBeNull();
  });
});

// ---------------------------------------------------------------
// planMissedRedistribution — redistribuição pós-falta
// ---------------------------------------------------------------

describe('planMissedRedistribution', () => {
  it('sem falta → null', () => {
    const plan = planMissedRedistribution({
      sessions: [
        sess('a', '2026-07-13', [ex('a1', 'peito', 'primary', 4)], { status: 'completed' }),
        sess('b', '2026-07-18', [ex('b1', 'costas', 'primary', 4)]),
      ],
      todayISO: '2026-07-17',
      currentSessionId: 'b',
    });
    expect(plan).toBeNull();
  });

  it('falta simples: redistribui nas restantes com teto de +25% por grupo e registra a sobra', () => {
    // Segunda perdida: 4 séries de peito. Alvos: quarta (8 séries de peito → teto 2)
    // e sexta (4 séries de peito → teto 1). Round-robin: qua, sex, qua → sobra 1.
    const sessions = [
      sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]),
      sess('qua', '2026-07-15', [ex('w1', 'peito', 'primary', 8)], { status: 'in_progress' }),
      sess('sex', '2026-07-17', [ex('f1', 'peito', 'accessory', 4)]),
    ];
    const plan = planMissedRedistribution({
      sessions,
      todayISO: '2026-07-15',
      currentSessionId: 'qua',
    });
    expect(plan).not.toBeNull();
    expect(plan!.missedSessionIds).toEqual(['seg']);
    expect(plan!.additions).toEqual([
      expect.objectContaining({ targetSessionId: 'qua', exerciseId: 'w1', addSets: 2 }),
      expect.objectContaining({ targetSessionId: 'sex', exerciseId: 'f1', addSets: 1 }),
    ]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ missedSessionId: 'seg', muscleGroup: 'peito', sets: 1, reason: 'nao_coube' }),
    ]);
  });

  it('recuperação: não empilha o mesmo grupo em dias consecutivos', () => {
    // Falta de costas na segunda. Terça e quarta treinam costas em dias consecutivos
    // → nenhuma das duas pode receber; sexta (isolada) recebe até o teto.
    const sessions = [
      sess('seg', '2026-07-13', [ex('m1', 'costas', 'primary', 4)]),
      sess('ter', '2026-07-14', [ex('t1', 'costas', 'primary', 4)], { status: 'completed' }),
      sess('qua', '2026-07-15', [ex('w1', 'costas', 'primary', 4)]),
      sess('sex', '2026-07-17', [ex('f1', 'costas', 'primary', 8)]),
    ];
    const plan = planMissedRedistribution({
      sessions,
      todayISO: '2026-07-15',
      currentSessionId: 'qua',
    });
    expect(plan!.additions).toEqual([
      expect.objectContaining({ targetSessionId: 'sex', exerciseId: 'f1', addSets: 2 }),
    ]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ muscleGroup: 'costas', sets: 2, reason: 'nao_coube' }),
    ]);
  });

  it('faltas múltiplas NÃO empilham: o teto vale para o TOTAL redistribuído', () => {
    // Duas faltas de peito (4+4 séries). Único alvo tem 8 séries → teto TOTAL 2.
    const sessions = [
      sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]),
      sess('ter', '2026-07-14', [ex('m2', 'peito', 'primary', 4)]),
      sess('sex', '2026-07-17', [ex('f1', 'peito', 'primary', 8)]),
    ];
    const plan = planMissedRedistribution({
      sessions,
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    const totalAdicionado = plan!.additions.reduce((s, a) => s + a.addSets, 0);
    expect(totalAdicionado).toBe(2);
    const totalPerdido = plan!.losses.reduce((s, l) => s + l.sets, 0);
    expect(totalPerdido).toBe(6);
  });

  it('séries adicionadas por replans ANTERIORES contam no teto', () => {
    // Alvo com 8 séries originais + 2 já adicionadas por replan → teto 2 já consumido.
    const alvo = sess('sex', '2026-07-17', [
      { ...ex('f1', 'peito', 'primary', 8), sets: [...sets('f1', 8), ...sets('f1x', 2, true)] },
    ]);
    const plan = planMissedRedistribution({
      sessions: [sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]), alvo],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    expect(plan!.additions).toEqual([]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ muscleGroup: 'peito', sets: 4, reason: 'nao_coube' }),
    ]);
  });

  it('séries que vieram de replan anterior na sessão PERDIDA não são re-redistribuídas', () => {
    const perdida = sess('seg', '2026-07-13', [
      { ...ex('m1', 'peito', 'primary', 4), sets: [...sets('m1', 4), ...sets('m1x', 1, true)] },
    ]);
    const plan = planMissedRedistribution({
      sessions: [perdida, sess('sex', '2026-07-17', [ex('f1', 'peito', 'primary', 8)])],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    // 4 originais → 2 vão (teto), 2 sobram; a 1 de replan anterior é perda registrada à parte.
    expect(plan!.additions).toEqual([
      expect.objectContaining({ targetSessionId: 'sex', addSets: 2 }),
    ]);
    expect(plan!.losses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sets: 2, reason: 'nao_coube' }),
        expect.objectContaining({ sets: 1, reason: 'replan_anterior_perdido' }),
      ]),
    );
  });

  it('deload perdida: reduz e NÃO compensa (perda registrada, nada redistribuído)', () => {
    const plan = planMissedRedistribution({
      sessions: [
        sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)], { sessionType: 'Deload' }),
        sess('sex', '2026-07-17', [ex('f1', 'peito', 'primary', 8)]),
      ],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    expect(plan!.missedSessionIds).toEqual(['seg']);
    expect(plan!.additions).toEqual([]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ missedSessionId: 'seg', sets: 4, reason: 'deload_nao_compensa' }),
    ]);
  });

  it('deload NUNCA recebe redistribuição', () => {
    const plan = planMissedRedistribution({
      sessions: [
        sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]),
        sess('sex', '2026-07-17', [ex('f1', 'peito', 'primary', 8)], { sessionType: 'Deload' }),
      ],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    expect(plan!.additions).toEqual([]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ muscleGroup: 'peito', sets: 4, reason: 'nao_coube' }),
    ]);
  });

  it('exercício perdido sem grupo muscular → perda honesta (não adivinha o destino)', () => {
    const plan = planMissedRedistribution({
      sessions: [
        sess('seg', '2026-07-13', [ex('m1', null, 'primary', 3)]),
        sess('sex', '2026-07-17', [ex('f1', 'peito', 'primary', 8)]),
      ],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    expect(plan!.additions).toEqual([]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ sets: 3, reason: 'sem_grupo_muscular' }),
    ]);
  });

  it('dentro do grupo, quem recebe é o exercício de MAIOR prioridade', () => {
    const alvo = sess('sex', '2026-07-17', [
      ex('acc', 'peito', 'accessory', 4, { exerciseOrder: 1 }),
      ex('pri', 'peito', 'primary', 4, { exerciseOrder: 2 }),
    ]);
    const plan = planMissedRedistribution({
      sessions: [sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]), alvo],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
    });
    // Teto do grupo na sessão: floor(0.25 × 8) = 2, aplicado no exercício primário.
    expect(plan!.additions).toEqual([
      expect.objectContaining({ targetSessionId: 'sex', exerciseId: 'pri', addSets: 2 }),
    ]);
  });
});

// ---------------------------------------------------------------
// replanByRules — orquestração
// ---------------------------------------------------------------

describe('replanByRules', () => {
  it('nada a replanejar: tudo em dia e tempo cheio → sem mudanças', () => {
    const proposal = replanByRules({
      sessions: [
        sess('a', '2026-07-13', [ex('a1', 'peito', 'primary', 4)], { status: 'completed' }),
        sess('b', '2026-07-17', [ex('b1', 'costas', 'primary', 4)]),
      ],
      todayISO: '2026-07-17',
      currentSessionId: 'b',
      availableMinutes: null,
      completedSetsBySession: { a: 4 },
    });
    expect(proposal.timeCut).toBeNull();
    expect(proposal.redistribution).toBeNull();
    expect(proposal.hasChanges).toBe(false);
    expect(proposal.adherence.sessionsCompleted).toBe(1);
  });

  it('falta + menos tempo hoje → as duas propostas juntas', () => {
    const proposal = replanByRules({
      sessions: [
        sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]),
        sessaoMista({ id: 'hoje' }),
        sess('sex', '2026-07-18', [ex('f1', 'peito', 'primary', 8)]),
      ],
      todayISO: '2026-07-17',
      currentSessionId: 'hoje',
      availableMinutes: 40,
      completedSetsBySession: {},
    });
    expect(proposal.timeCut).not.toBeNull();
    expect(proposal.redistribution).not.toBeNull();
    expect(proposal.hasChanges).toBe(true);
  });

  it('deload de hoje pode ser CORTADA por tempo (reduzir é permitido; compensar não)', () => {
    const proposal = replanByRules({
      sessions: [sessaoMista({ id: 'hoje', sessionType: 'Deload' })],
      todayISO: '2026-07-17',
      currentSessionId: 'hoje',
      availableMinutes: 40,
      completedSetsBySession: {},
    });
    expect(proposal.timeCut).not.toBeNull();
    expect(proposal.redistribution).toBeNull();
  });
});
