// src/components/session/AdaptationSheet.tsx
// Fase 5 — bottom sheet pós-série. Mostra a recomendação de ajuste (a recomendada
// destacada) e o aluno ESCOLHE; nada é aplicado sem esse toque. Fechar pelo fundo =
// recusar (o chamador registra "manter" em set_logs.adaptation).
//
// Nota de implementação: usa o Modal nativo do RN em vez de @gorhom/bottom-sheet para
// não adicionar dependência nativa agora e manter o componente testável em jest.
// Trocar por um sheet com gesto/arrasto depois é um refino, não muda o contrato.

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import theme from '../../theme/theme';
import type {
  Recommendation,
  Adjustment,
} from '../../engine/intraSessionAdaptation';

type Props = {
  /** null = escondido. Preenchido quando há uma série fora do alvo aguardando decisão. */
  recommendation: Recommendation | null;
  exerciseName: string;
  onChoose: (adjustment: Adjustment) => void;
  onDismiss: () => void;
};

const titleFor = (r: Recommendation): string => {
  if (r.outcome === 'under') return 'Você ficou abaixo do alvo';
  if (r.outcome === 'over') return 'Você passou do alvo';
  return 'Ajuste da próxima série';
};

const AdaptationSheet = ({
  recommendation,
  exerciseName,
  onChoose,
  onDismiss,
}: Props) => {
  return (
    <Modal
      visible={recommendation != null}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        testID="adaptation-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Fechar e manter a carga"
      >
        {/* Absorve o toque no card para não fechar o sheet ao interagir com ele. */}
        <Pressable
          style={styles.card}
          onPress={() => undefined}
          accessibilityViewIsModal
          accessibilityLabel="Sugestão de ajuste da série"
        >
          {recommendation ? (
            <>
              <View style={styles.handle} />
              <Text style={styles.kicker}>{exerciseName}</Text>
              <Text style={styles.title} accessibilityRole="header">
                {titleFor(recommendation)}
              </Text>
              <Text style={styles.reason}>
                {recommendation.recommended.reason}
              </Text>
              {recommendation.options.map((opt, i) => {
                const isRecommended = i === 0;
                return (
                  <TouchableOpacity
                    key={`${opt.kind}-${i}`}
                    style={[
                      styles.option,
                      isRecommended && styles.optionRecommended,
                    ]}
                    onPress={() => onChoose(opt)}
                    testID={`adaptation-option-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isRecommended ? `${opt.label} (recomendado)` : opt.label
                    }
                    accessibilityHint={opt.reason}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        isRecommended && styles.optionLabelRecommended,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isRecommended ? (
                      <Text style={styles.badge}>Recomendado</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  card: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    backgroundColor: theme.colors.surface.card,
    ...theme.elevation.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.border.strong,
  },
  kicker: {
    marginBottom: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  reason: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.hitTarget.regular,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
  },
  optionRecommended: {
    borderColor: theme.colors.accent.border,
    backgroundColor: theme.colors.accent.soft,
  },
  optionLabel: {
    flexShrink: 1,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
  },
  optionLabelRecommended: {
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  badge: {
    marginLeft: theme.spacing.md,
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.bold,
    letterSpacing: theme.typography.letterSpacing.wide,
  },
});

export default AdaptationSheet;
