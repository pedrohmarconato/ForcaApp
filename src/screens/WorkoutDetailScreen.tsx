import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { supabase } from '../services/supabase/supabase';
import theme from '../theme/theme';

const WorkoutDetailScreen = ({ route }) => {
  const { trainingId } = route.params;
  const [trainingDetails, setTrainingDetails] = useState(null);
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    fetchTrainingDetails();
  }, [trainingId]);

  const fetchTrainingDetails = async () => {
    try {
      const { data: trainingData, error: trainingError } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('id', trainingId)
        .single();

      if (trainingError) throw trainingError;

      const { data: exercisesData, error: exercisesError } = await supabase
        .from('training_exercises')
        .select('*')
        .eq('training_session_id', trainingId);

      if (exercisesError) throw exercisesError;

      setTrainingDetails(trainingData);
      setExercises(exercisesData);
    } catch (err) {
      console.error('Erro ao buscar detalhes do treino:', err);
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

  if (!trainingDetails) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{trainingDetails.name}</Text>
      <Text style={styles.date}>
        {new Date(trainingDetails.date).toLocaleDateString()}
      </Text>
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
  loading: {
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: 32,
  },
});

export default WorkoutDetailScreen;