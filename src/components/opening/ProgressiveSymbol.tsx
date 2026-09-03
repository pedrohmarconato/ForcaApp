// src/components/opening/ProgressiveSymbol.tsx
// Os 3 módulos do símbolo FORÇA como Views (não SVG animado): cada módulo é
// um View com overflow:hidden, fundo grafite e transform skewX (a inclinação
// real dos paths de src/components/ui/Logo.tsx — ver timeline.ts). Dentro,
// um Animated.View branco cuja largura anima de 0 a 100% do módulo — o
// preenchimento acompanha a inclinação porque nasce DENTRO do View já
// inclinado (o skew transforma pai e filho juntos, como um raster rígido),
// sem precisar de nenhuma prop animada de SVG. Funciona igual em web e
// nativo.
//
// `transformOrigin: '0% 0%'` é o que faz a aresta SUPERIOR de cada módulo
// ficar fixa e só a aresta inferior deslizar — exatamente como nos paths
// reais (todos os 3 módulos compartilham o mesmo top-left, só a largura
// muda). Ver MODULE_LEFT_INSET_UNITS em timeline.ts.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';
import {
  BASE_FILL_END_MS,
  BASE_FILL_START_MS,
  FILL_EASE,
  FLASH_DURATION_MS,
  FLASH_OVERLAY_OPACITY,
  IMPACT_MS,
  LAST_LETTER_LAND_MS,
  MID_FILL_END_MS,
  MID_FILL_START_MS,
  MODULE_SKEW_TRANSFORM,
  TOP_FILL_END_MS,
  TOP_FILL_START_MS,
  computeSymbolGeometry,
} from './timeline';

const fillEasingFn = Easing.bezierFn(...FILL_EASE);

function clamp01(x: number): number {
  'worklet';
  return Math.max(0, Math.min(1, x));
}

function fillProgress(t: number, start: number, end: number): number {
  'worklet';
  const raw = clamp01((t - start) / (end - start));
  return fillEasingFn(raw);
}

function topFlashOpacity(t: number): number {
  'worklet';
  const flashImpact = t > IMPACT_MS && t <= IMPACT_MS + FLASH_DURATION_MS;
  const flashLastLetter =
    t > LAST_LETTER_LAND_MS && t <= LAST_LETTER_LAND_MS + FLASH_DURATION_MS;
  return flashImpact || flashLastLetter ? FLASH_OVERLAY_OPACITY : 0;
}

type ProgressiveSymbolProps = {
  clock: SharedValue<number>;
  /** Pulso de espera (1 = aceso, 0.7 = apagado) — só o módulo do topo pulsa. */
  topPulseOpacity: SharedValue<number>;
  /** Largura da caixa delimitadora do símbolo, em px (já responsiva). */
  width: number;
};

export const ProgressiveSymbol = ({
  clock,
  topPulseOpacity,
  width,
}: ProgressiveSymbolProps) => {
  // useTheme() aqui dentro (não uma prop `theme`) por exigência do guarda de
  // cobertura runtime do acento neon (__tests__/themeRuntimeCoverage.test.ts):
  // todo consumidor de theme.colors.accent.main precisa do próprio import de
  // ThemeProvider no arquivo, não herdado via prop de um ancestral.
  const { theme } = useTheme();
  const geometry = computeSymbolGeometry(width);
  const trackColor = theme.palette.grafite;
  const whiteColor = theme.colors.text.primary;
  const accentColor = theme.colors.accent.main;

  const topFillStyle = useAnimatedStyle(() => ({
    width: `${fillProgress(clock.value, TOP_FILL_START_MS, TOP_FILL_END_MS) * 100}%`,
    backgroundColor: clock.value >= IMPACT_MS ? accentColor : whiteColor,
    opacity: topPulseOpacity.value,
  }));

  const topFlashStyle = useAnimatedStyle(() => ({
    opacity: topFlashOpacity(clock.value),
  }));

  const midFillStyle = useAnimatedStyle(() => ({
    width: `${fillProgress(clock.value, MID_FILL_START_MS, MID_FILL_END_MS) * 100}%`,
  }));

  const baseFillStyle = useAnimatedStyle(() => ({
    width: `${fillProgress(clock.value, BASE_FILL_START_MS, BASE_FILL_END_MS) * 100}%`,
  }));

  const moduleBase = {
    height: geometry.moduleHeightPx,
    marginLeft: geometry.leftInsetPx,
    backgroundColor: trackColor,
    overflow: 'hidden' as const,
    transform: [{ skewX: MODULE_SKEW_TRANSFORM }],
    transformOrigin: '0% 0%' as const,
  };

  return (
    <View
      style={{ width: geometry.markWidthPx, height: geometry.markHeightPx }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          moduleBase,
          { width: geometry.topWidthPx, marginBottom: geometry.moduleGapPx },
        ]}
      >
        <Animated.View style={[styles.fill, topFillStyle]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.flashOverlay, topFlashStyle]} />
      </View>
      <View
        style={[
          moduleBase,
          { width: geometry.midWidthPx, marginBottom: geometry.moduleGapPx },
        ]}
      >
        <Animated.View style={[styles.fill, { backgroundColor: whiteColor }, midFillStyle]} />
      </View>
      <View style={[moduleBase, { width: geometry.baseWidthPx, marginBottom: 0 }]}>
        <Animated.View style={[styles.fill, { backgroundColor: whiteColor }, baseFillStyle]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Sem `right`: a largura vem só do `width` animado (0 a 100%), crescendo
  // da esquerda — usar StyleSheet.absoluteFill aqui fixaria right:0 e
  // anularia o `width` animado.
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  flashOverlay: {
    backgroundColor: '#FFFFFF',
  },
});

export default ProgressiveSymbol;
