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
