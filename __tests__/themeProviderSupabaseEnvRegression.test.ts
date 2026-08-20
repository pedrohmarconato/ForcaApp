// __tests__/themeProviderSupabaseEnvRegression.test.tsx
//
// Regressão: src/theme/ThemeProvider.tsx importava `useAuth` de
// `../contexts/AuthContext`, que importa `../config/supabaseClient`, que
// LANÇA na carga do módulo quando faltam EXPO_PUBLIC_SUPABASE_URL /
// EXPO_PUBLIC_SUPABASE_ANON_KEY (supabaseClient.js:11). Qualquer componente
// que usasse o tema arrastava o cliente Supabase para o grafo de módulos —
// 56 suítes deixavam de carregar. Tema é apresentação; não pode depender de
// configuração de rede.
//
// Este arquivo NÃO mocka AuthContext nem supabaseClient — o objetivo é
// provar que o grafo REAL de ThemeProvider não precisa deles. A guarda
// estática complementar (grafo nunca alcança os módulos proibidos) vive em
// __tests__/themeModuleGraphSentinel.test.ts.
//
// Sem render() aqui de propósito: o bug é de tempo de IMPORT (a exceção
// dispara na carga do módulo, antes de qualquer componente montar), então
// require() sozinho já reproduz e prova o fix. Renderizar exigiria misturar
// o `react`/`react-test-renderer` importados estaticamente no topo deste
// arquivo com o ThemeProvider recarregado via jest.resetModules() + require
// dentro do teste — duas instâncias de React desacopladas que disparam
// "Invalid hook call" por um motivo totalmente alheio ao bug real. Mesma
// armadilha documentada no cabeçalho de liveActivityPlatformImport.test.ts
// (histórico do commit f88b7c3) e evitada aqui pelo mesmo motivo.

describe('regressão: tema não pode depender da configuração do Supabase', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;

    if (originalAnonKey === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });

  it('sentinela da própria premissa: supabaseClient lança sem as env vars (prova que o teste não é vácuo)', () => {
    expect(() => require('../src/config/supabaseClient')).toThrow(
      /Supabase URL or Anon Key is missing/,
    );
  });

  it('importa o ThemeProvider sem lançar, mesmo sem as env vars do Supabase', () => {
    expect(() => require('../src/theme/ThemeProvider')).not.toThrow();
  });

  it('o módulo importado exporta ThemeProvider e useTheme utilizáveis', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const themeModule = require('../src/theme/ThemeProvider');
    expect(typeof themeModule.ThemeProvider).toBe('function');
    expect(typeof themeModule.useTheme).toBe('function');
  });
});
