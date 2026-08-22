import { parse } from '@babel/parser';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { basename, join, relative, sep } from 'path';

const PROJECT_ROOT = join(__dirname, '..');
const SRC_ROOT = join(PROJECT_ROOT, 'src');
const APP_FILE = join(PROJECT_ROOT, 'App.tsx');
const RUNTIME_EXTENSION = /\.(?:js|jsx|ts|tsx)$/;
const EXPECTED_CONSUMER_COUNT = 32;
const EXCLUDED_DIRECTORY_NAMES = new Set([
  'assets',
  'history',
  'historical',
  'legacy',
  'archive',
  'archives',
]);

// Os SUMMARYs de 18-04/05/06/10 não estão presentes neste worktree. Esta é a
// lista congelada a partir dos arquivos reais e dos PLANs: design system
// (18-05), telas/navegação (18-04/06), componentes finais (18-07) e gráfico
// omitido que entrou no 18-10.
const CONSUMIDORES_ORIGINAIS = [
  { path: 'src/components/ui/Button.tsx', owner: '18-05 Task 1' },
  { path: 'src/components/ui/Controls.tsx', owner: '18-05 Task 1' },
  { path: 'src/components/ui/Feedback.tsx', owner: '18-05 Task 2' },
  { path: 'src/components/ui/FModules.tsx', owner: '18-05 Task 2' },
  { path: 'src/components/ui/Logo.tsx', owner: '18-05 Task 1' },
  { path: 'src/components/ui/Surface.tsx', owner: '18-05 Task 1' },
  { path: 'src/components/ui/TextField.tsx', owner: '18-05 Task 2' },
  { path: 'src/navigation/RootNavigator.js', owner: '18-06 Task 1' },
  { path: 'src/navigation/MainNavigator.tsx', owner: '18-04 Task 1' },
  { path: 'src/screens/HomeScreen.tsx', owner: '18-06 Task 1' },
  { path: 'src/screens/ProgressScreen.tsx', owner: '18-06 Task 1' },
  { path: 'src/screens/SessionHistoryScreen.tsx', owner: '18-06 Task 1' },
  { path: 'src/screens/SessionHistoryDetailScreen.tsx', owner: '18-06 Task 2' },
  { path: 'src/screens/WorkoutDetailScreen.tsx', owner: '18-06 Task 2' },
  { path: 'src/screens/InstallScreen.tsx', owner: '18-06 Task 2' },
  { path: 'src/screens/ExercisePickerScreen.tsx', owner: '18-06 Task 2' },
  { path: 'src/screens/QuestionnaireScreen.tsx', owner: '18-06 Task 3' },
  { path: 'src/screens/PostQuestionnaireChat.tsx', owner: '18-06 Task 3' },
  { path: 'src/screens/ManualPlanEditorScreen.tsx', owner: '18-06 Task 3' },
  { path: 'src/screens/ActiveSessionScreen.tsx', owner: '18-06 Task 3' },
  { path: 'src/screens/ProfileScreen.tsx', owner: '18-04 Task 1' },
  { path: 'src/screens/SettingsScreen.tsx', owner: '18-04 Task 1/2' },
  { path: 'src/components/session/SessionPlayer.tsx', owner: '18-07 Task 1' },
  { path: 'src/components/session/SessionQueue.tsx', owner: '18-07 Task 1' },
  { path: 'src/components/session/SessionSummary.tsx', owner: '18-07 Task 1' },
  { path: 'src/components/session/AdaptationSheet.tsx', owner: '18-07 Task 2' },
  { path: 'src/components/session/CheckInSheet.tsx', owner: '18-07 Task 2' },
  { path: 'src/components/session/ReplanBanner.tsx', owner: '18-07 Task 2' },
  { path: 'src/components/AlertHost.tsx', owner: '18-07 Task 3' },
  // Halo neon pulsando atrás de ForcaMark na abertura de cold start — cor
  // vem de useTheme() (dinâmico), não de import estático de theme.ts.
  { path: 'src/components/AppOpening.tsx', owner: 'Fase 3 (abertura animada)' },
  { path: 'src/components/UpdateBanner.tsx', owner: '18-07 Task 3' },
  {
    path: 'src/components/progress/CardioEvolucaoChart.tsx',
    owner: '18-10 Task 1',
  },
] as const;

// A regra captura somente tokens de acento. `colors.status.*` é funcional e
// fica deliberadamente fora dela, inclusive quando o neon selecionado é red.
// O operador opcional precisa ser tratado como uma forma de acesso legítima,
// não como um caractere literal entre o identificador e o token.
const MEMBER_ACCESS = String.raw`\s*(?:\.|\?\.)\s*`;
const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const ACCENT_ACCESS = new RegExp(
  [
    String.raw`\b${IDENTIFIER}${MEMBER_ACCESS}colors${MEMBER_ACCESS}(?:accent\b|text${MEMBER_ACCESS}accent\b|border${MEMBER_ACCESS}focus\b)`,
    String.raw`\b${IDENTIFIER}${MEMBER_ACCESS}palette${MEMBER_ACCESS}neon\b`,
    String.raw`\b(?:colors|palette)${MEMBER_ACCESS}(?:accent\b|text${MEMBER_ACCESS}accent\b|border${MEMBER_ACCESS}focus\b|neon\b)`,
  ].join('|'),
);
const THEME_MODULE_SOURCE = String.raw`['"][^'"]*theme/theme(?:\.[^'"]+)?['"]`;
const STATIC_THEME_IMPORT = new RegExp(
  String.raw`\bimport\s+(?!type\b)[^;]+?\sfrom\s+${THEME_MODULE_SOURCE}`,
);
const STATIC_THEME_REQUIRE = new RegExp(
  String.raw`\brequire\s*\(\s*${THEME_MODULE_SOURCE}\s*\)`,
);
const STATIC_REQUIRE_TOKEN_ACCESS = new RegExp(
  String.raw`\brequire\s*\(\s*${THEME_MODULE_SOURCE}\s*\)${MEMBER_ACCESS}(?:colors${MEMBER_ACCESS}(?:accent\b|text${MEMBER_ACCESS}accent\b|border${MEMBER_ACCESS}focus\b)|palette${MEMBER_ACCESS}neon\b)`,
);
const STATIC_THEME_TOKEN_TEXT_ACCESS =
  /(?:\b(?:colors|palette)\b[\s\S]{0,160}\b(?:accent|neon|focus)\b|\[\s*['"](?:colors|palette|accent|neon)['"]\s*\])/;
const THEME_PROVIDER_IMPORT =
  /from\s+['"][^'"]*theme\/ThemeProvider['"]/;
const THEME_HOOK = /\buseTheme(?:Styles)?\s*\(/;
const LEGACY_YELLOW = /#ebff00\b|rgba\(\s*235\s*,\s*255\s*,\s*0\s*,/i;
const NAMED_TOKEN_IMPORTS = new Set(['colors', 'palette']);

const APP_SPLASH_ACCENT_ACCESS =
  /<ActivityIndicator\b[^>]*\bcolor\s*=\s*\{\s*theme\s*\.\s*colors\s*\.\s*accent\s*\.\s*main\s*\}[^>]*\/>/g;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type StaticThemeBindings = {
  objectBindings: string[];
  tokenBindings: string[];
};

const addNamedTokenBindings = (clause: string, bindings: string[]) => {
  const namedImports = clause.match(/\{([\s\S]*)\}/)?.[1];
  if (!namedImports) return;

  for (const specifier of namedImports.split(',')) {
    const normalized = specifier.trim();
    if (!normalized || normalized.startsWith('type ')) continue;
    const [imported, local] = normalized.split(/\s+as\s+/).map((part) => part.trim());
    if (NAMED_TOKEN_IMPORTS.has(imported)) bindings.push(local || imported);
  }
};

const findStaticThemeBindings = (content: string): StaticThemeBindings => {
  const objectBindings: string[] = [];
  const tokenBindings: string[] = [];
  const staticImportPattern = new RegExp(
    String.raw`\bimport\s+([^;]+?)\sfrom\s+${THEME_MODULE_SOURCE}`,
    'g',
  );

  for (const match of content.matchAll(staticImportPattern)) {
    const clause = match[1].trim();
    if (clause.startsWith('type ')) continue;

    const defaultImport = clause.match(/^([A-Za-z_$][\w$]*)/);
    if (defaultImport) objectBindings.push(defaultImport[1]);
    if (clause.startsWith('* as ')) objectBindings.push(clause.slice(5).trim());
    addNamedTokenBindings(clause, tokenBindings);
  }

  const requireObjectPattern = new RegExp(
    String.raw`\b(?:const|let|var)\s+(${IDENTIFIER})\s*=\s*require\s*\(\s*${THEME_MODULE_SOURCE}\s*\)(?:${MEMBER_ACCESS}default)?`,
    'g',
  );
  for (const match of content.matchAll(requireObjectPattern)) {
    objectBindings.push(match[1]);
  }

  const requireDestructurePattern = new RegExp(
    String.raw`\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*${THEME_MODULE_SOURCE}\s*\)`,
    'g',
  );
  for (const match of content.matchAll(requireDestructurePattern)) {
    addNamedTokenBindings(
      `{${match[1].replace(/:/g, ' as ')}}`,
      tokenBindings,
    );
  }

  const knownObjects = new Set(objectBindings);
  const destructureFromObjectPattern = new RegExp(
    String.raw`\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(${IDENTIFIER})\b`,
    'g',
  );
  for (const match of content.matchAll(destructureFromObjectPattern)) {
    if (!knownObjects.has(match[2])) continue;
    addNamedTokenBindings(
      `{${match[1].replace(/:/g, ' as ')}}`,
      tokenBindings,
    );
  }

  return { objectBindings, tokenBindings };
};

type AstNode = {
  type?: string;
  [key: string]: any;
};

const unwrapAstNode = (node: AstNode | null | undefined): AstNode | null => {
  let current = node ?? null;
  while (
    current &&
    ['TSAsExpression', 'TSNonNullExpression', 'TypeCastExpression', 'ParenthesizedExpression'].includes(
      current.type ?? '',
    )
  ) {
    current = current.expression;
  }
  return current;
};

const walkAst = (node: AstNode | null | undefined, visit: (node: AstNode) => void) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) {
      value.forEach((child) => walkAst(child, visit));
    } else if (value && typeof value === 'object' && 'type' in value) {
      walkAst(value as AstNode, visit);
    }
  }
};

const isThemeModuleValue = (value: unknown): value is string =>
  typeof value === 'string' && /(?:^|\/)theme\/theme(?:\.[^/]*)?$/.test(value);

const isThemeRequire = (node: AstNode | null | undefined): boolean => {
  const current = unwrapAstNode(node);
  return Boolean(
    current?.type === 'CallExpression' &&
      current.callee?.type === 'Identifier' &&
      current.callee.name === 'require' &&
      current.arguments?.length === 1 &&
      current.arguments[0]?.type === 'StringLiteral' &&
      isThemeModuleValue(current.arguments[0].value),
  );
};

const propertyNameOf = (node: AstNode | null | undefined): string | null => {
  const current = unwrapAstNode(node);
  if (!current) return null;
  if (current.type === 'Identifier') return current.name;
  if (current.type === 'StringLiteral' || current.type === 'NumericLiteral') {
    return String(current.value);
  }
  return null;
};

const bindStaticPattern = (
  pattern: AstNode | null | undefined,
  basePath: string[],
  bindings: Map<string, string[]>,
) => {
  const current = unwrapAstNode(pattern);
  if (!current) return;
  if (current.type === 'Identifier') {
    bindings.set(current.name, basePath);
    return;
  }
  if (current.type !== 'ObjectPattern') return;

  for (const property of current.properties ?? []) {
    if (property.type !== 'ObjectProperty') continue;
    const key = propertyNameOf(property.key);
    if (key) bindStaticPattern(property.value, [...basePath, key], bindings);
  }
};

const staticPathOf = (
  node: AstNode | null | undefined,
  bindings: Map<string, string[]>,
): string[] | null => {
  const current = unwrapAstNode(node);
  if (!current) return null;
  if (current.type === 'Identifier') return bindings.get(current.name) ?? null;
  if (isThemeRequire(current)) return ['__theme_root__'];
  if (!['MemberExpression', 'OptionalMemberExpression'].includes(current.type ?? '')) {
    return null;
  }

  const objectPath = staticPathOf(current.object, bindings);
  if (!objectPath) return null;
  const property = propertyNameOf(current.property);
  return [...objectPath, property ?? '__computed__'];
};

const isStaticAccentPath = (path: string[]): boolean => {
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] === '__computed__') {
      return path.includes('__theme_root__') || path[0] === 'colors' || path[0] === 'palette';
    }
    if (
      path[index] === 'colors' &&
      (path[index + 1] === 'accent' ||
        (path[index + 1] === 'text' && path[index + 2] === 'accent') ||
        (path[index + 1] === 'border' && path[index + 2] === 'focus'))
    ) {
      return true;
    }
    if (path[index] === 'palette' && path[index + 1] === 'neon') return true;
  }
  return false;
};

const hasStaticThemeTokenAccessWithAst = (content: string): boolean => {
  const ast = parse(content, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript'],
  });
  const bindings = new Map<string, string[]>();

  walkAst(ast.program, (node) => {
    if (node.type !== 'ImportDeclaration' || !isThemeModuleValue(node.source?.value)) return;
    if (node.importKind === 'type') return;
    for (const specifier of node.specifiers ?? []) {
      if (specifier.importKind === 'type') continue;
      if (specifier.type === 'ImportDefaultSpecifier' || specifier.type === 'ImportNamespaceSpecifier') {
        bindings.set(specifier.local.name, ['__theme_root__']);
      } else if (specifier.type === 'ImportSpecifier') {
        const imported = propertyNameOf(specifier.imported);
        if (imported === 'colors' || imported === 'palette') {
          bindings.set(specifier.local.name, [imported]);
        }
      }
    }
  });

  walkAst(ast.program, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    const initialPath = staticPathOf(node.init, bindings);
    if (initialPath) bindStaticPattern(node.id, initialPath, bindings);
  });

  let found = false;
  walkAst(ast.program, (node) => {
    if (found || !['MemberExpression', 'OptionalMemberExpression'].includes(node.type ?? '')) {
      return;
    }
    const path = staticPathOf(node, bindings);
    if (path && isStaticAccentPath(path)) found = true;
  });
  return found;
};

const hasStaticThemeTokenAccessLexically = (content: string): boolean => {
  if (!STATIC_THEME_IMPORT.test(content) && !STATIC_THEME_REQUIRE.test(content)) {
    return false;
  }

  const { objectBindings, tokenBindings } = findStaticThemeBindings(content);
  const objectAccess = objectBindings.some((binding) => {
    const objectPattern = new RegExp(
      String.raw`\b${escapeRegExp(binding)}${MEMBER_ACCESS}(?:colors${MEMBER_ACCESS}(?:accent\b|text${MEMBER_ACCESS}accent\b|border${MEMBER_ACCESS}focus\b)|palette${MEMBER_ACCESS}neon\b)`,
    );
    return objectPattern.test(content);
  });
  const tokenAccess = tokenBindings.some((binding) => {
    const tokenPattern = new RegExp(
      String.raw`\b${escapeRegExp(binding)}${MEMBER_ACCESS}(?:accent\b|neon\b)`,
    );
    return tokenPattern.test(content);
  });

  return (
    STATIC_REQUIRE_TOKEN_ACCESS.test(content) ||
    STATIC_THEME_TOKEN_TEXT_ACCESS.test(content) ||
    objectAccess ||
    tokenAccess
  );
};

const hasStaticThemeTokenAccess = (content: string): boolean => {
  if (!STATIC_THEME_IMPORT.test(content) && !STATIC_THEME_REQUIRE.test(content)) {
    return false;
  }
  try {
    return hasStaticThemeTokenAccessWithAst(content);
  } catch (_error) {
    return hasStaticThemeTokenAccessLexically(content);
  }
};

// Captura estática de acento é permitida só na própria fonte dos tokens e na
// splash/auth pre-profile, que a UI-SPEC declara amarelas antes da conta.
// Um consumidor pode manter o singleton apenas para geometria neutra; a regra
// abaixo rejeita quando esse import resolve qualquer token de acento.
const STATIC_THEME_ALLOWLIST = new Map<string, string>([
  ['src/theme/theme.ts', 'fonte dos tokens e fallback yellow do sistema'],
  ['App.tsx', 'splash pre-profile explicitamente amarela na UI-SPEC Runtime Coverage'],
]);

const toRelativePath = (path: string): string =>
  relative(PROJECT_ROOT, path).split(sep).join('/');

const isExcludedRuntimePath = (path: string): boolean => {
  const normalized = path.split(sep).join('/');
  const segments = normalized.split('/');
  const fileName = basename(normalized);
  const relativeSourcePath = normalized.includes('/src/')
    ? normalized.slice(normalized.lastIndexOf('/src/') + 1)
    : normalized;

  return (
    segments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment)) ||
    relativeSourcePath === 'src/theme/theme.ts' ||
    /\.test\.[^.]+$/.test(fileName) ||
    /\.spec\.[^.]+$/.test(fileName)
  );
};

const listRuntimeFilesRecursively = (directory: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRuntimeFilesRecursively(path));
    } else if (RUNTIME_EXTENSION.test(entry.name) && !isExcludedRuntimePath(path)) {
      files.push(path);
    }
  }

  return files;
};

const listRuntimeFiles = (): string[] => [
  ...listRuntimeFilesRecursively(SRC_ROOT),
  ...(RUNTIME_EXTENSION.test(APP_FILE) ? [APP_FILE] : []),
];

const ownerByPath: Map<string, string> = new Map(
  CONSUMIDORES_ORIGINAIS.map(({ path, owner }) => [path, owner]),
);

const findingsForFile = (path: string, content: string): string[] => {
  const findings: string[] = [];
  const owner = ownerByPath.get(path) ?? 'novo consumidor fora do inventário';
  const hasAccentToken = ACCENT_ACCESS.test(content);
  const hasProviderHook = THEME_PROVIDER_IMPORT.test(content) && THEME_HOOK.test(content);
  const isAllowlisted = STATIC_THEME_ALLOWLIST.has(path);

  if (path === 'App.tsx') {
    const accentAccesses = [
      ...content.matchAll(new RegExp(ACCENT_ACCESS.source, 'g')),
    ];
    const allowedSplashAccesses = [...content.matchAll(APP_SPLASH_ACCENT_ACCESS)];
    if (
      allowedSplashAccesses.length !== 1 ||
      accentAccesses.length !== allowedSplashAccesses.length
    ) {
      findings.push(
        `${path} [owner ${owner}]: somente o acento do splash pode ser estático`,
      );
    }
    if (LEGACY_YELLOW.test(content)) {
      findings.push(`${path} [owner ${owner}]: hex/RGBA amarelo legado`);
    }
    return findings;
  }

  if (hasAccentToken && !hasProviderHook && !isAllowlisted) {
    findings.push(`${path} [owner ${owner}]: acento sem ThemeProvider`);
  }
  if (!isAllowlisted && hasStaticThemeTokenAccess(content)) {
    findings.push(`${path} [owner ${owner}]: captura por import estático de tokens`);
  }
  if (!isAllowlisted && LEGACY_YELLOW.test(content)) {
    findings.push(`${path} [owner ${owner}]: hex/RGBA amarelo legado`);
  }

  return findings;
};

describe('guarda: cobertura runtime do acento neon (18-07 Task 3)', () => {
  it('varre src/ recursivamente e App.tsx, fora de testes, theme.ts, assets, Swift e históricos', () => {
    const scanned = listRuntimeFiles().map(toRelativePath);

    expect(scanned.length).toBeGreaterThan(50);
    expect(scanned).toContain('App.tsx');
    expect(scanned).not.toContain('src/theme/theme.ts');
    expect(scanned.some((path) => path.includes('__tests__'))).toBe(false);
    expect(scanned.some((path) => path.includes('/assets/'))).toBe(false);
    expect(scanned.some((path) => path.endsWith('.swift'))).toBe(false);
    expect(scanned.some((path) => path.includes('.planning'))).toBe(false);
  });

  it('mantém o inventário explícito e compara exatamente os consumidores detectados', () => {
    const paths = CONSUMIDORES_ORIGINAIS.map(({ path }) => path);
    const scanned = new Set(listRuntimeFiles().map(toRelativePath));
    const detected = new Set(
      listRuntimeFiles()
        .filter((path) => ACCENT_ACCESS.test(readFileSync(path, 'utf8')))
        .map(toRelativePath),
    );
    for (const allowlistedPath of STATIC_THEME_ALLOWLIST.keys()) {
      detected.delete(allowlistedPath);
    }

    expect(paths).not.toEqual([]);
    expect(paths).toHaveLength(EXPECTED_CONSUMER_COUNT);
    expect(new Set(paths).size).toBe(EXPECTED_CONSUMER_COUNT);
    expect(paths.every((path) => existsSync(join(PROJECT_ROOT, path)))).toBe(true);
    expect([...detected].sort()).toEqual([...paths].sort());
    expect(paths.every((path) => scanned.has(path))).toBe(true);
    expect(paths).toContain('src/components/progress/CardioEvolucaoChart.tsx');
  });

  it('exige provider para tokens dinâmicos e bloqueia captura estática ou amarelo legado', () => {
    for (const absolutePath of listRuntimeFiles()) {
      const path = toRelativePath(absolutePath);
      const content = readFileSync(absolutePath, 'utf8');
      expect(findingsForFile(path, content)).toEqual([]);
    }
  });

  it('mantém allowlist curta e impede palette.neon nos consumidores', () => {
    expect([...STATIC_THEME_ALLOWLIST.keys()]).toEqual(['src/theme/theme.ts', 'App.tsx']);

    const findings: string[] = [];
    for (const consumer of CONSUMIDORES_ORIGINAIS) {
      const content = readFileSync(join(PROJECT_ROOT, consumer.path), 'utf8');
      if (/\b[A-Za-z_$][\w$]*\s*\.\s*palette\s*\.\s*neon\b/.test(content)) {
        findings.push(`${consumer.path} [owner ${consumer.owner}]: palette.neon`);
      }
    }

    expect(findings).toEqual([]);
  });

  it('separa acento estético de status funcional e reconhece os regressors contratados', () => {
    expect(ACCENT_ACCESS.test('theme.colors.accent.main')).toBe(true);
    expect(ACCENT_ACCESS.test('runtimeTheme.colors.text.accent')).toBe(true);
    expect(ACCENT_ACCESS.test('theme.colors.border.focus')).toBe(true);
    expect(ACCENT_ACCESS.test('theme.palette.neon')).toBe(true);
    expect(ACCENT_ACCESS.test('theme?.colors?.accent?.main')).toBe(true);
    expect(ACCENT_ACCESS.test('palette.neon')).toBe(true);
    expect(ACCENT_ACCESS.test('theme.colors.status.danger')).toBe(false);
    expect(LEGACY_YELLOW.test('#EBFF00')).toBe(true);
    expect(LEGACY_YELLOW.test('rgba(235, 255, 0, 0.45)')).toBe(true);
  });

  it('restringe App.tsx ao acento único do splash e ao fundo neutro', () => {
    const validApp = `
      import theme from './src/theme/theme';
      <View style={{ backgroundColor: theme.colors.surface.canvas }}>
        <ActivityIndicator size="large" color={theme.colors.accent.main} />
      </View>
    `;
    const invalidApp = `${validApp}\nconst accidentalStaticToken = theme.colors.accent.soft;`;

    expect(findingsForFile('App.tsx', validApp)).toEqual([]);
    expect(findingsForFile('App.tsx', invalidApp)).toEqual([
      expect.stringContaining('somente o acento do splash pode ser estático'),
    ]);

    const otherInvalidAppSources = [
      `${validApp}\nconst accidentalPalette = theme.palette.neon;`,
      `${validApp}\nconst legacyHex = '#EBFF00';`,
      `${validApp}\nconst legacyRgba = 'rgba(235, 255, 0, 0.45)';`,
    ];
    for (const source of otherInvalidAppSources) {
      expect(findingsForFile('App.tsx', source).length).toBeGreaterThan(0);
    }
  });

  it('bloqueia import estático de acento por default, namespace, named, require e destructuring mesmo com useTheme', () => {
    const fixtures = [
      `import staticTheme from './theme/theme'; import { useTheme } from './theme/ThemeProvider'; staticTheme.colors.text.accent; useTheme();`,
      `import * as staticTheme from './theme/theme'; import { useTheme } from './theme/ThemeProvider'; staticTheme?.colors?.accent?.main; useTheme();`,
      `import { colors as staticColors } from './theme/theme'; import { useTheme } from './theme/ThemeProvider'; staticColors.accent.main; useTheme();`,
      `import { palette } from './theme/theme'; import { useTheme } from './theme/ThemeProvider'; palette.neon; useTheme();`,
      `const staticTheme = require('./theme/theme'); staticTheme.colors.accent.main;`,
      `const { colors: staticColors } = require('./theme/theme'); staticColors?.accent?.main;`,
      `require('./theme/theme')?.colors?.accent?.main;`,
      `import staticTheme from './theme/theme'; staticTheme['colors']['accent'].main;`,
      `import staticTheme from './theme/theme'; const { colors: { accent: staticAccent } } = staticTheme; staticAccent.main;`,
      `const staticPalette = require('./theme/theme').palette; staticPalette.neon;`,
    ];

    for (const fixture of fixtures) {
      expect(
        findingsForFile('src/fake-static-consumer.tsx', fixture),
      ).toEqual(expect.arrayContaining([
        expect.stringContaining('captura por import estático de tokens'),
      ]));
    }
  });

  it('não trata import type como captura estática de tokens', () => {
    const source = `
      import type { Theme } from './theme/theme';
      import { useTheme } from './theme/ThemeProvider';
      const { theme } = useTheme();
      theme?.colors?.accent?.main;
    `;

    expect(findingsForFile('src/fake-dynamic-consumer.tsx', source)).toEqual([]);
  });

  it('exclui testes, históricos, arquivos e theme.ts mesmo quando os caminhos existiriam', () => {
    const excluded = [
      'src/foo.test.tsx',
      'src/foo.spec.ts',
      'src/assets/real-consumer.tsx',
      'src/history/real-consumer.tsx',
      'src/historical/real-consumer.tsx',
      'src/legacy/real-consumer.tsx',
      'src/archive/real-consumer.tsx',
      'src/archives/real-consumer.tsx',
      'src/theme/theme.ts',
    ];

    for (const path of excluded) expect(isExcludedRuntimePath(path)).toBe(true);
    expect(isExcludedRuntimePath('src/components/theme.ts')).toBe(false);
    expect(isExcludedRuntimePath('src/screens/HomeScreen.tsx')).toBe(false);
  });
});
