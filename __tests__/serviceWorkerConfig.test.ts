// __tests__/serviceWorkerConfig.test.ts
// Guarda permanente (Fase 11 Plano 01, Task 2): protege OFF-01 (o service
// worker nunca intercepta chamada de dado) e OFF-02 (headers no-cache/
// must-revalidate corretos antes de qualquer deploy — o `curl -I` de
// produção do Plano 11-03 só confirma o que este teste já travou aqui).
//
// Molde: __tests__/splashAssets.test.ts (mesma `criarRegexAncorada` para
// reproduzir a ancoragem `^...$` real do roteamento da Vercel, mesma técnica
// de varredura regex-com-guarda-contra-zero-match de
// __tests__/alertNoAlertRemanescente.test.ts).

import { readFileSync } from 'fs';
import { join } from 'path';

const WORKBOX_CONFIG = join(__dirname, '..', 'workbox-config.cjs');
const REGISTER_SW = join(__dirname, '..', 'public', 'register-sw.js');
const VERCEL_JSON = join(__dirname, '..', 'vercel.json');

// Tamanho medido do bundle web real em produção (11-RESEARCH.md Pitfall #1) —
// o limite de maximumFileSizeToCacheInBytes precisa ficar acima disto ou o
// bundle principal é excluído do precache sem nenhum erro visível.
const BUNDLE_SIZE_MEDIDO_BYTES = 3325222;

interface WorkboxConfig {
  globDirectory: string;
  globPatterns: string[];
  globIgnores: string[];
  swDest: string;
  navigateFallback: string;
  navigateFallbackDenylist: RegExp[];
  maximumFileSizeToCacheInBytes: number;
  skipWaiting: boolean;
  clientsClaim: boolean;
  cleanupOutdatedCaches: boolean;
  inlineWorkboxRuntime: boolean;
  runtimeCaching?: unknown;
  importScripts?: string[];
}

interface VercelHeaderEntry {
  key: string;
  value: string;
}

interface VercelRewriteRule {
  source: string;
  destination: string;
}

interface VercelHeaderRule {
  source: string;
  headers: VercelHeaderEntry[];
}

interface VercelConfig {
  rewrites: VercelRewriteRule[];
  headers: VercelHeaderRule[];
}

/**
 * Reproduz a semântica real do roteamento da Vercel para `source`: o pacote
 * `@vercel/routing-utils` (usado em produção) compila `source` via
 * `path-to-regexp` com `{ strict: true, sensitive: true }`, o que ANCORA o
 * regex resultante em `^...$` — casamento contra o pathname inteiro, não uma
 * busca livre. Mesma função de __tests__/splashAssets.test.ts.
 */
function criarRegexAncorada(source: string): RegExp {
  return new RegExp(`^${source}$`);
}

describe('guarda: workbox-config.cjs nunca intercepta chamada de dado (runtimeCaching)', () => {
  it('workbox-config.cjs não define runtimeCaching, globIgnores é vazio, e o limite de tamanho cobre o bundle real', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config: WorkboxConfig = require(WORKBOX_CONFIG);

    expect(config.runtimeCaching).toBeUndefined();
    expect(config).toEqual(expect.not.objectContaining({ runtimeCaching: expect.anything() }));
    expect(Array.isArray(config.globIgnores)).toBe(true);
    expect(config.globIgnores).toEqual([]);
    expect(config.maximumFileSizeToCacheInBytes).toBeGreaterThanOrEqual(BUNDLE_SIZE_MEDIDO_BYTES);
  });

  it('nunca ativa skipWaiting automático (prohibition da fase 11 — update só ao toque)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require('../workbox-config.cjs');
    expect(config.skipWaiting === undefined || config.skipWaiting === false).toBe(true);
  });

  it('exporta importScripts com push-handlers.js (Fase 13, PUSH-01/PUSH-05) sem tocar nas demais chaves', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config: WorkboxConfig = require(WORKBOX_CONFIG);
    expect(config.importScripts).toEqual(['push-handlers.js']);
  });
});

describe('guarda: navigateFallbackDenylist cobre _expo/ e api/ sem bloquear rotas comuns', () => {
  it('casa contra /_expo/... e /api/... mas não contra uma rota comum do app', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config: WorkboxConfig = require(WORKBOX_CONFIG);
    const denylist = config.navigateFallbackDenylist;

    expect(Array.isArray(denylist)).toBe(true);
    expect(denylist.length).toBeGreaterThan(0);

    const casaExpo = denylist.some((regex) => regex.test('/_expo/static/js/index.js'));
    const casaApi = denylist.some((regex) => regex.test('/api/workouts'));
    const casaRotaComum = denylist.some((regex) => regex.test('/treino/hoje'));

    expect(casaExpo).toBe(true);
    expect(casaApi).toBe(true);
    expect(casaRotaComum).toBe(false);
  });
});

describe('guarda: vercel.json — Cache-Control no-cache/must-revalidate para sw.js/register-sw.js/manifest.json (OFF-02)', () => {
  const vercelJson: VercelConfig = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));

  it('rewrite de SPA e header catch-all de no-cache não casam com /sw.js nem /register-sw.js', () => {
    const rewriteSource = vercelJson.rewrites[0].source;
    const rewriteRegex = criarRegexAncorada(rewriteSource);

    expect(rewriteRegex.test('/sw.js')).toBe(false);
    expect(rewriteRegex.test('/register-sw.js')).toBe(false);

    const regraNoCacheCatchAll = vercelJson.headers.find(
      (regra) =>
        regra.headers.some((h) => h.key === 'Cache-Control' && h.value === 'no-cache') &&
        regra.source !== '/manifest.json' &&
        regra.source !== '/_expo/static/(.*)',
    );

    expect(regraNoCacheCatchAll).toBeDefined();
    const catchAllRegex = criarRegexAncorada((regraNoCacheCatchAll as VercelHeaderRule).source);
    expect(catchAllRegex.test('/sw.js')).toBe(false);
    expect(catchAllRegex.test('/register-sw.js')).toBe(false);
  });

  it('regras /sw.js, /register-sw.js e /manifest.json têm Cache-Control contendo must-revalidate', () => {
    const fontesEsperadas = ['/sw.js', '/register-sw.js', '/manifest.json'];

    fontesEsperadas.forEach((fonte) => {
      const regra = vercelJson.headers.find((r) => r.source === fonte);
      expect(regra).toBeDefined();
      const cacheControl = (regra as VercelHeaderRule).headers.find((h) => h.key === 'Cache-Control');
      expect(cacheControl).toBeDefined();
      expect((cacheControl as VercelHeaderEntry).value).toContain('must-revalidate');
    });
  });

  it('CSP global permanece com script-src self e sem unsafe-inline nessa diretiva', () => {
    const regraGlobal = vercelJson.headers.find((r) => r.source === '/(.*)');
    expect(regraGlobal).toBeDefined();
    const csp = (regraGlobal as VercelHeaderRule).headers.find((h) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();

    const diretivaScriptSrc = (csp as VercelHeaderEntry).value
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src'));

    expect(diretivaScriptSrc).toBeDefined();
    expect(diretivaScriptSrc).toContain("'self'");
    expect(diretivaScriptSrc).not.toContain("'unsafe-inline'");
  });
});

describe('guarda: public/register-sw.js — controlador, SKIP_WAITING e reload único (OFF-02)', () => {
  const registerSwSource = readFileSync(REGISTER_SW, 'utf8');

  // Remove linhas de comentário `//` antes de contar ocorrências de código —
  // o cabeçalho do arquivo cita "window.location.reload()" em prosa
  // explicativa (linha 19), o que produziria um falso positivo de contagem
  // se comentários entrassem na varredura.
  const codigoSemComentarios = registerSwSource
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('//'))
    .join('\n');

  it('checa navigator.serviceWorker.controller (distingue instalação de atualização real)', () => {
    expect(registerSwSource).toMatch(/navigator\.serviceWorker\.controller/);
  });

  it('manda postMessage do tipo SKIP_WAITING para o worker em espera', () => {
    expect(registerSwSource).toMatch(/postMessage\(\{\s*type:\s*['"]SKIP_WAITING['"]\s*\}\)/);
  });

  it('uma flag de guarda (refreshing) precede a chamada de location.reload()', () => {
    expect(codigoSemComentarios).toMatch(/refreshing/);
    const indiceFlag = codigoSemComentarios.indexOf('var refreshing');
    const indiceReload = codigoSemComentarios.indexOf('window.location.reload()');
    expect(indiceFlag).toBeGreaterThan(-1);
    expect(indiceReload).toBeGreaterThan(-1);
    expect(indiceFlag).toBeLessThan(indiceReload);
  });

  it('location.reload() aparece exatamente uma vez no código (fora de comentários)', () => {
    const ocorrencias = codigoSemComentarios.match(/location\.reload\(\)/g) ?? [];
    expect(ocorrencias.length).toBe(1);
  });

  it('register() tem .catch() — falha de registro nunca vira unhandled rejection silenciosa (WR-01)', () => {
    expect(codigoSemComentarios).toMatch(/navigator\.serviceWorker\.register\(['"]\/sw\.js['"]\)[\s\S]*?\.catch\(/);
  });

  it('window.__swUpdateAvailable é gravado antes de CADA dispatchEvent de sw-update-available (WR-02: replay para listener que monta depois)', () => {
    const dispatch = "window.dispatchEvent(new CustomEvent('sw-update-available'));";
    const blocos = codigoSemComentarios.split(dispatch);
    // blocos.length - 1 == número de dispatches deste evento no arquivo. Duas
    // ocorrências esperadas: a checagem síncrona pós-register() e o handler
    // 'statechange' de updatefound — CustomEvent é fire-and-forget, então
    // cada uma precisa gravar a flag síncrona imediatamente antes, ou um
    // listener que monta depois do dispatch nunca vê o evento.
    expect(blocos.length - 1).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < blocos.length - 1; i += 1) {
      expect(blocos[i]).toMatch(/window\.__swUpdateAvailable = true;\s*$/);
    }
  });
});
