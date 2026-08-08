<!-- refreshed: 2026-08-08 -->
# Architecture

**Analysis Date:** 2026-08-08

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        APP — React Native (Expo SDK 54)                     │
│  App.tsx → AuthProvider (src/contexts/AuthContext.js)                       │
│  → RootNavigator (src/navigation/RootNavigator.js)                          │
├──────────────┬──────────────────┬──────────────────┬───────────────────────┤
│ AuthNavigator│ OnboardingNaviga-│ MainNavigator    │ 4 tabs (bottom)        │
│ (login/signup)│ tor (questionário│ (4 stacks)       │ Hoje·Plano·Progresso·   │
│              │ → chat → plano)  │                  │ Perfil                 │
├──────────────┴──────────┬───────┴──────────┬───────┴───────────────────────┤
│  Screens  (src/screens) │ Components       │ Zustand Stores (src/store/)   │
│  + Hooks                │ (src/components) │ activeSessionStore, manualPlanStore
├─────────────────────────┴──────────────────┴──────────────────────────────┤
│  Domain — src/engine/ (PURE, no I/O)                                       │
│  sessionModel, intraSessionAdaptation, weeklyReplanner, jointSessionModel…  │
├────────────────────────────────────────────────────────────────────────────┤
│  I/O — src/services/ (repositories → Supabase RPC; api/ → Flask via axios)  │
│  Infra — src/config/, src/theme/, src/constants/, src/utils/                │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  HTTPS (axios, Bearer JWT Supabase)      │ Supabase JS client
                ▼                                          ▼
┌───────────────────────────────┐        ┌────────────────────────────────────┐
│  BACKEND — Flask (backend/)   │        │  SUPABASE (supabase/migrations/)   │
│  app.py: rotas + rate limit + │        │  Postgres + RLS + RPCs (0024 quota, │
│  quota IA + pipeline molde    │        │  0006 save_training_plan, 0026 treino│
│  services/: plan_mapper,      │        │  conjunto, Realtime)               │
│  plan_expander, job_manager,  │        │                                    │
│  plan_repository (RPC),       │        │                                    │
│  ai_quota (teto US$/dia)      │        │                                    │
│  └── Anthropic (Claude)       │        │                                    │
└───────────────────────────────┘        └────────────────────────────────────┘
        │  deploy: docker-compose.yml → VPS Hostinger (gunicorn, nginx snippet)
        ▼
   WEB — vercel.json (expo export -p web, PWA em https://forca-app-six.vercel.app)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App shell | Carrega fontes da marca, monta `AuthProvider` + `RootNavigator` | `App.tsx` |
| AuthContext | Sessão Supabase, perfil, sonda de token (clock skew), expiração | `src/contexts/AuthContext.js` |
| RootNavigator | Ramificação Auth / Onboarding / Main; dispatch de convite pendente | `src/navigation/RootNavigator.js` |
| MainNavigator | 4 abas (Home, Training, Progress, Profile), cada uma um stack | `src/navigation/MainNavigator.tsx` |
| Deep linking | 2 configs (`linkingMain` / `linkingInterceptor`), validação de convite puro | `src/navigation/linking.ts`, `linkingConfig.ts`, `inviteLink.ts` |
| Screens | Composição de UI + orquestração de serviços/engines por tela | `src/screens/*.tsx` (18 telas) |
| UI kit | Primitivos da identidade; telas importam só do barrel | `src/components/ui/index.ts` + `src/theme/theme.ts` |
| Engine | Lógica de domínio PURA (sem I/O): sessão, adaptação, replan, cardio, joint | `src/engine/*.ts` (20 módulos) |
| Stores | Estado global Zustand: sessão ativa e editor manual; finos, delegam engine/services | `src/store/activeSessionStore.ts`, `src/store/manualPlanStore.ts` |
| Repositories | I/O para Supabase (RPCs Postgres): plano, execução, agenda, cardio, joint | `src/services/*Repository.ts` |
| API client | axios → Flask: interceptors (Bearer, 401-refresh), classificação de erros | `src/services/api/apiClient.ts` |
| API services | Serviços por domínio: chat, plano, questionário, catálogo | `src/services/api/*.ts` |
| Auth storage | Sessão criptografada (Keychain/Keystore) + sonda | `src/services/auth/*.ts` |
| Backend app | Flask: todas as rotas, rate limits, quota, pipeline molde | `backend/app.py` (~2000 linhas) |
| Backend services | Mapper, expansor, job manager, persistência, quota IA, catálogo | `backend/services/*.py` |
| Backend schemas | JSON Schema das diretrizes/molde/plano manual | `backend/schemas/*.py` |
| Backend utils | Auth (JWT→Supabase), config (.env único), logger, retry Anthropic | `backend/utils/*.py` |
| Backend wrappers | Fluxo LEGADO síncrono (TreinadorEspecialista), gated por flag | `backend/wrappers/*.py` |
| Supabase migrations | Schema + RPCs + RLS (0000→0031), proofs de verificação | `supabase/migrations/`, `supabase/proofs/` |

## Pattern Overview

**Overall:** Frontend em camadas (tela → store → engine puro + repository I/O) com backend Flask monólito de rota única que faz proxy para Claude e persiste via RPCs do Supabase — **sem service role**: o JWT do usuário atravessa.

**Key Characteristics:**
- **Engine puro separado de I/O**: `src/engine/` contém só funções puras testáveis offline; nenhum `import` de storage/rede entra lá. Quem decide o que fazer com o dado é a UI via store.
- **Store fino (Zustand)**: `src/store/activeSessionStore.ts` (1570 linhas) orquestra engine + repositories; delega cálculo puro ao engine e I/O aos services.
- **Repositories encapsulam RPCs**: cada gravação importante é uma RPC transacional no banco (ex.: `save_training_plan` na 0006, `start_session_log`/`save_set_log`/`finish_session_log`), nunca SQL ad-hoc do cliente.
- **Auth por JWT do usuário em tudo**: backend valida o token contra `/auth/v1/user` (`backend/utils/auth.py`) e repassa o mesmo JWT nas RPCs — RLS do Supabase é a fronteira final de autorização.
- **Duas arquiteturas de geração de plano coexistem sob flag**: legado síncrono (`FORCA_USE_MOLDE_ARCHITECTURE=false`, default) e novo fluxo assíncrono molde→expansor→job polling.
- **Backend single-process assumido**: rate limits em memória (`backend/app.py:116-139`) e jobs em thread (`backend/services/job_manager.py`) — comentários no código documentam a troca para Redis/fila externa em multi-worker.

## Layers

**Frontend — Presentation:**
- Purpose: Telas e componentes; composição visual + chamada a stores/services
- Location: `src/screens/`, `src/components/`
- Contains: 18 telas (`src/screens/`), componentes de domínio por pasta (`session/`, `plan/`, `progress/`, `profile/`, `joint/`), UI kit (`src/components/ui/`)
- Depends on: stores, hooks, services, theme
- Used by: Navegadores (`src/navigation/`)

**Frontend — State & Orchestration:**
- Purpose: Estado global e sessão; orquestra engine puro + repositories
- Location: `src/store/`, `src/contexts/`, `src/hooks/`
- Contains: `activeSessionStore.ts`, `manualPlanStore.ts`, `AuthContext.js`, `useDiaLocal.ts`, `useJointSession.ts`
- Depends on: engine (cálculo), services (I/O)
- Used by: Screens e componentes

**Frontend — Domain (pure):**
- Purpose: Lógica de treino sem I/O: modelo da sessão, adaptação intra-sessão, replan semanal, cardio, treino conjunto, agenda
- Location: `src/engine/`
- Contains: `sessionModel.ts`, `intraSessionAdaptation.ts`, `weeklyReplanner.ts`, `jointSessionModel.ts`, `jointLobbyModel.ts`, `scheduleShift.ts`, `cardioGoals.ts`, `musclePriority.ts`, `moodAdjustment.ts`, `planReorder.ts`, `progressStats.ts`, `sessionFlow.ts`, `tempoEfetivo.ts`, etc.
- Depends on: `src/types/` apenas
- Used by: Stores, screens, hooks, services

**Frontend — I/O:**
- Purpose: Todo acesso externo: Supabase (auth, dados, RPC, Realtime) e Flask
- Location: `src/services/`
- Contains: `*Repository.ts` (Supabase), `api/apiClient.ts` + `api/*Service.ts` (Flask), `auth/secureStorage.ts`, storages locais (`sessionDraftStorage.ts`, `manualPlanDraftStorage.ts`, `jointInvitePending.ts`)
- Depends on: `src/config/supabaseClient.js`, `src/engine/` (tipos puros)
- Used by: Stores, screens, hooks

**Backend — HTTP:**
- Purpose: Rotas Flask, rate limit em memória, quota persistente, pipeline de geração
- Location: `backend/app.py`
- Contains: `/api/chat`, `/api/consolidate-chat`, `/api/generate-plan` (+`/<job_id>` polling), `/api/manual-plan` (+`/preview`), `/api/exercise-catalog` (+`/resolve`), `/health`, `/api/ready`
- Depends on: services, schemas, utils
- Used by: `src/services/api/*` (frontend)

**Backend — Services:**
- Purpose: Regras de negócio do servidor: mapper/expansor do plano, molde, persistência, quota, catálogo
- Location: `backend/services/`
- Contains: `plan_mapper.py`, `plan_expander.py`, `manual_plan_builder.py`, `plan_repository.py`, `job_manager.py`, `ai_quota.py`, `exercise_catalog.py`, `dose_cardio.py`, `questionario_normalizer.py`, `molde_normalizer.py`
- Depends on: schemas, utils
- Used by: `backend/app.py`

**Backend — Legacy wrappers:**
- Purpose: Fluxo antigo síncrono de geração (TreinadorEspecialista) — caminho default enquanto `FORCA_USE_MOLDE_ARCHITECTURE` for false
- Location: `backend/wrappers/`
- Contains: `treinador_especialista.py`, `sistema_adaptacao_treino.py`, `distribuidor_treinos.py`
- Depends on: utils (anthropic_retry)
- Used by: `backend/app.py` (quando flag off)

## Data Flow

### Primary Request Path — Geração de plano (fluxo molde assíncrono, flag ON)

1. App: `PostQuestionnaireChat.tsx` conversa via `/api/chat` (proxy Haiku) e chama `/api/consolidate-chat` para virar diretrizes (`src/services/api/questionnaireService.ts`).
2. App: POST `/api/generate-plan` com questionário+diretrizes → `backend/app.py:964` (rota `handle_generate_plan`).
3. Backend: reserva quota (`ai_quota.reservar`, migration 0024/0025), cria job em thread (`job_manager.py`), responde `{job_id}` imediatamente.
4. Thread: molde (Claude Opus via `_executar_geracao_molde`, `backend/app.py:1724`) → validação `molde_schema` → expansor (`plan_expander.expandir_plano`) → mapper (`plan_mapper.mapear_plano_ia`) → persistência (`plan_repository.persistir_plano` → RPC `save_training_plan`, migration 0006).
5. App: polling GET `/api/generate-plan/<job_id>` (`trainingPlanService.ts`) até status `salvo`; `plan_id` retorna ao app.

### Manual Plan (determinístico, sem IA)

1. `ManualPlanEditorScreen.tsx` monta rascunho → POST `/api/manual-plan/preview` (`backend/app.py:934`) roda o MESMO pipeline expandir+mapear sem persistir (sem consumir cota).
2. Confirmação → POST `/api/manual-plan` (`backend/app.py:884`) persiste via `save_training_plan` e arquiva o plano ativo anterior.

### Execução de sessão (app-only + Supabase)

1. `ActiveSessionScreen.tsx` → `activeSessionStore.ts` (`src/store/activeSessionStore.ts`).
2. Store chama `sessionExecutionRepository.ts` (RPCs: `start_session_log`, `save_set_log` idempotente first-write-wins 0005, `finish_session_log`, `skip_session_exercise`, `update_set_log_adaptation`) e calcula outcome/sugestão via `src/engine/sessionModel.ts` + `intraSessionAdaptation.ts`.
3. Adaptação só é aplicada após confirmação do aluno (bottom sheets em `src/components/session/`).
4. Replan semanal: `weeklyReplanner.ts` (engine) + `weeklyReplanRepository.ts` (RPC 0027 agenda/reancoragem).

### Treino conjunto (Sprint 02)

1. Convite: código 6 chars (`inviteLink.ts`, alfabeto sem O/0/I/1), link `forcaapp://treino-conjunto/<codigo>`.
2. Deep link interceptado por `linking.ts` → guarda pendente (`jointInvitePending.ts`) → `RootNavigator` despacha para `Home/JointJoin`.
3. Sessão: `jointSessionRepository.ts` (RPCs da 0026) + `jointSessionRealtime.ts` (Supabase Realtime) + hook `useJointSession.ts` + modelos puros `jointLobbyModel.ts`/`jointSessionModel.ts`.

**State Management:**
- **Zustand** para estado global de sessão ativa e editor manual (`src/store/`)
- **React Context** apenas para auth (`src/contexts/AuthContext.js`)
- **Estado local** (`useState`/`useMemo`/`useFocusEffect`) nas telas; nada global além dos dois stores
- **Rascunhos em disco**: `sessionDraftStorage.ts` (retomada de sessão) e `manualPlanDraftStorage.ts` (editor) — AsyncStorage

## Key Abstractions

**Engine puro (sem I/O):**
- Purpose: Toda regra de treino é função pura sobre tipos de `src/types/` e `src/engine/` — testável offline
- Examples: `src/engine/sessionModel.ts` (draft/outcome/skip), `src/engine/intraSessionAdaptation.ts` (recomendação de carga), `src/engine/weeklyReplanner.ts`, `src/engine/jointSessionModel.ts`
- Pattern: Módulos de funções puras exportadas; config de números centralizada em `src/engine/config.ts` (percentuais/tetos tunáveis sem tocar a lógica)

**Repositórios (I/O encapsulado):**
- Purpose: Único ponto de acesso a cada domínio no Supabase; expõem RPCs transacionais
- Examples: `src/services/sessionExecutionRepository.ts` (845 linhas), `src/services/trainingRepository.ts`, `src/services/jointSessionRepository.ts`, `src/services/agendaRepository.ts`
- Pattern: `*Repository.ts` em `src/services/`; erros de transporte tipados (`SessionExecutionRequestError`)

**Stores finos:**
- Purpose: Estado global orquestrador; guarda rascunho, persiste no aparelho, delega I/O ao repository e cálculo ao engine
- Examples: `src/store/activeSessionStore.ts`, `src/store/manualPlanStore.ts`
- Pattern: Zustand; status explícito (`idle | loading | awaiting_checkin | active | finished | error` em `activeSessionStore.ts:76`)

**UI kit com tokens:**
- Purpose: Identidade visual única; nenhuma tela declara cor/fonte/raio próprios
- Examples: `src/components/ui/index.ts` (barrel), `src/theme/theme.ts` (fonte única de tokens)
- Pattern: Importação exclusiva pelo barrel; `theme` importado em telas e navegadores

**Job assíncrono no backend:**
- Purpose: Geração de plano longa (Opus) sem ocupar o worker síncrono
- Examples: `backend/services/job_manager.py`
- Pattern: `PlanJob` em thread com `threading.Lock`, status transiciona `created → gerando_molde → expandindo → salvando → salvo|erro`; `plan_id` só aparece junto de `salvo` (sob lock)

## Entry Points

**App (mobile/web):**
- Location: `App.tsx` (raiz; `package.json` main = `node_modules/expo/AppEntry.js`)
- Triggers: `expo start`, `expo run:ios|android`, `expo export -p web`
- Responsibilities: fontes da marca (`assets/fonts/`), `AuthProvider`, `RootNavigator`

**RootNavigator (ramificação de fluxo):**
- Location: `src/navigation/RootNavigator.js`
- Triggers: sessão Supabase + perfil `onboarding_completed`
- Responsibilities: monta `AuthNavigator` (sem sessão), `OnboardingNavigator` (perfil sem onboarding) ou `MainNavigator`; despacha convite pendente quando a árvore Main fica pronta (`mainNavigationRef` + `onReady`)

**Backend HTTP:**
- Location: `backend/app.py` (`python3 -m backend.app`, `python3 backend/app.py`, gunicorn `backend.app:app` no `backend/Dockerfile`)
- Triggers: requisições HTTPS do app (axios) na porta 5001
- Responsibilities: todas as rotas `/api/*`, CORS, `MAX_CONTENT_LENGTH` 256 KB, rate limits em memória, quota diária persistente, pipeline de geração

**Harness visual (desenvolvimento/testes):**
- Location: `harness/server.mjs` + `harness/fixtures.mjs` + `harness/capture.mjs`
- Triggers: `node harness/server.mjs [dir-do-export]` com export web apontando para stub `http://localhost:8787`
- Responsibilities: serve o export web real com stub Supabase determinístico (Auth + PostgREST + RPC), capturas a 390×844; ver `harness/README.md`

**Smoke tests de contrato:**
- Location: `scripts/joint-contract-smoke.mjs`, `joint-concurrency-smoke.mjs`, `joint-realtime-smoke.mjs`, `joint-visual-evidence.mjs` (compartilham `joint-smoke-shared.mjs`)
- Responsibilities: validam o contrato do treino conjunto sem tocar produção

## Architectural Constraints

- **Engine sem I/O:** `src/engine/` não pode importar storage, rede nem Supabase — é a fronteira de testabilidade offline
- **Backend single-process (deploy 1 worker × 8 threads gunicorn):** rate limits e jobs em memória; comentários em `backend/app.py:58-125` e `backend/services/job_manager.py` marcam a troca para Redis/fila em multi-worker
- **Sem service role:** o backend usa somente o JWT do usuário + anon key nas RPCs; RLS é a fronteira final (`backend/services/plan_repository.py`)
- **Auth atravessa em tudo:** interceptor do axios anexa `Bearer` de `supabase.auth.getSession()` (`src/services/api/apiClient.ts:108-122`); 401 → um único `refreshSession` → signOut se persistir
- **Env só `EXPO_PUBLIC_*`:** `@env`/`react-native-dotenv` removidos; `babel.config.js` usa inlining do `babel-preset-expo`
- **Design tokens únicos:** nada de cor/fonte/raio fora de `src/theme/theme.ts`; componentes importam de `src/components/ui/index.ts`
- **Duas árvores de navegação com linking distintos:** `linkingMain` (rotas completas, só quando Main montada) vs `linkingInterceptor` (valida convite e guarda, devolve null) — `src/navigation/linking.ts`
- **Vocabulários fechados espelhando o banco:** `SkipReason` em `src/engine/sessionModel.ts` espelha `_forca_motivo_recusa_valido` (0020); alfabeto do convite espelha `_forca_joint_codigo_novo` (0026) — divergência vira erro de gravação 22023
- **Frontend JS e TS misturados:** módulos legados em `.js` (`AuthContext.js`, `supabaseClient.js`, `RootNavigator.js`) coexistem com TS; novos código em TS

## Anti-Patterns

### Monólito de rota única no backend

**What happens:** `backend/app.py` concentra ~2000 linhas: rotas, rate limit, quota, montagem de prompts, chamadas Anthropic e o pipeline molde completo.
**Why it's wrong:** Qualquer mudança numa rota de geração exige ler/alterar o mesmo módulo gigante; testes de unidade dependem do app inteiro.
**Do this instead:** Extrair rotas por domínio (blueprints) mantendo os services já separados em `backend/services/`; os testes já existentes em `backend/tests/test_*.py` são a rede de segurança.

### Caminho legado duplicado sob flag

**What happens:** Duas arquiteturas de geração de plano vivem lado a lado: wrappers síncronos (`backend/wrappers/treinador_especialista.py`) e o fluxo molde+expansor+job, selecionados por `FORCA_USE_MOLDE_ARCHITECTURE` (default false em `docker-compose.yml`).
**Why it's wrong:** Dois caminhos para o mesmo resultado = duas superfícies de bug e custo duplicado de manutenção; a flag em produção hoje aponta para o fluxo legado.
**Do this instead:** Quando o fluxo molde estabilizar, remover `backend/wrappers/` e a flag, deixando um único caminho.

### JS/TS misturado no frontend

**What happens:** Arquivos críticos são `.js` sem tipos (`src/contexts/AuthContext.js`, `src/config/supabaseClient.js`, `src/navigation/RootNavigator.js`) enquanto o restante é TS tipado.
**Why it's wrong:** Erros de contrato só aparecem em runtime; tipagem dos navigators/contextos perde cobertura.
**Do this instead:** Migrar incrementalmente para TS mantendo os testes existentes (`__tests__/authContextClockSkew.test.tsx`, etc.) como rede de segurança.

## Error Handling

**Strategy:** Camadas com classificação de erro e falha-fechada:

**Patterns:**
- **Frontend API:** `classifyApiError` (`src/services/api/apiErrors.ts`) → `network | timeout | http_error | unauthorized | canceled`; interceptor loga e trata 401 com refresh único (`apiClient.ts:50-93`); probes de saúde são falha esperada e não abrem LogBox (`isExpectedProbeFailure`)
- **Frontend Supabase:** erros de transporte tipados por repositório (ex.: `SessionExecutionRequestError` + `isTransportSessionExecutionError` em `sessionExecutionRepository.ts`); clock skew (PGRST303) tem política própria de retry/keep-session (`AuthContext.js:98-118`)
- **Backend:** quota falha fechada — sem contabilidade não há teto (`ai_quota.py`); retries de rede com deadline (`backend/utils/anthropic_retry.py`), retry dirigido por reprovação semântica no molde; `PlanPersistenceError` em timeout (conservador, idempotência suportada pela RPC)
- **UI:** fallbacks de indisponibilidade desenhados; estado vazio real (`null` = "ainda não sei") nunca número placeholder (`HomeScreen.tsx`)

## Cross-Cutting Concerns

**Logging:** `src/utils/logger.ts` no app (warn para falhas operacionais, error só para bug local); `backend/utils/logger.py` (`WrapperLogger`) no backend; nomes de módulo em cada log
**Validation:** JSON Schema no backend (`backend/schemas/*.py` — diretrizes, molde, plano manual, schema de API); `yup` + `react-hook-form` nos formulários; vocabulários fechados espelhando o banco
**Authentication:** Supabase Auth; token validado no backend contra `/auth/v1/user` (`backend/utils/auth.py`); sessão criptografada no Keychain/Keystore (`src/services/auth/secureStorage.ts`); RLS em todas as tabelas (migrations 0002, 0019, 0023 revogam anon de RPCs legadas)
**Security hardening:** docker-compose com rootfs `read_only`, tmpfs, `cap_drop: ALL`, bind só loopback por padrão (`docker-compose.yml`); headers de segurança em `deploy/nginx/forca-api-security.conf` e `vercel.json` (CSP, HSTS, frame-ancestors none); `MAX_CONTENT_LENGTH` 256 KB contra payloads gigantes
**Preflight de banco:** `scripts/supabase-preflight.sh hml|prod` confere o ref linkado antes de qualquer `db push` (ver `AGENTS.md`)

---

*Architecture analysis: 2026-08-08*
