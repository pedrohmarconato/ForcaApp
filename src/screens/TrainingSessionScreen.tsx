import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import {
  getTodaySession,
  getSessionDetail,
  formatExerciseTarget,
  SessionDetail,
  PlannedExercise,
} from '../services/trainingRepository';

// Fase 3: a tela mostra a sessão real (em andamento ou a próxima pendente)
// com exercícios e alvos por série. O registro interativo (iniciar série,
// reps/carga, timer) chega na Fase 4.
const TrainingSessionScreen = () => {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchCurrentTraining = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const proxima = await getTodaySession(user.id);
      if (!proxima) {
        setSession(null);
        return;
      }
      const detalhe = await getSessionDetail(proxima.id);
      setSession(detalhe);
    } catch (err) {
      console.error('Erro ao buscar treino:', err);
      setSession(null);
    } finally {
      setLoading(false);
    }
    // Depende do ID (estável), não da identidade do objeto user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchCurrentTraining();
  }, [fetchCurrentTraining]);

  const renderExerciseItem = ({ item }: { item: PlannedExercise }) => (
    <View style={styles.exerciseItem}>
      <Text style={styles.exerciseName}>{item.name}</Text>
      <Text style={styles.exerciseDetails}>{formatExerciseTarget(item)}</Text>
      <Text style={styles.exerciseMeta}>
        {item.target_rm_percent != null ? `${item.target_rm_percent}% RM · ` : ''}
        {item.rest_seconds != null ? `descanso ${item.rest_seconds}s` : 'descanso livre'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.noTrainingText}>Carregando treino...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.noTrainingText}>
          Nenhum treino pendente. Gere seu plano para começar.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{session.title}</Text>
      <Text style={styles.subtitle}>
        Semana {session.week_number}
        {session.scheduled_date
          ? ` · ${new Date(`${session.scheduled_date}T12:00:00`).toLocaleDateString('pt-BR')}`
          : ''}
        {session.estimated_minutes ? ` · ~${session.estimated_minutes} min` : ''}
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
  subtitle: {
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
  noTrainingText: {
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: 32,
  },
});

export default TrainingSessionScreen;
