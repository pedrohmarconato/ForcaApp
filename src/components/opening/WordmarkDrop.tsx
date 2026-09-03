// src/components/opening/WordmarkDrop.tsx
// Wordmark "FORÇA" — 5 Animated.Text (um por letra, cedilha incluída), cada
// um com shared values próprios: cai de translateY(-34) e scale(1.14) em
// 110ms (cubic-bezier 0.7,0,1,1), esmaga ao pousar (scaleX 1.08, scaleY
// 0.86, origem no pé da letra) e recupera com leve overshoot. Matemática
// portada de `applyLetter`/`landingScaleX`/`landingScaleY` em
// scratchpad/intro-proto/abertura-v2.html — fonte de verdade da coreografia.
//
// `display:inline-block` não existe em RN: cada letra é um nó de texto
// separado dentro de uma linha (flexDirection:'row'), e como `transform`
// nunca afeta o fluxo de layout (só o paint), a letra ao lado nunca é
// empurrada pela animação da anterior — mesma garantia que o protótipo web
// tinha com inline-block.
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import {
  FALL_EASE,
  LAND_EASE,
  LETTERS,
  LETTER_FALL_DURATION_MS,
  LETTER_FALL_START_SCALE,
  LETTER_FALL_START_Y,
  LETTER_LAND_CRUSH_HOLD_MS,
  LETTER_LAND_CRUSH_SCALE_X,
  LETTER_LAND_CRUSH_SCALE_Y,
  LETTER_LAND_OVERSHOOT_AT_MS,
  LETTER_LAND_OVERSHOOT_SCALE_Y,
  LETTER_LAND_RECOVER_AT_MS,
  LETTER_START_TIMES_MS,
  WORDMARK_LETTER_SPACING_EM,
} from './timeline';

// RN tipa `transform` como um array de objetos de UMA chave cada
// (`MaximumOneOf<...>`) — três objetos de uma chave só, não um objeto
// combinado, é a forma correta para {translateY, scaleX, scaleY} juntos.
type Transform = NonNullable<ViewStyle['transform']>;

const fallEasingFn = Easing.bezierFn(...FALL_EASE);
const landEasingFn = Easing.bezierFn(...LAND_EASE);

function clamp01(x: number): number {
  'worklet';
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, p: number): number {
  'worklet';
  return a + (b - a) * p;
}

/** Esmagamento vertical no pouso, com leve overshoot na recuperação. */
function landingScaleY(localMs: number): number {
  'worklet';
  if (localMs <= 0) return 1.0;
  if (localMs <= LETTER_LAND_CRUSH_HOLD_MS) return LETTER_LAND_CRUSH_SCALE_Y;
  if (localMs <= LETTER_LAND_OVERSHOOT_AT_MS) {
    const p = landEasingFn(
      (localMs - LETTER_LAND_CRUSH_HOLD_MS) /
        (LETTER_LAND_OVERSHOOT_AT_MS - LETTER_LAND_CRUSH_HOLD_MS),
    );
    return lerp(LETTER_LAND_CRUSH_SCALE_Y, LETTER_LAND_OVERSHOOT_SCALE_Y, p);
  }
  if (localMs <= LETTER_LAND_RECOVER_AT_MS) {
    const p = landEasingFn(
      (localMs - LETTER_LAND_OVERSHOOT_AT_MS) /
        (LETTER_LAND_RECOVER_AT_MS - LETTER_LAND_OVERSHOOT_AT_MS),
    );
    return lerp(LETTER_LAND_OVERSHOOT_SCALE_Y, 1.0, p);
  }
  return 1.0;
}

/** Esmagamento horizontal no pouso — sem overshoot documentado em X. */
function landingScaleX(localMs: number): number {
  'worklet';
  if (localMs <= 0) return 1.0;
  if (localMs <= LETTER_LAND_CRUSH_HOLD_MS) return LETTER_LAND_CRUSH_SCALE_X;
  if (localMs <= LETTER_LAND_RECOVER_AT_MS) {
    const p = landEasingFn(
      (localMs - LETTER_LAND_CRUSH_HOLD_MS) /
        (LETTER_LAND_RECOVER_AT_MS - LETTER_LAND_CRUSH_HOLD_MS),
    );
    return lerp(LETTER_LAND_CRUSH_SCALE_X, 1.0, p);
  }
  return 1.0;
}

type WordmarkDropProps = {
  clock: SharedValue<number>;
  color: string;
  fontFamily: string;
  fontSize: number;
};

type LetterProps = {
  letter: string;
  startMs: number;
  clock: SharedValue<number>;
  color: string;
  fontFamily: string;
  fontSize: number;
};

const Letter = ({ letter, startMs, clock, color, fontFamily, fontSize }: LetterProps) => {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    if (t < startMs) {
      // Corte seco: nada antes do próprio instante de início da letra.
      const transform: Transform = [
        { translateY: LETTER_FALL_START_Y },
        { scaleX: LETTER_FALL_START_SCALE },
        { scaleY: LETTER_FALL_START_SCALE },
      ];
      return { opacity: 0, transform };
    }
    const land = startMs + LETTER_FALL_DURATION_MS;
    if (t < land) {
      const p = clamp01((t - startMs) / LETTER_FALL_DURATION_MS);
      const e = fallEasingFn(p);
      const y = lerp(LETTER_FALL_START_Y, 0, e);
      const s = lerp(LETTER_FALL_START_SCALE, 1, e);
      const transform: Transform = [
        { translateY: y },
        { scaleX: s },
        { scaleY: s },
      ];
      return { opacity: 1, transform };
    }
    const localMs = t - land;
    const transform: Transform = [
      { translateY: 0 },
      { scaleX: landingScaleX(localMs) },
      { scaleY: landingScaleY(localMs) },
    ];
    return { opacity: 1, transform };
  });

  return (
    <Animated.Text
      style={[
        {
          fontFamily,
          fontSize,
          color,
          letterSpacing: fontSize * WORDMARK_LETTER_SPACING_EM,
          transformOrigin: '50% 100%', // pé da letra — ver comentário de cabeçalho
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {letter}
    </Animated.Text>
  );
};

export const WordmarkDrop = ({ clock, color, fontFamily, fontSize }: WordmarkDropProps) => (
  <View style={{ flexDirection: 'row' }}>
    {LETTERS.map((letter, index) => (
      <Letter
        key={`${letter}-${index}`}
        letter={letter}
        startMs={LETTER_START_TIMES_MS[index]}
        clock={clock}
        color={color}
        fontFamily={fontFamily}
        fontSize={fontSize}
      />
    ))}
  </View>
);

export default WordmarkDrop;
