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
import { duracaoEmMinutos, formatarDuracao } from '../utils/weekSummary';

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
        <ActivityIndicator color={theme.colors.accent.main} />
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

  const subtitulo = [
    detail.weekNumber ? `Semana ${detail.weekNumber}` : null,
    formatarDuracao(duracaoEmMinutos(detail)),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{detail.title}</Text>
      {/* Só entra o que existe: semana ausente e duração desconhecida somem. */}
      {subtitulo ? <Text style={styles.subtitle}>{subtitulo}</Text> : null}
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
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    backgroundColor: theme.colors.surface.canvas,
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
    marginBottom: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  list: { paddingBottom: theme.spacing.xxl },
  // Cabeçalho de exercício em branco, não em neon: são muitos por tela, e o
  // acento perderia o sentido de destaque.
  exerciseName: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  setText: {
    flex: 1,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  chip: {
    marginLeft: theme.spacing.sm,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  muted: {
    marginTop: theme.spacing.xxl,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
    textAlign: 'center',
  },
});

export default SessionHistoryDetailScreen;
