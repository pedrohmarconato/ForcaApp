import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase/supabase';
import theme from '../theme/theme';

const TrainingSessionScreen = () => {
  const [currentTraining, setCurrentTraining] = useState(null);
  const [exercises, setExercises] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    fetchCurrentTraining();
  }, [user]);

  const fetchCurrentTraining = async () => {
    if (!user) return;

    try {
      // Buscar treino atual do usuário
      const { data: trainingData, error: trainingError } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .single();

      if (trainingError) throw trainingError;

      const { data: exercisesData, error: exercisesError } = await supabase
        .from('training_exercises')
        .select('*')
        .eq('training_session_id', trainingData.id);

      if (exercisesError) throw exercisesError;

      setCurrentTraining(trainingData);
      setExercises(exercisesData);
    } catch (err) {
      console.error('Erro ao buscar treino:', err);
    }
  };

  const renderExerciseItem = ({ item }) => (
    <View style={styles.exerciseItem}>
      <Text style={styles.exerciseName}>{item.name}</Text>
      <Text style={styles.exerciseDetails}>
        {item.sets} séries x {item.reps} repetições
      </Text>
    </View>
  );

  if (!currentTraining) {
    return (
      <View style={styles.container}>
        <Text style={styles.noTrainingText}>Nenhum treino em andamento</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{currentTraining.name}</Text>
      <FlatList
        data={exercises}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id.toString()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    padding: 16,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 22,
    fontWeight: 'bold',
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
  noTrainingText: {
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: 32,
  },
});

export default TrainingSessionScreen;