// __tests__/weekSummary.test.ts
// Agregações de apresentação da Home e do Perfil.
//
// O ponto destes testes é garantir que nenhuma saída "inventa" número:
// amostra vazia devolve zero/null, dado quebrado devolve null, e sessão sem
// término registrado NÃO conta como treino concluído.

import {
  resumirSemana,
  duracaoEmMinutos,
  minutosTotais,
  formatarDuracao,
  formatarDataCurta,
  inicioDaSemana,
  DIAS_DA_SEMANA,
} from '../src/utils/weekSummary';

// Quarta-feira, 15 de julho de 2026, meio-dia local.
const QUARTA = new Date(2026, 6, 15, 12, 0, 0);

/** Cria uma sessão concluída em um dia/hora local da semana de referência. */
const sessaoEm = (dia: number, horaInicio: number, duracaoMin: number) => {
  const inicio = new Date(2026, 6, dia, horaInicio, 0, 0);
  const fim = new Date(inicio.getTime() + duracaoMin * 60000);
  return { startedAt: inicio.toISOString(), finishedAt: fim.toISOString() };
};

describe('inicioDaSemana', () => {
  it('volta para a segunda-feira à meia-noite local', () => {
    const inicio = inicioDaSemana(QUARTA);

    expect(inicio.getDate()).toBe(13); // segunda, 13/07/2026
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
  });

  it('trata domingo como último dia da semana, não como o primeiro', () => {
    const domingo = new Date(2026, 6, 19, 10, 0, 0);

    expect(inicioDaSemana(domingo).getDate()).toBe(13);
  });
});

describe('resumirSemana', () => {
  it('devolve zero e nenhum dia marcado quando não há sessões', () => {
    const resumo = resumirSemana([], QUARTA);

    expect(resumo.concluidas).toBe(0);
    expect(resumo.diasComTreino).toEqual([false, false, false, false, false, false, false]);
  });

  it('conta apenas sessões concluídas dentro da semana de referência', () => {
    const resumo = resumirSemana(
      [
        sessaoEm(13, 7, 50), // segunda — dentro
        sessaoEm(16, 19, 45), // quinta — dentro
        sessaoEm(6, 7, 60), // semana anterior — fora
        sessaoEm(21, 7, 60), // semana seguinte — fora
      ],
      QUARTA,
    );

    expect(resumo.concluidas).toBe(2);
    expect(resumo.diasComTreino).toEqual([true, false, false, true, false, false, false]);
    expect(DIAS_DA_SEMANA[0]).toBe('SEG');
  });

  it('NÃO conta sessão sem término registrado', () => {
    const emAndamento = {
      startedAt: new Date(2026, 6, 15, 8, 0, 0).toISOString(),
      finishedAt: null,
    };

    const resumo = resumirSemana([emAndamento], QUARTA);

    expect(resumo.concluidas).toBe(0);
    expect(resumo.diasComTreino.some(Boolean)).toBe(false);
  });

  it('ignora carimbo de data inválido em vez de propagar NaN', () => {
    const quebrada = { startedAt: 'nao-e-data', finishedAt: 'tambem-nao' };

    const resumo = resumirSemana([quebrada, sessaoEm(13, 7, 50)], QUARTA);

    expect(resumo.concluidas).toBe(1);
  });

  it('dois treinos no mesmo dia marcam o dia uma vez e contam duas', () => {
    const resumo = resumirSemana([sessaoEm(14, 7, 40), sessaoEm(14, 19, 40)], QUARTA);

    expect(resumo.concluidas).toBe(2);
    expect(resumo.diasComTreino.filter(Boolean)).toHaveLength(1);
  });
});

describe('duracaoEmMinutos', () => {
  it('calcula a duração real a partir dos carimbos', () => {
    expect(duracaoEmMinutos(sessaoEm(13, 7, 48))).toBe(48);
  });

  it('devolve null quando falta o término', () => {
    expect(
      duracaoEmMinutos({ startedAt: new Date().toISOString(), finishedAt: null }),
    ).toBeNull();
  });

  it('devolve null quando o término é anterior ao início (dado incoerente)', () => {
    const inicio = new Date(2026, 6, 13, 10, 0, 0);
    const fim = new Date(2026, 6, 13, 9, 0, 0);

    expect(
      duracaoEmMinutos({ startedAt: inicio.toISOString(), finishedAt: fim.toISOString() }),
    ).toBeNull();
  });

  it('devolve null para carimbo inválido', () => {
    expect(duracaoEmMinutos({ startedAt: 'x', finishedAt: 'y' })).toBeNull();
  });
});

describe('minutosTotais', () => {
  it('soma só as durações conhecidas', () => {
    const total = minutosTotais([
      sessaoEm(13, 7, 50),
      sessaoEm(16, 19, 40),
      { startedAt: new Date().toISOString(), finishedAt: null },
    ]);

    expect(total).toBe(90);
  });

  it('devolve null para amostra vazia — sem dado não é zero (achado #3)', () => {
    expect(minutosTotais([])).toBeNull();
  });

  it('devolve null quando nenhuma sessão tem duração conhecida', () => {
    expect(
      minutosTotais([
        { startedAt: new Date().toISOString(), finishedAt: null },
        { startedAt: 'x', finishedAt: 'y' },
      ]),
    ).toBeNull();
  });

  it('arredonda o total UMA vez, não sessão a sessão (achado #4)', () => {
    // Duas sessões de 30min31s: o total real é 61min02s.
    // Arredondar cada uma (31 + 31 = 62) inflaria o total em 1 minuto.
    const sessaoDe = (inicioMin: number) => {
      const inicio = new Date(2026, 6, 13, 7, inicioMin, 0);
      const fim = new Date(inicio.getTime() + 30 * 60000 + 31000);
      return { startedAt: inicio.toISOString(), finishedAt: fim.toISOString() };
    };

    expect(minutosTotais([sessaoDe(0), sessaoDe(40)])).toBe(61);
  });
});

describe('formatarDuracao', () => {
  it('formata minutos, horas cheias e horas com resto', () => {
    expect(formatarDuracao(48)).toBe('48 min');
    expect(formatarDuracao(120)).toBe('2h');
    expect(formatarDuracao(80)).toBe('1h 20min');
  });

  it('devolve null para ausência de dado ou valor inválido', () => {
    expect(formatarDuracao(null)).toBeNull();
    expect(formatarDuracao(-5)).toBeNull();
    expect(formatarDuracao(Number.NaN)).toBeNull();
  });
});

describe('formatarDataCurta', () => {
  it('formata a data em pt-BR sem ponto abreviativo', () => {
    const formatada = formatarDataCurta(new Date(2026, 6, 14, 12, 0, 0).toISOString());

    expect(formatada).toContain('14');
    expect(formatada).not.toContain('.');
  });

  it('devolve null para nulo ou carimbo inválido', () => {
    expect(formatarDataCurta(null)).toBeNull();
    expect(formatarDataCurta('nao-e-data')).toBeNull();
  });
});
