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

## Status da Fase 2
- [x] Branch criada
- [x] .gitignore: branding/ protegido
- [ ] Testes-primeiro (RED)
- [ ] Migrações (Supabase + Redux)
- [ ] Remoções (Redux, mortos, tema duplicado, tooling)
- [ ] deps + housekeeping
- [ ] Verificação final + relatório
