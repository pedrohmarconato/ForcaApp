import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import ManualExerciseRow from '../components/session/ManualExerciseRow';
import {
  Button,
  CheckboxRow,
  DayToggle,
  EmptyState,
  Screen,
  SectionHeader,
  StackHeader,
  TextField,
} from '../components/ui';
import { useManualPlanStore } from '../store/manualPlanStore';
import theme from '../theme/theme';

const DAYS = [
  { label: 'S', full: 'Segunda-feira' },
  { label: 'T', full: 'Terça-feira' },
  { label: 'Q', full: 'Quarta-feira' },
  { label: 'Q', full: 'Quinta-feira' },
  { label: 'S', full: 'Sexta-feira' },
  { label: 'S', full: 'Sábado' },
  { label: 'D', full: 'Domingo' },
] as const;

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const ManualWorkoutEditorScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const workoutIndex = route.params?.workoutIndex ?? 0;
  const workout = useManualPlanStore((state) => state.draft?.treinos[workoutIndex]);
  const renameWorkout = useManualPlanStore((state) => state.renameWorkout);
  const setWorkoutDay = useManualPlanStore((state) => state.setWorkoutDay);
  const setWorkoutDuration = useManualPlanStore((state) => state.setWorkoutDuration);
  const toggleWarmup = useManualPlanStore((state) => state.toggleWarmup);
  const toggleStretch = useManualPlanStore((state) => state.toggleStretch);
  const removeExercise = useManualPlanStore((state) => state.removeExercise);
  const reorderExercise = useManualPlanStore((state) => state.reorderExercise);

  if (!workout) {
    return (
      <Screen>
        <StackHeader title="Treino" onBack={() => navigation.goBack()} />
        <EmptyState title="Treino não encontrado" description="Volte ao plano e tente novamente." />
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={workout.nome || 'Treino'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TextField
          label="Nome do treino"
          value={workout.nome}
          maxLength={60}
          onChangeText={(value) => renameWorkout(workoutIndex, value)}
        />

        <SectionHeader title="Dia da semana" />
        <View style={styles.days}>
          {DAYS.map((day, index) => (
            <DayToggle
              key={day.full}
              label={day.label}
              accessibilityLabel={day.full}
              selected={workout.dia_offset === index}
              onPress={() => setWorkoutDay(workoutIndex, index)}
            />
          ))}
        </View>
        <Button
          label="Sem dia fixo"
          variant={workout.dia_offset === null ? 'tonal' : 'ghost'}
          compact
          onPress={() => setWorkoutDay(workoutIndex, null)}
          style={styles.noDay}
        />

        <TextField
          label="Estimativa do treino (min, opcional)"
          value={workout.duracao_minutos == null ? '' : String(workout.duracao_minutos)}
          placeholder="O servidor estima pelo volume"
          keyboardType="number-pad"
          onChangeText={(value) => setWorkoutDuration(workoutIndex, numberOrNull(value))}
        />

        <View style={styles.options}>
          <CheckboxRow
            label="Incluir aquecimento"
            checked={workout.incluir_aquecimento}
            onPress={() => toggleWarmup(workoutIndex)}
          />
          <Text style={styles.support}>Adiciona Aquecimento Articular (5 min) no começo.</Text>
          <CheckboxRow
            label="Incluir alongamento"
            checked={workout.incluir_alongamento}
            onPress={() => toggleStretch(workoutIndex)}
          />
          <Text style={styles.support}>Adiciona Alongamento Dinâmico (5 min) no fim.</Text>
        </View>

        <SectionHeader title="Exercícios" />
        {workout.exercicios.length === 0 ? (
          <EmptyState
            icon="activity"
            title="Nenhum exercício ainda"
            description="Escolha da lista ou escreva um nome livre."
          />
        ) : (
          workout.exercicios.map((exercise, index) => (
            <ManualExerciseRow
              key={`${exercise.exercise_key ?? exercise.nome}-${index}`}
              exercise={exercise}
              index={index}
              onEdit={() => navigation.navigate('ExercisePicker', { workoutIndex, exerciseIndex: index })}
              onRemove={() => removeExercise(workoutIndex, index)}
              onMoveUp={index > 0 ? () => reorderExercise(workoutIndex, index, index - 1) : undefined}
              onMoveDown={
                index < workout.exercicios.length - 1
                  ? () => reorderExercise(workoutIndex, index, index + 1)
                  : undefined
              }
            />
          ))
        )}
        <Button
          label="Adicionar exercício"
          variant="tonal"
          icon="plus"
          onPress={() => navigation.navigate('ExercisePicker', { workoutIndex })}
        />
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.huge,
  },
  days: { flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.sm },
  noDay: { alignSelf: 'flex-start', marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  options: { gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  support: {
    marginLeft: theme.spacing.xxl,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
});

export default ManualWorkoutEditorScreen;
