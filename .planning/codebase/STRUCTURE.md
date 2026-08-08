# Codebase Structure

**Analysis Date:** 2026-08-08

## Directory Layout

```
ForcaApp/
├── App.tsx                  # Entry point do app (Expo): fontes + AuthProvider + RootNavigator
├── app.json                 # Config Expo (scheme forcaapp, android package, dark UI)
├── package.json             # Dependências npm + scripts (jest preset, lint-staged)
├── tsconfig.json            # Estende expo/tsconfig.base
├── babel.config.js          # babel-preset-expo (EXPO_PUBLIC_* inline, import.meta)
├── metroconfig.js           # Config do Metro
├── docker-compose.yml       # Backend para VPS Hostinger (1 serviço: backend)
├── docker-compose.override.yml.example  # Modelo de override de produção
├── requirements.txt         # Faixas do backend Python
├── requirements.lock.txt    # Lock com hashes (--require-hashes, usado no Dockerfile)
├── vercel.json              # Deploy web/PWA (expo export -p web, CSP, rewrites SPA)
├── .env.example             # Exemplo das variáveis (nunca commitar .env real)
├── AGENTS.md                # Instruções canônicas para agentes (refs Supabase, preflight)
│
├── android/                 # Projeto Android nativo (Expo prebuild; app/src/main/java/com/pmarconato/forcaapp)
├── assets/                  # Ícones, splash, imagens; fonts/ (BarlowSemiCondensed, Inter + licenças OFL)
├── branding/                # Identidade visual: fonts/, pranchas/
├── public/                  # Estático do web: index.html, manifest.json, icons/
├── patches/                 # patch-package: react-native+0.81.5.patch
│
├── src/                     # ★ Frontend React Native (Expo) — ver seção abaixo
├── backend/                 # ★ Backend Flask (Python) — ver seção abaixo
├── supabase/                # Migrations SQL (0000→0031), config.toml, proofs/
├── harness/                 # Harness visual reproduzível (stub Supabase + fixtures)
├── scripts/                 # Smoke tests, preflight, backfills, visual renders
├── test-utils/              # Helpers de teste compartilhados (ex.: tempoEfetivoConjuntoReplica.ts)
├── __tests__/               # ★ 131 arquivos de teste Jest do frontend
├── docs/                    # Documentação: AMBIENTE_SUPABASE, HML, deploy, modelo-dados, ui/
├── artifacts/               # Artefatos de sprint (sprint-02/visual)
└── .github/workflows/       # session-contract.yml (CI: tsc + jest + pytest + expo export)
```

## Directory Purposes

### `src/` — Frontend (React Native / Expo SDK 54)

**`src/screens/`:**
- Purpose: Telas; uma por fluxo, composição de UI + orquestração
- Contains: 18 telas `.tsx` — `HomeScreen.tsx`, `TrainingSessionScreen.tsx` (aba Plano), `ActiveSessionScreen.tsx`, `ProgressScreen.tsx`, `ProfileScreen.tsx`, `QuestionnaireScreen.tsx`, `PostQuestionnaireChat.tsx`, `ManualPlanEditorScreen.tsx`, `ManualWorkoutEditorScreen.tsx`, `ExercisePickerScreen.tsx`, sessão conjunto (`JointInviteScreen.tsx`, `JointJoinScreen.tsx`, `JointLobbyScreen.tsx`), auth (`LoginScreen.tsx`, `SignUpScreen.tsx`, `ForgotPasswordScreen.tsx`), histórico (`SessionHistoryScreen.tsx`, `SessionHistoryDetailScreen.tsx`), `WorkoutDetailScreen.tsx`
- Key files: `ActiveSessionScreen.tsx` (749 linhas), `PostQuestionnaireChat.tsx` (1507 linhas), `QuestionnaireScreen.tsx` (993 linhas)

**`src/components/`:**
- Purpose: Componentes reutilizáveis, agrupados por domínio
- Contains: `ui/` (UI kit com barrel `index.ts`: Button, TextField, NumericField, Surface, Controls, Feedback, Logo, FModules, pressPhysics), `session/` (SessionPlayer, SessionQueue, SessionSummary, CheckInSheet, AdaptationSheet, SkipReasonSheet, ReplanBanner, ReorderControls, ReorderScopeSheet, PrioridadeCard, PlannedExerciseRow, ManualExerciseRow, sessionPlayerLayout), `plan/` (FrequenciaCard), `progress/` (CardioGoalsSection, CardioGoalSheet), `profile/` (RefazerTreinoSheet), `joint/` (index.tsx, JointInviteCard)
- Regra: telas importam do barrel `ui/index.ts`, nunca de arquivo individual de token/estilo

**`src/engine/`:**
- Purpose: Lógica de domínio PURA (sem I/O) — testável offline
- Contains: 20 módulos: `sessionModel.ts`, `intraSessionAdaptation.ts`, `weeklyReplanner.ts`, `sessionFlow.ts`, `sessionSummary.ts`, `moodAdjustment.ts`, `musclePriority.ts`, `planReorder.ts`, `replanChanges.ts`, `scheduleShift.ts`, `cardioGoals.ts`, `progressStats.ts`, `tempoEfetivo.ts`, `adherenceHistory.ts`, `agendaDias.ts`, `weekShortfall.ts`, `config.ts` (números tunáveis), `guardrails.ts`, `jointLobbyModel.ts`, `jointSessionModel.ts`

**`src/services/`:**
- Purpose: Toda I/O: Supabase (repositories), Flask (api/), auth, storage local
- Contains: `api/` (`apiClient.ts` axios + interceptors, `apiErrors.ts`, `claudeService.ts`, `questionnaireService.ts`, `trainingPlanService.ts`, `planJobErrors.ts`), `auth/` (`authErrors.ts`, `secureStorage.ts`, `sessionProbe.ts`), repositories (`trainingRepository.ts`, `sessionExecutionRepository.ts`, `agendaRepository.ts`, `cardioGoalRepository.ts`, `weeklyReplanRepository.ts`, `planEditRepository.ts`, `jointSessionRepository.ts`, `adherenceHistoryRepository.ts`, `exerciseCatalogService.ts`), storages locais (`sessionDraftStorage.ts`, `manualPlanDraftStorage.ts`, `postQuestionnaireChatStorage.ts`, `jointInvitePending.ts`), realtime (`jointSessionRealtime.ts`), `manualPlanImport.ts`, `planRecovery.ts`

**`src/store/`:**
- Purpose: Estado global Zustand
- Contains: `activeSessionStore.ts` (1570 linhas), `manualPlanStore.ts`

**`src/navigation/`:**
- Purpose: Navegadores + deep linking
- Contains: `RootNavigator.js` (ramificação Auth/Onboarding/Main), `AuthNavigator.tsx`, `OnboardingNavigator.tsx`, `MainNavigator.tsx` (4 abas + 4 stacks tipados), `JointTrainingGate.tsx` (guard da feature), `linking.ts`, `linkingConfig.ts`, `inviteLink.ts`, `navigationStyles.ts`

**`src/contexts/`:**
- Purpose: Contexto React de auth (único)
- Contains: `AuthContext.js` (sessão, perfil, sonda de token)

**`src/hooks/`:**
- Purpose: Hooks reutilizáveis
- Contains: `useDiaLocal.ts`, `useJointSession.ts`

**`src/config/`:**
- Purpose: Configuração e flags
- Contains: `supabaseClient.js` (cliente oficial + storage seguro + migração de sessão), `featureFlags.ts`

**`src/constants/`:**
- Purpose: Constantes de domínio
- Contains: `cardioModalidades.ts`, `tempoTreino.ts`

**`src/theme/`:**
- Purpose: Tokens da identidade (fonte única)
- Contains: `theme.ts` (palette, surfaces, typography, spacing, fonts)

**`src/types/`:**
- Purpose: Tipos compartilhados
- Contains: `manualPlan.ts`

**`src/utils/`:**
- Purpose: Utilitários sem domínio
- Contains: `logger.ts`, `haptics.ts`, `motion.ts`, `weekSummary.ts`, `comTimeout.ts`

### `backend/` — Backend Flask (Python 3.11)

**`backend/app.py`:**
- Purpose: Aplicação Flask inteira: rotas, CORS, rate limit, quota, pipeline de geração (~2000 linhas)
- Key files: único módulo de entrada

**`backend/services/`:**
- Purpose: Regras de negócio do servidor
- Contains: `plan_mapper.py`, `plan_expander.py`, `manual_plan_builder.py`, `plan_repository.py` (persistência via RPC `save_training_plan`), `job_manager.py` (jobs em thread), `ai_quota.py` (teto US$/dia persistido), `exercise_catalog.py`, `dose_cardio.py`, `questionario_normalizer.py`, `molde_normalizer.py`

**`backend/schemas/`:**
- Purpose: JSON Schema de validação
- Contains: `diretrizes_schema.py`, `molde_schema.py`, `plano_manual_schema.py`, `schema_api.py`

**`backend/utils/`:**
- Purpose: Infra do backend
- Contains: `auth.py` (validação de JWT via `/auth/v1/user`), `config.py` (.env único na raiz), `logger.py`, `anthropic_retry.py` (chamadas com deadline)

**`backend/wrappers/`:**
- Purpose: Fluxo LEGADO síncrono de geração (flag `FORCA_USE_MOLDE_ARCHITECTURE=false`)
- Contains: `treinador_especialista.py`, `sistema_adaptacao_treino.py`, `distribuidor_treinos.py`

**`backend/tests/`:**
- Purpose: Testes pytest herméticos (36 arquivos, `conftest.py` com `FORCA_SKIP_DOTENV=1`)
- Contains: `test_app_security.py`, `test_plan_mapper.py`, `test_job_endpoints.py`, `test_quota_ia.py`, etc.

**`backend/data/`:**
- Purpose: Dados canônicos do domínio
- Contains: `catalogo_exercicios.json`

### `supabase/` — Banco e Realtime

- Purpose: Migrations versionadas (0000→0031), RPCs, RLS; config local
- Contains: `migrations/` (base de perfis, modelo de treino, RLS hardening, execução idempotente, save_set_log first-write-wins, save_training_plan, unicidade planned_sets, questionário, progression rules, checkin pré-treino, catálogo, cardio, quota IA, treino conjunto, agenda/reancoragem, tempo efetivo), `proofs/` (scripts de verificação), `config.toml`, `.temp/` (estado do CLI — não versionar além do `.gitignore`)

### Demais diretórios de apoio

**`harness/`:** `server.mjs` (stub Supabase + SPA), `fixtures.mjs` (dados determinísticos), `capture.mjs` (capturas 390×844), `README.md`
**`scripts/`:** `supabase-preflight.sh` (trava de ambiente hml/prod), `verify-web-bundle.mjs`, `joint-*-smoke.mjs` (contrato/concorrência/realtime/evidência visual), `backfill_catalogo_exercicios.py`, `exercicios_fora_do_catalogo.py`, `visual/` (renders: `joint.render.tsx`, `setup.js`)
**`__tests__/`:** 131 arquivos Jest do frontend, por domínio (`activeSessionStore.test.ts`, `weeklyReplanner.test.ts`, `authContextClockSkew.test.tsx`, `jointConcorrenciaCliente.test.tsx`, testes de tela `direcao03-*.test.tsx`, etc.)
**`test-utils/`:** helpers compartilhados (`tempoEfetivoConjuntoReplica.ts`)
**`docs/`:** `AMBIENTE_SUPABASE.md`, `AMBIENTE_HML.md`, `BACKEND_LOCAL.md`, `DEPLOY_VPS.md`, `DEPLOY_WEB.md`, `modelo-dados.md`, `reancoragem-agenda.md`, relatórios técnicos, `ui/` (screenshots)
**`.github/workflows/`:** `session-contract.yml` — CI: `tsc --noEmit`, jest, pytest, `expo export -p web`

## Key File Locations

**Entry Points:**
- `App.tsx`: raiz do app (fontes + AuthProvider + RootNavigator)
- `src/navigation/RootNavigator.js`: ramificação Auth/Onboarding/Main + dispatch de convite
- `backend/app.py`: aplicação Flask (rota única); executável via `python3 -m backend.app` ou gunicorn `backend.app:app`
- `harness/server.mjs`: servidor do harness visual

**Configuration:**
- `app.json`: identidade Expo (scheme `forcaapp`, dark, android package)
- `src/config/supabaseClient.js`: cliente Supabase (storage seguro)
- `src/config/featureFlags.ts`: flags de feature
- `backend/utils/config.py`: carrega `.env` único da raiz
- `docker-compose.yml` + `backend/Dockerfile`: produção VPS
- `vercel.json`: web/PWA (CSP, rewrites SPA)
- `.env.example`: variáveis documentadas (nunca commitar o `.env`)

**Core Logic:**
- `src/engine/`: toda regra de treino pura
- `src/store/activeSessionStore.ts`: orquestração da sessão ativa
- `src/services/sessionExecutionRepository.ts`: RPCs de execução
- `backend/services/plan_mapper.py` + `plan_expander.py`: pipeline molde→plano
- `backend/services/plan_repository.py`: persistência transacional

**Testing:**
- `__tests__/`: testes Jest do frontend (raiz do repo)
- `backend/tests/`: testes pytest (herméticos)
- `jest.web.config.js`: config web de testes (visual evidence)

## Naming Conventions

**Files:**
- Telas: `PascalCaseScreen.tsx` (ex.: `ActiveSessionScreen.tsx`, `JointLobbyScreen.tsx`)
- Componentes: `PascalCase.tsx` (ex.: `SessionPlayer.tsx`, `CardioGoalsSection.tsx`); barrel por pasta `index.ts`/`index.tsx`
- Engine/services/hooks/utils: `camelCase.ts` (ex.: `sessionModel.ts`, `weeklyReplanner.ts`, `useDiaLocal.ts`, `comTimeout.ts`)
- Backend Python: `snake_case.py` (ex.: `plan_mapper.py`, `ai_quota.py`); classes `PascalCase` (`PlanJob`, `PlanPersistenceError`)
- Migrations Supabase: `NNNN_nome_descritivo.sql` (ex.: `0026_treino_conjunto.sql`)
- Arquivos legados do frontend em `.js` mantêm o nome (ex.: `AuthContext.js`, `supabaseClient.js`, `RootNavigator.js`)

**Directories:**
- `src/`: por camada (screens, components, engine, services, store, navigation, contexts, hooks, config, constants, theme, types, utils)
- `src/components/`: por domínio (ui, session, plan, progress, profile, joint)
- `backend/`: por camada (services, schemas, utils, wrappers, tests)

## Where to Add New Code

**New Feature:**
- Tela nova: `src/screens/<Feature>Screen.tsx`, registrada no stack certo em `src/navigation/MainNavigator.tsx` (ou `OnboardingNavigator.tsx`/`AuthNavigator.tsx`) com tipos de rota no `ParamList` correspondente; deep link em `src/navigation/linkingConfig.ts` se precisar de URL
- Regra de negócio: `src/engine/<feature>.ts` (função pura, sem I/O) + testes em `__tests__/`
- Acesso a dados: `src/services/<feature>Repository.ts` (Supabase RPC) e/ou `src/services/api/<feature>Service.ts` (Flask); testes em `__tests__/`
- Estado global: `src/store/<feature>Store.ts` (Zustand) — só se necessário além de estado local
- Backend: rota em `backend/app.py` (ou extrair blueprint) + service em `backend/services/` + schema em `backend/schemas/` + testes em `backend/tests/`
- Banco: nova migration em `supabase/migrations/` seguindo a numeração sequencial (0000+), migrada primeiro para staging (`mjdjtiujhwklchalquhc`) via `scripts/supabase-preflight.sh hml`

**New Component/Module:**
- Componente reutilizável de UI: `src/components/ui/<Name>.tsx` + export no barrel `src/components/ui/index.ts`
- Componente de domínio: `src/components/<dominio>/<Name>.tsx` (session/, plan/, progress/, profile/, joint/)

**Utilities:**
- Helpers de domínio: `src/utils/` (sem domínio) ou `src/engine/` (puro de treino)
- Constantes de domínio: `src/constants/`
- Testes: `__tests__/` (frontend), `backend/tests/` (backend)

## Special Directories

**`supabase/.temp/`:**
- Purpose: Estado interno do Supabase CLI (refs linkados, versões)
- Generated: Sim
- Committed: Não (`.gitignore` próprio)

**`artifacts/`:**
- Purpose: Artefatos de sprint (screenshots, evidências visuais)
- Generated: Sim (durante sprints)
- Committed: Sim

**`harness/capturas/`:**
- Purpose: Screenshots do harness visual (evidência de regressão)
- Generated: Sim
- Committed: Sim (usados como prova)

**`.venv/` / `node_modules/`:**
- Purpose: Ambientes locais de Python e npm
- Generated: Sim
- Committed: Não

**`android/`:**
- Purpose: Projeto nativo Android gerado por prebuild (package `com.pmarconato.forcaapp`)
- Generated: Parcialmente (prebuild), commits existem
- Committed: Sim

---

*Structure analysis: 2026-08-08*
