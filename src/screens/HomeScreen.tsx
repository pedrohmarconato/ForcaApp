import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import {
  getTodaySession,
  getUpcomingSessions,
  PlannedSession,
} from '../services/trainingRepository';

// Tipagem da navegação dentro da HomeStack (HomeMain -> WorkoutDetail)
type HomeStackParamList = {
  HomeMain: undefined;
  WorkoutDetail: { sessionId: string };
};

const formatarData = (isoDate: string | null): string =>
  isoDate ? new Date(`${isoDate}T12:00:00`).toLocaleDateString('pt-BR') : '';

// Data local (não UTC) no formato YYYY-MM-DD, para comparar com scheduled_date
const hojeISO = (): string => {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
};

// Fase 3: a Home lê o plano REAL persistido — card do treino de hoje e a
// lista dos próximos treinos. As estatísticas de progresso só mostram números
// quando houver execuções registradas (Fase 4); sem amostra, exibem "—".
const HomeScreen = () => {
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList, 'HomeMain'>>();
  const { user, profile } = useAuth();
  const [todaySession, setTodaySession] = useState<PlannedSession | null>(null);
  const [upcoming, setUpcoming] = useState<PlannedSession[]>([]);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "nenhum treino": estados distintos (achado #9 do review)
  const [loadError, setLoadError] = useState(false);

  const userName = profile?.full_name || 'Atleta';

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [hoje, proximos] = await Promise.all([
        getTodaySession(user.id),
        getUpcomingSessions(user.id, 5),
      ]);
      setTodaySession(hoje);
      // A lista não repete o treino que já está no card de hoje
      setUpcoming(proximos.filter((sessao) => sessao.id !== hoje?.id));
    } catch (error) {
      console.error('Erro ao buscar treinos:', error);
      setTodaySession(null);
      setUpcoming([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // Depende do ID (estável), não da identidade do objeto user: evita
    // relançar o efeito a cada render se o contexto recriar o objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const abrirDetalhe = (sessionId: string) => {
    navigation.navigate('WorkoutDetail', { sessionId });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá,</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <Feather name="bell" size={24} color="#EBFF00" />
          </TouchableOpacity>
        </View>

        {/* Treino de hoje/próximo (dado real do plano; rótulo honesto — achado #8) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {todaySession && todaySession.scheduled_date !== hojeISO()
              ? 'Seu próximo treino'
              : 'Seu treino de hoje'}
          </Text>
          {loading ? (
            <Text style={styles.loadingText}>Carregando treino...</Text>
          ) : loadError ? (
            <View style={styles.todayWorkoutCard}>
              <View style={styles.workoutInfo}>
                <Text style={styles.workoutTitle}>Não foi possível carregar</Text>
                <Text style={styles.workoutDescription}>
                  Verifique a conexão e tente novamente.
                </Text>
              </View>
            </View>
          ) : todaySession ? (
            <TouchableOpacity
              style={styles.todayWorkoutCard}
              onPress={() => abrirDetalhe(todaySession.id)}
            >
              <View style={styles.workoutInfo}>
                <Text style={styles.workoutTitle}>{todaySession.title}</Text>
                <Text style={styles.workoutDescription}>
                  {todaySession.muscle_groups?.length
                    ? todaySession.muscle_groups.join(' · ')
                    : todaySession.session_type || 'Sessão do seu plano'}
                </Text>
                <View style={styles.workoutMeta}>
                  {todaySession.estimated_minutes ? (
                    <View style={styles.metaItem}>
                      <Feather name="clock" size={16} color="#EBFF00" />
                      <Text style={styles.metaText}>{todaySession.estimated_minutes} min</Text>
                    </View>
                  ) : null}
                  <View style={styles.metaItem}>
                    <Feather name="calendar" size={16} color="#EBFF00" />
                    <Text style={styles.metaText}>
                      Semana {todaySession.week_number}
                      {todaySession.scheduled_date
                        ? ` · ${formatarData(todaySession.scheduled_date)}`
                        : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={() => abrirDetalhe(todaySession.id)}
                >
                  <Text style={styles.startButtonText}>Ver treino</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.todayWorkoutCard}>
              <View style={styles.workoutInfo}>
                <Text style={styles.workoutTitle}>Nenhum treino pendente</Text>
                <Text style={styles.workoutDescription}>
                  Complete o questionário e gere seu plano para começar.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Próximos treinos (lista real do plano) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Próximos treinos</Text>
          </View>

          {loading ? (
            <Text style={styles.loadingText}>Carregando treinos...</Text>
          ) : loadError ? (
            <Text style={styles.noWorkoutsText}>
              Não foi possível carregar seus treinos.
            </Text>
          ) : upcoming.length > 0 ? (
            upcoming.map((sessao) => (
              <TouchableOpacity
                key={sessao.id}
                style={styles.workoutCard}
                onPress={() => abrirDetalhe(sessao.id)}
              >
                <View style={styles.workoutCardContent}>
                  <Text style={styles.workoutCardTitle}>{sessao.title}</Text>
                  <Text style={styles.workoutCardDescription}>
                    {sessao.muscle_groups?.length
                      ? sessao.muscle_groups.join(' · ')
                      : sessao.session_type || ''}
                  </Text>
                  <View style={styles.workoutCardMeta}>
                    <Text style={styles.workoutCardDate}>
                      Semana {sessao.week_number}
                      {sessao.scheduled_date ? ` · ${formatarData(sessao.scheduled_date)}` : ''}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={24} color="#EBFF00" />
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noWorkoutsText}>Nenhum treino agendado</Text>
          )}
        </View>

        {/* Progresso: sem execuções registradas ainda (Fase 4), sem número inventado */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seu progresso</Text>
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Estatísticas da semana</Text>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>—</Text>
                <Text style={styles.statLabel}>Treinos</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>—</Text>
                <Text style={styles.statLabel}>Tempo total</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>—</Text>
                <Text style={styles.statLabel}>Calorias</Text>
              </View>
            </View>
            <Text style={styles.progressHint}>
              Disponível quando você concluir seus primeiros treinos.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(235, 255, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  todayWorkoutCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  workoutInfo: {
    padding: 16,
  },
  workoutTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  workoutDescription: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    marginBottom: 16,
  },
  workoutMeta: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaText: {
    color: '#FFFFFF',
    marginLeft: 4,
    fontSize: 14,
  },
  startButton: {
    backgroundColor: '#EBFF00',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#0A0A0A',
    fontWeight: 'bold',
    fontSize: 16,
  },
  workoutCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workoutCardContent: {
    flex: 1,
  },
  workoutCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  workoutCardDescription: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    marginBottom: 8,
  },
  workoutCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutCardDate: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.5,
  },
  progressCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EBFF00',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  progressHint: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.5,
    marginTop: 12,
    textAlign: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    textAlign: 'center',
    padding: 16,
  },
  noWorkoutsText: {
    color: '#FFFFFF',
    opacity: 0.7,
    textAlign: 'center',
    padding: 16,
  },
});

export default HomeScreen;
