// __tests__/appOpening.test.tsx
// Fase 3+ (abertura animada "assinatura de marca"): AppOpening é o overlay de
// cold start — monta os 3 módulos do símbolo em cascata, acende o módulo do
// topo em neon com um bloom radial atrás, revela o wordmark "FORÇA" e libera
// `onFinish` ao fim da sequência (1800ms), no toque, ou de imediato quando o
// sistema pede reduce-motion.
//
// Mock de react-native-reanimated: nenhum outro teste do projeto importa a
// lib hoje (varredura em __tests__/ e src/ não achou nenhum uso), então não
// existe jestSetup/mock já configurado para reaproveitar. O `mock.js` que a
// própria lib publica reexporta `./src/mock` (TypeScript não compilado) —
// como o preset `react-native` do Jest exclui node_modules de
// `transformIgnorePatterns`, exigir esse mock quebraria com SyntaxError. Em
// vez disso, este arquivo define um mock mínimo inline: shared values viram
// objetos simples com `.value`, `useAnimatedStyle` roda a factory
// diretamente, e `withTiming`/`withDelay`/`withSequence` só repassam o valor
// final (sem worklet real — não há thread de UI em Jest). `Animated.Text`
// entrou no mock junto com `Animated.View` porque o wordmark agora anima via
// `Animated.Text`.
// A conclusão da abertura (onFinish) e o háptico de ignição são decididos por
// setTimeout no próprio componente, não por callback de worklet — de
// propósito, para não depender de reanimated realmente animar em ambiente de
// teste. `expo-haptics` não tem mock global no projeto, por isso é mockado
// aqui.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Path } from 'react-native-svg';

import theme, { createTheme } from '../src/theme/theme';
import type { ThemeContextValue } from '../src/theme/ThemeProvider';

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');

  const useSharedValue = (initial: number) => ({ value: initial });
  const useAnimatedStyle = (factory: () => Record<string, unknown>) => factory();

  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text },
    useSharedValue,
    useAnimatedStyle,
    useReducedMotion: jest.fn(() => false),
    withTiming: (toValue: unknown) => toValue,
    withDelay: (_delayMs: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    Easing: {
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
      back: (_factor: number) => (t: number) => t,
      cubic: (t: number) => t,
      ease: (t: number) => t,
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

// Mock de useTheme() — necessário para o teste de ignição neon (abaixo)
// poder trocar o tema por um NÃO-default (blue). Sem isso, um fill
// hardcoded na cor do tema default (yellow, '#EBFF00') passaria no teste
// mesmo estando errado. Mesma convenção de __tests__/settingsScreen.test.tsx.
const mockSelectNeonColor = jest.fn(async () => undefined);
const mockRetryNeonColor = jest.fn(async () => undefined);

let mockThemeContext: ThemeContextValue = {
  theme,
  neonColor: 'yellow',
  confirmedNeonColor: 'yellow',
  status: 'idle',
  message: null,
  selectNeonColor: mockSelectNeonColor,
  retryNeonColor: mockRetryNeonColor,
};

jest.mock('../src/theme/ThemeProvider', () => ({
  useTheme: () => mockThemeContext,
}));

import { AppOpening, TOTAL_DURATION_MS } from '../src/components/AppOpening';
import { FORCA_MARK_MODULE_PATHS } from '../src/components/ui/Logo';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const mockedUseReducedMotion = useReducedMotion as jest.Mock;
const mockedImpactAsync = Haptics.impactAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseReducedMotion.mockReturnValue(false);
  mockThemeContext = {
    theme,
    neonColor: 'yellow',
    confirmedNeonColor: 'yellow',
    status: 'idle',
    message: null,
    selectNeonColor: mockSelectNeonColor,
    retryNeonColor: mockRetryNeonColor,
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AppOpening', () => {
  it('renderiza os 3 módulos do símbolo (geometria intocada) e chama onFinish após a duração total', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening onFinish={onFinish} />);

    const renderedPathData = utils
      .UNSAFE_getAllByType(Path)
      .map((path) => path.props.d);
    expect(renderedPathData).toEqual(
      expect.arrayContaining([
        FORCA_MARK_MODULE_PATHS.base,
        FORCA_MARK_MODULE_PATHS.mid,
        FORCA_MARK_MODULE_PATHS.top,
      ]),
    );
    expect(onFinish).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('toque em qualquer ponto pula a animação, chama onFinish imediatamente e cancela o timer e o háptico pendentes', () => {
    jest.useFakeTimers();
    const onFinish = jest.fn();
    const utils = render(<AppOpening onFinish={onFinish} />);

    fireEvent.press(utils.getByLabelText('Pular abertura'));

    expect(onFinish).toHaveBeenCalledTimes(1);

    // O guard interno não pode disparar onFinish de novo quando o timer da
    // animação (já cancelado) chegaria ao fim — e o háptico agendado para
    // ~600ms também não pode disparar depois do skip.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mockedImpactAsync).not.toHaveBeenCalled();
  });

  it('com reduce-motion ativo, onFinish é chamado imediatamente sem esperar a duração nem agendar háptico', () => {
    jest.useFakeTimers();
    mockedUseReducedMotion.mockReturnValue(true);
    const onFinish = jest.fn();
    render(<AppOpening onFinish={onFinish} />);

    expect(onFinish).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mockedImpactAsync).not.toHaveBeenCalled();
  });

  it('renderiza o wordmark "FORÇA" abaixo do símbolo', () => {
    jest.useFakeTimers();
    const utils = render(<AppOpening onFinish={jest.fn()} />);

    expect(utils.getByText('FORÇA')).toBeTruthy();
  });

  it('acende o módulo do topo na cor accent.main do TEMA ATUAL (ignição neon) — não numa cor hardcoded', () => {
    // Tema propositalmente NÃO-default: se o componente hardcodear
    // '#EBFF00' (accent.main do tema default 'yellow') em vez de ler
    // theme.colors.accent.main, este teste falha — o accent.main de 'blue'
    // é outra cor ('#00E5FF').
    jest.useFakeTimers();
    const blueTheme = createTheme('blue');
    mockThemeContext = {
      ...mockThemeContext,
      theme: blueTheme,
      neonColor: 'blue',
      confirmedNeonColor: 'blue',
    };
    expect(blueTheme.colors.accent.main).toBe('#00E5FF');
    expect(blueTheme.colors.accent.main).not.toBe(theme.colors.accent.main);

    const utils = render(<AppOpening onFinish={jest.fn()} />);

    const topNeonPath = utils
      .UNSAFE_getAllByType(Path)
      .find(
        (path) =>
          path.props.d === FORCA_MARK_MODULE_PATHS.top &&
          path.props.fill === blueTheme.colors.accent.main,
      );

    expect(topNeonPath).toBeTruthy();
  });

  it('dispara o háptico Soft exatamente uma vez ao passar do delay de ignição (~600ms), no fluxo normal', () => {
    // Caminho feliz: sem skip, sem reduce-motion, Platform.OS default do
    // Jest (iOS via preset jest-expo) — o mesmo cenário em que os testes de
    // skip/reduce-motion acima só provam AUSÊNCIA de chamada. Este prova a
    // PRESENÇA: o háptico dispara, uma única vez, com o estilo certo.
    jest.useFakeTimers();
    const onFinish = jest.fn();
    render(<AppOpening onFinish={onFinish} />);

    expect(mockedImpactAsync).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(700); // IGNITION_START_MS (600ms) + margem
    });

    expect(mockedImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockedImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Soft);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('exporta TOTAL_DURATION_MS igual a 1800ms — duração total da nova coreografia', () => {
    expect(TOTAL_DURATION_MS).toBe(1800);
  });
});
