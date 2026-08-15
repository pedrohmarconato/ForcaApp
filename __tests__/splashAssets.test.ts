// __tests__/splashAssets.test.ts
// Guarda permanente de regressão (D-08-style, Fase 10 Plan 01): todo
// <link rel="apple-touch-startup-image"> em public/index.html precisa apontar
// para um arquivo PNG existente em public/splash/ — protege as Fases 11-13 de
// reintroduzir o flash de tela branca por PNG ausente/renomeado.
//
// Molde de varredura: __tests__/alertNoAlertRemanescente.test.ts (regex +
// guarda contra a própria varredura silenciosamente parar de achar coisa).

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const INDEX_HTML = join(__dirname, '..', 'public', 'index.html');
const SPLASH_DIR = join(__dirname, '..', 'public', 'splash');
const VERCEL_JSON = join(__dirname, '..', 'vercel.json');

/** Extrai todos os hrefs de <link rel="apple-touch-startup-image"> de um HTML. */
function listarHrefsSplash(html: string): string[] {
  const linkRegex = /<link\s+rel="apple-touch-startup-image"[^>]*href="([^"]+)"/g;
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

describe('guarda: apple-touch-startup-image aponta para arquivo existente', () => {
  it('todo href de apple-touch-startup-image resolve em public/splash/', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    const hrefs = listarHrefsSplash(html);

    // Guarda contra a própria regex parar de casar (molde
    // alertNoAlertRemanescente.test.ts): se ninguém colou o bloco de links
    // ainda, ou se a regex quebrar silenciosamente, este assert falha.
    expect(hrefs.length).toBeGreaterThan(0);

    const ausentes = hrefs.filter((href) => {
      const nomeArquivo = href.replace(/^\/splash\//, '');
      return !existsSync(join(SPLASH_DIR, nomeArquivo));
    });
    expect(ausentes).toEqual([]);
  });
});

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
 * busca livre. `new RegExp(source)` puro (sem âncoras) é diferente: o motor
 * de regex do JS tenta casar a partir de QUALQUER posição na string, então
 * para um path como "/splash/apple-splash-1170-2532.png" ele encontraria um
 * match espúrio a partir do segundo "/" (antes de "apple-splash..."), mesmo
 * com "splash" corretamente excluído — um falso positivo que não reflete o
 * comportamento real da borda da Vercel.
 * `[VERIFIED: raw.githubusercontent.com/vercel/vercel routing-utils/src/superstatic.ts
 * (sourceToRegex → pathToRegexp com strict/sensitive/delimiter, sem end:false)
 * e routing-utils/package.json (path-to-regexp 6.1.0/6.3.0, family v6 —
 * mesma semântica de ancoragem testada aqui com path-to-regexp@6.2.1), 2026-08-14]`
 */
function criarRegexAncorada(source: string): RegExp {
  return new RegExp(`^${source}$`);
}

describe('guarda: vercel.json não engole /splash/*.png (10-RESEARCH.md Pitfall #1)', () => {
  const PATH_SPLASH_EXEMPLO = '/splash/apple-splash-1170-2532.png';

  it('regra de rewrites (fallback de SPA) não casa com /splash/*.png', () => {
    const vercelJson: VercelConfig = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));
    const rewriteSource = vercelJson.rewrites[0].source;
    const regex = criarRegexAncorada(rewriteSource);

    expect(regex.test(PATH_SPLASH_EXEMPLO)).toBe(false);
  });

  it('regra de headers Cache-Control no-cache não casa com /splash/*.png', () => {
    const vercelJson: VercelConfig = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));

    // Identifica a entrada catch-all de no-cache pela presença do valor
    // "no-cache" combinado com um source que NÃO seja um alvo fixo
    // (/manifest.json, /_expo/static/(.*)) — molde 10-RESEARCH.md Task 2.
    const regraNoCacheCatchAll = vercelJson.headers.find(
      (regra) =>
        regra.headers.some((h) => h.key === 'Cache-Control' && h.value === 'no-cache') &&
        regra.source !== '/manifest.json' &&
        regra.source !== '/_expo/static/(.*)',
    );

    expect(regraNoCacheCatchAll).toBeDefined();
    const regex = criarRegexAncorada((regraNoCacheCatchAll as VercelHeaderRule).source);
    expect(regex.test(PATH_SPLASH_EXEMPLO)).toBe(false);
  });
});
