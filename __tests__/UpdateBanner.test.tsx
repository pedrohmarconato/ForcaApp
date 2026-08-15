/**
 * @jest-environment jsdom
 */
// __tests__/UpdateBanner.test.tsx
// Guarda RTL permanente do banner de atualização (OFF-02, Fase 11 Plano 02).
// Molde: __tests__/alertHostWeb.test.tsx (Platform.OS mockado para 'web' via
// Object.defineProperty, preservando os componentes reais do RN).
//
// `@jest-environment jsdom` (pragma acima, TEM que ser o primeiro token do
// arquivo — jest-docblock só reconhece um bloco `/** */` que abre a partir do
// primeiro caractere não-whitespace, `^\s*(\/\*\*?...)`; comentários `//`
// antes dele fazem o pragma ser silenciosamente ignorado): register-sw.js
// (Plano 11-01) fala com a UI só via `window` CustomEvent — a config jest
// padrão deste repo (`react-native/jest-preset.js`) roda em ambiente Node
// puro, onde `window === global` não tem `addEventListener`/`dispatchEvent`
// reais. Este override por arquivo troca só este teste para o ambiente jsdom
// real (mesmo pacote `jest-environment-jsdom` já presente em node_modules),
// preservando o `render`/`fireEvent` do @testing-library/react-native
// (react-test-renderer não depende de DOM) e dando ao componente um `window`
// de verdade para escutar/despachar eventos e para o espião de
// `location.reload` provar ausência de chamada.

import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

import UpdateBanner from '../src/components/UpdateBanner';
import { useUpdateStore } from '../src/store/updateStore';

const dispatchSwUpdateAvailable = () => {
  window.dispatchEvent(new CustomEvent('sw-update-available'));
};

describe('UpdateBanner (web)', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  let reloadSpy: jest.Mock;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  });

  afterAll(() => {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
  });

  beforeEach(() => {
    useUpdateStore.setState({ waiting: false, dismissed: false });
    // Espião sobre o reload de página do ambiente jsdom — prova que nenhum
    // caminho do componente/estado chama reload por conta própria. jsdom não
    // implementa navegação real; substituir `location.reload` por um mock
    // evita o "Not implemented" do jsdom e dá um ponto de asserção direto.
    reloadSpy = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
  });

  it('sem nenhum evento sw-update-available disparado, não renderiza nada (retorna null)', () => {
    const screen = render(<UpdateBanner />);
    expect(screen.queryByText('Nova versão disponível')).toBeNull();
    expect(screen.queryByText('Atualizar')).toBeNull();
    expect(screen.queryByText('Depois')).toBeNull();
  });

  it('depois do CustomEvent sw-update-available, mostra "Nova versão disponível" e os botões Atualizar/Depois', () => {
    const screen = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
    });
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    expect(screen.getByText('Atualizar')).toBeTruthy();
    expect(screen.getByText('Depois')).toBeTruthy();
  });

  it('tocar em Atualizar despacha sw-apply-update exatamente uma vez e nunca chama reload diretamente', () => {
    const screen = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
    });

    const applyUpdateSpy = jest.fn();
    window.addEventListener('sw-apply-update', applyUpdateSpy);

    fireEvent.press(screen.getByText('Atualizar'));

    expect(applyUpdateSpy).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();

    window.removeEventListener('sw-apply-update', applyUpdateSpy);
  });

  it('tocar em Depois esconde o banner e NÃO despacha sw-apply-update', () => {
    const screen = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
    });

    const applyUpdateSpy = jest.fn();
    window.addEventListener('sw-apply-update', applyUpdateSpy);

    fireEvent.press(screen.getByText('Depois'));

    expect(screen.queryByText('Nova versão disponível')).toBeNull();
    expect(applyUpdateSpy).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();

    window.removeEventListener('sw-apply-update', applyUpdateSpy);
  });

  it('Platform.OS !== "web" (ex.: ios): retorna null mesmo depois do evento, nunca escuta a window', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    try {
      const screen = render(<UpdateBanner />);
      act(() => {
        dispatchSwUpdateAvailable();
      });
      expect(screen.queryByText('Nova versão disponível')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    }
  });

  it('múltiplas montagens/desmontagens e disparos repetidos do evento nunca produzem chamada a reload (guarda contra auto-reload)', () => {
    const primeiraMontagem = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
      dispatchSwUpdateAvailable();
    });
    fireEvent.press(primeiraMontagem.getByText('Atualizar'));
    primeiraMontagem.unmount();

    useUpdateStore.setState({ waiting: false, dismissed: false });
    const segundaMontagem = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
    });
    fireEvent.press(segundaMontagem.getByText('Atualizar'));
    segundaMontagem.unmount();

    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
