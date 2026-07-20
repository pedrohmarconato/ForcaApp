// __tests__/uiKit.test.tsx
// Primitivos da identidade "Força sem ruído".
//
// O teste mais importante deste arquivo é o do `Metric`: ele trava a regra de
// que uma métrica sem amostra real renderiza "—", nunca um número derivado de
// conjunto vazio.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import Button from '../src/components/ui/Button';
import TextField from '../src/components/ui/TextField';
import { Metric, ProgressTrack, EmptyState, NO_DATA } from '../src/components/ui/Feedback';
import { OptionButton, DayToggle, CheckboxRow } from '../src/components/ui/Controls';
import { ListRow } from '../src/components/ui/Surface';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

describe('Button', () => {
  it('dispara onPress quando ativo', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Entrar" onPress={onPress} />);

    fireEvent.press(getByText('Entrar'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não dispara onPress quando desabilitado', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(<Button label="Entrar" onPress={onPress} disabled />);

    fireEvent.press(getByLabelText('Entrar'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('não dispara onPress durante o carregamento e anuncia estado ocupado', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(<Button label="Entrar" onPress={onPress} loading />);
    const botao = getByLabelText('Entrar');

    fireEvent.press(botao);

    expect(onPress).not.toHaveBeenCalled();
    expect(botao.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});

describe('TextField', () => {
  it('propaga a digitação e expõe o rótulo como nome acessível', () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = render(
      <TextField label="E-mail" value="" onChangeText={onChangeText} />,
    );

    fireEvent.changeText(getByLabelText('E-mail'), 'atleta@forca.app');

    expect(onChangeText).toHaveBeenCalledWith('atleta@forca.app');
  });

  it('exibe a mensagem de erro quando presente', () => {
    const { getByText } = render(
      <TextField label="Senha" value="" error="Senha muito curta" />,
    );

    expect(getByText('Senha muito curta')).toBeTruthy();
  });

  it('alterna a visibilidade da senha pelo botão de revelar', () => {
    const { getByLabelText } = render(<TextField label="Senha" value="segredo" secureToggle />);

    expect(getByLabelText('Senha').props.secureTextEntry).toBe(true);

    fireEvent.press(getByLabelText('Mostrar senha'));

    expect(getByLabelText('Senha').props.secureTextEntry).toBe(false);
  });
});

describe('Metric — proibido número inventado', () => {
  it('renderiza o valor real quando existe', () => {
    const { getByText } = render(<Metric value={12} label="Sessões" />);

    expect(getByText('12')).toBeTruthy();
  });

  it('renderiza "—" quando não há amostra (null/undefined/vazio)', () => {
    const semDados = [null, undefined, ''] as const;

    semDados.forEach((valor) => {
      const { getAllByText, unmount } = render(<Metric value={valor} label="Consistência" />);
      expect(getAllByText(NO_DATA).length).toBe(1);
      unmount();
    });
  });

  it('preserva o zero real em vez de tratá-lo como ausência de dado', () => {
    const { getByText, queryByText } = render(<Metric value={0} label="Sessões" />);

    expect(getByText('0')).toBeTruthy();
    expect(queryByText(NO_DATA)).toBeNull();
  });
});

describe('ProgressTrack', () => {
  it('limita a fração ao intervalo 0–1 e anuncia o percentual', () => {
    const { getByLabelText, rerender } = render(
      <ProgressTrack ratio={1.8} accessibilityLabel="Progresso da semana" />,
    );
    expect(getByLabelText('Progresso da semana').props.accessibilityValue.now).toBe(100);

    rerender(<ProgressTrack ratio={-0.5} accessibilityLabel="Progresso da semana" />);
    expect(getByLabelText('Progresso da semana').props.accessibilityValue.now).toBe(0);
  });

  it('trata fração não numérica como zero (divisão por zero não vira NaN na tela)', () => {
    const { getByLabelText } = render(
      <ProgressTrack ratio={0 / 0} accessibilityLabel="Progresso da semana" />,
    );

    expect(getByLabelText('Progresso da semana').props.accessibilityValue.now).toBe(0);
  });
});

describe('Controles de seleção', () => {
  it('OptionButton reporta seleção e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <OptionButton label="Ganho de massa" selected onPress={onPress} />,
    );
    const opcao = getByLabelText('Ganho de massa');

    expect(opcao.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(opcao);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('DayToggle usa o nome completo do dia como rótulo acessível', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <DayToggle label="Q" accessibilityLabel="Quinta-feira" selected={false} onPress={onPress} />,
    );

    fireEvent.press(getByLabelText('Quinta-feira'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('CheckboxRow reflete o estado marcado', () => {
    const { getByLabelText } = render(
      <CheckboxRow label="Lembrar acesso" checked onPress={jest.fn()} />,
    );

    expect(getByLabelText('Lembrar acesso').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });
});

describe('ListRow e EmptyState', () => {
  it('ListRow só é tocável quando recebe onPress', () => {
    const onPress = jest.fn();
    const { getByText, rerender, queryByLabelText } = render(
      <ListRow title="Lower body A" subtitle="Quadríceps · core" onPress={onPress} />,
    );

    fireEvent.press(getByText('Lower body A'));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<ListRow title="Lower body A" subtitle="Quadríceps · core" />);
    expect(queryByLabelText('Lower body A. Quadríceps · core')).toBeNull();
  });

  it('EmptyState mostra título e descrição', () => {
    const { getByText } = render(
      <EmptyState title="Nenhum treino concluído" description="Seu histórico aparece aqui." />,
    );

    expect(getByText('Nenhum treino concluído')).toBeTruthy();
    expect(getByText('Seu histórico aparece aqui.')).toBeTruthy();
  });
});
