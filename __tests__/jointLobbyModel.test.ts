// __tests__/jointLobbyModel.test.ts
// Treino Conjunto 2.0 — Sprint 02. Modelo puro do lobby.
//
// Modos de falha cobertos:
//  1. a tela anunciar três pendências ao mesmo tempo e ninguém saber o que fazer;
//  2. oferecer ao convidado um controle que a RPC recusa (só o host muda modo);
//  3. listar sessão que o servidor vai rejeitar — o usuário escolhe e leva erro;
//  4. a incompatibilidade citar o que o parceiro tem, dado que ninguém enxerga;
//  5. tratar conexão local e ausência do parceiro como o mesmo sinal;
//  6. oferecer uma ação incompatível com o estado (ex.: "tentar de novo" numa
//     sessão cancelada).

import type { JointSessionState } from '../src/engine/jointSessionModel';
import {
  ACAO_DA_SITUACAO,
  incompatibilidadeDe,
  meusGrupos,
  pendenciaAtual,
  permissoesDe,
  presencaDoParceiro,
  sessoesElegiveis,
  situacaoDoLobby,
  type SessaoElegivel,
} from '../src/engine/jointLobbyModel';

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role,
  plannedSessionId: null, sessionLogId: null,
  ready: false, queueFinishedAt: null, completedAt: null,
  lastSeenAt: new Date(T0).toISOString(),
  ...over,
});

const lobby = (over: Partial<JointSessionState> = {}): JointSessionState => ({
  id: 'js-1', hostUserId: HOST, guestUserId: GUEST,
  mode: null, muscleGroup: null, status: 'lobby',
  pauseReason: null, currentTurnUserId: null, turnSeq: 0,
  participants: [parte(HOST, 'host'), parte(GUEST, 'guest')],
  ...over,
});

const sessao = (over: Partial<SessaoElegivel> = {}): SessaoElegivel => ({
  id: 's-1', title: 'Peito A', muscleGroups: ['Peito'],
  status: 'pending', jointSessionId: null, ...over,
});

describe('pendência: uma só, em ordem de precedência', () => {
  it('sem convidado, espera o convidado', () => {
    expect(pendenciaAtual(lobby({ guestUserId: null, status: 'inviting' }), HOST))
      .toBe('aguardando_parceiro_entrar');
  });
  it('sem modo, espera o modo', () => {
    expect(pendenciaAtual(lobby(), HOST)).toBe('aguardando_modo');
  });
  it('each_own sem grupo, espera o grupo', () => {
    expect(pendenciaAtual(lobby({ mode: 'each_own' }), HOST)).toBe('aguardando_grupo');
  });
  it('minha sessão vem antes da do parceiro', () => {
    expect(pendenciaAtual(lobby({ mode: 'host_plan' }), HOST)).toBe('minha_sessao');
  });
  it('com a minha escolhida, espera a do parceiro', () => {
    const s = lobby({ mode: 'host_plan',
      participants: [parte(HOST, 'host', { plannedSessionId: 'a' }), parte(GUEST, 'guest')] });
    expect(pendenciaAtual(s, HOST)).toBe('sessao_do_parceiro');
  });
  it('com as duas escolhidas, espera a minha prontidão', () => {
    const s = lobby({ mode: 'host_plan', participants: [
      parte(HOST, 'host', { plannedSessionId: 'a' }),
      parte(GUEST, 'guest', { plannedSessionId: 'b' })] });
    expect(pendenciaAtual(s, HOST)).toBe('minha_prontidao');
  });
  it('pronto eu, espera o parceiro', () => {
    const s = lobby({ mode: 'host_plan', participants: [
      parte(HOST, 'host', { plannedSessionId: 'a', ready: true }),
      parte(GUEST, 'guest', { plannedSessionId: 'b' })] });
    expect(pendenciaAtual(s, HOST)).toBe('prontidao_do_parceiro');
  });
});

describe('permissões — o convidado não recebe controle que a RPC recusa', () => {
  it('só o host escolhe modo e grupo', () => {
    const s = lobby({ mode: 'each_own' });
    expect(permissoesDe(s, HOST).podeEscolherModo).toBe(true);
    expect(permissoesDe(s, GUEST).podeEscolherModo).toBe(false);
    expect(permissoesDe(s, GUEST).podeEscolherGrupo).toBe(false);
  });
  it('em host_plan, só o host confirma a fonte e só o convidado materializa', () => {
    const s = lobby({ mode: 'host_plan' });
    expect(permissoesDe(s, HOST).podeConfirmarSessaoPropria).toBe(true);
    expect(permissoesDe(s, HOST).podeMaterializarCopia).toBe(false);
    expect(permissoesDe(s, GUEST).podeMaterializarCopia).toBe(true);
    expect(permissoesDe(s, GUEST).podeConfirmarSessaoPropria).toBe(false);
  });
  it('em each_own, os dois confirmam a própria', () => {
    const s = lobby({ mode: 'each_own', muscleGroup: 'Peito' });
    expect(permissoesDe(s, HOST).podeConfirmarSessaoPropria).toBe(true);
    expect(permissoesDe(s, GUEST).podeConfirmarSessaoPropria).toBe(true);
  });
  it('prontidão exige sessão confirmada', () => {
    expect(permissoesDe(lobby({ mode: 'each_own' }), HOST).podeFicarPronto).toBe(false);
    const s = lobby({ mode: 'each_own', participants: [
      parte(HOST, 'host', { plannedSessionId: 'a' }), parte(GUEST, 'guest')] });
    expect(permissoesDe(s, HOST).podeFicarPronto).toBe(true);
  });
});

describe('elegibilidade — só o que o servidor aceitaria', () => {
  it('recusa status terminal', () => {
    const lista = [sessao({ id: 'ok' }), sessao({ id: 'x', status: 'completed' }),
      sessao({ id: 'y', status: 'skipped' })];
    expect(sessoesElegiveis(lista, 'Peito').map((s) => s.id)).toEqual(['ok']);
  });
  it('recusa sessão presa em OUTRO treino conjunto, aceita a deste', () => {
    const lista = [sessao({ id: 'alheia', jointSessionId: 'outra' }),
      sessao({ id: 'minha', jointSessionId: 'js-1' })];
    expect(sessoesElegiveis(lista, 'Peito', 'js-1').map((s) => s.id)).toEqual(['minha']);
  });
  it('filtra por grupo ignorando acento e caixa', () => {
    const lista = [sessao({ id: 'a', muscleGroups: ['Tríceps'] }), sessao({ id: 'b' })];
    expect(sessoesElegiveis(lista, 'TRICEPS').map((s) => s.id)).toEqual(['a']);
  });
  it('meusGrupos não inventa grupo de sessão inelegível', () => {
    const lista = [sessao({ muscleGroups: ['Peito'] }),
      sessao({ id: 'x', status: 'completed', muscleGroups: ['Costas'] })];
    expect(meusGrupos(lista)).toEqual(['Peito']);
  });
});

describe('incompatibilidade — nunca fala do que o parceiro tem', () => {
  const s = lobby({ mode: 'each_own', muscleGroup: 'Costas' });
  const minhas = [sessao({ muscleGroups: ['Peito'] })];

  it('devolve o grupo pedido e OS MEUS grupos', () => {
    const inc = incompatibilidadeDe(s, GUEST, minhas);
    expect(inc).toMatchObject({ grupoPedido: 'Costas', meusGrupos: ['Peito'] });
    expect(JSON.stringify(inc)).not.toContain('parceiro');
  });
  it('o host pode trocar; o convidado não', () => {
    expect(incompatibilidadeDe(s, HOST, minhas)?.possoTrocar).toBe(true);
    expect(incompatibilidadeDe(s, GUEST, minhas)?.possoTrocar).toBe(false);
  });
  it('com sessão elegível, não há incompatibilidade', () => {
    expect(incompatibilidadeDe(s, HOST, [sessao({ muscleGroups: ['Costas'] })])).toBeNull();
  });
});

describe('conexão local × presença do parceiro', () => {
  it('presença vem do relógio, não do canal', () => {
    const s = lobby();
    expect(presencaDoParceiro(s, HOST, T0 + 1_000)).toBe('presente');
    expect(presencaDoParceiro(s, HOST, T0 + 61_000)).toBe('ausente');
  });
  it('sem estado, é desconhecida — não se afirma ausência sem dado', () => {
    expect(presencaDoParceiro(null, HOST, T0)).toBe('desconhecida');
  });
});

describe('situação e ação — nenhuma oferece o que não cabe', () => {
  it.each([
    ['carregando', { carregando: true, state: null }],
    ['nao_encontrado', { carregando: false, state: null }],
    ['nao_e_seu', { carregando: false, state: null, erroMotivo: 'nao_autorizado' }],
    ['sem_conexao', { carregando: false, state: null, erroKind: 'transport' as const }],
    ['cancelado', { carregando: false, state: lobby({ status: 'canceled' }) }],
    ['abandonado', { carregando: false, state: lobby({ status: 'abandoned' }) }],
    ['concluido', { carregando: false, state: lobby({ status: 'completed' }) }],
    ['iniciado', { carregando: false, state: lobby({ status: 'active' }) }],
    ['lobby', { carregando: false, state: lobby() }],
  ])('%s', (esperado, params) => {
    expect(situacaoDoLobby(params as any)).toBe(esperado);
  });

  it('not_found vem do snapshot NULO, não de um errcode', () => {
    expect(situacaoDoLobby({ carregando: false, state: null })).toBe('nao_encontrado');
  });

  it('cada situação tem exatamente uma ação, e nenhuma repete a falha', () => {
    expect(ACAO_DA_SITUACAO.cancelado).toBe('criar_ou_entrar');
    expect(ACAO_DA_SITUACAO.concluido).toBe('ver_historico');
    expect(ACAO_DA_SITUACAO.nao_e_seu).toBe('voltar_home');
    expect(ACAO_DA_SITUACAO.sem_conexao).toBe('tentar_de_novo');
    // "tentar de novo" só existe onde tentar de novo pode funcionar.
    expect(ACAO_DA_SITUACAO.nao_encontrado).not.toBe('tentar_de_novo');
    expect(ACAO_DA_SITUACAO.cancelado).not.toBe('tentar_de_novo');
  });
});
