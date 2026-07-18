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
            placeholderTextColor={theme.colors.text.muted}
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
                placeholderTextColor={theme.colors.text.muted}
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
            placeholderTextColor={theme.colors.text.muted}
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
            color={theme.colors.primary.contrast}
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
    backgroundColor: theme.colors.background.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  cardActive: { borderColor: theme.colors.border.focus },
  cardDone: { opacity: 0.9 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setLabel: {
    color: theme.colors.text.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  target: { color: theme.colors.text.muted, fontSize: 13 },
  chip: { fontWeight: '700', fontSize: 13 },
  doneText: { color: theme.colors.text.secondary, marginTop: 6, fontSize: 14 },
  startBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(235, 255, 0, 0.12)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  startBtnText: { color: theme.colors.primary.main, fontWeight: '700' },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  field: { flex: 1 },
  fieldWide: { flex: 1.6 },
  fieldLabel: { color: theme.colors.text.muted, fontSize: 12, marginBottom: 4 },
  repsInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    color: theme.colors.text.primary,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 16,
  },
  bodyweightTag: {
    color: theme.colors.text.secondary,
    paddingVertical: 10,
    textAlign: 'center',
    fontStyle: 'italic',
    fontSize: 13,
  },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: {
    color: theme.colors.primary.main,
    fontSize: 22,
    fontWeight: '700',
  },
  loadInput: {
    flex: 1,
    marginHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    color: theme.colors.text.primary,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 16,
  },
  hint: { color: theme.colors.status.warning, fontSize: 12, marginTop: 8 },
  suggestBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.focus,
  },
  suggestText: {
    color: theme.colors.primary.main,
    fontSize: 13,
    fontWeight: '600',
  },
  completeBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.primary.main,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.4 },
  controlDisabled: { opacity: 0.4 },
  completeBtnText: {
    color: theme.colors.primary.contrast,
    fontWeight: '700',
    fontSize: 15,
  },
});

export default SetRow;
