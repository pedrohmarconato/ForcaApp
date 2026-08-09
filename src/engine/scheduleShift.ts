// src/engine/scheduleShift.ts
// Reancoragem SEMANAL de sessões pendentes com atraso.
//
// Regra do dono (2026-08-08): a semana só fecha no domingo — sábado e domingo
// contam como janela de conclusão: para alunos COM agenda, a reancoragem
// oferece os slots do fim de semana além dos dias da agenda. Aluno com agenda
// vazia segue o comportamento pré-existente (no-op — reancorarSemana retorna
// cedo, sem oferecer slot algum).
//
// Invariante: Reancoragem empurra para frente; nunca antecipa.
// Cada sessão tem um PISO = max(scheduledDate ?? hojeISO, hojeISO):
// - Sessão atrasada (data < hoje) → piso = hoje: flui para frente até o primeiro slot livre.
// - Sessão futura (data >= hoje) → piso = sua própria data: nunca é antecipada; só desliza
//   para frente se o slot dela foi tomado por uma atrasada que veio antes na fila.
//
// Algoritmo: percorra a fila em ordem (já ordenada por data crescente); para cada sessão,
// pegue o primeiro slot ainda não usado cuja data >= piso. Um ponteiro único sobre o array
// de slots basta (piso é monotônico não-decrescente ao longo da fila).
//
// Puro (sem I/O, sem Date.now(), sem inventar datas).

/** Dia da semana como offset a partir de segunda: 0=segunda … 6=domingo.
 *  Mesma régua do backend (plan_mapper._NOME_DIA_POR_OFFSET). */
export type OffsetDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SessaoParaReancorar = {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  scheduledDate: string | null;
  orderInWeek: number;
};

export type PlanoDeReancoragem = {
  movidas: { id: string; de: string | null; para: string }[];
  mantidas: string[];
  semEncaixe: string[];
};

/** Dia do calendário como inteiro (dias desde a época), só com a parte YYYY-MM-DD.
 *  Mesma técnica do weeklyReplanner.ts para evitar fuso horário. */
const dayIndex = (isoDate: string | null): number | null => {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

/** Soma dias a uma data ISO YYYY-MM-DD, devolvendo nova data ISO.
 *  Determinístico, não usa fuso do sistema. */
const adicionarDias = (isoDate: string, dias: number): string => {
  const ms = dayIndex(isoDate);
  if (ms === null) return isoDate; // malformado: retorna como está
  const novaMs = ms + dias;
  const novaData = new Date(novaMs * 86400000);
  const y = novaData.getUTCFullYear();
  const m = String(novaData.getUTCMonth() + 1).padStart(2, '0');
  const d = String(novaData.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** True quando a data cai em sábado (6) ou domingo (0) — dia de fim de semana. */
const ehFimDeSemana = (isoDate: string): boolean => {
  const ms = dayIndex(isoDate);
  if (ms === null) return false; // malformado: não é fim de semana
  const dow = new Date(ms * 86400000).getUTCDay();
  return dow === 0 || dow === 6;
};

/** Fila de pendentes ordenada pela ordem da fiação real:
 *  (scheduledDate ?? '9999-12-31', orderInWeek, id). */
const filaPendentes = (sessoes: SessaoParaReancorar[]): SessaoParaReancorar[] => {
  return sessoes
    .filter((s) => s.status === 'pending')
    .sort((a, b) => {
      const da = a.scheduledDate ?? '9999-12-31';
      const db = b.scheduledDate ?? '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      if (a.orderInWeek !== b.orderInWeek) return a.orderInWeek - b.orderInWeek;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
};

/** Calcula os slots disponíveis (datas do calendário) com base nos offsets da agenda.
 *  Sábado (5) e domingo (6) entram sempre: a semana só fecha no domingo, então o
 *  fim de semana inteiro é janela de conclusão mesmo fora da agenda (chamado só
 *  com agenda não vazia — agenda vazia é no-op em reancorarSemana).
 *  Remove slots anteriores a hoje e ocupados por sessões não pendentes ou por
 *  pending não-atrasada do fim de semana (dona do dia). */
const slotsDisponiveis = (params: {
  sessoes: SessaoParaReancorar[];
  agenda: readonly OffsetDaSemana[];
  segundaDaSemanaISO: string;
  hojeISO: string;
}): string[] => {
  const { sessoes, agenda, segundaDaSemanaISO, hojeISO } = params;
  const today = dayIndex(hojeISO);

  // Deduplica e ordena os offsets: agenda do aluno ∪ fim de semana inteiro.
  const offsetsUnicos = Array.from(new Set([...agenda, 5, 6])).sort((a, b) => a - b);

  // Calcula as datas absolutas dos slots
  const slotsAbsolutos: string[] = offsetsUnicos.map((offset) =>
    adicionarDias(segundaDaSemanaISO, offset),
  );

  // Identifica datas ocupadas: sessões não pendentes (fixas) + sessão pending
  // NÃO-atrasada agendada para o fim de semana (dona legítima do dia — ela não
  // entra na atribuição e o servidor rejeitaria (Validação 8, 55000) se uma
  // atrasada fosse atribuída para a data dela). Pending atrasada libera o slot:
  // entra na fila e será movida.
  // Normaliza para YYYY-MM-DD (ignora sufixo de hora) para comparar corretamente
  const ocupadas = new Set<string>();
  for (const s of sessoes) {
    if (!s.scheduledDate) continue;
    const normalizado = s.scheduledDate.substring(0, 10);
    if (s.status !== 'pending') {
      ocupadas.add(normalizado);
      continue;
    }
    const data = dayIndex(normalizado);
    if (
      data !== null &&
      today !== null &&
      data >= today &&
      ehFimDeSemana(normalizado)
    ) {
      ocupadas.add(normalizado);
    }
  }

  // Filtra: remove slots anteriores a hoje e ocupados por fixas
  const disponiveis: string[] = [];
  for (const slot of slotsAbsolutos) {
    const slotDay = dayIndex(slot);
    if (slotDay === null) continue; // malformado
    if (today !== null && slotDay < today) continue; // no passado
    if (ocupadas.has(slot)) continue; // já ocupado
    disponiveis.push(slot);
  }

  return disponiveis;
};

/** Verifica se há pendente com data válida anterior a hoje. */
export const precisaReancorar = (
  sessoes: SessaoParaReancorar[],
  hojeISO: string,
): boolean => {
  const today = dayIndex(hojeISO);
  if (today === null) return false;

  for (const s of sessoes) {
    if (s.status !== 'pending') continue;
    if (!s.scheduledDate) continue; // sem data: não é atraso

    const scheduled = dayIndex(s.scheduledDate);
    if (scheduled === null) continue; // malformado: ignora

    if (scheduled < today) return true;
  }

  return false;
};

/** Reancora sessões pendentes em slots disponíveis da semana.
 *  Implementa a invariante: empurra atrasadas, nunca antecipa futuras. */
export const reancorarSemana = (params: {
  sessoes: SessaoParaReancorar[];
  hojeISO: string;
  agenda: readonly OffsetDaSemana[];
  segundaDaSemanaISO: string;
}): PlanoDeReancoragem => {
  const { sessoes, hojeISO, agenda, segundaDaSemanaISO } = params;

  // Caso especial: agenda vazia → no-op
  if (agenda.length === 0) {
    const pendentes = filaPendentes(sessoes);
    return {
      movidas: [],
      mantidas: pendentes.map((s) => s.id),
      semEncaixe: [],
    };
  }

  // Fila: sessões pendentes na ordem da fiação real
  const fila = filaPendentes(sessoes);

  // Slots: datas disponíveis para reancoragem
  const slots = slotsDisponiveis({
    sessoes,
    agenda,
    segundaDaSemanaISO,
    hojeISO,
  });

  const hojeDay = dayIndex(hojeISO);
  if (hojeDay === null) {
    // Hoje malformado: não consegue calcular pisos, retorna as pendentes como "mantidas"
    return {
      movidas: [],
      mantidas: fila.map((s) => s.id),
      semEncaixe: [],
    };
  }

  const movidas: { id: string; de: string | null; para: string }[] = [];
  const mantidas: string[] = [];
  const semEncaixe: string[] = [];

  // Ponteiro único sobre os slots (piso é monotônico não-decrescente)
  let slotIndex = 0;

  // Atribui cada sessão da fila a um slot, respeitando seu piso
  for (const sessao of fila) {
    // Calcula o piso da sessão: não pode ficar antes de sua data original nem de hoje
    const dataOriginal = sessao.scheduledDate ? dayIndex(sessao.scheduledDate) : null;

    // Sessão pending NÃO-atrasada agendada para o fim de semana é dona do dia:
    // o slot dela está reservado (slotsDisponiveis) e ela não entra na
    // atribuição — permanece mantida na data original. É o contrato com o
    // servidor: atribuir uma atrasada para a data dela seria rejeitado.
    if (
      sessao.status === 'pending' &&
      dataOriginal !== null &&
      dataOriginal >= hojeDay &&
      sessao.scheduledDate !== null &&
      ehFimDeSemana(sessao.scheduledDate)
    ) {
      mantidas.push(sessao.id);
      continue;
    }

    const pisoDay = dataOriginal !== null && dataOriginal >= hojeDay
      ? dataOriginal
      : hojeDay;

    // Busca o primeiro slot cujo dayIndex >= pisoDay
    while (slotIndex < slots.length) {
      const slotDay = dayIndex(slots[slotIndex]);
      if (slotDay === null) {
        // Slot malformado: pula
        slotIndex++;
        continue;
      }

      if (slotDay >= pisoDay) {
        // Encontrou um slot válido para esta sessão
        const novaData = slots[slotIndex];
        slotIndex++;

        if (sessao.scheduledDate === novaData) {
          // Data não mudou
          mantidas.push(sessao.id);
        } else {
          // Data mudou
          movidas.push({
            id: sessao.id,
            de: sessao.scheduledDate,
            para: novaData,
          });
        }
        break;
      }

      // Slot é anterior ao piso: passa para o próximo slot
      slotIndex++;
    }

    // Se saiu do loop sem encontrar slot, a sessão vai para semEncaixe
    if (slotIndex >= slots.length &&
        !movidas.some((m) => m.id === sessao.id) &&
        !mantidas.includes(sessao.id)) {
      semEncaixe.push(sessao.id);
    }
  }

  return { movidas, mantidas, semEncaixe };
};
