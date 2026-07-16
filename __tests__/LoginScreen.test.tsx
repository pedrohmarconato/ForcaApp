// __tests__/LoginScreen.test.tsx
// Reproduz a falha de segurança corrigida: a senha do usuário NUNCA pode
// ser persistida no AsyncStorage (nem no fluxo "Manter-me conectado").

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text as RNText, TextInput as RNTextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from '../src/screens/LoginScreen';

// --- Mocks ---
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => null),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => null),
  multiRemove: jest.fn(async () => null),
}));

const mockSignIn = jest.fn(async () => ({ error: null }));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

jest.mock('expo-checkbox', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock enxuto do react-native-paper com componentes RN puros
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { Text, TextInput, View } = require('react-native');
  const defaultTheme = { colors: { primary: '', text: '', placeholder: '', background: '', outline: '', onSurfaceVariant: '', error: '' } };
  const MockTextInput = (props: any) => <TextInput placeholder={props.label} {...props} />;
  MockTextInput.Icon = () => null; // sub-componente estático do Paper
  return {
    Text: (props: any) => <Text {...props} />,
    HelperText: (props: any) => (props.visible ? <Text {...props} /> : null),
    TextInput: MockTextInput,
    Button: ({ children, onPress }: any) => (
      <Text onPress={onPress}>{children}</Text>
    ),
    useTheme: () => defaultTheme,
  };
});

const mockedSetItem = AsyncStorage.setItem as jest.Mock;
const mockedRemoveItem = AsyncStorage.removeItem as jest.Mock;
const mockedGetItem = AsyncStorage.getItem as jest.Mock;

const navigation = { navigate: jest.fn() } as any;

describe('LoginScreen — segurança de credenciais', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockResolvedValue(null);
  });

  it('NUNCA persiste a senha no AsyncStorage, mesmo com "Manter-me conectado"', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('Endereço de e-mail'), 'user@teste.com');
    fireEvent.changeText(getByPlaceholderText('Senha'), 'SenhaSuperSecreta123');

    // Marca "Manter-me conectado"
    fireEvent.press(getByText('Manter-me conectado'));

    fireEvent.press(getByText('Entrar'));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('user@teste.com', 'SenhaSuperSecreta123'));

    // O e-mail pode ser lembrado...
    await waitFor(() => expect(mockedSetItem).toHaveBeenCalledWith('rememberedEmail', 'user@teste.com'));

    // ...mas a senha JAMAIS pode aparecer em qualquer escrita no storage
    for (const call of mockedSetItem.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('SenhaSuperSecreta123');
      expect(call[0]).not.toBe('rememberedPassword');
    }
    // E o legado inseguro deve ser removido
    expect(mockedRemoveItem).toHaveBeenCalledWith('rememberedPassword');
  });

  it('não pré-preenche a senha mesmo que exista lixo legado no storage', async () => {
    // Simula um dispositivo que tinha a versão insegura instalada
    mockedGetItem.mockImplementation(async (key: string) => {
      if (key === 'rememberedEmail') return 'legado@teste.com';
      if (key === 'rememberedPassword') return 'SenhaAntigaEmTextoPuro';
      return null;
    });

    const { getByPlaceholderText } = render(<LoginScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByPlaceholderText('Endereço de e-mail').props.value).toBe('legado@teste.com');
    });

    // O campo de senha NÃO pode ser preenchido a partir do storage
    expect(getByPlaceholderText('Senha').props.value).toBe('');
    // O legado deve ser limpo na montagem
    await waitFor(() => expect(mockedRemoveItem).toHaveBeenCalledWith('rememberedPassword'));
  });
});
