// src/components/opening/AppOpening.tsx
// Abertura animada de cold start — módulos progressivos + wordmark "FORÇA"
// caindo letra a letra, sincronizada com o boot real do app via `isReady`
// (fontes + sessão resolvidas — ver App.tsx). Fonte de verdade da
// coreografia: scratchpad/intro-proto/abertura-v2.html e abertura-hold.html.
// Ver timeline.ts para todos os tempos/easings/escalas nomeados e
// useOpeningTimeline.ts para a decisão de saída (pronto, teto, pulso).
//
// Saída em CORTE SECO (sem fade): o componente inteiro desmonta quando
// `onFinish` dispara — por isso o overlay é um View comum, não Animated.
import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';
import { ProgressiveSymbol } from './ProgressiveSymbol';
import { WordmarkDrop } from './WordmarkDrop';
import { useOpeningTimeline } from './useOpeningTimeline';
import {
  FIRST_LETTER_LAND_MS,
  IMPACT_BUMP_DURATION_MS,
  IMPACT_BUMP_PX,
  IMPACT_MS,
  LAST_LETTER_LAND_MS,
  MARK_BOUNDING_WIDTH_UNITS,
  REFERENCE_SCREEN_WIDTH,
  SCREEN_TREMOR_STEPS_PX,
  SCREEN_TREMOR_STEP_MS,
  SYMBOL_TO_WORDMARK_GAP_UNITS,
  SYMBOL_WIDTH_AT_REFERENCE,
  WORDMARK_FONT_SIZE_AT_REFERENCE,
} from './timeline';

// Bump de impacto (2px, seno, 90ms) + tremor de tela no pouso da 1ª e da
// última letra — soma dos três, aplicada ao lockup inteiro (símbolo +
// wordmark juntos), porta direta de `lockupBump`/`tremorOffset` no
// protótipo.
function impactBump(t: number): number {
  'worklet';
  if (t < IMPACT_MS || t > IMPACT_MS + IMPACT_BUMP_DURATION_MS) return 0;
  const local = (t - IMPACT_MS) / IMPACT_BUMP_DURATION_MS;
  return IMPACT_BUMP_PX * Math.sin(Math.PI * local);
}

function tremorOffset(t: number, landTime: number): number {
  'worklet';
  if (t < landTime) return 0;
  const idx = Math.floor((t - landTime) / SCREEN_TREMOR_STEP_MS);
  if (idx >= SCREEN_TREMOR_STEPS_PX.length) return 0;
  return SCREEN_TREMOR_STEPS_PX[idx];
}

export type AppOpeningProps = {
  /** Fontes carregadas E sessão resolvida — ver App.tsx. */
  isReady: boolean;
  /** Chamado exatamente uma vez: pronto+sustentação, teto de 6s, ou toque com app pronto. */
  onFinish: () => void;
};

export const AppOpening = ({ isReady, onFinish }: AppOpeningProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();

  const { clock, topPulseOpacity, skip } = useOpeningTimeline({
    isReady,
    reduceMotion,
    onFinish,
  });

  // Escala responsiva: símbolo e wordmark encolhem juntos em telas menores
  // que a referência (390px), mantendo a mesma proporção do protótipo.
  const scale = screenWidth / REFERENCE_SCREEN_WIDTH;
  const symbolWidth = SYMBOL_WIDTH_AT_REFERENCE * scale;
  const wordmarkFontSize = WORDMARK_FONT_SIZE_AT_REFERENCE * scale;
  const symbolToWordmarkGap =
    (SYMBOL_TO_WORDMARK_GAP_UNITS / MARK_BOUNDING_WIDTH_UNITS) * symbolWidth;

  const bumpStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          impactBump(clock.value) +
          tremorOffset(clock.value, FIRST_LETTER_LAND_MS) +
          tremorOffset(clock.value, LAST_LETTER_LAND_MS),
      },
    ],
  }));

  const overlayZIndex = theme.zIndex.toast + 1;

  return (
    <View
      style={[
        styles.overlay,
        { backgroundColor: theme.colors.surface.canvas, zIndex: overlayZIndex, elevation: overlayZIndex },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="Pular abertura"
      >
        <View style={styles.center}>
          <Animated.View style={[styles.lockup, bumpStyle]}>
            <ProgressiveSymbol
              clock={clock}
              topPulseOpacity={topPulseOpacity}
              width={symbolWidth}
            />
            <View style={{ marginTop: symbolToWordmarkGap }}>
              <WordmarkDrop
                clock={clock}
                color={theme.colors.text.primary}
                fontFamily={theme.fonts.display}
                fontSize={wordmarkFontSize}
              />
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    alignItems: 'center',
  },
});

export default AppOpening;
