// src/components/session/PlannedExerciseRow.tsx
// Linha de exercício planejado — compartilhada pela visão do plano e pelo
// detalhe da sessão, para que as duas telas tenham a mesma geometria.
//
// Só mostra o que existe de fato: descanso ou %RM ausentes não viram
// instrução inventada, simplesmente não aparecem.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import theme from '../../theme/theme';
import { formatExerciseTarget, PlannedExercise } from '../../services/trainingRepository';

/** Ordem de leitura: primário primeiro, acessório por último. */
const ROTULO_PRIORIDADE: Record<PlannedExercise['priority'], string | null> = {
  primary: 'Principal',
  secondary: null,
  accessory: 'Acessório',
};

type PlannedExerciseRowProps = {
  exercise: PlannedExercise;
  /** Posição do exercício na sessão, exibida como índice discreto. */
  index?: number;
};

const PlannedExerciseRow = ({ exercise, index }: PlannedExerciseRowProps) => {
  const meta = [
    exercise.target_rm_percent != null ? `${exercise.target_rm_percent}% RM` : null,
    exercise.rest_seconds != null ? `descanso ${exercise.rest_seconds}s` : null,
  ].filter(Boolean);

  const prioridade = ROTULO_PRIORIDADE[exercise.priority];

  return (
    <View style={styles.row}>
      {index != null ? (
        <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
      ) : null}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{exercise.name}</Text>
          {prioridade ? <Text style={styles.priority}>{prioridade}</Text> : null}
        </View>

        <Text style={styles.target}>{formatExerciseTarget(exercise)}</Text>
        {meta.length > 0 ? <Text style={styles.meta}>{meta.join(' · ')}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface.card,
  },
  index: {
    minWidth: 20,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  name: {
    flex: 1,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  priority: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  target: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  meta: {
    marginTop: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
});

export default PlannedExerciseRow;
