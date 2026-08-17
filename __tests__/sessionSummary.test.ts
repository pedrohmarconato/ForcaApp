import { ajustarRestEndsAt } from '../src/engine/sessionSummary';

describe('ajustarRestEndsAt', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('adiciona o delta ao timestamp e preserva ISO-8601 UTC', () => {
    expect(
      ajustarRestEndsAt('2026-08-16T12:01:00.000Z', 30, now),
    ).toBe('2026-08-16T12:01:30.000Z');
  });

  it('aplica piso de um segundo ao reduzir o descanso', () => {
    expect(
      ajustarRestEndsAt('2026-08-16T12:00:20.000Z', -30, now),
    ).toBe('2026-08-16T12:00:01.000Z');
  });
});
