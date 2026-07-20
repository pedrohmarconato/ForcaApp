// src/components/ui/Button.tsx
// Botão padrão do sistema. Mesma geometria e escala de todos os controles.
//
// Variantes:
//  - primary  → ação principal da tela. É o único uso de preenchimento neon,
//               por isso deve haver no máximo um por bloco (princípio 1).
//  - outline  → ação alternativa de mesmo peso semântico.
//  - ghost    → ação terciária, sem superfície.
//  - danger   → ação destrutiva (encerrar sessão, descartar).

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Ícone Feather exibido à direita do rótulo. */
  icon?: React.ComponentProps<typeof Feather>['name'];
  loading?: boolean;
  disabled?: boolean;
  /** Altura reduzida, para botões dentro de cards. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const CONTENT_COLOR: Record<ButtonVariant, string> = {
  primary: theme.colors.accent.on,
  outline: theme.colors.text.primary,
  ghost: theme.colors.text.secondary,
  danger: theme.colors.status.danger,
};

const Button = ({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  compact = false,
  style,
  testID,
}: ButtonProps) => {
  const isInactive = disabled || loading;
  const contentColor = CONTENT_COLOR[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        styles[variant],
        // O feedback de toque é uma queda de opacidade — sem brilho nem sombra.
        pressed && !isInactive && styles.pressed,
        isInactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.label, { color: contentColor }]}>{label}</Text>
          {icon ? <Feather name={icon} size={16} color={contentColor} /> : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  regular: { minHeight: theme.hitTarget.regular },
  compact: { minHeight: theme.hitTarget.compact },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: 0.2,
  },
  primary: { backgroundColor: theme.colors.accent.main },
  outline: {
    backgroundColor: theme.colors.transparent,
    borderColor: theme.colors.border.strong,
  },
  ghost: { backgroundColor: theme.colors.transparent },
  danger: {
    backgroundColor: theme.colors.status.dangerSoft,
    borderColor: theme.colors.status.dangerBorder,
  },
  pressed: { opacity: 0.72 },
  inactive: { opacity: 0.45 },
});

export default Button;
