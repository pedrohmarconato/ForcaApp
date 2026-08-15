/**
 * @jest-environment jsdom
 */
// __tests__/InstallScreen.test.tsx
// Cobertura RTL de src/screens/InstallScreen.tsx (Fase 12 Plano 01, Task 1):
// os 4 estados de instalação (12-UI-SPEC.md, Copywriting Contract) + a guarda
// web-only (Pattern 3 de 12-RESEARCH.md, mesmo formato de UpdateBanner.tsx).
//
// Molde: __tests__/UpdateBanner.test.tsx (Platform.OS mockado via
// Object.defineProperty, ambiente jsdom real) + __tests__/profileScreen.test.tsx
// (mock de useNavigation).

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import InstallScreen from '../src/screens/InstallScreen';
import * as installDetection from '../src/utils/installDetection';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/utils/installDetection', () => ({
  isIOS: jest.fn(),
  isSafari: jest.fn(),
  isStandalone: jest.fn(),
}));

const mockedIsIOS = installDetection.isIOS as jest.Mock;
const mockedIsSafari = installDetection.isSafari as jest.Mock;
const mockedIsStandalone = installDetection.isStandalone as jest.Mock;

describe('InstallScreen', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockNavigate.mockClear();
    mockedIsIOS.mockReset();
    mockedIsSafari.mockReset();
    mockedIsStandalone.mockReset();
  });

  afterAll(() => {
    if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
  });

  it('Estado 1 (ios=true, safari=true): renderiza os 3 StepRow com a copy exata do UI-SPEC', () => {
    mockedIsStandalone.mockReturnValue(false);
    mockedIsIOS.mockReturnValue(true);
    mockedIsSafari.mockReturnValue(true);

    const screen = render(<InstallScreen homeRoute="Login" />);

    expect(screen.getByText('Instale o ForçaApp no seu iPhone')).toBeTruthy();
    expect(
      screen.getByText('Leva menos de um minuto. Siga os 3 passos abaixo.'),
    ).toBeTruthy();
    expect(screen.getByText('Toque em Compartilhar')).toBeTruthy();
    expect(
      screen.getByText(
        'Na barra de baixo do Safari, toque no ícone do quadrado com a seta para cima.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Toque em "Adicionar à Tela de Início"')).toBeTruthy();
    expect(
      screen.getByText(
        'Deslize a lista de opções até encontrar "Adicionar à Tela de Início" e toque nela.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Toque em "Adicionar"')).toBeTruthy();
    expect(
      screen.getByText('Confirme tocando em "Adicionar", no canto superior direito da tela.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Pronto! O ícone do ForçaApp vai aparecer na sua Tela de Início, igual a um aplicativo de verdade.',
      ),
    ).toBeTruthy();
  });

  it('Estado 2 (ios=true, safari=false): renderiza a copy do Notice "Abra este link no Safari"', () => {
    mockedIsStandalone.mockReturnValue(false);
    mockedIsIOS.mockReturnValue(true);
    mockedIsSafari.mockReturnValue(false);

    const screen = render(<InstallScreen homeRoute="Login" />);

    expect(screen.getByText('Abra este link no Safari')).toBeTruthy();
    expect(
      screen.getByText(
        'Você está usando outro navegador. Para instalar o ForçaApp, este link precisa ser aberto no Safari — o navegador que já vem no iPhone.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Toque e segure este link, escolha "Copiar" e cole na barra de endereço do Safari. Ou toque no menu do seu navegador e escolha "Abrir no Safari", se essa opção aparecer.',
      ),
    ).toBeTruthy();
    // Não é o passo a passo do Estado 1.
    expect(screen.queryByText('Toque em Compartilhar')).toBeNull();
  });

  it('Estado 3 (ios=false): renderiza headline + URL da página, cobre desktop/Android e UA não reconhecida', () => {
    mockedIsStandalone.mockReturnValue(false);
    mockedIsIOS.mockReturnValue(false);
    mockedIsSafari.mockReturnValue(false);

    const screen = render(<InstallScreen homeRoute="Login" />);

    expect(screen.getByText('Abra este link no seu iPhone')).toBeTruthy();
    expect(
      screen.getByText(
        'O ForçaApp só pode ser instalado por um iPhone, usando o Safari. Envie este endereço para o seu iPhone (por mensagem ou e-mail) e abra por lá.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(window.location.href)).toBeTruthy();
  });

  it('Estado 4 (standalone=true): renderiza chip INSTALADO + CTA que navega para homeRoute, sem repetir o passo a passo', () => {
    mockedIsStandalone.mockReturnValue(true);
    mockedIsIOS.mockReturnValue(true);
    mockedIsSafari.mockReturnValue(true);

    const screen = render(<InstallScreen homeRoute="Home" />);

    expect(screen.getByText('INSTALADO')).toBeTruthy();
    expect(screen.getByText('Você já instalou o ForçaApp')).toBeTruthy();
    expect(
      screen.getByText(
        'O aplicativo está pronto na sua Tela de Início. Pode fechar esta página e abrir o app por lá.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Toque em Compartilhar')).toBeNull();

    const cta = screen.getByText('Abrir o ForçaApp');
    expect(cta).toBeTruthy();
    fireEvent.press(cta);
    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });

  it('standalone é checado primeiro: standalone=true prevalece mesmo com ios=false', () => {
    mockedIsStandalone.mockReturnValue(true);
    mockedIsIOS.mockReturnValue(false);
    mockedIsSafari.mockReturnValue(false);

    const screen = render(<InstallScreen homeRoute="Home" />);
    expect(screen.getByText('Você já instalou o ForçaApp')).toBeTruthy();
  });

  it('Platform.OS !== "web": retorna null e NÃO chama installDetection', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

    const screen = render(<InstallScreen homeRoute="Login" />);

    expect(screen.toJSON()).toBeNull();
    expect(mockedIsIOS).not.toHaveBeenCalled();
    expect(mockedIsSafari).not.toHaveBeenCalled();
    expect(mockedIsStandalone).not.toHaveBeenCalled();
  });

  it('renderiza os 4 estados sem nenhum provider/mock de AuthContext (prohibition: zero dado de auth)', () => {
    mockedIsStandalone.mockReturnValue(false);
    mockedIsIOS.mockReturnValue(true);
    mockedIsSafari.mockReturnValue(true);

    expect(() => render(<InstallScreen homeRoute="Login" />)).not.toThrow();
  });
});
