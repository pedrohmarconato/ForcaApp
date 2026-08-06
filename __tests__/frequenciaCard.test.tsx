// __tests__/frequenciaCard.test.tsx
// Testes do card de frequência (Nível 4 da escada de reencaixe). O card é
// puramente apresentacional: recebe veredito e números do motor e dispara
// onGerarNovoPlano — não decide nem busca nada.

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import FrequenciaCard from '../src/components/plan/FrequenciaCard';

const onGerarNovoPlano = jest.fn();

beforeEach(() => jest.clearAllMocks());

const renderCard = (over: Record<string, unknown> = {}) =>
  render(
    <FrequenciaCard
      veredito="falta_cronica"
      frequenciaReal={3}
      diasPlanejados={5}
      semanasFechadasMinimas={3}
      onGerarNovoPlano={onGerarNovoPlano}
      {...over}
    />,
  );

describe('FrequenciaCard', () => {
  it('falta_cronica mostra o número verificável (3 dos 5)', () => {
    const utils = renderCard();
    expect(utils.getByText('Sua frequência caiu')).toBeTruthy();
    expect(
      utils.getByText('Nas últimas 3 semanas você treinou 3 dos 5 dias planejados.'),
    ).toBeTruthy();
  });

  it('abandono avisa sem inventar número', () => {
    const utils = renderCard({ veredito: 'abandono', frequenciaReal: 0, diasPlanejados: 5 });
    expect(utils.getByText('Faz 3 semanas sem treinar')).toBeTruthy();
    expect(
      utils.getByText('Nenhum treino foi concluído nas últimas 3 semanas.'),
    ).toBeTruthy();
  });

  it('agenda_desalinhada distingue o motivo do aviso', () => {
    const utils = renderCard({ veredito: 'agenda_desalinhada' });
    expect(utils.getByText('Seus treinos não encaixam na sua agenda')).toBeTruthy();
    expect(
      utils.getByText(
        'Nas últimas 3 semanas você treinou 3 dos 5 dias planejados, mas em dias diferentes do plano.',
      ),
    ).toBeTruthy();
  });

  it('o texto segue a config: janela diferente muda o número (achado nº 10 do review 67)', () => {
    const utils = renderCard({
      veredito: 'abandono',
      frequenciaReal: 0,
      diasPlanejados: 5,
      semanasFechadasMinimas: 4,
    });
    expect(utils.getByText('Faz 4 semanas sem treinar')).toBeTruthy();
    expect(
      utils.getByText('Nenhum treino foi concluído nas últimas 4 semanas.'),
    ).toBeTruthy();
    expect(utils.queryByText('Faz 3 semanas sem treinar')).toBeNull();
  });

  it('singular com janela de 1 semana', () => {
    const utils = renderCard({
      veredito: 'abandono',
      frequenciaReal: 0,
      diasPlanejados: 5,
      semanasFechadasMinimas: 1,
    });
    expect(utils.getByText('Faz 1 semana sem treinar')).toBeTruthy();
  });

  it('o botão dispara onGerarNovoPlano', () => {
    const utils = renderCard();
    fireEvent.press(utils.getByText('Gerar novo plano'));
    expect(onGerarNovoPlano).toHaveBeenCalledTimes(1);
  });
});
