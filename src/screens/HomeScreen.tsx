import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

// You may need to adjust these imports based on your project structure
import { supabase } from '../config/supabaseClient';

const HomeScreen = () => {
  const navigation = useNavigation();
  const [workouts, setWorkouts] = useState([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Só busca dados se o usuário estiver autenticado
    if (supabase.auth.getSession()) {
      fetchUserProfile();
      fetchWorkouts();
    }
  }, []);

  const fetchUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }
        if (data) setUserName(data.full_name || 'Atleta');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Nu00e3o tenta novamente em caso de erro
    }
  };

  const fetchWorkouts = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setWorkouts([]);
        return;
      }
      
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching workouts:', error);
        return;
      }
      if (data) setWorkouts(data);
    } catch (error) {
      console.error('Error fetching workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateToWorkoutDetail = (workout) => {
    navigation.navigate('WorkoutDetail', { workout });
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

        {/* Today's Workout Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seu treino de hoje</Text>
          <TouchableOpacity style={styles.todayWorkoutCard}>
            <View style={styles.workoutInfo}>
              <Text style={styles.workoutTitle}>Treino de Força</Text>
              <Text style={styles.workoutDescription}>Foco em membros superiores</Text>
              <View style={styles.workoutMeta}>
                <View style={styles.metaItem}>
                  <Feather name="clock" size={16} color="#EBFF00" />
                  <Text style={styles.metaText}>45 min</Text>
                </View>
                <View style={styles.metaItem}>
                  <Feather name="zap" size={16} color="#EBFF00" />
                  <Text style={styles.metaText}>Intensidade média</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.startButton}>
                <Text style={styles.startButtonText}>Iniciar Treino</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>

        {/* Recent Workouts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Treinos recentes</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <Text style={styles.loadingText}>Carregando treinos...</Text>
          ) : workouts.length > 0 ? (
            workouts.map((workout, index) => (
              <TouchableOpacity 
                key={workout.id || index} 
                style={styles.workoutCard}
                onPress={() => navigateToWorkoutDetail(workout)}
              >
                <View style={styles.workoutCardContent}>
                  <Text style={styles.workoutCardTitle}>{workout.name || 'Treino sem nome'}</Text>
                  <Text style={styles.workoutCardDescription}>{workout.description || 'Sem descrição'}</Text>
                  <View style={styles.workoutCardMeta}>
                    <Text style={styles.workoutCardDate}>
                      {new Date(workout.created_at).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={24} color="#EBFF00" />
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noWorkoutsText}>Nenhum treino encontrado</Text>
          )}
        </View>

        {/* Progress Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seu progresso</Text>
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Estatísticas da semana</Text>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>5</Text>
                <Text style={styles.statLabel}>Treinos</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>3.5h</Text>
                <Text style={styles.statLabel}>Tempo total</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>2500</Text>
                <Text style={styles.statLabel}>Calorias</Text>
              </View>
            </View>
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
  seeAllText: {
    color: '#EBFF00',
    fontSize: 14,
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