// src/screens/ActiveSessionScreen.tsx
// Fase 4 — execução interativa do treino. Carrega o detalhe da sessão (Fase 3),
// inicia/retoma a execução no store e registra série a série. Estados distintos:
// carregando, erro de carga, erro do início, ativo e concluído — erro nunca é
// mascarado como "sessão vazia".

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import theme from '../theme/theme';
import type { HomeStackParamList } from '../navigation/MainNavigator';
import { useAuth } from '../contexts/AuthContext';
import {
  getSessionDetail,
  formatExerciseTarget,
  type SessionDetail,
} from '../services/trainingRepository';
import {
  useActiveSessionStore,
  suggestionFor,
} from '../store/activeSessionStore';
import { sessionProgress, isSessionComplete } from '../engine/sessionModel';
import Button from '../components/ui/Button';
import { Notice, ProgressTrack } from '../components/ui/Feedback';
import SetRow from '../components/session/SetRow';
import AdaptationSheet from '../components/session/AdaptationSheet';
import CheckInSheet from '../components/session/CheckInSheet';
import ReplanBanner from '../components/session/ReplanBanner';
import type { Adjustment } from '../engine/intraSessionAdaptation';

type Props = { route: { params: { sessionId: string } } };

const ActiveSessionScreen = ({ route }: Props) => {
  const { sessionId } = route.params;
  // ActiveSession existe na Home e no Training stack; o ParamList da Home basta
  // para tipar popToTop/canGoBack (não dependem de params específicos).
  const navigation =
    useNavigation<StackNavigationProp<HomeStackParamList, 'ActiveSession'>>();
  const { user } = useAuth();

  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const loadGeneration = useRef(0);

  const draft = useActiveSessionStore((s) => s.draft);
  const status = useActiveSessionStore((s) => s.status);
  const saveError = useActiveSessionStore((s) => s.saveError);
  const startOrResume = useActiveSessionStore((s) => s.startOrResume);
  const confirmCheckIn = useActiveSessionStore((s) => s.confirmCheckIn);
  const finishSession = useActiveSessionStore((s) => s.finishSession);
  const clearError = useActiveSessionStore((s) => s.clearError);
  const reset = useActiveSessionStore((s) => s.reset);
  const pendingAdaptation = useActiveSessionStore((s) => s.pendingAdaptation);
  const resolveAdaptation = useActiveSessionStore((s) => s.resolveAdaptation);
  const pendingReplan = useActiveSessionStore((s) => s.pendingReplan);
  const replanBusy = useActiveSessionStore((s) => s.replanBusy);
  const computeReplan = useActiveSessionStore((s) => s.computeReplan);
  const requestTimeCut = useActiveSessionStore((s) => s.requestTimeCut);
  const confirmReplan = useActiveSessionStore((s) => s.confirmReplan);
  const declineReplan = useActiveSessionStore((s) => s.declineReplan);

  // Toggle "menos tempo hoje" (Fase 6): input de minutos → recalcula a proposta.
  const [timeInputVisible, setTimeInputVisible] = useState(false);
  const [minutesText, setMinutesText] = useState('');

  const iniciar = useCallback(async () => {
    if (!user) return;
    const generation = ++loadGeneration.current;
    const isCurrent = () => loadGeneration.current === generation;
    setDetailLoading(true);
    setDetailError(false);
    reset();
    try {
      const d = await getSessionDetail(sessionId);
      if (!isCurrent()) return;
      if (!d) {
        setDetailError(true);
        return;
      }
      setDetail(d);
      await startOrResume({ sessionId, userId: user.id, detail: d });
      // Fase 6: recalcular a semana AO ABRIR a sessão (best-effort — o motor de
      // replanejamento nunca impede o treino; sem rede, segue sem banner).
      await computeReplan(d);
    } catch (err) {
      if (!isCurrent()) return;
      console.error('Erro ao iniciar sessão:', err);
      setDetailError(true);
    } finally {
      if (isCurrent()) setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  useEffect(() => {
    iniciar();
    return () => {
      loadGeneration.current += 1;
    };
  }, [iniciar]);

  const onConcluirTreino = useCallback(() => {
    if (!draft) return;
    const finalizar = async () => {
      const ok = await finishSession();
      if (!ok) {
        Alert.alert(
          'Não foi possível concluir',
          saveError ?? 'Tente novamente.',
        );
      }
    };
    if (!isSessionComplete(draft)) {
      Alert.alert(
        'Concluir treino?',
        'Ainda há séries não registradas. Deseja concluir mesmo assim?',
        [
          { text: 'Continuar treino', style: 'cancel' },
          { text: 'Concluir', onPress: finalizar },
        ],
      );
      return;
    }
    finalizar();
  }, [draft, finishSession, saveError]);

  // --- Carregando ---
  if (detailLoading || status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent.main} />
        <Text style={styles.muted}>Preparando sua sessão...</Text>
      </View>
    );
  }

  // --- Erro ao carregar o detalhe do treino ---
  if (detailError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          Não foi possível abrir o treino. Verifique a conexão e tente
          novamente.
        </Text>
        <Button
          label="Tentar de novo"
          variant="outline"
          onPress={iniciar}
          style={styles.stateAction}
        />
      </View>
    );
  }

  // --- Erro ao iniciar/gravar a execução ---
  if (status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          {saveError ?? 'Não foi possível iniciar a sessão.'}
        </Text>
        <Button
          label="Tentar de novo"
          variant="outline"
          onPress={iniciar}
          style={styles.stateAction}
        />
      </View>
    );
  }

  // --- Sessão concluída ---
  if (status === 'finished') {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>Treino concluído! 💪</Text>
        <Text style={styles.muted}>
          Suas séries foram registradas. Veja o resumo no seu histórico (aba
          Perfil).
        </Text>
        <Button
          label="Voltar ao início"
          onPress={() =>
            navigation.canGoBack() ? navigation.popToTop() : undefined
          }
          style={styles.stateAction}
        />
      </View>
    );
  }

  if (!draft) {
    // Sessão nova aguardando o check-in obrigatório: o draft só nasce depois
    // das duas respostas — o sheet precisa renderizar NESTE early return.
    return (
      <View style={styles.centered}>
        <CheckInSheet
          visible={status === 'awaiting_checkin'}
          sessionTitle={detail?.title ?? null}
          onConfirm={async (answers) => {
            await confirmCheckIn(answers);
            if (detail) await computeReplan(detail);
          }}
        />
        <Text style={styles.muted}>Nenhuma sessão ativa.</Text>
      </View>
    );
  }

  const progresso = sessionProgress(draft);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{draft.title}</Text>
        <Text style={styles.subtitle}>
          Semana {draft.weekNumber} · {progresso.done}/{progresso.total} séries
        </Text>
        {/* Progresso concluído — dado real do rascunho, um dos usos do neon. */}
        <ProgressTrack
          ratio={progresso.total > 0 ? progresso.done / progresso.total : 0}
          accessibilityLabel="Progresso das séries desta sessão"
          style={styles.progress}
        />
      </View>

      {saveError ? (
        <Notice
          tone="danger"
          title={`${saveError} (toque para dispensar)`}
          style={styles.errorBanner}
          action={<Button label="Dispensar" variant="ghost" compact onPress={clearError} />}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Fase 6: toggle "menos tempo hoje" — recalcula a PROPOSTA (nada aplica). */}
        <View style={styles.timeRow}>
          <TouchableOpacity
            style={styles.timeToggle}
            testID="replan-time-toggle"
            accessibilityRole="button"
            accessibilityLabel="Tenho menos tempo hoje"
            onPress={() => setTimeInputVisible((v) => !v)}
          >
            <Text style={styles.timeToggleText}>⏱ Menos tempo hoje?</Text>
          </TouchableOpacity>
          {timeInputVisible ? (
            <View style={styles.timeInputRow}>
              <TextInput
                style={styles.timeInput}
                value={minutesText}
                onChangeText={setMinutesText}
                keyboardType="number-pad"
                placeholder="min"
                placeholderTextColor={theme.colors.text.quiet}
                testID="replan-minutes-input"
                accessibilityLabel="Minutos disponíveis hoje"
              />
              <TouchableOpacity
                style={styles.timeApplyBtn}
                testID="replan-minutes-apply"
                accessibilityRole="button"
                accessibilityLabel="Recalcular com os minutos informados"
                onPress={async () => {
                  const minutos = parseInt(minutesText, 10);
                  if (!Number.isFinite(minutos) || minutos <= 0) return;
                  // Sem contexto (ex.: aberto offline) tenta calcular de novo antes.
                  if (!useActiveSessionStore.getState().pendingReplan && detail) {
                    await computeReplan(detail);
                  }
                  useActiveSessionStore.getState().requestTimeCut(minutos);
                }}
              >
                <Text style={styles.timeApplyText}>Recalcular</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {pendingReplan?.requestedMinutes != null &&
        !pendingReplan.proposal.timeCut ? (
          <Text style={styles.timeFullNote}>
            Com {pendingReplan.requestedMinutes} min dá para manter o treino de
            hoje inteiro.
          </Text>
        ) : null}

        <ReplanBanner
          proposal={pendingReplan?.proposal ?? null}
          sessionLabelById={pendingReplan?.context.sessionLabelById ?? {}}
          busy={replanBusy}
          onConfirm={confirmReplan}
          onDecline={declineReplan}
        />

        {draft.exercises.map((ex, idxEx) => {
          const detalheEx = detail?.planned_exercises.find(
            (e) => e.id === ex.exerciseId,
          );
          const cortado = ex.cutByReplan === true;
          // Exercício cortado por tempo: séries já feitas continuam visíveis;
          // as pendentes saem do caminho (e do progresso — sessionModel).
          const seriesVisiveis = cortado
            ? ex.sets.filter((s) => s.status === 'done')
            : ex.sets;
          return (
            <View key={ex.exerciseId} style={styles.exerciseBlock}>
              <Text style={[styles.exerciseName, cortado && styles.exerciseNameCut]}>
                {idxEx + 1}. {ex.name}
              </Text>
              {cortado ? (
                <Text style={styles.cutNote}>
                  Cortado por tempo — confirmado por você. As séries não feitas
                  não contam hoje.
                </Text>
              ) : detalheEx ? (
                <Text style={styles.exerciseMeta}>
                  {formatExerciseTarget(detalheEx)}
                </Text>
              ) : null}
              {seriesVisiveis.map((s, idxSet) => (
                <SetRow
                  key={s.plannedSetId}
                  exercise={ex}
                  set={s}
                  suggestedLoad={suggestionFor(draft, ex, s)}
                  isLast={idxSet === seriesVisiveis.length - 1}
                />
              ))}
            </View>
          );
        })}

        <Button
          label="Concluir treino"
          onPress={onConcluirTreino}
          disabled={progresso.done === 0}
          style={styles.finishBtn}
        />
      </ScrollView>

      <CheckInSheet
        visible={status === 'awaiting_checkin'}
        sessionTitle={detail?.title ?? null}
        onConfirm={async (answers) => {
          await confirmCheckIn(answers);
          // Mesmo gatilho do fluxo normal: recalcular a semana com o check-in
          // aplicado (best-effort — nunca impede o treino).
          if (detail) await computeReplan(detail);
        }}
      />
      <AdaptationSheet
        recommendation={pendingAdaptation?.recommendation ?? null}
        exerciseName={
          draft.exercises.find(
            (e) => e.exerciseId === pendingAdaptation?.exerciseId,
          )?.name ?? ''
        }
        onChoose={resolveAdaptation}
        onDismiss={() => {
          // Fechar pelo fundo = recusar → registra "manter" (a recusa é gravada).
          const keep = pendingAdaptation?.recommendation.options.find(
            (o) => o.kind === 'keep',
          );
          resolveAdaptation(
            keep ??
              ({
                kind: 'keep',
                label: 'Manter a carga',
                reason: 'Recusado.',
              } as Adjustment),
          );
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.canvas },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.surface.canvas,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xxl,
  },
  muted: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
    textAlign: 'center',
  },
  stateAction: { marginTop: theme.spacing.xl, alignSelf: 'stretch' },
  doneTitle: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
    textAlign: 'center',
  },

  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },
  subtitle: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  progress: { marginTop: theme.spacing.md },

  scroll: { padding: theme.spacing.xl, paddingTop: theme.spacing.xxs },

  exerciseBlock: { marginBottom: theme.spacing.xxl },
  exerciseName: {
    marginBottom: 2,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  exerciseMeta: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  exerciseNameCut: { textDecorationLine: 'line-through', opacity: 0.6 },
  cutNote: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },

  timeRow: { marginBottom: theme.spacing.md },
  timeToggle: { alignSelf: 'flex-start', paddingVertical: theme.spacing.xxs },
  timeToggleText: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  timeInput: {
    width: 84,
    minHeight: theme.hitTarget.compact,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
  },
  timeApplyBtn: {
    minHeight: theme.hitTarget.compact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent.main,
  },
  timeApplyText: {
    color: theme.colors.accent.on,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  timeFullNote: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },

  errorBanner: {
    marginHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },

  finishBtn: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.xxxl },
});

export default ActiveSessionScreen;
