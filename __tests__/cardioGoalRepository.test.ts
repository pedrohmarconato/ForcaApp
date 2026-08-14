// A consulta das metas precisa separar cardio de qualquer exercício medido por
// tempo. `metric = tempo` inclui prancha e mobilidade no catálogo; o grupo
// canônico é a fronteira que impede esses minutos de inflarem a consistência.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import fs from 'fs';
import path from 'path';

import { supabase } from '../src/config/supabaseClient';
import { getCardioLogs } from '../src/services/cardioGoalRepository';

const fromMock = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('filtra por grupo Cardio e rejeita localmente uma linha de prancha', async () => {
  const query: Record<string, jest.Mock> = {};
  for (const metodo of ['select', 'eq', 'not', 'in', 'order']) {
    query[metodo] = jest.fn(() => query);
  }
  query.range = jest.fn(async () => ({
    error: null,
    data: [
      {
        actual_duration_seconds: '1800',
        actual_distance_m: '5000',
        completed_at: '2026-07-28T10:00:00Z',
        planned_sets: {
          planned_exercises: {
            name: 'Corrida',
            exercise_key: 'corrida',
            metric: 'tempo_distancia',
            muscle_group: 'Cardio',
          },
        },
      },
      {
        actual_duration_seconds: '60',
        actual_distance_m: null,
        completed_at: '2026-07-28T10:30:00Z',
        planned_sets: {
          planned_exercises: {
            name: 'Prancha',
            exercise_key: 'prancha',
            metric: 'tempo',
            muscle_group: 'Abdômen',
          },
        },
      },
    ],
  }));
  fromMock.mockReturnValue(query);

  const logs = await getCardioLogs('user-1');

  expect(query.eq).toHaveBeenCalledWith(
    'planned_sets.planned_exercises.muscle_group',
    'Cardio',
  );
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ name: 'Corrida', durationSeconds: 1800, distanceM: 5000 });
});

it('achado 4 (painel 05-02): série trocada de modalidade agrupa no DESTINO da troca, não na planejada original', async () => {
  const query: Record<string, jest.Mock> = {};
  for (const metodo of ['select', 'eq', 'not', 'in', 'order']) {
    query[metodo] = jest.fn(() => query);
  }
  query.range = jest.fn(async () => ({
    error: null,
    data: [
      {
        actual_duration_seconds: '1800',
        actual_distance_m: '5000',
        completed_at: '2026-07-28T10:00:00Z',
        // Sessão trocou Caminhada (planejada) → Corrida (executada) — mesma
        // semântica de `swappedFrom` em getSessionLogDetail (Histórico).
        session_logs: {
          cardio_exercise_swaps: [{ planned_exercise_id: 'ex-1', to_modality: 'Corrida' }],
        },
        planned_sets: {
          exercise_id: 'ex-1',
          planned_exercises: {
            name: 'Caminhada',
            exercise_key: 'caminhada',
            metric: 'tempo_distancia',
            muscle_group: 'Cardio',
          },
        },
      },
    ],
  }));
  fromMock.mockReturnValue(query);

  const logs = await getCardioLogs('user-1');

  expect(logs).toHaveLength(1);
  // Antes do fix: `logs[0].name` era 'Caminhada' (a modalidade PLANEJADA,
  // não a executada) — o gráfico agrupava o ponto na modalidade errada.
  expect(logs[0].name).toBe('Corrida');
  expect(logs[0].identity).not.toBe('k:caminhada');
});

it('a migration limita a meta de dias ao máximo realizável de sete', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '0022_metas_de_cardio.sql'),
    'utf8',
  );

  expect(sql).toMatch(/weekly_sessions is null or weekly_sessions between 1 and 7/);
  expect(sql).not.toMatch(/weekly_sessions is null or weekly_sessions between 1 and 14/);
});
