// src/components/session/ReplanBanner.tsx
// Fase 6 — banner de replanejamento semanal na tela de sessão. Resume as mudanças
// PROPOSTAS (corte de tempo de hoje e/ou redistribuição pós-falta, com as perdas
// aceitas) e espera a decisão do aluno: "Aplicar" confirma e só então algo é
// escrito; "Manter plano original" recusa e nada muda. Enquanto o aluno não
// decide, a proposta é só um overlay em memória.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../../theme/theme';
import type {
  WeeklyReplanProposal,
  ReplanLoss,
} from '../../engine/weeklyReplanner';

type Props = {
  /** null = escondido. */
  proposal: WeeklyReplanProposal | null;
  /** Rótulos exibíveis das sessões da semana ("Treino B · 2026-07-18"). */
  sessionLabelById: Record<string, string>;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
};

const LOSS_REASON_LABEL: Record<ReplanLoss['reason'], string> = {
  nao_coube: 'não coube nas sessões restantes',
  deload_nao_compensa: 'deload não compensa',
  sem_grupo_muscular: 'sem grupo muscular definido',
  replan_anterior_perdido: 'volume de replanejamento anterior',
};

const plural = (n: number, singular: string, pluralForm: string): string =>
  `${n} ${n === 1 ? singular : pluralForm}`;

const ReplanBanner = ({ proposal, sessionLabelById, busy, onConfirm, onDecline }: Props) => {
  if (!proposal || !proposal.hasChanges) return null;
  const { timeCut, redistribution } = proposal;

  return (
    <View style={styles.card} accessibilityLabel="Proposta de replanejamento da semana">
      <Text style={styles.title} accessibilityRole="header">
        Replanejar a semana?
      </Text>

      {redistribution ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            {plural(redistribution.missedSessionIds.length, 'treino perdido', 'treinos perdidos')}
          </Text>
          {redistribution.missedSessionIds.map((id) => (
            <Text key={id} style={styles.line}>
              • {sessionLabelById[id] ?? id} será marcado como pulado
            </Text>
          ))}
          {redistribution.additions.map((a) => (
            <Text key={`${a.targetSessionId}-${a.exerciseId}`} style={styles.line}>
              • +{plural(a.addSets, 'série', 'séries')} de {a.exerciseName} ({a.muscleGroup}) em{' '}
              {sessionLabelById[a.targetSessionId] ?? a.targetSessionId}
            </Text>
          ))}
          {redistribution.losses.map((l, i) => (
            <Text key={`loss-${i}`} style={styles.loss}>
              • {plural(l.sets, 'série', 'séries')} de {l.muscleGroup}:{' '}
              {LOSS_REASON_LABEL[l.reason]} — perda registrada
            </Text>
          ))}
        </View>
      ) : null}

      {timeCut ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            Menos tempo hoje ({timeCut.availableMinutes} de {timeCut.estimatedMinutes} min)
          </Text>
          <Text style={styles.line}>
            •{' '}
            {timeCut.keptPriorities.includes('secondary')
              ? 'Manter principais e secundários; cortar acessórios'
              : 'Manter só os exercícios principais'}
          </Text>
          {timeCut.cutExercises.map((c) => (
            <Text key={c.exerciseId} style={styles.loss}>
              • Cortar {c.name} ({plural(c.setsCut, 'série', 'séries')})
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.confirmBtn, busy && styles.btnDisabled]}
          onPress={onConfirm}
          disabled={busy}
          testID="replan-confirm"
          accessibilityRole="button"
          accessibilityLabel="Aplicar as mudanças propostas"
        >
          <Text style={styles.confirmText}>{busy ? 'Aplicando...' : 'Aplicar mudanças'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.declineBtn, busy && styles.btnDisabled]}
          onPress={onDecline}
          disabled={busy}
          testID="replan-decline"
          accessibilityRole="button"
          accessibilityLabel="Recusar e manter o plano original"
        >
          <Text style={styles.declineText}>Manter plano original</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background.card ?? '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary.main,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  block: { marginBottom: 10 },
  blockTitle: {
    color: theme.colors.primary.main,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  line: { color: theme.colors.text.secondary, fontSize: 13, marginTop: 2 },
  loss: { color: theme.colors.text.muted, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', marginTop: 6 },
  confirmBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary.main,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  confirmText: { color: theme.colors.primary.contrast, fontWeight: '700', fontSize: 14 },
  declineBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineText: { color: theme.colors.text.primary, fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});

export default ReplanBanner;
