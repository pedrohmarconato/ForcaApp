# Progresso — Modernização ForcaApp (Fases 2–5)

Checkpoint de sessão. Retomar daqui se a sessão for interrompida.

## Baseline confirmada (16/07/2026)
- jest: **29 testes / 6 suites — verde**
- pytest: **34 testes — verde**
- tsc --noEmit: **81 erros** (briefing dizia ~85)
- Branch de trabalho: `fase-2-consolidacao` (a partir de `main` atualizada)

## Decisões do dono (confirmadas)
1. **Redux: REMOVER** (recomendado). Apagar src/store/, hooks derivados, services zumbis, deps.
2. **Tooling morto (tailwind/postcss/babel-resolver): REMOVER** (recomendado).
3. **Arquivos soltos: documentos → docs/, branding/ → .gitignore** (recomendado).

## Divergências do briefing encontradas (reportadas, não decididas sozinhas)
- ⚠️ `services/supabase/supabase.ts` **não é órfão** — é VIVO (TrainingSession + WorkoutDetail). Migração necessária (não só deleção). → plano ajustado: migrar 2 telas para config/supabaseClient.js.
- ⚠️ 2 telas VIVAS (TrainingSession, Profile) importam `hooks/useAuth` (Redux) → **quebram em runtime** (sem Provider). Remover Redux = migrar essas 2 telas para AuthContext (o qual JÁ fornece user/profile/signOut). Migração trivial.
- ⚠️ `theme.ts` tem chaves que **não batem** com o que as telas usam: telas usam `theme.colors.background.primary` e `theme.colors.primary` (inexistentes; theme.ts tem `background.dark` e `primary.main`). Telas renderizam com cor undefined. → pendência para **Fase 3** (tokens), não bloqueia Fase 2.
- Lixo extra: `src/theme/colors/index;ts` (ponto-e-vírgula no nome), swap `.SignUpScreen.tsx.swn`.

## Mapa de arquivos (árvore viva a partir de App.tsx)
VIVOS REAIS: App.tsx; contexts/AuthContext.js; navigation/{RootNavigator.js,AuthNavigator,MainNavigator,OnboardingNavigator}; telas {Login,SignUp,ForgotPassword,Home,TrainingSession,Profile,WorkoutDetail,Questionnaire,PostQuestionnaireChat}; config/supabaseClient.js; services/supabase/supabase.ts; services/api/{apiClient,claudeService,trainingPlanService}; services/auth/secureStorage; utils/logger; theme/theme.ts.

ÓRFÃOS COMPLETOS (19): navigation/{AppNavigator.tsx,navigationTypes.ts}; screens/ChatScreen.tsx; components/ui/Button.tsx; components/training/WorkoutCard.tsx; components/ErrorBoundary.tsx; services/api/interceptors.ts; services/auth/refreshToken.ts; hooks/{useToast,useTraining,useAppSelector}.ts; store/middlewares/loggerMiddleware.ts; theme/{index.ts,colors.ts,colors/index;ts,spacing.ts,spacing/index.ts,typography.ts,typography/index.ts}.

ZUMBIS (vivos só via ramo Redux sem Provider — 13): hooks/{useAuth,useAppDispatch}.ts; store/{index.ts,selectors/index.ts,slices/*}; services/auth/{authService,supabaseClient,tokenStorage}.ts; services/api/endpoints.ts; services/userProfileService.ts.

## Status da Fase 2 — CONCLUÍDA (commit 860588b, branch fase-2-consolidacao)
- [x] Branch criada
- [x] .gitignore: branding/ protegido
- [x] Testes-primeiro (RED → GREEN): 3 testes em __tests__/consolidacao-screens.test.tsx
- [x] Migrações: 2 telas Supabase → config/supabaseClient.js; 2 telas Redux → AuthContext
- [x] Remoções: ramo Redux (store+hooks+services zumbis), telas/componentes órfãos, tema duplicado, tooling morto
- [x] deps Redux + babel-plugin-module-resolver removidos; npm install OK
- [x] App.tsx limpo; housekeeping (docs/, .gitignore, lixo .swn/png)
- [x] Verificação final: tsc 81→0; jest 32 verde; pytest 34 verde; backend /health 200

### Métricas
- 51 arquivos: +49/−2926 linhas (consolidação líquida)
- src/ passou de ~50 arquivos para 23 (todos vivos)

### Pendências assumidas (NÃO sucesso otimista)
1. **Supressões `as any` temporárias (4 locais):** QuestionnaireScreen (reset 'Login' ×2) e
   PostQuestionnaireChat (reset 'App' ×2) — resets cross-navigator inválidos. Documentadas com
   FIXME(Fase 5). Correção adequada (refatorar fluxo de chat/onboarding) é escopo da Fase 5.
2. **Divergência de chaves do tema:** telas vivas usavam `theme.colors.background.primary` e
   `theme.colors.primary` (inexistentes). Corrigi para `background.dark` e `primary.main` nas
   3 telas que toquei → agora renderizam com cor real (#0A0A0A / #EBFF00). As 6 telas com
   paleta inline ainda replicam constantes (NEON_YELLOW etc.) → migração para o tema é Fase 3.
3. **Boot do backend validado com credenciais dummy** (não há .env no repo). /health e /api/health
   retornam 200; endpoints de auth/chat não testados sem credenciais reais. Backend não foi
   tocado pela Fase 2 e pytest está verde.

### PRINCIPIANDO: aguardar decisão do dono — abrir PR para main, ou revisar diff primeiro.

---

## ⛔ BLOQUEIO de MODELO DE DADOS (17/07/2026) — estado atual

O PR #3 foi convertido para **draft** por decisão do dono, após um review adversarial
ter apontado um bug que revelou um problema mais fundo de modelo de dados.

### O que aconteceu
1. Review adversarial (IA externa) achou: Home envia `{ workout }`, WorkoutDetail lê
   `{ trainingId }` → `undefined` → tela presa em "Carregando...".
2. Investigação de fundo revelou: o bug de param é sintoma. O frontend consulta tabelas
   em inglês (`workouts`, `training_sessions`, `training_exercises`) que **não casam**
   com o banco real (27 tabelas dimensionais em português: `fato_*`/`dim_*`).
3. O problema é **MISTO**: desalinhamento de nomenclatura + lacunas de colunas
   (`usuario_id`/`status`/`date` ausentes; cadeia usuário→treino quebrada — falta
   `fato_treinamento` âncora) + conceitos sem tabela (onboarding, `current_plan_id`).

### Documentação completa
- `docs/modelo-dados.md` — mapeamento detalhado banco dimensional × frontend, lacunas,
  problemas de qualidade, e 4 opções de reconciliação (A simplificar / B adotar dimensional
  / C views híbridas / D decidir depois).

### Decisões do dono (17/07)
- Modelo de dados: **documentar e decidir depois** (Opção D).
- PR #3: **manter bloqueado** até decidir o modelo.

### Estado do código
- Branch `fase-2-consolidacao`, commit `860588b` (consolidação correta: tsc 0/jest 32/pytest 34).
- **Pendente quando desbloquear:** reescrever o teste de WorkoutDetailScreen (falso positivo —
  injeta `{ trainingId }` em vez de `{ workout }`) para reproduzir o contrato real e expor o bug.
- Fases 3/4/5 ficam suspensas até o modelo de dados ser definido.

---

## ✅ Fase 3 — Persistência e navegação (17/07/2026, branch fase-3-persistencia)

### Desbloqueio do modelo de dados
O dono aprovou o plano de construção (Fases 3–7, `~/.claude/plans/forca-app-plano-fases.md`):
**Opção A — modelo novo e enxuto**. Tabelas `fato_*`/`dim_*` ficam intocadas (aposentadas).
PR #3 foi mesclado (squash `de24105`) após verificação local (tsc 0 / jest 32 / pytest 34).

### O que foi feito
- [x] `supabase/migrations/0001_modelo_treino.sql`: training_plans → planned_sessions →
      planned_exercises → planned_sets + session_logs/set_logs, RLS por usuário,
      `profiles.current_plan_id` (coluna que o app já gravava e não existia).
- [x] Backend grava o plano: `services/plan_mapper.py` (puro; datas deterministas, reps/descanso
      tolerantes, prioridade com fallback, user_id sempre do token) + `services/plan_repository.py`
      (PostgREST com JWT do usuário; falha → limpeza + erro claro) + wiring em `app.py`
      (persistência no lugar do TODO; 502 honesto se a gravação falhar).
- [x] IA passa a classificar `prioridade` (primario/secundario/acessorio) por exercício.
- [x] App: `src/services/trainingRepository.ts` (leitura tipada e ordenada) + Home
      (treino de hoje real, próximos treinos, stats "—" sem dado inventado) +
      WorkoutDetail (`{ sessionId }` — bug do param morto) + TrainingSession (sessão real).
- [x] Testes: pytest 34→55 (mapper 13, repositório 5, endpoint 3); jest 32→41
      (repositório, Home, telas religadas); tsc 0 erros.

### Pendências honestas
1. **Migration NÃO aplicada** no Supabase (sem credenciais/projeto neste ambiente).
   Sem ela, gerar plano → backend recebe 404 do PostgREST → 502 "não pôde ser salvo".
2. **E2E real não exercitado** (gerar plano num usuário de verdade e navegar) — depende
   da migration + backend com .env. Verificação foi por testes com rede mockada.
3. Fluxo de reset de navegação pós-onboarding (`as any`, FIXME) fica para a Fase 4.

### Próximo passo
Abrir PR #4 e aguardar OK do dono. Depois: aplicar migration, smoke E2E, e Fase 4
(sessão interativa) conforme o plano.
