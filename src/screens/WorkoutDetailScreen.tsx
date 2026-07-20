// src/screens/WorkoutDetailScreen.tsx
// Detalhe de uma sessão planejada, aberta a partir da Home.
// Recebe { sessionId } — o ID real de planned_sessions.
//
// Mesma geometria da visão do plano (princípio 4): resumo em card de destaque,
// lista de exercícios idêntica e ação única no rodapé.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import theme from '../theme/theme';
import type { HomeStackParamList } from '../navigation/MainNavigator';
import {
  getSessionDetail,
  SessionDetail,
  PlannedExercise,
} from '../services/trainingRepository';
import { Screen, Card, ScreenTitle } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice } from '../components/ui/Feedback';
import PlannedExerciseRow from '../components/session/PlannedExerciseRow';

const WorkoutDetailScreen = ({ route }: { route: { params: { sessionId: string } } }) => {
  const { sessionId } = route.params;
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList, 'WorkoutDetail'>>();
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

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent.main} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <ScreenTitle kicker="Treino" title="Detalhe da sessão." />
        <Notice
          tone="danger"
          title="Falha ao carregar"
          description="Não foi possível carregar o treino. Verifique a conexão e tente novamente."
          action={<Button label="Tentar novamente" variant="outline" compact onPress={fetchDetails} />}
        />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <ScreenTitle kicker="Treino" title="Detalhe da sessão." />
        <EmptyState icon="search" title="Treino não encontrado." />
      </Screen>
    );
  }

  const jaConcluido = session.status === 'completed';
  const emAndamento = session.status === 'in_progress';
  const ctaLabel = emAndamento ? 'Retomar treino' : 'Iniciar treino';
  const dataFormatada = session.scheduled_date
    ? new Date(`${session.scheduled_date}T12:00:00`).toLocaleDateString('pt-BR')
    : null;

  const renderExerciseItem = ({ item, index }: { item: PlannedExercise; index: number }) => (
    <PlannedExerciseRow exercise={item} index={index} />
  );

  return (
    <Screen>
      <Card elevated style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryLabel}>Sessão do plano</Text>
            <Text style={styles.summaryTitle}>{session.title}</Text>
          </View>
          <Chip
            label={jaConcluido ? 'Concluído' : `Semana ${session.week_number}`}
            tone={jaConcluido ? 'accent' : 'neutral'}
          />
        </View>

        <View style={styles.summaryMeta}>
          {dataFormatada ? <Text style={styles.summaryMetaItem}>{dataFormatada}</Text> : null}
          {session.muscle_groups?.length ? (
            <Text style={styles.summaryMetaItem}>{session.muscle_groups.join(', ')}</Text>
          ) : null}
          {session.estimated_minutes ? (
            <Text style={styles.summaryMetaItem}>~{session.estimated_minutes} min</Text>
          ) : null}
        </View>
      </Card>

      <Text style={styles.listTitle}>Exercícios</Text>

      <FlatList
        style={styles.list}
        data={session.planned_exercises}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.footer}>
        {jaConcluido ? (
          <Text style={styles.doneNote}>
            Treino concluído. Veja o registro no seu histórico (aba Perfil).
          </Text>
        ) : (
          <Button
            label={ctaLabel}
            icon="arrow-right"
            onPress={() => navigation.navigate('ActiveSession', { sessionId: session.id })}
          />
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summary: { marginBottom: theme.spacing.xl },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  summaryMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  summaryMetaItem: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  listTitle: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: theme.spacing.lg },

  footer: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  doneNote: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    textAlign: 'center',
  },
});

export default WorkoutDetailScreen;
