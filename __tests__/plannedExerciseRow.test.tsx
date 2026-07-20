// __tests__/plannedExerciseRow.test.tsx
// Linha de exercício planejado, compartilhada pelo plano e pelo detalhe.
//
// A regra coberta aqui é a mesma das telas: campo ausente não vira instrução
// inventada — %RM e descanso só aparecem quando existem de fato.

import React from 'react';
import { render } from '@testing-library/react-native';

// O componente usa formatExerciseTarget, que vive no repositório junto do
// cliente Supabase. Isola-se o cliente para não carregar o módulo nativo.
jest.mock('../src/config/supabaseClient', () => ({ supabase: {} }));

import PlannedExerciseRow from '../src/components/session/PlannedExerciseRow';
import type { PlannedExercise } from '../src/services/trainingRepository';

const exercicioBase: PlannedExercise = {
  id: 'ex-1',
  session_id: 'sess-1',
  exercise_order: 1,
  name: 'Agachamento Livre',
  muscle_group: 'Pernas',
  priority: 'primary',
  equipment: null,
  load_increment_kg: 2.5,
  rest_seconds: null,
  target_rm_percent: null,
  sets_planned: 4,
  reps_raw: '8',
  method: null,
  notes: null,
  planned_sets: [],
};

describe('PlannedExerciseRow', () => {
  it('mostra nome e alvo do exercício', () => {
    const { getByText } = render(<PlannedExerciseRow exercise={exercicioBase} />);

    expect(getByText('Agachamento Livre')).toBeTruthy();
    expect(getByText('4 séries × 8 reps')).toBeTruthy();
  });

  it('mostra %RM e descanso quando existem', () => {
    const { getByText } = render(
      <PlannedExerciseRow
        exercise={{ ...exercicioBase, target_rm_percent: 75, rest_seconds: 90 }}
      />,
    );

    expect(getByText('75% RM · descanso 90s')).toBeTruthy();
  });

  it('omite a linha de meta quando não há %RM nem descanso', () => {
    const { queryByText } = render(<PlannedExerciseRow exercise={exercicioBase} />);

    expect(queryByText(/% RM/)).toBeNull();
    expect(queryByText(/descanso/)).toBeNull();
  });

  it('mostra apenas o campo existente quando só um deles está preenchido', () => {
    const { getByText, queryByText } = render(
      <PlannedExerciseRow exercise={{ ...exercicioBase, rest_seconds: 60 }} />,
    );

    expect(getByText('descanso 60s')).toBeTruthy();
    expect(queryByText(/% RM/)).toBeNull();
  });

  it('numera o exercício com dois dígitos quando recebe o índice', () => {
    const { getByText } = render(<PlannedExerciseRow exercise={exercicioBase} index={0} />);

    expect(getByText('01')).toBeTruthy();
  });

  it('rotula prioridade principal e acessória, mas não a secundária', () => {
    const principal = render(<PlannedExerciseRow exercise={exercicioBase} />);
    expect(principal.getByText('Principal')).toBeTruthy();

    const acessorio = render(
      <PlannedExerciseRow exercise={{ ...exercicioBase, priority: 'accessory' }} />,
    );
    expect(acessorio.getByText('Acessório')).toBeTruthy();

    const secundario = render(
      <PlannedExerciseRow exercise={{ ...exercicioBase, priority: 'secondary' }} />,
    );
    expect(secundario.queryByText('Principal')).toBeNull();
    expect(secundario.queryByText('Acessório')).toBeNull();
  });
});
