// src/components/session/ReplanBanner.tsx
// Fase 6 — banner de replanejamento semanal na tela de sessão. Resume as
// mudanças PROPOSTAS e espera a decisão do aluno: "Aplicar" confirma e só então
// algo é escrito; "Manter plano original" recusa e nada muda. Enquanto o aluno
// não decide, a proposta é só um overlay em memória.
//
// Redesign 24/07/2026 (direção do dono): a lista de bullets virou CARTÕES com
// antes → depois. O problema da versão anterior não era falta de informação, e
// sim excesso de delta: "+2 séries de Supino em Treino D" nunca dizia que o
// Treino D ia de 12 para 15. Três naturezas diferentes (o que some, o que
// cresce, o que fica de fora) dividiam o mesmo "•" cinza, e o motivo da perda
// chegava em jargão de motor. Agora cada mudança é uma unidade com ícone,
// número antes → depois e motivo em português — ver engine/replanChanges.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import theme from '../../theme/theme';
import FModules from '../ui/FModules';
import {
  montarMudancas,
  resumoDasMudancas,
  type MudancaDoReplan,
} from '../../engine/replanChanges';
import type {
  WeeklyReplanProposal,
  ReplanSession,
} from '../../engine/weeklyReplanner';

type Props = {
  /** null = escondido. */
  proposal: WeeklyReplanProposal | null;
  /** Sessões da semana — base do "antes" de cada cartão. */
  sessions: ReplanSession[];
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
};

const plural = (n: number, singular: string, pluralForm: string): string =>
  `${n} ${n === 1 ? singular : pluralForm}`;

/** Um cartão por mudança: ícone dá a natureza, o corpo dá o antes → depois. */
const CartaoDeMudanca = ({ mudanca }: { mudanca: MudancaDoReplan }) => {
  switch (mudanca.tipo) {
    case 'sessao_pulada':
      return (
        <View style={styles.cartao}>
          <View style={[styles.icone, styles.iconeNeutro]}>
            <Feather name="x" size={14} color={theme.colors.text.quiet} />
          </View>
          <View style={styles.corpo}>
            <Text style={styles.cartaoTitulo}>{mudanca.rotulo}</Text>
            <View style={styles.transicao}>
              <Text style={styles.antes}>pendente</Text>
              <Feather
                name="arrow-right"
                size={13}
                color={theme.colors.text.quiet}
                style={styles.seta}
              />
              <Text style={styles.depoisNeutro}>pulado</Text>
            </View>
            {mudanca.seriesQuePerdeu > 0 ? (
              <Text style={styles.detalhe}>
                {plural(mudanca.seriesQuePerdeu, 'série', 'séries')} que não aconteceram
              </Text>
            ) : null}
          </View>
        </View>
      );

    case 'sessao_reforcada':
      return (
        <View style={styles.cartao}>
          <View style={[styles.icone, styles.iconeAcento]}>
            <Feather name="arrow-up" size={14} color={theme.colors.accent.main} />
          </View>
          <View style={styles.corpo}>
            <Text style={styles.cartaoTitulo}>{mudanca.rotulo}</Text>
            <View style={styles.transicao}>
              <Text style={styles.antes}>{mudanca.seriesAntes}</Text>
              <Feather
                name="arrow-right"
                size={13}
                color={theme.colors.text.quiet}
                style={styles.seta}
              />
              <Text style={styles.depois}>{mudanca.seriesDepois} séries</Text>
              <Text style={styles.delta}>+{mudanca.adicionadas}</Text>
            </View>
            <Text style={styles.detalhe}>
              {mudanca.porGrupo.map((g) => `${g.grupo} +${g.sets}`).join(' · ')}
            </Text>
          </View>
        </View>
      );

    case 'corte_de_tempo':
      return (
        <View style={styles.cartao}>
          <View style={[styles.icone, styles.iconeAcento]}>
            <Feather name="clock" size={14} color={theme.colors.accent.main} />
          </View>
          <View style={styles.corpo}>
            <Text style={styles.cartaoTitulo}>Hoje · menos tempo</Text>
            <View style={styles.transicao}>
              <Text style={styles.antes}>{mudanca.minutosAntes}</Text>
              <Feather
                name="arrow-right"
                size={13}
                color={theme.colors.text.quiet}
                style={styles.seta}
              />
              <Text style={styles.depois}>{mudanca.minutosDepois} min</Text>
            </View>
            <Text style={styles.detalhe}>{mudanca.mantem}</Text>
            {mudanca.cortados.length > 0 ? (
              <Text style={styles.detalheSaida}>
                saem: {mudanca.cortados.map((c) => `${c.nome} (${c.sets})`).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      );

    case 'sem_espaco':
      return (
        <View style={styles.cartao}>
          <View style={[styles.icone, styles.iconeAlerta]}>
            <Feather name="alert-triangle" size={13} color={theme.colors.status.warning} />
          </View>
          <View style={styles.corpo}>
            <Text style={styles.cartaoTitulo}>{mudanca.grupo}</Text>
            <Text style={styles.foraDeJogo}>
              {plural(mudanca.sets, 'série fica', 'séries ficam')} de fora
            </Text>
            <Text style={styles.detalhe}>{mudanca.motivo}</Text>
          </View>
        </View>
      );

    default:
      return null;
  }
};

const ReplanBanner = ({ proposal, sessions, busy, onConfirm, onDecline }: Props) => {
  if (!proposal || !proposal.hasChanges) return null;
  const mudancas = montarMudancas({ proposal, sessions });
  if (mudancas.length === 0) return null;

  return (
    <View style={styles.card} accessibilityLabel="Proposta de replanejamento da semana">
      {/* Direção 03: proposta do motor vira "momento do treinador" assinado. */}
      <View style={styles.coachRow}>
        <FModules lit={1} size={16} />
        <Text style={styles.coachKicker}>Proposta do treinador</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {resumoDasMudancas(mudancas)}
      </Text>

      <View style={styles.lista}>
        {mudancas.map((m, i) => (
          <View key={m.chave} style={i > 0 ? styles.comSeparador : undefined}>
            <CartaoDeMudanca mudanca={m} />
          </View>
        ))}
      </View>

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
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  coachKicker: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.bold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  card: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    // Proposta pendente: borda acentuada marca a decisão sem gritar.
    borderColor: theme.colors.accent.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface.card,
  },
  title: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  lista: {
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  comSeparador: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  cartao: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  icone: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.pill,
  },
  iconeAcento: { backgroundColor: theme.colors.accent.soft },
  iconeNeutro: { backgroundColor: theme.colors.veil.soft },
  iconeAlerta: { backgroundColor: theme.colors.veil.soft },
  // minWidth 0: sem isto o texto longo empurra o cartão e vaza da tela
  // estreita — mesma classe de bug do campo de carga (ver sessionPlayerLayout).
  corpo: { flex: 1, minWidth: 0 },
  cartaoTitulo: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  // A linha do antes → depois é o coração do cartão: número velho apagado,
  // número novo em destaque, delta como selo.
  transicao: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xxs,
  },
  antes: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    textDecorationLine: 'line-through',
  },
  seta: { marginHorizontal: theme.spacing.xxs },
  depois: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
  },
  depoisNeutro: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  delta: {
    paddingVertical: 1,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accent.soft,
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
  foraDeJogo: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.status.warning,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  detalhe: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  detalheSaida: {
    marginTop: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },

  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.hitTarget.compact,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent.main,
  },
  confirmText: {
    color: theme.colors.accent.on,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  declineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.hitTarget.compact,
    borderWidth: 1,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.borderRadius.md,
  },
  declineText: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  btnDisabled: { opacity: 0.45 },
});

export default ReplanBanner;
