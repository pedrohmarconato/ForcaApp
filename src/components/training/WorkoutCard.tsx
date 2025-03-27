import React, { useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ImageBackground 
} from 'react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import theme from '../../theme/theme';

type WorkoutCardProps = {
  title: string;
  date: string;
  duration: number;
  muscleGroups: string[];
  intensity: 'low' | 'medium' | 'high';
  completed?: boolean;
  onPress: () => void;
};

export const WorkoutCard: React.FC<WorkoutCardProps> = ({
  title,
  date,
  duration,
  muscleGroups,
  intensity,
  completed = false,
  onPress,
}) => {
  // Cálculo de intensidade para renderização visual
  const intensityColor = useMemo(() => {
    const colors = {
      low: theme.colors.status.info,
      medium: theme.colors.status.warning,
      high: theme.colors.status.error,
    };
    return colors[intensity];
  }, [intensity]);

  // Formatação de data
  const formattedDate = useMemo(() => {
    try {
      return format(new Date(date), "EEE, dd 'de' MMMM", { locale: ptBR });
    } catch (error) {
      return date;
    }
  }, [date]);

  // Truncamento dos grupos musculares para exibição
  const displayMuscleGroups = useMemo(() => {
    return muscleGroups.length > 3 
      ? [...muscleGroups.slice(0, 2), `+${muscleGroups.length - 2}`] 
      : muscleGroups;
  }, [muscleGroups]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[theme.colors.background.card, 'rgba(26, 26, 26, 0.6)']}
        style={styles.gradientContainer}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {completed && (
            <View style={styles.completedBadge}>
              <Icon name="check-circle" size={16} color={theme.colors.status.success} />
              <Text style={styles.completedText}>Concluído</Text>
            </View>
          )}
        </View>
        
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Icon name="calendar" size={16} color={theme.colors.text.secondary} />
            <Text style={styles.infoText}>{formattedDate}</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Icon name="clock-outline" size={16} color={theme.colors.text.secondary} />
            <Text style={styles.infoText}>{duration} min</Text>
          </View>
        </View>
        
        <View style={styles.footer}>
          <View style={styles.muscleGroupsContainer}>
            {displayMuscleGroups.map((group, index) => (
              <View key={index} style={styles.muscleGroupBadge}>
                <Text style={styles.muscleGroupText}>{group}</Text>
              </View>
            ))}
          </View>
          
          <View style={[styles.intensityIndicator, { backgroundColor: intensityColor }]}>
            <Text style={styles.intensityText}>
              {intensity === 'low' ? 'Leve' : intensity === 'medium' ? 'Médio' : 'Intenso'}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  gradientContainer: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    flex: 1,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  completedText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.status.success,
    marginLeft: theme.spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  infoText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muscleGroupsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  muscleGroupBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  muscleGroupText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.text.secondary,
  },
  intensityIndicator: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  intensityText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeights.medium,
  },
});

export default WorkoutCard;