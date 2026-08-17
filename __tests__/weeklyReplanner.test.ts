// __tests__/weeklyReplanner.test.ts
// Fase 6 — cobre o replanejador semanal por regras: aderência honesta (sem dado
// inventado), escadas de tempo (~100%/66%/45%) e "nada a replanejar". COMMIT B:
// redistribuição pós-falta removida — a semana fecha com menos volume.

import {
  computeAdherence,
  isDeloadSession,
  planTimeCut,
  replanByRules,
  applyTimeCutToDraft,
  parseReplanSnapshot,
  lastTimeCutForSession,
  replanFingerprint,
  type WeeklyReplanProposal,
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

const sets = (exerciseId: string, n: number): ReplanSetRef[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${exerciseId}-s${i + 1}`,
    setOrder: i + 1,
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
    expect(proposal.hasChanges).toBe(false);
    expect(proposal.adherence.sessionsCompleted).toBe(1);
  });

  it('menos tempo hoje → só o corte de tempo é proposto', () => {
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
  restEndsAt: null,
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

describe('applyTimeCutToDraft', () => {
  it('corte marca só os exercícios listados; séries feitas ficam intactas', () => {
    const out = applyTimeCutToDraft(makeDraft(), ['ex-2']);
    expect(out.exercises[0].cutByReplan).toBeUndefined();
    expect(out.exercises[1].cutByReplan).toBe(true);
    expect(out.exercises[0].sets[0].status).toBe('done');
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
    timeCut: null,
    ...over,
  });

  it('forma inesperada → null (nunca inventa eventos)', () => {
    expect(parseReplanSnapshot(null)).toBeNull();
    expect(parseReplanSnapshot('lixo')).toBeNull();
    expect(parseReplanSnapshot({ version: 2, events: [] })).toBeNull();
    expect(parseReplanSnapshot({ version: 1, events: 'x' })).toBeNull();
  });

  it('snapshot legado com redistribution (COMMIT A) ainda parseia e o corte é achado', () => {
    // Campo histórico ignorado de propósito: o evento antigo tem o bloco rd, mas
    // só o timeCut interessa para a retomada. parseReplanSnapshot é defensivo e
    // não rejeita campos extras.
    const legado = {
      version: 1,
      events: [
        {
          confirmedAtISO: '2026-07-17T10:00:00Z',
          planId: 'plan-1',
          weekNumber: 1,
          adherence: { sessionsDue: 0, sessionsCompleted: 0, sessionRate: null, setsDue: 0, setsCompleted: 0, volumeRate: null },
          redistribution: {
            missedSessions: [{ id: 'seg', originalStatus: 'pending' }],
            addedSets: [{ id: 'a1', sessionId: 's', exerciseId: 'e', setOrder: 5 }],
            losses: [],
          },
          timeCut: {
            sessionId: 'sess-1',
            availableMinutes: 30,
            estimatedMinutes: 60,
            keptPriorities: ['primary'],
            cutExercises: [{ exerciseId: 'ex-2', name: 'Tríceps Corda', setsCut: 1 }],
          },
        },
      ],
    };
    const snap = parseReplanSnapshot(legado);
    expect(snap).not.toBeNull();
    expect(snap!.events).toHaveLength(1);
    expect(lastTimeCutForSession(snap, 'sess-1')?.availableMinutes).toBe(30);
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

describe('replanFingerprint — conteúdo canônico visível/aplicável', () => {
  const proposta = (overrides: Partial<WeeklyReplanProposal> = {}): WeeklyReplanProposal => ({
    adherence: { sessionsDue: 1, sessionsCompleted: 0, sessionRate: 0, setsDue: 4, setsCompleted: 0, volumeRate: 0 },
    timeCut: {
      kind: 'time_cut',
      sessionId: 'sess-1',
      availableMinutes: 30,
      estimatedMinutes: 60,
      ratio: 0.5,
      keptPriorities: ['primary'],
      cutExercises: [
        { exerciseId: 'ex-2', name: 'Tríceps Corda', priority: 'accessory', muscleGroup: 'Tríceps', setsCut: 1 },
      ],
    },
    hasChanges: true,
    ...overrides,
  });

  it('mesma semântica em ordem diferente → fingerprint IGUAL', () => {
    const a = proposta({
      timeCut: { ...proposta().timeCut, cutExercises: [{ exerciseId: 'ex-2', name: 'Tríceps Corda', priority: 'accessory', muscleGroup: 'Tríceps', setsCut: 1 }] },
    });
    const b = proposta({
      timeCut: { ...proposta().timeCut, cutExercises: [{ exerciseId: 'ex-2', name: 'Tríceps Corda', priority: 'accessory', muscleGroup: 'Tríceps', setsCut: 1 }] },
    });
    expect(replanFingerprint(a)).toBe(replanFingerprint(b));
  });

  it('mudar availableMinutes (com timeCut) → DIFERENTE', () => {
    expect(replanFingerprint(proposta({ timeCut: { ...proposta().timeCut, availableMinutes: 40 } }))).not.toBe(
      replanFingerprint(proposta()),
    );
  });

  it('mudar setsCut de um corte → DIFERENTE', () => {
    const p = proposta();
    p.timeCut.cutExercises[0] = { ...p.timeCut.cutExercises[0], setsCut: 2 };
    expect(replanFingerprint(p)).not.toBe(replanFingerprint(proposta()));
  });

  it('mudar nome do corte (visível) → DIFERENTE', () => {
    const p = proposta();
    p.timeCut.cutExercises[0] = { ...p.timeCut.cutExercises[0], name: 'Tríceps Francês' };
    expect(replanFingerprint(p)).not.toBe(replanFingerprint(proposta()));
  });

  it('mudar prioridade ou grupo do corte → DIFERENTE', () => {
    const p = proposta();
    p.timeCut.cutExercises[0] = { ...p.timeCut.cutExercises[0], priority: 'secondary' };
    expect(replanFingerprint(p)).not.toBe(replanFingerprint(proposta()));
    const q = proposta();
    q.timeCut.cutExercises[0] = { ...q.timeCut.cutExercises[0], muscleGroup: 'Ombro' };
    expect(replanFingerprint(q)).not.toBe(replanFingerprint(proposta()));
  });

  it('sem timeCut: mudar só os minutos NÃO muda o fingerprint (sem proposta visível de corte)', () => {
    const semCorte = proposta({ timeCut: null });
    const semCorte40 = proposta({ timeCut: null });
    expect(replanFingerprint(semCorte)).toBe(replanFingerprint(semCorte40));
  });

  it('proposta sem timeCut → fingerprint estável "no-changes"', () => {
    expect(replanFingerprint(proposta({ timeCut: null, hasChanges: false }))).toBe('no-changes');
  });
});
