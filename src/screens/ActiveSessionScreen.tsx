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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useKeepAwake } from 'expo-keep-awake';

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
import {
  sessionProgress,
  isSessionComplete,
  sessionSemNadaAFazer,
  isTimeBased,
  metricOf,
  type DraftExercise,
  type SkipReason,
} from '../engine/sessionModel';
import { montarResumoSessao, type ResumoSessao } from '../engine/sessionSummary';
import Button from '../components/ui/Button';
import { Notice, ProgressTrack } from '../components/ui/Feedback';
import SessionPlayer from '../components/session/SessionPlayer';
import SessionQueue from '../components/session/SessionQueue';
import SessionSummary from '../components/session/SessionSummary';
import AdaptationSheet from '../components/session/AdaptationSheet';
import CheckInSheet from '../components/session/CheckInSheet';
import ReplanBanner from '../components/session/ReplanBanner';
import SkipReasonSheet from '../components/session/SkipReasonSheet';
import SwapModalitySheet from '../components/session/SwapModalitySheet';
import { getModalidadesAceitas } from '../services/cardioModalidadesAceitasRepository';
import { type CardioModalidade } from '../constants/cardioModalidades';
import type { Adjustment } from '../engine/intraSessionAdaptation';

type Props = { route: { params: { sessionId: string } } };

const ActiveSessionScreen = ({ route }: Props) => {
  const { sessionId } = route.params;
  // ActiveSession existe na Home e no Training stack; o ParamList da Home basta
  // para tipar popToTop/canGoBack (não dependem de params específicos).
  const navigation =
    useNavigation<StackNavigationProp<HomeStackParamList, 'ActiveSession'>>();
  const { user } = useAuth();

  // Direção 03: tela acesa durante a sessão inteira — treino não morre com o
  // descanso na mão. No web vira wake lock; sem suporte, no-op.
  useKeepAwake();

  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  // Fotografia do resumo no momento do Concluir: o draft pode ser limpo pelo
  // store depois de finishSession — os números do resumo saem DESTA captura.
  const [resumoFinal, setResumoFinal] = useState<ResumoSessao | null>(null);
  const loadGeneration = useRef(0);

  const draft = useActiveSessionStore((s) => s.draft);
  const status = useActiveSessionStore((s) => s.status);
  const saveError = useActiveSessionStore((s) => s.saveError);
  const startOrResume = useActiveSessionStore((s) => s.startOrResume);
  const confirmCheckIn = useActiveSessionStore((s) => s.confirmCheckIn);
  const finishSession = useActiveSessionStore((s) => s.finishSession);
  const clearError = useActiveSessionStore((s) => s.clearError);
  const reset = useActiveSessionStore((s) => s.reset);
  const lastAutoDecision = useActiveSessionStore((s) => s.lastAutoDecision);
  const pendingAdaptation = useActiveSessionStore((s) => s.pendingAdaptation);
  const resolveAdaptation = useActiveSessionStore((s) => s.resolveAdaptation);
  const pendingReplan = useActiveSessionStore((s) => s.pendingReplan);
  const replanBusy = useActiveSessionStore((s) => s.replanBusy);
  const computeReplan = useActiveSessionStore((s) => s.computeReplan);
  const requestTimeCut = useActiveSessionStore((s) => s.requestTimeCut);
  const confirmReplan = useActiveSessionStore((s) => s.confirmReplan);
  const confirmReagendamento = useActiveSessionStore((s) => s.confirmReagendamento);
  const declineReplan = useActiveSessionStore((s) => s.declineReplan);
  const declineReagendamento = useActiveSessionStore((s) => s.declineReagendamento);
  const storageWarning = useActiveSessionStore((s) => s.storageWarning);
  const clearStorageWarning = useActiveSessionStore((s) => s.clearStorageWarning);
  const replanWarning = useActiveSessionStore((s) => s.replanWarning);
  const clearReplanWarning = useActiveSessionStore((s) => s.clearReplanWarning);

  const skipExercise = useActiveSessionStore((s) => s.skipExercise);
  const skipWholeSession = useActiveSessionStore((s) => s.skipWholeSession);
  const activateSet = useActiveSessionStore((s) => s.activateSet);
  const unskipExercise = useActiveSessionStore((s) => s.unskipExercise);
  const swapExercise = useActiveSessionStore((s) => s.swapExercise);

  // Toggle "menos tempo hoje" (Fase 6): input de minutos → recalcula a proposta.
  const [timeInputVisible, setTimeInputVisible] = useState(false);
  const [minutesText, setMinutesText] = useState('');

  // Recusa declarada (0020): o sheet é da TELA, não da fila — um sheet por
  // exercício abriria vários modais empilhados na mesma árvore.
  const [recusa, setRecusa] = useState<
    { escopo: 'exercicio'; exerciseId: string; nome: string } | { escopo: 'sessao' } | null
  >(null);
  const [recusaBusy, setRecusaBusy] = useState(false);

  // Troca de modalidade de cardio (Fase 3, REQ-06): mesmo padrão de estado da
  // recusa por exercício, sem a variante "sessao" — troca é sempre por
  // exercício individual.
  const [troca, setTroca] = useState<{ exerciseId: string; nome: string } | null>(null);
  const [trocaBusy, setTrocaBusy] = useState(false);
  // null = ainda não carregado; array (mesmo vazio) = resposta do servidor já
  // chegou. Busca lazy: só na primeira vez que o aluno pede a troca.
  const [modalidadesAceitas, setModalidadesAceitas] = useState<
    readonly CardioModalidade[] | null
  >(null);
  const [modalidadesAceitasErro, setModalidadesAceitasErro] = useState(false);

  // A fila e a recusa aberta a partir dela compartilham ESTE Modal nativo. Em
  // Android isso torna impossível empilhar Dialogs durante a animação: o
  // formulário troca apenas o conteúdo da camada já visível.
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState<'queue' | 'skip_reason' | 'swap_modality'>(
    'queue',
  );

  const carregarModalidadesAceitas = useCallback(async () => {
    if (!user) return;
    setModalidadesAceitasErro(false);
    try {
      setModalidadesAceitas(await getModalidadesAceitas(user.id));
    } catch (e) {
      setModalidadesAceitasErro(true);
    }
  }, [user]);

  const onConfirmarRecusa = useCallback(
    async (reason: SkipReason, note: string | null) => {
      if (!recusa || recusaBusy) return;
      setRecusaBusy(true);
      try {
        const ok =
          recusa.escopo === 'sessao'
            ? await skipWholeSession(reason, note)
            : await skipExercise(recusa.exerciseId, reason, note);
        if (!ok) {
          // Falha do servidor NÃO fecha o sheet nem mente que aplicou: o aluno
          // vê o motivo e pode tentar de novo com a escolha preservada.
          Alert.alert('Não foi possível registrar', saveError ?? 'Tente novamente.');
          return;
        }
        setRecusa(null);
        setModalContent('queue');
        setModalVisible(false);
      } finally {
        setRecusaBusy(false);
      }
    },
    [recusa, recusaBusy, skipExercise, skipWholeSession, saveError],
  );

  const onConfirmarTroca = useCallback(
    async (toModality: CardioModalidade) => {
      if (!troca || trocaBusy) return;
      setTrocaBusy(true);
      try {
        const ok = await swapExercise(troca.exerciseId, toModality);
        if (!ok) {
          // Mesmo padrão de onConfirmarRecusa: falha do servidor não fecha o
          // sheet nem aplica a troca — o aluno vê o motivo e pode tentar de novo.
          Alert.alert('Não foi possível trocar', saveError ?? 'Tente novamente.');
          return;
        }
        setTroca(null);
        setModalContent('queue');
        setModalVisible(false);
      } finally {
        setTrocaBusy(false);
      }
    },
    [troca, trocaBusy, swapExercise, saveError],
  );

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
      // Fotografa ANTES de finalizar: números reais do rascunho vivo.
      const resumo = montarResumoSessao(draft);
      const ok = await finishSession();
      if (!ok) {
        Alert.alert(
          'Não foi possível concluir',
          saveError ?? 'Tente novamente.',
        );
        return;
      }
      setResumoFinal(resumo);
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

  // --- Sessão concluída: resumo com os números fotografados no Concluir ---
  if (status === 'finished') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <SessionSummary
          titulo={draft?.title ?? detail?.title ?? null}
          resumo={resumoFinal}
          coachNote={
            lastAutoDecision && lastAutoDecision.sessionLogId === draft?.sessionLogId
              ? lastAutoDecision.reason
              : null
          }
          onVoltar={() =>
            navigation.canGoBack() ? navigation.popToTop() : undefined
          }
        />
      </SafeAreaView>
    );
  }

  if (!draft) {
    // Sessão nova aguardando o check-in obrigatório: o draft só nasce depois
    // das duas respostas. Direção 03: o check-in É a tela (foco), não um sheet
    // sobre um estado vazio.
    if (status === 'awaiting_checkin') {
      return (
        <SafeAreaView style={styles.container} edges={['top']}>
          <CheckInSheet
            visible
            sessionTitle={detail?.title ?? null}
            onConfirm={async (answers) => {
              await confirmCheckIn(answers);
              if (detail) await computeReplan(detail);
            }}
          />
        </SafeAreaView>
      );
    }
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Nenhuma sessão ativa.</Text>
      </View>
    );
  }

  const progresso = sessionProgress(draft);

  // REQ-06, segundo entry point (Fase 3): a recusa em curso é de um exercício
  // de cardio? Só então o SkipReasonSheet oferece "Trocar modalidade" no
  // ramo sem_equipamento. Escopo sessão nunca tem um único exercício a medir.
  const recusaExercicio =
    recusa?.escopo === 'exercicio'
      ? draft.exercises.find((e) => e.exerciseId === recusa.exerciseId)
      : null;
  const recusaEhCardio = recusaExercicio != null && isTimeBased(metricOf(recusaExercicio));

  const onSolicitarTrocaAPartirDaRecusa = () => {
    if (recusa?.escopo !== 'exercicio') return;
    // Mesma fiação de estado do entry point 1 (fila): fecha a recusa, abre a
    // troca reaproveitando o MESMO SwapModalitySheet/swapExercise — nunca um
    // caminho paralelo.
    setTroca({ exerciseId: recusa.exerciseId, nome: recusa.nome });
    setModalContent('swap_modality');
    setRecusa(null);
    if (modalidadesAceitas == null && !modalidadesAceitasErro) {
      void carregarModalidadesAceitas();
    }
  };

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
          reagendamento={pendingReplan?.reagendamento ?? null}
          sessions={pendingReplan?.context.sessions ?? []}
          busy={replanBusy}
          onConfirm={confirmReplan}
          onConfirmReagendamento={() => { void confirmReagendamento(); }}
          onDecline={() => { void declineReplan(); }}
          onDeclineReagendamento={declineReagendamento}
        />

        {/* Redesign 22/07: modo player — um card com o AGORA; o resto é fila. */}
        <SessionPlayer
          draft={draft}
          suggestedLoadFor={(ex, s) => suggestionFor(draft, ex, s)}
        />

        <TouchableOpacity
          style={styles.verAndamentoBtn}
          testID="ver-andamento"
          accessibilityRole="button"
          accessibilityLabel="Ver andamento do treino"
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.verAndamentoText}>Ver andamento</Text>
        </TouchableOpacity>

        {replanWarning ? (
          <Notice
            tone="warning"
            title={replanWarning}
            style={styles.errorBanner}
            action={
              <Button label="Dispensar" variant="ghost" compact onPress={clearReplanWarning} />
            }
          />
        ) : null}

        {storageWarning ? (
          <Notice
            tone="warning"
            title={storageWarning}
            style={styles.errorBanner}
            action={
              <Button label="Dispensar" variant="ghost" compact onPress={clearStorageWarning} />
            }
          />
        ) : null}

        {/* Recusar tudo, exercício por exercício, deixava a tela sem saída: o
            "Concluir" exige série registrada e não havia nada registrado. Aqui o
            caminho honesto aparece — o treino foi recusado, não concluído. */}
        {sessionSemNadaAFazer(draft) ? (
          <Button
            label="Recusar o treino de hoje"
            onPress={() => setRecusa({ escopo: 'sessao' })}
            style={styles.finishBtn}
            testID="recusar-treino-sem-nada"
          />
        ) : (
          <Button
            label="Concluir treino"
            onPress={onConcluirTreino}
            disabled={progresso.done === 0}
            style={styles.finishBtn}
          />
        )}

        {/* Nada registrado ainda: desistir do dia inteiro é uma decisão legítima
            e fica como link discreto. Com séries feitas, o caminho é Concluir —
            uma sessão 'skipped' com execução dentro seria contraditória. */}
        {progresso.done === 0 && !sessionSemNadaAFazer(draft) ? (
          <TouchableOpacity
            style={styles.recusarSessao}
            onPress={() => setRecusa({ escopo: 'sessao' })}
            testID="recusar-treino-hoje"
            accessibilityRole="button"
            accessibilityLabel="Não vou treinar hoje"
          >
            <Text style={styles.recusarSessaoLabel}>Não vou treinar hoje</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

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

      <SkipReasonSheet
        visible={recusa != null && modalContent !== 'skip_reason'}
        escopo={recusa?.escopo ?? 'exercicio'}
        alvo={recusa?.escopo === 'exercicio' ? recusa.nome : draft.title}
        busy={recusaBusy}
        ehCardio={recusaEhCardio}
        onSolicitarTroca={onSolicitarTrocaAPartirDaRecusa}
        onConfirm={onConfirmarRecusa}
        onDismiss={() => setRecusa(null)}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setModalVisible(false);
          setModalContent('queue');
          setRecusa(null);
          setTroca(null);
        }}
      >
        {modalContent === 'skip_reason' && recusa?.escopo === 'exercicio' ? (
          <SkipReasonSheet
            inline
            visible
            escopo="exercicio"
            alvo={recusa.nome}
            busy={recusaBusy}
            ehCardio={recusaEhCardio}
            onSolicitarTroca={onSolicitarTrocaAPartirDaRecusa}
            onConfirm={onConfirmarRecusa}
            onDismiss={() => { setRecusa(null); setModalContent('queue'); }}
          />
        ) : modalContent === 'swap_modality' && troca != null ? (
          <SwapModalitySheet
            inline
            visible
            exercicioAtualNome={troca.nome}
            modalidades={modalidadesAceitas}
            erro={modalidadesAceitasErro}
            onRecarregar={carregarModalidadesAceitas}
            busy={trocaBusy}
            onConfirm={onConfirmarTroca}
            onDismiss={() => { setTroca(null); setModalContent('queue'); }}
          />
        ) : <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Andamento do treino</Text>
            <TouchableOpacity
              style={styles.modalClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar andamento"
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            <SessionQueue
              draft={draft}
              metaFor={(ex) => {
                const detalheEx = detail?.planned_exercises.find(
                  (e) => e.id === ex.exerciseId,
                );
                return detalheEx ? formatExerciseTarget(detalheEx) : null;
              }}
              onSolicitarRecusa={(ex: DraftExercise) => {
                setRecusa({ escopo: 'exercicio', exerciseId: ex.exerciseId, nome: ex.name });
                setModalContent('skip_reason');
              }}
              onSolicitarTroca={(ex: DraftExercise) => {
                setTroca({ exerciseId: ex.exerciseId, nome: ex.name });
                setModalContent('swap_modality');
                // Busca lazy: só na primeira vez que o aluno pede a troca, não
                // em toda sessão com cardio.
                if (modalidadesAceitas == null && !modalidadesAceitasErro) {
                  void carregarModalidadesAceitas();
                }
              }}
              onActivateSet={(exerciseId, setOrder) => {
                activateSet(exerciseId, setOrder);
                setModalVisible(false);
              }}
              onUnskipExercise={(exerciseId) => {
                void unskipExercise(exerciseId);
                setModalVisible(false);
              }}
            />
          </ScrollView>
        </SafeAreaView>}
      </Modal>
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
  recusarSessao: {
    minHeight: theme.hitTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  recusarSessaoLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    textDecorationLine: 'underline',
  },
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

  verAndamentoBtn: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.borderRadius.md,
  },
  verAndamentoText: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface.canvas,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  modalTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  modalClose: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  modalCloseText: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  modalScroll: { padding: theme.spacing.xl },
});

export default ActiveSessionScreen;
