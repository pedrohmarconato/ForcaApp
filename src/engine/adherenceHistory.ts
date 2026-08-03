// src/engine/adherenceHistory.ts
// Nível 4 da escada de reencaixe — "falta crônica vira replanejamento da
// agenda" (mínimo: detectar e avisar com número real). Puro de propósito (sem
// I/O, sem relógio): quem sabe "hoje" é a tela, que passa ateSemana (exclusivo).
//
// Mesma honestidade de weekShortfall.ts: nenhum número inventado. Só semanas
// FECHADAS entram — a semana em curso nunca conta contra o aluno (mesmo
// princípio de semanasConstantes em progressStats.ts). Verdeditos em ordem:
// insuficiente_historico → abandono → agenda_desalinhada → falta_cronica → ok.
// falta_cronica NUNCA usa média: exige TODAS as semanas fechadas com taxa
// abaixo do teto (uma semana boa não salva a série ruim).

import type { OffsetDaSemana } from './scheduleShift';
import { FREQUENCY_CONFIG, type FrequencyConfig } from './config';

export type VereditoDeFrequencia =
  | 'ok'
  | 'insuficiente_historico'
  | 'falta_cronica'
  | 'agenda_desalinhada'
  | 'abandono';

/** Linha bruta de planned_sessions que o motor entende (subset do que o banco devolve). */
export type SessaoHistorica = {
  week_number: number | null;
  status: string | null;
  scheduled_date: string | null;
};

/** Semana fechada agregada: quantos treinos deviam acontecer e quantos foram concluídos. */
export type SemanaHistorica = {
  semana: number;
  total: number;
  concluidas: number;
  /** scheduled_date das concluídas (null quando o banco não tem a data). */
  diasConcluidos: (string | null)[];
};

/**
 * Agrupa as linhas por semana e mantém as últimas `quantidade` semanas ANTES
 * de `ateSemana` (exclusivo) — a semana em curso e as futuras ficam de fora,
 * mesmo que apareçam na consulta. Retorna em ordem crescente de semana.
 */
export const aderenciaPorSemana = (params: {
  sessoes: SessaoHistorica[];
  quantidade: number;
  /** Limite superior EXCLUSIVO das semanas que contam (número da semana em curso). */
  ateSemana: number;
}): SemanaHistorica[] => {
  const { sessoes, quantidade, ateSemana } = params;

  const porSemana = new Map<number, SemanaHistorica>();
  for (const s of sessoes) {
    if (s.week_number == null || s.week_number >= ateSemana) continue;
    const agregada = porSemana.get(s.week_number) ?? {
      semana: s.week_number,
      total: 0,
      concluidas: 0,
      diasConcluidos: [],
    };
    agregada.total += 1;
    if (s.status === 'completed') {
      agregada.concluidas += 1;
      agregada.diasConcluidos.push(s.scheduled_date);
    }
    porSemana.set(s.week_number, agregada);
  }

  return Array.from(porSemana.values())
    .sort((a, b) => b.semana - a.semana)
    .slice(0, quantidade)
    .sort((a, b) => a.semana - b.semana);
};

/** Taxa de concluídas da semana; null quando não há treino planejado na semana. */
const taxaDaSemana = (semana: SemanaHistorica): number | null =>
  semana.total > 0 ? semana.concluidas / semana.total : null;

/** Dia da semana (0=segunda) de uma data ISO, pela mesma técnica UTC de agendaDias. */
const diaDaSemana = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(ms)) return null;
  return (new Date(ms).getUTCDay() + 6) % 7;
};

/**
 * Veredito do histórico fechado do aluno contra a agenda configurada.
 *
 * - < 3 semanas fechadas: ainda não dá para diagnosticar.
 * - Todas com 0 concluídas: abandono (nunca "reduza para 0").
 * - Todas com taxa >= 0.8 E nenhum treino concluído cai em training_days:
 *   agenda desalinhada — o aluno treina, mas nos dias errados. Só com dado de
 *   dia (deltaMinimoDeDias) e com agenda preenchida para comparar.
 * - Todas com taxa < taxaMaxima: falta crônica.
 * - Senão: ok.
 */
export const vereditoDeFrequencia = (
  semanas: SemanaHistorica[],
  agenda: OffsetDaSemana[],
  config: FrequencyConfig = FREQUENCY_CONFIG,
): VereditoDeFrequencia => {
  if (semanas.length < config.semanasFechadasMinimas) return 'insuficiente_historico';

  if (semanas.every((s) => s.concluidas === 0)) return 'abandono';

  const taxas = semanas.map(taxaDaSemana);
  const todosComTaxa = (p: (taxa: number) => boolean) =>
    taxas.every((t) => t !== null && p(t));

  const diasComData = semanas.flatMap((s) => s.diasConcluidos).filter(
    (d): d is string => d != null,
  );
  const temDadoDeDia = diasComData.length >= config.deltaMinimoDeDias;
  const nenhumDiaEmAgenda =
    agenda.length > 0 &&
    diasComData.every((d) => {
      const offset = diaDaSemana(d);
      return offset !== null && !agenda.some((a) => a === offset);
    });
  if (todosComTaxa((t) => t >= 0.8) && temDadoDeDia && nenhumDiaEmAgenda) {
    return 'agenda_desalinhada';
  }

  if (todosComTaxa((t) => t < config.taxaMaxima)) return 'falta_cronica';

  return 'ok';
};

/** Mediana das concluídas nas semanas fechadas — o número real do card. */
export const frequenciaReal = (semanas: SemanaHistorica[]): number => {
  const valores = semanas.map((s) => s.concluidas).sort((a, b) => a - b);
  if (valores.length === 0) return 0;
  const meio = Math.floor(valores.length / 2);
  if (valores.length % 2 === 1) return valores[meio];
  return Math.round((valores[meio - 1] + valores[meio]) / 2);
};

/** Dias planejados por semana (maior total da janela) — o denominador do card. */
export const diasPlanejados = (semanas: SemanaHistorica[]): number =>
  semanas.reduce((max, s) => Math.max(max, s.total), 0);
