// src/components/ui/FModules.tsx
// Os três módulos do F como linguagem de progresso (Direção 03). O símbolo da
// marca — três barras que encurtam — vira indicador de avanço: onboarding,
// momentum da semana, construção do plano. Uso parcimonioso: um por contexto.

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

type FModulesProps = {
  /** Quantos módulos acesos (0 a 3). */
  lit: number;
  /** Largura total do símbolo. */
  size?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// Proporções do símbolo: cada módulo é mais curto que o anterior.
const WIDTHS = [1, 0.78, 0.56] as const;

export const FModules = ({
  lit,
  size = 20,
  accessibilityLabel,
  style,
  testID,
}: FModulesProps) => {
  const styles = useThemeStyles(createStyles);
  const litClamped = Math.max(0, Math.min(3, Math.round(lit)));
  const barHeight = Math.max(3, Math.round(size * 0.22));
  const gap = Math.max(2, Math.round(size * 0.12));

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      style={[{ width: size, gap }, style]}
    >
      {WIDTHS.map((w, ix) => (
        <View
          key={ix}
          testID={testID ? `${testID}-mod-${ix}` : undefined}
          style={[
            styles.bar,
            { width: size * w, height: barHeight },
            ix < litClamped ? styles.on : styles.off,
          ]}
        />
      ))}
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: { borderRadius: 2 },
    on: { backgroundColor: theme.colors.accent.main },
    off: { backgroundColor: theme.colors.veil.medium },
  });

export default FModules;
