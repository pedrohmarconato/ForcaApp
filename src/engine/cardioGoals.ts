// src/engine/cardioGoals.ts
// Motor puro das metas de cardio (migration 0022). Mesma disciplina do
// progressStats: nada aqui inventa número.
//
// A distinção que este arquivo mantém com cuidado:
//
//  • na meta de DESEMPENHO, "sem amostra" é `null` — pace 0:00 ou 0% seria a
//    tela afirmando um esforço que nunca existiu;
//  • na meta de CONSISTÊNCIA, zero é FATO — o aluno não fez cardio nesta
//    semana, e mostrar "—" ali esconderia justamente a informação útil.
//
// E a regra que impede o número mais enganoso da feature: comparação só entre
// bases equivalentes. O tempo de 1 km não prova nada sobre uma meta de 5 km.

import { normalizeName } from './sessionModel';
import { inicioDaSemana } from '../utils/weekSummary';

/** Série de cardio já registrada, no mínimo que as metas consomem. */
export type CardioLog = {
  /** Identidade do exercício (chave do catálogo ou nome normalizado). */
  identity: string;
  /** Nome do exercício = modalidade ("Corrida", "Bicicleta Ergométrica"). */
  name: string;
  durationSeconds: number | null;
  distanceM: number | null;
  completedAt: string;
};

export type MetaDesempenho = {
  modality: string;
  targetDistanceM: number;
  targetDurationSeconds: number;
};

export type MetaConsistencia = {
  weeklyMinutes: number | null;
  weeklySessions: number | null;
};

// Faixa de distância que conta como "a mesma prova". Abaixo de 95% o esforço é
// mais curto e o pace sai otimista; acima de 110% o esforço é outro e o pace
// sai pessimista. Fora da faixa, a amostra é DESCARTADA em vez de ajustada —
// corrigir pace por fórmula (Riegel e afins) seria estimar, não medir.
export const TOLERANCIA_DISTANCIA_MIN = 0.95;
export const TOLERANCIA_DISTANCIA_MAX = 1.1;

export type ProgressoDesempenho = {
  /** Melhor (menor) tempo entre as amostras equivalentes. Null sem amostra. */
  melhorDurationSeconds: number | null;
  melhorDistanceM: number | null;
  /** Pace do melhor esforço, em segundos por km. Null sem amostra. */
  melhorPaceSecPerKm: number | null;
  /** Pace-alvo da meta. Null quando a meta não define distância/tempo válidos. */
  paceAlvoSecPerKm: number | null;
  /** Quantas séries entraram na conta (0 = a tela mostra "—"). */
  amostras: number;
  /** Segundos a cortar no pace para bater a meta. Null sem amostra/alvo. */
  faltaSegundos: number | null;
  /** 0..1 — quanto do alvo o melhor esforço já cobre. Null sem base. */
  fracao: number | null;
  atingida: boolean;
};

const numeroPositivo = (v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return v;
};

/** Pace em segundos por km. Null sem duração ou sem distância. */
const pace = (durationSeconds: number, distanceM: number): number =>
  durationSeconds / (distanceM / 1000);

/**
 * Progresso de uma meta de desempenho ("5 km em 30 min").
 *
 * Só entram séries da MESMA modalidade e com distância equivalente à da meta.
 * A comparação final é por PACE — assim um esforço de 5,1 km ainda serve para
 * uma meta de 5 km, sem fingir que os tempos absolutos são comparáveis.
 */
export const progressoDesempenho = (
  logs: readonly CardioLog[],
  meta: MetaDesempenho,
): ProgressoDesempenho => {
  const alvoDistancia = numeroPositivo(meta.targetDistanceM);
  const alvoDuracao = numeroPositivo(meta.targetDurationSeconds);
  const paceAlvo = alvoDistancia && alvoDuracao ? pace(alvoDuracao, alvoDistancia) : null;
  const modalidade = normalizeName(meta.modality ?? '');

  const vazio: ProgressoDesempenho = {
    melhorDurationSeconds: null,
    melhorDistanceM: null,
    melhorPaceSecPerKm: null,
    paceAlvoSecPerKm: paceAlvo,
    amostras: 0,
    faltaSegundos: null,
    fracao: null,
    atingida: false,
  };
  if (!alvoDistancia || !modalidade) return vazio;

  const piso = alvoDistancia * TOLERANCIA_DISTANCIA_MIN;
  const teto = alvoDistancia * TOLERANCIA_DISTANCIA_MAX;

  let melhor: { duracao: number; distancia: number; pace: number } | null = null;
  let amostras = 0;

  for (const l of logs) {
    if (normalizeName(l.name ?? '') !== modalidade) continue;
    const duracao = numeroPositivo(l.durationSeconds);
    const distancia = numeroPositivo(l.distanceM);
    // Sem distância não há como comparar com uma meta por distância (bike sem
    // hodômetro). A série segue valendo para a meta de consistência.
    if (duracao == null || distancia == null) continue;
    if (distancia < piso || distancia > teto) continue;
    amostras += 1;
    const p = pace(duracao, distancia);
    if (melhor == null || p < melhor.pace) {
      melhor = { duracao, distancia, pace: p };
    }
  }

  if (melhor == null) return { ...vazio, amostras: 0 };
  if (paceAlvo == null) {
    return {
      ...vazio,
      melhorDurationSeconds: melhor.duracao,
      melhorDistanceM: melhor.distancia,
      melhorPaceSecPerKm: melhor.pace,
      amostras,
    };
  }

  const atingida = melhor.pace <= paceAlvo;
  const falta = Math.max(0, melhor.pace - paceAlvo) * (alvoDistancia / 1000);
  return {
    melhorDurationSeconds: melhor.duracao,
    melhorDistanceM: melhor.distancia,
    melhorPaceSecPerKm: melhor.pace,
    paceAlvoSecPerKm: paceAlvo,
    amostras,
    // Arredondado ao segundo: exibir "faltam 149,7 s" é precisão que a medição
    // (relógio na mão) não tem.
    // Uma diferença positiva subsegundo não pode virar "faltam 0:00". A
    // medição não sustenta decimal, então o menor déficit exibível é 1 s.
    faltaSegundos: atingida ? 0 : Math.max(1, Math.round(falta)),
    // Pace é inverso de desempenho: quanto menor, melhor. A fração é
    // alvo/atual, limitada a 1 — passar do alvo não é 130% da meta, é meta batida.
    fracao: Math.min(1, paceAlvo / melhor.pace),
    atingida,
  };
};

export type ProgressoConsistencia = {
  /** Minutos de cardio na semana. Pode ser fracionário; zero é fato. */
  minutos: number;
  /** DIAS distintos com cardio na semana — série não é sessão. */
  sessoes: number;
  metaMinutos: number | null;
  metaSessoes: number | null;
  /** 0..1 por eixo; null quando o eixo não foi declarado. */
  fracaoMinutos: number | null;
  fracaoSessoes: number | null;
  atingida: boolean;
};

/** Dia local (YYYY-MM-DD) do carimbo — a chave de "uma sessão por dia". */
const diaLocal = (iso: string): string | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * Progresso de uma meta de consistência na semana de `referencia`.
 *
 * A semana começa na SEGUNDA, pela mesma `inicioDaSemana` que a constância e o
 * volume usam — duas convenções de semana no mesmo app fariam a aba Progresso
 * discordar de si mesma.
 *
 * Sessões são DIAS distintos com cardio: três séries de esteira no mesmo dia são
 * um treino, e contá-las como três bateria uma meta de "3× por semana" num dia.
 */
export const progressoConsistencia = (
  logs: readonly CardioLog[],
  meta: MetaConsistencia,
  referencia: Date = new Date(),
): ProgressoConsistencia => {
  const inicio = inicioDaSemana(referencia);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);

  let segundos = 0;
  const dias = new Set<string>();

  for (const l of logs) {
    const quando = new Date(l.completedAt);
    if (Number.isNaN(quando.getTime())) continue;
    if (quando < inicio || quando >= fim) continue;
    const duracao = numeroPositivo(l.durationSeconds);
    if (duracao == null) continue;
    segundos += duracao;
    const dia = diaLocal(l.completedAt);
    if (dia) dias.add(dia);
  }

  // Não arredonda aqui: 20 s de HIIT são > 0. Arredondar para inteiro faria a
  // tela afirmar "0 min" apesar de existir uma amostra positiva.
  const minutos = segundos / 60;
  const sessoes = dias.size;
  const metaMinutos = numeroPositivo(meta.weeklyMinutes);
  const metaSessoes = numeroPositivo(meta.weeklySessions);

  const fracaoMinutos = metaMinutos == null ? null : Math.min(1, minutos / metaMinutos);
  const fracaoSessoes = metaSessoes == null ? null : Math.min(1, sessoes / metaSessoes);

  // Nenhum eixo declarado não é meta atingida — é meta inexistente.
  const eixos = [
    metaMinutos == null ? null : minutos >= metaMinutos,
    metaSessoes == null ? null : sessoes >= metaSessoes,
  ].filter((v): v is boolean => v !== null);

  return {
    minutos,
    sessoes,
    metaMinutos,
    metaSessoes,
    fracaoMinutos,
    fracaoSessoes,
    atingida: eixos.length > 0 && eixos.every(Boolean),
  };
};

/**
 * "Km é km" (D-05): soma a distância realizada da semana de `referencia`,
 * de QUALQUER modalidade — `l.name` não importa aqui, ao contrário de
 * `progressoDesempenho`. Mesmo corte de semana de `progressoConsistencia`
 * (`inicioDaSemana` + janela de 7 dias).
 *
 * Sem amostra com distância na janela devolve `null`, nunca `0` inventado —
 * a decisão de tratar "existe prescrição de km mas realizado é zero" como
 * fato (`0`, não `null`) é de QUEM CONSOME este valor (`cardioPrescrito.ts`),
 * não deste motor genérico, que não sabe se existe prescrição.
 */
export const distanciaRealizadaSemanaM = (
  logs: readonly CardioLog[],
  referencia: Date = new Date(),
): number | null => {
  const inicio = inicioDaSemana(referencia);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);

  let metros: number | null = null;
  for (const l of logs) {
    const quando = new Date(l.completedAt);
    if (Number.isNaN(quando.getTime()) || quando < inicio || quando >= fim) continue;
    const distancia = numeroPositivo(l.distanceM);
    if (distancia != null) metros = (metros ?? 0) + distancia;
  }
  return metros;
};
