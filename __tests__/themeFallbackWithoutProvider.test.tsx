// __tests__/themeFallbackWithoutProvider.test.tsx
//
// Decisão de design (ver corpo do commit que acompanha este teste e o
// comentário em src/theme/ThemeProvider.tsx): useTheme() deixa de LANÇAR
// quando não há <ThemeProvider> na árvore e passa a degradar graciosamente
// para o tema neon padrão — o mesmo singleton canônico exportado por
// src/theme/theme.ts (createTheme('yellow')), sem duplicar paleta.
//
// Racional: tema é apresentação, e um componente compartilhado (Logo,
// Feedback, ...) precisa conseguir renderizar sozinho em qualquer suíte —
// inclusive as ~48 suítes legadas que nunca envolveram seus componentes em
// <ThemeProvider>. O provider na raiz do App (ThemedRoot, ver App.tsx)
// continua sendo a fonte de verdade em produção; este teste cobre só o
// fallback de apresentação para quando ele não está montado.
//
// Antes do fix: useTheme() lança
// "useTheme deve ser usado dentro de um ThemeProvider" e o render() abaixo
// falha com essa exceção.

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Path } from 'react-native-svg';

import defaultTheme from '../src/theme/theme';
import { ForcaMark } from '../src/components/ui/Logo';
import { Chip } from '../src/components/ui/Feedback';

describe('useTheme sem ThemeProvider: fallback para o tema padrão', () => {
  it('ForcaMark (consome useTheme diretamente) renderiza sem lançar e usa a cor de acento do tema padrão', () => {
    let screen: ReturnType<typeof render> | undefined;

    expect(() => {
      screen = render(<ForcaMark accentTop />);
    }).not.toThrow();

    const paths = screen!.UNSAFE_getAllByType(Path);
    // Módulo superior recebe o acento quando accentTop está ativo.
    expect(paths[0].props.fill).toBe(defaultTheme.colors.accent.main);
  });

  it('Chip (consome useTheme via useThemeStyles) renderiza sem lançar e usa a cor de texto de acento do tema padrão', () => {
    let screen: ReturnType<typeof render> | undefined;

    expect(() => {
      screen = render(<Chip label="Selecionado" tone="accent" />);
    }).not.toThrow();

    const text = screen!.getByText('Selecionado');
    const flatStyle = StyleSheet.flatten(text.props.style);
    expect(flatStyle.color).toBe(defaultTheme.colors.text.accent);
  });
});
