// __tests__/LoginScreen.test.tsx
// Reproduz a falha de segurança corrigida: a senha do usuário NUNCA pode
// ser persistida no AsyncStorage (nem no fluxo de lembrar o acesso).
//
// A tela foi remodelada para a identidade "Força sem ruído" — os campos agora
// são o TextField próprio (sem react-native-paper) e as consultas usam o nome
// acessível do campo. O comportamento coberto é o mesmo de antes.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const mockedSetItem = AsyncStorage.setItem as jest.Mock;
const mockedRemoveItem = AsyncStorage.removeItem as jest.Mock;
const mockedGetItem = AsyncStorage.getItem as jest.Mock;

const navigation = { navigate: jest.fn() } as any;

describe('LoginScreen — segurança de credenciais', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockResolvedValue(null);
  });

  it('NUNCA persiste a senha no AsyncStorage, mesmo com "Lembrar acesso"', async () => {
    const { getByLabelText } = render(<LoginScreen navigation={navigation} />);

    fireEvent.changeText(getByLabelText('E-mail'), 'user@teste.com');
    fireEvent.changeText(getByLabelText('Senha'), 'SenhaSuperSecreta123');

    // Marca "Lembrar acesso"
    fireEvent.press(getByLabelText('Lembrar acesso'));

    fireEvent.press(getByLabelText('Entrar'));

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('user@teste.com', 'SenhaSuperSecreta123'),
    );

    // O e-mail pode ser lembrado...
    await waitFor(() =>
      expect(mockedSetItem).toHaveBeenCalledWith('rememberedEmail', 'user@teste.com'),
    );

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

    const { getByLabelText } = render(<LoginScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByLabelText('E-mail').props.value).toBe('legado@teste.com');
    });

    // O campo de senha NÃO pode ser preenchido a partir do storage
    expect(getByLabelText('Senha').props.value).toBe('');
    // O legado deve ser limpo na montagem
    await waitFor(() => expect(mockedRemoveItem).toHaveBeenCalledWith('rememberedPassword'));
  });

  it('a senha começa oculta e só é revelada sob ação explícita', () => {
    const { getByLabelText } = render(<LoginScreen navigation={navigation} />);

    expect(getByLabelText('Senha').props.secureTextEntry).toBe(true);

    fireEvent.press(getByLabelText('Mostrar senha'));

    expect(getByLabelText('Senha').props.secureTextEntry).toBe(false);
  });

  it('exibe mensagem de erro sem vazar detalhes quando as credenciais falham', async () => {
    mockSignIn.mockResolvedValueOnce({
      error: new Error('Invalid login credentials'),
    } as any);

    const { getByLabelText, findByText } = render(<LoginScreen navigation={navigation} />);

    fireEvent.changeText(getByLabelText('E-mail'), 'user@teste.com');
    fireEvent.changeText(getByLabelText('Senha'), 'errada');
    fireEvent.press(getByLabelText('Entrar'));

    expect(await findByText('Email ou senha inválidos.')).toBeTruthy();
    // Uma falha de login não pode gravar nada no storage
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('navega para cadastro e recuperação de senha', () => {
    const { getByText } = render(<LoginScreen navigation={navigation} />);

    fireEvent.press(getByText('Cadastre-se'));
    expect(navigation.navigate).toHaveBeenCalledWith('SignUp');

    fireEvent.press(getByText('Esqueceu a senha?'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
