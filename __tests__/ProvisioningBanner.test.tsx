// __tests__/ProvisioningBanner.test.tsx
// Guarda do banner de validade do provisioning profile (D-03, Fase 14 Plano
// 03). Molde: __tests__/UpdateBanner.test.tsx (Platform.OS mockado via
// Object.defineProperty, preservando os componentes reais do RN).
//
// Diferença chave: UpdateBanner reage a um CustomEvent da `window` (web-only);
// ProvisioningBanner lê um módulo nativo Expo (`modules/native-info`) uma vez
// no mount, só em iOS — por isso o módulo nativo é mockado aqui (a leitura
// real do embedded.mobileprovision é manual-only, RESEARCH.md Validation
// Architecture, validada fisicamente nas Planos 14-06/14-09).

import React from 'react';
import { Platform } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

import ProvisioningBanner, {
  shouldShowProvisioningBanner,
} from '../src/components/ProvisioningBanner';
import { getProvisioningProfileExpiry } from '../modules/native-info';

jest.mock('../modules/native-info', () => ({
  getProvisioningProfileExpiry: jest.fn(),
}));

const mockedGetExpiry = getProvisioningProfileExpiry as jest.Mock;

describe('shouldShowProvisioningBanner (lógica pura)', () => {
  it('retorna false quando expiryDate está mais de 2 dias no futuro', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const expiry = new Date('2026-08-19T12:00:01.000Z'); // 3 dias + 1s
    expect(shouldShowProvisioningBanner(expiry, now)).toBe(false);
  });

  it('caso-limite de adjacência: retorna true quando faltam exatamente 2 dias', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const expiry = new Date('2026-08-18T12:00:00.000Z'); // exatamente 2 dias
    expect(shouldShowProvisioningBanner(expiry, now)).toBe(true);
  });

  it('retorna true quando expiryDate já está no passado (expirado)', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const expiry = new Date('2026-08-10T12:00:00.000Z');
    expect(shouldShowProvisioningBanner(expiry, now)).toBe(true);
  });
});

describe('ProvisioningBanner (componente)', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

  afterEach(() => {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
    mockedGetExpiry.mockReset();
  });

  it('Platform.OS !== "ios" (ex.: web): renderiza null e nunca chama getProvisioningProfileExpiry()', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const screen = render(<ProvisioningBanner />);
    expect(screen.queryByTestId('provisioning-banner')).toBeNull();
    expect(mockedGetExpiry).not.toHaveBeenCalled();
  });

  it('Platform.OS !== "ios" (ex.: android): renderiza null e nunca chama getProvisioningProfileExpiry()', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const screen = render(<ProvisioningBanner />);
    expect(screen.queryByTestId('provisioning-banner')).toBeNull();
    expect(mockedGetExpiry).not.toHaveBeenCalled();
  });

  it('Platform.OS === "ios" mas a leitura nativa ainda não resolveu: renderiza null', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockedGetExpiry.mockReturnValue(new Promise(() => {})); // nunca resolve
    const screen = render(<ProvisioningBanner />);
    expect(screen.queryByTestId('provisioning-banner')).toBeNull();
  });

  it('expiryDate mais de 2 dias no futuro: renderiza null', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockedGetExpiry.mockResolvedValue(future);
    const screen = render(<ProvisioningBanner />);
    await waitFor(() => expect(mockedGetExpiry).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('provisioning-banner')).toBeNull();
  });

  it('caso-limite de adjacência (exatamente 2 dias no futuro): mostra o aviso', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const expiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    mockedGetExpiry.mockResolvedValue(expiry);
    const screen = render(<ProvisioningBanner />);
    await waitFor(() => expect(screen.queryByTestId('provisioning-banner')).toBeTruthy());
  });

  it('expiryDate já expirado (no passado): mostra o aviso', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const expiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockedGetExpiry.mockResolvedValue(expiry);
    const screen = render(<ProvisioningBanner />);
    await waitFor(() => expect(screen.queryByTestId('provisioning-banner')).toBeTruthy());
  });

  it('quando visível, o texto cita o dia da semana derivado de expiryDate e mantém o testID', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const expiryDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockedGetExpiry.mockResolvedValue(expiryDate.toISOString());
    const screen = render(<ProvisioningBanner />);

    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(expiryDate);
    await waitFor(() => expect(screen.getByTestId('provisioning-banner')).toBeTruthy());
    expect(screen.getByText(new RegExp(`Reassine até.*${weekday}`, 'i'))).toBeTruthy();
  });
});
