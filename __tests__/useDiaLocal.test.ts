// __tests__/useDiaLocal.test.ts
// Achado #7 do review do PR #13: a "semana" era calculada com um new Date()
// congelado por useMemo — aberta no domingo 23:59, a tela nunca virava para a
// segunda-feira. Este hook é a fonte viva do dia local: vira à meia-noite com
// timer e recalcula quando o app volta ao primeiro plano.

import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';

import { useDiaLocal } from '../src/hooks/useDiaLocal';

describe('useDiaLocal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('começa no dia local corrente', () => {
    jest.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));

    const { result } = renderHook(() => useDiaLocal());

    expect(result.current).toBe('2026-07-15');
  });

  it('vira o dia à meia-noite local mesmo com a tela aberta (achado #7)', () => {
    // Domingo, 19/07/2026, 23:59 — o cenário exato do review
    jest.setSystemTime(new Date(2026, 6, 19, 23, 59, 0));

    const { result } = renderHook(() => useDiaLocal());
    expect(result.current).toBe('2026-07-19');

    act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000); // passa da meia-noite
    });

    expect(result.current).toBe('2026-07-20');
  });

  it('rearma o timer para a meia-noite seguinte', () => {
    jest.setSystemTime(new Date(2026, 6, 19, 23, 59, 0));

    const { result } = renderHook(() => useDiaLocal());
    act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(result.current).toBe('2026-07-20');

    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(result.current).toBe('2026-07-21');
  });

  it('recalcula quando o app volta ao primeiro plano', () => {
    const handlers: Array<(estado: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _tipo: string,
      handler: (estado: string) => void,
    ) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    }) as any);

    jest.setSystemTime(new Date(2026, 6, 19, 23, 0, 0));
    const { result } = renderHook(() => useDiaLocal());
    expect(result.current).toBe('2026-07-19');

    // App foi para o fundo antes da meia-noite e voltou na manhã seguinte
    jest.setSystemTime(new Date(2026, 6, 20, 8, 0, 0));
    act(() => {
      handlers.forEach((h) => h('active'));
    });

    expect(result.current).toBe('2026-07-20');
  });

  it('desmontar limpa timer e assinatura do AppState', () => {
    const remover = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({
      remove: remover,
    })) as any);

    jest.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    const { unmount } = renderHook(() => useDiaLocal());

    unmount();

    expect(remover).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
