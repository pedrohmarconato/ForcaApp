// __tests__/jointPrivacidadeM4.test.tsx
// Treino Conjunto 2.0 — Sprint 02. M4 — o que a cópia omite não pode reaparecer.
//
// Verificar ausência de campos num mock vazio é falso positivo: o teste passa
// porque não havia nada para vazar. Aqui a fonte é SEMEADA com sentinelas —
// valores que só existem no plano do parceiro — e o teste falha se:
//
//   1. a UI/hook consultarem `profiles` de outro usuário;
//   2. consultarem plano/sessão/exercício/série alheios;
//   3. consultarem detalhe pelo ID-FONTE do parceiro em vez do id da PRÓPRIA cópia;
//   4. qualquer sentinela aparecer na árvore renderizada.
//
// Nas duas direções: host_plan (o convidado recebe) e guest_plan (o host recebe).

const mockSentinelas = {
  carga: 'SENTINELA_CARGA_137',
  nota: 'SENTINELA_NOTA_dor_no_ombro_direito',
  nomeOriginal: 'SENTINELA_NOME_ORIGINAL',
  lesao: 'SENTINELA_LESAO_ombro',
};
const mockIdFonte = 'ps-FONTE-DO-PARCEIRO';

const mockLinhaContaminada = {
  id: mockIdFonte,
  title: 'Peito do parceiro',
  muscle_groups: ['Peito'],
  status: 'pending',
  joint_session_id: 'js-1',
  target_load_kg: mockSentinelas.carga,
  notes: mockSentinelas.nota,
  name_original: mockSentinelas.nomeOriginal,
  injury_flags: [mockSentinelas.lesao],
  full_name: mockSentinelas.nota,
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));

// Espiona TODA consulta que sair pelo cliente Supabase — e, quando alguém
// consultar a FONTE do parceiro, DEVOLVE as sentinelas. Sem isso o mock volta
// vazio e o teste comprova a ausência de algo que nunca esteve lá: era esse o
// falso positivo central do F17.
const consultas: { tabela: string; filtros: any[] }[] = [];
jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    from: jest.fn((tabela: string) => {
      const registro = { tabela, filtros: [] as any[] };
      consultas.push(registro);
      const b: any = {};
      const chain = (nome: string) => (...args: any[]) => { registro.filtros.push([nome, ...args]); return b; };
      for (const m of ['select', 'eq', 'is', 'not', 'gt', 'order', 'limit', 'range', 'in', 'maybeSingle']) b[m] = jest.fn(chain(m));

      // A FONTE existe e é contaminada: quem perguntar por ela RECEBE as
      // sentinelas. É o que dá dente ao teste — se a UI consultar, vaza.
      const pediuAFonte = () =>
        JSON.stringify(registro.filtros).includes(mockIdFonte)
        || ['profiles', 'planned_exercises', 'planned_sets', 'training_plans'].includes(tabela);
      const resposta = () => (pediuAFonte()
        ? { data: [mockLinhaContaminada], error: null }
        : { data: [], error: null });

      b.single = jest.fn(() => Promise.resolve(pediuAFonte()
        ? { data: mockLinhaContaminada, error: null }
        : { data: null, error: null }));
      b.then = (res: any, rej: any) => Promise.resolve(resposta()).then(res, rej);
      return b;
    }),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    channel: jest.fn(() => { const c: any = { on: () => c, subscribe: () => c }; return c; }),
    removeChannel: jest.fn(),
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u-guest' } } })) },
  },
}));

jest.mock('../src/services/jointSessionRealtime', () => ({
  __esModule: true,
  subscribeToJointSession: jest.fn(() => ({ refresh: async () => {}, unsubscribe: () => {} })),
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { JointLobbyView } from '../src/screens/JointLobbyScreen';
import * as repoReal from '../src/services/jointSessionRepository';

// ---- SENTINELAS: só existem no plano do parceiro ----
const SENTINELAS = mockSentinelas;
const ID_FONTE_DO_PARCEIRO = mockIdFonte;
const ID_DA_MINHA_COPIA = 'ps-MINHA-COPIA';


const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role, plannedSessionId: null, sessionLogId: null, ready: false,
  queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString(), ...over,
});

const estado = (over: any = {}) => ({
  id: 'js-1', hostUserId: HOST, guestUserId: GUEST, mode: 'host_plan',
  muscleGroup: null, status: 'lobby', pauseReason: null,
  currentTurnUserId: null, turnSeq: 0,
  participants: [
    parte(HOST, 'host', { plannedSessionId: ID_FONTE_DO_PARCEIRO }),
    parte(GUEST, 'guest'),
  ],
  ...over,
});

/** A minha cópia — sem nenhuma sentinela, que é o ponto. */
const minhaCopia = {
  id: ID_DA_MINHA_COPIA, title: 'Peito A', muscleGroups: ['Peito'],
  status: 'pending', jointSessionId: 'js-1',
};

const abrir = (meuUserId: string, minhasSessoes: any[] = [minhaCopia]) =>
  render(
    <JointLobbyView
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as any}
      route={{ params: { jointSessionId: 'js-1' } }}
      meuUserId={meuUserId}
      minhasSessoes={minhasSessoes}
      confirmar={jest.fn()}
      anunciar={jest.fn()}
      agora={() => T0}
    />,
  );

beforeEach(() => {
  consultas.length = 0;
  jest.clearAllMocks();
  jest.spyOn(repoReal, 'getJointSessionSnapshot').mockResolvedValue(estado() as any);
  jest.spyOn(repoReal, 'getJointPartnerProfile').mockResolvedValue({
    userId: HOST, displayName: 'Ana', avatarUrl: null,
  });
  jest.spyOn(repoReal, 'getJointInviteForHost').mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

const arvore = (utils: any) => JSON.stringify(utils.toJSON());

describe('M4 — direção host_plan: o CONVIDADO recebe a estrutura', () => {
  it('nenhuma sentinela da fonte aparece na árvore', async () => {
    const utils = abrir(GUEST);
    await waitFor(() => utils.getByTestId('pendencia'));
    const texto = arvore(utils);
    for (const [nome, valor] of Object.entries(SENTINELAS)) {
      expect({ nome, vazou: texto.includes(valor) }).toEqual({ nome, vazou: false });
    }
  });

  it('a UI NUNCA consulta pelo id-fonte do parceiro', async () => {
    const utils = abrir(GUEST);
    await waitFor(() => utils.getByTestId('pendencia'));
    const filtrosComFonte = consultas.flatMap((c) =>
      c.filtros.filter((f) => JSON.stringify(f).includes(ID_FONTE_DO_PARCEIRO)),
    );
    expect(filtrosComFonte).toEqual([]);
  });

  it('a UI não consulta `profiles` de ninguém — o nome vem da RPC mínima', async () => {
    const utils = abrir(GUEST);
    await waitFor(() => utils.getByTestId('pendencia'));
    expect(consultas.filter((c) => c.tabela === 'profiles')).toEqual([]);
    expect(repoReal.getJointPartnerProfile).toHaveBeenCalledWith('js-1');
  });

  it('a UI não consulta plano, exercícios ou séries alheios', async () => {
    const utils = abrir(GUEST);
    await waitFor(() => utils.getByTestId('pendencia'));
    const proibidas = ['training_plans', 'planned_exercises', 'planned_sets'];
    expect(consultas.filter((c) => proibidas.includes(c.tabela))).toEqual([]);
  });
});

describe('M4 — direção guest_plan: o HOST recebe a estrutura', () => {
  beforeEach(() => {
    (repoReal.getJointSessionSnapshot as jest.Mock).mockResolvedValue(
      estado({
        mode: 'guest_plan',
        participants: [
          parte(HOST, 'host'),
          parte(GUEST, 'guest', { plannedSessionId: ID_FONTE_DO_PARCEIRO }),
        ],
      }) as any,
    );
  });

  it('nenhuma sentinela aparece para o host, e o id-fonte não é consultado', async () => {
    const utils = abrir(HOST);
    await waitFor(() => utils.getByTestId('pendencia'));
    const texto = arvore(utils);
    for (const valor of Object.values(SENTINELAS)) expect(texto).not.toContain(valor);
    const comFonte = consultas.flatMap((c) =>
      c.filtros.filter((f) => JSON.stringify(f).includes(ID_FONTE_DO_PARCEIRO)),
    );
    expect(comFonte).toEqual([]);
  });
});

describe('a armadilha está ARMADA — o mock devolve as sentinelas se perguntarem', () => {
  it('CONTROLE: consultar a fonte do parceiro RETORNA os quatro valores proibidos', async () => {
    // Sem este controle, os testes acima poderiam passar por o mock devolver
    // vazio — comprovando a ausência de algo que nunca esteve lá. Era esse o
    // falso positivo do F17.
    const { supabase } = require('../src/config/supabaseClient');
    const r = await supabase.from('planned_sessions').select('*').eq('id', ID_FONTE_DO_PARCEIRO);
    const texto = JSON.stringify(r.data);
    for (const [nome, valor] of Object.entries(SENTINELAS)) {
      expect({ nome, presente: texto.includes(valor as string) })
        .toEqual({ nome, presente: true });
    }
  });

  it('CONTROLE: consultar `profiles` também devolveria dado alheio', async () => {
    const { supabase } = require('../src/config/supabaseClient');
    const r = await supabase.from('profiles').select('*').eq('id', 'u-host');
    expect(JSON.stringify(r.data)).toContain(SENTINELAS.nota);
  });
});

describe('a sentinela funciona — o teste sabe detectar vazamento', () => {
  it('se a sentinela ESTIVER na própria sessão, o detector a encontra', async () => {
    // Controle negativo: sem isto, os testes acima poderiam passar por não
    // haver nada para achar, e não por a UI proteger o dado.
    // Usa `each_own`, onde o seletor da própria sessão é renderizado.
    (repoReal.getJointSessionSnapshot as jest.Mock).mockResolvedValue(
      estado({ mode: 'each_own', muscleGroup: 'Peito',
        participants: [parte(HOST, 'host'), parte(GUEST, 'guest')] }) as any,
    );
    const comSentinela = {
      ...minhaCopia,
      title: SENTINELAS.nota,
      muscleGroups: ['Peito'],
    };
    const utils = abrir(GUEST, [comSentinela]);
    await waitFor(() => utils.getByTestId('pendencia'));
    expect(arvore(utils)).toContain(SENTINELAS.nota);
  });
});
