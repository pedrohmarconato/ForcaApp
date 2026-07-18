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
  applyTimeCutToDraft,
  appendAddedSetsToDraft,
  parseReplanSnapshot,
  addedSetIdsFromSnapshots,
  lastTimeCutForSession,
  type ReplanSession,
  type ReplanExercise,
  type ReplanSetRef,
  type ReplanSnapshot,
} from '../src/engine/weeklyReplanner';
import { REPLAN_CONFIG } from '../src/engine/config';
import type { SessionDraft } from '../src/engine/sessionModel';

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

  it('corte e redistribuição no MESMO replan: exercício CORTADO não recebe séries', () => {
    // Falta de segunda: peito 4 + tríceps 4. Hoje (40 de 60 min) corta o acessório
    // de tríceps (a1). O peito vai para o exercício MANTIDO de hoje (p1, teto 1);
    // o tríceps NÃO pode cair no a1 cortado — vai para sexta (teto 2) e o resto é
    // perda registrada. Sem o cruzamento corte×redistribuição, a1 receberia +2
    // séries que nunca seriam executadas (achado nº 1 do review do dono).
    const sessions = [
      sess('seg', '2026-07-13', [
        ex('m0', 'peito', 'primary', 4, { exerciseOrder: 1 }),
        ex('m1', 'triceps', 'primary', 4, { exerciseOrder: 2 }),
      ]),
      sess(
        'hoje',
        '2026-07-17',
        [
          ex('p1', 'peito', 'primary', 4, { exerciseOrder: 1 }),
          ex('a1', 'triceps', 'accessory', 8, { exerciseOrder: 2 }),
        ],
        { status: 'in_progress' },
      ),
      sess('sex', '2026-07-19', [ex('f1', 'triceps', 'primary', 8)]),
    ];
    const proposal = replanByRules({
      sessions,
      todayISO: '2026-07-17',
      currentSessionId: 'hoje',
      availableMinutes: 40,
      completedSetsBySession: {},
    });
    expect(proposal.timeCut!.cutExercises.map((c) => c.exerciseId)).toEqual(['a1']);
    // NENHUMA adição no exercício cortado
    expect(proposal.redistribution!.additions.map((a) => a.exerciseId)).not.toContain('a1');
    expect(proposal.redistribution!.additions).toEqual([
      expect.objectContaining({ targetSessionId: 'hoje', exerciseId: 'p1', addSets: 1 }),
      expect.objectContaining({ targetSessionId: 'sex', exerciseId: 'f1', addSets: 2 }),
    ]);
    expect(proposal.redistribution!.losses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ muscleGroup: 'peito', sets: 3, reason: 'nao_coube' }),
        expect.objectContaining({ muscleGroup: 'triceps', sets: 2, reason: 'nao_coube' }),
      ]),
    );
  });

  it('planMissedRedistribution: receptor excluído não recebe nem conta no teto do grupo', () => {
    // Único exercício de peito da receptora está excluído (cortado) → o grupo não
    // tem capacidade nessa sessão; tudo vira perda registrada.
    const plan = planMissedRedistribution({
      sessions: [
        sess('seg', '2026-07-13', [ex('m1', 'peito', 'primary', 4)]),
        sess('sex', '2026-07-17', [ex('f1', 'peito', 'accessory', 8)]),
      ],
      todayISO: '2026-07-16',
      currentSessionId: 'sex',
      excludedReceiverExerciseIds: ['f1'],
    });
    expect(plan!.additions).toEqual([]);
    expect(plan!.losses).toEqual([
      expect.objectContaining({ muscleGroup: 'peito', sets: 4, reason: 'nao_coube' }),
    ]);
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

// ---------------------------------------------------------------
// Aplicação ao rascunho (overlay confirmado) e snapshot
// ---------------------------------------------------------------

const draftSet = (plannedSetId: string, setOrder: number, status: 'pending' | 'done' = 'pending') => ({
  plannedSetId,
  setOrder,
  targetRepsMin: 8,
  targetRepsMax: 10,
  targetLoadKg: null,
  targetRir: 2,
  actualReps: status === 'done' ? 9 : null,
  actualLoadKg: null,
  actualRir: null,
  status,
  outcome: null,
  setLogId: null,
  adaptation: null,
});

const makeDraft = (): SessionDraft => ({
  version: 1,
  plannedSessionId: 'sess-1',
  sessionLogId: 'log-1',
  userId: 'user-1',
  title: 'Push A',
  weekNumber: 1,
  startedAt: null,
  status: 'active',
  exercises: [
    {
      exerciseId: 'ex-1',
      name: 'Supino',
      order: 1,
      equipment: 'Barra',
      isBodyweight: false,
      hasInjury: false,
      loadIncrementKg: 2.5,
      restSeconds: 90,
      priority: 'primary',
      targetRmPercent: null,
      repsRaw: '8-10',
      sets: [draftSet('st-1', 1, 'done'), draftSet('st-2', 2)],
    },
    {
      exerciseId: 'ex-2',
      name: 'Tríceps Corda',
      order: 2,
      equipment: 'Polia',
      isBodyweight: false,
      hasInjury: false,
      loadIncrementKg: 2.5,
      restSeconds: 60,
      priority: 'accessory',
      targetRmPercent: null,
      repsRaw: '10-12',
      sets: [draftSet('st-3', 1)],
    },
  ],
  lastLoadByExercise: {},
});

describe('applyTimeCutToDraft / appendAddedSetsToDraft', () => {
  it('corte marca só os exercícios listados; séries feitas ficam intactas', () => {
    const out = applyTimeCutToDraft(makeDraft(), ['ex-2']);
    expect(out.exercises[0].cutByReplan).toBeUndefined();
    expect(out.exercises[1].cutByReplan).toBe(true);
    expect(out.exercises[0].sets[0].status).toBe('done');
  });

  it('anexa as séries inseridas na sessão atual, ordenadas e SEM duplicar (idempotente)', () => {
    const rows = [
      {
        id: 'new-1',
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setOrder: 3,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetLoadKg: 42.5,
        targetRir: 2,
      },
    ];
    const once = appendAddedSetsToDraft(makeDraft(), rows);
    const twice = appendAddedSetsToDraft(once, rows);
    const setsEx1 = twice.exercises[0].sets;
    expect(setsEx1.map((s) => s.plannedSetId)).toEqual(['st-1', 'st-2', 'new-1']);
    expect(setsEx1[2]).toMatchObject({ status: 'pending', targetLoadKg: 42.5, setOrder: 3 });
    expect(twice.exercises[1].sets).toHaveLength(1); // outro exercício intocado
  });
});

describe('snapshot do replanejamento (parse defensivo)', () => {
  const event = (over: any = {}) => ({
    confirmedAtISO: '2026-07-17T10:00:00Z',
    planId: 'plan-1',
    weekNumber: 1,
    adherence: {
      sessionsDue: 0,
      sessionsCompleted: 0,
      sessionRate: null,
      setsDue: 0,
      setsCompleted: 0,
      volumeRate: null,
    },
    redistribution: null,
    timeCut: null,
    ...over,
  });

  it('forma inesperada → null (nunca inventa eventos)', () => {
    expect(parseReplanSnapshot(null)).toBeNull();
    expect(parseReplanSnapshot('lixo')).toBeNull();
    expect(parseReplanSnapshot({ version: 2, events: [] })).toBeNull();
    expect(parseReplanSnapshot({ version: 1, events: 'x' })).toBeNull();
  });

  it('extrai os IDs de séries adicionadas por replans anteriores de todos os snapshots', () => {
    const snap: ReplanSnapshot = {
      version: 1,
      events: [
        event({
          redistribution: {
            missedSessions: [],
            addedSets: [{ id: 'a1', sessionId: 's', exerciseId: 'e', setOrder: 5 }],
            losses: [],
          },
        }),
      ],
    };
    expect([...addedSetIdsFromSnapshots([snap, null])]).toEqual(['a1']);
  });

  it('lastTimeCutForSession devolve o ÚLTIMO corte da sessão (e ignora o de outra)', () => {
    const cutFor = (sessionId: string, minutes: number) => ({
      sessionId,
      availableMinutes: minutes,
      estimatedMinutes: 60,
      keptPriorities: ['primary'] as const,
      cutExercises: [],
    });
    const snap = parseReplanSnapshot({
      version: 1,
      events: [
        event({ timeCut: cutFor('sess-1', 30) }),
        event({ timeCut: cutFor('outra', 20) }),
        event({ timeCut: cutFor('sess-1', 45) }),
      ],
    });
    expect(lastTimeCutForSession(snap, 'sess-1')?.availableMinutes).toBe(45);
    expect(lastTimeCutForSession(snap, 'sem-corte')).toBeNull();
  });
});
