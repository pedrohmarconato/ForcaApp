// src/components/session/SessionPlayer.tsx
// Redesign da sessão (22/07/2026, direção do dono): "modo player" — UM card
// dominante que mostra só o que importa AGORA, em quatro estados:
//   measuring → série ativa: medição com números grandes + fôlego em chips;
//   resting   → descanso pós-série: timer GRANDE + o que vem a seguir;
//   ready     → próxima série pendente com um único botão Iniciar;
//   all_done  → tudo registrado, aponta para Concluir treino.
// Os contratos do store não mudam (activateSet/setReps/setLoad/stepLoad/
// setRir/completeSet) — só a apresentação. RIR vira "Quantas ainda
// aguentaria?" (0–4+), opcional, sem jargão.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import theme from '../../theme/theme';
import {
  canCompleteSet,
  formatDistance,
  formatDuration,
  formatPace,
  isTimeBased,
  metricOf,
  paceSecondsPerKm,
  type SessionDraft,
  type DraftExercise,
  type DraftSet,
  type PerceivedEffort,
} from '../../engine/sessionModel';
import { useActiveSessionStore } from '../../store/activeSessionStore';

const parseIntOrNull = (t: string): number | null => {
  const only = t.replace(/[^0-9]/g, '');
  if (only === '') return null;
  return parseInt(only, 10);
};
const parseFloatOrNull = (t: string): number | null => {
  const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
  if (norm === '' || norm === '.') return null;
  const v = parseFloat(norm);
  return Number.isFinite(v) ? v : null;
};

const formatarTempo = (s: number): string => {
  const m = Math.floor(s / 60);
  const seg = s % 60;
  return `${m}:${String(seg).padStart(2, '0')}`;
};

export const repsAlvo = (set: DraftSet): string =>
  set.targetRepsMin === set.targetRepsMax
    ? `${set.targetRepsMin}`
    : `${set.targetRepsMin}–${set.targetRepsMax}`;

/**
 * Alvo da série em texto, ciente da métrica. Cardio nunca mostra "reps": o
 * plano prescreve tempo (e distância), e é isso que o aluno lê.
 */
export const alvoDaSerie = (exercise: DraftExercise, set: DraftSet): string => {
  if (!isTimeBased(metricOf(exercise))) return `${repsAlvo(set)} REPS`;
  const partes: string[] = [];
  if (set.targetDurationSeconds) partes.push(formatDuration(set.targetDurationSeconds));
  if (set.targetDistanceM) partes.push(formatDistance(set.targetDistanceM));
  return partes.length > 0 ? partes.join(' · ') : 'LIVRE';
};

const ESFORCO_CHOICES: { valor: PerceivedEffort; rotulo: string }[] = [
  { valor: 'leve', rotulo: 'Leve' },
  { valor: 'moderado', rotulo: 'Moderado' },
  { valor: 'forte', rotulo: 'Forte' },
];

type SetRef = { exercise: DraftExercise; set: DraftSet };

/** Série ativa (se houver). */
export const findActiveSet = (draft: SessionDraft): SetRef | null => {
  for (const ex of draft.exercises) {
    if (ex.cutByReplan) continue;
    const set = ex.sets.find((s) => s.status === 'active');
    if (set) return { exercise: ex, set };
  }
  return null;
};

/** Próxima série pendente na ordem do treino (exercícios cortados fora). */
export const findNextPendingSet = (draft: SessionDraft): SetRef | null => {
  for (const ex of draft.exercises) {
    if (ex.cutByReplan) continue;
    const set = ex.sets.find((s) => s.status === 'pending');
    if (set) return { exercise: ex, set };
  }
  return null;
};

const RIR_CHOICES = [0, 1, 2, 3, 4] as const;

type RestState = { seconds: number; next: SetRef | null } | null;

type Props = {
  draft: SessionDraft;
  suggestedLoadFor: (exercise: DraftExercise, set: DraftSet) => number | null;
};

const SessionPlayer = ({ draft, suggestedLoadFor }: Props) => {
  const activateSet = useActiveSessionStore((s) => s.activateSet);
  const setReps = useActiveSessionStore((s) => s.setReps);
  const setLoad = useActiveSessionStore((s) => s.setLoad);
  const stepLoad = useActiveSessionStore((s) => s.stepLoad);
  const setRir = useActiveSessionStore((s) => s.setRir);
  const setDuration = useActiveSessionStore((s) => s.setDuration);
  const setDistance = useActiveSessionStore((s) => s.setDistance);
  const setEffort = useActiveSessionStore((s) => s.setEffort);
  const completeSet = useActiveSessionStore((s) => s.completeSet);
  const lastAutoDecision = useActiveSessionStore((s) => s.lastAutoDecision);
  const autoNote =
    lastAutoDecision && lastAutoDecision.sessionLogId === draft.sessionLogId
      ? lastAutoDecision.reason
      : null;

  const [saving, setSaving] = useState(false);
  // Texto CRU dos campos decimais enquanto o aluno digita. Sem isto, o valor
  // reformatado a cada tecla engole o separador: "3." vira "3" e o "2"
  // seguinte produz "32" — era impossível digitar 3,2 km ou 42,5 kg.
  const [textoCarga, setTextoCarga] = useState<string | null>(null);
  const [textoDistancia, setTextoDistancia] = useState<string | null>(null);
  const [rest, setRest] = useState<RestState>(null);
  const [restRemaining, setRestRemaining] = useState(0);
  const restTick = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = findActiveSet(draft);
  const next = findNextPendingSet(draft);

  // Trocou de série → o texto em edição não pertence mais a ela.
  const serieAtivaId = active?.set.plannedSetId ?? null;
  useEffect(() => {
    setTextoCarga(null);
    setTextoDistancia(null);
  }, [serieAtivaId]);

  // Cronômetro do descanso. Zerar = auto-avança para a próxima série.
  useEffect(() => {
    if (!rest) return undefined;
    setRestRemaining(rest.seconds);
    restTick.current = setInterval(() => {
      setRestRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => {
      if (restTick.current) clearInterval(restTick.current);
    };
  }, [rest]);

  const endRest = (autoStart: boolean) => {
    if (restTick.current) clearInterval(restTick.current);
    const alvo = rest?.next ?? null;
    setRest(null);
    if (autoStart && alvo && alvo.set.status !== 'done') {
      activateSet(alvo.exercise.exerciseId, alvo.set.setOrder);
    }
  };

  useEffect(() => {
    if (rest && restRemaining === 0) endRest(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRemaining]);

  // Série ativada por fora (fila) durante o descanso: o descanso perde a vez.
  useEffect(() => {
    if (active && rest) endRest(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.set.plannedSetId]);

  const onConcluir = async () => {
    if (!active) return;
    const { exercise, set } = active;
    setSaving(true);
    try {
      const ok = await completeSet(exercise.exerciseId, set.setOrder);
      if (ok) {
        const draftAtual = useActiveSessionStore.getState().draft;
        const proxima = draftAtual ? findNextPendingSet(draftAtual) : null;
        if (proxima && exercise.restSeconds) {
          setRest({ seconds: exercise.restSeconds, next: proxima });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------------- resting ----------------
  if (rest && !active) {
    const proxima = rest.next;
    return (
      <View style={[styles.card, styles.cardRest]} accessibilityRole="timer">
        <Text style={styles.kicker}>DESCANSO</Text>
        <Text style={styles.restClock}>{formatarTempo(restRemaining)}</Text>
        {proxima ? (
          <Text style={styles.restNext}>
            Próxima: {proxima.exercise.name} — Série {proxima.set.setOrder} · alvo{' '}
            {alvoDaSerie(proxima.exercise, proxima.set)}
          </Text>
        ) : null}
        {autoNote ? <Text style={styles.autoNote}>{autoNote}</Text> : null}
        <TouchableOpacity
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel="Pular descanso"
          onPress={() => endRest(true)}
        >
          <Text style={styles.secondaryBtnText}>Pular descanso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------- measuring: cardio/isometria ----------------
  if (active && isTimeBased(metricOf(active.exercise))) {
    const { exercise, set } = active;
    const metrica = metricOf(exercise);
    const temDistancia = metrica === 'tempo_distancia';
    const podeConcluir = canCompleteSet(set, exercise.isBodyweight, metrica);
    const totalSeries = exercise.sets.length;
    const minutos =
      set.actualDurationSeconds != null
        ? Math.floor(set.actualDurationSeconds / 60)
        : null;
    const segundos =
      set.actualDurationSeconds != null ? set.actualDurationSeconds % 60 : null;
    // Pace ao vivo: derivado do que já foi digitado. Sem distância, "—".
    const pace = paceSecondsPerKm(set.actualDurationSeconds, set.actualDistanceM);

    const aplicarTempo = (novoMin: number | null, novoSeg: number | null) => {
      const m = novoMin ?? minutos ?? 0;
      const sg = novoSeg ?? segundos ?? 0;
      const total = m * 60 + sg;
      setDuration(exercise.exerciseId, set.setOrder, total > 0 ? total : null);
    };

    return (
      <View style={[styles.card, styles.cardActive]}>
        <Text style={styles.kicker}>
          SÉRIE {set.setOrder} DE {totalSeries} · ALVO {alvoDaSerie(exercise, set)}
        </Text>
        <Text style={styles.exerciseName}>{exercise.name}</Text>

        <View style={styles.inputsRow}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Minutos</Text>
            <TextInput
              style={styles.bigInput}
              editable={!saving}
              keyboardType="number-pad"
              value={minutos != null ? String(minutos) : ''}
              onChangeText={(t) => aplicarTempo(parseIntOrNull(t) ?? 0, null)}
              placeholder={
                set.targetDurationSeconds
                  ? String(Math.floor(set.targetDurationSeconds / 60))
                  : 'min'
              }
              placeholderTextColor={theme.colors.text.quiet}
              accessibilityLabel={`Minutos da série ${set.setOrder}`}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Segundos</Text>
            <TextInput
              style={styles.bigInput}
              editable={!saving}
              keyboardType="number-pad"
              value={segundos ? String(segundos) : ''}
              onChangeText={(t) => {
                const v = parseIntOrNull(t);
                aplicarTempo(null, v == null ? 0 : Math.min(59, v));
              }}
              placeholder="0"
              placeholderTextColor={theme.colors.text.quiet}
              accessibilityLabel={`Segundos da série ${set.setOrder}`}
            />
          </View>
          {temDistancia ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Distância (km)</Text>
              <TextInput
                style={styles.bigInput}
                editable={!saving}
                keyboardType="numeric"
                value={
                  textoDistancia ??
                  (set.actualDistanceM != null
                    ? String(set.actualDistanceM / 1000)
                    : '')
                }
                onChangeText={(t) => {
                  setTextoDistancia(t);
                  const km = parseFloatOrNull(t);
                  setDistance(
                    exercise.exerciseId,
                    set.setOrder,
                    km == null ? null : Math.round(km * 1000),
                  );
                }}
                placeholder={
                  set.targetDistanceM ? String(set.targetDistanceM / 1000) : 'km'
                }
                placeholderTextColor={theme.colors.text.quiet}
                accessibilityLabel={`Distância da série ${set.setOrder} em quilômetros`}
              />
            </View>
          ) : null}
        </View>

        {temDistancia ? (
          <View style={styles.paceRow}>
            <Text style={styles.paceLabel}>Pace</Text>
            <Text style={styles.paceValue} accessibilityLabel={`Pace ${formatPace(pace)}`}>
              {formatPace(pace)}
            </Text>
          </View>
        ) : null}

        {temDistancia && pace == null ? (
          <Text style={styles.hint}>
            Informe a distância para calcular o pace (opcional).
          </Text>
        ) : null}

        {/* Equivalente do RIR no cardio: como o esforço pesou. Opcional. */}
        <Text style={styles.rirLabel}>
          Como pegou? <Text style={styles.rirOptional}>(opcional)</Text>
        </Text>
        <View style={styles.rirRow}>
          {ESFORCO_CHOICES.map(({ valor, rotulo }) => {
            const selected = set.perceivedEffort === valor;
            return (
              <TouchableOpacity
                key={valor}
                style={[styles.effortChip, selected && styles.rirChipSelected]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Esforço ${rotulo}`}
                accessibilityState={{ selected }}
                onPress={() =>
                  setEffort(
                    exercise.exerciseId,
                    set.setOrder,
                    selected ? null : valor,
                  )
                }
              >
                <Text
                  style={[styles.rirChipText, selected && styles.rirChipTextSelected]}
                >
                  {rotulo}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.completeBtn, (!podeConcluir || saving) && styles.controlDisabled]}
          onPress={onConcluir}
          disabled={!podeConcluir || saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent.on} size="small" />
          ) : (
            <Text style={styles.completeBtnText}>Concluir série</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------- measuring ----------------
  if (active) {
    const { exercise, set } = active;
    const suggestedLoad = suggestedLoadFor(exercise, set);
    const podeConcluir = canCompleteSet(set, exercise.isBodyweight, metricOf(exercise));
    const precisaCarga =
      !exercise.isBodyweight && suggestedLoad == null && set.actualLoadKg == null;
    const totalSeries = exercise.sets.length;

    return (
      <View style={[styles.card, styles.cardActive]}>
        <Text style={styles.kicker}>
          SÉRIE {set.setOrder} DE {totalSeries} · ALVO {alvoDaSerie(exercise, set)}
        </Text>
        <Text style={styles.exerciseName}>{exercise.name}</Text>

        <View style={styles.inputsRow}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Reps</Text>
            <TextInput
              style={styles.bigInput}
              editable={!saving}
              keyboardType="number-pad"
              value={set.actualReps != null ? String(set.actualReps) : ''}
              onChangeText={(t) =>
                setReps(exercise.exerciseId, set.setOrder, parseIntOrNull(t))
              }
              placeholder={String(set.targetRepsMin)}
              placeholderTextColor={theme.colors.text.quiet}
              accessibilityLabel={`Repetições da série ${set.setOrder}`}
            />
          </View>

          {exercise.isBodyweight ? (
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Carga</Text>
              <Text style={styles.bodyweightTag}>Peso corporal</Text>
            </View>
          ) : (
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Carga (kg)</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, saving && styles.controlDisabled]}
                  onPress={() => {
                    setTextoCarga(null);
                    stepLoad(exercise.exerciseId, set.setOrder, -1);
                  }}
                  disabled={saving}
                  accessibilityLabel={`Diminuir carga da série ${set.setOrder}`}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.bigInput, styles.loadInput]}
                  editable={!saving}
                  keyboardType="numeric"
                  value={
                    textoCarga ??
                    (set.actualLoadKg != null ? String(set.actualLoadKg) : '')
                  }
                  onChangeText={(t) => {
                    setTextoCarga(t);
                    setLoad(exercise.exerciseId, set.setOrder, parseFloatOrNull(t));
                  }}
                  placeholder={suggestedLoad != null ? String(suggestedLoad) : 'kg'}
                  placeholderTextColor={theme.colors.text.quiet}
                  accessibilityLabel={`Carga da série ${set.setOrder}`}
                />
                <TouchableOpacity
                  style={[styles.stepBtn, saving && styles.controlDisabled]}
                  onPress={() => {
                    setTextoCarga(null);
                    stepLoad(exercise.exerciseId, set.setOrder, 1);
                  }}
                  disabled={saving}
                  accessibilityLabel={`Aumentar carga da série ${set.setOrder}`}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* F10: a sugestão só vira valor gravado quando o aluno ACEITA ou digita. */}
        {!exercise.isBodyweight && suggestedLoad != null && set.actualLoadKg == null ? (
          <TouchableOpacity
            style={[styles.suggestBtn, saving && styles.controlDisabled]}
            onPress={() => {
              setTextoCarga(null);
              setLoad(exercise.exerciseId, set.setOrder, suggestedLoad);
            }}
            disabled={saving}
          >
            <Text style={styles.suggestText}>Usar sugestão: {suggestedLoad} kg</Text>
          </TouchableOpacity>
        ) : null}

        {precisaCarga ? (
          <Text style={styles.hint}>
            Primeira vez neste exercício: informe a carga usada.
          </Text>
        ) : null}

        {/* RIR sem jargão: fôlego que sobrou, em UM toque. Opcional. */}
        <Text style={styles.rirLabel}>
          Quantas ainda aguentaria? <Text style={styles.rirOptional}>(opcional)</Text>
        </Text>
        <View style={styles.rirRow}>
          {RIR_CHOICES.map((n) => {
            const selected = set.actualRir === n;
            return (
              <TouchableOpacity
                key={n}
                style={[styles.rirChip, selected && styles.rirChipSelected]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Ainda aguentaria ${n === 4 ? '4 ou mais' : n}`}
                accessibilityState={{ selected }}
                onPress={() =>
                  setRir(exercise.exerciseId, set.setOrder, selected ? null : n)
                }
              >
                <Text style={[styles.rirChipText, selected && styles.rirChipTextSelected]}>
                  {n === 4 ? '4+' : n}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.completeBtn, (!podeConcluir || saving) && styles.controlDisabled]}
          onPress={onConcluir}
          disabled={!podeConcluir || saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent.on} size="small" />
          ) : (
            <Text style={styles.completeBtnText}>Concluir série</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------- ready ----------------
  if (next) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>
          PRÓXIMA · SÉRIE {next.set.setOrder} DE {next.exercise.sets.length} · ALVO{' '}
          {alvoDaSerie(next.exercise, next.set)}
        </Text>
        <Text style={styles.exerciseName}>{next.exercise.name}</Text>
        {autoNote ? <Text style={styles.autoNote}>{autoNote}</Text> : null}
        <TouchableOpacity
          style={styles.completeBtn}
          accessibilityRole="button"
          accessibilityLabel="Iniciar série"
          onPress={() => activateSet(next.exercise.exerciseId, next.set.setOrder)}
        >
          <Text style={styles.completeBtnText}>Iniciar série</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------- all done ----------------
  return (
    <View style={[styles.card, styles.cardRest]}>
      <Text style={styles.kicker}>TUDO REGISTRADO</Text>
      <Text style={styles.exerciseName}>Treino completo.</Text>
      <Text style={styles.restNext}>Confira abaixo e conclua o treino.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface.card,
  },
  cardActive: { borderColor: theme.colors.border.focus },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  paceLabel: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.text.quiet,
  },
  paceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  effortChip: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
  },
  cardRest: { alignItems: 'center' },

  kicker: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  exerciseName: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.display,
    fontSize: theme.typography.fontSizes.xl,
  },

  restClock: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.display,
    fontSize: 64,
    lineHeight: 68,
  },
  restNext: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    textAlign: 'center',
  },

  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  field: { flex: 1 },
  fieldWide: { flex: 1.8 },
  fieldLabel: {
    marginBottom: theme.spacing.xxs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  bigInput: {
    minHeight: theme.hitTarget.regular,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface.elevated,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    textAlign: 'center',
  },
  loadInput: { flex: 1 },
  bodyweightTag: {
    paddingVertical: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    textAlign: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  stepBtn: {
    width: theme.hitTarget.regular,
    height: theme.hitTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface.elevated,
  },
  stepBtnText: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  suggestBtn: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.accent.border,
    borderRadius: theme.borderRadius.md,
  },
  suggestText: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  hint: {
    marginTop: theme.spacing.sm,
    color: theme.colors.status.warning,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  rirLabel: {
    marginTop: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  rirOptional: { color: theme.colors.text.quiet },
  rirRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  rirChip: {
    minWidth: theme.hitTarget.compact,
    minHeight: theme.hitTarget.compact,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface.elevated,
  },
  rirChipSelected: {
    borderColor: theme.colors.accent.border,
    backgroundColor: theme.colors.accent.soft,
  },
  rirChipText: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  rirChipTextSelected: { color: theme.colors.text.accent },

  autoNote: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    textAlign: 'center',
  },
  secondaryBtn: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.borderRadius.md,
  },
  secondaryBtnText: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  completeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.hitTarget.regular,
    marginTop: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.accent.main,
  },
  controlDisabled: { opacity: 0.45 },
  completeBtnText: {
    color: theme.colors.accent.on,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default SessionPlayer;
