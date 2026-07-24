// src/engine/replanChanges.ts
// Traduz a PROPOSTA do motor de replanejamento (weeklyReplanner) para as
// mudanças que o aluno lê na tela.
//
// Por que existe (feedback do dono, 24/07/2026): o banner listava os deltas do
// motor em bullets — "+2 séries de X em Treino D", "3 séries de perna: não
// coube nas sessões restantes — perda registrada". Faltava o essencial: o
// RESULTADO. Ninguém vê "Treino D vai de 12 para 15 séries" numa lista de
// somas, e "perda registrada" é linguagem de log, não de treinador.
//
// Aqui cada mudança vira uma unidade com antes → depois explícito e motivo em
// português. Puro de propósito: a UI só desenha o que este módulo decidiu.

import type {
  ReplanLossReason,
  ReplanSession,
  WeeklyReplanProposal,
} from './weeklyReplanner';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** Dia da semana em pt-BR a partir de YYYY-MM-DD, lido como data de calendário. */
export const diaDaSemana = (isoDate: string | null): string | null => {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const i = d.getUTCDay();
  return DIAS[i] ?? null;
};

/** "Treino B · qua" — o rótulo que o aluno reconhece na agenda dele. */
export const rotuloDaSessao = (sessao: ReplanSession): string => {
  const dia = diaDaSemana(sessao.scheduledDate);
  return dia ? `${sessao.title} · ${dia}` : sessao.title;
};

/** Séries planejadas de uma sessão (é o "volume" que o cartão compara). */
export const seriesDaSessao = (sessao: ReplanSession): number =>
  sessao.exercises.reduce((total, ex) => total + ex.sets.length, 0);

/**
 * Motivo da perda em português de treinador. O rótulo antigo vinha do enum do
 * motor e vazava jargão ("deload não compensa", "perda registrada").
 */
export const MOTIVO_DA_PERDA: Record<ReplanLossReason, string> = {
  nao_coube: 'não cabe no que sobrou da semana',
  deload_nao_compensa: 'é semana de deload — não vale compensar',
  sem_grupo_muscular: 'exercício sem grupo muscular no plano',
  replan_anterior_perdido: 'já tinha sido remanejado antes',
};

export type MudancaDoReplan =
  /** Sessão perdida que será marcada como pulada. */
  | {
      tipo: 'sessao_pulada';
      chave: string;
      rotulo: string;
      seriesQuePerdeu: number;
    }
  /** Sessão que RECEBE volume — o cartão com antes → depois. */
  | {
      tipo: 'sessao_reforcada';
      chave: string;
      rotulo: string;
      seriesAntes: number;
      seriesDepois: number;
      adicionadas: number;
      porGrupo: { grupo: string; sets: number }[];
    }
  /** Corte de tempo da sessão de hoje. */
  | {
      tipo: 'corte_de_tempo';
      chave: string;
      minutosAntes: number;
      minutosDepois: number;
      mantem: string;
      cortados: { nome: string; sets: number }[];
    }
  /** Volume que não tem para onde ir — dito sem eufemismo. */
  | {
      tipo: 'sem_espaco';
      chave: string;
      grupo: string;
      sets: number;
      motivo: string;
    };

/**
 * Monta as mudanças na ordem em que fazem sentido para quem lê: o que se perde,
 * o que muda de tamanho, o corte de hoje e, por último, o que ficou de fora.
 */
export const montarMudancas = (params: {
  proposal: WeeklyReplanProposal;
  sessions: ReplanSession[];
}): MudancaDoReplan[] => {
  const { proposal, sessions } = params;
  const porId = new Map(sessions.map((s) => [s.id, s]));
  const mudancas: MudancaDoReplan[] = [];

  const rotuloDe = (id: string): string => {
    const s = porId.get(id);
    return s ? rotuloDaSessao(s) : id;
  };

  if (proposal.redistribution) {
    for (const id of proposal.redistribution.missedSessionIds) {
      const s = porId.get(id);
      mudancas.push({
        tipo: 'sessao_pulada',
        chave: `pulada-${id}`,
        rotulo: rotuloDe(id),
        seriesQuePerdeu: s ? seriesDaSessao(s) : 0,
      });
    }

    // Várias adições na mesma sessão são UMA mudança: o aluno pensa por treino,
    // não por exercício.
    const porSessao = new Map<string, { grupo: string; sets: number }[]>();
    for (const a of proposal.redistribution.additions) {
      const lista = porSessao.get(a.targetSessionId) ?? [];
      const existente = lista.find((g) => g.grupo === a.muscleGroup);
      if (existente) existente.sets += a.addSets;
      else lista.push({ grupo: a.muscleGroup, sets: a.addSets });
      porSessao.set(a.targetSessionId, lista);
    }
    for (const [id, porGrupo] of porSessao) {
      const s = porId.get(id);
      const antes = s ? seriesDaSessao(s) : 0;
      const adicionadas = porGrupo.reduce((t, g) => t + g.sets, 0);
      mudancas.push({
        tipo: 'sessao_reforcada',
        chave: `reforco-${id}`,
        rotulo: rotuloDe(id),
        seriesAntes: antes,
        seriesDepois: antes + adicionadas,
        adicionadas,
        porGrupo: porGrupo.sort((a, b) => b.sets - a.sets),
      });
    }
  }

  if (proposal.timeCut) {
    const tc = proposal.timeCut;
    mudancas.push({
      tipo: 'corte_de_tempo',
      chave: `tempo-${tc.sessionId}`,
      minutosAntes: tc.estimatedMinutes,
      minutosDepois: tc.availableMinutes,
      mantem: tc.keptPriorities.includes('secondary')
        ? 'Mantém principais e secundários'
        : 'Mantém só os principais',
      cortados: tc.cutExercises.map((c) => ({ nome: c.name, sets: c.setsCut })),
    });
  }

  if (proposal.redistribution) {
    // Perdas do mesmo grupo pelo mesmo motivo viram uma linha só.
    const agrupadas = new Map<string, { grupo: string; sets: number; motivo: string }>();
    for (const l of proposal.redistribution.losses) {
      const k = `${l.muscleGroup}|${l.reason}`;
      const atual = agrupadas.get(k);
      if (atual) atual.sets += l.sets;
      else
        agrupadas.set(k, {
          grupo: l.muscleGroup,
          sets: l.sets,
          motivo: MOTIVO_DA_PERDA[l.reason],
        });
    }
    for (const [k, v] of agrupadas) {
      mudancas.push({ tipo: 'sem_espaco', chave: `perda-${k}`, ...v });
    }
  }

  return mudancas;
};

/** Frase única do topo — o resumo que dispensa ler os cartões. */
export const resumoDasMudancas = (mudancas: MudancaDoReplan[]): string => {
  const n = mudancas.length;
  if (n === 0) return 'Nada muda na sua semana';
  return n === 1 ? '1 mudança na sua semana' : `${n} mudanças na sua semana`;
};
