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

import type { Theme } from '../theme/theme';
import { useTheme, useThemeStyles } from '../theme/ThemeProvider';
import type { HomeStackParamList } from '../navigation/MainNavigator';
import {
  getSessionDetail,
  SessionDetail,
  PlannedExercise,
} from '../services/trainingRepository';
import { isPlanoDesatualizado, reordenarExercicios } from '../services/planEditRepository';
import {
  skipPlannedSession,
  unskipPlannedSession,
} from '../services/sessionExecutionRepository';
import { moveItem } from '../engine/planReorder';
import { SKIP_REASON_LABELS, isSkipReason, type SkipReason } from '../engine/sessionModel';
import {
  gruposNegligenciados,
  promoverPrimarioDoGrupo,
  type PropostaPrioridade,
} from '../engine/musclePriority';
import { type ReplanSession } from '../engine/weeklyReplanner';
import { getWeekReplanContext } from '../services/weeklyReplanRepository';
import { useDiaLocal } from '../hooks/useDiaLocal';
import { useActiveSessionStore } from '../store/activeSessionStore';
import { Screen, Card, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice } from '../components/ui/Feedback';
import PlannedExerciseRow from '../components/session/PlannedExerciseRow';
import PrioridadeCard from '../components/session/PrioridadeCard';
import { SetasReordenar } from '../components/session/ReorderControls';
import SkipReasonSheet from '../components/session/SkipReasonSheet';

const WorkoutDetailScreen = ({ route }: { route: { params: { sessionId: string } } }) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
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

  // Nível 3 (prioridade): proposta de subir o primário do grupo negligenciado
  // ao 1º lugar real (depois do aquecimento). Nunca adiciona série — só
  // reordena, e a RPC (40001) valida a permutação no servidor.
  const [proposta, setProposta] = useState<PropostaPrioridade | null>(null);
  const [promovido, setPromovido] = useState<{ exercicioId: string; grupo: string } | null>(null);
  const [aplicandoPrioridade, setAplicandoPrioridade] = useState(false);
  const [avisoPrioridade, setAvisoPrioridade] = useState<'falha' | 'desatualizado' | null>(null);

  // Recusa da sessão ANTES de começar (0020): quem já sabe que não vai treinar
  // não precisa entrar no treino para dizer isso.
  const [recusaVisible, setRecusaVisible] = useState(false);
  const [recusaBusy, setRecusaBusy] = useState(false);
  const [recusaErro, setRecusaErro] = useState<string | null>(null);

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

  const diaLocal = useDiaLocal();

  // Sessão do detalhe no formato do motor — só o que a proposta precisa.
  const sessaoReplan = useCallback((): ReplanSession | null => {
    if (!session) return null;
    return {
      id: session.id,
      weekNumber: session.week_number,
      title: session.title,
      sessionType: session.session_type,
      scheduledDate: session.scheduled_date,
      status: session.status,
      estimatedMinutes: session.estimated_minutes,
      exercises: session.planned_exercises.map((e) => ({
        id: e.id,
        name: e.name,
        muscleGroup: e.muscle_group,
        priority: e.priority,
        exerciseOrder: e.exercise_order,
        metric: e.metric ?? null,
        sets: e.planned_sets.map((s) => ({ id: s.id, setOrder: s.set_order })),
      })),
    };
  }, [session]);

  // Proposta de prioridade — best-effort: contexto da semana indisponível ou
  // sessão fora de pending nunca bloqueiam a tela. A proposta é recalculada a
  // cada releitura do detalhe; se o primário já está no lugar, some sozinha.
  useEffect(() => {
    let ativo = true;
    if (!session || session.status !== 'pending' || draftAtivo) {
      setProposta(null);
      return;
    }
    const replan = sessaoReplan();
    if (!replan) return;
    (async () => {
      try {
        const ctx = await getWeekReplanContext(
          session.user_id,
          session.plan_id,
          session.week_number,
        );
        if (!ativo) return;
        // A sessão em exibição NÃO pode se declarar "de fora": ela está aberta
        // agora, seus grupos vão ser treinados nos próximos minutos — incluí-la
        // na lista de devidas gerava o chip "peito ficou de fora" sobre um
        // treino prestes a começar (achado #5 do review do PR #67). O motor a
        // tira das DEVIDAS e mantém o volume dela no molde da semana: filtrar a
        // entrada inteira mudava o desempate e, com ele, o grupo promovido.
        const negligenciados = gruposNegligenciados(
          ctx.sessions,
          ctx.completedSetsBySession,
          diaLocal,
          undefined,
          undefined,
          session.id,
        );
        setProposta(promoverPrimarioDoGrupo(replan, negligenciados));
      } catch (err) {
        console.warn('Sem proposta de prioridade (contexto da semana indisponível):', err);
        if (ativo) setProposta(null);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [session, draftAtivo, diaLocal, sessaoReplan]);

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
  const recusado = session.status === 'skipped';
  // Só o que o ALUNO recusou volta atrás por aqui: sessão marcada pelo
  // replanejador tem data vencida, e voltar a 'pending' a reagendaria no passado.
  const recusadoPeloAluno = recusado && session.skip_source === 'user';
  const motivoRecusa = isSkipReason(session.skip_reason) ? session.skip_reason : null;
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
      if (isPlanoDesatualizado(err)) {
        // O treino mudou fora desta tela (40001/55000/42501): retry jamais
        // funcionaria — descarta o rascunho e recarrega.
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

  const aplicarPrioridade = async () => {
    if (!proposta || !session || aplicandoPrioridade) return;
    setAplicandoPrioridade(true);
    setAvisoPrioridade(null);
    try {
      await reordenarExercicios(session.id, proposta.ordemProposta);
      setPromovido({ exercicioId: proposta.exercicio.id, grupo: proposta.grupo });
      setProposta(null);
      await fetchDetails();
    } catch (err) {
      if (isPlanoDesatualizado(err)) {
        // A ordem mudou fora desta tela: retry jamais funcionaria — recarrega.
        setProposta(null);
        setPromovido(null);
        setAvisoPrioridade('desatualizado');
        await fetchDetails();
      } else {
        console.error('Erro ao aplicar prioridade:', err);
        setAvisoPrioridade('falha');
      }
    } finally {
      setAplicandoPrioridade(false);
    }
  };

  // "Manter como está" NUNCA toca a RPC — só dispensa a proposta desta visita.
  const recusarPrioridade = () => {
    setProposta(null);
    setAvisoPrioridade(null);
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
        ) : promovido?.exercicioId === item.id ? (
          <Chip label={`1º por prioridade · ${promovido.grupo} ficou de fora`} tone="info" />
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

      {!ordemDraft && proposta ? (
        <PrioridadeCard
          grupo={proposta.grupo}
          nomeExercicio={proposta.exercicio.name}
          busy={aplicandoPrioridade}
          onAplicar={aplicarPrioridade}
          onRecusar={recusarPrioridade}
          style={styles.reorderNotice}
        />
      ) : null}
      {avisoPrioridade === 'falha' ? (
        <Notice
          tone="danger"
          title="Não foi possível salvar"
          description="A nova ordem não foi aplicada. Verifique a conexão e tente novamente."
          style={styles.reorderNotice}
        />
      ) : null}
      {avisoPrioridade === 'desatualizado' ? (
        <Notice
          tone="info"
          title="Este treino mudou em outro lugar."
          description="Recarregamos a lista com a ordem atual."
          style={styles.reorderNotice}
        />
      ) : null}

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
        ) : recusado ? (
          <View>
            <Text style={styles.doneNote}>
              {motivoRecusa
                ? `Treino recusado — ${SKIP_REASON_LABELS[motivoRecusa].toLowerCase()}.`
                : 'Treino não realizado.'}
              {session.skip_note ? ` "${session.skip_note}"` : ''}
            </Text>
            {recusadoPeloAluno ? (
              <Button
                label="Voltar a treinar hoje"
                variant="outline"
                onPress={async () => {
                  if (recusaBusy) return;
                  setRecusaBusy(true);
                  setRecusaErro(null);
                  try {
                    await unskipPlannedSession(session.id);
                    await fetchDetails();
                  } catch (e) {
                    setRecusaErro(
                      e instanceof Error ? e.message : 'Não foi possível desfazer.',
                    );
                  } finally {
                    setRecusaBusy(false);
                  }
                }}
                disabled={recusaBusy}
                testID="desfazer-recusa-sessao"
              />
            ) : null}
          </View>
        ) : (
          <View>
            <Button
              label={ctaLabel}
              icon="arrow-right"
              onPress={() => navigation.navigate('ActiveSession', { sessionId: session.id })}
            />
            <Button
              label="Não vou treinar hoje"
              variant="outline"
              onPress={() => {
                setRecusaErro(null);
                setRecusaVisible(true);
              }}
              style={styles.recusarBtn}
              testID="recusar-sessao"
            />
          </View>
        )}
        {recusaErro ? (
          <Notice
            tone="warning"
            title="Não foi possível registrar"
            description={recusaErro}
            style={styles.recusarAviso}
          />
        ) : null}
      </View>

      <SkipReasonSheet
        visible={recusaVisible}
        escopo="sessao"
        alvo={session.title}
        busy={recusaBusy}
        onConfirm={async (reason: SkipReason, note: string | null) => {
          if (recusaBusy) return;
          setRecusaBusy(true);
          setRecusaErro(null);
          try {
            await skipPlannedSession({
              plannedSessionId: session.id,
              reason,
              note,
            });
            setRecusaVisible(false);
            // Relê do servidor: o status vem de lá, nunca de suposição da tela.
            await fetchDetails();
          } catch (e) {
            setRecusaErro(
              e instanceof Error ? e.message : 'Não foi possível registrar a recusa.',
            );
          } finally {
            setRecusaBusy(false);
          }
        }}
        onDismiss={() => setRecusaVisible(false)}
      />
    </Screen>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
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
  recusarBtn: { marginTop: theme.spacing.sm },
  recusarAviso: { marginTop: theme.spacing.md },
});

export default WorkoutDetailScreen;
