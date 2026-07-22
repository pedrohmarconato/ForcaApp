// Predicados de erro de autenticação compartilhados entre o AuthContext e o
// sessionProbe. Módulo deliberadamente sem dependências (nada de AsyncStorage/
// supabase) para poder ser importado por serviços e testes unitários leves.

type MaybeAuthError = { code?: unknown; message?: unknown; status?: unknown } | null | undefined;

// Desvio de relógio TRANSITÓRIO: logo após um TOKEN_REFRESHED, o `iat` do
// token recém-emitido pelo GoTrue pode parecer "no futuro" para o PostgREST
// (PGRST303 "JWT issued at future"). O token é válido e o quadro se resolve
// sozinho em segundos — NUNCA é motivo para logout.
export const isClockSkewError = (error: MaybeAuthError): boolean =>
  error?.code === 'PGRST303' ||
  /issued at future/i.test(typeof error?.message === 'string' ? error.message : '');
