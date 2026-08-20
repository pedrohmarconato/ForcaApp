// __tests__/alertHostWeb.test.tsx
// AlertHost no branch web (WEB-01, Plano 09-01 Task 1). Molde:
// __tests__/swapModalitySheet.test.tsx (render/fireEvent sem DOM literal).
// Platform.OS mockado para 'web' preservando os componentes reais do RN —
// AlertHost usa Modal/Pressable/Text/TouchableOpacity de verdade.

import React from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

import AlertHost from '../src/components/AlertHost';
import { showAlert } from '../src/utils/alertShim';
import { useAlertStore } from '../src/store/alertStore';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { createTheme } from '../src/theme/theme';

let mockAuthState: {
  user: { id: string } | null;
  profile: { id: string; neon_color: string } | null;
} = { user: null, profile: null };

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));
jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));

const setThemeColor = (neonColor: string) => {
  mockAuthState = {
    user: { id: 'alert-host-web-user' },
    profile: { id: 'alert-host-web-user', neon_color: neonColor },
  };
};

const renderThemed = (element: React.ReactElement, neonColor = 'yellow') => {
  setThemeColor(neonColor);
  const result = render(<ThemeProvider>{element}</ThemeProvider>);

  return {
    ...result,
    rerenderWithTheme: (nextElement: React.ReactElement, nextColor: string) => {
      setThemeColor(nextColor);
      result.rerender(<ThemeProvider>{nextElement}</ThemeProvider>);
    },
  };
};

const styleValue = (node: any, property: string) =>
  StyleSheet.flatten(node.props.style)?.[property];

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
    const screen = renderThemed(<AlertHost />);
    expect(screen.queryByTestId('alert-host-backdrop')).toBeNull();
  });

  it('preserva ThemeProvider no rerender e troca acento e danger sem perder roles/labels', async () => {
    const alert = {
      title: 'Excluir treino?',
      message: 'Esta ação não pode ser desfeita.',
      buttons: [{ text: 'Excluir', style: 'destructive' as const }],
    };
    useAlertStore.getState().show(alert);

    const screen = renderThemed(<AlertHost />, 'yellow');
    expect(styleValue(screen.getByText('Excluir'), 'color')).toBe(
      createTheme('yellow').colors.status.danger,
    );

    screen.rerenderWithTheme(<AlertHost />, 'blue');
    await waitFor(() =>
      expect(styleValue(screen.getByText('Excluir'), 'color')).toBe(
        createTheme('blue').colors.status.danger,
      ),
    );

    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Excluir' })).not.toHaveLength(0);
    screen.unmount();
  });

  it('showAlert("Concluir treino?", ...) faz o texto aparecer na árvore renderizada', () => {
    const screen = renderThemed(<AlertHost />);
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
    const screen = renderThemed(<AlertHost />);
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

  it('showAlert(..., []) (buttons vazio) cai para o botão padrão "OK" em vez de renderizar zero botões (WR-01)', () => {
    const screen = renderThemed(<AlertHost />);
    act(() => {
      showAlert('Aviso', 'Mensagem informativa', []);
    });
    expect(screen.getByTestId('alert-host-button-0')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('alerta de botão único (ex.: "Cadastro realizado!" do SignUpScreen): pressionar o backdrop NÃO fecha o alerta nem dispara o onPress (WR-03, mirror do bloqueio nativo de single-button alert no iOS)', () => {
    const screen = renderThemed(<AlertHost />);
    const onPress = jest.fn();
    act(() => {
      showAlert(
        'Cadastro realizado!',
        'Um email de confirmação foi enviado. Por favor, verifique sua caixa de entrada.',
        [{ text: 'OK', onPress }],
      );
    });
    fireEvent.press(screen.getByTestId('alert-host-backdrop'));
    expect(onPress).not.toHaveBeenCalled();
    expect(useAlertStore.getState().current).not.toBeNull();
    // O caminho legítimo continua funcionando: tocar no botão dispara o
    // onPress e fecha o alerta normalmente.
    fireEvent.press(screen.getByText('OK'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(useAlertStore.getState().current).toBeNull();
  });

  it('alerta de múltiplos botões (ex.: "Concluir treino?" do ActiveSessionScreen): pressionar o backdrop fecha o alerta e dispara o onPress do botão style="cancel" (mirror do back-dismiss nativo do Android)', () => {
    const screen = renderThemed(<AlertHost />);
    const onPressCancelar = jest.fn();
    const onPressConcluir = jest.fn();
    act(() => {
      showAlert(
        'Concluir treino?',
        'Ainda há séries não registradas. Deseja concluir mesmo assim?',
        [
          { text: 'Continuar treino', style: 'cancel', onPress: onPressCancelar },
          { text: 'Concluir', onPress: onPressConcluir },
        ],
      );
    });
    fireEvent.press(screen.getByTestId('alert-host-backdrop'));
    expect(onPressCancelar).toHaveBeenCalledTimes(1);
    expect(onPressConcluir).not.toHaveBeenCalled();
    expect(useAlertStore.getState().current).toBeNull();
  });

  it('alerta de múltiplos botões sem nenhum style="cancel": pressionar o backdrop fecha o alerta sem disparar nenhum onPress', () => {
    const screen = renderThemed(<AlertHost />);
    const onPress1 = jest.fn();
    const onPress2 = jest.fn();
    act(() => {
      showAlert('Título', 'Mensagem', [
        { text: 'Opção A', onPress: onPress1 },
        { text: 'Opção B', onPress: onPress2 },
      ]);
    });
    fireEvent.press(screen.getByTestId('alert-host-backdrop'));
    expect(onPress1).not.toHaveBeenCalled();
    expect(onPress2).not.toHaveBeenCalled();
    expect(useAlertStore.getState().current).toBeNull();
  });

  it('WR-02: alerta de botão único — onRequestClose do Modal (Escape no web) NÃO fecha o alerta nem dispara o onPress, mirror do bloqueio do backdrop (WR-03)', () => {
    const screen = renderThemed(<AlertHost />);
    const onPress = jest.fn();
    act(() => {
      showAlert(
        'Cadastro realizado!',
        'Um email de confirmação foi enviado. Por favor, verifique sua caixa de entrada.',
        [{ text: 'OK', onPress }],
      );
    });
    // react-native-web's Modal liga onRequestClose a um listener de keyup no
    // Escape (ModalContent.js) — fora do alcance do preset RN puro do Jest.
    // Invoca a prop diretamente, igual ao que esse listener dispararia.
    const modal = screen.UNSAFE_getByType(Modal);
    act(() => {
      modal.props.onRequestClose();
    });
    expect(onPress).not.toHaveBeenCalled();
    expect(useAlertStore.getState().current).not.toBeNull();
    // Caminho legítimo continua funcionando.
    fireEvent.press(screen.getByText('OK'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(useAlertStore.getState().current).toBeNull();
  });

  it('WR-02: alerta de múltiplos botões — onRequestClose do Modal fecha o alerta e dispara o onPress do botão style="cancel", igual ao backdrop', () => {
    const screen = renderThemed(<AlertHost />);
    const onPressCancelar = jest.fn();
    const onPressConcluir = jest.fn();
    act(() => {
      showAlert(
        'Concluir treino?',
        'Ainda há séries não registradas. Deseja concluir mesmo assim?',
        [
          { text: 'Continuar treino', style: 'cancel', onPress: onPressCancelar },
          { text: 'Concluir', onPress: onPressConcluir },
        ],
      );
    });
    const modal = screen.UNSAFE_getByType(Modal);
    act(() => {
      modal.props.onRequestClose();
    });
    expect(onPressCancelar).toHaveBeenCalledTimes(1);
    expect(onPressConcluir).not.toHaveBeenCalled();
    expect(useAlertStore.getState().current).toBeNull();
  });
});
