// src/utils/weekSummary.ts
// Agregações de APRESENTAÇÃO sobre o histórico real de sessões concluídas.
//
// Nada aqui inventa número. Toda saída é derivada de `finishedAt`/`startedAt`
// que já vêm do banco; quando a amostra é vazia ou o dado é nulo, a função
// devolve zero ou `null` para a tela renderizar "—" ou um estado vazio.
//
// Importante: NÃO existe hoje nenhuma meta semanal persistida (nem em
// `training_plans`, nem no questionário lido pelo app). Por isso este módulo
// deliberadamente não expõe percentual de adesão nem razão "X de Y" — seria um
// denominador inventado. Ele entrega apenas contagens e fatos observados.

/** Formato mínimo consumido daqui — compatível com `CompletedSessionSummary`. */
export type SessaoConcluida = {
  startedAt: string;
  finishedAt: string | null;
};

export type ResumoSemana = {
  /** Sessões concluídas na semana de referência. */
  concluidas: number;
  /** Sete posições, de segunda a domingo: houve sessão concluída no dia? */
  diasComTreino: boolean[];
};

/** Rótulos curtos da faixa de dias, na mesma ordem de `diasComTreino`. */
export const DIAS_DA_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const;

/** Índice 0–6 (segunda = 0) de uma data local. */
const indiceDiaSemana = (data: Date): number => (data.getDay() + 6) % 7;

/** Meia-noite local da segunda-feira da semana que contém `referencia`. */
export const inicioDaSemana = (referencia: Date): Date => {
  const inicio = new Date(referencia);
  inicio.setDate(inicio.getDate() - indiceDiaSemana(inicio));
  inicio.setHours(0, 0, 0, 0);
  return inicio;
};

/**
 * Resume a semana que contém `referencia` a partir das sessões concluídas.
 * Uma sessão só conta quando tem `finishedAt` — sessão sem término registrado
 * não é um treino concluído.
 */
export const resumirSemana = (
  sessoes: readonly SessaoConcluida[],
  referencia: Date,
): ResumoSemana => {
  const inicio = inicioDaSemana(referencia);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);

  const diasComTreino = [false, false, false, false, false, false, false];
  let concluidas = 0;

  for (const sessao of sessoes) {
    if (!sessao.finishedAt) continue;
    const termino = new Date(sessao.finishedAt);
    if (Number.isNaN(termino.getTime())) continue;
    if (termino < inicio || termino >= fim) continue;

    concluidas += 1;
    diasComTreino[indiceDiaSemana(termino)] = true;
  }

  return { concluidas, diasComTreino };
};

/**
 * Duração de uma sessão em minutos inteiros.
 * Devolve `null` quando falta o término ou quando os carimbos são incoerentes —
 * a tela mostra "—" em vez de um número derivado de dado quebrado.
 */
export const duracaoEmMinutos = (sessao: SessaoConcluida): number | null => {
  if (!sessao.finishedAt) return null;

  const inicio = new Date(sessao.startedAt).getTime();
  const fim = new Date(sessao.finishedAt).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  if (fim < inicio) return null;

  return Math.round((fim - inicio) / 60000);
};

/** Soma das durações conhecidas, em minutos. Sessões sem término são ignoradas. */
export const minutosTotais = (sessoes: readonly SessaoConcluida[]): number =>
  sessoes.reduce((total, sessao) => total + (duracaoEmMinutos(sessao) ?? 0), 0);

/** "48 min" · "1h 20min" · "2h". Devolve `null` quando não há duração. */
export const formatarDuracao = (minutos: number | null): string | null => {
  if (minutos === null || !Number.isFinite(minutos) || minutos < 0) return null;
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
};

/** Data curta e local: "14 jul". Devolve `null` para carimbo inválido. */
export const formatarDataCurta = (iso: string | null): string | null => {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;

  return data
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');
};
