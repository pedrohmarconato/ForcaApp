// Verificação independente do motor de reancoragem — escrita pelo revisor, não
// pelo autor do módulo. Arquivo TEMPORÁRIO: apagar antes do commit.
import { reancorarSemana, precisaReancorar } from '../src/engine/scheduleShift';
import type { SessaoParaReancorar, OffsetDaSemana } from '../src/engine/scheduleShift';

const SEG = '2026-07-27'; // segunda
const AGENDA: OffsetDaSemana[] = [0, 1, 2, 3, 4];

const s = (
  id: string,
  data: string | null,
  ordem: number,
  status: SessaoParaReancorar['status'] = 'pending',
): SessaoParaReancorar => ({ id, scheduledDate: data, orderInWeek: ordem, status });

describe('verificação independente — invariantes', () => {
  test('nunca antecipa: semana inteira futura fica parada', () => {
    const r = reancorarSemana({
      sessoes: [s('a', '2026-07-29', 3), s('b', '2026-07-30', 4), s('c', '2026-07-31', 5)],
      hojeISO: '2026-07-28',
      agenda: AGENDA,
      segundaDaSemanaISO: SEG,
    });
    expect(r.movidas).toEqual([]);
    expect(r.mantidas.sort()).toEqual(['a', 'b', 'c']);
    expect(r.semEncaixe).toEqual([]);
  });

  test('uma atrasada ocupa o buraco de hoje sem mexer nas futuras', () => {
    const r = reancorarSemana({
      sessoes: [
        s('seg', '2026-07-27', 1),
        s('qua', '2026-07-29', 3),
        s('qui', '2026-07-30', 4),
        s('sex', '2026-07-31', 5),
      ],
      hojeISO: '2026-07-28', // terça, livre
      agenda: AGENDA,
      segundaDaSemanaISO: SEG,
    });
    expect(r.movidas).toEqual([{ id: 'seg', de: '2026-07-27', para: '2026-07-28' }]);
    expect(r.mantidas.sort()).toEqual(['qua', 'qui', 'sex']);
    expect(r.semEncaixe).toEqual([]);
  });

  test('nenhuma data se repete na saída, nem contra sessão fixa', () => {
    const r = reancorarSemana({
      sessoes: [
        s('feita', '2026-07-29', 1, 'completed'),
        s('p1', '2026-07-27', 2),
        s('p2', '2026-07-27', 3),
        s('p3', '2026-07-27', 4),
      ],
      hojeISO: '2026-07-28',
      agenda: AGENDA,
      segundaDaSemanaISO: SEG,
    });
    const finais = [
      ...r.movidas.map((m) => m.para),
      // mantidas conservam a data original
      ...r.mantidas.map((id) => ['p1', 'p2', 'p3'].includes(id) ? '2026-07-27' : ''),
    ].filter(Boolean);
    expect(new Set(finais).size).toBe(finais.length);
    expect(finais).not.toContain('2026-07-29'); // dia da sessão concluída
  });

  test('toda pendente aparece em exatamente uma das três listas', () => {
    const sessoes = [
      s('a', '2026-07-27', 1),
      s('b', '2026-07-27', 2),
      s('c', '2026-07-27', 3),
      s('d', '2026-07-27', 4),
      s('e', '2026-07-27', 5),
      s('fixa', '2026-07-28', 6, 'skipped'),
    ];
    const r = reancorarSemana({
      sessoes,
      hojeISO: '2026-07-29',
      agenda: AGENDA,
      segundaDaSemanaISO: SEG,
    });
    const todos = [...r.movidas.map((m) => m.id), ...r.mantidas, ...r.semEncaixe];
    expect(todos.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(new Set(todos).size).toBe(5);
  });

  test('pendente sem data não some nem colide', () => {
    const r = reancorarSemana({
      sessoes: [s('semdata', null, 9), s('atras', '2026-07-27', 1)],
      hojeISO: '2026-07-28',
      agenda: AGENDA,
      segundaDaSemanaISO: SEG,
    });
    const todos = [...r.movidas.map((m) => m.id), ...r.mantidas, ...r.semEncaixe];
    expect(todos.sort()).toEqual(['atras', 'semdata']);
    const datas = r.movidas.map((m) => m.para);
    expect(new Set(datas).size).toBe(datas.length);
  });

  test('precisaReancorar ignora sessão já concluída com data velha', () => {
    expect(
      precisaReancorar([s('feita', '2026-07-20', 1, 'completed')], '2026-07-28'),
    ).toBe(false);
    expect(precisaReancorar([s('p', '2026-07-20', 1)], '2026-07-28')).toBe(true);
  });
});
