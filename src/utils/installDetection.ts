// src/utils/installDetection.ts
// Fase 12 Plano 01 (INST-02) — utilitário puro, síncrono, sem rede. Chamado
// só no mount de InstallScreen (web-only, ver Pattern 3 de 12-RESEARCH.md).
//
// Todo branch degrada para `false` por construção, nunca lança e nunca
// retorna `undefined` — um user-agent não reconhecido cai no estado 3
// (desktop/Android) da InstallScreen por design (Pitfall 4 de
// 12-RESEARCH.md), nunca numa tela em branco.

/**
 * iPhone/iPod sempre se identificam na própria UA. iPad moderno (iPadOS 13+)
 * finge ser Mac (`navigator.platform === 'MacIntel'`) — `maxTouchPoints > 1`
 * é o discriminador padrão (Mac com tela touch não existe).
 */
export const isIOSDevice = (ua: string, maxTouchPoints: number): boolean => {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
};

/**
 * Todo navegador em iOS é WebKit e inclui "Safari" na UA — o sinal real é a
 * AUSÊNCIA de qualquer um dos tokens "-iOS" dos outros navegadores.
 *
 * `GSA\/` (WR-02, 12-REVIEW.md): o app do Google Search no iOS também é
 * WebKit e mantém o token "Safari" na UA, mas é um in-app browser, não o
 * Safari de verdade — sem essa exclusão, um usuário que abre `/instalar` a
 * partir de um link compartilhado no app do Google cairia no Estado 1
 * (share sheet do Safari), instruções que não existem na chrome do GSA.
 */
export const isSafariBrowser = (ua: string): boolean => {
  const outroNavegadorIOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(ua);
  return /Safari/.test(ua) && !outroNavegadorIOS;
};

export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
};

export const isSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return isSafariBrowser(navigator.userAgent);
};

/**
 * "Já instalado": `navigator.standalone` cobre iOS legado (pré-15.4);
 * `matchMedia('(display-mode: standalone)')` cobre iOS 15.4+ e o resto das
 * plataformas. Checar só um dos dois sub-detecta em alguma versão de iOS
 * ainda em uso pelo público-alvo (12-CONTEXT.md).
 */
export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const legacyIOSFlag =
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const matchMediaFlag =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return legacyIOSFlag || matchMediaFlag;
};
