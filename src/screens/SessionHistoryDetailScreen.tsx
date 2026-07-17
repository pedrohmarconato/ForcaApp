// src/screens/SessionHistoryDetailScreen.tsx
// Fase 4 — o que foi feito numa sessão concluída: reps/carga/RIR reais por
// exercício, com o outcome de cada série. Erro de banco ≠ "sem dados".

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, StyleSheet, ActivityIndicator } from 'react-native';
import theme from '../theme/theme';
import {
  getSessionLogDetail,
  type SessionLogDetail,
  type HistorySetLog,
} from '../services/sessionExecutionRepository';
import type { Outcome } from '../engine/sessionModel';

const OUTCOME_LABEL: Record<Outcome, string> = { on_target: 'No alvo', under: 'Abaixo', over: 'Acima' };
const outcomeColor = (o: Outcome): string =>
  o === 'on_target'
    ? theme.colors.status.success
    : o === 'under'
      ? theme.colors.status.warning
      : theme.colors.status.info;

type Props = { route: { params: { sessionLogId: string; title?: string } } };

const descreveSerie = (s: HistorySetLog): string => {
  const carga = s.actualLoadKg != null ? `${s.actualLoadKg} kg` : 'peso corporal';
  const rir = s.actualRir != null ? ` · RIR ${s.actualRir}` : '';
  return `${s.actualReps} reps × ${carga}${rir}`;
};

const SessionHistoryDetailScreen = ({ route }: Props) => {
  const { sessionLogId } = route.params;
  const [detail, setDetail] = useState<SessionLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const buscar = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setDetail(await getSessionLogDetail(sessionLogId));
    } catch (err) {
      console.error('Erro ao buscar detalhe do histórico:', err);
      setDetail(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionLogId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary.main} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          Não foi possível carregar este treino. Verifique a conexão e tente novamente.
        </Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Treino não encontrado.</Text>
      </View>
    );
  }

  const sections = detail.exercises.map((ex) => ({ title: ex.name, data: ex.sets }));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{detail.title}</Text>
      {detail.weekNumber ? <Text style={styles.subtitle}>Semana {detail.weekNumber}</Text> : null}
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.setOrder ?? 'x'}-${index}`}
        renderSectionHeader={({ section }) => (
          <Text style={styles.exerciseName}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.setRow}>
            <Text style={styles.setText}>
              Série {item.setOrder ?? '—'}: {descreveSerie(item)}
            </Text>
            {item.outcome ? (
              <Text style={[styles.chip, { color: outcomeColor(item.outcome) }]}>
                {OUTCOME_LABEL[item.outcome]}
              </Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.muted}>Nenhuma série registrada nesta sessão.</Text>
        }
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background.dark, padding: 16 },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.background.dark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: { color: theme.colors.text.primary, fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: theme.colors.text.secondary, marginBottom: 12 },
  list: { paddingBottom: 24 },
  exerciseName: {
    color: theme.colors.primary.main,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.light,
  },
  setText: { color: theme.colors.text.secondary, fontSize: 14, flex: 1 },
  chip: { fontWeight: '700', fontSize: 13, marginLeft: 8 },
  muted: { color: theme.colors.text.secondary, textAlign: 'center', marginTop: 24 },
});

export default SessionHistoryDetailScreen;
