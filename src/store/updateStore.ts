// src/store/updateStore.ts
// Estado global do banner de atualização do service worker (OFF-02). Mesmo
// molde de alertStore.ts: um único slot, lido por UpdateBanner.tsx. A ponte
// com o service worker é window CustomEvent nos dois sentidos (register-sw.js
// do Plano 11-01 não passa pelo Metro, então não pode importar esta store
// diretamente) — UpdateBanner escuta 'sw-update-available' e chama
// setWaiting(true); applyUpdate() aqui só despacha 'sw-apply-update' na
// window, nunca chama reload diretamente. O reload em si é responsabilidade
// exclusiva de register-sw.js, guardado lá pela flag `refreshing`
// (11-RESEARCH.md Pitfall #8) — nenhum caminho desta store ou de
// UpdateBanner.tsx recarrega a página.

import { create } from 'zustand';

type UpdateState = {
  waiting: boolean;
  dismissed: boolean;
  setWaiting: (value: boolean) => void;
  dismiss: () => void;
  applyUpdate: () => void;
};

export const useUpdateStore = create<UpdateState>((set) => ({
  waiting: false,
  dismissed: false,
  // CR-01: uma nova atualização real (setWaiting(true)) sempre limpa
  // `dismissed` — senão, depois de um "Depois", o banner fica surdo a
  // qualquer 'sw-update-available' futuro pelo resto da sessão SPA, mesmo
  // para uma versão completamente diferente.
  setWaiting: (value) => set((state) => ({
    waiting: value,
    dismissed: value ? false : state.dismissed,
  })),
  dismiss: () => set({ waiting: false, dismissed: true }),
  applyUpdate: () => {
    window.dispatchEvent(new CustomEvent('sw-apply-update'));
  },
}));
