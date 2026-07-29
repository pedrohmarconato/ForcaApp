// src/screens/TrainingSessionScreen.tsx
// Tela 05 do fluxo — "Plano": a sessão corrente (em andamento ou a próxima
// pendente) com seus exercícios e alvos por série.
//
// Apresentação na Direção 02: resumo do ciclo em card de destaque, lista de
// exercícios com a mesma geometria do detalhe, e uma única ação neon fixa no
// rodapé. A busca de dados é a mesma da Fase 3.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  EscopoReordenacao,
  PlanEditError,
  reordenarSessoesDaSemana,
} from '../services/planEditRepository';
import {
  moveItem,
  pendentesOrdenadas,
  podeReordenarSemana,
  previewSemana,
  resumoPropagacao,
} from '../engine/planReorder';
import { DIAS_DA_SEMANA } from '../utils/weekSummary';
import { Screen, Card, ScreenTitle, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice, Skeleton } from '../components/ui/Feedback';
import FModules from '../components/ui/FModules';
import PlannedExerciseRow from '../components/session/PlannedExerciseRow';
import { SetasReordenar } from '../components/session/ReorderControls';
import ReorderScopeSheet from '../components/session/ReorderScopeSheet';

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

  // Modo reordenar treinos: IDs das sessões PENDENTES da semana na ordem
  // escolhida. null = modo normal. A permuta de datas só acontece quando a RPC
  // confirma — o rascunho é apenas preview.
  const [ordemSemanaDraft, setOrdemSemanaDraft] = useState<string[] | null>(null);
  const [salvandoSemana, setSalvandoSemana] = useState(false);
  const [avisoSemana, setAvisoSemana] = useState<'falha' | 'desatualizado' | null>(null);
  // Sheet de escopo (Fase 3): a escolha "só esta semana / também as próximas"
  // é do usuário final, na hora de salvar.
  const [escopoSheetAberto, setEscopoSheetAberto] = useState(false);
  const [resumoSemana, setResumoSemana] = useState<string | null>(null);

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

  const editandoSemana = ordemSemanaDraft != null;
  const podeReordenarTreinos = podeReordenarSemana(sessoesDaSemana);
  const semanaExibida = ordemSemanaDraft
    ? previewSemana(sessoesDaSemana, ordemSemanaDraft)
    : sessoesDaSemana;

  const iniciarReordenacaoSemana = () => {
    setAvisoSemana(null);
    setResumoSemana(null);
    setOrdemSemanaDraft(pendentesOrdenadas(sessoesDaSemana).map((s) => s.id));
  };

  const cancelarReordenacaoSemana = () => {
    setOrdemSemanaDraft(null);
    setAvisoSemana(null);
    setEscopoSheetAberto(false);
  };

  const moverSessao = (id: string, delta: -1 | 1) => {
    setOrdemSemanaDraft((atual) => {
      if (!atual) return atual;
      const idx = atual.indexOf(id);
      return moveItem(atual, idx, idx + delta);
    });
  };

  // Salvar não grava direto: com mudança real, quem decide o escopo é o sheet.
  const salvarReordenacaoSemana = () => {
    if (!ordemSemanaDraft) return;
    const original = pendentesOrdenadas(sessoesDaSemana).map((s) => s.id);
    if (original.join('|') === ordemSemanaDraft.join('|')) {
      cancelarReordenacaoSemana();
      return;
    }
    setEscopoSheetAberto(true);
  };

  const aplicarReordenacaoSemana = async (escopo: EscopoReordenacao) => {
    if (!ordemSemanaDraft) return;
    setEscopoSheetAberto(false);
    setSalvandoSemana(true);
    setAvisoSemana(null);
    try {
      const resultado = await reordenarSessoesDaSemana({
        planId: session.plan_id,
        weekNumber: session.week_number,
        orderedSessionIds: ordemSemanaDraft,
        escopo,
      });
      setOrdemSemanaDraft(null);
      setResumoSemana(resumoPropagacao(resultado));
      // Refetch obrigatório: a fila real mudou — a "sessão da vez" pode ser outra.
      await fetchCurrentTraining();
    } catch (err) {
      if (err instanceof PlanEditError && err.code === '40001') {
        setOrdemSemanaDraft(null);
        setAvisoSemana('desatualizado');
        await fetchCurrentTraining();
      } else {
        console.error('Erro ao salvar a nova ordem da semana:', err);
        setAvisoSemana('falha');
      }
    } finally {
      setSalvandoSemana(false);
    }
  };

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
            {editandoSemana ? (
              <View style={styles.cycleEditActions}>
                <Button
                  label="Cancelar"
                  variant="ghost"
                  compact
                  disabled={salvandoSemana}
                  onPress={cancelarReordenacaoSemana}
                />
                <Button
                  label="Salvar"
                  compact
                  loading={salvandoSemana}
                  onPress={salvarReordenacaoSemana}
                />
              </View>
            ) : (
              <View style={styles.cycleTopRight}>
                {podeReordenarTreinos ? (
                  <Pressable
                    onPress={iniciarReordenacaoSemana}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text style={styles.reorderAction}>Reordenar</Text>
                  </Pressable>
                ) : null}
                <FModules
                  lit={Math.ceil((session.week_number / totalSemanas) * 3)}
                  accessibilityLabel={`Semana ${session.week_number} de ${totalSemanas}`}
                />
              </View>
            )}
          </View>

          {avisoSemana === 'falha' ? (
            <Notice
              tone="danger"
              title="Não foi possível salvar"
              description="A nova ordem não foi aplicada. Verifique a conexão e tente novamente."
              style={styles.reorderNotice}
            />
          ) : null}
          {avisoSemana === 'desatualizado' ? (
            <Notice
              tone="info"
              title="Seu plano mudou em outro lugar."
              description="Recarregamos a semana com a ordem atual."
              style={styles.reorderNotice}
            />
          ) : null}
          {resumoSemana ? (
            <Notice
              tone="info"
              title="Ordem atualizada"
              description={resumoSemana}
              style={styles.reorderNotice}
            />
          ) : null}

          {semanaExibida.map((s) => {
            const estado = estadoDaSessao(s, session.id);
            const ehPendente = s.status === 'pending';
            const idxPendente =
              editandoSemana && ehPendente && ordemSemanaDraft
                ? ordemSemanaDraft.indexOf(s.id)
                : -1;
            return (
              <ListRow
                key={s.id}
                testID={`sessao-semana-${s.id}`}
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
                trailingLabel={
                  editandoSemana && ehPendente ? undefined : estado.rotulo || undefined
                }
                trailingAccent={estado.accent}
                trailing={
                  editandoSemana && ehPendente && ordemSemanaDraft ? (
                    <SetasReordenar
                      nome={s.title}
                      podeSubir={idxPendente > 0 && !salvandoSemana}
                      podeDescer={
                        idxPendente < ordemSemanaDraft.length - 1 && !salvandoSemana
                      }
                      onSubir={() => moverSessao(s.id, -1)}
                      onDescer={() => moverSessao(s.id, 1)}
                    />
                  ) : undefined
                }
                showChevron={!editandoSemana}
                onPress={
                  editandoSemana
                    ? undefined
                    : () => navigation.navigate('WorkoutDetail', { sessionId: s.id })
                }
                style={editandoSemana && !ehPendente ? styles.rowFixa : undefined}
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

      <ReorderScopeSheet
        visible={escopoSheetAberto}
        onChoose={aplicarReordenacaoSemana}
        onDismiss={() => setEscopoSheetAberto(false)}
      />
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
  cycleTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  cycleEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  // Mesma gramática do SectionHeader.actionLabel (ação textual discreta).
  reorderAction: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  reorderNotice: { marginBottom: theme.spacing.md },
  // Fixas esmaecidas no modo edição: não participam da permuta.
  rowFixa: { opacity: 0.55 },

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
