// __tests__/themeModuleGraphSentinel.test.ts
//
// Sentinela estática: prova que o grafo de módulos alcançável a partir de
// src/theme/ nunca reintroduz src/contexts/AuthContext(.js) nem
// src/config/supabaseClient(.js). Tema é apresentação; identidade de conta
// chega só por prop, injetada de fora de src/theme/ (App.tsx).
//
// Técnica: parseia cada arquivo com @babel/parser (mesma técnica AST usada
// em __tests__/themeRuntimeCoverage.test.ts), coleta toda ImportDeclaration/
// ExportNamedDeclaration/ExportAllDeclaration com `source` e todo
// `require(...)`/`import(...)` estático, resolve especificadores relativos
// para caminhos reais do projeto e faz BFS a partir dos arquivos de
// src/theme/. Especificadores de pacote (não relativos) são fronteira do
// grafo do projeto e não são seguidos — evita atravessar node_modules.

import { parse } from '@babel/parser';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';

const PROJECT_ROOT = join(__dirname, '..');
const THEME_ROOT = join(PROJECT_ROOT, 'src/theme');
const RUNTIME_EXTENSION = /\.(?:js|jsx|ts|tsx)$/;
const TEST_FILE = /\.(?:test|spec)\.[^.]+$/;
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const FORBIDDEN_MODULES = [
  join(PROJECT_ROOT, 'src/contexts/AuthContext.js'),
  join(PROJECT_ROOT, 'src/config/supabaseClient.js'),
];

type AstNode = { type?: string; [key: string]: any };

const toRelative = (path: string): string =>
  path.startsWith(PROJECT_ROOT) ? path.slice(PROJECT_ROOT.length + 1) : path;

const listFilesRecursively = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(path));
    } else if (RUNTIME_EXTENSION.test(entry.name) && !TEST_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
};

const themeEntryFiles = (): string[] => listFilesRecursively(THEME_ROOT);

// Só especificadores relativos (`.`/`..`) pertencem ao grafo do projeto —
// pacotes de node_modules são a fronteira e não são atravessados.
const resolveSpecifier = (fromFile: string, specifier: string): string | null => {
  if (!specifier.startsWith('.')) return null;
  const base = resolvePath(dirname(fromFile), specifier);

  if (existsSync(base) && statSync(base).isFile()) return base;

  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }

  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of RESOLVE_EXTENSIONS) {
      const candidate = join(base, `index${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }

  return null;
};

// import/export ... from '...' só é sintaticamente válido no topo do módulo
// (a gramática de ES modules não permite dentro de função) — por isso conta
// como edge eager onde quer que apareça no AST. require(...)/import(...)
// dinâmico, ao contrário, PODEM aparecer dentro de um corpo de função — e aí
// só executam quando a função é chamada, nunca na carga do módulo. Por isso
// só contam como edge quando estão FORA de qualquer função: é exatamente
// isso que faz um `require` em call-time (ex.: src/navigation/linking.ts, e
// agora ThemeProvider.tsx:runSaveToken) não poluir o grafo estático — a
// mesma técnica teria sido detectada como edge SE não fosse essa distinção.
const FUNCTION_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'ObjectMethod',
]);

const collectStaticSpecifiers = (
  node: AstNode | null | undefined,
  insideFunction: boolean,
  specifiers: string[],
) => {
  if (!node || typeof node !== 'object') return;

  const isTypeOnly = node.importKind === 'type' || node.exportKind === 'type';
  if (
    (node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration') &&
    node.source?.type === 'StringLiteral'
  ) {
    if (!isTypeOnly) specifiers.push(node.source.value);
  } else if (!insideFunction) {
    const isRequireOrDynamicImport =
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' ||
        (node.callee?.type === 'Identifier' && node.callee.name === 'require')) &&
      node.arguments?.[0]?.type === 'StringLiteral';
    if (isRequireOrDynamicImport) specifiers.push(node.arguments[0].value);
  }

  const nextInsideFunction = insideFunction || FUNCTION_NODE_TYPES.has(node.type ?? '');
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) {
      value.forEach((child) => collectStaticSpecifiers(child, nextInsideFunction, specifiers));
    } else if (value && typeof value === 'object' && 'type' in value) {
      collectStaticSpecifiers(value as AstNode, nextInsideFunction, specifiers);
    }
  }
};

const staticSpecifiersOf = (filePath: string): string[] => {
  const content = readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = parse(content, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] });
  } catch (error) {
    // Arquivo não parseável estaticamente não pode virar uma travessia
    // silenciosa do grafo — falha explícita pedindo triagem manual em vez
    // de mascarar o caminho como "sem edge".
    throw new Error(`Sentinela não conseguiu parsear ${toRelative(filePath)}: ${error}`);
  }

  const specifiers: string[] = [];
  collectStaticSpecifiers(ast.program, false, specifiers);
  return specifiers;
};

describe('sentinela: grafo de módulos de src/theme/ nunca alcança AuthContext/supabaseClient', () => {
  it('varre pelo menos os arquivos conhecidos de src/theme/ (prova que a varredura não está vazia)', () => {
    const entries = themeEntryFiles().map(toRelative);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries).toEqual(
      expect.arrayContaining(['src/theme/ThemeProvider.tsx', 'src/theme/theme.ts']),
    );
  });

  it('não alcança AuthContext.js nem supabaseClient.js a partir de nenhum arquivo de src/theme/', () => {
    const visited = new Set<string>();
    const pathTo = new Map<string, string[]>();
    const queue: string[] = [];

    for (const entry of themeEntryFiles()) {
      pathTo.set(entry, [entry]);
      queue.push(entry);
    }

    const offenders: { target: string; chain: string[] }[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (FORBIDDEN_MODULES.includes(current)) {
        offenders.push({ target: current, chain: pathTo.get(current) ?? [current] });
      }

      if (!existsSync(current)) continue;

      for (const specifier of staticSpecifiersOf(current)) {
        const resolved = resolveSpecifier(current, specifier);
        if (!resolved || visited.has(resolved)) continue;
        if (!pathTo.has(resolved)) {
          pathTo.set(resolved, [...(pathTo.get(current) ?? [current]), resolved]);
        }
        queue.push(resolved);
      }
    }

    const readable = offenders.map(
      (offender) =>
        `${toRelative(offender.target)} alcançado via ${offender.chain
          .map(toRelative)
          .join(' -> ')}`,
    );
    expect(readable).toEqual([]);
  });

  // Verificação de não-trivialidade da própria técnica: um `require`/`import()`
  // fora de função tem de ser detectado (senão a guarda vale para qualquer
  // coisa por vacuidade); um `require` DENTRO do corpo de uma função (o
  // padrão usado em ThemeProvider.tsx:runSaveToken e em
  // src/navigation/linking.ts) não pode ser sinalizado, porque só executa se
  // e quando a função roda — nunca na carga do módulo. `import type` também
  // não conta: é apagado na compilação, zero pegada em runtime.
  it('distingue require/import eager de require em call-time e de import type', () => {
    const specifiersIn = (source: string) => {
      const ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] });
      const specifiers: string[] = [];
      collectStaticSpecifiers(ast.program, false, specifiers);
      return specifiers;
    };

    expect(specifiersIn(`import { x } from '../contexts/AuthContext';`)).toEqual([
      '../contexts/AuthContext',
    ]);
    expect(specifiersIn(`const x = require('../contexts/AuthContext');`)).toEqual([
      '../contexts/AuthContext',
    ]);
    expect(
      specifiersIn(`export const run = async () => {
        const { x } = require('../contexts/AuthContext');
        return x;
      };`),
    ).toEqual([]);
    expect(
      specifiersIn(`function run() {
        return require('../contexts/AuthContext');
      }`),
    ).toEqual([]);
    expect(specifiersIn(`import type { X } from '../contexts/AuthContext';`)).toEqual([]);
    expect(
      specifiersIn(`export type { X } from '../contexts/AuthContext';`),
    ).toEqual([]);
  });
});
