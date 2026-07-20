// src/components/ui/Controls.tsx
// Controles de seleção do questionário e cabeçalho de telas empilhadas.
//
// O estado "selecionado" nunca preenche o controle de neon: usa fundo tênue,
// borda acentuada e uma barra lateral. O acento marca, não domina.

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';

// --- Opção de lista -------------------------------------------------------

type OptionButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Centraliza o rótulo — usado nos pares Sim/Não. */
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const OptionButton = ({
  label,
  selected,
  onPress,
  centered = false,
  style,
  testID,
}: OptionButtonProps) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected, checked: selected }}
    accessibilityLabel={label}
    style={({ pressed }) => [
      styles.option,
      selected && styles.optionSelected,
      pressed && styles.pressed,
      style,
    ]}
  >
    {/* Barra lateral: sinaliza a seleção sem preencher a superfície. */}
    {selected ? <View style={styles.optionMarker} /> : null}
    <Text
      style={[
        styles.optionLabel,
        selected && styles.optionLabelSelected,
        centered && styles.optionLabelCentered,
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

// --- Dia da semana --------------------------------------------------------

type DayToggleProps = {
  /** Letra exibida (S, T, Q...). */
  label: string;
  /** Nome completo do dia, para leitores de tela. */
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

export const DayToggle = ({
  label,
  accessibilityLabel,
  selected,
  onPress,
  testID,
}: DayToggleProps) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: selected }}
    accessibilityLabel={accessibilityLabel}
    style={({ pressed }) => [styles.day, selected && styles.daySelected, pressed && styles.pressed]}
  >
    <Text style={[styles.dayLabel, selected && styles.dayLabelSelected]}>{label}</Text>
  </Pressable>
);

// --- Caixa de marcação ----------------------------------------------------

type CheckboxRowProps = {
  label: string;
  checked: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export const CheckboxRow = ({ label, checked, onPress, style }: CheckboxRowProps) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={label}
    hitSlop={6}
    style={[styles.checkboxRow, style]}
  >
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? <Feather name="check" size={11} color={theme.colors.accent.on} /> : null}
    </View>
    <Text style={styles.checkboxLabel}>{label}</Text>
  </Pressable>
);

// --- Cabeçalho de tela empilhada -----------------------------------------

type StackHeaderProps = {
  title: string;
  onBack?: () => void;
  /** Ação textual à direita. */
  actionLabel?: string;
  onActionPress?: () => void;
};

/**
 * Cabeçalho das telas abertas por empilhamento. A faixa neon curta na base é a
 * assinatura da marca no chrome — discreta e constante.
 */
export const StackHeader = ({ title, onBack, actionLabel, onActionPress }: StackHeaderProps) => (
  <View style={styles.stackHeader}>
    {onBack ? (
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        hitSlop={10}
        style={styles.backButton}
      >
        <Feather name="chevron-left" size={22} color={theme.colors.text.secondary} />
      </Pressable>
    ) : null}

    <Text style={styles.stackTitle} numberOfLines={1} accessibilityRole="header">
      {title}
    </Text>

    {actionLabel ? (
      <Pressable onPress={onActionPress} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.stackAction}>{actionLabel}</Text>
      </Pressable>
    ) : null}

    <View style={styles.stackHeaderAccent} />
  </View>
);

const styles = StyleSheet.create({
  option: {
    justifyContent: 'center',
    minHeight: theme.hitTarget.compact,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
    overflow: 'hidden',
  },
  optionSelected: {
    borderColor: theme.colors.accent.border,
    backgroundColor: theme.colors.accent.soft,
  },
  optionMarker: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: theme.colors.accent.main,
  },
  optionLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  optionLabelSelected: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  optionLabelCentered: { textAlign: 'center' },

  day: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface.card,
  },
  daySelected: {
    borderColor: theme.colors.accent.border,
    backgroundColor: theme.colors.accent.soft,
  },
  dayLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  dayLabelSelected: { color: theme.colors.text.accent },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.strong,
    borderRadius: 5,
    backgroundColor: theme.colors.surface.card,
  },
  checkboxChecked: {
    borderColor: theme.colors.accent.main,
    backgroundColor: theme.colors.accent.main,
  },
  checkboxLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.canvas,
  },
  backButton: { marginLeft: -theme.spacing.sm },
  stackTitle: {
    flex: 1,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  stackAction: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  stackHeaderAccent: {
    position: 'absolute',
    left: 0,
    bottom: -1,
    width: '34%',
    height: 1,
    backgroundColor: theme.colors.accent.main,
  },

  pressed: { opacity: 0.72 },
});
