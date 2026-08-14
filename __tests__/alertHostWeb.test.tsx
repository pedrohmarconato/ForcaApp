// __tests__/alertHostWeb.test.tsx
// AlertHost no branch web (WEB-01, Plano 09-01 Task 1). Molde:
// __tests__/swapModalitySheet.test.tsx (render/fireEvent sem DOM literal).
// Platform.OS mockado para 'web' preservando os componentes reais do RN —
// AlertHost usa Modal/Pressable/Text/TouchableOpacity de verdade.

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

import AlertHost from '../src/components/AlertHost';
import { showAlert } from '../src/utils/alertShim';
import { useAlertStore } from '../src/store/alertStore';

// Platform.OS mockado para 'web' via Object.defineProperty (não via
// jest.mock('react-native', ...) — esse molde reimporta o módulo nativo
// inteiro dentro da factory e derruba o registro de TurboModules do
// ambiente de teste; mesmo padrão usado nos demais testes deste repo, ex.
// __tests__/activeSessionScreen.test.tsx "Object.getOwnPropertyDescriptor(Platform, 'OS')").
describe('AlertHost (web)', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  });

  afterAll(() => {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
  });

  beforeEach(() => {
    useAlertStore.setState({ current: null });
  });

  it('sem alerta ativo não renderiza Modal (retorna null)', () => {
    const screen = render(<AlertHost />);
    expect(screen.queryByTestId('alert-host-backdrop')).toBeNull();
  });

  it('showAlert("Concluir treino?", ...) faz o texto aparecer na árvore renderizada', () => {
    const screen = render(<AlertHost />);
    const onPress = jest.fn();
    act(() => {
      showAlert(
        'Concluir treino?',
        'Ainda há séries não registradas. Deseja concluir mesmo assim?',
        [
          { text: 'Continuar treino', style: 'cancel' },
          { text: 'Concluir', onPress },
        ],
      );
    });
    expect(screen.getByText('Concluir treino?')).toBeTruthy();
  });

  it('pressionar "Concluir" chama o onPress 1 vez e fecha o alerta (current volta a null)', () => {
    const screen = render(<AlertHost />);
    const onPress = jest.fn();
    act(() => {
      showAlert(
        'Concluir treino?',
        'Ainda há séries não registradas. Deseja concluir mesmo assim?',
        [
          { text: 'Continuar treino', style: 'cancel' },
          { text: 'Concluir', onPress },
        ],
      );
    });
    fireEvent.press(screen.getByText('Concluir'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(useAlertStore.getState().current).toBeNull();
  });
});
