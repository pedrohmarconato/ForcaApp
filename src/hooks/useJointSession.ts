// src/hooks/useJointSession.ts
// Treino Conjunto 2.0 — Sprint 02. Um ciclo de vida só para a sessão conjunta.
//
// As telas não falam com o repositório nem com o canal: falam com este hook.
// Isso existe para que `unsubscribe`, timers e requisições obsoletas tenham UM
// lugar para serem encerrados — quando cada tela cuida do próprio canal, sobra
// sempre um assinante vivo depois que o usuário já saiu.
//
// QUATRO REGRAS QUE ESTE ARQUIVO CUMPRE:
//
//  1. NENHUM OTIMISMO. Ação não mexe no estado local; quem muda o estado é o
//     snapshot ou o evento do servidor. Duas telas que discordam é o modo de
//     falha caro desta feature.
//  2. AÇÃO EM CURSO BLOQUEIA REPETIÇÃO. Dois toques enquanto a Promise está
//     pendente viram UMA chamada.
//  3. RESPOSTA OBSOLETA É DESCARTADA. Trocar de sessão ou desmontar invalida o
//     que estava em voo — senão o estado de uma sessão antiga sobrescreve a nova.
//  4. NADA TÉCNICO CANCELA A DUPLA. `unsubscribe`, ida a background e reconexão
//     nunca chamam `abandon`. Sair do treino é decisão do usuário, confirmada.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JointMode, JointSessionState } from '../engine/jointSessionModel';
import { PRESENCA_TTL_MS } from '../engine/jointSessionModel';
import type { ConexaoLocal, PresencaDoParceiro } from '../engine/jointLobbyModel';
import { presencaDoParceiro } from '../engine/jointLobbyModel';
import * as repo from '../services/jointSessionRepository';
import { subscribeToJointSession } from '../services/jointSessionRealtime';

export type AcaoDoLobby =
  | 'modo'
  | 'confirmarSessao'
  | 'materializar'
  | 'pronto'
  | 'sair'
  | 'rotacionar';

export type ErroDoLobby = {
  motivo: repo.JointErrorMotivo;
  kind: 'transport' | 'server';
  mensagem: string;
} | null;

export type UseJointSession = {
  state: JointSessionState | null;
  parceiro: repo.JointPartnerProfile | null;
  convite: repo.JointInviteDoHost | null;
  carregando: boolean;
  erro: ErroDoLobby;
  conexao: ConexaoLocal;
  presenca: PresencaDoParceiro;
  emCurso: AcaoDoLobby | null;
  recarregar: () => Promise<void>;
  escolherModo: (mode: JointMode, grupo?: string | null) => Promise<void>;
  confirmarSessao: (plannedSessionId: string) => Promise<void>;
  materializarCopia: () => Promise<string | null>;
  definirPronto: (pronto: boolean) => Promise<void>;
  rotacionarConvite: () => Promise<void>;
  sair: () => Promise<boolean>;
};

export type DepsDoHook = {
  agora?: () => number;
  setInterval?: (fn: () => void, ms: number) => any;
  clearInterval?: (h: any) => void;
  ttlMs?: number;
};

const mensagemDe = (e: unknown): ErroDoLobby => {
  if (e instanceof repo.JointSessionRequestError) {
    return { motivo: e.motivo, kind: e.kind, mensagem: e.message };
  }
  return {
    motivo: 'desconhecido',
    kind: 'server',
    mensagem: e instanceof Error ? e.message : 'Erro inesperado.',
  };
};

export const useJointSession = (
  jointSessionId: string | null,
  meuUserId: string,
  deps: DepsDoHook = {},
): UseJointSession => {
  const agora = deps.agora ?? (() => Date.now());
  const _setInterval = deps.setInterval ?? setInterval;
  const _clearInterval = deps.clearInterval ?? clearInterval;
  const ttlMs = deps.ttlMs ?? PRESENCA_TTL_MS;

  const [state, setState] = useState<JointSessionState | null>(null);
  const [parceiro, setParceiro] = useState<repo.JointPartnerProfile | null>(null);
  const [convite, setConvite] = useState<repo.JointInviteDoHost | null>(null);
  const [carregando, setCarregando] = useState<boolean>(Boolean(jointSessionId));
  const [erro, setErro] = useState<ErroDoLobby>(null);
  const [conexao, setConexao] = useState<ConexaoLocal>('reconectando');
  const [emCurso, setEmCurso] = useState<AcaoDoLobby | null>(null);
  // O VALOR do tique entra na dependência do memo. Descartá-lo (usando só o
  // setter, que é estável) fazia a presença nunca ser recalculada: o relógio
  // andava, o timer disparava, e a tela seguia dizendo "presente" para sempre.
  const [tique, setTique] = useState(0);

  const vivo = useRef(true);
  // Identifica a "geração" de dados: troca de sessão ou unmount invalida tudo
  // que estava em voo. É o que impede a resposta de uma sessão antiga de
  // sobrescrever a atual.
  const geracao = useRef(0);
  const acaoRef = useRef<AcaoDoLobby | null>(null);

  const aplicar = useCallback((minhaGeracao: number, fn: () => void) => {
    if (!vivo.current || minhaGeracao !== geracao.current) return;
    fn();
  }, []);

  // ------------------------------------------------------------------
  // Snapshot autoritativo
  // ------------------------------------------------------------------
  const buscar = useCallback(
    async (minhaGeracao: number) => {
      if (!jointSessionId) return;
      try {
        const s = await repo.getJointSessionSnapshot(jointSessionId);
        aplicar(minhaGeracao, () => {
          setState(s);
          setErro(null);
          setCarregando(false);
        });
        if (!s) return;

        // Identidade do parceiro: única superfície aprovada no Sprint 01.
        if (s.guestUserId) {
          try {
            const p = await repo.getJointPartnerProfile(jointSessionId);
            aplicar(minhaGeracao, () => setParceiro(p));
          } catch {
            /* nome do parceiro é secundário; a tela tem fallback */
          }
        }
        // Convite: só o anfitrião, e só enquanto o convite existe.
        if (s.hostUserId === meuUserId && s.status === 'inviting') {
          try {
            const c = await repo.getJointInviteForHost(jointSessionId);
            aplicar(minhaGeracao, () => setConvite(c));
          } catch {
            /* sem convite recuperado, a tela pede para gerar outro */
          }
        } else {
          aplicar(minhaGeracao, () => setConvite(null));
        }
      } catch (e) {
        aplicar(minhaGeracao, () => {
          setErro(mensagemDe(e));
          setCarregando(false);
        });
      }
    },
    [aplicar, jointSessionId, meuUserId],
  );

  // ------------------------------------------------------------------
  // Assinatura: uma por jointSessionId, encerrada exatamente uma vez
  // ------------------------------------------------------------------
  useEffect(() => {
    vivo.current = true;
    geracao.current += 1;
    const minhaGeracao = geracao.current;

    if (!jointSessionId) {
      setState(null);
      setParceiro(null);
      setConvite(null);
      setCarregando(false);
      return undefined;
    }

    setCarregando(true);
    void buscar(minhaGeracao);

    const assinatura = subscribeToJointSession(
      jointSessionId,
      meuUserId,
      {
        onState: (s) => aplicar(minhaGeracao, () => {
          setState(s);
          setCarregando(false);
        }),
        onError: (e) => aplicar(minhaGeracao, () => setErro(mensagemDe(e))),
        onConnectionChange: (conectado) =>
          aplicar(minhaGeracao, () => setConexao(conectado ? 'conectado' : 'reconectando')),
      },
      { agora, ttlMs },
    );

    // Timer de APRESENTAÇÃO: a ausência do parceiro cruza o TTL sem que evento
    // nenhum chegue. Sem este tique, a tela ficaria dizendo "presente" para
    // sempre depois que o outro aparelho parou de responder.
    const tiquePresenca = _setInterval(() => {
      if (vivo.current && minhaGeracao === geracao.current) setTique((t) => t + 1);
    }, Math.max(1_000, Math.floor(ttlMs / 4)));

    return () => {
      vivo.current = false;
      // Encerra a assinatura E o timer — exatamente uma vez. E NÃO chama
      // `abandon`: sair da tela não cancela o treino do parceiro.
      assinatura.unsubscribe();
      _clearInterval(tiquePresenca);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jointSessionId, meuUserId]);

  const recarregar = useCallback(async () => {
    await buscar(geracao.current);
  }, [buscar]);

  // ------------------------------------------------------------------
  // Ações: single-flight, sem otimismo, com refetch autoritativo
  // ------------------------------------------------------------------
  const executar = useCallback(
    async <T,>(acao: AcaoDoLobby, fn: () => Promise<T>): Promise<T | null> => {
      // Dois toques com a Promise pendente ⟹ uma chamada.
      if (acaoRef.current) return null;
      acaoRef.current = acao;
      setEmCurso(acao);
      const minhaGeracao = geracao.current;
      try {
        const r = await fn();
        // O estado NÃO é montado a partir da resposta: o snapshot é a verdade.
        await buscar(minhaGeracao);
        aplicar(minhaGeracao, () => setErro(null));
        return r;
      } catch (e) {
        // ORDEM IMPORTA: refaz o snapshot PRIMEIRO e só então registra o erro.
        // `buscar` limpa o erro ao ter sucesso — se o erro fosse gravado antes,
        // a refetch bem-sucedida o apagaria e a falha da ação sumiria da tela
        // sem ninguém ver.
        await buscar(minhaGeracao);
        aplicar(minhaGeracao, () => setErro(mensagemDe(e)));
        return null;
      } finally {
        acaoRef.current = null;
        if (vivo.current && minhaGeracao === geracao.current) setEmCurso(null);
      }
    },
    [aplicar, buscar],
  );

  const escolherModo = useCallback(
    async (mode: JointMode, grupo: string | null = null) => {
      if (!jointSessionId) return;
      await executar('modo', () =>
        repo.setJointSessionMode({ jointSessionId, mode, muscleGroup: grupo }));
    },
    [executar, jointSessionId],
  );

  const confirmarSessao = useCallback(
    async (plannedSessionId: string) => {
      if (!jointSessionId) return;
      await executar('confirmarSessao', () =>
        repo.confirmJointParticipantSession({ jointSessionId, plannedSessionId }));
    },
    [executar, jointSessionId],
  );

  const materializarCopia = useCallback(async () => {
    if (!jointSessionId) return null;
    const r = await executar('materializar', () =>
      repo.materializeJointSessionCopy(jointSessionId));
    return r?.plannedSessionId ?? null;
  }, [executar, jointSessionId]);

  const definirPronto = useCallback(
    async (pronto: boolean) => {
      if (!jointSessionId) return;
      await executar('pronto', () =>
        repo.setJointParticipantReady({ jointSessionId, ready: pronto }));
    },
    [executar, jointSessionId],
  );

  /**
   * Gera um convite novo sem sair do lobby. `create_joint_session` é idempotente
   * e ROTACIONA o código quando o anterior expirou (C1b do Sprint 01) — por isso
   * é ela, e não uma RPC nova.
   */
  const rotacionarConvite = useCallback(async () => {
    await executar('rotacionar', () => repo.createJointSession());
  }, [executar]);

  /** Saída EXPLÍCITA. Devolve true só quando o servidor confirmou. */
  const sair = useCallback(async (): Promise<boolean> => {
    if (!jointSessionId) return true;
    const r = await executar('sair', () => repo.abandonJointSession(jointSessionId));
    return r != null;
  }, [executar, jointSessionId]);

  const presenca = useMemo(
    () => presencaDoParceiro(state, meuUserId, agora(), ttlMs),
    // `tique` (o valor) é o que muda quando o timer dispara — é ele que faz o
    // TTL ser cruzado sem nenhum evento novo chegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, meuUserId, ttlMs, agora, tique],
  );

  return {
    state, parceiro, convite, carregando, erro, conexao, presenca, emCurso,
    recarregar, escolherModo, confirmarSessao, materializarCopia, definirPronto,
    rotacionarConvite, sair,
  };
};
