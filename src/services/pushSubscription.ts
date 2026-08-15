// src/services/pushSubscription.ts
// Opt-in de Web Push do aluno (PUSH-01). `subscribeToPush()` é a chamada que
// PRECISA ser a primeira expressão síncrona do handler de clique — o
// navegador do iOS descarta o gesto do usuário se qualquer `await`/checagem
// vier antes do `PushManager.subscribe()` (critério 2, Pitfall 3 de
// 13-RESEARCH.md). `navigator.serviceWorker.ready` já está resolvido (o SW é
// registrado no load do app pela Fase 11), então encadear `.then()` preserva
// o gesto — é uma microtask, não uma espera de rede real.

import { Platform } from 'react-native';

/** Chave pública VAPID, embutida em build time — nunca via fetch. */
export const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/**
 * Converte a chave pública VAPID (base64url) para o `Uint8Array` que
 * `PushManager.subscribe({ applicationServerKey })` exige (BufferSource).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Web Push só existe no alvo web, com Service Worker + PushManager reais. */
export const isPushSupported = (): boolean =>
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window;

/** Formato serializado de uma PushSubscription real do navegador. */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

/**
 * Dispara `PushManager.subscribe()` — deve ser a PRIMEIRA linha do handler
 * de onPress (nenhum await/checagem antes, sem exceção).
 */
export const subscribeToPush = (): Promise<PushSubscriptionJSON> =>
  navigator.serviceWorker.ready
    .then((reg) =>
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        // BufferSource espera um ArrayBuffer concreto; Uint8Array moderno é
        // genérico sobre ArrayBufferLike (inclui SharedArrayBuffer) — o cast
        // é seguro aqui porque urlBase64ToUint8Array sempre aloca um
        // ArrayBuffer comum (`new Uint8Array(n)`), nunca compartilhado.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }),
    )
    .then((sub) => sub.toJSON() as PushSubscriptionJSON);
