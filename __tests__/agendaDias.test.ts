// __tests__/agendaDias.test.ts

import { offsetsDeRotulosPt, offsetsDeCodigosEn, segundaDaSemanaDe } from '../src/engine/agendaDias';

describe('offsetsDeRotulosPt', () => {
  it('converte rótulos pt sem acento em offsets ordenados', () => {
    expect(offsetsDeRotulosPt(['sexta', 'segunda'])).toEqual([0, 4]);
  });

  it('aceita rótulos com acento', () => {
    expect(offsetsDeRotulosPt(['terça', 'terca'])).toEqual([1]);
    expect(offsetsDeRotulosPt(['sábado', 'sabado'])).toEqual([5]);
  });

  it('ignora rótulos desconhecidos', () => {
    expect(offsetsDeRotulosPt(['segunda', 'bagunça', 'quinta'])).toEqual([0, 3]);
  });

  it('aceita maiúsculas e espaços em volta', () => {
    expect(offsetsDeRotulosPt(['  SEGUNDA  ', '  SEXTA  '])).toEqual([0, 4]);
    expect(offsetsDeRotulosPt(['Terça', 'QUARTA'])).toEqual([1, 2]);
  });

  it('remove duplicatas e retorna em ordem', () => {
    expect(offsetsDeRotulosPt(['sexta', 'segunda', 'sexta', 'segunda'])).toEqual([0, 4]);
  });

  it('retorna vazio para null', () => {
    expect(offsetsDeRotulosPt(null)).toEqual([]);
  });

  it('retorna vazio para objeto', () => {
    expect(offsetsDeRotulosPt({})).toEqual([]);
  });

  it('retorna vazio para array vazio', () => {
    expect(offsetsDeRotulosPt([])).toEqual([]);
  });

  it('retorna vazio para array com não-strings', () => {
    expect(offsetsDeRotulosPt([1, 2, null, undefined])).toEqual([]);
  });

  it('retorna apenas os offsets válidos de array misto', () => {
    expect(offsetsDeRotulosPt(['segunda', 1, 'bagunça', null, 'sexta'])).toEqual([0, 4]);
  });
});

describe('offsetsDeCodigosEn', () => {
  it('converte códigos en em offsets 0..6', () => {
    expect(offsetsDeCodigosEn(['mon', 'tue', 'wed', 'thu', 'fri'])).toEqual([0, 1, 2, 3, 4]);
  });

  it('converte sábado e domingo', () => {
    expect(offsetsDeCodigosEn(['sun', 'sat'])).toEqual([5, 6]);
  });

  it('aceita maiúsculas', () => {
    expect(offsetsDeCodigosEn(['MON', 'FRI', 'SUN'])).toEqual([0, 4, 6]);
    expect(offsetsDeCodigosEn(['Mon', 'Fri'])).toEqual([0, 4]);
  });

  it('aceita espaços em volta', () => {
    expect(offsetsDeCodigosEn(['  mon  ', '  fri  '])).toEqual([0, 4]);
  });

  it('remove duplicatas e retorna em ordem', () => {
    expect(offsetsDeCodigosEn(['fri', 'mon', 'fri', 'mon'])).toEqual([0, 4]);
  });

  it('ignora códigos desconhecidos', () => {
    expect(offsetsDeCodigosEn(['mon', 'invalid', 'fri'])).toEqual([0, 4]);
  });

  it('retorna vazio para null', () => {
    expect(offsetsDeCodigosEn(null)).toEqual([]);
  });

  it('retorna vazio para objeto', () => {
    expect(offsetsDeCodigosEn({})).toEqual([]);
  });

  it('retorna vazio para array vazio', () => {
    expect(offsetsDeCodigosEn([])).toEqual([]);
  });

  it('retorna vazio para array com não-strings', () => {
    expect(offsetsDeCodigosEn([1, 2, null, undefined])).toEqual([]);
  });

  it('retorna apenas os offsets válidos de array misto', () => {
    expect(offsetsDeCodigosEn(['mon', 1, 'invalid', null, 'fri'])).toEqual([0, 4]);
  });
});

describe('segundaDaSemanaDe', () => {
  it('calcula segunda de sábado 2026-08-01', () => {
    // 2026-08-01 é sábado
    expect(segundaDaSemanaDe('2026-08-01')).toBe('2026-07-27');
  });

  it('calcula segunda de segunda 2026-07-27', () => {
    // 2026-07-27 é segunda
    expect(segundaDaSemanaDe('2026-07-27')).toBe('2026-07-27');
  });

  it('calcula segunda de domingo 2026-08-02', () => {
    // 2026-08-02 é domingo
    expect(segundaDaSemanaDe('2026-08-02')).toBe('2026-07-27');
  });

  it('calcula segunda de terça 2026-07-28', () => {
    // 2026-07-28 é terça
    expect(segundaDaSemanaDe('2026-07-28')).toBe('2026-07-27');
  });

  it('calcula segunda de quarta 2026-07-29', () => {
    // 2026-07-29 é quarta
    expect(segundaDaSemanaDe('2026-07-29')).toBe('2026-07-27');
  });

  it('calcula segunda de quinta 2026-07-30', () => {
    // 2026-07-30 é quinta
    expect(segundaDaSemanaDe('2026-07-30')).toBe('2026-07-27');
  });

  it('calcula segunda de sexta 2026-07-31', () => {
    // 2026-07-31 é sexta
    expect(segundaDaSemanaDe('2026-07-31')).toBe('2026-07-27');
  });

  it('retorna null para entrada malformada', () => {
    expect(segundaDaSemanaDe('2026-13-01')).toBe(null);
    expect(segundaDaSemanaDe('2026-00-01')).toBe(null);
    expect(segundaDaSemanaDe('2026-08-32')).toBe(null);
    expect(segundaDaSemanaDe('lixo')).toBe(null);
    expect(segundaDaSemanaDe('')).toBe(null);
  });

  it('calcula segunda da semana seguinte corretamente', () => {
    // 2026-08-03 é segunda da semana seguinte
    expect(segundaDaSemanaDe('2026-08-03')).toBe('2026-08-03');
    // 2026-08-04 é terça da semana seguinte
    expect(segundaDaSemanaDe('2026-08-04')).toBe('2026-08-03');
  });
});
