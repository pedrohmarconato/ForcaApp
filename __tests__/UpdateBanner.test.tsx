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

// WR-01 (iteração 3): espelha o contrato real de register-sw.js, que SEMPRE
// grava `window.__swUpdateAvailable = true` imediatamente antes de despachar
// o CustomEvent (linhas 43 e 57) — nunca só o dispatchEvent isolado. Um
// helper que só despacha o evento (versão anterior deste helper) não
// reproduz o caminho do listener ao vivo pós-mount, então nenhum teste
// existente conseguia observar a flag ficando obsoleta depois de um evento
// consumido pelo listener ao vivo (em vez do branch de replay no mount).
const dispatchSwUpdateAvailable = () => {
  (window as unknown as { __swUpdateAvailable?: boolean }).__swUpdateAvailable = true;
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

  it('window.__swUpdateAvailable=true ANTES do mount faz o banner aparecer no primeiro render, sem novo dispatchEvent (WR-02: replay de evento perdido)', () => {
    (window as unknown as { __swUpdateAvailable?: boolean }).__swUpdateAvailable = true;
    try {
      const screen = render(<UpdateBanner />);
      expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    } finally {
      delete (window as unknown as { __swUpdateAvailable?: boolean }).__swUpdateAvailable;
    }
  });

  it('depois de "Depois", um NOVO sw-update-available faz o banner reaparecer (CR-01: dismissed nao pode grudar entre atualizacoes)', () => {
    const screen = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
    });
    fireEvent.press(screen.getByText('Depois'));
    expect(screen.queryByText('Nova versão disponível')).toBeNull();

    act(() => {
      dispatchSwUpdateAvailable();
    });
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    expect(screen.getByText('Atualizar')).toBeTruthy();
    expect(screen.getByText('Depois')).toBeTruthy();
  });

  it('window.__swUpdateAvailable consumida no mount: um remount sem novo dispatch/flag NÃO reabre o banner depois de "Depois" (WR-01: flag write-only)', () => {
    (window as unknown as { __swUpdateAvailable?: boolean }).__swUpdateAvailable = true;
    try {
      const primeiraMontagem = render(<UpdateBanner />);
      expect(primeiraMontagem.getByText('Nova versão disponível')).toBeTruthy();
      fireEvent.press(primeiraMontagem.getByText('Depois'));
      expect(primeiraMontagem.queryByText('Nova versão disponível')).toBeNull();
      primeiraMontagem.unmount();

      // Flag nunca foi resetada por nada além do próprio UpdateBanner — sem o
      // fix, o remount abaixo releria __swUpdateAvailable ainda `true` e
      // sobrescreveria silenciosamente a escolha "Depois" do usuário.
      useUpdateStore.setState({ waiting: false, dismissed: false });
      const segundaMontagem = render(<UpdateBanner />);
      expect(segundaMontagem.queryByText('Nova versão disponível')).toBeNull();
    } finally {
      delete (window as unknown as { __swUpdateAvailable?: boolean }).__swUpdateAvailable;
    }
  });

  it('window.__swUpdateAvailable consumida também pelo listener ao vivo pós-mount: um remount sem novo flag/dispatch NÃO reabre o banner depois de "Depois" (WR-01 iteração 3: caminho live-listener, mais comum que a corrida pré-mount)', () => {
    // Sem o fix, handleUpdateAvailable (o listener ao vivo registrado após o
    // mount) chama setWaiting(true) mas nunca zera a flag — diferente do
    // branch de replay síncrono no mount, que já limpava. dispatchSwUpdateAvailable
    // agora grava a flag antes do dispatchEvent (mesmo contrato de
    // register-sw.js), então este teste reproduz exatamente o caminho real:
    // update chega minutos/horas depois do mount, quando só o listener ao
    // vivo está ativo.
    const primeiraMontagem = render(<UpdateBanner />);
    act(() => {
      dispatchSwUpdateAvailable();
    });
    expect(primeiraMontagem.getByText('Nova versão disponível')).toBeTruthy();
    fireEvent.press(primeiraMontagem.getByText('Depois'));
    expect(primeiraMontagem.queryByText('Nova versão disponível')).toBeNull();
    primeiraMontagem.unmount();

    // Nenhum novo flag write nem dispatch acontece aqui — se o listener ao
    // vivo não limpou window.__swUpdateAvailable, o branch de replay do
    // próximo mount releria a flag ainda `true` e reabriria o banner,
    // contornando a escolha "Depois" do usuário.
    useUpdateStore.setState({ waiting: false, dismissed: false });
    const segundaMontagem = render(<UpdateBanner />);
    expect(segundaMontagem.queryByText('Nova versão disponível')).toBeNull();
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
