// src/screens/ActiveSessionScreen.tsx
// Fase 4 — execução interativa do treino. Carrega o detalhe da sessão (Fase 3),
// inicia/retoma a execução no store e registra série a série. Estados distintos:
// carregando, erro de carga, erro do início, ativo e concluído — erro nunca é
// mascarado como "sessão vazia".

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
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
import { getSessionDetail, formatExerciseTarget, type SessionDetail } from '../services/trainingRepository';
import { useActiveSessionStore, suggestionFor } from '../store/activeSessionStore';
import { sessionProgress, isSessionComplete } from '../engine/sessionModel';
import SetRow from '../components/session/SetRow';

type Props = { route: { params: { sessionId: string } } };

const ActiveSessionScreen = ({ route }: Props) => {
  const { sessionId } = route.params;
  // ActiveSession existe na Home e no Training stack; o ParamList da Home basta
  // para tipar popToTop/canGoBack (não dependem de params específicos).
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList, 'ActiveSession'>>();
  const { user } = useAuth();

  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  const draft = useActiveSessionStore((s) => s.draft);
  const status = useActiveSessionStore((s) => s.status);
  const saveError = useActiveSessionStore((s) => s.saveError);
  const startOrResume = useActiveSessionStore((s) => s.startOrResume);
  const finishSession = useActiveSessionStore((s) => s.finishSession);
  const clearError = useActiveSessionStore((s) => s.clearError);
  const reset = useActiveSessionStore((s) => s.reset);

  const iniciar = useCallback(async () => {
    if (!user) return;
    setDetailLoading(true);
    setDetailError(false);
    reset();
    try {
      const d = await getSessionDetail(sessionId);
      if (!d) {
        setDetailError(true);
        return;
      }
      setDetail(d);
      await startOrResume({ sessionId, userId: user.id, detail: d });
    } catch (err) {
      console.error('Erro ao iniciar sessão:', err);
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  useEffect(() => {
    iniciar();
  }, [iniciar]);

  const onConcluirTreino = useCallback(() => {
    if (!draft) return;
    const finalizar = async () => {
      const ok = await finishSession();
      if (!ok) {
        Alert.alert('Não foi possível concluir', saveError ?? 'Tente novamente.');
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
        <ActivityIndicator size="large" color={theme.colors.primary.main} />
        <Text style={styles.muted}>Preparando sua sessão...</Text>
      </View>
    );
  }

  // --- Erro ao carregar o detalhe do treino ---
  if (detailError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          Não foi possível abrir o treino. Verifique a conexão e tente novamente.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={iniciar}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.retryBtn} onPress={iniciar}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Sessão concluída ---
  if (status === 'finished') {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>Treino concluído! 💪</Text>
        <Text style={styles.muted}>
          Suas séries foram registradas. Veja o resumo no seu histórico (aba Perfil).
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => (navigation.canGoBack() ? navigation.popToTop() : undefined)}
        >
          <Text style={styles.retryText}>Voltar ao início</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={styles.centered}>
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
      </View>

      {saveError ? (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>{saveError} (toque para dispensar)</Text>
        </TouchableOpacity>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {draft.exercises.map((ex, idxEx) => {
          const detalheEx = detail?.planned_exercises.find((e) => e.id === ex.exerciseId);
          return (
            <View key={ex.exerciseId} style={styles.exerciseBlock}>
              <Text style={styles.exerciseName}>
                {idxEx + 1}. {ex.name}
              </Text>
              {detalheEx ? (
                <Text style={styles.exerciseMeta}>{formatExerciseTarget(detalheEx)}</Text>
              ) : null}
              {ex.sets.map((s, idxSet) => (
                <SetRow
                  key={s.plannedSetId}
                  exercise={ex}
                  set={s}
                  suggestedLoad={suggestionFor(draft, ex, s)}
                  isLast={idxSet === ex.sets.length - 1}
                />
              ))}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.finishBtn, progresso.done === 0 && styles.finishBtnDisabled]}
          onPress={onConcluirTreino}
          disabled={progresso.done === 0}
        >
          <Text style={styles.finishBtnText}>Concluir treino</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.dark },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.background.dark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: { color: theme.colors.text.secondary, textAlign: 'center', marginTop: 12 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { color: theme.colors.text.primary, fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: theme.colors.text.secondary, marginTop: 4 },
  scroll: { padding: 16, paddingTop: 4 },
  exerciseBlock: { marginBottom: 20 },
  exerciseName: { color: theme.colors.text.primary, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  exerciseMeta: { color: theme.colors.text.muted, fontSize: 13, marginBottom: 10 },
  errorBanner: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
  },
  errorBannerText: { color: theme.colors.status.error, fontSize: 13 },
  finishBtn: {
    backgroundColor: theme.colors.primary.main,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  finishBtnDisabled: { opacity: 0.4 },
  finishBtnText: { color: theme.colors.primary.contrast, fontWeight: '700', fontSize: 16 },
  doneTitle: { color: theme.colors.primary.main, fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  retryBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primary.main,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: { color: theme.colors.primary.contrast, fontWeight: '700' },
});

export default ActiveSessionScreen;
