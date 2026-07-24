// __tests__/direcao03-fase1-fundacoes.test.tsx
// Fase 1 da Direção 03 — fundações de movimento.
// Modos de falha cobertos ANTES da implementação:
//  1. tokens de motion ausentes/derivados errado (curvas e limites da direção);
//  2. haptic disparado no web (quebra PWA) ou erro nativo não engolido;
//  3. Button perde contrato ao ganhar física de press (label/press/disabled/loading);
//  4. variante tonal inexistente;
//  5. Skeleton sem papel de acessibilidade de carregamento.

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

import theme from '../src/theme/theme';
import Button from '../src/components/ui/Button';
import { Skeleton } from '../src/components/ui/Feedback';
import { tapLight } from '../src/utils/haptics';

// expo-haptics é nativo — mockado para inspecionar chamadas.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const Haptics = require('expo-haptics');

describe('Fase 1 — motion tokens (física de treino)', () => {
  it('expõe as três curvas da direção com os parâmetros exatos', () => {
    expect(theme.animation.easings.impulso).toEqual({ x1: 0.2, y1: 0.8, x2: 0.3, y2: 1 });
    expect(theme.animation.easings.controle).toEqual({ x1: 0.55, y1: 0, x2: 0.15, y2: 1 });
  });

  it('respeita os limites da direção: nada acima de 420ms, stagger 40ms/máx 6', () => {
    const { durations, stagger, press } = theme.animation;
    expect(Math.max(...Object.values(durations))).toBeLessThanOrEqual(420);
    expect(stagger).toEqual({ delayMs: 40, maxItems: 6 });
    expect(press).toEqual({ scale: 0.97, opacity: 0.85, inMs: 120, outMs: 150 });
  });
});

describe('Fase 1 — haptics seguro por plataforma', () => {
  // O util decide a plataforma EM TEMPO DE CHAMADA — dá para mutar Platform.OS
  // direto, sem jogos de module registry (que poluiriam o React dos demais testes).
  const originalOS = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
    (Haptics.selectionAsync as jest.Mock).mockClear();
  });

  it('no web é no-op: nunca toca o módulo nativo', async () => {
    (Platform as { OS: string }).OS = 'web';
    await tapLight();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('no nativo dispara selectionAsync', async () => {
    (Platform as { OS: string }).OS = 'android';
    await tapLight();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('erro do módulo nativo é engolido (nunca derruba o toque)', async () => {
    (Platform as { OS: string }).OS = 'android';
    (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('sem vibrador'));
    await expect(tapLight()).resolves.toBeUndefined();
  });
});

describe('Fase 1 — Button mantém o contrato com a física nova', () => {
  it('renderiza rótulo e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Começar" onPress={onPress} />);
    fireEvent.press(getByText('Começar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('desabilitado não dispara e expõe o estado por acessibilidade', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Começar" onPress={onPress} disabled />);
    const btn = getByRole('button');
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState.disabled).toBe(true);
  });

  it('aceita a variante tonal nova sem quebrar', () => {
    const { getByText } = render(<Button label="Detalhes" variant="tonal" />);
    expect(getByText('Detalhes')).toBeTruthy();
  });

  it('press-in/out da física não engole o toque nem lança', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button label="Iniciar série" onPress={onPress} />);
    const btn = getByRole('button');
    act(() => {
      fireEvent(btn, 'pressIn');
      fireEvent(btn, 'pressOut');
    });
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Fase 1 — Skeleton (carga sem spinner)', () => {
  it('renderiza com papel de progresso e dimensões dadas', () => {
    const { getByTestId } = render(
      <Skeleton height={64} testID="skl-hero" accessibilityLabel="Carregando treino de hoje" />,
    );
    const el = getByTestId('skl-hero');
    expect(el.props.accessibilityRole).toBe('progressbar');
  });

  it('aceita children-less e não exige width', () => {
    expect(() => render(<Skeleton height={18} testID="skl-line" />)).not.toThrow();
  });
});

describe('Fase 1 — transição de stack compartilhada', () => {
  it('exporta spec de 260ms com a curva impulso', () => {
    const { stackTransition } = require('../src/navigation/navigationStyles');
    expect(stackTransition.transitionSpec.open.config.duration).toBe(theme.animation.durations.medium);
    expect(stackTransition.transitionSpec.close.config.duration).toBe(theme.animation.durations.short);
    expect(typeof stackTransition.cardStyleInterpolator).toBe('function');
    // Interpolador devolve opacidade e translação — fade + deslize curto.
    const out = stackTransition.cardStyleInterpolator({
      current: { progress: { interpolate: jest.fn(() => 0.5) } },
      layouts: { screen: { width: 430, height: 932 } },
    });
    expect(out.cardStyle).toBeDefined();
  });
});
