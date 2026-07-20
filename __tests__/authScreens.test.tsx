// __tests__/authScreens.test.tsx
// Cadastro e redefinição de senha após a remodelagem para a Direção 02.
// Cobre as validações locais e os estados de erro/sucesso — o que a moldura
// nova precisa continuar entregando.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSignUp = jest.fn(async () => ({ error: null }));
const mockResetPassword = jest.fn(async () => ({ error: null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ signUp: mockSignUp, resetPassword: mockResetPassword }),
}));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

import SignUpScreen from '../src/screens/SignUpScreen';
import ForgotPasswordScreen from '../src/screens/ForgotPasswordScreen';

const navigation = { navigate: jest.fn() } as any;

describe('SignUpScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recusa o envio quando as senhas não coincidem e não chama o backend', async () => {
    const { getByLabelText, findByText } = render(<SignUpScreen navigation={navigation} />);

    fireEvent.changeText(getByLabelText('E-mail'), 'novo@teste.com');
    fireEvent.changeText(getByLabelText('Senha'), 'SenhaBoa123');
    fireEvent.changeText(getByLabelText('Confirmar senha'), 'Divergente123');
    fireEvent.press(getByLabelText('Cadastrar'));

    expect(await findByText('As senhas não coincidem.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('recusa o envio com campos vazios', async () => {
    const { getByLabelText, findByText } = render(<SignUpScreen navigation={navigation} />);

    fireEvent.press(getByLabelText('Cadastrar'));

    expect(await findByText('Por favor, preencha todos os campos.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('cadastra e avisa sobre a confirmação por e-mail', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = render(<SignUpScreen navigation={navigation} />);

    fireEvent.changeText(getByLabelText('E-mail'), 'novo@teste.com');
    fireEvent.changeText(getByLabelText('Senha'), 'SenhaBoa123');
    fireEvent.changeText(getByLabelText('Confirmar senha'), 'SenhaBoa123');
    fireEvent.press(getByLabelText('Cadastrar'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('novo@teste.com', 'SenhaBoa123'));
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('traduz o erro de e-mail já cadastrado', async () => {
    mockSignUp.mockResolvedValueOnce({
      error: new Error('User already registered'),
    } as any);
    const { getByLabelText, findByText } = render(<SignUpScreen navigation={navigation} />);

    fireEvent.changeText(getByLabelText('E-mail'), 'repetido@teste.com');
    fireEvent.changeText(getByLabelText('Senha'), 'SenhaBoa123');
    fireEvent.changeText(getByLabelText('Confirmar senha'), 'SenhaBoa123');
    fireEvent.press(getByLabelText('Cadastrar'));

    expect(await findByText('Este email já está cadastrado.')).toBeTruthy();
  });
});

describe('ForgotPasswordScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirma o envio sem revelar se o e-mail existe', async () => {
    const { getByLabelText, findByText } = render(
      <ForgotPasswordScreen navigation={navigation} />,
    );

    fireEvent.changeText(getByLabelText('E-mail'), 'alguem@teste.com');
    fireEvent.press(getByLabelText('Enviar link'));

    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith('alguem@teste.com'));
    expect(await findByText(/Se o email estiver cadastrado/)).toBeTruthy();
  });

  it('traduz o erro de excesso de tentativas', async () => {
    mockResetPassword.mockRejectedValueOnce(
      new Error('For security purposes, you can only request this after 30 seconds'),
    );
    const { getByLabelText, findByText } = render(
      <ForgotPasswordScreen navigation={navigation} />,
    );

    fireEvent.changeText(getByLabelText('E-mail'), 'alguem@teste.com');
    fireEvent.press(getByLabelText('Enviar link'));

    expect(await findByText('Muitas tentativas. Tente novamente mais tarde.')).toBeTruthy();
  });

  it('volta para o login', () => {
    const { getByText } = render(<ForgotPasswordScreen navigation={navigation} />);

    fireEvent.press(getByText('Voltar para o login'));

    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });
});
