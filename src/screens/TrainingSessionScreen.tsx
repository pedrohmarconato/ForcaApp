// src/screens/TrainingSessionScreen.tsx
// Tela 05 do fluxo — "Plano": a sessão corrente (em andamento ou a próxima
// pendente) com seus exercícios e alvos por série.
//
// Apresentação na Direção 02: resumo do ciclo em card de destaque, lista de
// exercícios com a mesma geometria do detalhe, e uma única ação neon fixa no
// rodapé. A busca de dados é a mesma da Fase 3.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import type { TrainingStackParamList } from '../navigation/MainNavigator';
import {
  getTodaySession,
  getPlanSessions,
  getSessionDetail,
  SessionDetail,
  PlannedSession,
  PlannedExercise,
} from '../services/trainingRepository';
import { DIAS_DA_SEMANA } from '../utils/weekSummary';
import { Screen, Card, ScreenTitle, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice, Skeleton } from '../components/ui/Feedback';
import FModules from '../components/ui/FModules';
import PlannedExerciseRow from '../components/session/PlannedExerciseRow';

/** Letra do dia (SEG..DOM) a partir do scheduled_date local; null sem data. */
const diaDaSessao = (sessao: PlannedSession): string | null => {
  if (!sessao.scheduled_date) return null;
  const data = new Date(`${sessao.scheduled_date}T12:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  return DIAS_DA_SEMANA[(data.getDay() + 6) % 7];
};

const estadoDaSessao = (
  sessao: PlannedSession,
  sessaoDaVezId: string | null,
): { rotulo: string; accent: boolean } => {
  if (sessao.status === 'completed') return { rotulo: 'Concluído', accent: true };
  if (sessao.status === 'skipped') return { rotulo: 'Pulado', accent: false };
  if (sessao.id === sessaoDaVezId)
    return { rotulo: sessao.status === 'in_progress' ? 'Em andamento' : 'A seguir', accent: true };
  return { rotulo: '', accent: false };
};

const TrainingSessionScreen = () => {
  const navigation = useNavigation<StackNavigationProp<TrainingStackParamList, 'TrainingOverview'>>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "não há treino": estados distintos (achado #9 do review)
  const [loadError, setLoadError] = useState(false);
  // Visão de ciclo (Direção 03): carga independente — falha aqui só esconde o
  // contexto da semana, nunca derruba a sessão da vez.
  const [planSessions, setPlanSessions] = useState<PlannedSession[] | null>(null);
  const { user } = useAuth();

  const fetchCurrentTraining = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);

    getPlanSessions(user.id)
      .then(setPlanSessions)
      .catch((err) => {
        console.log('Visão de ciclo indisponível:', err?.message ?? err);
        setPlanSessions(null);
      });

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

  if (loading) {
    // Direção 03: a estrutura da tela já aparece na carga — skeleton no lugar
    // do spinner centralizado.
    return (
      <Screen>
        <ScreenTitle kicker="Plano" title="Seu plano." style={styles.title} />
        <View style={styles.skeletonStack}>
          <Skeleton
            height={116}
            radius={theme.borderRadius.xl}
            accessibilityLabel="Carregando sua sessão"
            testID="skl-plano-resumo"
          />
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <ScreenTitle kicker="Plano" title="Seu plano." />
        <Notice
          tone="danger"
          title="Falha ao carregar"
          description="Não foi possível carregar seu treino. Verifique a conexão e tente novamente."
          action={
            <Button
              label="Tentar novamente"
              variant="outline"
              compact
              onPress={fetchCurrentTraining}
            />
          }
        />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <ScreenTitle kicker="Plano" title="Seu plano." />
        <EmptyState
          icon="calendar"
          title="Nenhum treino pendente. Gere seu plano para começar."
          description="Assim que seu plano for gerado, a sessão da vez aparece aqui."
        />
      </Screen>
    );
  }

  const emAndamento = session.status === 'in_progress';
  const dataFormatada = session.scheduled_date
    ? new Date(`${session.scheduled_date}T12:00:00`).toLocaleDateString('pt-BR')
    : null;

  // Ciclo REAL: total = maior semana do plano; atual = semana da sessão da vez.
  const totalSemanas = planSessions?.length
    ? Math.max(...planSessions.map((s) => s.week_number))
    : null;
  const sessoesDaSemana =
    planSessions?.filter((s) => s.week_number === session.week_number) ?? [];

  const renderExerciseItem = ({ item, index }: { item: PlannedExercise; index: number }) => (
    <PlannedExerciseRow exercise={item} index={index} />
  );

  return (
    <Screen>
      <ScreenTitle kicker="Plano" title="Seu plano." style={styles.title} />

      {/* --- Visão do ciclo: Semana N de M + a semana corrente ------------- */}
      {totalSemanas ? (
        <View style={styles.cycle} testID="visao-ciclo">
          <View style={styles.cycleTop}>
            <Text style={styles.cycleLabel}>
              Semana {session.week_number} de {totalSemanas}
            </Text>
            <FModules
              lit={Math.ceil((session.week_number / totalSemanas) * 3)}
              accessibilityLabel={`Semana ${session.week_number} de ${totalSemanas}`}
            />
          </View>
          {sessoesDaSemana.map((s) => {
            const estado = estadoDaSessao(s, session.id);
            return (
              <ListRow
                key={s.id}
                title={s.title}
                subtitle={
                  [
                    s.estimated_minutes ? `${s.estimated_minutes} min` : null,
                    s.muscle_groups?.length ? s.muscle_groups.join(' · ') : s.session_type,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                leading={<Chip label={diaDaSessao(s) ?? '—'} />}
                trailingLabel={estado.rotulo || undefined}
                trailingAccent={estado.accent}
                showChevron
                onPress={() => navigation.navigate('WorkoutDetail', { sessionId: s.id })}
              />
            );
          })}
        </View>
      ) : null}

      <Card elevated style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryLabel}>Sessão atual</Text>
            <Text style={styles.summaryTitle}>{session.title}</Text>
          </View>
          <Chip label={`Semana ${session.week_number}`} tone={emAndamento ? 'accent' : 'neutral'} />
        </View>

        <View style={styles.summaryMeta}>
          {dataFormatada ? <Text style={styles.summaryMetaItem}>{dataFormatada}</Text> : null}
          {session.estimated_minutes ? (
            <Text style={styles.summaryMetaItem}>~{session.estimated_minutes} min</Text>
          ) : null}
          <Text style={styles.summaryMetaItem}>
            {session.planned_exercises.length}{' '}
            {session.planned_exercises.length === 1 ? 'exercício' : 'exercícios'}
          </Text>
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
        <Button
          label={emAndamento ? 'Retomar treino' : 'Iniciar treino'}
          icon="arrow-right"
          onPress={() => navigation.navigate('ActiveSession', { sessionId: session.id })}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  skeletonStack: { gap: theme.spacing.sm },
  title: { marginBottom: theme.spacing.lg },

  cycle: { marginBottom: theme.spacing.xl },
  cycleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  cycleLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

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
});

export default TrainingSessionScreen;
