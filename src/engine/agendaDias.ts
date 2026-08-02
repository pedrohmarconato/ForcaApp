// src/engine/agendaDias.ts
// Leitura dos dias de treino do aluno a partir de duas fontes:
// - training_plans.training_days: rótulos em pt sem acento (segunda, terca, ...)
// - questionario_usuario.dias_treino: códigos em inglês (mon, tue, ...)
//
// Sem I/O. As conversões são puras e determinísticas; a única exceção é
// localTodayISO, que precisa do relógio do aparelho por definição — quem depende
// dela recebe a data como parâmetro, para continuar testável.

import type { OffsetDaSemana } from './scheduleShift';

/** Data local do aparelho (YYYY-MM-DD): scheduled_date é um DATE de calendário;
 *  comparar com UTC viraria o dia mais cedo/tarde dependendo do fuso. */
export const localTodayISO = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** Dia do calendário como inteiro (dias desde a época), só com a parte YYYY-MM-DD.
 *  Mesma técnica do weeklyReplanner.ts para evitar fuso horário. */
const dayIndex = (isoDate: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

/** Soma dias a um dayIndex, devolvendo nova data ISO.
 *  Determinístico, não usa fuso do sistema. */
const dayIndexToISO = (dayIdx: number): string => {
  const ms = dayIdx * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Rótulos em pt sem acento → offset 0..6 (0=segunda).
 *  Aceita com acento também, maiúsculas/minúsculas e espaços em volta.
 *  Item desconhecido é ignorado. Entrada inválida devolve []. */
export const offsetsDeRotulosPt = (rotulos: unknown): OffsetDaSemana[] => {
  // Mapa: rótulo normalizado → offset
  const mapa: Record<string, OffsetDaSemana> = {
    segunda: 0,
    terca: 1,
    terça: 1,
    quarta: 2,
    quinta: 3,
    sexta: 4,
    sabado: 5,
    sábado: 5,
    domingo: 6,
  };

  if (!Array.isArray(rotulos)) return [];

  const offsets = new Set<OffsetDaSemana>();
  for (const r of rotulos) {
    if (typeof r !== 'string') continue;
    // Normaliza: minúsculas, remove acentos, trim
    const normalizado = r.trim().toLowerCase();
    const offset = mapa[normalizado];
    if (offset !== undefined) {
      offsets.add(offset);
    }
  }

  return Array.from(offsets).sort((a, b) => a - b);
};

/** Códigos do questionário (mon..sun) → offset 0..6.
 *  Aceita maiúsculas/minúsculas. Item desconhecido é ignorado.
 *  Entrada inválida devolve []. */
export const offsetsDeCodigosEn = (codigos: unknown): OffsetDaSemana[] => {
  const mapa: Record<string, OffsetDaSemana> = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };

  if (!Array.isArray(codigos)) return [];

  const offsets = new Set<OffsetDaSemana>();
  for (const c of codigos) {
    if (typeof c !== 'string') continue;
    const normalizado = c.trim().toLowerCase();
    const offset = mapa[normalizado];
    if (offset !== undefined) {
      offsets.add(offset);
    }
  }

  return Array.from(offsets).sort((a, b) => a - b);
};

/** ISO da segunda-feira da semana que contém a data dada.
 *  Usa Date.UTC para evitar fuso horário. Entrada malformada devolve null. */
export const segundaDaSemanaDe = (isoDate: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  // Validação: mês 01-12, dia 01-31
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms)) return null;

  // Validação adicional: a data criada deve coincidir com o que foi pedido
  // (detecta casos como 2026-02-30 que Date.UTC normaliza para março)
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const dayIdx = Math.round(ms / 86400000);
  const dayOfWeek = d.getUTCDay(); // 0=domingo, 1=segunda, ..., 6=sábado

  // Distância até a segunda-feira (0=segunda já é segunda, 1=terça volta 1 dia, etc)
  const diasParaVoltar = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const segundaDayIdx = dayIdx - diasParaVoltar;

  return dayIndexToISO(segundaDayIdx);
};
