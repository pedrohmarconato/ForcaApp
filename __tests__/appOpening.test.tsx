// __tests__/appOpening.test.tsx
// Abertura de cold start — nova arquitetura (src/components/opening/):
// módulos progressivos (View + skewX + overflow:hidden, sem SVG animado),
// wordmark "FORÇA" letra a letra ("peso caindo") e sincronismo com o boot
// via prop `isReady` (fontes + sessão resolvidas). Fonte de verdade da
// coreografia: scratchpad/intro-proto/abertura-v2.html e abertura-hold.html
// (ver src/components/opening/timeline.ts).
//
// `onFinish` decide a saída por um estado JS (setTimeout), nunca por
// callback de worklet — mesma convenção documentada no AppOpening.tsx
// anterior, mantida aqui porque é o que torna o desfecho determinístico e
// testável com fake timers, independente de o Reanimated animar de verdade.
//
// Mock de react-native-reanimated: nenhum outro teste do projeto importa a
// lib (mesma constatação do arquivo anterior), e o `mock.js` publicado pela
// própria lib reexporta TypeScript não compilado que quebra sob
// transformIgnorePatterns do preset `react-native`. Mock mínimo inline:
// shared values viram objetos `{ value }`, `useAnimatedStyle` roda a
// factory direto, `withTiming`/`withDelay`/`withSequence` repassam o valor
// final (sem worklet real), `withRepeat` devolve a animação interna,
// `cancelAnimation` e `runOnJS` são no-ops/pass-through — nenhum deles
// precisa simular o thread de UI porque nenhuma asserção deste arquivo lê
// valor de shared value no meio da animação.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Rigid: 'rigid',
    Soft: 'soft',
  },
}));

import theme from '../src/theme/theme';
import type { ThemeContextValue } from '../src/theme/ThemeProvider';

let mockThemeContext: ThemeContextValue = {
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
import { LETTERS, READY_EXIT_MS, ABSOLUTE_CEILING_MS } from '../src/components/opening/timeline';
import { useReducedMotion } from 'react-native-reanimated';

const mockedUseReducedMotion = useReducedMotion as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseReducedMotion.mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AppOpening', () => {
  it('não chama onFinish antes de isReady, mesmo depois de 1700ms', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    render(<AppOpening isReady={false} onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(READY_EXIT_MS + 500);
    });

    expect(onFinish).not.toHaveBeenCalled();
  });

  it('com isReady desde o início, chama onFinish em >= 1700ms e não antes', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    render(<AppOpening isReady onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(READY_EXIT_MS - 1);
    });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('isReady chega tarde (3000ms) — onFinish dispara logo em seguida, não em 1700ms', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening isReady={false} onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onFinish).not.toHaveBeenCalled();

    utils.rerender(<AppOpening isReady onFinish={onFinish} />);

    // "Logo após": não precisa esperar até um novo marco de 1700ms — uma
    // margem pequena já basta, bem menor que o resto até 6000ms.
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('teto absoluto: sem isReady, chama onFinish em 6000ms', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    render(<AppOpening isReady={false} onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(ABSOLUTE_CEILING_MS - 1);
    });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('reduce-motion + isReady — onFinish imediato, sem esperar a duração', () => {
    jest.useFakeTimers();
    mockedUseReducedMotion.mockReturnValue(true);
    const onFinish = jest.fn();
    render(<AppOpening isReady onFinish={onFinish} />);

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('toque chama skip: se pronto, finaliza imediatamente', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening isReady onFinish={onFinish} />);

    fireEvent.press(utils.getByLabelText('Pular abertura'));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('toque com skip antes de pronto não finaliza (app ainda não pode ser mostrado)', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening isReady={false} onFinish={onFinish} />);

    fireEvent.press(utils.getByLabelText('Pular abertura'));

    expect(onFinish).not.toHaveBeenCalled();
  });

  it('renderiza as 5 letras de "FORÇA", incluindo a cedilha', () => {
    jest.useFakeTimers();
    const utils = render(<AppOpening isReady={false} onFinish={jest.fn()} />);

    LETTERS.forEach((letter) => {
      expect(utils.getByText(letter)).toBeTruthy();
    });
    expect(utils.getByText('Ç')).toBeTruthy();
  });
});
