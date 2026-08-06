// __tests__/jointTrainingGate.test.tsx
// Achado P1 (review 2026-08-06): isJointTrainingEnabled() só tinha UM chamador
// (HomeScreen.tsx) — ele afastava o card da Home, mas a ROTA continuava
// registrada sem condição nenhuma em MainNavigator.tsx (JointInvite/JointJoin)
// e mapeada sem checagem em linkingConfig.ts (treino-conjunto/novo,
// treino-conjunto/:code). Com a flag OFF em produção, um convidado que abre o
// deep link cai direto no fluxo joint sem a migration 0026 aplicada.
//
// Decisão do dono: rota bloqueada mostra TELA DE AVISO (não redirect
// silencioso). O guard vive no REGISTRO da tela no MainNavigator — cobre
// navegação interna e deep link, porque os dois caem no mesmo Screen.
//
// CONTROLE primeiro: prova que hoje, sem o guard, a tela real monta mesmo com
// a flag OFF — é exatamente o achado. Continua valendo DEPOIS do fix também,
// porque a tela em si nunca teve — e não precisa ter — checagem própria: o
// guard é externo, na camada de registro.

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  createJointSession: jest.fn(),
  joinJointSession: jest.fn(),
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import JointInviteScreen from '../src/screens/JointInviteScreen';
import JointJoinScreen from '../src/screens/JointJoinScreen';

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const nav = () => ({ goBack: jest.fn(), navigate: jest.fn() });

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('CONTROLE — a tela em si não se protege (o guard tem que estar no registro)', () => {
  it('JointInviteScreen renderizado direto monta o fluxo real mesmo com a flag OFF', () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'false';
    const { getByTestId } = render(<JointInviteScreen navigation={nav()} />);
    expect(getByTestId('gerar-convite')).toBeTruthy();
  });

  it('JointJoinScreen renderizado direto monta o fluxo real mesmo com a flag OFF', () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'false';
    const { getByTestId } = render(<JointJoinScreen navigation={nav()} />);
    expect(getByTestId('campo-codigo')).toBeTruthy();
  });
});

describe('MainNavigator registra as duas rotas através do guard central (achado P1)', () => {
  const src = ler('src/navigation/MainNavigator.tsx');

  it('JointInvite é registrado através de withJointTrainingGate', () => {
    expect(src).toMatch(/name="JointInvite"\s+component=\{withJointTrainingGate\(JointInviteScreen\)/);
  });

  it('JointJoin é registrado através de withJointTrainingGate', () => {
    expect(src).toMatch(/name="JointJoin"\s+component=\{withJointTrainingGate\(JointJoinScreen\)/);
  });
});

describe('withJointTrainingGate — flag OFF mostra o aviso; o fluxo real NÃO monta', () => {
  it('JointInvite gateado: com a flag OFF, "gerar-convite" não monta e o aviso aparece', () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointInviteScreen);
    const { queryByTestId, getByTestId } = render(<Gated navigation={nav()} />);

    expect(queryByTestId('gerar-convite')).toBeNull();
    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
  });

  it('JointJoin gateado: com a flag OFF, "campo-codigo" não monta e o aviso aparece', () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointJoinScreen);
    const { queryByTestId, getByTestId } = render(<Gated navigation={nav()} />);

    expect(queryByTestId('campo-codigo')).toBeNull();
    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
  });

  it('o botão "Voltar à Home" do aviso navega para HomeMain, sem redirect silencioso', () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointInviteScreen);
    const n = nav();
    const { getByTestId } = render(<Gated navigation={n} />);

    fireEvent.press(getByTestId('voltar-home'));
    expect(n.navigate).toHaveBeenCalledWith('HomeMain');
  });
});

describe('withJointTrainingGate — flag ON abre o fluxo normal (não regressão)', () => {
  it('JointInvite gateado: com a flag ON, o fluxo real monta e o aviso não aparece', async () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'true';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointInviteScreen);
    const { getByTestId, queryByTestId } = render(<Gated navigation={nav()} />);

    await waitFor(() => expect(getByTestId('gerar-convite')).toBeTruthy());
    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
  });

  it('JointJoin gateado: com a flag ON, o fluxo real monta e o aviso não aparece', async () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'true';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointJoinScreen);
    const { getByTestId, queryByTestId } = render(<Gated navigation={nav()} />);

    await waitFor(() => expect(getByTestId('campo-codigo')).toBeTruthy());
    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
  });
});
