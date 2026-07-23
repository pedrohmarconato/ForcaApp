// src/components/session/SessionQueue.tsx
// Redesign da sessão — a fila compacta embaixo do player: todo o treino num
// relance, uma LINHA por série (nada de cards com botões repetidos).
//   ✓ feita  → resultado real (reps × carga · fôlego)
//   → agora  → série ativa no player
//   · alvo   → pendente; tocar pula direto para ela (flexibilidade preservada)

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../../theme/theme';
import { type SessionDraft, type DraftExercise, type DraftSet } from '../../engine/sessionModel';
import { useActiveSessionStore } from '../../store/activeSessionStore';
import { repsAlvo } from './SessionPlayer';

type Props = {
  draft: SessionDraft;
  /** Meta do exercício vinda do plano (ex.: "4 séries × 8-10 · 80% RM · descanso 90s"). */
  metaFor: (exercise: DraftExercise) => string | null;
};

const doneLine = (exercise: DraftExercise, set: DraftSet): string => {
  const carga = exercise.isBodyweight
    ? 'peso corporal'
    : set.actualLoadKg != null
      ? `${set.actualLoadKg} kg`
      : '—';
  const folego = set.actualRir != null ? ` · fôlego ${set.actualRir}` : '';
  return `${set.actualReps} reps ${exercise.isBodyweight ? '· ' : '× '}${carga}${folego}`;
};

const SessionQueue = ({ draft, metaFor }: Props) => {
  const activateSet = useActiveSessionStore((s) => s.activateSet);

  return (
    <View>
      {draft.exercises.map((ex, idxEx) => {
        const cortado = ex.cutByReplan === true;
        const series = cortado ? ex.sets.filter((s) => s.status === 'done') : ex.sets;
        const meta = metaFor(ex);
        return (
          <View key={ex.exerciseId} style={styles.block}>
            <View style={styles.headerRow}>
              <Text style={styles.order}>{String(idxEx + 1).padStart(2, '0')}</Text>
              <View style={styles.headerText}>
                <Text style={[styles.name, cortado && styles.nameCut]}>{ex.name}</Text>
                {cortado ? (
                  <Text style={styles.cutNote}>
                    Cortado por tempo — confirmado por você. As séries não feitas não
                    contam hoje.
                  </Text>
                ) : meta ? (
                  <Text style={styles.meta}>{meta}</Text>
                ) : null}
              </View>
            </View>

            {series.map((s) => {
              if (s.status === 'done') {
                return (
                  <View key={s.plannedSetId} style={styles.row}>
                    <Text style={styles.mark}>✓</Text>
                    <Text style={styles.rowLabel}>S{s.setOrder}</Text>
                    <Text style={styles.rowDone}>{doneLine(ex, s)}</Text>
                    {s.outcome === 'under' ? (
                      <Text style={[styles.outcome, { color: theme.colors.status.warning }]}>
                        abaixo
                      </Text>
                    ) : s.outcome === 'over' ? (
                      <Text style={[styles.outcome, { color: theme.colors.status.info }]}>
                        acima
                      </Text>
                    ) : null}
                  </View>
                );
              }
              if (s.status === 'active') {
                return (
                  <View key={s.plannedSetId} style={[styles.row, styles.rowActive]}>
                    <Text style={[styles.mark, styles.markActive]}>→</Text>
                    <Text style={[styles.rowLabel, styles.rowLabelActive]}>S{s.setOrder}</Text>
                    <Text style={styles.rowActiveText}>agora, no card acima</Text>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={s.plannedSetId}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`Pular para a série ${s.setOrder} de ${ex.name}`}
                  onPress={() => activateSet(ex.exerciseId, s.setOrder)}
                >
                  <Text style={styles.markPending}>·</Text>
                  <Text style={styles.rowLabel}>S{s.setOrder}</Text>
                  <Text style={styles.rowPending}>alvo {repsAlvo(s)} reps</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  block: { marginBottom: theme.spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  order: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    lineHeight: theme.typography.fontSizes.md * 1.35,
  },
  headerText: { flex: 1 },
  name: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  nameCut: { color: theme.colors.text.quiet, textDecorationLine: 'line-through' },
  meta: {
    marginTop: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  cutNote: {
    marginTop: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    fontStyle: 'italic',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.hitTarget.compact,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  rowActive: { backgroundColor: theme.colors.accent.soft },
  mark: { width: 16, textAlign: 'center', color: theme.colors.status.success },
  markActive: { color: theme.colors.text.accent },
  markPending: {
    width: 16,
    textAlign: 'center',
    color: theme.colors.text.quiet,
    fontSize: theme.typography.fontSizes.lg,
  },
  rowLabel: {
    width: 28,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  rowLabelActive: { color: theme.colors.text.accent },
  rowDone: {
    flex: 1,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  rowActiveText: {
    flex: 1,
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  rowPending: {
    flex: 1,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  outcome: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default SessionQueue;
