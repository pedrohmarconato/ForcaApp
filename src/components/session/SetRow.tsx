// src/components/session/SetRow.tsx
// Fase 4 — uma linha por série planejada. Estados: pendente → ativa → feita.
//  - pendente: botão "Iniciar série" (revela os inputs);
//  - ativa: reps, carga (stepper pelo incremento do exercício), RIR opcional;
//  - feita: reps/carga reais + selo do outcome (under/on_target/over) e descanso.
// Bodyweight não pede kg. Sem carga sugerida (1ª vez), o aluno informa — nunca
// se inventa um número.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import theme from '../../theme/theme';
import RestTimer from './RestTimer';
import {
  canCompleteSet,
  type DraftExercise,
  type DraftSet,
  type Outcome,
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

const OUTCOME_LABEL: Record<Outcome, string> = {
  on_target: 'No alvo',
  under: 'Abaixo',
  over: 'Acima',
};
const outcomeColor = (o: Outcome): string =>
  o === 'on_target'
    ? theme.colors.status.success
    : o === 'under'
      ? theme.colors.status.warning
      : theme.colors.status.info;

const repsAlvo = (set: DraftSet): string =>
  set.targetRepsMin === set.targetRepsMax
    ? `${set.targetRepsMin}`
    : `${set.targetRepsMin}–${set.targetRepsMax}`;

type Props = {
  exercise: DraftExercise;
  set: DraftSet;
  suggestedLoad: number | null;
  isLast: boolean;
};

const SetRow = ({ exercise, set, suggestedLoad, isLast }: Props) => {
  const activateSet = useActiveSessionStore((s) => s.activateSet);
  const setReps = useActiveSessionStore((s) => s.setReps);
  const setLoad = useActiveSessionStore((s) => s.setLoad);
  const stepLoad = useActiveSessionStore((s) => s.stepLoad);
  const setRir = useActiveSessionStore((s) => s.setRir);
  const completeSet = useActiveSessionStore((s) => s.completeSet);
  const [saving, setSaving] = useState(false);

  const podeConcluir = canCompleteSet(set, exercise.isBodyweight);

  const onConcluir = async () => {
    setSaving(true);
    try {
      await completeSet(exercise.exerciseId, set.setOrder);
    } finally {
      setSaving(false);
    }
  };

  // --- Série concluída ---
  if (set.status === 'done') {
    const carga = exercise.isBodyweight
      ? 'peso corporal'
      : set.actualLoadKg != null
        ? `${set.actualLoadKg} kg`
        : '—';
    return (
      <View style={[styles.card, styles.cardDone]}>
        <View style={styles.headerRow}>
          <Text style={styles.setLabel}>Série {set.setOrder}</Text>
          {set.outcome ? (
            <Text style={[styles.chip, { color: outcomeColor(set.outcome) }]}>
              {OUTCOME_LABEL[set.outcome]}
            </Text>
          ) : null}
        </View>
        <Text style={styles.doneText}>
          {set.actualReps} reps
          {exercise.isBodyweight ? ' · peso corporal' : ` × ${carga}`}
          {set.actualRir != null ? ` · RIR ${set.actualRir}` : ''}
        </Text>
        {!isLast && exercise.restSeconds ? (
          <RestTimer seconds={exercise.restSeconds} />
        ) : null}
      </View>
    );
  }

  // --- Série pendente ---
  if (set.status === 'pending') {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.setLabel}>Série {set.setOrder}</Text>
          <Text style={styles.target}>alvo {repsAlvo(set)} reps</Text>
        </View>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => activateSet(exercise.exerciseId, set.setOrder)}
        >
          <Text style={styles.startBtnText}>Iniciar série</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Série ativa ---
  const precisaCarga =
    !exercise.isBodyweight && suggestedLoad == null && set.actualLoadKg == null;
  return (
    <View style={[styles.card, styles.cardActive]}>
      <View style={styles.headerRow}>
        <Text style={styles.setLabel}>Série {set.setOrder}</Text>
        <Text style={styles.target}>alvo {repsAlvo(set)} reps</Text>
      </View>

      <View style={styles.inputsRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Reps</Text>
          <TextInput
            style={styles.repsInput}
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
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Carga</Text>
            <Text style={styles.bodyweightTag}>Peso corporal</Text>
          </View>
        ) : (
          <View style={styles.fieldWide}>
            <Text style={styles.fieldLabel}>Carga (kg)</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, saving && styles.controlDisabled]}
                onPress={() => stepLoad(exercise.exerciseId, set.setOrder, -1)}
                disabled={saving}
                accessibilityLabel={`Diminuir carga da série ${set.setOrder}`}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.loadInput}
                editable={!saving}
                keyboardType="numeric"
                value={set.actualLoadKg != null ? String(set.actualLoadKg) : ''}
                onChangeText={(t) =>
                  setLoad(
                    exercise.exerciseId,
                    set.setOrder,
                    parseFloatOrNull(t),
                  )
                }
                placeholder={
                  suggestedLoad != null ? String(suggestedLoad) : 'kg'
                }
                placeholderTextColor={theme.colors.text.quiet}
                accessibilityLabel={`Carga da série ${set.setOrder}`}
              />
              <TouchableOpacity
                style={[styles.stepBtn, saving && styles.controlDisabled]}
                onPress={() => stepLoad(exercise.exerciseId, set.setOrder, 1)}
                disabled={saving}
                accessibilityLabel={`Aumentar carga da série ${set.setOrder}`}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>RIR</Text>
          <TextInput
            style={styles.repsInput}
            editable={!saving}
            keyboardType="number-pad"
            value={set.actualRir != null ? String(set.actualRir) : ''}
            onChangeText={(t) => {
              const v = parseIntOrNull(t);
              setRir(
                exercise.exerciseId,
                set.setOrder,
                v == null ? null : Math.min(10, Math.max(0, v)),
              );
            }}
            placeholder="—"
            placeholderTextColor={theme.colors.text.quiet}
            accessibilityLabel={`RIR da série ${set.setOrder}`}
          />
        </View>
      </View>

      {/* F10: a sugestão só vira valor gravado quando o aluno ACEITA (toca) ou digita. */}
      {!exercise.isBodyweight &&
      suggestedLoad != null &&
      set.actualLoadKg == null ? (
        <TouchableOpacity
          style={[styles.suggestBtn, saving && styles.controlDisabled]}
          onPress={() =>
            setLoad(exercise.exerciseId, set.setOrder, suggestedLoad)
          }
          disabled={saving}
        >
          <Text style={styles.suggestText}>
            Usar sugestão: {suggestedLoad} kg
          </Text>
        </TouchableOpacity>
      ) : null}

      {precisaCarga ? (
        <Text style={styles.hint}>
          Primeira vez neste exercício: informe a carga usada.
        </Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.completeBtn,
          (!podeConcluir || saving) && styles.completeBtnDisabled,
        ]}
        onPress={onConcluir}
        disabled={!podeConcluir || saving}
      >
        {saving ? (
          <ActivityIndicator
            color={theme.colors.accent.on}
            size="small"
          />
        ) : (
          <Text style={styles.completeBtnText}>Concluir série</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface.card,
  },
  // Série ativa: só a borda muda. É o foco do momento, não um bloco aceso.
  cardActive: { borderColor: theme.colors.border.focus },
  cardDone: { opacity: 0.9 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setLabel: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  target: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  chip: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  doneText: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },

  startBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.hitTarget.compact,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.accent.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent.soft,
  },
  startBtnText: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  field: { flex: 1 },
  fieldWide: { flex: 1.6 },
  fieldLabel: {
    marginBottom: theme.spacing.xxs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  repsInput: {
    minHeight: theme.hitTarget.compact,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    textAlign: 'center',
  },
  bodyweightTag: {
    paddingVertical: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    textAlign: 'center',
  },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  stepBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
  },
  stepBtnText: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  loadInput: {
    flex: 1,
    minHeight: theme.hitTarget.compact,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    textAlign: 'center',
  },

  // Pendência de preenchimento: estado digital, resolvido em âmbar — não neon.
  hint: {
    marginTop: theme.spacing.sm,
    color: theme.colors.status.warning,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  suggestBtn: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
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

  completeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.hitTarget.compact,
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent.main,
  },
  completeBtnDisabled: { opacity: 0.45 },
  controlDisabled: { opacity: 0.45 },
  completeBtnText: {
    color: theme.colors.accent.on,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default SetRow;
