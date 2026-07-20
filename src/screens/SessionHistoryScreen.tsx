// src/screens/SessionHistoryScreen.tsx
// Fase 4 — histórico de sessões concluídas (aberto pelo Perfil). Lista o que foi
// feito; toque abre o detalhe com reps/cargas reais. Erro de banco ≠ lista vazia.

import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import theme from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import type { ProfileStackParamList } from '../navigation/MainNavigator';
import {
  getCompletedSessions,
  type CompletedSessionSummary,
} from '../services/sessionExecutionRepository';

const formatarQuando = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR')} · ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const SessionHistoryScreen = () => {
  const navigation = useNavigation<StackNavigationProp<ProfileStackParamList, 'SessionHistory'>>();
  const { user } = useAuth();
  const [items, setItems] = useState<CompletedSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const buscar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      setItems(await getCompletedSessions(user.id));
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
      setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Recarrega sempre que a tela ganha foco (após concluir um treino, por ex.).
  useFocusEffect(
    useCallback(() => {
      buscar();
    }, [buscar]),
  );

  const renderItem = ({ item }: { item: CompletedSessionSummary }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('SessionHistoryDetail', {
          sessionLogId: item.sessionLogId,
          title: item.title,
        })
      }
    >
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardMeta}>
        {item.weekNumber ? `Semana ${item.weekNumber} · ` : ''}
        {item.finishedAt ? formatarQuando(item.finishedAt) : formatarQuando(item.startedAt)}
      </Text>
      {item.muscleGroups?.length ? (
        <Text style={styles.cardGroups}>{item.muscleGroups.join(' · ')}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Histórico de treinos</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.accent.main} />
      ) : loadError ? (
        <Text style={styles.muted}>
          Não foi possível carregar seu histórico. Verifique a conexão e tente novamente.
        </Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>
          Você ainda não concluiu nenhum treino. Ao terminar uma sessão, ela aparece aqui.
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.sessionLogId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface.canvas, padding: 16 },
  title: { color: theme.colors.text.primary, fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  list: { paddingBottom: 24 },
  card: {
    backgroundColor: theme.colors.surface.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  cardTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: theme.colors.text.secondary, marginTop: 4, fontSize: 13 },
  cardGroups: { color: theme.colors.text.quiet, marginTop: 4, fontSize: 12 },
  muted: { color: theme.colors.text.secondary, textAlign: 'center', marginTop: 24 },
});

export default SessionHistoryScreen;
