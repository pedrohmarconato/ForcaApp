# External Integrations

**Analysis Date:** 2026-08-08

## APIs & External Services

**AI Provider (Anthropic Claude):**
- [Anthropic API](https://api.anthropic.com) — powers chat coaching, onboarding chat consolidation, and training-plan generation
  - SDK/Client: `anthropic` Python package, client created lazily in `backend/app.py` (`_get_chat_anthropic_client`, line ~284) and in plan generation via `backend/utils/anthropic_retry.py`
  - Auth: `ANTHROPIC_API_KEY` env var — backend-only; never embedded in the app bundle (key lives on VPS/flask, `docker-compose.yml` requires it)
  - Models (env-overridable): `CHAT_MODEL_NAME` default `claude-haiku-4-5`, `PLAN_MODEL_NAME` default `claude-opus-4-8`, `CLAUDE_MODEL_NAME` default `claude-sonnet-4-6` (`backend/utils/config.py:79-96`)
  - Retry: max 1 retry on 429/500/502/503/529, honors short `retry-after`, absolute deadline, never retries timeouts (`backend/utils/anthropic_retry.py`)
  - Cost controls: per-route daily call limits + daily USD cap, persisted in Supabase via RPC `register_ai_usage` (migrations `0024_quota_ia.sql`, `0025_quota_por_rota.sql`; orchestrated by `backend/services/ai_quota.py` — reserve estimate, settle delta with `p_forcar`)
  - All AI calls from the app go through the Flask proxy: `POST /api/chat`, `POST /api/consolidate-chat`, `POST /api/generate-plan` (`src/services/api/claudeService.ts`, `trainingPlanService.ts`)

**Backend Flask API (self-hosted, own integration):**
- REST API consumed by the app via axios (`src/services/api/apiClient.ts`), base URL from `EXPO_PUBLIC_API_BASE_URL`
- Routes in `backend/app.py`: `/api/chat` (line 487), `/api/exercise-catalog` (565), `/api/exercise-catalog/resolve` (583), `/api/manual-plan` (884), `/api/manual-plan/preview` (934), `/api/generate-plan` (964) + `/api/generate-plan/<job_id>` (1163), `/api/consolidate-chat` (1190), `/health` + `/api/health` (2004), `/api/ready` (2016)
- Auth: Bearer JWT from Supabase session attached by request interceptor (`apiClient.ts:108`); validated server-side by `backend/utils/auth.py` via `GET {SUPABASE_URL}/auth/v1/user` (10s timeout, strict UUID payload check)
- Plan generation is async: in-memory job store with threads and 1h TTL (`backend/services/job_manager.py`), polled via `GET /api/generate-plan/<job_id>`

## Data Storage

**Databases:**
- [Supabase Postgres](https://supabase.com) — single source of truth (profiles, training plans, sessions, set logs, questionnaire, cardio goals, joint training, AI quota)
  - Two cloud projects, same org (`ltmhaqdcvidzsbfkxmii`), account `pedrohmarconato@gmail.com`: **prod** `forcaapp-prod` ref `zanqygwsgxkyjiuhrzju`; **staging** `forcaapp-staging` ref `mjdjtiujhwklchalquhc` (canonical table in `AGENTS.md`; always decide by ref, not name)
  - Connection: frontend via `@supabase/supabase-js` with anon key (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `src/config/supabaseClient.js`); backend via REST (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) in `backend/services/plan_repository.py` and `backend/utils/auth.py`
  - Client: direct `.from()` CRUD (tables: `profiles`, `planned_sessions`, `set_logs`, `session_logs`, `training_plans`, `questionario_usuario`, `cardio_goals`, `joint_sessions`, `joint_session_events`, `joint_session_participants`, `joint_invite_attempts`, `ai_usage_daily`, `exercise_skips`, `questionario_historico`, `planned_exercises`, `planned_sets`) + RPCs (`start_session`, `finish_session`, `save_set_log`, `skip_planned_session`, `unskip_planned_session`, `skip_session_exercise`, `unskip_session_exercise`, `upsert_cardio_goal`, `archive_cardio_goal`, `achieve_cardio_goal`; backend calls `save_training_plan`, `register_ai_usage`)
  - Schema: 32 migrations `supabase/migrations/0000-0031` (RLS hardening, idempotency, recusa-declarada, joint training with Realtime publication `supabase_realtime`, AI quota)
  - Local dev: `supabase/config.toml` (api schemas `public`+`graphql_public`); `supabase/.temp/` present for CLI

**File Storage:**
- Local filesystem only — `backend/data/catalogo_exercicios.json` (versioned canonical exercise catalog v2, with aliases incl. model translation mistakes; consumed by `backend/services/exercise_catalog.py`). No Supabase Storage buckets configured (`config.toml` storage sections commented out)

**Caching:**
- None external. In-memory only: rate-limit buckets (`_rate_buckets` in `backend/app.py`), plan jobs (`backend/services/job_manager.py`), lazy Anthropic clients, `lru_cache` in `exercise_catalog.py`. Explicitly documented as per-process (resets on restart, not shared across replicas) — daily quota moved to Postgres to compensate

## Authentication & Identity

**Auth Provider:**
- [Supabase Auth] — email/password only (no OAuth/social providers configured)
  - Implementation: `supabase.auth.signInWithPassword`, `signUp`, `resetPasswordForEmail`, `signOut` in `src/contexts/AuthContext.js` (lines ~439-456); forgot-password screen at `src/screens/ForgotPasswordScreen.tsx`
  - Session storage: `expo-secure-store` (Keychain/Keystore) via `src/services/auth/secureStorage.ts`, with legacy AsyncStorage migration on boot (`supabaseClient.js` exports `storageReady`); `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`
  - Server-side validation: JWT verified by calling Supabase Auth REST (`backend/utils/auth.py`) — backend never trusts the token blindly
  - 401 handling: single `refreshSession()` retry then `signOut` (`src/services/api/apiClient.ts`)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Bugsnag). Errors classified client-side in `src/services/api/apiErrors.ts` and logged via `src/utils/logger`; server logs via `backend/utils/logger.py` (`WrapperLogger`) and gunicorn

**Logs:**
- Python stdlib logging (`backend/utils/logger.py`); gunicorn access/error logs on the VPS (`PYTHONUNBUFFERED=1` in `backend/Dockerfile`); no centralized log service

## CI/CD & Deployment

**Hosting:**
- VPS (Hostinger) — Flask backend containerized: `docker-compose.yml` + `backend/Dockerfile` (gunicorn, non-root user `forca` uid 10001, hashed lockfile install, read-only rootfs), nginx reverse proxy with security snippet `deploy/nginx/forca-api-security.conf` (HSTS, nosniff, CSP `default-src 'none'`, `server_tokens off`); prod URL `https://forca-api.cadastrai.com/api`, hml `https://forca-api-hml.cadastrai.com` (allowed in web CSP)
- Vercel — web build of the Expo app (`vercel.json`: `expo export -p web` + `scripts/verify-web-bundle.mjs`); `git.deploymentEnabled: false` (deploys triggered via dashboard/API, not git)
- App stores: not configured (no EAS)

**CI Pipeline:**
- GitHub Actions — `.github/workflows/session-contract.yml` on PR/push to main: `npm ci`, `npx tsc --noEmit`, `npx jest --runInBand --silent`, `python -m pytest backend/tests -q`, `npx expo export --platform web` (with harness Supabase env vars)
- Smoke/harness tooling: `harness/server.mjs` + `scripts/joint-*-smoke.mjs` (contract, concurrency, realtime, visual evidence)
- DB migrations: manual via Supabase CLI with preflight gate `scripts/supabase-preflight.sh` (staging first, prod requires typed confirmation `PRODUCAO`)

## Environment Configuration

**Required env vars:**
- Frontend (`EXPO_PUBLIC_*`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`; optional `EXPO_PUBLIC_ENABLE_OFFLINE_MODE`, `EXPO_PUBLIC_ENABLE_JOINT_TRAINING`
- Backend (required, hard-fail in `docker-compose.yml`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `CORS_ORIGINS`
- Backend (optional): `CLAUDE_MODEL_NAME`, `CHAT_MODEL_NAME`, `PLAN_MODEL_NAME`, `PLAN_EFFORT`, `ANTHROPIC_TIMEOUT_SECONDS`, `CHAT_RATE_LIMIT`/`CHAT_RATE_WINDOW_SECONDS`, `PLAN_RATE_LIMIT`/`PLAN_RATE_WINDOW_SECONDS`, `AI_DAILY_CALL_LIMIT_CHAT`/`_CONSOLIDATE`/`_PLAN`, `AI_DAILY_USD_LIMIT`, `FORCA_USE_MOLDE_ARCHITECTURE`, `FORCA_PROMPT_MOLDE_V2`, `FORCA_STRUCTURED_OUTPUT`, `FLASK_DEBUG`, `PORT` (5001), `JOB_TTL_SECONDS`, `FORCA_BIND_HOST`, test-only `FORCA_DOTENV_PATH`/`FORCA_SKIP_DOTENV`

**Secrets location:**
- `.env` at repo root (gitignored; template `.env.example` committed); VPS project env vars injected by the hosting platform (`docker-compose.yml` comment); Supabase PAT in `~/.supabase_pat` (chmod 600, loaded via `SUPABASE_ACCESS_TOKEN`) — never print keys/tokens/connection strings

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None. Real-time sync is via Supabase Realtime (WebSocket), not webhooks: `src/services/jointSessionRealtime.ts` subscribes to `postgres_changes` on channels `joint:<sessionId>` for tables `joint_sessions`, `joint_session_participants`, `joint_session_events` (added to `supabase_realtime` publication in `supabase/migrations/0026_treino_conjunto.sql`)

---

*Integration audit: 2026-08-08*
