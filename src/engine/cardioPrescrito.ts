// src/engine/cardioPrescrito.ts
// REQ-02 (D-02/CONTEXT.md, decisão travada do dono 2026-08-08): a meta de
// cardio da aba Progresso deixa de ser uma definição paralela ao treino
// (`cardio_goals`) e passa a ser lida da própria prescrição do plano ativo —
// prescrito × realizado.
//
// Mesma disciplina de `cardioGoals.ts`: nada aqui inventa número.
//
//  • "sem amostra" (nenhum set com o campo prescrito) é `null` — somar zero
//    prescrições e mostrar "0 km"/"0 sessões" afirmaria uma prescrição que
//    não existe;
//  • zero SESSÕES é fato quando o array de entrada é vazio (nenhum set de
//    cardio agendado nesta semana) — por isso `sessoes: 0` é literal, mas
//    `distanciaM`/`duracaoSegundos` continuam `null` nesse mesmo caso, porque
//    "nenhuma sessão" não é "prescrição de zero metros/segundos".
//
// O corte de semana (o que É "a semana corrente") NÃO é responsabilidade
// deste módulo — é decisão do repositório na query (ver
// `cardioPrescritoRepository.ts`). Este arquivo só agrega o que recebe.

import {
  distanciaRealizadaSemanaM,
  progressoConsistencia,
  type CardioLog,
  type ProgressoConsistencia,
} from './cardioGoals';

/**
 * Um `planned_set` de cardio já filtrado por semana corrente e
 * `muscle_group='Cardio'` pelo repositório. `sessionKey` identifica a sessão
 * (não a série) — o repositório passa `scheduled_date`/`id` da sessão pai
 * para permitir contar sessões distintas sem este módulo reimplementar corte
 * de data.
 */
export type PlannedCardioSet = {
  targetDistanceM: number | null;
  targetDurationSeconds: number | null;
  sessionKey: string;
};

/** Prescrição agregada da semana: soma de distância/duração + contagem de sessões. */
export type PrescricaoCardio = {
  distanciaM: number | null;
  duracaoSegundos: number | null;
  sessoes: number;
};

/**
 * Soma a prescrição de cardio da semana corrente.
 *
 * Sessão é `sessionKey` distinta, não série: dois sets na mesma sessão somam
 * duração/distância mas contam UMA sessão (mesmo raciocínio de
 * `progressoConsistencia` — série não é sessão). Sem nenhum set, a prescrição
 * inteira é `null`/`0` sessões: não há semana de cardio prescrita.
 */
export const somarPrescricaoSemana = (sets: readonly PlannedCardioSet[]): PrescricaoCardio => {
  let distanciaM: number | null = null;
  let duracaoSegundos: number | null = null;
  const sessoes = new Set<string>();

  for (const s of sets) {
    if (s.targetDistanceM != null) {
      distanciaM = (distanciaM ?? 0) + s.targetDistanceM;
    }
    if (s.targetDurationSeconds != null) {
      duracaoSegundos = (duracaoSegundos ?? 0) + s.targetDurationSeconds;
    }
    sessoes.add(s.sessionKey);
  }

  return { distanciaM, duracaoSegundos, sessoes: sessoes.size };
};

/** `ProgressoConsistencia` (realizado) + o lado prescrito, no vocabulário da tela. */
export type ProgressoPrescrito = ProgressoConsistencia & {
  /** Distância prescrita da semana, em km. Null quando a prescrição não define distância. */
  prescritoKm: number | null;
  /**
   * Sessões prescritas da semana. Null quando NENHUMA sessão de cardio foi
   * prescrita esta semana (não "prescrito zero") — a UI usa isso para decidir
   * entre "mostrar números" e "sem cardio prescrito esta semana".
   */
  prescritoSessoes: number | null;
  /**
   * Km realizado da semana, de QUALQUER modalidade — D-05. `null` só quando
   * NÃO há prescrição de km (nada a comparar); com prescrição e nenhuma
   * amostra, o valor é `0` (fato, mesma disciplina do resto deste arquivo).
   */
  realizadoKm: number | null;
  /** 0..1 — quanto do km prescrito já foi realizado. Mesmo padrão de `fracaoMinutos`/`fracaoSessoes`. */
  fracaoKm: number | null;
};

/**
 * Progresso prescrito × realizado da semana de `referencia`.
 *
 * O lado "realizado" reaproveita `progressoConsistencia` (NÃO duplica corte
 * de semana nem soma de minutos); o lado "prescrito" é derivado direto de
 * `prescricao`.
 */
export const progressoPrescrito = (
  logs: readonly CardioLog[],
  prescricao: PrescricaoCardio,
  referencia: Date = new Date(),
): ProgressoPrescrito => {
  const resultado = progressoConsistencia(
    logs,
    {
      weeklyMinutes: prescricao.duracaoSegundos != null ? prescricao.duracaoSegundos / 60 : null,
      weeklySessions: prescricao.sessoes > 0 ? prescricao.sessoes : null,
    },
    referencia,
  );

  // D-05: km é km — soma de QUALQUER modalidade, independente de troca.
  const metros = distanciaRealizadaSemanaM(logs, referencia);

  return {
    ...resultado,
    prescritoKm: prescricao.distanciaM != null ? prescricao.distanciaM / 1000 : null,
    prescritoSessoes: resultado.metaSessoes,
    // D-06: prescrito permanece cheio — nenhum desconto por sessão trocada.
    realizadoKm: prescricao.distanciaM != null ? (metros ?? 0) / 1000 : null,
    fracaoKm:
      prescricao.distanciaM != null && prescricao.distanciaM > 0
        ? Math.min(1, (metros ?? 0) / prescricao.distanciaM)
        : null,
  };
};
