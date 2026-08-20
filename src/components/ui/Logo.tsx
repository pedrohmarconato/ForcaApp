// src/components/ui/Logo.tsx
// Símbolo e lockup da marca FORÇA.
//
// Geometria idêntica à da prancha oficial (`branding/pranchas/
// forca-performance-final.html`): três módulos progressivos num viewBox 96×96,
// comprimentos 7u / 5,4u / 3,6u e terminais a 12°.
//
// Regras do brandbook respeitadas aqui:
//  - sem sombra, brilho, degradê, contorno ou efeito tridimensional;
//  - proporções e inclinações dos módulos nunca mudam;
//  - o wordmark é sempre "FORÇA", com cedilha.

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

// Caminhos dos três módulos, extraídos da prancha sem alteração.
const MODULE_TOP = 'M14 14H84L76 34H6Z';
const MODULE_MID = 'M14 39H68L60 59H6Z';
const MODULE_BASE = 'M14 64H50L42 84H6Z';

type ForcaMarkProps = {
  /** Lado do símbolo em px. Mínimo recomendado pelo brandbook: 16. */
  size?: number;
  /** Cor dos três módulos. */
  color?: string;
  /**
   * Destaca o módulo superior em neon — a "assinatura de progresso" da marca.
   * Usada na tela de autenticação; fora dela o símbolo é monocromático.
   */
  accentTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Símbolo isolado — também é a base do ícone do aplicativo. */
export const ForcaMark = ({
  size = 48,
  color,
  accentTop = false,
  style,
}: ForcaMarkProps) => {
  const { theme } = useTheme();
  const resolvedColor = color ?? theme.colors.text.primary;

  return (
    <View
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 96 96">
        <Path
          d={MODULE_TOP}
          fill={accentTop ? theme.colors.accent.main : resolvedColor}
        />
        <Path d={MODULE_MID} fill={resolvedColor} />
        <Path d={MODULE_BASE} fill={resolvedColor} />
      </Svg>
    </View>
  );
};

type ForcaLockupProps = {
  /** Corpo do wordmark em px. O símbolo acompanha proporcionalmente. */
  size?: number;
  /** Assinatura complementar "APP" ao lado do wordmark. */
  withApp?: boolean;
  accentTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Assinatura horizontal: símbolo + wordmark.
 * Mínimo recomendado no digital: 96 px de largura.
 */
export const ForcaLockup = ({
  size,
  withApp = true,
  accentTop = true,
  style,
}: ForcaLockupProps) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const resolvedSize = size ?? theme.typography.fontSizes.hero;

  return (
    <View
      style={[styles.lockup, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={withApp ? 'FORÇA App' : 'FORÇA'}
    >
      <ForcaMark size={resolvedSize * 1.35} accentTop={accentTop} />
      <View style={styles.wordmarkRow}>
        <Text style={[styles.wordmark, { fontSize: resolvedSize }]}>FORÇA</Text>
        {withApp ? <Text style={styles.app}>APP</Text> : null}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    lockup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    wordmarkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    wordmark: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.display,
      // Postura vertical, caixa alta e espaçamento ótico (brandbook).
      letterSpacing: 0.3,
      includeFontPadding: false,
    },
    app: {
      marginLeft: theme.spacing.xxs,
      marginTop: 2,
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.micro,
      fontWeight: theme.typography.fontWeights.bold,
      letterSpacing: theme.typography.letterSpacing.wider,
    },
  });

export default ForcaMark;
