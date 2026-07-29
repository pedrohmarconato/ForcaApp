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
import { PlanEditError, reordenarExercicios } from '../services/planEditRepository';
import { moveItem } from '../engine/planReorder';
import { useActiveSessionStore } from '../store/activeSessionStore';
import { Screen, Card, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice } from '../components/ui/Feedback';
import PlannedExerciseRow from '../components/session/PlannedExerciseRow';
import { SetasReordenar } from '../components/session/ReorderControls';

const WorkoutDetailScreen = ({ route }: { route: { params: { sessionId: string } } }) => {
  const { sessionId } = route.params;
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList, 'WorkoutDetail'>>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "treino não encontrado": estados distintos (achado #9)
  const [loadError, setLoadError] = useState(false);

  // Modo reordenar: rascunho local da ordem. null = modo normal. A ordem só é
  // aplicada quando o servidor confirma (RPC transacional) — a UI nunca aplica
  // localmente por conta própria.
  const [ordemDraft, setOrdemDraft] = useState<PlannedExercise[] | null>(null);
  const [salvandoOrdem, setSalvandoOrdem] = useState(false);
  const [avisoOrdem, setAvisoOrdem] = useState<'falha' | 'desatualizado' | null>(null);

  // Guarda além do status do banco: com execução desta sessão viva no aparelho
  // (draft ou check-in pendente), reordenar geraria divergência silenciosa
  // entre o rascunho da execução e o plano. A RPC revalida no servidor.
  const draftAtivo = useActiveSessionStore(
    (s) => s.draft?.plannedSessionId === sessionId || s.pendingCheckIn?.sessionId === sessionId,
  );

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

  const podeReordenar =
    session.status === 'pending' && session.planned_exercises.length >= 2 && !draftAtivo;
  const exercicios = ordemDraft ?? session.planned_exercises;

  const iniciarReordenacao = () => {
    setAvisoOrdem(null);
    setOrdemDraft(session.planned_exercises);
  };

  const cancelarReordenacao = () => {
    setOrdemDraft(null);
    setAvisoOrdem(null);
  };

  const salvarReordenacao = async () => {
    if (!ordemDraft) return;
    const original = session.planned_exercises.map((e) => e.id);
    const nova = ordemDraft.map((e) => e.id);
    if (original.join('|') === nova.join('|')) {
      cancelarReordenacao();
      return;
    }
    setSalvandoOrdem(true);
    setAvisoOrdem(null);
    try {
      await reordenarExercicios(session.id, nova);
      setOrdemDraft(null);
      await fetchDetails();
    } catch (err) {
      if (err instanceof PlanEditError && err.code === '40001') {
        // O treino mudou fora desta tela: descarta o rascunho e recarrega.
        setOrdemDraft(null);
        setAvisoOrdem('desatualizado');
        await fetchDetails();
      } else {
        console.error('Erro ao salvar a nova ordem:', err);
        setAvisoOrdem('falha');
      }
    } finally {
      setSalvandoOrdem(false);
    }
  };

  const moverExercicio = (de: number, para: number) => {
    setOrdemDraft((atual) => (atual ? moveItem(atual, de, para) : atual));
  };

  const renderExerciseItem = ({ item, index }: { item: PlannedExercise; index: number }) => (
    <PlannedExerciseRow
      exercise={item}
      index={index}
      trailing={
        ordemDraft ? (
          <SetasReordenar
            nome={item.name}
            podeSubir={index > 0 && !salvandoOrdem}
            podeDescer={index < exercicios.length - 1 && !salvandoOrdem}
            onSubir={() => moverExercicio(index, index - 1)}
            onDescer={() => moverExercicio(index, index + 1)}
          />
        ) : undefined
      }
    />
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

      <SectionHeader
        title="Exercícios"
        actionLabel={podeReordenar && !ordemDraft ? 'Reordenar' : undefined}
        onActionPress={iniciarReordenacao}
      />

      {avisoOrdem === 'falha' ? (
        <Notice
          tone="danger"
          title="Não foi possível salvar"
          description="A nova ordem não foi aplicada. Verifique a conexão e tente novamente."
          style={styles.reorderNotice}
        />
      ) : null}
      {avisoOrdem === 'desatualizado' ? (
        <Notice
          tone="info"
          title="Este treino mudou em outro lugar."
          description="Recarregamos a lista com a ordem atual."
          style={styles.reorderNotice}
        />
      ) : null}

      <FlatList
        style={styles.list}
        data={exercicios}
        extraData={ordemDraft}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.footer}>
        {ordemDraft ? (
          <View style={styles.reorderFooter}>
            <Button
              label="Cancelar"
              variant="ghost"
              compact
              disabled={salvandoOrdem}
              onPress={cancelarReordenacao}
              style={styles.reorderFooterBtn}
            />
            <Button
              label="Salvar"
              compact
              loading={salvandoOrdem}
              onPress={salvarReordenacao}
              style={styles.reorderFooterBtn}
            />
          </View>
        ) : jaConcluido ? (
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

  list: { flex: 1 },
  listContent: { paddingBottom: theme.spacing.lg },

  reorderNotice: { marginBottom: theme.spacing.md },
  reorderFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
  reorderFooterBtn: { flex: 1 },

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
