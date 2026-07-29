// __tests__/planReorder.test.ts
// Motor puro da reordenação de treinos da semana (Fase 2).
//
// Invariante central: reordenar treinos PERMUTA as datas entre as sessões
// pendentes — o multiset de datas da semana é preservado por construção e as
// sessões fixas (completed/skipped/in_progress) nunca são tocadas.

import type { PlannedSession } from '../src/services/trainingRepository';
import {
  moveItem,
  pendentesOrdenadas,
  podeReordenarSemana,
  previewSemana,
  slotsPendentes,
} from '../src/engine/planReorder';

const sessao = (id: string, over: Partial<PlannedSession> = {}): PlannedSession => ({
  id,
  plan_id: 'plan-1',
  user_id: 'u1',
  week_number: 2,
  day_of_week: null,
  order_in_week: 1,
  title: `Treino ${id}`,
  session_type: null,
  scheduled_date: null,
  estimated_minutes: 45,
  status: 'pending',
  muscle_groups: [],
  ...over,
});

// Semana 2: seg (pendente), qua (concluída), sex e sáb (pendentes).
const semanaBase = [
  sessao('s1', { scheduled_date: '2026-08-03', order_in_week: 1 }),
  sessao('s2', { scheduled_date: '2026-08-05', order_in_week: 2, status: 'completed' }),
  sessao('s3', { scheduled_date: '2026-08-07', order_in_week: 3 }),
  sessao('s4', { scheduled_date: '2026-08-08', order_in_week: 4 }),
];

describe('moveItem', () => {
  it('move o item e devolve cópia (imutável)', () => {
    const arr = ['a', 'b', 'c'];
    expect(moveItem(arr, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(arr).toEqual(['a', 'b', 'c']);
  });

  it('índices fora do alcance devolvem o array original', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, 0, 2)).toBe(arr);
    expect(moveItem(arr, -1, 0)).toBe(arr);
    expect(moveItem(arr, 1, 1)).toBe(arr);
  });
});

describe('podeReordenarSemana', () => {
  it('exige 2+ pendentes, todas com data', () => {
    expect(podeReordenarSemana(semanaBase)).toBe(true);
  });

  it('false com menos de 2 pendentes (fixas não contam)', () => {
    const semana = [
      sessao('s1', { scheduled_date: '2026-08-03' }),
      sessao('s2', { scheduled_date: '2026-08-05', status: 'completed' }),
      sessao('s3', { scheduled_date: '2026-08-07', status: 'skipped' }),
    ];
    expect(podeReordenarSemana(semana)).toBe(false);
  });

  it('false quando alguma pendente está sem data', () => {
    const semana = [
      sessao('s1', { scheduled_date: '2026-08-03' }),
      sessao('s3', { scheduled_date: null }),
    ];
    expect(podeReordenarSemana(semana)).toBe(false);
  });
});

describe('slotsPendentes / pendentesOrdenadas', () => {
  it('slots são as datas das pendentes em ordem; fixas ficam de fora', () => {
    expect(slotsPendentes(semanaBase)).toEqual(['2026-08-03', '2026-08-07', '2026-08-08']);
    expect(pendentesOrdenadas(semanaBase).map((s) => s.id)).toEqual(['s1', 's3', 's4']);
  });

  it('desempate determinístico com datas duplicadas: order_in_week, depois id', () => {
    const semana = [
      sessao('b', { scheduled_date: '2026-08-03', order_in_week: 2 }),
      sessao('a', { scheduled_date: '2026-08-03', order_in_week: 1 }),
      sessao('d', { scheduled_date: '2026-08-03', order_in_week: 3 }),
      sessao('c', { scheduled_date: '2026-08-03', order_in_week: 3 }),
    ];
    expect(pendentesOrdenadas(semana).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('previewSemana', () => {
  it('pendente i recebe o slot i; multiset de datas preservado; fixa intocada', () => {
    // Nova ordem escolhida: sáb primeiro, sex depois, seg por último.
    const preview = previewSemana(semanaBase, ['s4', 's3', 's1']);

    const porId = new Map(preview.map((s) => [s.id, s]));
    expect(porId.get('s4')!.scheduled_date).toBe('2026-08-03');
    expect(porId.get('s3')!.scheduled_date).toBe('2026-08-07');
    expect(porId.get('s1')!.scheduled_date).toBe('2026-08-08');
    // Fixa (concluída) mantém a própria data.
    expect(porId.get('s2')!.scheduled_date).toBe('2026-08-05');

    // Multiset de datas preservado.
    expect(preview.map((s) => s.scheduled_date).sort()).toEqual(
      semanaBase.map((s) => s.scheduled_date).sort(),
    );

    // Exibição na ordem da fila real (por data prevista), fixa no meio.
    expect(preview.map((s) => s.id)).toEqual(['s4', 's2', 's3', 's1']);
  });

  it('não muta as sessões originais', () => {
    previewSemana(semanaBase, ['s4', 's3', 's1']);
    expect(semanaBase.find((s) => s.id === 's4')!.scheduled_date).toBe('2026-08-08');
  });

  it('semana com sessão concluída NO MEIO: slots contornam a fixa', () => {
    // Pendentes: seg e sex. Concluída: qua. Inverter as pendentes troca
    // seg↔sex; a qua fica exatamente onde está.
    const semana = [
      sessao('p1', { scheduled_date: '2026-08-03', order_in_week: 1 }),
      sessao('f1', { scheduled_date: '2026-08-05', order_in_week: 2, status: 'in_progress' }),
      sessao('p2', { scheduled_date: '2026-08-07', order_in_week: 3 }),
    ];
    const preview = previewSemana(semana, ['p2', 'p1']);
    expect(preview.map((s) => `${s.id}:${s.scheduled_date}`)).toEqual([
      'p2:2026-08-03',
      'f1:2026-08-05',
      'p1:2026-08-07',
    ]);
  });
});
