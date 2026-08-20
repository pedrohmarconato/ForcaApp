// src/components/session/ReplanBanner.tsx
// Fase 6 — banner de replanejamento semanal na tela de sessão. Resume as
// mudanças PROPOSTAS e espera a decisão do aluno: "Aplicar" confirma e só então
// algo é escrito; "Manter plano original" recusa e nada muda. Enquanto o aluno
// não decide, a proposta é só um overlay em memória.
//
// COMMIT B da escada de reencaixe (jul/2026): os cartões de redistribuição
// (sessão pulada, sessão reforçada, volume sem espaço) saíram — a proposta
// restante é o corte de tempo da sessão de hoje, num único cartão com
// antes → depois e motivo em português — ver engine/replanChanges.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import FModules from '../ui/FModules';
import {
  montarMudancas,
  resumoDasMudancas,
  diaDaSemana,
  type MudancaDoReplan,
} from '../../engine/replanChanges';
import { fecharSemana } from '../../engine/weekShortfall';
import type {
  WeeklyReplanProposal,
  ReplanSession,
} from '../../engine/weeklyReplanner';
import type { Reagendamento } from '../../store/activeSessionStore';

type Props = {
  /** null = escondido. */
  proposal: WeeklyReplanProposal | null;
  /** Plano de reencaixe (se houver sessões atrasadas). */
  reagendamento: Reagendamento | null;
  /** Sessões da semana — base do "antes" de cada cartão. */
  sessions: ReplanSession[];
  busy: boolean;
  onConfirm: () => void;
  onConfirmReagendamento: () => void;
  onDecline: () => void;
  /**
   * Recusa do REENCAIXE. Separada de `onDecline` de propósito: o cartão de
   * reagendamento tem precedência e esconde o corte de tempo, então usar a
   * mesma ação gravaria o fingerprint de uma proposta que o aluno não viu —
   * e pedir os mesmos minutos depois não traria nada de volta.
   */
  onDeclineReagendamento: () => void;
};

const plural = (n: number, singular: string, pluralForm: string): string =>
  `${n} ${n === 1 ? singular : pluralForm}`;

/** Um cartão por mudança: ícone dá a natureza, o corpo dá o antes → depois. */
const CartaoDeMudanca = ({ mudanca }: { mudanca: MudancaDoReplan }) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);

  switch (mudanca.tipo) {
    case 'corte_de_tempo':
      return (
        <View style={styles.cartao}>
          <View style={[styles.icone, styles.iconeAcento]}>
            <Feather name="clock" size={14} color={theme.colors.accent.main} />
          </View>
          <View style={styles.corpo}>
            <Text style={styles.cartaoTitulo}>Hoje · menos tempo</Text>
            {/* Antes → depois em SÉRIES: é o que o motor calcula. O tempo entra
                como contexto, porque a duração do treino cortado não é
                reestimada por ninguém — ver engine/replanChanges. */}
            {mudanca.seriesAntes != null && mudanca.seriesDepois != null ? (
              <View style={styles.transicao}>
                <Text style={styles.antes}>{mudanca.seriesAntes}</Text>
                <Feather
                  name="arrow-right"
                  size={13}
                  color={theme.colors.text.quiet}
                  style={styles.seta}
                />
                <Text style={styles.depois}>{mudanca.seriesDepois} séries</Text>
                <Text style={styles.delta}>
                  −{mudanca.seriesAntes - mudanca.seriesDepois}
                </Text>
              </View>
            ) : null}
            <Text style={styles.detalhe}>
              você tem {mudanca.minutosDisponiveis} dos {mudanca.minutosEstimados} min
              estimados
            </Text>
            <Text style={styles.detalhe}>{mudanca.mantem}</Text>
            {mudanca.cortados.length > 0 ? (
              <Text style={styles.detalheSaida}>
                saem: {mudanca.cortados.map((c) => `${c.nome} (${c.sets})`).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      );

    default:
      return null;
  }
};

const ReplanBanner = ({ proposal, reagendamento, sessions, busy, onConfirm, onConfirmReagendamento, onDecline, onDeclineReagendamento }: Props) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);

  // Se há reencaixe, mostra o cartão de reencaixe.
  if (reagendamento && reagendamento.movidas.length > 0) {
    return (
      <View style={styles.card} accessibilityLabel="Reagendamento de sessões">
        {/* Direção 03: proposta do motor vira "momento do treinador" assinado. */}
        <View style={styles.coachRow}>
          <FModules lit={1} size={16} />
          <Text style={styles.coachKicker}>Proposta do treinador</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {reagendamento.movidas.length === 1
            ? '1 treino muda de dia'
            : `${reagendamento.movidas.length} treinos mudam de dia`}
        </Text>

        <View style={styles.lista}>
          {reagendamento.movidas.map((movida, i) => (
            <View key={movida.id} style={i > 0 ? styles.comSeparador : undefined}>
              <View style={styles.cartao}>
                <View style={[styles.icone, styles.iconeAcento]}>
                  <Feather name="calendar" size={14} color={theme.colors.accent.main} />
                </View>
                <View style={styles.corpo}>
                  <Text style={styles.cartaoTitulo}>
                    {sessions.find(s => s.id === movida.id)?.title || movida.id}
                  </Text>
                  <View style={styles.transicao}>
                    <Text style={styles.antes}>
                      {movida.de ? diaDaSemana(movida.de) || 'sem data' : 'sem data'}
                    </Text>
                    <Feather
                      name="arrow-right"
                      size={13}
                      color={theme.colors.text.quiet}
                      style={styles.seta}
                    />
                    <Text style={styles.depois}>
                      {diaDaSemana(movida.para) || movida.para}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          {reagendamento.semEncaixe.length > 0 && (
            <View style={styles.comSeparador}>
              <View style={styles.cartao}>
                <View style={[styles.icone, styles.iconeAlerta]}>
                  <Feather name="alert-triangle" size={13} color={theme.colors.status.warning} />
                </View>
                <View style={styles.corpo}>
                  <Text style={styles.cartaoTitulo}>Sem encaixe nesta semana</Text>
                  <Text style={styles.detalhe}>
                    {reagendamento.semEncaixe.length === 1
                      ? '1 treino não cabe até domingo'
                      : `${reagendamento.semEncaixe.length} treinos não cabem até domingo`}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.confirmBtn, busy && styles.btnDisabled]}
            onPress={onConfirmReagendamento}
            disabled={busy}
            testID="replan-confirm-reagendamento"
            accessibilityRole="button"
            accessibilityLabel="Reencaixar os treinos"
          >
            <Text style={styles.confirmText}>{busy ? 'Reencaixando...' : 'Reencaixar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineBtn, busy && styles.btnDisabled]}
            onPress={onDeclineReagendamento}
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
  }

  // Nível 2 da escada de reencaixe: nada foi reencaixável (agenda sem espaço)
  // e a semana fecha com menos volume — dito sem eufemismo. Botão único
  // reconhece o fechamento; não há plano B para oferecer.
  // Só quando NÃO há proposta ativa: um corte de tempo pedido pelo aluno
  // (proposal.hasChanges) é a decisão em jogo — escondê-lo atrás do "Entendi"
  // do Nível 2 faria a recusa gravar o fingerprint do corte sem o aluno vê-lo.
  if (
    proposal &&
    !proposal.hasChanges &&
    reagendamento &&
    reagendamento.movidas.length === 0 &&
    reagendamento.semEncaixe.length > 0
  ) {
    const fechamento = fecharSemana({
      adherence: proposal.adherence,
      sessions,
      semEncaixe: reagendamento.semEncaixe,
    });
    return (
      <View style={styles.card} accessibilityLabel="Semana fecha com menos volume">
        <View style={styles.coachRow}>
          <FModules lit={1} size={16} />
          <Text style={styles.coachKicker}>Proposta do treinador</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          A semana fecha com menos volume
        </Text>

        <View style={styles.lista}>
          <View style={styles.cartao}>
            <View style={[styles.icone, styles.iconeAlerta]}>
              <Feather name="alert-triangle" size={13} color={theme.colors.status.warning} />
            </View>
            <View style={styles.corpo}>
              <Text style={styles.cartaoTitulo}>
                {fechamento.sessoesFeitas} de {fechamento.sessoesPrevistas} treinos
              </Text>
              <Text style={styles.detalhe}>
                {fechamento.seriesFeitas} de {fechamento.seriesPrevistas} séries
                {fechamento.seriesQueNaoAconteceram != null
                  ? ` · ${plural(
                      fechamento.seriesQueNaoAconteceram,
                      'série não aconteceu',
                      'séries não aconteceram'
                    )}`
                  : null}
              </Text>
              {fechamento.rotulosSemEncaixe.length > 0 ? (
                <Text style={styles.detalheSaida}>
                  {fechamento.rotulosSemEncaixe.join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.confirmBtn, busy && styles.btnDisabled]}
            onPress={onDecline}
            disabled={busy}
            testID="replan-entendi"
            accessibilityRole="button"
            accessibilityLabel="Entendi"
          >
            <Text style={styles.confirmText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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

const createStyles = (theme: Theme) => StyleSheet.create({
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
