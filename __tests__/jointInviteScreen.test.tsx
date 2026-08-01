// __tests__/jointInviteScreen.test.tsx
// Treino Conjunto 2.0 — Sprint 02. Criar e compartilhar o convite.
//
// Modos de falha cobertos:
//  1. convite nascendo de MONTAGEM — sessões fantasma a cada foco/StrictMode;
//  2. dois toques gerando dois convites e o parceiro entrando no errado;
//  3. rotação deixando o código ANTIGO visível;
//  4. cancelar o compartilhamento virando "erro" na cara do usuário.

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  createJointSession: jest.fn(),
}));

import React from 'react';
import { Share } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import JointInviteScreen from '../src/screens/JointInviteScreen';
import * as repo from '../src/services/jointSessionRepository';

const criar = repo.createJointSession as jest.Mock;
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const convite = (codigo: string, minutos = 15) => ({
  session: { id: 'js-1', status: 'inviting' },
  inviteCode: codigo,
  inviteExpiresAt: new Date(T0 + minutos * 60_000).toISOString(),
});

const nav = () => ({ goBack: jest.fn(), navigate: jest.fn() });

beforeEach(() => {
  criar.mockReset();
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as any);
});
afterEach(() => jest.restoreAllMocks());

describe('nada nasce de montagem', () => {
  it('montar a tela NÃO cria convite', () => {
    render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    expect(criar).not.toHaveBeenCalled();
  });

  it('remontar (foco/StrictMode) continua sem criar', () => {
    const { unmount } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    unmount();
    render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    expect(criar).not.toHaveBeenCalled();
  });

  it('só a ação explícita cria', async () => {
    criar.mockResolvedValue(convite('ABC234'));
    const { getByTestId } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(getByTestId('codigo').props.children).toBe('ABC234');
  });
});

describe('idempotência do toque', () => {
  it('dois toques com a Promise pendente chamam UMA vez', async () => {
    let resolver: (v: any) => void = () => {};
    criar.mockReturnValue(new Promise((r) => { resolver = r; }));
    const { getByTestId } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);

    fireEvent.press(getByTestId('gerar-convite'));
    fireEvent.press(getByTestId('gerar-convite'));
    fireEvent.press(getByTestId('gerar-convite'));
    expect(criar).toHaveBeenCalledTimes(1);

    await act(async () => { resolver(convite('ABC234')); });
  });
});

describe('rotação', () => {
  it('o código antigo DESAPARECE quando o novo chega', async () => {
    criar.mockResolvedValueOnce(convite('AAA222')).mockResolvedValueOnce(convite('BBB333'));
    const { getByTestId, queryByText } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);

    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => expect(getByTestId('codigo').props.children).toBe('AAA222'));

    fireEvent.press(getByTestId('rotacionar'));
    await waitFor(() => expect(getByTestId('codigo').props.children).toBe('BBB333'));
    expect(queryByText('AAA222')).toBeNull();
    expect(getByTestId('link').props.children).toContain('BBB333');
  });

  it('o link exibido é o link canônico do código exibido', async () => {
    criar.mockResolvedValue(convite('ABC234'));
    const { getByTestId } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => expect(getByTestId('link').props.children)
      .toBe('forcaapp://treino-conjunto/ABC234'));
  });
});

describe('expiração — relógio injetado, sem esperar 15 minutos', () => {
  it('mostra o tempo restante e desabilita compartilhar quando expira', async () => {
    criar.mockResolvedValue(convite('ABC234'));
    const { getByTestId, getByText, rerender } = render(
      <JointInviteScreen navigation={nav()} agora={() => T0} />,
    );
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('convite-pronto'));
    expect(getByTestId('expiracao')).toBeTruthy();

    // Passa do prazo SEM esperar: o relógio é injetado.
    rerender(<JointInviteScreen navigation={nav()} agora={() => T0 + 20 * 60_000} />);

    // Expirado: o aviso muda e compartilhar um convite morto fica bloqueado —
    // mandar um link que não funciona é pior do que não mandar.
    expect(getByText('expirado')).toBeTruthy();
    expect(getByTestId('compartilhar').props.accessibilityState)
      .toMatchObject({ disabled: true });
    // E a saída existe: gerar outro.
    expect(getByTestId('rotacionar')).toBeTruthy();
  });
});

describe('compartilhar', () => {
  it('chama Share.share UMA vez, com o link exibido', async () => {
    criar.mockResolvedValue(convite('ABC234'));
    const { getByTestId } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('compartilhar'));

    fireEvent.press(getByTestId('compartilhar'));
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
    expect((Share.share as jest.Mock).mock.calls[0][0].message)
      .toContain('forcaapp://treino-conjunto/ABC234');
  });

  it('CANCELAR não é erro: nada de mensagem vermelha', async () => {
    criar.mockResolvedValue(convite('ABC234'));
    (Share.share as jest.Mock).mockResolvedValue({ action: Share.dismissedAction });
    const { getByTestId, queryByTestId } = render(
      <JointInviteScreen navigation={nav()} agora={() => T0} />,
    );
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('compartilhar'));

    fireEvent.press(getByTestId('compartilhar'));
    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    expect(queryByTestId('erro-convite')).toBeNull();
  });

  it('exceção real vira erro acessível, e não navega', async () => {
    criar.mockResolvedValue(convite('ABC234'));
    (Share.share as jest.Mock).mockRejectedValue(new Error('sem app de compartilhamento'));
    const navegacao = nav();
    const { getByTestId } = render(<JointInviteScreen navigation={navegacao} agora={() => T0} />);
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('compartilhar'));

    fireEvent.press(getByTestId('compartilhar'));
    await waitFor(() => expect(getByTestId('erro-convite')).toBeTruthy());
    expect(navegacao.navigate).not.toHaveBeenCalled();
  });
});

describe('falha ao gerar', () => {
  it('mostra erro e não deixa a tela num meio-termo', async () => {
    criar.mockRejectedValue(new Error('sem conexão'));
    const { getByTestId, queryByTestId } = render(
      <JointInviteScreen navigation={nav()} agora={() => T0} />,
    );
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => expect(getByTestId('erro-convite')).toBeTruthy());
    expect(queryByTestId('convite-pronto')).toBeNull();
  });
});
