// __tests__/jointJoinScreen.test.tsx
// Treino Conjunto 2.0 — Sprint 02. Entrar com o código.
//
// Modos de falha cobertos:
//  1. a tela DISTINGUIR os motivos da recusa e virar oráculo de convites alheios;
//  2. o código do deep link entrar SOZINHO, sem o usuário aceitar;
//  3. aceitar código fora do alfabeto e mandar o erro para o servidor;
//  4. dois toques criando duas tentativas.

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  joinJointSession: jest.fn(),
  JointSessionRequestError: class extends Error {
    motivo: string; kind = 'server';
    constructor(m: string, motivo: string) { super(m); this.motivo = motivo; }
  },
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import JointJoinScreen from '../src/screens/JointJoinScreen';
import * as repo from '../src/services/jointSessionRepository';

const entrarRpc = repo.joinJointSession as jest.Mock;
const nav = () => ({ goBack: jest.fn(), navigate: jest.fn() });

beforeEach(() => entrarRpc.mockReset());

describe('campo do código', () => {
  it('normaliza para maiúsculas e limita a 6', () => {
    const { getByTestId } = render(<JointJoinScreen navigation={nav()} />);
    const campo = getByTestId('campo-codigo');
    fireEvent.changeText(campo, 'abc234xyz');
    expect(campo.props.value).toBe('ABC234');
  });

  it('só habilita com 6 caracteres do alfabeto', () => {
    const { getByTestId } = render(<JointJoinScreen navigation={nav()} />);
    const botao = getByTestId('entrar');
    expect(botao.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(getByTestId('campo-codigo'), 'ABC23');
    expect(getByTestId('entrar').props.accessibilityState).toMatchObject({ disabled: true });

    // `I` e `0` estão fora do alfabeto de propósito — são lidos errado.
    fireEvent.changeText(getByTestId('campo-codigo'), 'ABC2I0');
    expect(getByTestId('entrar').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(getByTestId('campo-codigo'), 'ABC234');
    expect(getByTestId('entrar').props.accessibilityState).toMatchObject({ disabled: false });
  });
});

describe('código vindo do deep link', () => {
  it('abre PREENCHIDO e NÃO entra sozinho', () => {
    const { getByTestId } = render(
      <JointJoinScreen navigation={nav()} route={{ params: { code: 'ABC234' } }} />,
    );
    expect(getByTestId('campo-codigo').props.value).toBe('ABC234');
    expect(entrarRpc).not.toHaveBeenCalled();
  });

  it('entra só depois da ação do usuário', async () => {
    entrarRpc.mockResolvedValue({ id: 'js-1', status: 'lobby' });
    const navegacao = nav();
    const { getByTestId } = render(
      <JointJoinScreen navigation={navegacao} route={{ params: { code: 'ABC234' } }} />,
    );
    fireEvent.press(getByTestId('entrar'));
    await waitFor(() => expect(entrarRpc).toHaveBeenCalledWith('ABC234'));
    expect(navegacao.navigate).toHaveBeenCalledWith('JointLobby', { jointSessionId: 'js-1' });
  });
});

describe('recusa — UMA mensagem para todos os motivos', () => {
  const motivos = [
    ['convite_invalido', 'código inexistente'],
    ['limite_de_tentativas', 'limite atingido'],
    ['estado_invalido', 'convite consumido'],
  ];

  it.each(motivos)('%s (%s) produz a mesma mensagem', async (motivo) => {
    entrarRpc.mockRejectedValue(
      new (repo as any).JointSessionRequestError('detalhe interno', motivo),
    );
    const { getByTestId } = render(
      <JointJoinScreen navigation={nav()} route={{ params: { code: 'ABC234' } }} />,
    );
    fireEvent.press(getByTestId('entrar'));
    await waitFor(() => expect(getByTestId('erro-entrar')).toBeTruthy());
  });

  it('a mensagem não vaza o motivo — nada de "expirado" versus "inexistente"', async () => {
    const textos: string[] = [];
    for (const [motivo] of motivos) {
      entrarRpc.mockRejectedValue(
        new (repo as any).JointSessionRequestError(`erro ${motivo}`, motivo),
      );
      const { getByTestId, unmount } = render(
        <JointJoinScreen navigation={nav()} route={{ params: { code: 'ABC234' } }} />,
      );
      fireEvent.press(getByTestId('entrar'));
      await waitFor(() => expect(getByTestId('erro-entrar')).toBeTruthy());
      textos.push(String(getByTestId('erro-entrar').props.title ?? ''));
      unmount();
    }
    expect(new Set(textos).size).toBe(1);
    expect(textos[0]).not.toMatch(/expirad|inexistent|limite|consumid/i);
  });

  it('recusa NÃO navega', async () => {
    entrarRpc.mockRejectedValue(new Error('qualquer'));
    const navegacao = nav();
    const { getByTestId } = render(
      <JointJoinScreen navigation={navegacao} route={{ params: { code: 'ABC234' } }} />,
    );
    fireEvent.press(getByTestId('entrar'));
    await waitFor(() => expect(getByTestId('erro-entrar')).toBeTruthy());
    expect(navegacao.navigate).not.toHaveBeenCalled();
  });
});

describe('idempotência do toque', () => {
  it('dois toques com a Promise pendente chamam UMA vez', async () => {
    let resolver: (v: any) => void = () => {};
    entrarRpc.mockReturnValue(new Promise((r) => { resolver = r; }));
    const { getByTestId } = render(
      <JointJoinScreen navigation={nav()} route={{ params: { code: 'ABC234' } }} />,
    );
    fireEvent.press(getByTestId('entrar'));
    fireEvent.press(getByTestId('entrar'));
    expect(entrarRpc).toHaveBeenCalledTimes(1);
    await act(async () => { resolver({ id: 'js-1', status: 'lobby' }); });
  });
});
