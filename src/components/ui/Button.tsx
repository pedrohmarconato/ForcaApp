// src/components/ui/Button.tsx
// Botão padrão do sistema. Mesma geometria e escala de todos os controles.
//
// Variantes:
//  - primary  → ação principal da tela. É o único uso de preenchimento neon,
//               por isso deve haver no máximo um por bloco (princípio 1).
//  - tonal    → ação secundária com corpo: degrau tonal elevado, sem neon.
//  - outline  → ação alternativa de mesmo peso semântico.
//  - ghost    → ação terciária, sem superfície.
//  - danger   → ação destrutiva (encerrar sessão, descartar).
//
// Direção 03: todo botão responde ao toque com a física de press (scale 0.97 +
// opacidade, 120ms impulso) e as ações com corpo (primary/tonal) dão o toque
// tátil leve. O feedback deixou de ser só queda de opacidade.

import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { usePressPhysics } from './pressPhysics';

export type ButtonVariant =
  'primary' | 'tonal' | 'outline' | 'ghost' | 'danger';

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

const contentColors = (theme: Theme): Record<ButtonVariant, string> => ({
  primary: theme.colors.accent.on,
  tonal: theme.colors.text.primary,
  outline: theme.colors.text.primary,
  ghost: theme.colors.text.secondary,
  danger: theme.colors.status.danger,
});

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const isInactive = disabled || loading;
  const contentColor = contentColors(theme)[variant];
  const { animatedStyle, onPressIn, onPressOut } = usePressPhysics({
    haptic: variant === 'primary' || variant === 'tonal',
    disabled: isInactive,
  });

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={[
        styles.base,
        compact ? styles.compact : styles.regular,
        styles[variant],
        isInactive && styles.inactive,
        animatedStyle,
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
    </AnimatedPressable>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
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
    tonal: {
      backgroundColor: theme.colors.surface.elevated,
      borderColor: theme.colors.border.subtle,
    },
    outline: {
      backgroundColor: theme.colors.transparent,
      borderColor: theme.colors.border.strong,
    },
    ghost: { backgroundColor: theme.colors.transparent },
    danger: {
      backgroundColor: theme.colors.status.dangerSoft,
      borderColor: theme.colors.status.dangerBorder,
    },
    inactive: { opacity: 0.45 },
  });

export default Button;
