// __tests__/uiKit.test.tsx
// Primitivos da identidade "Força sem ruído".
//
// O teste mais importante deste arquivo é o do `Metric`: ele trava a regra de
// que uma métrica sem amostra real renderiza "—", nunca um número derivado de
// conjunto vazio.

import React from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Path } from 'react-native-svg';
import type { ReactTestInstance } from 'react-test-renderer';
import { render, fireEvent } from '@testing-library/react-native';

import Button from '../src/components/ui/Button';
import TextField from '../src/components/ui/TextField';
import {
  Chip,
  Metric,
  Notice,
  ProgressTrack,
  EmptyState,
  NO_DATA,
} from '../src/components/ui/Feedback';
import {
  OptionButton,
  DayToggle,
  CheckboxRow,
} from '../src/components/ui/Controls';
import { ListRow } from '../src/components/ui/Surface';
import { FModules } from '../src/components/ui/FModules';
import { ForcaMark } from '../src/components/ui/Logo';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { createTheme, type NeonColorKey } from '../src/theme/theme';

let mockAuthState: {
  user: { id: string };
  profile: { id: string; neon_color: NeonColorKey };
} = {
  user: { id: 'ui-kit-user' },
  profile: { id: 'ui-kit-user', neon_color: 'yellow' },
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

// ThemeProvider não chama mais useAuth() internamente (fix da coesão
// tema/auth) — quem instancia <ThemeProvider> direto precisa repassar
// userId/profile por prop, lidos do mesmo mockAuthState.
const authThemeProps = () => ({
  userId: mockAuthState.user?.id ?? null,
  profile: mockAuthState.profile,
});

jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

const setThemeColor = (neonColor: NeonColorKey) => {
  mockAuthState = {
    user: { id: 'ui-kit-user' },
    profile: { id: 'ui-kit-user', neon_color: neonColor },
  };
};

const renderThemed = (
  element: React.ReactElement,
  initialColor: NeonColorKey = 'yellow',
) => {
  let currentColor = initialColor;
  setThemeColor(currentColor);
  const result = render(
    <ThemeProvider {...authThemeProps()}>{element}</ThemeProvider>,
  );

  return {
    ...result,
    rerender: (
      nextElement: React.ReactElement,
      nextColor: NeonColorKey = currentColor,
    ) => {
      currentColor = nextColor;
      setThemeColor(currentColor);
      result.rerender(
        <ThemeProvider {...authThemeProps()}>{nextElement}</ThemeProvider>,
      );
    },
  };
};

const flattenStyle = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(
    node.props.style as StyleProp<ViewStyle | TextStyle>,
  ) as ViewStyle & TextStyle;

const ancestorStyleWith = (
  node: ReactTestInstance,
  property: keyof (ViewStyle & TextStyle),
) => {
  let current = node.parent;
  while (current) {
    const style = flattenStyle(current);
    if (style?.[property] !== undefined) return style;
    current = current.parent;
  }
  throw new Error(`Ancestral com estilo ${String(property)} não encontrado`);
};

describe('Button', () => {
  it('dispara onPress quando ativo', () => {
    const onPress = jest.fn();
    const { getByText } = renderThemed(
      <Button label="Entrar" onPress={onPress} />,
    );

    fireEvent.press(getByText('Entrar'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não dispara onPress quando desabilitado', () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderThemed(
      <Button label="Entrar" onPress={onPress} disabled />,
    );

    fireEvent.press(getByLabelText('Entrar'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('não dispara onPress durante o carregamento e anuncia estado ocupado', () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderThemed(
      <Button label="Entrar" onPress={onPress} loading />,
    );
    const botao = getByLabelText('Entrar');

    fireEvent.press(botao);

    expect(onPress).not.toHaveBeenCalled();
    expect(botao.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });
});

describe('TextField', () => {
  it('propaga a digitação e expõe o rótulo como nome acessível', () => {
    const onChangeText = jest.fn();
    const { getByLabelText } = renderThemed(
      <TextField label="E-mail" value="" onChangeText={onChangeText} />,
    );

    fireEvent.changeText(getByLabelText('E-mail'), 'atleta@forca.app');

    expect(onChangeText).toHaveBeenCalledWith('atleta@forca.app');
  });

  it('exibe a mensagem de erro quando presente', () => {
    const { getByText } = renderThemed(
      <TextField label="Senha" value="" error="Senha muito curta" />,
    );

    expect(getByText('Senha muito curta')).toBeTruthy();
  });

  it('alterna a visibilidade da senha pelo botão de revelar', () => {
    const { getByLabelText } = renderThemed(
      <TextField label="Senha" value="segredo" secureToggle />,
    );

    expect(getByLabelText('Senha').props.secureTextEntry).toBe(true);

    fireEvent.press(getByLabelText('Mostrar senha'));

    expect(getByLabelText('Senha').props.secureTextEntry).toBe(false);
  });
});

describe('Metric — proibido número inventado', () => {
  it('renderiza o valor real quando existe', () => {
    const { getByText } = renderThemed(<Metric value={12} label="Sessões" />);

    expect(getByText('12')).toBeTruthy();
  });

  it('renderiza "—" quando não há amostra (null/undefined/vazio)', () => {
    const semDados = [null, undefined, ''] as const;

    semDados.forEach((valor) => {
      const { getAllByText, unmount } = renderThemed(
        <Metric value={valor} label="Consistência" />,
      );
      expect(getAllByText(NO_DATA).length).toBe(1);
      unmount();
    });
  });

  it('preserva o zero real em vez de tratá-lo como ausência de dado', () => {
    const { getByText, queryByText } = renderThemed(
      <Metric value={0} label="Sessões" />,
    );

    expect(getByText('0')).toBeTruthy();
    expect(queryByText(NO_DATA)).toBeNull();
  });
});

describe('ProgressTrack', () => {
  it('limita a fração ao intervalo 0–1 e anuncia o percentual', () => {
    const { getByLabelText, rerender } = renderThemed(
      <ProgressTrack ratio={1.8} accessibilityLabel="Progresso da semana" />,
    );
    expect(
      getByLabelText('Progresso da semana').props.accessibilityValue.now,
    ).toBe(100);

    rerender(
      <ProgressTrack ratio={-0.5} accessibilityLabel="Progresso da semana" />,
    );
    expect(
      getByLabelText('Progresso da semana').props.accessibilityValue.now,
    ).toBe(0);
  });

  it('trata fração não numérica como zero (divisão por zero não vira NaN na tela)', () => {
    const { getByLabelText } = renderThemed(
      <ProgressTrack ratio={0 / 0} accessibilityLabel="Progresso da semana" />,
    );

    expect(
      getByLabelText('Progresso da semana').props.accessibilityValue.now,
    ).toBe(0);
  });
});

describe('Controles de seleção', () => {
  it('OptionButton reporta seleção e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderThemed(
      <OptionButton label="Ganho de massa" selected onPress={onPress} />,
    );
    const opcao = getByLabelText('Ganho de massa');

    expect(opcao.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(opcao);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('DayToggle usa o nome completo do dia como rótulo acessível', () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderThemed(
      <DayToggle
        label="Q"
        accessibilityLabel="Quinta-feira"
        selected={false}
        onPress={onPress}
      />,
    );

    fireEvent.press(getByLabelText('Quinta-feira'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('CheckboxRow reflete o estado marcado', () => {
    const { getByLabelText } = renderThemed(
      <CheckboxRow label="Lembrar acesso" checked onPress={jest.fn()} />,
    );

    expect(
      getByLabelText('Lembrar acesso').props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
  });
});

describe('ListRow e EmptyState', () => {
  it('ListRow só é tocável quando recebe onPress', () => {
    const onPress = jest.fn();
    const { getByText, rerender, queryByLabelText } = renderThemed(
      <ListRow
        title="Lower body A"
        subtitle="Quadríceps · core"
        onPress={onPress}
      />,
    );

    fireEvent.press(getByText('Lower body A'));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<ListRow title="Lower body A" subtitle="Quadríceps · core" />);
    expect(queryByLabelText('Lower body A. Quadríceps · core')).toBeNull();
  });

  it('EmptyState mostra título e descrição', () => {
    const { getByText } = renderThemed(
      <EmptyState
        title="Nenhum treino concluído"
        description="Seu histórico aparece aqui."
      />,
    );

    expect(getByText('Nenhum treino concluído')).toBeTruthy();
    expect(getByText('Seu histórico aparece aqui.')).toBeTruthy();
  });
});

describe('tema reativo das primitivas', () => {
  it('preserva a geometria de botões, opções, linhas e campos', () => {
    const { getByTestId } = renderThemed(
      <>
        <Button testID="geometry-button" label="Continuar" />
        <OptionButton
          testID="geometry-option"
          label="Força"
          selected={false}
          onPress={jest.fn()}
        />
        <ListRow testID="geometry-row" title="Treino" />
        <TextField testID="geometry-field" label="E-mail" value="" />
      </>,
    );

    expect(flattenStyle(getByTestId('geometry-button'))).toMatchObject({
      minHeight: 50,
      borderRadius: 12,
    });
    expect(flattenStyle(getByTestId('geometry-option'))).toMatchObject({
      minHeight: 44,
      borderRadius: 12,
    });
    expect(flattenStyle(getByTestId('geometry-row'))).toMatchObject({
      padding: 12,
      borderRadius: 14,
    });
    expect(
      ancestorStyleWith(getByTestId('geometry-field'), 'minHeight'),
    ).toMatchObject({ minHeight: 50, borderRadius: 12 });
  });

  it('troca Button primary de amarelo para vermelho na mesma instância e mantém conteúdo preto', () => {
    const button = (
      <Button testID="themed-button" label="Continuar" onPress={jest.fn()} />
    );
    const { getByTestId, getByText, rerender } = renderThemed(button);
    const firstInstance = getByTestId('themed-button');

    expect(flattenStyle(firstInstance).backgroundColor).toBe('#EBFF00');
    expect(flattenStyle(getByText('Continuar')).color).toBe('#0A0A0A');

    rerender(button, 'red');

    const rerenderedInstance = getByTestId('themed-button');
    expect(rerenderedInstance).toBe(firstInstance);
    expect(flattenStyle(rerenderedInstance).backgroundColor).toBe('#FF3131');
    expect(flattenStyle(getByText('Continuar')).color).toBe('#0A0A0A');
  });

  it('atualiza OptionButton, DayToggle e CheckboxRow selecionados sem perder estado acessível', () => {
    const controls = (
      <>
        <OptionButton
          testID="themed-option"
          label="Força"
          selected
          onPress={jest.fn()}
        />
        <DayToggle
          testID="themed-day"
          label="Q"
          accessibilityLabel="Quarta-feira"
          selected
          onPress={jest.fn()}
        />
        <CheckboxRow label="Confirmar" checked onPress={jest.fn()} />
      </>
    );
    const { getByTestId, getByLabelText, getByText, rerender } =
      renderThemed(controls);

    rerender(controls, 'blue');

    const blue = createTheme('blue');
    const option = getByTestId('themed-option');
    const optionMarker = option.findAllByType(View)[0];
    expect(option.props.accessibilityState).toMatchObject({
      selected: true,
      checked: true,
    });
    expect(flattenStyle(option)).toMatchObject({
      borderColor: blue.colors.accent.border,
      backgroundColor: blue.colors.accent.soft,
    });
    expect(flattenStyle(optionMarker).backgroundColor).toBe(
      blue.colors.accent.main,
    );

    const day = getByTestId('themed-day');
    expect(day.props.accessibilityState).toMatchObject({ checked: true });
    expect(flattenStyle(day)).toMatchObject({
      borderColor: blue.colors.accent.border,
      backgroundColor: blue.colors.accent.soft,
    });
    expect(flattenStyle(getByText('Q')).color).toBe(blue.colors.text.accent);

    const checkbox = getByLabelText('Confirmar');
    const checkboxMark = checkbox.findAllByType(View)[0];
    expect(checkbox.props.accessibilityState).toMatchObject({ checked: true });
    expect(flattenStyle(checkboxMark)).toMatchObject({
      borderColor: blue.colors.accent.main,
      backgroundColor: blue.colors.accent.main,
    });
  });

  it('atualiza ListRow accent e o topo do logo, preservando o override explícito dos outros módulos', () => {
    const themedSurface = (
      <>
        <ListRow title="Treino atual" trailingLabel="Hoje" trailingAccent />
        <ForcaMark color="#123456" accentTop />
      </>
    );
    const { getByText, UNSAFE_getAllByType, rerender } =
      renderThemed(themedSurface);

    rerender(themedSurface, 'blue');

    expect(flattenStyle(getByText('Hoje')).color).toBe('#00E5FF');
    const paths = UNSAFE_getAllByType(Path);
    expect(paths.map((path) => path.props.fill)).toEqual([
      '#00E5FF',
      '#123456',
      '#123456',
    ]);
  });

  it('atualiza Chip, Metric e ProgressTrack accent sem alterar tons funcionais', () => {
    const feedback = (
      <>
        <Chip label="Atual" tone="accent" />
        <Metric value="82%" label="Consistência" accent />
        <ProgressTrack ratio={0.82} accessibilityLabel="Progresso temático" />
        <Chip label="Informação" tone="info" />
        <Chip label="Falha" tone="danger" />
        <Notice title="Sincronizando" tone="info" />
        <Notice title="Atenção" tone="warning" />
        <Notice title="Erro" tone="danger" />
      </>
    );
    const { getByText, getByLabelText, rerender } = renderThemed(feedback);

    const functionalBefore = [
      flattenStyle(getByText('Informação')).color,
      flattenStyle(getByText('Falha')).color,
      flattenStyle(getByText('Sincronizando')).color,
      flattenStyle(getByText('Atenção')).color,
      flattenStyle(getByText('Erro')).color,
    ];

    rerender(feedback, 'green');

    const green = createTheme('green');
    expect(flattenStyle(getByText('Atual')).color).toBe(
      green.colors.text.accent,
    );
    expect(
      ancestorStyleWith(getByText('Atual'), 'backgroundColor').backgroundColor,
    ).toBe(green.colors.accent.soft);
    expect(flattenStyle(getByText('82%')).color).toBe(green.colors.text.accent);
    const progress = getByLabelText('Progresso temático');
    const progressFill = progress.findAllByType(View)[0];
    expect(flattenStyle(progressFill).backgroundColor).toBe(
      green.colors.accent.main,
    );

    const functionalAfter = [
      flattenStyle(getByText('Informação')).color,
      flattenStyle(getByText('Falha')).color,
      flattenStyle(getByText('Sincronizando')).color,
      flattenStyle(getByText('Atenção')).color,
      flattenStyle(getByText('Erro')).color,
    ];
    expect(functionalAfter).toEqual(functionalBefore);
    expect(createTheme('yellow').colors.status).toEqual(green.colors.status);
    expect(createTheme('blue').colors.status).toEqual(green.colors.status);
    expect(createTheme('red').colors.status).toEqual(green.colors.status);
  });

  it('atualiza apenas módulos acesos de FModules', () => {
    const modules = <FModules testID="progress-modules" lit={2} />;
    const { getByTestId, rerender } = renderThemed(modules);
    const offBefore = flattenStyle(
      getByTestId('progress-modules-mod-2'),
    ).backgroundColor;

    rerender(modules, 'blue');

    expect(
      flattenStyle(getByTestId('progress-modules-mod-0')).backgroundColor,
    ).toBe('#00E5FF');
    expect(
      flattenStyle(getByTestId('progress-modules-mod-1')).backgroundColor,
    ).toBe('#00E5FF');
    expect(
      flattenStyle(getByTestId('progress-modules-mod-2')).backgroundColor,
    ).toBe(offBefore);
  });

  it('mantém o TextField focado ao trocar tema e preserva danger acima do foco', () => {
    const field = <TextField testID="themed-field" label="E-mail" value="" />;
    const { getByTestId, getByText, rerender } = renderThemed(field);
    const input = getByTestId('themed-field');

    fireEvent(input, 'focus', {});
    expect(ancestorStyleWith(input, 'borderColor').borderColor).toBe(
      createTheme('yellow').colors.border.focus,
    );

    rerender(field, 'blue');

    const rerenderedInput = getByTestId('themed-field');
    expect(rerenderedInput).toBe(input);
    expect(rerenderedInput.props.selectionColor).toBe('#00E5FF');
    expect(ancestorStyleWith(rerenderedInput, 'borderColor').borderColor).toBe(
      createTheme('blue').colors.border.focus,
    );

    rerender(
      <TextField
        testID="themed-field"
        label="E-mail"
        value=""
        error="E-mail inválido"
      />,
      'red',
    );

    expect(getByTestId('themed-field').props.selectionColor).toBe('#FF3131');
    expect(
      ancestorStyleWith(getByTestId('themed-field'), 'borderColor').borderColor,
    ).toBe(createTheme('red').colors.status.danger);
    expect(flattenStyle(getByText('E-mail inválido')).color).toBe(
      createTheme('red').colors.status.danger,
    );
  });
});
