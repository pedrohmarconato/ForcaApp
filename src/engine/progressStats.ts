// src/engine/progressStats.ts
// Motor puro da aba Progresso (Direção 03). Nada aqui inventa número:
//  - recorde só existe com carga E reps reais;
//  - volume é a soma observada da semana (0 séries = 0 kg é fato, não chute);
//  - constância reusa a mesma convenção de semana (segunda-feira) do app.

import { inicioDaSemana, resumirSemana, type SessaoConcluida } from '../utils/weekSummary';

/** Linha mínima de set_log para as agregações — vinda do repositório. */
export type SetLogResumo = {
  /** Identidade do exercício (chave do catálogo ou nome normalizado). */
  identity: string;
  name: string;
  loadKg: number | null;
  reps: number | null;
  completedAt: string;
  /**
   * true quando a série veio de um plano purpose='joint' (achado A4: sem
   * isso, um recorde do treino EM DUPLA aparecia como se fosse solo).
   * Ausente/false = solo.
   */
  origemJoint?: boolean;
};

export type RecordeExercicio = {
  name: string;
  loadKg: number;
  reps: number;
  /** Carimbo da série do recorde. */
  quando: string;
  /** true quando a série do recorde veio de um plano purpose='joint'. */
  origemJoint: boolean;
};

/**
 * Melhor série por exercício: maior carga; empate decide por reps; novo empate
 * fica com a mais recente. Saída ordenada do recorde mais recente para o mais
 * antigo, limitada.
 *
 * R2 (review PR #73): a agregação de recorde é SOLO por definição — série de
 * plano purpose='joint' é excluída ANTES do Map (mesmo padrão de
 * getLastLoadByExercise). Sem isto, a série 80kg×5 em dupla apagava o recorde
 * solo 70×5 do mesmo exercício (identidade colide) e a aba Progresso mentia.
 * TODO (dono): exibição separada de recordes da dupla em seção própria
 * ("Dupla"); até existir, a série joint simplesmente não aparece aqui.
 */
export const recordesPorExercicio = (
  logs: readonly SetLogResumo[],
  limite = 5,
): RecordeExercicio[] => {
  const melhor = new Map<string, RecordeExercicio>();

  for (const l of logs) {
    if (l.loadKg == null || l.reps == null) continue;
    if (l.origemJoint === true) continue;
    const atual = melhor.get(l.identity);
    const candidato: RecordeExercicio = {
      name: l.name,
      loadKg: l.loadKg,
      reps: l.reps,
      quando: l.completedAt,
      origemJoint: l.origemJoint === true,
    };
    if (
      !atual ||
      candidato.loadKg > atual.loadKg ||
      (candidato.loadKg === atual.loadKg && candidato.reps > atual.reps) ||
      (candidato.loadKg === atual.loadKg &&
        candidato.reps === atual.reps &&
        candidato.quando.localeCompare(atual.quando) > 0)
    ) {
      melhor.set(l.identity, candidato);
    }
  }

  return [...melhor.values()]
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, limite);
};

/** Número ISO-8601 da semana (para o rótulo "S30"). */
const numeroSemanaIso = (data: Date): number => {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaSemana = d.getUTCDay() || 7; // domingo → 7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana); // quinta da mesma semana ISO
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
};

const rotuloDaSemana = (inicio: Date, atual: boolean): string =>
  atual ? 'AGORA' : `S${numeroSemanaIso(inicio)}`;

export type VolumeSemana = {
  rotulo: string;
  volumeKg: number;
  atual: boolean;
};

/**
 * Volume (reps × carga das séries com os dois valores) por semana local, da
 * mais antiga para a atual. Semanas alinhadas pela segunda-feira, como todo o
 * resto do app.
 *
 * R2 (review PR #73): volume SOLO não soma séries de plano purpose='joint' —
 * o kg levantado em dupla não é evolução individual. TODO (dono): seção
 * própria de volume da dupla; até existir, os kg joint ficam fora.
 */
export const volumePorSemana = (
  logs: readonly SetLogResumo[],
  numSemanas: number,
  hoje: Date = new Date(),
): VolumeSemana[] => {
  const inicioAtual = inicioDaSemana(hoje);
  const semanas: VolumeSemana[] = [];

  for (let k = numSemanas - 1; k >= 0; k -= 1) {
    const inicio = new Date(inicioAtual);
    inicio.setDate(inicio.getDate() - 7 * k);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 7);

    let volume = 0;
    for (const l of logs) {
      if (l.loadKg == null || l.reps == null) continue;
      if (l.origemJoint === true) continue;
      const quando = new Date(l.completedAt);
      if (Number.isNaN(quando.getTime())) continue;
      if (quando < inicio || quando >= fim) continue;
      volume += l.reps * l.loadKg;
    }

    semanas.push({
      rotulo: rotuloDaSemana(inicio, k === 0),
      volumeKg: Math.round(volume * 10) / 10,
      atual: k === 0,
    });
  }

  return semanas;
};

/**
 * Semanas CONSECUTIVAS com pelo menos um treino concluído, terminando na
 * semana atual. A semana em curso ainda zerada não quebra a sequência (ela
 * não acabou); um buraco em semana passada quebra. Zero sem nenhum treino.
 */
export const semanasConstantes = (
  sessoes: readonly SessaoConcluida[],
  hoje: Date = new Date(),
): number => {
  const inicioAtual = inicioDaSemana(hoje);
  let streak = resumirSemana(sessoes, inicioAtual).concluidas > 0 ? 1 : 0;

  for (let k = 1; k <= 520; k += 1) {
    const referencia = new Date(inicioAtual);
    referencia.setDate(referencia.getDate() - 7 * k);
    if (resumirSemana(sessoes, referencia).concluidas > 0) streak += 1;
    else break;
  }

  return streak;
};

export type SemanaConstancia = {
  rotulo: string;
  diasComTreino: boolean[];
  concluidas: number;
  atual: boolean;
};

/**
 * Constância das últimas N semanas (mais antiga primeiro, atual por último),
 * derivada das sessões concluídas — mesma régua de `resumirSemana`.
 */
export const constanciaSemanal = (
  sessoes: readonly SessaoConcluida[],
  numSemanas: number,
  hoje: Date = new Date(),
): SemanaConstancia[] => {
  const inicioAtual = inicioDaSemana(hoje);
  const semanas: SemanaConstancia[] = [];

  for (let k = numSemanas - 1; k >= 0; k -= 1) {
    const referencia = new Date(inicioAtual);
    referencia.setDate(referencia.getDate() - 7 * k);
    const resumo = resumirSemana(sessoes, referencia);

    semanas.push({
      rotulo: rotuloDaSemana(referencia, k === 0),
      diasComTreino: resumo.diasComTreino,
      concluidas: resumo.concluidas,
      atual: k === 0,
    });
  }

  return semanas;
};
