// src/components/ui/Feedback.tsx
// Estados vazios, avisos, chips e blocos de métrica.
//
// Regra que atravessa este arquivo: nenhum número é inventado. Quando não há
// amostra, `Metric` renderiza o travessão "—" e o bloco explica o porquê. Um
// estado vazio bem desenhado é preferível a um placeholder plausível.

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';

/** Valor exibido quando a métrica não tem amostra real. */
export const NO_DATA = '—';

// --- Chip -----------------------------------------------------------------

type ChipProps = {
  label: string;
  /** `accent` reserva o neon para o estado corrente/concluído. */
  tone?: 'neutral' | 'accent' | 'info' | 'danger';
  style?: StyleProp<ViewStyle>;
};

export const Chip = ({ label, tone = 'neutral', style }: ChipProps) => (
  <View style={[styles.chip, styles[`chip_${tone}`], style]}>
    <Text style={[styles.chipLabel, styles[`chipLabel_${tone}`]]}>{label}</Text>
  </View>
);

// --- Métrica --------------------------------------------------------------

type MetricProps = {
  /**
   * Valor já formatado. Passe `null` quando não houver dado real — o
   * componente exibe "—" em vez de qualquer número derivado de amostra vazia.
   */
  value: string | number | null | undefined;
  label: string;
  /** Destaca o valor em neon. Use no máximo uma métrica por bloco. */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const Metric = ({ value, label, accent = false, style }: MetricProps) => {
  const hasValue = value !== null && value !== undefined && value !== '';

  return (
    <View style={[styles.metric, style]}>
      <Text
        style={[styles.metricValue, accent && hasValue && styles.metricValueAccent]}
        accessibilityLabel={hasValue ? `${value} ${label}` : `${label}: sem dados`}
      >
        {hasValue ? String(value) : NO_DATA}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
};

/** Trio de métricas separado por linhas finas. */
export const MetricGroup = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => <View style={[styles.metricGroup, style]}>{children}</View>;

// --- Barra de progresso ---------------------------------------------------

type ProgressTrackProps = {
  /** Fração concluída entre 0 e 1. */
  ratio: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** Progresso concluído é um dos usos aprovados do neon. */
export const ProgressTrack = ({ ratio, accessibilityLabel, style }: ProgressTrackProps) => {
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;

  return (
    <View
      style={[styles.track, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <View style={[styles.trackFill, { width: `${clamped * 100}%` }]} />
    </View>
  );
};

// --- Estado vazio ---------------------------------------------------------

type EmptyStateProps = {
  icon?: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description?: string;
  /** Ação opcional (normalmente um <Button variant="outline" />). */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const EmptyState = ({
  icon = 'inbox',
  title,
  description,
  action,
  style,
  testID,
}: EmptyStateProps) => (
  <View style={[styles.empty, style]} testID={testID}>
    <View style={styles.emptyGlyph}>
      <Feather name={icon} size={22} color={theme.colors.text.quiet} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    {action ? <View style={styles.emptyAction}>{action}</View> : null}
  </View>
);

// --- Aviso ----------------------------------------------------------------

type NoticeProps = {
  /** `danger` para falhas, `info` para estados digitais neutros. */
  tone?: 'info' | 'danger' | 'warning';
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const Notice = ({ tone = 'info', title, description, action, style, testID }: NoticeProps) => (
  <View style={[styles.notice, styles[`notice_${tone}`], style]} testID={testID}>
    <Text style={[styles.noticeTitle, styles[`noticeTitle_${tone}`]]}>{title}</Text>
    {description ? <Text style={styles.noticeDescription}>{description}</Text> : null}
    {action ? <View style={styles.noticeAction}>{action}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.pill,
  },
  chip_neutral: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  chip_accent: { backgroundColor: theme.colors.accent.soft },
  chip_info: { backgroundColor: theme.colors.status.infoSoft },
  chip_danger: { backgroundColor: theme.colors.status.dangerSoft },
  chipLabel: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  chipLabel_neutral: { color: theme.colors.text.secondary },
  chipLabel_accent: { color: theme.colors.text.accent },
  chipLabel_info: { color: theme.colors.status.info },
  chipLabel_danger: { color: theme.colors.status.danger },

  metricGroup: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface.card,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  metricValue: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  metricValueAccent: { color: theme.colors.text.accent },
  metricLabel: {
    marginTop: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },

  track: {
    height: 5,
    overflow: 'hidden',
    borderRadius: theme.borderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  trackFill: {
    height: '100%',
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accent.main,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyGlyph: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.pill,
  },
  emptyTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    textAlign: 'center',
  },
  emptyDescription: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
    textAlign: 'center',
  },
  emptyAction: { marginTop: theme.spacing.xl, alignSelf: 'stretch' },

  notice: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
  },
  notice_info: {
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.status.infoSoft,
  },
  notice_warning: {
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.status.warningSoft,
  },
  notice_danger: {
    borderColor: theme.colors.status.dangerBorder,
    backgroundColor: theme.colors.status.dangerSoft,
  },
  noticeTitle: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  noticeTitle_info: { color: theme.colors.status.info },
  noticeTitle_warning: { color: theme.colors.status.warning },
  noticeTitle_danger: { color: theme.colors.status.danger },
  noticeDescription: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    lineHeight: theme.typography.fontSizes.sm * theme.typography.lineHeights.normal,
  },
  noticeAction: { marginTop: theme.spacing.md },
});
