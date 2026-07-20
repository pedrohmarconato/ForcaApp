import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import type { TrainingStackParamList } from '../navigation/MainNavigator';
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
  const navigation = useNavigation<StackNavigationProp<TrainingStackParamList, 'TrainingOverview'>>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "não há treino": estados distintos (achado #9 do review)
  const [loadError, setLoadError] = useState(false);
  const { user } = useAuth();

  const fetchCurrentTraining = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
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
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // Depende do ID (estável), não da identidade do objeto user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchCurrentTraining();
  }, [fetchCurrentTraining]);

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
        <Text style={styles.noTrainingText}>Carregando treino...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.noTrainingText}>
          Não foi possível carregar seu treino. Verifique a conexão e tente novamente.
        </Text>
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
        style={styles.list}
        data={session.planned_exercises}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id}
      />
      <TouchableOpacity
        style={styles.startButton}
        onPress={() => navigation.navigate('ActiveSession', { sessionId: session.id })}
      >
        <Text style={styles.startButtonText}>
          {session.status === 'in_progress' ? 'Retomar treino' : 'Iniciar treino'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface.canvas,
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
  list: {
    flex: 1,
  },
  startButton: {
    backgroundColor: theme.colors.accent.main,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  startButtonText: {
    color: theme.colors.accent.on,
    fontWeight: '700',
    fontSize: 16,
  },
  exerciseItem: {
    backgroundColor: theme.colors.surface.card,
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
