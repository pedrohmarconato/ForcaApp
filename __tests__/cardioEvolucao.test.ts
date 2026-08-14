// __tests__/cardioEvolucao.test.ts
// Motor puro do gráfico de evolução de cardio. Modos de falha cobertos:
//
//  1. eixo X fora de ordem: `montarSerieEvolucao` precisa devolver ASCENDENTE
//     por completedAt, mesmo recebendo `logs` na ordem decrescente que
//     `getCardioLogs` entrega;
//  2. pace inventado: série sem distância (bike sem hodômetro) não pode virar
//     "0:00 /km" — precisa ser `null`;
//  3. lista vazia não é "sem modalidade" travando em exceção — é lista vazia;
//  4. `modalidadesDisponiveis` precisa deduplicar por identity (não por nome)
//     e ordenar por contagem, não por ordem de chegada;
//  5. rótulos pt-BR: vírgula decimal no km, "dd/mm" na data — não o formato
//     ISO nem o "en-US" do `toLocaleDateString` sem locale.

import {
  formatarDataCurtaEixo,
  formatarKmComVirgula,
  modalidadesDisponiveis,
  montarSerieEvolucao,
} from '../src/engine/cardioEvolucao';
import type { CardioLog } from '../src/engine/cardioGoals';

const log = (
  identity: string,
  name: string,
  durationSeconds: number | null,
  distanceM: number | null,
  completedAt: string,
): CardioLog => ({ identity, name, durationSeconds, distanceM, completedAt });

describe('montarSerieEvolucao', () => {
  it('modo de falha 1: ordena ASCENDENTE por completedAt, mesmo recebendo logs em ordem decrescente', () => {
    const logs = [
      log('k:corrida', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z'),
      log('k:corrida', 'Corrida', 1600, 5000, '2026-08-05T09:00:00Z'),
      log('k:corrida', 'Corrida', 1400, 5000, '2026-08-19T09:00:00Z'),
    ];

    const serie = montarSerieEvolucao(logs, 'k:corrida');

    expect(serie.map((p) => p.completedAt)).toEqual([
      '2026-08-05T09:00:00Z',
      '2026-08-12T09:00:00Z',
      '2026-08-19T09:00:00Z',
    ]);
  });

  it('cada set_log vira um ponto — duas execuções no mesmo dia não são agrupadas', () => {
    const logs = [
      log('k:bike', 'Bicicleta Ergométrica', 1200, 4000, '2026-08-10T07:00:00Z'),
      log('k:bike', 'Bicicleta Ergométrica', 1800, 6000, '2026-08-10T19:00:00Z'),
    ];

    const serie = montarSerieEvolucao(logs, 'k:bike');

    expect(serie).toHaveLength(2);
  });

  it('filtra só a modalidade pedida por identity', () => {
    const logs = [
      log('k:corrida', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z'),
      log('k:bike', 'Bicicleta Ergométrica', 1200, 4000, '2026-08-10T07:00:00Z'),
    ];

    const serie = montarSerieEvolucao(logs, 'k:corrida');

    expect(serie).toHaveLength(1);
    expect(serie[0].distanciaM).toBe(5000);
  });

  it('modo de falha 2: sem distância (distanceM null) o pace do ponto é null, nunca 0', () => {
    const logs = [log('k:bike', 'Bicicleta Ergométrica', 1200, null, '2026-08-10T07:00:00Z')];

    const serie = montarSerieEvolucao(logs, 'k:bike');

    expect(serie[0].paceSecPorKm).toBeNull();
    expect(serie[0].distanciaM).toBeNull();
  });

  it('modo de falha 2b: distância zero também não sustenta pace — continua null', () => {
    const logs = [log('k:bike', 'Bicicleta Ergométrica', 1200, 0, '2026-08-10T07:00:00Z')];

    const serie = montarSerieEvolucao(logs, 'k:bike');

    expect(serie[0].paceSecPorKm).toBeNull();
  });

  it('com duração e distância válidas, o pace do ponto é derivado (segundos por km)', () => {
    // 1500 s em 5000 m = 300 s/km.
    const logs = [log('k:corrida', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z')];

    const serie = montarSerieEvolucao(logs, 'k:corrida');

    expect(serie[0].paceSecPorKm).toBe(300);
  });

  it('modo de falha 3: lista vazia devolve série vazia, não lança exceção', () => {
    expect(montarSerieEvolucao([], 'k:corrida')).toEqual([]);
  });

  it('identity sem nenhum log correspondente devolve série vazia', () => {
    const logs = [log('k:corrida', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z')];

    expect(montarSerieEvolucao(logs, 'k:bike')).toEqual([]);
  });

  it('carimbo inválido não entra no gráfico em vez de virar um ponto "Invalid Date"', () => {
    const logs = [
      log('k:corrida', 'Corrida', 1500, 5000, 'não-é-uma-data'),
      log('k:corrida', 'Corrida', 1400, 5000, '2026-08-12T09:00:00Z'),
    ];

    const serie = montarSerieEvolucao(logs, 'k:corrida');

    expect(serie).toHaveLength(1);
    expect(serie[0].completedAt).toBe('2026-08-12T09:00:00Z');
  });
});

describe('modalidadesDisponiveis', () => {
  it('modo de falha 3: lista vazia devolve lista vazia', () => {
    expect(modalidadesDisponiveis([])).toEqual([]);
  });

  it('modo de falha 4: deduplica por identity, não por nome, e conta os pontos', () => {
    const logs = [
      log('k:corrida', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z'),
      log('k:corrida', 'Corrida', 1600, 5000, '2026-08-05T09:00:00Z'),
      log('k:bike', 'Bicicleta Ergométrica', 1200, 4000, '2026-08-10T07:00:00Z'),
    ];

    const modalidades = modalidadesDisponiveis(logs);

    expect(modalidades).toEqual(
      expect.arrayContaining([
        { identity: 'k:corrida', name: 'Corrida', pontos: 2 },
        { identity: 'k:bike', name: 'Bicicleta Ergométrica', pontos: 1 },
      ]),
    );
  });

  it('modo de falha 4b: ordena por contagem DESC, não pela ordem de chegada dos logs', () => {
    const logs = [
      log('k:bike', 'Bicicleta Ergométrica', 1200, 4000, '2026-08-10T07:00:00Z'),
      log('k:corrida', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z'),
      log('k:corrida', 'Corrida', 1600, 5000, '2026-08-05T09:00:00Z'),
      log('k:corrida', 'Corrida', 1400, 5000, '2026-08-19T09:00:00Z'),
    ];

    const modalidades = modalidadesDisponiveis(logs);

    expect(modalidades[0].identity).toBe('k:corrida');
    expect(modalidades[0].pontos).toBe(3);
    expect(modalidades[1].identity).toBe('k:bike');
  });

  it('mesmo nome com identity diferente (troca de catálogo) conta como duas modalidades', () => {
    const logs = [
      log('k:corrida-antiga', 'Corrida', 1500, 5000, '2026-08-12T09:00:00Z'),
      log('corrida', 'Corrida', 1600, 5000, '2026-08-05T09:00:00Z'),
    ];

    expect(modalidadesDisponiveis(logs)).toHaveLength(2);
  });
});

describe('rótulos de eixo — formatarDataCurtaEixo', () => {
  it('modo de falha 5: formata "dd/mm" em pt-BR, não ISO nem mês por extenso', () => {
    expect(formatarDataCurtaEixo('2026-08-13T12:00:00')).toBe('13/08');
  });

  it('preenche dia e mês com zero à esquerda quando necessário', () => {
    expect(formatarDataCurtaEixo('2026-01-05T12:00:00')).toBe('05/01');
  });

  it('carimbo inválido devolve travessão, não "Invalid Date"', () => {
    expect(formatarDataCurtaEixo('lixo')).toBe('—');
  });
});

describe('rótulos de eixo — formatarKmComVirgula', () => {
  it('modo de falha 5: usa vírgula decimal, não ponto', () => {
    expect(formatarKmComVirgula(2.4)).toBe('2,4');
  });

  it('km inteiro não ganha ",0" à toa', () => {
    expect(formatarKmComVirgula(5)).toBe('5');
  });

  it('arredonda para uma casa decimal', () => {
    expect(formatarKmComVirgula(2.449)).toBe('2,4');
    expect(formatarKmComVirgula(2.46)).toBe('2,5');
  });

  it('zero km é fato, não vira travessão — o motor de rótulo não decide isso', () => {
    expect(formatarKmComVirgula(0)).toBe('0');
  });
});
