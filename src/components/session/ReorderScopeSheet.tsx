// src/components/session/ReorderScopeSheet.tsx
// Bottom sheet do escopo da reordenação de treinos: o usuário escolhe se a
// nova ordem vale só para a semana editada ou também para as próximas semanas
// pendentes do plano. Fechar pelo fundo = voltar à edição sem salvar.
//
// Mesmo molde do AdaptationSheet: Modal nativo do RN, sem dependência nativa,
// testável em jest.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import theme from '../../theme/theme';
import type { EscopoReordenacao } from '../../services/planEditRepository';

type Props = {
  visible: boolean;
  onChoose: (escopo: EscopoReordenacao) => void;
  onDismiss: () => void;
};

const OPCOES: { escopo: EscopoReordenacao; label: string; hint: string }[] = [
  {
    escopo: 'semana',
    label: 'Só nesta semana',
    hint: 'As outras semanas do plano ficam como estão.',
  },
  {
    escopo: 'futuras',
    label: 'Nesta e nas próximas semanas',
    hint: 'Semanas futuras ainda pendentes seguem a nova ordem.',
  },
];

const ReorderScopeSheet = ({ visible, onChoose, onDismiss }: Props) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
    <Pressable
      style={styles.backdrop}
      onPress={onDismiss}
      testID="reorder-scope-backdrop"
      accessibilityRole="button"
      accessibilityLabel="Fechar e voltar à edição"
    >
      {/* Absorve o toque no card para não fechar o sheet ao interagir com ele. */}
      <Pressable
        style={styles.card}
        onPress={() => undefined}
        accessibilityViewIsModal
        accessibilityLabel="Escopo da nova ordem dos treinos"
      >
        <View style={styles.handle} />
        <Text style={styles.kicker}>Reordenar treinos</Text>
        <Text style={styles.title} accessibilityRole="header">
          Aplicar a nova ordem
        </Text>
        <Text style={styles.description}>
          Onde essa ordem deve valer? Semanas com treino já feito ou estrutura
          diferente ficam como estão.
        </Text>
        {OPCOES.map((opt) => (
          <TouchableOpacity
            key={opt.escopo}
            style={styles.option}
            onPress={() => onChoose(opt.escopo)}
            testID={`reorder-scope-${opt.escopo}`}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityHint={opt.hint}
          >
            <View style={styles.optionCopy}>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Text style={styles.optionHint}>{opt.hint}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </Pressable>
    </Pressable>
  </Modal>
);

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
  description: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
  },
  option: {
    minHeight: theme.hitTarget.regular,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
  },
  optionCopy: { gap: 2 },
  optionLabel: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  optionHint: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
});

export default ReorderScopeSheet;
