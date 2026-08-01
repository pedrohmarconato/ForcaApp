// __tests__/jointUiTokens.test.ts
// Treino Conjunto 2.0 — Sprint 02. A regra do design system, verificada.
//
// `src/components/ui/index.ts` diz: "as telas importam daqui — nunca declaram
// cor, fonte, raio ou espaçamento próprios". Sem um teste, essa frase envelhece
// no primeiro `#1E1E1E` que alguém cola às pressas.
//
// A regra REAL, e não a absoluta: `View` e `StyleSheet` são permitidos para
// LAYOUT. O que se proíbe é literal visual — cor, tamanho de fonte, raio e
// espaçamento numérico.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ARQUIVOS = [
  'src/components/joint/index.tsx',
  'src/components/joint/JointInviteCard.tsx',
  'src/screens/JointInviteScreen.tsx',
  'src/screens/JointJoinScreen.tsx',
  'src/screens/JointLobbyScreen.tsx',
];

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('nenhum literal visual', () => {
  it.each(ARQUIVOS)('%s não declara cor literal', (rel) => {
    const fonte = ler(rel);
    expect(fonte).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(fonte).not.toMatch(/\brgba?\(/);
  });

  it.each(ARQUIVOS)('%s não declara fonte, raio ou tamanho de fonte solto', (rel) => {
    const fonte = ler(rel);
    // Valores visuais só podem vir do tema.
    for (const prop of ['fontSize', 'borderRadius', 'fontFamily', 'fontWeight']) {
      const literais = fonte.match(new RegExp(`${prop}:\\s*(?!theme\\.)['\\d]`, 'g')) ?? [];
      expect({ prop, literais }).toEqual({ prop, literais: [] });
    }
  });

  it.each(ARQUIVOS)('%s não declara espaçamento numérico solto', (rel) => {
    const fonte = ler(rel);
    for (const prop of ['padding', 'margin', 'gap', 'letterSpacing']) {
      const literais = fonte.match(new RegExp(`\\b${prop}[A-Za-z]*:\\s*\\d`, 'g')) ?? [];
      expect({ prop, literais }).toEqual({ prop, literais: [] });
    }
  });
});

describe('os componentes visuais vêm do design system', () => {
  it.each(ARQUIVOS)('%s importa de components/ui', (rel) => {
    expect(ler(rel)).toMatch(/from '(\.\.\/)+(components\/)?ui(\/|')/);
  });

  it('layout com View/StyleSheet continua permitido — a regra não proíbe layout', () => {
    const fonte = ler('src/components/joint/index.tsx');
    expect(fonte).toContain('StyleSheet.create');
    expect(fonte).toContain('flexDirection');
  });
});

describe('acessibilidade e idioma', () => {
  it('toda tela nova tem rótulo acessível nas ações', () => {
    // O `Button` do design system deriva `accessibilityLabel` do `label`, então
    // basta que os rótulos existam e estejam em pt-BR.
    for (const rel of ARQUIVOS) {
      const fonte = ler(rel);
      const rotulos = fonte.match(/label=["'{`]([^"'`}]+)/g) ?? [];
      expect(rotulos.length).toBeGreaterThan(0);
    }
  });

  it('sem gerúndio em rótulo de ação', () => {
    for (const rel of ARQUIVOS) {
      const fonte = ler(rel);
      const rotulos = [...fonte.matchAll(/label=["']([^"']+)["']/g)].map((m) => m[1]);
      const comGerundio = rotulos.filter((r) => /\b\w+ndo\b/.test(r));
      expect({ rel, comGerundio }).toEqual({ rel, comGerundio: [] });
    }
  });
});

describe('o diretório joint não cresce sem teste', () => {
  it('todo componente novo entra na lista verificada', () => {
    const arquivos = readdirSync(join(process.cwd(), 'src/components/joint'));
    expect(arquivos.sort()).toEqual(['JointInviteCard.tsx', 'index.tsx']);
  });
});
