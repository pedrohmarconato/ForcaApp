// src/screens/SessionHistoryScreen.tsx
// Fase 4 — histórico de sessões concluídas (aberto pelo Perfil). Lista o que foi
// feito; toque abre o detalhe com reps/cargas reais. Erro de banco ≠ lista vazia.
//
// Direção 02: linhas de mesma geometria das demais listas, com a duração real
// da sessão quando os dois carimbos existem.

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import theme from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import type { ProfileStackParamList } from '../navigation/MainNavigator';
import {
  getCompletedSessions,
  type CompletedSessionSummary,
} from '../services/sessionExecutionRepository';
import { duracaoEmMinutos, formatarDuracao } from '../utils/weekSummary';
import { Screen, ScreenTitle, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { EmptyState, Notice } from '../components/ui/Feedback';

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

  const renderItem = ({ item }: { item: CompletedSessionSummary }) => {
    // Só entra na linha o que existe de fato — duração ausente não vira zero.
    const detalhes = [
      item.weekNumber ? `Semana ${item.weekNumber}` : null,
      item.finishedAt ? formatarQuando(item.finishedAt) : formatarQuando(item.startedAt),
      formatarDuracao(duracaoEmMinutos(item)),
    ].filter(Boolean);

    return (
      <ListRow
        title={item.title}
        subtitle={[detalhes.join(' · '), item.muscleGroups?.join(' · ')]
          .filter(Boolean)
          .join('\n')}
        showChevron
        onPress={() =>
          navigation.navigate('SessionHistoryDetail', {
            sessionLogId: item.sessionLogId,
            title: item.title,
          })
        }
      />
    );
  };

  return (
    <Screen>
      <ScreenTitle kicker="Perfil" title="Histórico de treinos" />

      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.accent.main} />
      ) : loadError ? (
        <Notice
          tone="danger"
          title="Falha ao carregar"
          description="Não foi possível carregar seu histórico. Verifique a conexão e tente novamente."
          action={<Button label="Tentar novamente" variant="outline" compact onPress={buscar} />}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="activity"
          title="Nenhum treino concluído ainda"
          description="Você ainda não concluiu nenhum treino. Ao terminar uma sessão, ela aparece aqui."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.sessionLogId}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  loader: { marginTop: theme.spacing.xxl },
  list: { paddingBottom: theme.spacing.xxl },
});

export default SessionHistoryScreen;
