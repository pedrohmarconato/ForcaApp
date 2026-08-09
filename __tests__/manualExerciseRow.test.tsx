// __tests__/manualExerciseRow.test.tsx
// Linha de exercício do editor manual (REQ-01): a distância exibida usa
// vírgula pt-BR ("2,4 km"), nunca ponto ("2.4 km") — mesmo formato que
// SessionPlayer já usa via formatDistance (commit 925ba42).

import React from 'react';
import { render } from '@testing-library/react-native';

import ManualExerciseRow from '../src/components/session/ManualExerciseRow';
import type { ManualExerciseDraft } from '../src/types/manualPlan';

const exercicioBase: ManualExerciseDraft = {
  exercise_key: 'k:corrida',
  nome: 'Corrida',
  equipamento: null,
  metrica: 'tempo_distancia',
  series: 3,
  repeticoes: null,
  duracao_minutos: 20,
  distancia_km: 2.4,
  tempo_descanso: null,
  prioridade: 'primario',
  percentual_rm: null,
  observacoes: null,
  tem_limitacao: false,
};

const noop = () => {};

describe('ManualExerciseRow — distância em pt-BR (REQ-01)', () => {
  it('exibe distância decimal com vírgula pt-BR (2,4 km), nunca ponto', () => {
    const { getByText, queryByText } = render(
      <ManualExerciseRow exercise={exercicioBase} index={0} onEdit={noop} onRemove={noop} />,
    );

    expect(getByText(/2,4 km/)).toBeTruthy();
    expect(queryByText(/2\.4 km/)).toBeNull();
  });

  it('sem distância, não mostra sufixo de km', () => {
    const { queryByText } = render(
      <ManualExerciseRow
        exercise={{ ...exercicioBase, distancia_km: null }}
        index={0}
        onEdit={noop}
        onRemove={noop}
      />,
    );

    expect(queryByText(/km/)).toBeNull();
    expect(queryByText(/·/)).toBeNull();
  });

  it('distância inteira não mostra decimal nem zero à toa (5 km)', () => {
    const { getByText, queryByText } = render(
      <ManualExerciseRow
        exercise={{ ...exercicioBase, distancia_km: 5 }}
        index={0}
        onEdit={noop}
        onRemove={noop}
      />,
    );

    expect(getByText(/5 km/)).toBeTruthy();
    expect(queryByText(/5,0 km/)).toBeNull();
  });
});
