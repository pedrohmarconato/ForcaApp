# Technology Stack

**Analysis Date:** 2026-08-08

## Languages

**Primary:**
- TypeScript 5.2 — frontend app (`src/`, `App.tsx`), typed against `tsconfig.json` which extends `expo/tsconfig.base`
- Python 3.11 — backend API (`backend/`), pinned by `backend/Dockerfile` (`python:3.11-slim`); local venv at `.venv/` runs Python 3.9

**Secondary:**
- JavaScript — untyped runtime files: `src/config/supabaseClient.js`, `src/contexts/AuthContext.js`, smoke-test scripts (`scripts/joint-*-smoke.mjs`), harness (`harness/*.mjs`)
- SQL (Postgres/PL/pgSQL) — schema + RPCs in `supabase/migrations/` (0000–0031)
- Bash — deploy/preflight scripts (`scripts/supabase-preflight.sh`)

## Runtime

**Environment:**
- React Native 0.81.5 + Expo SDK 54 (`expo@^54.0.36`, `expo-dev-client`) — iOS/Android native; also compiles to web via `react-native-web` (`expo export -p web`)
- Node >= 16 (engines in `package.json`); CI uses Node 20 (`.github/workflows/session-contract.yml`)
- Python 3.11 for the backend container; Python 3.9 works for local dev

**Package Manager:**
- npm (frontend) — `package-lock.json` committed; `npm ci` in CI
- pip via `uv pip compile` (backend) — `requirements.txt` holds intent ranges, `requirements.lock.txt` is a fully hashed lock (`--require-hashes`) used by `backend/Dockerfile`
- Lockfile: both present and committed

## Frameworks

**Core:**
- Expo SDK 54 / React Native 0.81.5 — app shell, config in `app.json` (android package `com.pmarconato.forcaapp`, dark UI, `scheme: forcaapp`)
- React 19.1.0 — UI layer
- Flask 3.x — backend HTTP API (`backend/app.py`, ~2000 lines, single module with routes, CORS, rate limiting)
- @supabase/supabase-js 2.x — Supabase client (auth + data) on the frontend

**Testing:**
- Jest 29 (`jest-expo` preset, `ts-jest`, `@testing-library/react-native`) — frontend unit/component tests; `jest.web.config.js` renders RN components to web markup for visual evidence (`scripts/visual/*.render.tsx`)
- pytest 8 — backend tests (`backend/tests/`), hermetic via `FORCA_SKIP_DOTENV=1` and an autouse fixture restoring `os.environ` (`backend/tests/conftest.py`)
- GitHub Actions — `.github/workflows/session-contract.yml` runs `npx tsc --noEmit`, `npx jest --runInBand --silent`, `python -m pytest backend/tests -q`, `npx expo export --platform web`

**Build/Dev:**
- Metro (Expo's bundler) — `metroconfig.js`; `babel.config.js` uses `babel-preset-expo` with `unstable_transformImportMeta: true` (Zustand v4 + web bundle); Reanimated 4 worklets plugin auto-injected by the preset
- patch-package — `patches/react-native+0.81.5.patch` applied on `postinstall`
- ESLint 8 + Prettier 3 via husky + lint-staged (`eslint --fix && prettier --write` on staged js/jsx/ts/tsx)
- Gunicorn (gthread, 1 worker × 8 threads, `--timeout 240`) — production backend entrypoint in `backend/Dockerfile`

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.49.3 — auth session, CRUD, RPC and Realtime from the app (`src/config/supabaseClient.js`, `src/services/*.ts`)
- `axios` ^1.8.4 — HTTP client to the Flask API (`src/services/api/apiClient.ts`, 30s default timeout, 401-refresh interceptor)
- `anthropic` (Python, >=0.39,<1.0) — Claude API client on the backend (`backend/utils/anthropic_retry.py`, `backend/app.py`); keys never ship in the app
- `@react-navigation/native` + `bottom-tabs` + `stack` — navigation (`src/navigation/`)
- `zustand` ^4.5.7 — state stores (`src/store/activeSessionStore.ts`, `manualPlanStore.ts`)
- `react-native-reanimated` ~4.1.1 + `react-native-gesture-handler` ~2.28.0 + `react-native-worklets` — animations
- `expo-secure-store` — encrypted session storage (Keychain/Keystore) via `src/services/auth/secureStorage.ts`
- `react-hook-form` + `yup` — forms (questionnaire)
- `react-native-chart-kit` + `react-native-svg` — progress charts
- `lodash`, `date-fns` — utilities

**Infrastructure:**
- `flask-cors` — CORS restricted to `CORS_ORIGINS` env (defaults dev origins) (`backend/app.py:199-208`)
- `jsonschema` — request validation against `backend/schemas/*.py`
- `requests` — server-side Supabase REST calls (`backend/services/plan_repository.py`, `backend/utils/auth.py`)
- `gunicorn` — production WSGI server
- `python-dotenv` — loads exactly one `.env` from repo root (`backend/utils/config.py`)

## Configuration

**Environment:**
- Frontend uses `EXPO_PUBLIC_*` vars only (inlined by babel-preset-expo): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:5001/api`), `EXPO_PUBLIC_ENABLE_OFFLINE_MODE`, `EXPO_PUBLIC_ENABLE_JOINT_TRAINING`. `@env`/`react-native-dotenv` was removed (AGENTS.md)
- Backend reads from environment (`.env` at repo root, or platform-injected on VPS): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `CORS_ORIGINS`, model names, rate/quota limits, feature flags (`FORCA_*`)
- `.env.example` committed as a template (5.1 KB); `.env.development`/`.env.production` referenced by legacy `ENVFILE=` npm scripts (`package.json`) are not present in the repo; real `.env` files are gitignored
- App icon/splash/fonts bundled in `assets/` (fonts: BarlowSemiCondensed, Inter — `App.tsx`)

**Build:**
- `app.json` — Expo app config (no EAS config found)
- `vercel.json` — web build: `npx expo export -p web` + `scripts/verify-web-bundle.mjs`, SPA rewrites, CSP/HSTS/security headers, immutable caching for `/_expo/static/`
- `docker-compose.yml` — backend service with hard-fail required env vars, `read_only` rootfs, `tmpfs /tmp`, `cap_drop ALL`, `no-new-privileges`, loopback bind by default (`FORCA_BIND_HOST` override); `docker-compose.override.yml.example` for local dev

## Platform Requirements

**Development:**
- Node >= 16, npm; Python 3.9+; Xcode/Android toolchains for native (`npm run ios`/`android`, pods)
- Local backend: `python3 -m backend.app` (port 5001)
- Supabase CLI with two linked projects (staging `mjdjtiujhwklchalquhc`, prod `zanqygwsgxkyjiuhrzju`) — preflight gate `scripts/supabase-preflight.sh` before any `db push` (prod requires typing `PRODUCAO`)

**Production:**
- VPS (Hostinger) running Docker Compose + nginx reverse proxy (see `docs/DEPLOY_VPS.md`); API at `https://forca-api.cadastrai.com/api`
- Vercel for the web build (see `docs/DEPLOY_WEB.md`); deployed web app at `https://forca-app-six.vercel.app`
- Supabase cloud (two projects: `forcaapp-staging` hml, `forcaapp-prod` prod — same org `ltmhaqdcvidzsbfkxmii`)

---

*Stack analysis: 2026-08-08*
