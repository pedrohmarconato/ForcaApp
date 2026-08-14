// src/store/alertStore.ts
// Estado global do alerta custom do web (WEB-01, D-01/D-02/D-04). Um único
// slot: nunca há mais de um alerta na tela ao mesmo tempo (mesma garantia do
// Alert.alert nativo, que é modal e bloqueia a UI). alertShim.ts escreve
// aqui no branch web; AlertHost.tsx lê e renderiza.
//
// O tipo AlertButton é definido e exportado NESTE arquivo — alertShim.ts
// importa daqui, não o contrário, para não criar dependência circular entre
// os dois módulos novos (store -> shim nunca, só shim -> store).

import { create } from 'zustand';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertPayload = {
  title: string;
  message: string | null;
  buttons: AlertButton[] | null;
};

type AlertState = {
  current: AlertPayload | null;
  show: (alert: AlertPayload) => void;
  dismiss: () => void;
};

export const useAlertStore = create<AlertState>((set) => ({
  current: null,
  show: (alert) => set({ current: alert }),
  dismiss: () => set({ current: null }),
}));
