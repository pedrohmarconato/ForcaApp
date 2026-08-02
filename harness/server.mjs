// harness/server.mjs
// Harness visual reproduzível (SEM credenciais de produção):
//   - serve o export web da app REAL (SPA fallback para deep links);
//   - fala o protocolo Supabase (Auth + PostgREST + RPC) devolvendo as fixtures
//     determinísticas de harness/fixtures.mjs — a UI exercitada é a real.
//
// Uso:
//   cd harness && node server.mjs [dir-do-export]
// (default: /tmp/forcaapp-session-fix-web)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  USER,
  PROFILE,
  TRAINING_PLAN,
  PLANNED_SESSION,
  SESSION_DETAIL,
  OPEN_SESSION_LOG,
  COMPLETED_LOG,
  SET_LOG_ECHO,
} from './fixtures.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.argv[2] ?? '/tmp/forcaapp-session-fix-web';
const PORT = Number(process.env.PORT ?? 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

// ---------------------------------------------------------------
// Supabase Auth (GoTrue) — aceita qualquer credencial, sessão persistida
// ---------------------------------------------------------------
const sessionFor = () => ({
  access_token: 'harness-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'harness-refresh',
  user: USER,
});

const handleAuth = (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/auth/v1/token' && req.method === 'POST') {
    // grant_type=password | refresh_token
    return json(res, 200, sessionFor());
  }
  if (pathname === '/auth/v1/signup' && req.method === 'POST') {
    return json(res, 200, { user: USER, session: sessionFor() });
  }
  if (pathname === '/auth/v1/user' && req.method === 'GET') {
    return json(res, 200, USER);
  }
  if (pathname === '/auth/v1/logout' && req.method === 'POST') {
    res.writeHead(204).end();
    return;
  }
  if (pathname === '/auth/v1/recover' && req.method === 'POST') {
    return json(res, 200, {});
  }
  return json(res, 404, { message: 'auth stub: rota não mapeada ' + pathname });
};

// ---------------------------------------------------------------
// PostgREST — tabelas
// ---------------------------------------------------------------
const parseQuery = (url) => {
  const u = new URL(url, 'http://x');
  const params = Object.fromEntries(u.searchParams.entries());
  return { table: u.pathname.replace(/^\/rest\/v1\//, ''), params };
};

const queryHas = (qs, needle) => (qs?.select ?? '').includes(needle);

// supabase-js `.single()` pede objeto (Accept: application/vnd.pgrst.object+json);
// as demais consultas esperam array. O stub devolve a forma que o cliente pede.
const pick = (req, rows) => {
  const accept = String(req.headers.accept ?? '');
  return accept.includes('application/vnd.pgrst.object+json') ? (rows[0] ?? null) : rows;
};

const handleTable = (req, res, table, qs) => {
  // --- session_logs ---
  if (table === 'session_logs') {
    if (req.method === 'GET') {
      if (queryHas(qs, 'set_logs(')) {
        // getOpenSessionLog: execução em aberto com séries + skips.
        return json(res, 200, [OPEN_SESSION_LOG]);
      }
      if (queryHas(qs, 'planned_sessions(')) {
        // Histórico concluído (Home): sessão antiga com o mesmo título.
        return json(res, 200, [COMPLETED_LOG]);
      }
      // Contexto do replanejamento (adherence_snapshot por log): vazio.
      return json(res, 200, []);
    }
  }

  // --- set_logs ---
  if (table === 'set_logs') {
    if (req.method === 'GET') {
      // getLastLoadByExercise: sem histórico → [] (a sugestão vem do alvo).
      return json(res, 200, []);
    }
    if (req.method === 'PATCH') {
      return json(res, 200, [{ id: 'x' }]);
    }
  }

  // --- profiles ---
  if (table === 'profiles') {
    if (req.method === 'GET') return json(res, 200, pick(req, [PROFILE]));
  }

  // --- training_plans ---
  if (table === 'training_plans') {
    if (req.method === 'GET') return json(res, 200, [TRAINING_PLAN]);
  }

  // --- planned_sessions ---
  if (table === 'planned_sessions') {
    if (req.method === 'GET') {
      if (queryHas(qs, 'planned_exercises(')) {
        if (qs.id === 'eq.sess-v1') {
          // Detalhe da sessão ativa (getSessionDetail — .single()).
          return json(res, 200, pick(req, [SESSION_DETAIL]));
        }
        // Contexto do replanejamento: a mesma sessão + a perdida da semana.
        return json(res, 200, [SESSION_DETAIL]);
      }
      if (qs.status === 'eq.pending') {
        return json(res, 200, [PLANNED_SESSION]);
      }
      // Lista geral (aba Plano): só a sessão ativa.
      return json(res, 200, [PLANNED_SESSION]);
    }
    if (req.method === 'PATCH') {
      // skip_planned_session marca a sessão como skipped.
      return json(res, 200, [{ id: 'sess-v1', status: 'skipped' }]);
    }
  }

  // --- planned_sets (INSERT do replan confirmado) ---
  if (table === 'planned_sets' && req.method === 'POST') {
    return json(res, 200, [{ id: 'add-1', exercise_id: 'ex-2', set_order: 3 }]);
  }

  return json(res, 404, { message: `stub: tabela não mapeada ${table}` });
};

// ---------------------------------------------------------------
// PostgREST — RPCs
// ---------------------------------------------------------------
const handleRpc = async (req, res, fn) => {
  const body = req.body ?? {};
  switch (fn) {
    case 'start_session':
      return json(res, 200, {
        id: 'log-1',
        started_at: '2026-08-01T10:00:00Z',
      });
    case 'save_set_log':
      return json(res, 200, SET_LOG_ECHO(body));
    case 'finish_session':
      return json(res, 200, { success: true });
    case 'get_last_load_by_exercise':
      return json(res, 200, {});
    case 'skip_session_exercise':
    case 'unskip_session_exercise':
    case 'skip_planned_session':
    case 'unskip_planned_session':
      return json(res, 200, {});
    default:
      return json(res, 404, { message: `stub: rpc não mapeada ${fn}` });
  }
};

// ---------------------------------------------------------------
// Estático + SPA fallback
// ---------------------------------------------------------------
const safePath = (p) => {
  const base = normalize(STATIC_DIR);
  const resolved = normalize(join(base, p));
  return resolved.startsWith(base) ? resolved : base;
};

const serveStatic = async (req, res, pathname) => {
  let filePath = safePath(pathname);
  try {
    const st = await stat(filePath);
    if (st.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // SPA fallback: qualquer rota sem arquivo → index.html (deep links).
    filePath = join(STATIC_DIR, 'index.html');
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found: ' + pathname);
  }
};

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  console.log(`[harness] ${req.method} ${pathname}${url.search.slice(0, 160)}`);
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  req.body = rawBody ? JSON.parse(rawBody) : {};

  try {
    if (pathname.startsWith('/auth/v1/')) return handleAuth(req, res);

    if (pathname.startsWith('/rest/v1/rpc/')) {
      return handleRpc(req, res, pathname.replace('/rest/v1/rpc/', ''));
    }

    if (pathname.startsWith('/rest/v1/')) {
      const { table, params } = parseQuery(req.url);
      return handleTable(req, res, table, params);
    }

    return await serveStatic(req, res, pathname);
  } catch (e) {
    json(res, 500, { message: String(e?.message ?? e) });
  }
});

server.listen(PORT, () => {
  console.log(`[harness] ${ROOT}`);
  console.log(`[harness] servindo ${STATIC_DIR}`);
  console.log(`[harness] http://localhost:${PORT}`);
  console.log(`[harness] deep links: /home/active-session/sess-v1 e /training/active-session/sess-v1`);
  console.log(`[harness] login: qualquer email/senha (stub) — ex.: demo@forca.app / demo123`);
});
