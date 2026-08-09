// __tests__/cardioPrescrito.test.ts
// REQ-02 (D-02/CONTEXT.md): a meta de cardio deixa de ser definição paralela
// ao treino e passa a ser prescrito × realizado, lido do plano ativo. Mesma
// disciplina de cardioGoals.ts: sem amostra é `null`; zero sessão prescrita
// é fato quando o array de entrada é vazio, mas isso NÃO torna a distância/
// duração prescritas "zero" — continuam `null`.

import {
  progressoPrescrito,
  somarPrescricaoSemana,
  type PlannedCardioSet,
  type PrescricaoCardio,
} from '../src/engine/cardioPrescrito';
import type { CardioLog } from '../src/engine/cardioGoals';

const set = (
  targetDistanceM: number | null,
  targetDurationSeconds: number | null,
  sessionKey: string,
): PlannedCardioSet => ({ targetDistanceM, targetDurationSeconds, sessionKey });

const log = (
  name: string,
  durationSeconds: number | null,
  distanceM: number | null,
  completedAt: string,
): CardioLog => ({ identity: `k:${name}`, name, durationSeconds, distanceM, completedAt });

describe('somarPrescricaoSemana', () => {
  it('array vazio: nenhuma prescrição não é prescrição zero', () => {
    expect(somarPrescricaoSemana([])).toEqual({
      distanciaM: null,
      duracaoSegundos: null,
      sessoes: 0,
    });
  });

  it('dois sets na mesma sessão somam duração e contam UMA sessão', () => {
    const p = somarPrescricaoSemana([set(null, 600, '2026-08-10'), set(null, 600, '2026-08-10')]);

    expect(p.duracaoSegundos).toBe(1200);
    expect(p.sessoes).toBe(1);
  });

  it('sets em sessões distintas somam prescrição e contam sessões distintas', () => {
    const p = somarPrescricaoSemana([
      set(5000, 1800, '2026-08-10'),
      set(3000, 1200, '2026-08-12'),
    ]);

    expect(p.distanciaM).toBe(8000);
    expect(p.duracaoSegundos).toBe(3000);
    expect(p.sessoes).toBe(2);
  });

  it('distância mista com null soma só os sets com valor', () => {
    const p = somarPrescricaoSemana([set(5000, null, '2026-08-10'), set(null, null, '2026-08-12')]);

    expect(p.distanciaM).toBe(5000);
  });

  it('todos os sets sem distância: distanciaM é null, não zero', () => {
    const p = somarPrescricaoSemana([set(null, 600, '2026-08-10'), set(null, 600, '2026-08-12')]);

    expect(p.distanciaM).toBeNull();
  });

  it('todos os sets sem duração: duracaoSegundos é null, não zero', () => {
    const p = somarPrescricaoSemana([set(5000, null, '2026-08-10'), set(3000, null, '2026-08-12')]);

    expect(p.duracaoSegundos).toBeNull();
  });
});

describe('progressoPrescrito', () => {
  // Semana de referência: quarta 12/08/2026 → semana de 10/08 (seg) a 16/08.
  const REFERENCIA = new Date('2026-08-12T12:00:00');

  it('sem cardio prescrito na semana: prescritoSessoes é null, não zero', () => {
    const prescricao: PrescricaoCardio = { distanciaM: null, duracaoSegundos: null, sessoes: 0 };
    const p = progressoPrescrito([], prescricao, REFERENCIA);

    expect(p.prescritoSessoes).toBeNull();
    expect(p.prescritoKm).toBeNull();
    // Realizado continua honesto mesmo sem prescrição: zero é fato.
    expect(p.minutos).toBe(0);
    expect(p.sessoes).toBe(0);
  });

  it('reaproveita progressoConsistencia para o lado realizado e expõe o prescrito', () => {
    const prescricao: PrescricaoCardio = { distanciaM: 5000, duracaoSegundos: 1800, sessoes: 1 };
    const p = progressoPrescrito(
      [log('Corrida', 1800, 5000, '2026-08-11T10:00:00')],
      prescricao,
      REFERENCIA,
    );

    expect(p.minutos).toBe(30);
    expect(p.sessoes).toBe(1);
    expect(p.prescritoKm).toBe(5);
    expect(p.prescritoSessoes).toBe(1);
    expect(p.atingida).toBe(true);
  });

  it('realizado da semana anterior não conta para a prescrição desta semana', () => {
    const prescricao: PrescricaoCardio = { distanciaM: null, duracaoSegundos: 1800, sessoes: 1 };
    const p = progressoPrescrito(
      [log('Corrida', 1800, 5000, '2026-08-03T10:00:00')], // segunda da semana anterior
      prescricao,
      REFERENCIA,
    );

    expect(p.minutos).toBe(0);
    expect(p.atingida).toBe(false);
  });
});
