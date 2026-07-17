import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import theme from '../theme/theme';
import {
  getSessionDetail,
  formatExerciseTarget,
  SessionDetail,
  PlannedExercise,
} from '../services/trainingRepository';

// Fase 3: detalhe de uma sessão planejada (aberta a partir da Home).
// Recebe { sessionId } — o ID real de planned_sessions.
const WorkoutDetailScreen = ({ route }: { route: { params: { sessionId: string } } }) => {
  const { sessionId } = route.params;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "treino não encontrado": estados distintos (achado #9)
  const [loadError, setLoadError] = useState(false);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const detalhe = await getSessionDetail(sessionId);
      setSession(detalhe);
    } catch (err) {
      console.error('Erro ao buscar detalhes do treino:', err);
      setSession(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const renderExerciseItem = ({ item }: { item: PlannedExercise }) => {
    // Só mostra o que existe de fato — descanso ausente não vira instrução inventada
    const meta = [
      item.target_rm_percent != null ? `${item.target_rm_percent}% RM` : null,
      item.rest_seconds != null ? `descanso ${item.rest_seconds}s` : null,
    ].filter(Boolean);
    return (
      <View style={styles.exerciseItem}>
        <Text style={styles.exerciseName}>{item.name}</Text>
        <Text style={styles.exerciseDetails}>{formatExerciseTarget(item)}</Text>
        {meta.length > 0 ? <Text style={styles.exerciseMeta}>{meta.join(' · ')}</Text> : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Carregando...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>
          Não foi possível carregar o treino. Verifique a conexão e tente novamente.
        </Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Treino não encontrado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{session.title}</Text>
      <Text style={styles.date}>
        Semana {session.week_number}
        {session.scheduled_date
          ? ` · ${new Date(`${session.scheduled_date}T12:00:00`).toLocaleDateString('pt-BR')}`
          : ''}
        {session.muscle_groups?.length ? ` · ${session.muscle_groups.join(', ')}` : ''}
      </Text>
      <FlatList
        data={session.planned_exercises}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.dark,
    padding: 16,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  date: {
    color: theme.colors.text.secondary,
    marginBottom: 16,
  },
  exerciseItem: {
    backgroundColor: theme.colors.background.card,
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  exerciseName: {
    color: theme.colors.text.primary,
    fontSize: 18,
  },
  exerciseDetails: {
    color: theme.colors.text.secondary,
  },
  exerciseMeta: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    marginTop: 4,
  },
  loading: {
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: 32,
  },
});

export default WorkoutDetailScreen;
