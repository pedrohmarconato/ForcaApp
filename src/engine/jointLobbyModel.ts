// src/engine/jointLobbyModel.ts
// Treino Conjunto 2.0 — Sprint 02. Modelo PURO do lobby: sem I/O, sem React.
//
// Responde às três perguntas que a tela precisa fazer o tempo todo — o que falta
// para começar, o que EU posso fazer agora, e por que não dá — sem que cada
// componente invente a própria resposta.
//
// Uma regra atravessa o arquivo: **nada aqui deduz nada sobre o parceiro que o
// servidor não tenha entregue**. A RLS não deixa ninguém ler o plano do outro,
// então o modelo trabalha com "o parceiro confirmou?" e nunca com "o que o
// parceiro tem".

import type {
  JointMode,
  JointParticipantState,
  JointSessionState,
} from './jointSessionModel';
import { parceiroDe, participanteDe, presencaPerdida, PRESENCA_TTL_MS } from './jointSessionModel';

// ============================================================
// Conexão local × presença do parceiro — sinais DIFERENTES
// ============================================================

/** Estado do canal deste aparelho. Não diz nada sobre o parceiro. */
export type ConexaoLocal = 'conectado' | 'reconectando';

/** O que a tela mostra sobre o outro lado. Derivado de last_seen_at + TTL. */
export type PresencaDoParceiro = 'presente' | 'ausente' | 'desconhecida';

/**
 * Presença do parceiro pelo relógio, não por evento.
 *
 * Existe separada de `ConexaoLocal` porque são coisas distintas: meu canal pode
 * cair sem que o parceiro tenha sumido, e o parceiro pode sumir sem que nada
 * chegue ao meu canal — é por isso que a tela precisa de um timer, não só de
 * eventos.
 */
export const presencaDoParceiro = (
  state: JointSessionState | null,
  meuId: string,
  agoraMs: number,
  ttlMs: number = PRESENCA_TTL_MS,
): PresencaDoParceiro => {
  if (!state) return 'desconhecida';
  const parceiro = parceiroDe(state, meuId);
  if (!parceiro) return 'desconhecida';
  return presencaPerdida(parceiro.lastSeenAt, agoraMs, ttlMs) ? 'ausente' : 'presente';
};

// ============================================================
// O que falta para começar
// ============================================================

export type Pendencia =
  | 'aguardando_parceiro_entrar'
  | 'aguardando_modo'
  | 'aguardando_grupo'
  | 'minha_sessao'
  | 'sessao_do_parceiro'
  | 'minha_prontidao'
  | 'prontidao_do_parceiro'
  | 'nenhuma';

/**
 * A ÚNICA pendência que a tela deve anunciar, em ordem de precedência. Listar
 * três coisas ao mesmo tempo é como o usuário deixa de saber o que fazer.
 */
export const pendenciaAtual = (
  state: JointSessionState | null,
  meuId: string,
): Pendencia => {
  if (!state) return 'aguardando_parceiro_entrar';
  if (state.status === 'inviting' || !state.guestUserId) return 'aguardando_parceiro_entrar';
  if (state.status !== 'lobby') return 'nenhuma';
  if (!state.mode) return 'aguardando_modo';
  if (state.mode === 'each_own' && !state.muscleGroup) return 'aguardando_grupo';

  const eu = participanteDe(state, meuId);
  const parceiro = parceiroDe(state, meuId);
  if (!eu?.plannedSessionId) return 'minha_sessao';
  if (!parceiro?.plannedSessionId) return 'sessao_do_parceiro';
  if (!eu.ready) return 'minha_prontidao';
  if (!parceiro.ready) return 'prontidao_do_parceiro';
  return 'nenhuma';
};

export const ROTULO_PENDENCIA: Record<Pendencia, string> = {
  aguardando_parceiro_entrar: 'Aguarde seu parceiro entrar com o código',
  aguardando_modo: 'Quem convidou escolhe o que vocês vão treinar',
  aguardando_grupo: 'Quem convidou escolhe o grupo muscular',
  minha_sessao: 'Escolha o seu treino',
  sessao_do_parceiro: 'Aguarde seu parceiro escolher o treino dele',
  minha_prontidao: 'Confirme que você está pronto',
  prontidao_do_parceiro: 'Aguarde seu parceiro confirmar',
  nenhuma: 'Tudo pronto',
};

// ============================================================
// O que EU posso fazer
// ============================================================

export type Permissoes = {
  podeEscolherModo: boolean;
  podeEscolherGrupo: boolean;
  podeConfirmarSessaoPropria: boolean;
  podeMaterializarCopia: boolean;
  podeFicarPronto: boolean;
};

/**
 * Só o anfitrião muda modo e grupo — é o que `set_joint_session_mode` aceita.
 * Oferecer o controle ao convidado seria desenhar um botão que a RPC recusa.
 */
export const permissoesDe = (
  state: JointSessionState | null,
  meuId: string,
): Permissoes => {
  const vazio: Permissoes = {
    podeEscolherModo: false,
    podeEscolherGrupo: false,
    podeConfirmarSessaoPropria: false,
    podeMaterializarCopia: false,
    podeFicarPronto: false,
  };
  if (!state || state.status !== 'lobby') return vazio;

  const souHost = state.hostUserId === meuId;
  const eu = participanteDe(state, meuId);
  const donoDaFonte = fonteDoModo(state.mode);
  const meuPapel = eu?.role ?? null;

  return {
    podeEscolherModo: souHost,
    podeEscolherGrupo: souHost && state.mode === 'each_own',
    podeConfirmarSessaoPropria:
      state.mode != null &&
      (state.mode === 'each_own' || meuPapel === donoDaFonte),
    podeMaterializarCopia:
      state.mode != null && state.mode !== 'each_own' && meuPapel !== donoDaFonte,
    podeFicarPronto: Boolean(eu?.plannedSessionId),
  };
};

/** Quem é o dono da estrutura neste modo. `null` em `each_own`. */
export const fonteDoModo = (mode: JointMode | null): 'host' | 'guest' | null => {
  if (mode === 'host_plan') return 'host';
  if (mode === 'guest_plan') return 'guest';
  return null;
};

// ============================================================
// Elegibilidade — só do próprio lado
// ============================================================

export type SessaoElegivel = {
  id: string;
  title: string;
  muscleGroups: string[];
  status: string;
  jointSessionId: string | null;
};

const normalizar = (g: string): string =>
  g.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * As sessões que o SERVIDOR aceitaria confirmar, filtradas pelo grupo.
 *
 * Os três filtros vêm de `confirm_joint_participant_session` (0026): status em
 * `pending`/`in_progress`, não terminal, e não presa a outro treino conjunto.
 * Mostrar uma opção que a RPC vai recusar é pior do que não mostrar: o usuário
 * escolhe, leva erro, e não entende o que fez de errado.
 */
export const sessoesElegiveis = (
  sessoes: readonly SessaoElegivel[],
  grupo: string | null,
  jointSessionId: string | null = null,
): SessaoElegivel[] => {
  const alvo = grupo ? normalizar(grupo) : null;
  return sessoes.filter((s) => {
    if (s.status !== 'pending' && s.status !== 'in_progress') return false;
    if (s.jointSessionId != null && s.jointSessionId !== jointSessionId) return false;
    if (!alvo) return true;
    return s.muscleGroups.some((g) => normalizar(String(g)) === alvo);
  });
};

/** Os grupos que EU tenho — nunca os do parceiro. */
export const meusGrupos = (sessoes: readonly SessaoElegivel[]): string[] => {
  const vistos = new Map<string, string>();
  for (const s of sessoesElegiveis(sessoes, null)) {
    for (const g of s.muscleGroups) {
      const chave = normalizar(String(g));
      if (chave && !vistos.has(chave)) vistos.set(chave, String(g));
    }
  }
  return [...vistos.values()];
};

export type Incompatibilidade = {
  grupoPedido: string;
  meusGrupos: string[];
  /** Host tem controle real; convidado só pode pedir. */
  possoTrocar: boolean;
};

/**
 * Por que não dá — com os dados de QUEM está olhando.
 *
 * Nunca menciona o que o parceiro tem, porque ninguém tem essa visibilidade. A
 * saída do convidado é pedir; a do host é trocar.
 */
export const incompatibilidadeDe = (
  state: JointSessionState | null,
  meuId: string,
  minhasSessoes: readonly SessaoElegivel[],
): Incompatibilidade | null => {
  if (!state || state.mode !== 'each_own' || !state.muscleGroup) return null;
  if (sessoesElegiveis(minhasSessoes, state.muscleGroup, state.id).length > 0) return null;
  return {
    grupoPedido: state.muscleGroup,
    meusGrupos: meusGrupos(minhasSessoes),
    possoTrocar: state.hostUserId === meuId,
  };
};

// ============================================================
// Estados de erro da tela
// ============================================================

export type SituacaoDoLobby =
  | 'carregando'
  | 'lobby'
  | 'iniciado'
  | 'nao_encontrado'
  | 'nao_e_seu'
  | 'cancelado'
  | 'abandonado'
  | 'concluido'
  | 'sem_conexao';

/**
 * `not_found` vem do snapshot devolvendo **null**, não de um errcode: quem
 * consulta uma sessão que não existe simplesmente não recebe linha.
 */
export const situacaoDoLobby = (params: {
  carregando: boolean;
  state: JointSessionState | null;
  erroMotivo?: string | null;
  erroKind?: 'transport' | 'server' | null;
}): SituacaoDoLobby => {
  const { carregando, state, erroMotivo, erroKind } = params;
  if (erroKind === 'transport') return 'sem_conexao';
  if (erroMotivo === 'nao_autorizado') return 'nao_e_seu';
  if (carregando) return 'carregando';
  if (!state) return 'nao_encontrado';
  switch (state.status) {
    case 'canceled': return 'cancelado';
    case 'abandoned': return 'abandonado';
    case 'completed': return 'concluido';
    case 'active':
    case 'paused': return 'iniciado';
    default: return 'lobby';
  }
};

export type AcaoDaSituacao = 'voltar_home' | 'criar_ou_entrar' | 'ver_historico' | 'tentar_de_novo' | 'nenhuma';

/** Cada situação oferece UMA saída, e nenhuma oferece o que não cabe. */
export const ACAO_DA_SITUACAO: Record<SituacaoDoLobby, AcaoDaSituacao> = {
  carregando: 'nenhuma',
  lobby: 'nenhuma',
  iniciado: 'nenhuma',
  nao_encontrado: 'voltar_home',
  nao_e_seu: 'voltar_home',
  cancelado: 'criar_ou_entrar',
  abandonado: 'criar_ou_entrar',
  concluido: 'ver_historico',
  sem_conexao: 'tentar_de_novo',
};

export const MENSAGEM_DA_SITUACAO: Record<SituacaoDoLobby, string> = {
  carregando: 'Carregando…',
  lobby: '',
  iniciado: 'Treino iniciado',
  nao_encontrado: 'Este treino não existe mais',
  nao_e_seu: 'Este treino não é seu',
  cancelado: 'Convite cancelado',
  abandonado: 'Treino encerrado',
  concluido: 'Treino concluído',
  sem_conexao: 'Sem conexão',
};
