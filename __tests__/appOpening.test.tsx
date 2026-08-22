// __tests__/appOpening.test.tsx
// Fase 3 (abertura animada): AppOpening é o overlay de cold start — anima a
// marca (ForcaMark) sobre o fundo do app e libera `onFinish` ao fim da
// sequência, no toque, ou de imediato quando o sistema pede reduce-motion.
//
// Mock de react-native-reanimated: nenhum outro teste do projeto importa a
// lib hoje (varredura em __tests__/ e src/ não achou nenhum uso), então não
// existe jestSetup/mock já configurado para reaproveitar. O `mock.js` que a
// própria lib publica reexporta `./src/mock` (TypeScript não compilado) —
// como o preset `react-native` do Jest exclui node_modules de
// `transformIgnorePatterns`, exigir esse mock quebraria com SyntaxError. Em
// vez disso, este arquivo define um mock mínimo inline: shared values viram
// objetos simples com `.value`, `useAnimatedStyle` roda a factory
// diretamente, e `withTiming`/`withRepeat`/`withDelay` só repassam o valor
// final (sem worklet real — não há thread de UI em Jest).
// A conclusão da abertura (onFinish) é decidida por um setTimeout no próprio
// componente, não pelo callback do worklet — de propósito, para não
// depender de reanimated realmente animar em ambiente de teste.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');

  const useSharedValue = (initial: number) => ({ value: initial });
  const useAnimatedStyle = (factory: () => Record<string, unknown>) => factory();

  return {
    __esModule: true,
    default: { View: RN.View },
    useSharedValue,
    useAnimatedStyle,
    useReducedMotion: jest.fn(() => false),
    withTiming: (toValue: unknown) => toValue,
    withRepeat: (value: unknown) => value,
    withDelay: (_delayMs: number, value: unknown) => value,
    Easing: {
      out: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
      cubic: (t: number) => t,
      ease: (t: number) => t,
    },
  };
});

import { AppOpening } from '../src/components/AppOpening';
import { ForcaMark } from '../src/components/ui/Logo';
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
  it('renderiza a marca e chama onFinish após a duração da animação', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening onFinish={onFinish} />);

    expect(utils.UNSAFE_getByType(ForcaMark)).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('toque em qualquer ponto pula a animação e chama onFinish imediatamente', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening onFinish={onFinish} />);

    fireEvent.press(utils.getByLabelText('Pular abertura'));

    expect(onFinish).toHaveBeenCalledTimes(1);

    // O guard interno não pode disparar onFinish de novo quando o timer da
    // animação (já cancelado) chegaria ao fim.
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('com reduce-motion ativo, onFinish é chamado imediatamente sem esperar a duração', () => {
    jest.useFakeTimers();
    mockedUseReducedMotion.mockReturnValue(true);
    const onFinish = jest.fn();
    render(<AppOpening onFinish={onFinish} />);

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
