// __tests__/settingsScreen.test.tsx
// Ajustes: escolha acessível do acento, layout responsivo e estados de autosave.

import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { createTheme, type NeonColorKey } from '../src/theme/theme';

const mockGoBack = jest.fn();
const mockSelectNeonColor = jest.fn(async (_key: NeonColorKey) => undefined);
const mockRetryNeonColor = jest.fn(async () => undefined);

type MockThemeStatus = 'idle' | 'saving' | 'success' | 'error';

const createMockThemeContext = (
  neonColor: NeonColorKey = 'yellow',
  status: MockThemeStatus = 'idle',
  confirmedNeonColor: NeonColorKey = neonColor,
) => ({
  theme: createTheme(neonColor),
  neonColor,
  confirmedNeonColor,
  status,
  message: null,
  selectNeonColor: mockSelectNeonColor,
  retryNeonColor: mockRetryNeonColor,
});

let mockThemeContext = createMockThemeContext();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../src/theme/ThemeProvider', () => ({
  useTheme: () => mockThemeContext,
  useThemeStyles: (
    factory: (theme: typeof mockThemeContext.theme) => unknown,
  ) => factory(mockThemeContext.theme),
}));

import SettingsScreen from '../src/screens/SettingsScreen';

const renderSettings = () => render(<SettingsScreen />);

const setTheme = (
  screen: ReturnType<typeof renderSettings>,
  neonColor: NeonColorKey,
  status: MockThemeStatus = 'idle',
  confirmedNeonColor: NeonColorKey = neonColor,
) => {
  mockThemeContext = createMockThemeContext(
    neonColor,
    status,
    confirmedNeonColor,
  );
  screen.rerender(<SettingsScreen />);
};

const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
const dimensionsSpy = jest.spyOn(
  require('react-native'),
  'useWindowDimensions',
);
let currentWidth = 390;

describe('SettingsScreen — entrada e opções do acento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeContext = createMockThemeContext();
    currentWidth = 390;
    dimensionsSpy.mockReturnValue({
      width: currentWidth,
      height: 844,
      scale: 1,
      fontScale: 1,
    });
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
  });

  afterAll(() => {
    if (platformDescriptor)
      Object.defineProperty(Platform, 'OS', platformDescriptor);
  });

  it('renderiza o header, a copy aprovada e exatamente quatro radios na ordem fechada', () => {
    const screen = renderSettings();

    expect(screen.getByText('Ajustes')).toBeTruthy();
    expect(screen.getByText('Aparencia')).toBeTruthy();
    expect(screen.getByText('Seu acento neon.')).toBeTruthy();
    expect(
      screen.getByText(
        'Escolha a cor usada em ações, foco e progresso concluído.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Cor do acento')).toBeTruthy();
    expect(
      screen.getByText('Cores de informação, sucesso, aviso e erro não mudam.'),
    ).toBeTruthy();

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(
      ['yellow', 'blue', 'green', 'red'].map((key) =>
        screen.getByTestId(`neon-option-${key}`),
      ),
    ).toHaveLength(4);
  });

  it('expõe checked, nome, swatch de 28px, alvo de 50px e Selecionado sem depender só de cor', () => {
    const screen = renderSettings();

    const selected = screen.getByTestId('neon-option-yellow');
    const inactive = screen.getByTestId('neon-option-blue');
    const selectedStyle = StyleSheet.flatten(selected.props.style);
    const swatchStyle = StyleSheet.flatten(
      screen.getByTestId('neon-swatch-yellow').props.style,
    );

    expect(selected.props.accessibilityRole).toBe('radio');
    expect(selected.props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
      busy: false,
    });
    expect(inactive.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
      busy: false,
    });
    expect(selected.props.accessibilityLabel).toBe('Amarelo neon');
    expect(screen.getByText('Amarelo neon')).toBeTruthy();
    expect(screen.getByText('Selecionado')).toBeTruthy();
    expect(screen.queryByText('Selecionado', { exact: true })).toBeTruthy();
    expect(selectedStyle.minHeight).toBeGreaterThanOrEqual(50);
    expect(swatchStyle).toEqual(
      expect.objectContaining({ width: 28, height: 28 }),
    );
  });

  it('selecionar Azul chama o provider uma vez e reflete o preview confirmado pelo provider', () => {
    const screen = renderSettings();

    fireEvent.press(screen.getByTestId('neon-option-blue'));
    expect(mockSelectNeonColor).toHaveBeenCalledTimes(1);
    expect(mockSelectNeonColor).toHaveBeenCalledWith('blue');

    setTheme(screen, 'blue', 'saving', 'yellow');
    expect(
      screen.getByTestId('neon-option-blue').props.accessibilityState.checked,
    ).toBe(true);
    expect(screen.getByText('Selecionado')).toBeTruthy();
    expect(screen.getByTestId('settings-saving-indicator')).toBeTruthy();
    expect(screen.getByText('Salvando...')).toBeTruthy();
  });

  it('usa uma coluna em 320 e duas colunas em 390 e 768, sem exceder 420px', () => {
    const screen = renderSettings();

    expect(
      StyleSheet.flatten(screen.getByTestId('settings-options').props.style),
    ).toEqual(expect.objectContaining({ flexDirection: 'row' }));
    expect(
      StyleSheet.flatten(screen.getByTestId('settings-content').props.style),
    ).toEqual(expect.objectContaining({ maxWidth: 420, width: '100%' }));

    currentWidth = 320;
    dimensionsSpy.mockReturnValue({
      width: currentWidth,
      height: 844,
      scale: 1,
      fontScale: 1,
    });
    screen.rerender(<SettingsScreen />);
    expect(
      StyleSheet.flatten(screen.getByTestId('settings-options').props.style),
    ).toEqual(expect.objectContaining({ flexDirection: 'column' }));

    currentWidth = 768;
    dimensionsSpy.mockReturnValue({
      width: currentWidth,
      height: 1024,
      scale: 1,
      fontScale: 1,
    });
    screen.rerender(<SettingsScreen />);
    expect(
      StyleSheet.flatten(screen.getByTestId('settings-options').props.style),
    ).toEqual(expect.objectContaining({ flexDirection: 'row' }));
  });
});

describe('SettingsScreen — teclado e estados de autosave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeContext = createMockThemeContext();
    currentWidth = 390;
    dimensionsSpy.mockReturnValue({
      width: currentWidth,
      height: 844,
      scale: 1,
      fontScale: 1,
    });
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
  });

  it('usa roving focus com Tab, setas e wrap; Space e Enter selecionam a opção focal', () => {
    const screen = renderSettings();
    const yellow = screen.getByTestId('neon-option-yellow');
    const blue = screen.getByTestId('neon-option-blue');
    const green = screen.getByTestId('neon-option-green');
    const red = screen.getByTestId('neon-option-red');

    expect(yellow.props.tabIndex).toBe(0);
    expect(blue.props.tabIndex).toBe(-1);

    fireEvent(yellow, 'keyDown', {
      key: 'ArrowRight',
      preventDefault: jest.fn(),
    });
    expect(blue.props.tabIndex).toBe(0);
    expect(yellow.props.tabIndex).toBe(-1);

    fireEvent(blue, 'keyDown', { key: 'ArrowDown', preventDefault: jest.fn() });
    expect(green.props.tabIndex).toBe(0);
    fireEvent(green, 'keyDown', {
      key: 'ArrowLeft',
      preventDefault: jest.fn(),
    });
    expect(blue.props.tabIndex).toBe(0);
    fireEvent(blue, 'keyDown', { key: 'ArrowUp', preventDefault: jest.fn() });
    expect(yellow.props.tabIndex).toBe(0);
    fireEvent(yellow, 'keyDown', { key: 'ArrowUp', preventDefault: jest.fn() });
    expect(red.props.tabIndex).toBe(0);

    fireEvent(red, 'keyDown', { key: ' ', preventDefault: jest.fn() });
    fireEvent(red, 'keyDown', { key: 'Enter', preventDefault: jest.fn() });

    expect(mockSelectNeonColor).toHaveBeenCalledTimes(2);
    expect(mockSelectNeonColor).toHaveBeenNthCalledWith(1, 'red');
    expect(mockSelectNeonColor).toHaveBeenNthCalledWith(2, 'red');
  });

  it('bloqueia todos os cards durante saving e não abre uma segunda seleção', () => {
    const screen = renderSettings();
    setTheme(screen, 'blue', 'saving', 'yellow');

    for (const key of ['yellow', 'blue', 'green', 'red']) {
      const card = screen.getByTestId(`neon-option-${key}`);
      expect(card.props.accessibilityState).toEqual({
        checked: key === 'blue',
        disabled: true,
        busy: true,
      });
      fireEvent.press(card);
    }

    expect(mockSelectNeonColor).not.toHaveBeenCalled();
  });

  it('anuncia sucesso uma vez mesmo com renders adicionais', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(async () => undefined);
    const screen = renderSettings();

    setTheme(screen, 'blue', 'success', 'blue');
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith('Acento salvo na sua conta.'),
    );
    expect(announce).toHaveBeenCalledTimes(1);

    screen.rerender(<SettingsScreen />);
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('em erro mantém confirmedNeonColor, expõe Notice danger e permite retry uma vez', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(async () => undefined);
    const screen = renderSettings();

    setTheme(screen, 'yellow', 'error', 'yellow');

    expect(
      screen.getByTestId('neon-option-yellow').props.accessibilityState.checked,
    ).toBe(true);
    expect(
      screen.getByTestId('neon-option-red').props.accessibilityState.checked,
    ).toBe(false);
    expect(screen.getByText('Nao foi possivel salvar o acento')).toBeTruthy();
    expect(
      screen.getByText(
        'Sua cor anterior foi restaurada. Tente novamente quando a conexao voltar.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Tentar novamente'));
    expect(mockRetryNeonColor).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(announce).toHaveBeenCalled());
    announce.mockRestore();
  });
});
