/**
 * @jest-environment jsdom
 */
// __tests__/installDetection.test.ts
// Cobertura unitária de src/utils/installDetection.ts (Fase 12 Plano 01,
// Task 1). Puro, síncrono, sem rede — cobre os helpers isIOSDevice/
// isSafariBrowser (tokens de UA) e os wrappers públicos isIOS/isSafari/
// isStandalone (guardas de navigator/window ausentes, jsdom real quando
// presentes). Molde de mock de navigator.userAgent: __tests__/
// UpdateBanner.test.tsx (Object.defineProperty, ambiente jsdom real).

import {
  isIOSDevice,
  isSafariBrowser,
  isIOS,
  isSafari,
  isStandalone,
} from '../src/utils/installDetection';

const UA_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1';
const UA_IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/119.0 Mobile/15E148 Safari/605.1.15';
const UA_IPHONE_EDGE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/119.0.2151.58 Mobile/15E148 Safari/605.1.15';
const UA_IPHONE_OPERA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/9.2.0 Mobile/15E148 Safari/605.1.15';
// UA real do app do Google (GSA) no iOS: mantém o token "Safari" (é WebKit,
// como todo navegador iOS) mas NÃO é Safari de verdade — in-app browser do
// app Google Search. WR-02 (12-REVIEW.md): sem exclusão explícita de
// "GSA/", isSafariBrowser classificava isso como Safari real.
const UA_IPHONE_GSA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 GSA/259.0.629865990 Mobile/15E148 Safari/604.1';
const UA_IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const UA_WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

describe('installDetection: isIOSDevice (helper puro)', () => {
  it('UA "iPhone" -> true', () => {
    expect(isIOSDevice(UA_IPHONE_SAFARI, 0)).toBe(true);
  });

  it('UA "iPad" -> true', () => {
    expect(isIOSDevice(UA_IPAD_SAFARI, 5)).toBe(true);
  });

  it('UA "Macintosh" + maxTouchPoints=5 -> true (unmask iPadOS 13+)', () => {
    expect(isIOSDevice(UA_MAC_SAFARI, 5)).toBe(true);
  });

  it('UA "Macintosh" + maxTouchPoints=0 -> false (Mac real)', () => {
    expect(isIOSDevice(UA_MAC_SAFARI, 0)).toBe(false);
  });

  it('UA "Mozilla/5.0 (Windows NT 10.0)" -> false', () => {
    expect(isIOSDevice(UA_WINDOWS_CHROME, 0)).toBe(false);
  });

  it('UA "" -> false', () => {
    expect(isIOSDevice('', 0)).toBe(false);
  });
});

describe('installDetection: isSafariBrowser (helper puro)', () => {
  it('UA com "Safari" e sem outro token -> true', () => {
    expect(isSafariBrowser(UA_IPHONE_SAFARI)).toBe(true);
  });

  it('UA com "CriOS" -> false', () => {
    expect(isSafariBrowser(UA_IPHONE_CHROME)).toBe(false);
  });

  it('UA com "FxiOS" -> false', () => {
    expect(isSafariBrowser(UA_IPHONE_FIREFOX)).toBe(false);
  });

  it('UA com "EdgiOS" -> false', () => {
    expect(isSafariBrowser(UA_IPHONE_EDGE)).toBe(false);
  });

  it('UA com "OPiOS" -> false', () => {
    expect(isSafariBrowser(UA_IPHONE_OPERA)).toBe(false);
  });

  it('UA sem "Safari" e sem token nenhum -> false (fallback seguro)', () => {
    expect(isSafariBrowser('bot-desconhecido/1.0')).toBe(false);
  });

  it('UA com "GSA/" (Google app iOS, in-app browser) -> false (WR-02)', () => {
    expect(isSafariBrowser(UA_IPHONE_GSA)).toBe(false);
  });
});

describe('installDetection: isIOS()/isSafari() delegam para os helpers via navigator mockado', () => {
  const uaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  const touchDescriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

  afterEach(() => {
    if (uaDescriptor) Object.defineProperty(navigator, 'userAgent', uaDescriptor);
    if (touchDescriptor) Object.defineProperty(navigator, 'maxTouchPoints', touchDescriptor);
  });

  it('isIOS() com navigator.userAgent de iPhone -> true', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: UA_IPHONE_SAFARI });
    expect(isIOS()).toBe(true);
  });

  it('isIOS() com navigator.userAgent de desktop Windows -> false', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: UA_WINDOWS_CHROME });
    expect(isIOS()).toBe(false);
  });

  it('isIOS() com navigator.userAgent de Android -> false', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: UA_ANDROID_CHROME });
    expect(isIOS()).toBe(false);
  });

  it('isSafari() com navigator.userAgent de Safari real -> true', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: UA_IPHONE_SAFARI });
    expect(isSafari()).toBe(true);
  });

  it('isSafari() com navigator.userAgent CriOS -> false', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: UA_IPHONE_CHROME });
    expect(isSafari()).toBe(false);
  });
});

describe('installDetection: isStandalone()', () => {
  const standaloneDescriptor = Object.getOwnPropertyDescriptor(navigator, 'standalone');
  const matchMediaOriginal = window.matchMedia;

  afterEach(() => {
    if (standaloneDescriptor) {
      Object.defineProperty(navigator, 'standalone', standaloneDescriptor);
    } else {
      delete (navigator as unknown as { standalone?: boolean }).standalone;
    }
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMediaOriginal });
  });

  it('navigator.standalone=true -> true', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });
    expect(isStandalone()).toBe(true);
  });

  it("window.matchMedia('(display-mode: standalone)').matches=true -> true", () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });
    expect(isStandalone()).toBe(true);
  });

  it('ambos false -> false', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });
    expect(isStandalone()).toBe(false);
  });

  it('window.matchMedia ausente (não é function) -> não lança, cai só para navigator.standalone', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    expect(() => isStandalone()).not.toThrow();
    expect(isStandalone()).toBe(true);
  });

  it('window.matchMedia ausente e navigator.standalone false -> false, nunca lança', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    expect(() => isStandalone()).not.toThrow();
    expect(isStandalone()).toBe(false);
  });
});
