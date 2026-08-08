# Testing Patterns

**Analysis Date:** 2026-08-08

## Test Framework

**Runner:**
- Jest `^29.7.0` with `jest-expo` preset (`"preset": "jest-expo"` in the `jest` block of `package.json`), `ts-jest ^29.1.1` and `babel-jest ^29.7.0`
- Backend: pytest (see `backend/tests/conftest.py`); the backend also has a `.pytest_cache/` at repo root, so pytest runs from the repo root (`python3 -m pytest backend/tests -q`)
- Config: `package.json` → `jest` block (preset, `moduleFileExtensions: ['ts','tsx','js','jsx','json','node']`, `collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!src/**/*.d.ts"]`)
- Secondary Jest config: `jest.web.config.js` — preset `jest-expo/web`, `testMatch: ['<rootDir>/scripts/visual/*.render.tsx']`, `setupFiles: ['<rootDir>/scripts/visual/setup.js']`; run via `npx jest -c jest.web.config.js`, invoked by `scripts/joint-visual-evidence.mjs` to render RN components to real DOM markup before screenshotting

**Assertion Library:**
- Jest built-in `expect` (`toBe`, `toEqual`, `toHaveBeenCalledWith`, `rejects.toBeTruthy`) — no jest-native/custom matchers found in `__tests__/`

**Run Commands:**
```bash
npm test                              # Run all Jest suites
npx jest --runInBand --silent         # CI mode (see .github/workflows/session-contract.yml)
npx jest -c jest.web.config.js        # Web-render suites (scripts/visual/*.render.tsx)
python3 -m pytest backend/tests -q    # Backend suite
npx tsc --noEmit                      # Type gate (part of CI, replaces lint)
```

## Test File Organization

**Location:**
- Frontend: all suites flat in the repo-root `__tests__/` directory (131 files, ~30,600 lines) — NOT co-located with source
- Backend: `backend/tests/test_*.py` (33 files, ~9,400 lines) with `backend/tests/conftest.py`
- Shared non-suite support modules go in `test-utils/` — NOT `__tests__/`, because jest's default `testMatch` (`**/__tests__/**/*.[jt]s?(x)`) treats any file under `__tests__/` as a suite ("Your test suite must contain at least one test"). Example: `test-utils/tempoEfetivoConjuntoReplica.ts`, shared by `__tests__/tempoEfetivoConjuntoMigration.test.ts` and `__tests__/turnAdvancedHandoffMigration.test.ts`
- Visual/web-render suites live in `scripts/visual/*.render.tsx` (picked up only by `jest.web.config.js`)

**Naming:**
- `snakeCaseDomain.test.ts` / `snakeCaseDomain.test.tsx` — test name mirrors the module under test (`sessionModel.test.ts`, `agendaRepository.test.ts`, `weeklyReplanner.test.ts`) or the feature/phase (`recusaDeclarada.test.ts`, `direcao03-fase3-sessao.test.tsx`, `jointLobbyDoisClientes.test.tsx`)
- Backend: `test_<module>.py` (`test_plan_mapper.py`, `test_app_security.py`)

**Structure:**
```
__tests__/                    # all frontend suites (flat)
├── sessionModel.test.ts      # pure engine tests
├── LoginScreen.test.tsx      # screen/component tests
├── activeSessionStore.test.ts# store + mocked repositories
├── jointSessionRealtime.test.ts  # injected-clock async tests
└── ...
backend/tests/                # pytest suites
├── conftest.py               # hermetic env + autouse fixtures
└── test_*.py
test-utils/                   # shared non-suite support modules
scripts/visual/*.render.tsx   # web-render suites (jest.web.config.js)
```

## Test Structure

**Suite Organization:**
```typescript
// Header comment: file path + failure modes covered (often written BEFORE the implementation)
// __tests__/sessionModel.test.ts

describe('computeOutcome', () => {
  it('reps abaixo do mínimo = under', () => {
    expect(computeOutcome(5, 6, 8)).toBe('under');
  });
});

describe('suggestLoad — nunca inventa kg', () => { ... });
```
- `describe`/`it` names are sentences in pt-BR, usually phrased as the invariant or failure mode ("NUNCA persiste a senha no AsyncStorage, mesmo com 'Lembrar acesso'", "não entra em loop: requisição já retentada (_retry) vai direto para signOut")
- Test files open with a comment block listing the covered failure modes (`__tests__/sessionModel.test.ts`, `__tests__/jointSessionRealtime.test.ts`)
- Large suites organize by failure mode with numbered modes in the header (`recusaDeclarada.test.ts` uses `describe('modo de falha N: ...')`)

**Patterns:**
- `beforeEach(() => jest.clearAllMocks())` resets mock call history (`__tests__/LoginScreen.test.tsx`, `__tests__/apiClient.test.ts`)
- Assertions use `expect(...).toBe(...)` for primitives, `toHaveBeenCalledWith(...)` for mock interactions, `await waitFor(...)` / `findByText` for async UI
- Mock handles captured via `jest.fn()` return values (`mockSignIn`) or cast helpers: `const mock = <T>(fn: T) => fn as unknown as jest.Mock;` (`__tests__/activeSessionStore.test.ts`)

## Mocking

**Framework:** Jest module mocking (`jest.mock` with factory functions) on the frontend; `unittest.mock` + `monkeypatch` on pytest.

**Patterns:**
```typescript
// Module-boundary mock: factory replaces the whole module (top of file, before imports)
jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'token-antigo' } } })),
      refreshSession: jest.fn(),
      signOut: jest.fn(async () => ({})),
    },
  },
}));
// __tests__/apiClient.test.ts

// Store tests mock every repository/service the store imports
jest.mock('../src/services/sessionExecutionRepository', () => {
  // real error class is re-implemented inside the factory so `instanceof` works
  class SessionExecutionRequestError extends Error { kind: 'transport' | 'server'; code: string | null; ... }
  return { startSessionLog: jest.fn(), saveSetLog: jest.fn(), ..., SessionExecutionRequestError, isTransportSessionExecutionError: ... };
});
// __tests__/activeSessionStore.test.ts
```
- Mock everything that touches the outside world: repositories (`sessionExecutionRepository`, `weeklyReplanRepository`, `agendaRepository`, `planEditRepository`), `supabaseClient`, `AsyncStorage` (`@react-native-async-storage/async-storage`), native modules (`expo-haptics` in `__tests__/direcao03-fase1-fundacoes.test.tsx`), icon fonts (`jest.mock('@expo/vector-icons', () => ({ Feather: () => null }))` in `__tests__/LoginScreen.test.tsx`)
- **What NOT to mock:** the pure engine layer (`src/engine/*`) is always tested against its real implementation — mocks only sit at the I/O boundary
- Timers/clock are INJECTED, not mocked with `jest.useFakeTimers`: `criarAgenda()` builds a fake `setTimeout`/`setInterval`/`clearTimeout`/`clearInterval` plus an `avancar(ms)` clock; tests assert on `timeoutsAtivos()`/`intervalsAtivos()` — "Relógio e timers são INJETADOS: nenhum sleep, nenhum teste que depende de tempo de parede" (`__tests__/jointSessionRealtime.test.ts`)
- Race/concurrency tests use a `deferred()` helper — a manually-resolvable promise to hold a write in flight while switching sessions ("Promessa controlável: permite trocar de sessão ENQUANTO uma gravação/finish está no await", `__tests__/activeSessionStore.test.ts`)
- Platform behavior: mutate `(Platform as { OS: string }).OS = 'web'` at call time, restore in `afterEach` (`__tests__/direcao03-fase1-fundacoes.test.tsx`)
- Backend: `unittest.mock.Mock`, `types.SimpleNamespace` for fake Anthropic clients, `monkeypatch.setattr(ai_quota, "_chamar_rpc", ...)` (`backend/tests/conftest.py`), `mock.Mock()` with `.status_code`/`.json.return_value` for fake HTTP responses (`backend/tests/test_app_security.py`)

**What to Mock:**
- Network: axios errors constructed with `new AxiosError(message, code, config, request, response)` to reproduce real RN adapter shapes (`__tests__/apiClient.test.ts`)
- Supabase client module wholesale (`jest.mock('../src/config/supabaseClient')`) — its import requires env, so tests never load it
- Flask backend: `app.config["TESTING"] = True` + `app.test_client()` fixture; rate-limit state isolated by an autouse fixture clearing `_rate_buckets` (`backend/tests/test_app_security.py`)

## Fixtures and Factories

**Test Data:**
```typescript
// Inline factory with override params — the dominant pattern in both stacks
const makeDetail = (): SessionDetail => ({ id: 'sess-1', plan_id: 'plan-1', ... });
const estado = (over: Partial<JointSessionState> = {}): JointSessionState => ({ ...defaults, ...over });
// __tests__/activeSessionStore.test.ts, __tests__/jointSessionRealtime.test.ts
```
- Backend mirrors it with `_exercicio(nome=..., series=3, ...)`, `_rascunho(exercicios=None, ...)` helper factories (`backend/tests/test_manual_plan.py`)
- Deterministic constants: fixed UUIDs (`USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"`), fixed anchor dates (`START = datetime.date(2026, 7, 20)`), fixed epoch timestamps (`T0 = Date.parse('2026-08-01T10:00:00.000Z')`)

**Location:**
- In-file factories at the top of each suite (no shared fixture registry for frontend)
- Shared cross-suite logic: `test-utils/tempoEfetivoConjuntoReplica.ts` — a JS replica of the SQL in `supabase/migrations/0029_tempo_efetivo_conjunto.sql` used to prove migration behavior (`tempoEfetivoPorPosse`, `reconstruirPosseDoTurno`)
- Backend shared fixtures: `backend/tests/conftest.py` — `_restaura_os_environ` (autouse: snapshots and restores `os.environ` per test), `_quota_ia_neutra` (autouse: monkeypatches the AI daily-quota RPC to be permissive so suites don't need Supabase; opt-out marker `@pytest.mark.quota_real`, registered via `pytest_configure`)

## Coverage

**Requirements:** None enforced. `collectCoverageFrom` is configured in `package.json` (`src/**/*.{js,jsx,ts,tsx}`) but CI runs `npx jest --runInBand --silent` without `--coverage` and no threshold is set.

**View Coverage:**
```bash
npx jest --coverage
```

## Test Types

**Unit Tests:**
- Pure engine logic, direct function calls, no mocks: `__tests__/sessionModel.test.ts`, `__tests__/weeklyReplanner.test.ts`, `__tests__/musclePriority.test.ts`, `__tests__/moodAdjustment.test.ts`, `__tests__/scheduleShift.test.ts`
- Backend unit: `test_plan_mapper.py`, `test_molde_schema.py`, `test_dose_cardio.py`, `test_questionario_normalizer.py` (jsonschema validation + pure transforms)

**Integration Tests:**
- Store ↔ mocked repositories: `__tests__/activeSessionStore.test.ts` (resume/reconcile/idempotency/error flows), `__tests__/manualPlanStore.test.ts`
- Repository/API with mocked transport: `__tests__/agendaRepository.test.ts`, `__tests__/apiClient.test.ts`, `__tests__/apiClientRetryFlow.test.ts`, `__tests__/claudeService.test.ts`, `__tests__/trainingRepository.test.ts`
- Multi-client joint session flows: `__tests__/jointLobbyDoisClientes.test.tsx`, `__tests__/jointLobbyReconciliador.test.tsx`, `__tests__/jointConcorrenciaCliente.test.tsx`
- Migration behavior proven via JS replicas: `__tests__/tempoEfetivoConjuntoMigration.test.ts`, `__tests__/turnAdvancedHandoffMigration.test.ts`, `__tests__/legacySessionMigration.test.ts`
- Backend integration: Flask `test_client` against the real app with mocked HTTP/Supabase: `test_app_security.py`, `test_manual_plan.py`, `test_anthropic_call_contract.py`, `test_anthropic_retry.py`, `test_quota_ia.py`, `test_job_endpoints.py`

**Component/Screen Tests:**
- `@testing-library/react-native` (`render`, `fireEvent`, `waitFor`, `getByLabelText`, `findByText`) with `react-test-renderer` 19.1.0: `__tests__/LoginScreen.test.tsx`, `__tests__/questionnaireScreen.test.tsx`, `__tests__/activeSessionScreen.test.tsx`, `__tests__/jointLobbyScreen.test.tsx`, `__tests__/uiKit.test.tsx`

**E2E / Visual / Smoke:**
- Web-render suites (`scripts/visual/*.render.tsx` via `jest.web.config.js`) that render real RN components with `renderToStaticMarkup` for pixel capture — orchestrated by `scripts/joint-visual-evidence.mjs`
- Harness for manual/browser E2E without production credentials: `harness/server.mjs` + `harness/fixtures.mjs` serve the exported web build against a stub Supabase at 390×844 (`harness/README.md`; runbook: export with harness env → `node harness/server.mjs` → Chrome)
- Contract/smoke scripts (Node, run outside Jest): `scripts/joint-contract-smoke.mjs`, `scripts/joint-realtime-smoke.mjs`, `scripts/joint-concurrency-smoke.mjs`, `scripts/verify-web-bundle.mjs`
- CI web build gate: `npx expo export --platform web` with harness env vars (`.github/workflows/session-contract.yml`)

## Common Patterns

**Async Testing:**
```typescript
fireEvent.press(getByLabelText('Entrar'));
await waitFor(() =>
  expect(mockSignIn).toHaveBeenCalledWith('user@teste.com', 'SenhaSuperSecreta123'),
);
expect(await findByText('Email ou senha inválidos.')).toBeTruthy();
// __tests__/LoginScreen.test.tsx
```

**Error Testing:**
```typescript
mockedRefresh.mockResolvedValueOnce({ data: { session: null } });
await expect(handleResponseError(instance as any, make401() as any)).rejects.toBeTruthy();
expect(mockedSignOut).toHaveBeenCalledTimes(1);
// __tests__/apiClient.test.ts
```

**Timing/Concurrency Testing:**
- Deferred-promise races: `const { promise, resolve, reject } = deferred<T>();` then `resolve()` mid-await to test CAS/epoch guards (`__tests__/activeSessionStore.test.ts`)
- Injected-clock realtime tests: fake timeouts registry + `dispararTimeouts()`/`avancar(ms)` (`__tests__/jointSessionRealtime.test.ts`)
- Reentrancy: call the action twice; assert the second returns `false` and the server mock was hit once

**CI Pipeline** (`.github/workflows/session-contract.yml`, on push to `main` + PRs):
1. `npm ci`
2. `pip install -r requirements.txt`
3. `npx tsc --noEmit`
4. `npx jest --runInBand --silent`
5. `python -m pytest backend/tests -q`
6. `npx expo export --platform web` with `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` harness values

**Known Caveats (from `AGENTS.md`):** the full Jest suite run with `--runInBand` leaves a handle open and can exit 1 even with all tests green — do not use that exit code as a gate. Backend tests must not require a live database (hermetic by design via `FORCA_SKIP_DOTENV=1` + mocked RPCs in `backend/tests/conftest.py`).

---

*Testing analysis: 2026-08-08*
