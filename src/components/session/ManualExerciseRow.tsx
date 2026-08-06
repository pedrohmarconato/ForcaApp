import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';
import { formatWorkDuration, type ManualExerciseDraft } from '../../types/manualPlan';

const metricLabel = (exercise: ManualExerciseDraft): string => {
  if (exercise.metrica === 'carga_reps') {
    return `${exercise.series} séries × ${exercise.repeticoes || 'reps a definir'}`;
  }
  const duration = formatWorkDuration(exercise.duracao_minutos) ?? 'tempo a definir';
  const distance = exercise.distancia_km != null ? ` · ${exercise.distancia_km} km` : '';
  return `${exercise.series} séries × ${duration}${distance}`;
};

type Props = {
  exercise: ManualExerciseDraft;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
};

const Action = ({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress?: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={!onPress}
    onPress={onPress}
    hitSlop={theme.spacing.sm}
    style={[styles.action, !onPress && styles.actionDisabled]}
  >
    <Feather name={icon} size={14} color={theme.colors.text.secondary} />
  </Pressable>
);

const ManualExerciseRow = ({
  exercise,
  index,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) => (
  <View style={styles.row}>
    <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Editar ${exercise.nome}`}
      style={styles.body}
    >
      <Text style={styles.name}>{exercise.nome}</Text>
      <Text style={styles.target}>{metricLabel(exercise)}</Text>
      {exercise.equipamento ? <Text style={styles.meta}>{exercise.equipamento}</Text> : null}
    </Pressable>
    <View style={styles.actions}>
      <Action label="Mover para cima" icon="chevron-up" onPress={onMoveUp} />
      <Action label="Mover para baixo" icon="chevron-down" onPress={onMoveDown} />
      <Action label="Remover exercício" icon="trash-2" onPress={onRemove} />
    </View>
  </View>
);

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
    minWidth: theme.spacing.xl,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  target: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  meta: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
  actions: { justifyContent: 'space-between' },
  action: { padding: theme.spacing.xxs },
  actionDisabled: { opacity: 0.25 },
});

export default ManualExerciseRow;
