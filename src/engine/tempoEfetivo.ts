// src/engine/tempoEfetivo.ts
// Tempo efetivo de treino (migration 0028). Módulo puro, sem I/O — a mesma
// regra é implementada em SQL dentro da finish_session e aqui em TypeScript
// para o resumo da sessão em andamento.
//
// A duração exibida deixa de ser o relógio de parede bruto
// (finished_at − started_at) e passa a ser a soma dos intervalos entre eventos
// reais da sessão — início, cada série concluída, fim — com CADA intervalo
// limitado a CAP_INTERVALO_SEGUNDOS. Sessão esquecida em aberto contribui no
// máximo um teto; o resumo nunca mais mostra treze horas de um treino de uma
// hora. Cardio/isometria digitado acima do teto soma o excedente, porque os
// primeiros 20 minutos já entraram pelo intervalo (sem dupla contagem).
//
// Contrato de null, igual ao de weekSummary: sem âncora válida (início, fim ou
// fim anterior ao início) devolve null e a tela mostra "—". Nunca lança.

export const CAP_INTERVALO_SEGUNDOS = 1200;

export type SerieDaLinhaDoTempo = {
  /** Carimbo do servidor (set_logs.completed_at). Null em rascunho antigo. */
  completedAt: string | null;
  /** Cardio/isometria: duração digitada pelo aluno em segundos. Null em musculação. */
  actualDurationSeconds?: number | null;
};

export type LinhaDoTempo = {
  startedAt: string | null;
  /**
   * Âncora final. Sessão concluída: finished_at do servidor. Sessão em
   * andamento: o relógio "agora" — o mesmo valor que o histórico mostrará
   * quando a finish_session gravar a coluna.
   */
  finishedAt: string | null;
  series: readonly SerieDaLinhaDoTempo[];
};

/**
 * Tempo efetivo em segundos inteiros; `null` quando os carimbos-âncora estão
 * ausentes ou incoerentes (fim nulo, fim < início, data inválida) ou quando
 * algum completed_at é inválido.
 */
export const tempoEfetivoSegundos = (linha: LinhaDoTempo): number | null => {
  if (linha.startedAt == null || linha.finishedAt == null) return null;

  const inicio = new Date(linha.startedAt).getTime();
  const fim = new Date(linha.finishedAt).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return null;
  if (fim < inicio) return null;

  const eventos: number[] = [inicio];
  for (const s of linha.series) {
    if (s.completedAt == null) continue; // ausente em rascunho antigo: fora da conta
    const t = new Date(s.completedAt).getTime();
    if (!Number.isFinite(t)) return null; // presente e inválido: dado quebrado
    eventos.push(t);
  }
  eventos.push(fim);
  // Ordena a linha do tempo em ordem crescente, como o lag() do SQL da 0028.
  // Ordem fora do normal por clock skew ou retry não entra negativa no total.
  eventos.sort((a, b) => a - b);

  const capMs = CAP_INTERVALO_SEGUNDOS * 1000;
  let totalSegundos = 0;
  for (let i = 1; i < eventos.length; i += 1) {
    const intervaloMs = eventos[i] - eventos[i - 1];
    totalSegundos += Math.min(Math.max(intervaloMs, 0), capMs) / 1000;
  }

  for (const s of linha.series) {
    const duracao = s.actualDurationSeconds;
    if (duracao == null || !Number.isFinite(duracao)) continue;
    totalSegundos += Math.max(duracao - CAP_INTERVALO_SEGUNDOS, 0);
  }

  return Math.round(totalSegundos);
};
