// __tests__/appOpeningScale.test.tsx
// Achado BAIXO do review adversarial do PR #81: AppOpening.tsx escalava
// símbolo/wordmark por `screenWidth / REFERENCE_SCREEN_WIDTH` sem teto — num
// tablet (768px) o símbolo ia a 331px e o wordmark a ~197px de fonte, bem
// fora da proporção do protótipo. Fix: computeOpeningScale (timeline.ts)
// trava em MAX_OPENING_SCALE (1.25).
//
// Arquivo separado do appOpening.test.tsx principal porque mocka
// `useWindowDimensions` via jest.spyOn (não jest.mock('react-native', ...)
// inteiro — isso reavalia a árvore nativa fora da ordem que o preset
// jest-expo espera e quebra em TurboModuleRegistry/DevMenu).
import React from 'react';
import * as ReactNative from 'react-native';
import { render } from '@testing-library/react-native';

jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
  width: 768,
  height: 1024,
  scale: 2,
  fontScale: 1,
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const useSharedValue = (initial: number) => ({ value: initial });
  const useAnimatedStyle = (factory: () => Record<string, unknown>) => factory();
  const bezierFn = () => (t: number) => t;

  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    useSharedValue,
    useAnimatedStyle,
    useReducedMotion: jest.fn(() => false),
    withTiming: (toValue: unknown) => toValue,
    withDelay: (_delayMs: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (animation: unknown) => animation,
    cancelAnimation: jest.fn(),
    runOnJS:
      (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args),
    Easing: {
      linear: (t: number) => t,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
      back: (_factor: number) => (t: number) => t,
      cubic: (t: number) => t,
      ease: (t: number) => t,
      bezier: (..._args: number[]) => ({ factory: () => (t: number) => t }),
      bezierFn,
    },
  };
});

jest.mock('expo-haptics', () => ({
  __esModule: true,
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
}));

import theme from '../src/theme/theme';
import type { ThemeContextValue } from '../src/theme/ThemeProvider';

const mockThemeContext: ThemeContextValue = {
  theme,
  neonColor: 'yellow',
  confirmedNeonColor: 'yellow',
  status: 'idle',
  message: null,
  selectNeonColor: jest.fn(async () => undefined),
  retryNeonColor: jest.fn(async () => undefined),
};

jest.mock('../src/theme/ThemeProvider', () => ({
  useTheme: () => mockThemeContext,
}));

import { AppOpening } from '../src/components/AppOpening';
import { ProgressiveSymbol } from '../src/components/opening/ProgressiveSymbol';
import {
  MAX_OPENING_SCALE,
  SYMBOL_WIDTH_AT_REFERENCE,
  computeOpeningScale,
} from '../src/components/opening/timeline';

afterEach(() => {
  jest.useRealTimers();
});

describe('computeOpeningScale (pura)', () => {
  it('cresce linearmente até o teto', () => {
    expect(computeOpeningScale(390)).toBe(1);
    expect(computeOpeningScale(195)).toBeCloseTo(0.5);
  });

  it('trava em MAX_OPENING_SCALE acima da referência de tablet', () => {
    expect(computeOpeningScale(768)).toBe(MAX_OPENING_SCALE);
    expect(MAX_OPENING_SCALE).toBeLessThan(768 / 390);
  });
});

describe('AppOpening — teto de escala em tela larga (achado do review, PR #81)', () => {
  it('com useWindowDimensions em 768px, a largura do símbolo fica <= 168 * MAX_OPENING_SCALE', () => {
    jest.useFakeTimers();
    const utils = render(<AppOpening isReady={false} onFinish={jest.fn()} />);

    const symbol = utils.UNSAFE_getByType(ProgressiveSymbol);
    expect(symbol.props.width).toBeLessThanOrEqual(SYMBOL_WIDTH_AT_REFERENCE * MAX_OPENING_SCALE);
    // Prova que o teto realmente entrou em ação (não é só uma folga
    // coincidente): sem o teto, 768/390 * 168 ≈ 330.6 — bem acima do limite.
    expect(symbol.props.width).toBeLessThan((768 / 390) * SYMBOL_WIDTH_AT_REFERENCE);
  });
});
