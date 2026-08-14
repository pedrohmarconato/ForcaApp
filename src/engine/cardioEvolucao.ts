// src/engine/cardioEvolucao.ts
// Motor puro do gráfico de evolução de cardio (aba Progresso). Mesma
// disciplina de cardioGoals.ts/cardioPrescrito.ts: nada aqui agrega ou
// inventa — cada `set_log` CONCLUÍDO é UM ponto, na ordem em que aconteceu.
//
// Duas decisões que este arquivo mantém sem exceção:
//
//  • pace é DERIVADO por ponto (via `paceSecondsPerKm`, a mesma coluna
//    gerada que o resto do app usa) — nunca recalculado por fórmula própria,
//    para não divergir do pace mostrado no histórico da sessão;
//  • sem distância positiva o pace do ponto é `null`, não 0 — um "0:00 /km"
//    afirmaria um esforço que a série não mediu (bike sem hodômetro, por
//    exemplo). A tela decide o que fazer com o `null` (não plota o ponto);
//    este motor só se recusa a inventar.

import { paceSecondsPerKm } from './sessionModel';
import type { CardioLog } from './cardioGoals';

/** Uma modalidade com pelo menos um ponto de cardio concluído. */
export type ModalidadeDisponivel = {
  identity: string;
  name: string;
  /** Quantas séries de cardio concluídas existem para esta modalidade. */
  pontos: number;
};

/**
 * Modalidades presentes em `logs`, cada uma com sua contagem de séries.
 * Ordenada por contagem DESC — o consumo típico (chip default) é "a
 * modalidade com mais histórico", não a ordem de chegada dos logs.
 *
 * `logs` vem em ordem decrescente de `completed_at` (contrato de
 * `getCardioLogs`); a ordem de entrada não importa aqui, só a contagem.
 */
export const modalidadesDisponiveis = (logs: readonly CardioLog[]): ModalidadeDisponivel[] => {
  const porIdentidade = new Map<string, ModalidadeDisponivel>();

  for (const log of logs) {
    const atual = porIdentidade.get(log.identity);
    // Reconstrói o registro em vez de incrementar em lugar — mesmo padrão de
    // `recordesPorExercicio` (progressStats.ts): o Map é acumulador local,
    // nunca uma referência compartilhada com quem chamou.
    porIdentidade.set(log.identity, {
      identity: log.identity,
      name: log.name,
      pontos: (atual?.pontos ?? 0) + 1,
    });
  }

  return [...porIdentidade.values()].sort((a, b) => b.pontos - a.pontos);
};

/** Um ponto do gráfico: UMA série de cardio concluída, sem agregação. */
export type PontoEvolucaoCardio = {
  completedAt: string;
  distanciaM: number | null;
  /** Segundos por km do ponto. `null` sem distância positiva na série. */
  paceSecPorKm: number | null;
};

/**
 * Série de evolução de uma modalidade, ordenada ASCENDENTE por
 * `completedAt` — o eixo X de um gráfico de evolução lê da esquerda
 * (mais antigo) para a direita (mais recente); `getCardioLogs` entrega o
 * oposto (mais recente primeiro), então a inversão é responsabilidade
 * deste motor, não da tela.
 *
 * Cada `set_log` da modalidade vira UM ponto — nunca média ou agrupamento
 * por dia/semana: duas execuções no mesmo dia (ex.: bike de manhã e à
 * noite) são dois pontos distintos, cada um com o pace real daquele esforço.
 */
export const montarSerieEvolucao = (
  logs: readonly CardioLog[],
  identity: string,
): PontoEvolucaoCardio[] =>
  logs
    .filter((l) => l.identity === identity)
    // Carimbo que não parseia (dado corrompido/mock deformado) não entra no
    // gráfico — um "Invalid Date" no eixo X seria pior que a série mais curta.
    .filter((l) => !Number.isNaN(new Date(l.completedAt).getTime()))
    .map((l) => ({
      completedAt: l.completedAt,
      distanciaM: l.distanceM,
      paceSecPorKm: paceSecondsPerKm(l.durationSeconds, l.distanceM),
    }))
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

// --- Rótulos de eixo -------------------------------------------------------
// Formatação de EXIBIÇÃO, sem nenhum cálculo novo — vive aqui (não no
// componente) para que o teste do motor cubra o rótulo sem precisar montar
// árvore React.

/** Data curta do eixo X: "2026-08-13T..." → "13/08". `—` para carimbo inválido. */
export const formatarDataCurtaEixo = (iso: string): string => {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
};

/**
 * Km com vírgula pt-BR, uma casa decimal, sem zero à toa: 2,4 → "2,4";
 * 5 → "5" (não "5,0"). Recebe o valor JÁ EM KM (não metros) — quem consome
 * é sempre um eixo/rótulo de gráfico já convertido, nunca `CardioLog.distanceM`
 * bruto.
 */
export const formatarKmComVirgula = (km: number): string => {
  const arredondado = Math.round(km * 10) / 10;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace('.', ',');
};
