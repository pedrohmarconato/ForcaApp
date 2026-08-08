# Coding Conventions

**Analysis Date:** 2026-08-08

## Naming Patterns

**Files:**
- Frontend modules: `camelCase.ts` — e.g. `src/engine/sessionModel.ts`, `src/services/agendaRepository.ts`, `src/utils/logger.ts`
- Components/screens: `PascalCase.tsx` — e.g. `src/screens/LoginScreen.tsx`, `src/components/ui/Button.tsx`
- Domain names are pt-BR even inside English-suffixed modules: `src/engine/agendaDias.ts`, `src/engine/tempoEfetivo.ts`, `src/engine/scheduleShift.ts`, `src/services/planEditRepository.ts`
- Legacy plain-JS files keep `.js` (no TypeScript migration): `src/navigation/RootNavigator.js`, `src/contexts/AuthContext.js`, `src/config/supabaseClient.js`
- Backend: `snake_case.py` — `backend/services/plan_mapper.py`, `backend/utils/anthropic_retry.py`, `backend/schemas/molde_schema.py`
- Supabase migrations: `NNNN_snake_case.sql` with zero-padded sequence — `supabase/migrations/0000_profiles_base.sql` … `0031_*.sql` (32 migrations)
- Frontend tests: `*.test.ts` / `*.test.tsx` in root `__tests__/`; backend tests: `backend/tests/test_*.py`

**Functions:**
- Frontend: camelCase; engine/service functions often use pt-BR verbs — `expandir_plano` (Python), `mapear_plano_ia`, `construir_molde_manual`, `reancorarSemana`, `suggestLoad`, `completeSet`
- React components: PascalCase function components, props destructured in the signature with defaults (`variant = 'primary', loading = false`) — `src/components/ui/Button.tsx`
- Zustand store hooks: `useXxxStore` via `create<State>()` — `src/store/activeSessionStore.ts` (`useActiveSessionStore`), `src/store/manualPlanStore.ts`

**Variables:**
- camelCase; UI state uses `const [x, setX] = useState(...)` — `src/screens/LoginScreen.tsx`
- Pt-BR identifiers inside domain logic — `serie`, `rascunho`, `sessaoDeHoje`, `atual` (see `src/store/activeSessionStore.ts`)

**Types:**
- PascalCase; `type` preferred for unions/records, `interface` for object contracts (both appear): `type Status = 'idle' | 'loading' | ...` and `interface ActiveSessionState` in `src/store/activeSessionStore.ts`
- Discriminated unions for classified errors: `type ClassifiedApiError = { kind: 'network' } | { kind: 'timeout' } | ...` in `src/services/api/apiErrors.ts`
- Explicit exported types from engine modules imported with `type` keyword: `import { type SessionDraft, type DraftSet } from '../engine/sessionModel'` (`src/store/activeSessionStore.ts`)

**Errors:**
- Custom error classes `XxxError extends Error` with `this.name` set and a stable `.code` for machine-readable classification: `SessionExecutionRequestError` (`src/services/sessionExecutionRepository.ts`, with `kind: 'transport' | 'server'`), `ReplanContextStructureError` (`src/store/activeSessionStore.ts`), `PlanPersistenceError` (`backend/services/plan_repository.py`)

## Code Style

**Formatting:**
- Prettier 3 (devDependency `package.json`, `"prettier": "^3.0.3"`) with defaults: single quotes, 2-space indent, trailing commas, semicolons
- `.editorconfig` at repo root enforces: `indent_style = space`, `indent_size = 2`, LF, utf-8, `quote_type = single` for `*.{js,ts,jsx,tsx}`, `insert_final_newline = true`, `trim_trailing_whitespace = true` (disabled for `*.md`)
- `lint-staged` (`package.json`) runs `eslint --fix` + `prettier --write` on staged `*.{js,jsx,ts,tsx}`
- Python follows PEP8 with double-quoted strings — `backend/tests/conftest.py`, `backend/app.py`; imports inside functions are allowed deliberately (`from backend.schemas.plano_manual_schema import ...` in `backend/tests/test_manual_plan.py`)

**Linting:**
- No `.eslintrc`/`eslint.config.js`/`.prettierrc` file exists in the repo (checked). `package.json` declares `"lint": "eslint . --ext .js,.jsx,.ts,.tsx"` but `AGENTS.md` states the project has no working lint gate: quality is enforced via `npx tsc --noEmit`, `npx jest`, and `python3 -m pytest backend/tests -q`
- Inline `/* eslint-disable no-console */` / `/* eslint-enable */` used where console is intentional (`src/utils/logger.ts`); `/* eslint-disable @typescript-eslint/no-var-requires */` for `require` in tests (`__tests__/direcao03-fase1-fundacoes.test.tsx`); `# noqa: E402` in Python for intentional import ordering (`backend/tests/conftest.py`)
- TypeScript strictness comes from `expo/tsconfig.base` (`tsconfig.json` extends it, no local overrides)

## Import Organization

**Order:**
1. React / react-native
2. Third-party (zustand, axios, supabase, date-fns, lodash)
3. Relative `../` project modules

Blank lines separate the groups; within project imports, modules are grouped by layer (engine → services → utils). See the header of `src/store/activeSessionStore.ts` for the canonical example.

**Path Aliases:**
- None — all imports are relative (`../engine/sessionModel`, `../../theme/theme`). No tsconfig `paths` alias is configured.

## Error Handling

**Patterns:**
- Classify, never guess: transport vs structural vs programming errors are distinguished (`isTransportSessionExecutionError`, `isReplanTransportError` in `src/store/activeSessionStore.ts`; `classifyApiError` in `src/services/api/apiErrors.ts`). A `TypeError`/local bug is NEVER treated as "offline" — malformed payloads get a distinct diagnostic path
- Friendly pt-BR user messages, constant strings at module scope (`REPLAN_TRANSPORT_MSG`, `STORAGE_WARNING_MSG` in `src/store/activeSessionStore.ts`)
- Best-effort secondary writes: local draft persistence failure after a confirmed server write only sets a non-blocking `storageWarning` — never reverts the confirmed insert and never blocks the session (`completeSet`, `startOrResume` in `src/store/activeSessionStore.ts`)
- Compare-and-swap guard for async races: `operationEpoch` token checked before/after every `await` so a stale response never writes into a newer session
- Reentrancy locks for double-tap/race: `const inFlight = new Set<string>()` keyed by `sessionLogId:plannedSetId` (`src/store/activeSessionStore.ts`)
- Timeouts that always settle: `withTimeout` + `AbortController` wraps RPC writes so the `finally` lock release always runs (`RPC_TIMEOUT_MS = 15000`, exported for tests)
- Server is authoritative: local drafts are reconciled against `getOpenSessionLog` before adoption; declared skips (`skipExercise`) write to server FIRST
- Python: exceptions raised as typed errors (`PlanPersistenceError`), rate limiting with in-memory buckets + persistent per-day quota (`backend/app.py`), config access never logs secret values — only presence/absence (`backend/utils/config.py`)
- Never log tokens/passwords: frontend `src/utils/logger.ts` suppresses all console output when `__DEV__` is false; backend logs env var names, never values

## Logging

**Framework:** Frontend: `src/utils/logger.ts` (console wrapper gated on `__DEV__`). Backend: stdlib `logging` via `logging.getLogger(__name__)` (`backend/utils/config.py`), configured by the entrypoint only.

**Patterns:**
- Tagged console.warn with module prefix for non-fatal failures: `console.warn('[activeSession] rascunho não persistido (não-fatal):', e)` (`src/store/activeSessionStore.ts`)
- Non-fatal degradable features log and continue (`[replan] reencaixe falhou (não-fatal):`); fatal path sets UI state (`status: 'error'`, `saveError`)
- Backend logs env var names with presence/absence, never values (`get_api_key` in `backend/utils/config.py`)

## Comments

**When to Comment:**
- Every file starts with a header comment: `// src/path/file.ts` + purpose + the failure modes covered / invariants honored (e.g. `__tests__/sessionModel.test.ts`, `src/store/activeSessionStore.ts`, `src/components/ui/Button.tsx`)
- Race conditions, reentrancy guards, CAS logic, DB constraint mirrors, and "why not the obvious approach" all get explanatory pt-BR comments (see `completeSet`, `confirmReplan` in `src/store/activeSessionStore.ts`)
- Migration comments reference the app behavior they implement (e.g. `0001_modelo_treino.sql` documents the DW-legacy tables that are NOT this project)

**JSDoc/TSDoc:**
- `/** ... */` used for exported types, functions, and non-obvious public API (`PendingAdaptation`, `retireLocalDraft`, `suggestionFor` in `src/store/activeSessionStore.ts`)
- Python: docstrings in pt-BR, used heavily (`backend/utils/config.py`, `backend/tests/conftest.py`)
- Language of all comments is pt-BR; identifiers mix pt-BR domain terms with English technical terms

## Function Design

**Size:** Functions are split by concern — pure computation lives in `src/engine/*` (no I/O, no React, no timers), I/O in `src/services/*` repositories, orchestration in `src/store/*`. Store actions stay cohesive and delegate: `startOrResume` orchestrates but `buildDraftFromDetail`/`applyServerSetLogs`/`seedLastLoads` do the work.

**Parameters:** Objects for multi-arg calls (`saveSetLog({ sessionLogId, plannedSetId, actualReps, ... }, signal)`), single positional params for simple cases. Options objects with defaults for variants (`create()` factory in `backend/tests/conftest.py` fixtures take override params).

**Return Values:**
- Engine functions return plain data / `null` for "absent" (never invented values): `suggestLoad` returns `null` when no source exists — never fabricates a load (`src/engine/sessionModel.ts`)
- Store actions return `Promise<boolean>` for success/failure of mutating operations (`completeSet`, `confirmReplan`), enabling UI-level retry decisions
- Python helpers return plain dicts/lists; typed `Optional[...]` for nullable env values (`backend/utils/config.py`)

## Module Design

**Exports:**
- Named exports throughout (`export const`, `export function`, `export type`); screens/components mostly `export default` (`LoginScreen` default export in `src/screens/LoginScreen.tsx`); UI kit also re-exports via barrel `src/components/ui/index.ts`
- Test-only exports are documented: `RPC_TIMEOUT_MS` "Exportado para o teste exercitar o limite sem esperar de verdade" (`src/store/activeSessionStore.ts`)

**Barrel Files:** `src/components/ui/index.ts` aggregates UI kit; no other barrel usage.

**Layer rules (see `src/store/activeSessionStore.ts` imports for the canonical dependency direction):**
- `src/engine/*` — pure domain logic, no imports of services/store; unit-tested directly (`__tests__/sessionModel.test.ts`)
- `src/services/*` — all I/O: Supabase (`api/`, `config/supabaseClient.js`), AsyncStorage (`sessionDraftStorage.ts`), axios (`api/apiClient.ts`); error classes co-located (`apiErrors.ts`, `authErrors.ts`, `planJobErrors.ts`)
- `src/store/*` — zustand stores; thin on purpose, delegates I/O to services and calculation to engine
- `src/screens/*` + `src/components/*` — UI; screens import components, theme, stores, services
- `src/config/*` — feature flags (`featureFlags.ts`, env-strict `EXPO_PUBLIC_*` reading) and the single supabase client
- `src/theme/theme.ts` — design tokens (colors, animation curves); constants in `src/constants/*`
- Backend mirrors it: routes in `backend/app.py`, business logic in `backend/services/*`, JSON schemas (jsonschema) in `backend/schemas/*`, env/config in `backend/utils/*`, AI wrappers in `backend/wrappers/*`

---

*Convention analysis: 2026-08-08*
