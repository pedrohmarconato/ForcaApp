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

---

## ✅ Correções do review adversarial do PR #4 (17/07/2026)

Review externo achou 10 problemas reais (7 altos, 3 médios). Triagem: **10/10
CONFIRMADOS** contra o código vivo, zero falso-positivo. Todos corrigidos:

1. Limpeza verificada: DELETE com `return=representation`; mensagem diz "removido"
   só com confirmação do banco; limpeza também no insert do plano (timeout confirmado).
2. RLS endurecido em `0002_rls_hardening.sql`: WITH CHECK valida posse do PAI em
   planned_sessions/session_logs/set_logs. **⚠️ 0002 AINDA NÃO APLICADA no Supabase.**
3. Um plano ativo por usuário: backend arquiva o anterior antes de inserir + índice
   único parcial (0002); app escopa TODAS as leituras pelo plano ativo.
4. AMRAP exibido como veio (faixa interna não vaza); "descanso livre" removido.
5. Sessão sem exercícios → erro; duration_weeks = cobertura real, não a declarada.
6. series clamp 10/exercício + teto global 2000 + maximum 20 no schema da IA.
7. Parser JSON robusto (fence guloso → texto inteiro → primeiro-{ ao último-});
   stop_reason=max_tokens vira erro explícito de truncamento.
8. Nenhuma sessão agendada antes de start_date; rótulo da Home "hoje/próximo" honesto.
9. Erro de banco ≠ estado vazio nas 3 telas.
10. Fim dos IDs "temp-"/"offline-": sucesso exige plan_id real; offline sem planId;
    chat grava current_plan_id condicionalmente.

Verificação: pytest 55→69 · jest 41→51 · tsc 0. Migration 0001 JÁ APLICADA no
projeto (dono confirmou, todos os checks ✓). Pendências: aplicar **0002** e rodar
o smoke E2E antes do merge do PR #4.

---

## ✅ Fase 4 — Sessão interativa: registrar série a série (17/07/2026, branch fase-4-sessao-interativa)

### Base do branch
PR #4 (`fase-3-persistencia`) **ainda ABERTO** no merge desta fase. Como a Fase 4
depende do modelo de dados e da camada de leitura da Fase 3, o branch nasceu de
`fase-3-persistencia` (não de `main`). O PR #5 deve ter `fase-3-persistencia`
como base; se o dono mesclar o #4 antes, rebasear para `main`.

### O que foi feito (tudo testes-primeiro)
- **Modelo puro** `src/engine/sessionModel.ts`: `computeOutcome` (under/on_target/
  over), `isBodyweightEquipment` (pelo EQUIPAMENTO, não pela carga nula),
  `suggestLoad` (nunca inventa kg — precedência plano→histórico→null), `stepLoad`,
  `canCompleteSet`, `buildDraftFromDetail`. 21 testes.
- **Repositório de execução** `src/services/sessionExecutionRepository.ts`
  (cliente único + RLS + throw em erro): `startSessionLog` (sessão → in_progress),
  `saveSetLog` (adaptation NULA — Fase 5), `finishSessionLog` (→ completed),
  `getOpenSessionLog` (retomada sem duplicar log), `getLastLoadByExerciseName`
  (sugestão pela última carga real), `getCompletedSessions`/`getSessionLogDetail`
  (histórico). 15 testes.
- **Retomada**: `src/services/sessionDraftStorage.ts` (rascunho por usuário no
  AsyncStorage) + `src/store/activeSessionStore.ts` (Zustand). Fecha o app no meio
  e reabre → séries feitas sobrevivem (rascunho local ou reconstrução pelo
  session_log em aberto). 12 testes.
- **UI**: `components/session/SetRow.tsx` (iniciar série, stepper de carga pelo
  incremento, reps, RIR opcional, concluir → outcome), `RestTimer.tsx` (descanso
  por rest_seconds), `screens/ActiveSessionScreen.tsx`. Bodyweight sem kg;
  1ª carga sem histórico pede ao aluno. E2E de tela dirige a sessão inteira.
- **Histórico**: `SessionHistoryScreen` + `SessionHistoryDetailScreen` (reps/
  carga/RIR reais por exercício), ligados no Perfil.
- **Navegação tipada**: MainNavigator com 3 stacks (Home/Training/Profile),
  `ActiveSession` registrada na Home e no Training; entradas "Iniciar/Retomar
  treino" (WorkoutDetail + Training) e "Histórico de treinos" (Perfil).
- **4 FIXME(Fase 5) resolvidos**: removidos os `navigation.reset` cross-navigator
  para `'App'`/`'Login'` (`as any`) em QuestionnaireScreen (×2) e
  PostQuestionnaireChat (×2). A transição pós-onboarding/logout é dirigida pelo
  AuthContext (RootNavigator troca de navigator). Guarda de fonte em
  `navigationFix.test.ts` impede o `as any` de voltar.

### Casos de borda cobertos com teste (os pedidos no brief)
Retomar mantém séries feitas · 1ª carga sem histórico pede (não assume) ·
bodyweight sem input de kg · outcome under/on_target/over correto (bordas
inclusive) · **erro do banco ao salvar a série NÃO é engolido como sucesso**
(a série continua não-concluída e o erro aparece).

### Verificação
- `tsc --noEmit`: **0 erros**.
- `jest`: **51 → 108** (16 suites, 100% verde).
- **Backend NÃO foi tocado** (0 arquivos em backend/) → pytest não requerido nesta
  fase; ambiente atual sem módulo pytest, então não rodei (nada mudou lá).
- Fluxo exercitado de ponta a ponta pela tela real (`activeSessionScreen.test.tsx`):
  iniciar → 2 séries com carga (a 2ª já sugere a última) → 1 série bodyweight (kg
  nulo) → concluir treino → "Treino concluído". Dirige store+modelo+componentes
  reais; só a fronteira de rede (Supabase) e o storage são mockados.

### Pendências honestas (NÃO sucesso otimista)
1. **E2E em device/simulador com Supabase real NÃO foi rodado** (sem dispositivo/
   projeto/credenciais neste ambiente) — mesma limitação da Fase 3. A verificação
   foi headless (render real + rede mockada) + tsc + jest.
2. **`getLastLoadByExerciseName` (sugestão cross-sessão) é best-effort**: usa
   embedding aninhado do PostgREST; se a consulta falhar, o início degrada com
   graça (sem semente → pede a carga). Validar contra o banco real quando houver.
3. Depende do **PR #4 mesclado** e das migrations 0001/0002 aplicadas em prod.
   `session_logs`/`set_logs` já existem (0001); esta fase NÃO adiciona migration.
4. Zustand v4.5 adicionado (`package.json`; lock é gitignore no repo).

### Próximo passo
Abrir PR #5 (base `fase-3-persistencia`) e aguardar OK do dono. Merge só com OK
explícito. Depois: Fase 5 (motor de adaptação intra-sessão + decisão do aluno) —
`set_logs.adaptation` já está reservado e fica nulo nesta fase.

---

## ✅ Fase 4.1 — Correções do review adversarial da Fase 4 (17/07/2026, branch fase-4.1-correcoes-review)

Review adversarial do PR #5 (IA externa) achou 12 pontos; **7 HIGH + alguns MÉDIOS
confirmados contra o código vivo**, concentrados em RETOMADA/HISTÓRICO e
idempotência/atomicidade (modos que os testes da Fase 4 mascararam ao mockar o
banco com números limpos). PR empilhado sobre `fase-4-sessao-interativa`, testes-primeiro.

### Corrigido (cada um com teste que reproduz o modo de falha)
1. **numeric como string (F4)**: helper `toNum` no modelo; coerção em `buildDraftFromDetail`
   (target_load_kg, load_increment_kg, target_rm_percent), `getOpenSessionLog` e
   `getSessionLogDetail` (actual_load_kg). Sem isso, retomar dava `"50"+2.5="502.5"` / NaN.
2. **Idempotência do completeSet (F2/F3)**: guarda `status==='done'`; trava de
   reentrância por planned_set; `saveSetLog` virou **UPSERT** (onConflict
   session_log_id,planned_set_id); série é marcada feita ASSIM que o servidor
   confirma e a falha de persistência local é NÃO-fatal (insert confirmado nunca
   re-tentado como falha).
3. **Start/finish atômicos (F5/F6)**: trocados pelas RPCs `start_session` /
   `finish_session`; finish LEVANTA exceção em 0 linhas → sem "concluído" falso.
4. **Retomada reconciliada (F1/F8)**: antes de adotar o rascunho local, confirma no
   servidor se o log ainda está aberto (finalizado → não retoma; servidor off →
   retomada offline). `getOpenSessionLog` agora ordena os set_logs (última carga
   determinística).
5. **Sugestão ≠ medição (F10)**: `activateSet` não pré-preenche a carga; a sugestão
   só vira valor gravado quando o aluno digita ou toca "Usar sugestão".
6. **RIR clamp no núcleo (F12)**: `store.setRir` clampa 0–10 (a UI já clampava).

### Verificação
- `tsc --noEmit`: **0 erros**. `jest`: **108 → 117** (17 suites, 100% verde).
- **Retomada exercitada DE VERDADE** com numeric string: `resumeNumericIntegration.test.ts`
  usa repositório + store + modelo REAIS (só o cliente Supabase mockado), retoma do
  servidor com `actual_load_kg:"50"` e prova que o stepper dá **52.5** (não "502.5"/NaN).

### ⛔ Dependência de banco NOVA e BLOQUEANTE
O app agora chama `start_session`/`finish_session` (RPC) e faz UPSERT com
`onConflict`. **Sem a migration 0003 aplicada** (índices únicos + as 2 RPCs
`SECURITY INVOKER`) o iniciar/concluir/gravar série QUEBRA em runtime. O SQL da
0003 está no "Prompt Supabase" entregue ao dono — precisa ser aplicado ANTES de
exercitar em device/prod. Pré-checks de duplicidade (set_logs e logs abertos) antes
de criar os índices únicos.

### Pendências honestas
1. **E2E device/Supabase real ainda não rodado** (sem ambiente). Verificação headless
   + tsc + jest, agora incluindo o caminho de retomada com string.
2. 0003 + RPCs **precisam ser aplicados** (bloqueia runtime). Confirmar também que as
   policies vivas do 0002 batem com o repo (0002 foi reconstruído de transmissão corrompida).
3. Não avancei para a Fase 5 (era o combinado do prompt).

### Próximo passo
Abrir o PR da Fase 4.1 (base `fase-4-sessao-interativa`), aplicar a 0003 no Supabase,
depois smoke E2E. Merge só com OK do dono.

---

## ✅ Fase 4.2 — 2º review adversarial: BLOCKER + HIGH de gravação/retomada/concorrência (17/07/2026, branch fase-4.2-correcoes-review)

Um 2º review do PR da Fase 4.1 achou 1 BLOCKER e HIGHs reais. PR empilhado sobre
`fase-4.1-correcoes-review`, **testes-primeiro** (cada teste reproduz o modo de falha
ANTES da correção — confirmei: 12 novos testes falhando no código velho, verdes depois).

### Corrigido (fonte da verdade = servidor; nada de sucesso otimista)
1. **BLOCKER F1 — `.upsert(onConflict)` dá 42P10**: o índice único é PARCIAL
   (`WHERE planned_set_id IS NOT NULL`) e o `.upsert` do supabase-js gera `ON CONFLICT`
   SEM predicado → o Postgres não infere índice parcial → **toda** gravação de série
   quebrava em runtime. Correção: RPC `save_set_log` (0004) com `ON CONFLICT (...) WHERE
   planned_set_id IS NOT NULL DO UPDATE ... completed_at=now()`. App passou a chamar
   `rpc('save_set_log')`.
2. **F2/F6 — escrita em log finalizado/alheio**: `save_set_log` faz `SELECT ... FOR
   UPDATE` no log e RECUSA se `finished_at` não-nulo ou não é do `auth.uid()`. O lock
   SERIALIZA contra `finish_session` concorrente (fecha o TOCTOU).
3. **F3/F6 — retomada servidor-autoritativa**: `startOrResume` reconstrói do SERVIDOR
   quando há log aberto (mesmo id ou não) — nunca adota o rascunho local cru (série
   "feita" que nunca persistiu, ou carga obsoleta, não sobrevive). try/catch ESTREITO
   só na chamada remota: erro com `.code` (SQL/permissão) → `error`; sem `.code` (rede)
   → retomada offline. Falha de `clearDraft` NÃO ressuscita draft provado finalizado.
4. **F4 — `finish_session` idempotente**: se já estava finalizada (dela) → sucesso; só
   inexistente/alheia levanta. O cliente não fica preso em erro ao concluir 2x.
5. **F7 — compare-and-set**: `completeSet`/`finishSession` fixam `sid` antes do await e
   abortam a escrita no store se a sessão mudou; `clearDraft` só se o draft atual ainda
   é esta sessão (não por userId cego).
6. **F8 — `loadDraft` coage numéricos**: `coerceDraftNumerics` (actualLoadKg,
   targetLoadKg, loadIncrementKg, mapa lastLoadByExercise…). "40" legado não vira
   "402.5"/NaN no stepper.
7. **F9 — trava de reentrância**: chave `${sessionLogId}:${plannedSetId}` + `withTimeout`
   na RPC → o `finally` sempre libera a série (não trava para sempre se a rede pendurar).

### Verificação
- `tsc --noEmit`: **0 erros**. `jest`: **117 → 130** (19 suites, 100% verde).
- **Gravação exercitada DE VERDADE** (`saveWriteIntegration.test.ts`): store+repo+modelo
  REAIS, só o cliente Supabase mockado, RPC devolvendo numeric como STRING → série
  gravada via `rpc('save_set_log')` e a próxima série sugere a carga como NÚMERO.
- **Troca-de-sessão exercitada**: CAS com promessa controlada (deferred) — completar/
  concluir a sessão A durante o await não escreve na sessão B.
- **Retomada com numeric string** continua provada (`resumeNumericIntegration`, 52.5).

### ⛔ Dependência de banco NOVA e BLOQUEANTE
Migration **0004** (`save_set_log` + `finish_session` idempotente) tem de ser aplicada
ANTES de exercitar em device/prod — sem ela, gravar série toma 42P10 (o BLOCKER) e
concluir 2x prende o cliente. Pré-checks de duplicidade + PROVA transacional (rollback)
no rodapé do SQL: idempotência do save, idempotência do finish, recusa de log
finalizado e de log alheio.

### Pendências honestas (NÃO sucesso otimista)
1. **E2E device/Supabase real ainda não rodado** (sem ambiente): verificação headless
   (store/repo/modelo reais + rede mockada com numeric-string) + tsc + jest.
2. **0004 precisa ser aplicada** (bloqueia runtime); rodar a PROVA do rodapé em HML.
3. Endurecimento RLS relacional (série só do planned_set da MESMA sessão do log) fica
   como bloco OPCIONAL comentado na 0004 — é mudança de política de segurança, decisão
   do dono (fora do escopo deste fix).
4. Não avancei para a Fase 5 (combinado do prompt).

### Próximo passo
Abrir o PR da Fase 4.2 (base `fase-4.1-correcoes-review`), aplicar a 0004 + rodar a
prova em HML, smoke E2E. Merge só com OK do dono.

## Fase 5 — Motor de adaptação intra-sessão por regras + decisão do aluno

Branch `fase-5-motor-intra-sessao` (base = `main`, já com as Fases 4/4.1/4.2 mescladas).
Ao concluir uma série FORA do alvo, o app calcula um ajuste por regras e o aluno decide;
nada é aplicado sem confirmação.

### Entregas
1. **Motor puro** (`src/engine/intraSessionAdaptation.ts`): `evaluateSet` (desvio vs. faixa),
   `recommendByRules` (déficit/superávit → ~3%/rep, teto 12%, piso 5%, arredonda ao
   incremento; RIR baixo em superávit não sobe; sem carga conhecida = manter, não inventa)
   e `applyAdjustmentToNextSet` (aplica ao alvo da próxima série; última série só registra).
2. **Guardrails** (`src/engine/guardrails.ts`): lesão nunca sobe carga; peso corporal mexe
   reps, não carga. `injury_flags` agora é threadado planned_exercises → SessionDetail →
   `DraftExercise.hasInjury` (o guardrail funciona de verdade).
3. **Config** (`src/engine/config.ts`, `ADAPT_CONFIG`): TODOS os números centralizados e
   marcados "PADRÃO A VALIDAR por profissional" — a tabela §4.2 exata do dono não está no
   repo; usei a essência do plano.
4. **UI** (`src/components/session/AdaptationSheet.tsx`): bottom sheet pós-série, recomendada
   destacada, "manter" sempre presente (recusa). Optei por Modal do RN em vez de
   @gorhom/bottom-sheet (sem dep nativa nova, testável) — troca é refino.
5. **Wiring** (store): `completeSet` fora do alvo levanta `pendingAdaptation` (só quando há
   ajuste concreto — guardrail/piso/RIR que dão "manter" não geram sheet); `resolveAdaptation`
   aplica à próxima série, registra na série concluída e grava best-effort em
   `set_logs.adaptation` (UPDATE direto — RLS "own set logs" for all). **Sem migration nova.**

### Verificação
- `tsc --noEmit`: **0 erros**. `jest`: **155 → 166** (22 suites, 100% verde). Sem open handles.
- 20 testes de motor (tabela + bordas §9: 1ª sessão sem histórico, RIR baixo à falha, lesão,
  peso corporal, teto, arredondamento) + 3 de fluxo do store (levanta/aplica/recusa +
  supressão por lesão) + 3 de render do sheet.

### Pendências honestas (NÃO sucesso otimista)
1. **E2E device/Supabase real não rodado** (sem ambiente): só verificação headless.
2. **Números do `ADAPT_CONFIG` precisam da validação do dono** (ou da spec §4.2) antes de
   produção — são padrões plausíveis, não a tabela oficial.
3. Sheet é Modal (não gesto/arrasto); trocar por @gorhom/bottom-sheet é refino opcional.
4. Redistribuição entre sessões (a "anotação p/ próxima sessão" da última série) é só
   registrada agora; aplicá-la é a Fase 6 (replanejamento).

### Próximo passo
Abrir o PR da Fase 5 (base `main`). Merge só com OK do dono. Depois: Fase 6 (replanejamento
semanal por regras).

---

## ✅ Fase 6 — Replanejamento semanal por regras (18/07/2026, branch fase-6-replanejamento-semanal)

Faltou ao treino ou tem menos tempo hoje → a semana se reorganiza, SEMPRE com
confirmação do aluno; recusa mantém o plano original (proposta é só overlay em
memória — nada é escrito sem o toque em "Aplicar").

### Decisão do dono (confirmada nesta sessão)
Preservar o original **SEM migration nova**: o evento de replanejamento (status
originais, IDs das séries inseridas, perdas aceitas, corte de tempo) é gravado em
`session_logs.adherence_snapshot` — coluna jsonb JÁ reservada para a Fase 6 na
migration 0001 (`available_minutes` idem). A aplicação é só ADITIVA (insere
séries + marca 'skipped'); reverter = apagar as séries de `addedSets` + restaurar
os status do snapshot. **Nenhuma migration nesta fase; nada a aplicar em HML/prod.**

### O que foi feito (testes-primeiro)
- **Motor puro** `src/engine/weeklyReplanner.ts`: `computeAdherence` (sessões e
  volume; taxa NULA sem base — nada inventado), `planTimeCut` (escadas
  ~100%/66%/45% por prioridade da Fase 3; sem estimated_minutes → não propõe),
  `planMissedRedistribution` (teto +25%/grupo na receptora sobre as séries
  ORIGINAIS; recuperação = não empilhar grupo em dias consecutivos; faltas
  múltiplas NÃO empilham — replans anteriores contam no teto; deload não compensa
  nem recebe; o que não coube é PERDA registrada), `replanByRules` (orquestra),
  helpers de overlay (`applyTimeCutToDraft`, `appendAddedSetsToDraft`) e do
  snapshot (`parseReplanSnapshot` defensivo, `addedSetIdsFromSnapshots`,
  `lastTimeCutForSession`).
- **`REPLAN_CONFIG`** em `src/engine/config.ts` — TODOS os números marcados
  "PADRÃO A VALIDAR": escadas fullMinRatio 0.85 / secondaryMinRatio 0.55,
  teto 0.25, recuperação 1 dia, tokens de deload ['deload','descarga'].
- **Repositório** `src/services/weeklyReplanRepository.ts`: contexto da semana
  (séries de replans anteriores marcadas; executado por sessão) e
  `applyConfirmedReplan` com ordem deliberada: INSERT (copia alvo da última série
  original) → snapshot MERGE → skip. Snapshot falhou → rollback das inseridas +
  erro propaga; skip falhou → snapshot já impede empilhar. Skip restrito a
  user_id + status 'pending'.
- **Store/UI**: `computeReplan` ao ABRIR a sessão (best-effort — sem rede o treino
  segue sem banner), toggle "menos tempo hoje" (input de minutos → recalcula a
  proposta), `ReplanBanner` (faltas, adições, perdas registradas, corte; Aplicar/
  Manter plano original), recusa não volta pelo recálculo, retomada reaplica corte
  confirmado do servidor (getOpenSessionLog agora traz available_minutes +
  adherence_snapshot). Exercício cortado sai do caminho (séries feitas ficam;
  pendentes não seguram o "Concluir treino").

### Verificação
- `npx tsc --noEmit`: **0 erros**. `npx jest --runInBand`: **172 → 216** (27
  suítes, 100% verde). `python3 -m pytest backend/tests -q`: **67 verdes**
  (backend NÃO tocado — 0 arquivos em backend/).
- Fluxo exercitado DE VERDADE pela tela real (`replanScreenFlow.test.tsx`): abrir
  → banner da falta → recusar (nada escrito) → 40 min → corte proposto → aplicar
  → repositório chamado e acessório cortado na tela. Store+motor+telas reais; só
  a fronteira de rede mockada. + `replanFlow.test.ts` (7 casos de store, incluindo
  falha na aplicação sem sucesso otimista e proposta órfã de outra sessão).

### Pendências honestas (NÃO sucesso otimista)
1. **E2E device/Supabase real não rodado** (mesma limitação das fases anteriores):
   verificação headless + tsc + jest. Ao testar em device, conferir o UPDATE de
   `adherence_snapshot`/`available_minutes` e o INSERT em planned_sets sob RLS real.
2. **Números do REPLAN_CONFIG precisam de validação profissional** (escadas, teto
   de +25%, 1 dia de recuperação) — são a essência do plano, não tabela oficial.
3. **Detecção de deload é por TEXTO** (session_type/título): o enum de volume
   semanal que a IA declara ("Deload") NÃO é persistido no modelo — se o plano só
   marcar deload no nível da semana, a Fase 6 não o vê. Persistir isso exigiria
   migration (fica registrado, não feito).
4. Aplicação não é transacional (PostgREST, 3 escritas): a ordem escolhida
   (insert → snapshot → skip) garante que falha parcial nunca EMPILHA volume, mas
   pode deixar sessão perdida ainda 'pending' com séries já adicionadas (a
   reproposta seguinte respeita o teto). RPC transacional seria refino com migration.
5. Sem tela de "reverter replanejamento": o snapshot preserva os dados para
   reverter/auditar; a UI de rollback não fazia parte da fase.

### Próximo passo
Abrir o PR da Fase 6 (base main) e aguardar OK do dono — merge SÓ com OK
explícito. Depois: Fase 7 (camada de IA das adaptações, endpoint /api/adapt).

### Fase 6.1 — correções do review do dono (18/07/2026, mesmos branch/PR #9)
Dois bloqueadores apontados pelo dono, **ambos confirmados no código vivo** e
corrigidos testes-primeiro (5 testes RED reproduzindo as falhas → verdes):
1. **Corte × redistribuição no mesmo replan**: a proposta combinada inseria
   séries num exercício que o próprio replan cortava. Fix: `replanByRules`
   calcula o corte primeiro e passa `excludedReceiverExerciseIds` à
   redistribuição — cortado não recebe nem conta na base do teto; o volume vai
   a outra sessão apta ou vira perda registrada.
2. **Idempotência da aplicação**: (a) guarda síncrona de reentrância em
   `confirmReplan` (confirmações concorrentes → 1 chamada ao repositório);
   (b) `ReplanApplyError` tipado por estágio — insert/snapshot falham sem nada
   aplicado (proposta fica para retry); skip falho sai com `replanApplied=true`
   + `addedSets`: o store reflete o que persistiu, DESCARTA a proposta obsoleta
   e recalcula do servidor (adds já no snapshot → nova proposta sem additions,
   só o skip pendente) — retry nunca re-insere.
Verificação: tsc 0 · jest 27 suítes/221 · pytest 67. **Pendência registrada
(decisão do dono)**: índice único em `planned_sets(exercise_id, set_order)`
como backstop de banco contra duplicação cross-device exigiria migration 0007
(HML primeiro) — não feito nesta fase.

### Fase 6.2 — backstop cross-device (18/07/2026, mesmos branch/PR #9)
O dono autorizou o backstop. Duas peças, testes-primeiro:
1. **Migration `0007_planned_sets_unicidade.sql`**: índice único
   `planned_sets_exercise_set_order_key` em `(exercise_id, set_order)`, com
   pré-checagem que ABORTA listando duplicatas pré-existentes (nunca apaga dado
   às cegas) e asserção de catálogo ao final. Dois aparelhos confirmando o mesmo
   replan geram os MESMOS set_order (`max+i`); o segundo INSERT falha com 23505
   — e o bulk insert do PostgREST é um statement só, então falha inteiro.
2. **Classificação do conflito no store**: `23505` no estágio `insert` =
   "outro aparelho aplicou primeiro". Nada desta tentativa persistiu (rascunho
   intacto, sem corte nem séries), mas a proposta está OBSOLETA — reaplicá-la
   falharia para sempre. O store a descarta, avisa ("Replanejamento já aplicado
   em outro aparelho") e recalcula do servidor pelo mesmo caminho do skip-falho:
   a falta já resolvida não é re-proposta e o retry nunca re-insere.

**Prova em Postgres LOCAL descartável (16.14, homebrew)** — HML segue pendente
(sem credencial da conta Marconato neste ambiente): cadeia 0000→0007 aplicada
limpa sobre stub mínimo do schema auth; PROVA 1 duplicata → 23505 e contagem
intacta; PROVA 2 insert legítimo (max+1) passa; PROVA 3 re-execução idempotente,
pré-checagem aborta com a lista do ofensor e aplica após limpeza.

Verificação: tsc 0 · jest 27 suítes/223 (221→223) · pytest 67. **Pendências:
(a) aplicar a 0007 em HML (`forcaapp-hml`) e rodar a PROVA do rodapé — bloqueado
na credencial; (b) prod continua GATED; (c) revogar os 2 PATs expostos (dono).**

## Alinhamento DB × app + reconciliação de ambiente (18/07/2026, PR de alinhamento)

**Decisão do dono registrada:** o Supabase do Força é UM só — `forcaapp-hml`
(ref `zanqygwsgxkyjiuhrzju`, conta pedrohmarconato@gmail.com). NÃO existe
produção separada com tabelas legadas `fato_*`/`dim_*` (verificado: 0 resultados
em todos os schemas). Detalhes e autenticação: `AGENTS.md` +
`docs/AMBIENTE_SUPABASE.md`. As "pendências de prod GATED" de fases anteriores
ficam SEM OBJETO.

Revisão adversarial das mudanças de alinhamento (migration 0008 + env fix +
docs), com cada achado confirmado no código vivo e corrigido:

- **H1 (histórico de migrations)**: 0007/0008 aplicadas via SQL direto SEM
  registro remoto (migration list com Remote vazio) → `supabase migration
  repair --status applied 0007 0008`; a 0009 entrou por `db push`, provando o
  fluxo restaurado. `migration list`: 0000→0009 local = remote.
- **H2 (docs)**: AGENTS.md afirmava "0000→0007 registradas" (falso à época) —
  corrigido para o estado real + regra "migration só via db push/repair".
- **M1 (re-submissão do questionário)**: o 409 da PK era engolido e as
  respostas novas DESCARTADAS no banco. `saveQuestionnaireDataAPI` saiu da tela
  para `services/api/questionnaireService.ts` usando o cliente supabase
  compartilhado com **UPSERT** (`onConflict: usuario_id`) — re-fazer o
  questionário atualiza a linha. 5 testes novos (upsert íntegro 13/13 campos,
  TOKEN_EXPIRED, 23505 residual, RLS 42501, rede ≠ sucesso). Aprendizado: o
  babel-preset-expo INLINA `process.env.EXPO_PUBLIC_*` no transform — serviço
  testável não lê env direto; usa o cliente compartilhado (mockável).
- **M2 (updated_at estático)**: migration `0009_questionario_updated_at.sql`
  (trigger `set_updated_at`). PROVA transacional no HML (rollback via RAISE):
  upsert atualizou e o trigger sobrescreveu updated_at forjado com now().
- **M3 (resíduos do @env)**: removidos plugin `react-native-dotenv` do babel,
  `moduleNameMapper ^@env$` do jest, `mocks/envMock.js` e a dependência.
- **NITs registrados**: grants remotos com 7 privilégios são default de
  plataforma em TODAS as tabelas (RLS cobre a API; sem ação); sem policy DELETE
  no questionário de propósito; `supabase/config.toml` do init commitado
  (major_version 17 = remoto).

**Aprovadas sem mudança**: env fix do `supabaseClient.js` (todos os testes que
importam o módulo o mockam; `storageReady` intacto; inline do babel-preset-expo
vale para .js e .tsx) e o flag offline (`=== 'true'`, chave computada).

Verificação: tsc 0 · jest 28 suítes/228 (223→228) · pytest 67.

---

## Direção 03 — Remodelação UX/CX "Força em movimento" (24/07/2026)

**Fase 0 (protótipo) CONCLUÍDA.** Plano aprovado pelo dono em `~/.claude/plans/quero-remodelar-o-ux-snuggly-floyd.md`.

- Entregável: `forca-app-mockup-v3.html` (raiz do repo) — protótipo navegável com 13 telas interativas,
  modo "Percorrer a jornada", inspector com notas de implementação (mapa p/ Reanimated) por tela.
  Deep-link por hash: `#hoje`, `#player-resting`, etc. Abrir via `file://` ou `python3 -m http.server`.
- Decisões do dono: protótipo antes de código; 4 abas (Hoje·Plano·Progresso·Perfil); tom sóbrio
  premium (sem confete/badge); onboarding incluído (stepper 1-pergunta-por-tela + construção do plano
  transparente + revelação).
- Verificado: render headless das 14 capturas (scratchpad da sessão) + passeio interativo no Chrome
  (jornada completa clicada: login→anamnese→ajustes→construção→revelação→hoje→check-in "cansado"→
  proposta do treinador→player→série→anel de descanso ±30s→resumo com count-up/recorde→progresso→plano).
  GIF da jornada em ~/Downloads/forca-direcao03-jornada.gif. Zero erros de console.
- Bugs corrigidos na auto-revisão: `[hidden]` vencido por display de classe (cartão do treinador vazava
  no check-in; tabbar idem), linha-base do gráfico, alvo de reps estático no player, lixo de JS no count-up.
- Próximo: aprovação da direção pelo dono → Fases 1–5 de implementação no app (fundações de motion →
  onboarding → sessão/resumo → aba Progresso → Hoje/Plano/Perfil), cada uma com testes-primeiro,
  tsc/jest/pytest verdes e capturas em docs/ui.

## Direção 03 — IMPLEMENTAÇÃO das Fases 1–5 (24/07/2026) ✅

Protótipo aprovado pelo dono → 6 commits na branch `feat/direcao03-fase1-fundacoes`
(empilhada em `feat/catalogo-exercicios`, que segue 10 commits à frente de main):

- **Fase 1** (8768cf9): motion tokens "física de treino", usePressPhysics em todos os
  controles, haptics seguro por plataforma, Button tonal, Skeleton, transição de stack.
- **Fase 2** (4c71f8d): anamnese em stepper 1-pergunta-por-tela (payload/validação/storage
  intactos), FModules, chips de sugestão no chat, construção com etapas reais do job,
  revelação como portão do onboarding (updateProfile só no "Começar", com retry).
- **Fase 3** (89dbe21): check-in de foco, anel SVG de descanso ±30s, "Última carga" real,
  keep-awake, SessionSummary com resumo honesto fotografado no Concluir.
- **Fase 4** (8b15b40): 4ª aba Progresso (constância, volume/semana, recordes, histórico
  migrado do Perfil), getSetLogsResumo paginado, motor puro progressStats.
- **Fase 5** (4772902): momentum real na Home (semanasConstantes) + Começar direto na
  sessão, visão de ciclo no Plano (getPlanSessions, Semana N de M real), cartões
  "Proposta do treinador" no ReplanBanner/AdaptationSheet.
- Fix pós-revisão (HEAD): voltar no stepper cancela avanço automático pendente.

**Estado final: jest 496/496 · pytest 305 · tsc 0 erros · expo export web ok.**
Testes novos: 45 (fase1 12 · fase2 7+reescritas · fase3 8 · fase4 8 · fase5 7 · ajustes).

Pendências conscientes (não são regressão):
1. Validação visual/interativa no HML (staging → deploy auto) com usuário de teste —
   pede push da branch, decisão do dono (PR também).
2. Perfil: "Refazer questionário"/editar preferências exigem decisão de produto
   (flip de onboarding_completed tranca o usuário até regenerar) — fora desta leva.
3. Recordes ainda não aparecem no SessionSummary (só na aba Progresso) — candidato
   a follow-up curto reusando progressStats.

## Direção 03 — push, PRs e homologação (24/07/2026) ✅ · runbook de produção

- **PR #38** `feat/catalogo-exercicios` → `main` (catálogo + cardio; migrations 0013/0014).
- **PR #39** `feat/direcao03-fase1-fundacoes` → `#38` (stacked; Direção 03 Fases 1–5, zero schema).
- **HML validado de ponta a ponta** (staging em 40d98f0; PWA preview `forca-1dgwgaaff`):
  signup descartável → questionário (payload do app) → job Haiku (etapas reais
  gerando_molde→salvando→salvo) → plano de 12 semanas com planned_sessions →
  **portão da revelação confirmado** (onboarding_completed=false até o "Começar";
  PATCH do app fecha com current_plan_id). Usuário de teste:
  pedrohmarconato+e2e-d03-1784906277572@gmail.com (dados descartáveis).
- Bundle do preview auditado: aponta Supabase staging + forca-api-hml (verify-web-bundle).

### Runbook GO-PROD (ordem importa)

1. **Merge #38** em `main` (GitHub) → #39 re-alveja `main` sozinho → **merge #39**.
2. **Migrations no prod** (forcaapp-hml / zanqygwsgxkyjiuhrzju), ANTES do backend:
   `export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase_pat)" && supabase link --project-ref zanqygwsgxkyjiuhrzju && supabase db push`
   (aplica 0013/0014 registradas; conferir o ref antes — AGENTS.md).
   Depois, backfill do catálogo em planos vivos: `scripts/backfill_catalogo_exercicios.py`
   (dry-run primeiro; `--apply` com service_role).
3. **Backend VPS prod**: runbook `docs/DEPLOY_VPS.md` em `/docker/forcaapp`
   (⚠️ o container prod ainda roda build antigo — este rollout já estava pendente).
4. **PWA prod**: `npx vercel deploy --prod` (envs Production do painel; verify-web-bundle
   trava host de LAN e exige forca-api.cadastrai.com).
5. Smoke de prod: /api/health 200 + login real + 1 sessão aberta (sem gerar plano à toa).

Sem CI de GitHub no repo — o portão de qualidade é a suíte local (496/496 + 305 + tsc 0),
verde no HEAD dos dois PRs.

## Direção 03 em PRODUÇÃO — virada executada (24/07/2026) ✅

Runbook GO-PROD acima executado na íntegra. Nenhum passo pulado; nenhum plano
gerado em produção (o smoke é infra-level, por decisão de custo — Opus).

### 1. Portão de qualidade (HEAD do #39 = `29dad48`, working tree limpo)

- `npx tsc --noEmit` → exit **0**.
- `npx jest --runInBand` → **496/496** (56 suites, 33,1 s).
- `python3 -m pytest backend/tests -q` → **305 passed**.
- Série verificada por `merge-base`: `main c94d477` → #38 `bb10e48` (10 commits)
  → #39 `29dad48` (8 commits). Sem commit inesperado.

### 2. Merges (merge commit, série preservada)

- **#38** mesclado 17:28:09Z → merge commit **`e6ed3c8`**.
- **#39 NÃO re-alvejou sozinho**: o GitHub só re-alveja quando a branch-base é
  apagada, e o merge do #38 preservou `feat/catalogo-exercicios`. Corrigido com
  `gh pr edit 39 --base main` (voltou a `MERGEABLE/CLEAN`, 8 commits).
- **#39** mesclado 17:28:33Z → merge commit **`a48ce9e`**.
- `origin/main` = **`a48ce9e`**, contendo `bb10e48` e `29dad48` (ambos conferidos
  com `git merge-base --is-ancestor`).

### 3. Migrations em produção (forcaapp-hml / `zanqygwsgxkyjiuhrzju`)

- Ref conferido antes e depois do push (`supabase/.temp/project-ref`).
- **Antes**: 0000→0012 local=remote, só 0013/0014 pendentes — **sem drift**,
  nenhuma migration extra. (O `AGENTS.md` ainda dizia 0000→0009; estava
  desatualizado — 0010/0011/0012 já haviam entrado.)
- `supabase db push` aplicou **0013** e **0014**. DDL revisada antes: aditiva
  (colunas novas, `drop not null`, funções recriadas) — sem `drop table`/`delete`.
- **Depois**: `supabase migration list` → local = remote nas 15 (0000→0014).
- O aviso de Docker ao fim do push é só o cache local do catálogo pg-delta
  (Docker Desktop parado); não afeta o que foi aplicado.

### 4. Backfill do catálogo em planos vivos de prod

- A service_role **não** está no `/docker/forcaapp/.env` da VPS (só `SUPABASE_ANON_KEY`);
  obtida via `supabase projects api-keys` com o PAT, sem nunca ser impressa.
- **Dry-run**: 300 exercícios lidos · 0 já com chave · 294 a atualizar ·
  6 fora do catálogo · 70 séries de cardio/isometria a converter.
- **`--apply`**: 294/294 exercícios canonizados (nome, `exercise_key`,
  `muscle_group`, `equipment`, `metric`, `load_increment_kg`) e 70/70 séries de
  prancha convertidas de reps para duração (frontal 40s, lateral 30s).
- **Reverificação (2º dry-run)**: 294 já com chave · **0 a atualizar** — idempotente.
- Preservados fora do catálogo, intactos: `Crucifixo invertido com halteres`,
  `Pull-over com halter`.

### 5. Backend na VPS (`/docker/forcaapp`)

- **Antes do build**, comparação disco × container (runbook): marcador do molde 2=2
  e hash agregado de todo o Python **idêntico** (37 arquivos, `4bc7d9ba…`) — o
  container rodava `c94d477`, não um build antigo. Sem risco de regressão.
- Rollback criado: imagem `forcaapp-backend:rollback-20260724` +
  `/root/forcaapp-backup-20260724.tgz` (1,2 MB).
- `git merge --ff-only origin/main` → clone da VPS em **`a48ce9e`**; nenhum
  arquivo tracked modificado (só os untracked esperados: `docker-compose.yml` e
  `docker-compose.override.yml`).
- **Trava de loopback conferida antes de subir**: o `docker-compose.yml` que o
  Compose usa publica `5001:5001` (0.0.0.0), mas o override `ports: !override`
  resolve para `host_ip: 127.0.0.1` — confirmado em `docker compose config` e no
  `docker ps` (`127.0.0.1:5001->5001/tcp`). Nada exposto à internet.
- `docker compose build backend && docker compose up -d backend`.
- **Depois**: disco e container batem no novo hash (**40 arquivos, `55ff695b…`**),
  com `exercise_catalog.py`/`plan_mapper.py` na imagem e
  `FORCA_USE_MOLDE_ARCHITECTURE=true`.
- `https://forca-api.cadastrai.com/api/health` → **200 `{"status":"ok"}`**; boot
  limpo (só os dois avisos conhecidos: `.env` não copiado para a imagem — vem por
  `env_file` — e rate limit em memória).

### 6. PWA em produção (Vercel)

- `npx vercel deploy --prod` → **`dpl_2My6P3Lb3LbwvEJJXpcvpohjheSU`**, target
  production, READY; aliases `forca-app-six.vercel.app` e
  `forca-app-pmarconatos-projects.vercel.app`. Build 51 s.
- `verify-web-bundle` passou no build: "bundle (production) aponta para
  forca-api.cadastrai.com, sem endereços de LAN".
- **Auditoria independente do bundle publicado** (`AppEntry-dbf6c7f5….js`,
  3.014.623 bytes, baixado do domínio público): contém
  `https://zanqygwsgxkyjiuhrzju.supabase.co` e `https://forca-api.cadastrai.com`;
  **0** ocorrências de `mjdjtiujhwklchalquhc` (staging), `forca-api-hml` e de
  IPs de LAN.

### 7. Smoke de produção (infra-level, sem gerar plano nem criar dado)

- API `/api/health` → **200** em 0,63 s.
- PWA: `/` → 200 com CSP nos headers · `/login` → 200 (rewrite SPA) ·
  `/manifest.json` → 200.
- Tela de login renderiza correta (aba "Login", card completo) e o console traz
  **11 mensagens, todas `[LOG]`, zero erros/exceções**: `INITIAL_SESSION` sem
  usuário → `[RootNavigator] Direcionando para Auth`.

### Pendências honestas

1. **Login real e primeira sessão em produção são do dono** — não executados aqui
   de propósito (geração de plano roda no Opus e custa; smoke ficou infra-level).
2. ~~`AGENTS.md` desatualizado na seção de migrations.~~ **Resolvido em
   25/07/2026** no PR 1 do plano manual.
3. Follow-ups anteriores seguem abertos: recordes no `SessionSummary`, decisão de
   produto sobre "Refazer questionário", rate limit em memória no backend
   (contadores zeram a cada restart e não são compartilhados entre workers).

---

## 25/07/2026 — Plano manual, PR 1 (correções de base)

Branch local: `fix/plano-base-dia-progressao`, baseada em `b8c602b`.

### Entregue no código

- `dia_offset` do molde agora chega a `scheduled_date` e `day_of_week`; o mapper
  mantém precedência do `dia_semana` legado e a trava contra data anterior ao
  início do plano.
- Sessão sem `duracao_minutos` recebe estimativa pelo volume mapeado, distinguindo
  exercícios de carga/repetição dos prescritos por tempo.
- Restrições estruturadas `tipo=lesao` chegam ao mapper e preenchem
  `injury_flags` por chave canônica ou grupo muscular normalizado.
- A migration `0015_progression_rules_na_rpc.sql` restaura a persistência de
  `progression_rules` e repete as asserções cumulativas da 0014.
- `AGENTS.md` deixou de recomendar Jest com `--runInBand`; `modelo-dados.md` foi
  marcado explicitamente como histórico.

### RED → GREEN e portões

- RED dirigido: 7 falhas novas reproduziram dia ignorado, duração nula, lesões
  descartadas, falta da 0015 e ausência das restrições no pipeline.
- `npx tsc --noEmit`: exit 0, 0 erros.
- `npx jest`: exit 0, 59/59 suítes e 522/522 testes.
- `python3 -m pytest backend/tests -q`: exit 0, 315/315 testes; 1 warning já
  conhecido do urllib3/LibreSSL.
- RPC da 0015 comparada com a 0014: somente `progression_rules` foi acrescentado
  à lista de colunas e aos valores de `training_plans`.

### Homologação

- Ref conferido antes do push: `mjdjtiujhwklchalquhc` (`forcaapp-staging`).
- `supabase db push` aplicou e registrou a 0015; `migration list` final mostrou
  local=remote em 0000→0015. O aviso final de Docker afetou somente o cache local
  do catálogo, não a migration nem suas asserções.
- Branch rebaseada sobre `origin/main` (`bcdd4d6`, PR #42), que renomeou o projeto
  de produção para `forcaapp-prod` — o `AGENTS.md` deste PR já usa o nome novo.
- **PR #43** aberto (`fix/plano-base-dia-progressao` → `main`).
- `migration list` reconferido nesta sessão com o PAT do dono: local=remote em
  0000→0015. A RPC viva no staging contém `progression_rules`
  (`pg_get_functiondef` → verdadeiro).
- Backend HML no ar com este commit: clone da VPS em `fe4c482`, container
  `forcaapp-hml-backend-1` recriado pelo timer, `plan_mapper.py` dentro da
  imagem já com `_dia_da_sessao`, `/api/health` 200.

### Smoke E2E em HML (25/07/2026) — plano real gerado e conferido no banco

Usuário descartável `pedrohmarconato+smoke-pr1-1785031679@gmail.com`, plano
`81ec15b5-d5bd-4b76-a354-67abdf368b63` (Haiku, 25 s do POST ao `salvo`):
48 sessões, 228 exercícios.

| Conferência no banco de staging | Resultado |
|---|---|
| `progression_rules` gravado (0015) | 5 regras |
| `day_of_week` preenchido | 48/48 |
| `estimated_minutes` preenchido | 48/48 |
| `scheduled_date` coerente com `day_of_week` (semanas 2+) | 0 divergências |
| Dias distintos respeitando a preferência | segunda, terça, quinta, sexta |
| `injury_flags` nos exercícios afetados | 36 exercícios de Ombros marcados com "Tendinite no manguito rotador direito" |

Duas ressalvas honestas sobre a cobertura deste smoke:

1. O molde declarou `duracao_minutos: 60` em todas as sessões, então o
   `estimated_minutes` gravado veio do molde — **o estimador
   `_estimar_minutos` não foi exercitado E2E**, só nos testes unitários.
2. O plano não sorteou `supino_reto_barra`, então o casamento de lesão por
   **chave de exercício** também ficou só nos testes unitários; o casamento por
   grupo muscular foi provado em produçãozinha (36 exercícios).

### Achado alheio ao PR 1: cardio derruba a geração do plano (afeta produção)

A primeira tentativa do smoke pedia cardio e o job morreu em
`molde_validation`: `Molde inválido: 'repeticoes' is a required property`,
depois das 2 tentativas (`MAX_TENTATIVAS_MOLDE = 2`).

Causa: `backend/schemas/molde_schema.py` exige `repeticoes` em todo exercício
(`required: ["nome", "ordem", "series", "repeticoes"]`, linhas 58 e 209)
enquanto a instrução 7 do prompt do molde — e a descrição de `duracao_minutos`
no próprio schema — mandam **não** usar `repeticoes` em cardio e isometria. O
modelo obedece à instrução e o schema o reprova. O `normalizar_molde` não
preenche o campo. Prova determinística, sem custo de IA:

```python
jsonschema.validate({"nome": "Esteira", "ordem": 1, "series": 1, "duracao_minutos": 20}, <item de exercicios>)
# -> 'repeticoes' is a required property
```

Não é regressão deste PR — vem da leva de cardio (0014/PR #38) — mas está vivo
em produção: qualquer aluno que peça cardio cai em erro de geração.

**Corrigido no PR seguinte** (`fix/molde-cardio-sem-repeticoes`, empilhado sobre
este) — ver seção abaixo.

- O PR 2 começou após o OK do dono em 25/07/2026, preservando o portão entre
  PRs e usando o topo homologado da pilha (#43 + #44) como base.

---

## 25/07/2026 — PR do cardio: `repeticoes` deixa de ser obrigatória

Branch `fix/molde-cardio-sem-repeticoes`, empilhada sobre o PR #43.

### O contrato que o schema passa a expressar

Todo exercício precisa de **pelo menos um** alvo de prescrição: `repeticoes`
(carga × repetição), `duracao_minutos` (cardio e isometria) ou `distancia_km`.
Nos dois pontos do schema (`semanas_tipo` e `semanas_avulsas`), `repeticoes`
saiu do `required` e entrou num `anyOf` com as outras duas. Exercício sem
nenhum alvo continua sendo rejeitado — a validação afrouxou só onde era
contraditória.

### RED → GREEN

- RED: 6 testes novos falham sem a correção (5 de schema + 1 de pipeline).
  Conferido com `git stash` do schema: os mesmos 6 vermelhos, 29 verdes.
- O teste de pipeline roda o caminho inteiro (resposta do modelo → validação →
  normalização → expansão → mapeamento) e confere o payload que iria ao banco:
  cardio com `metric=tempo_distancia`, `reps_raw` nulo,
  `target_duration_seconds=1200` e alvos de repetição nulos. Uma única chamada
  ao modelo — nenhuma geração extra paga.
- Trava de regressão: `test_repeticoes_nao_e_exigida_incondicionalmente_em_lugar_nenhum`
  varre o schema inteiro e falha se `repeticoes` voltar a um `required` fora de
  um `anyOf`/`oneOf`.
- `python3 -m pytest backend/tests -q`: 323/323. `npx tsc --noEmit`: 0 erros.

Nota sobre a cobertura anterior: os testes de cardio já existentes
(`test_cardio_prescricao.py`) sempre passavam a duração dentro de `repeticoes`
("20min"), justamente o que a instrução 7 proíbe — por isso a suíte estava
verde com o defeito vivo.

### Smoke E2E em HML — o mesmo pedido que falhava agora passa

Backend de homologação em `6ec7250` (container recriado pelo timer, schema com
`anyOf` dentro da imagem). Mesmo questionário da tentativa que morreu de manhã,
com `incluirCardio: "sim"`: plano `de64fbee-cead-4191-a4ff-038a72d53772`
gerado e salvo em 26 s, usuário `pedrohmarconato+smoke-cardio-1785032280@gmail.com`.

| Conferência no banco de staging | Resultado |
|---|---|
| Plano com cardio gerado sem `molde_validation` | 48 sessões, 120 exercícios |
| Exercícios medidos por tempo/distância | 24 (Corrida, Bicicleta Ergométrica) |
| Séries de cardio com duração/distância | 24/24 |
| Séries de cardio que viraram repetição | 0 |
| Cardio com %RM | 0 |

Estado das branches ao fim do dia: `#43` (correções de base) e `#44` (cardio,
empilhado no #43) abertos, ambos homologados em HML; produção segue em
`0000→0014` e no build antigo, aguardando revisão do dono.

---

## 25/07/2026 — Plano manual, PR 2: catálogo de exercícios na API

Branch `feat/catalogo-exercicios-api`, empilhada sobre o PR #44.

### Entregue no código

- `catalogo_serializavel()` expõe os 106 exercícios canônicos com versão 2 e
  somente os sete campos consumidos pelo app; aliases continuam privados ao
  resolvedor do backend.
- `GET /api/exercise-catalog` exige JWT, devolve ETag forte derivado da versão +
  hash do arquivo e `Cache-Control: private, max-age=86400`; `If-None-Match`
  válido recebe 304 sem corpo. A rota não consome o rate limit da IA.
- `exerciseCatalogService.ts` mantém cache AsyncStorage em
  `@exercise_catalog_v<versao>`, guarda metadado/ETag e revalida em background.
  Sem rede usa o último cache válido; sem rede e sem cache levanta
  `ExerciseCatalogUnavailableError`, nunca retorna `[]` como falso "sem
  resultados".
- `searchCatalog` espelha a normalização do backend (sem acento, minúsculas),
  filtra grupo/equipamento e respeita as opções de Cardio/Mobilidade sem mutar a
  lista original.

### RED → GREEN e portões locais

- RED backend: `catalogo_serializavel` ausente e rota 404; 2 falhas, 60 testes
  adjacentes verdes.
- RED app: módulo `exerciseCatalogService` ausente.
- `npx tsc --noEmit`: exit 0, 0 erros.
- `npx jest`: exit 0, 60/60 suítes e 528/528 testes.
- `python3 -m pytest backend/tests -q`: exit 0, 325/325 testes; 1 warning já
  conhecido do urllib3/LibreSSL.
- Nenhuma migration pertence a este PR.

### Homologação HML

- **PR #45** aberto em draft, empilhado sobre o #44
  (`feat/catalogo-exercicios-api` → `fix/molde-cardio-sem-repeticoes`).
- `git push origin feat/catalogo-exercicios-api:staging` publicou `328681f`; o
  timer da VPS recriou o backend. Durante o deploy a rota passou de 404 (imagem
  antiga) para 401 sem token, enquanto `/api/health` permaneceu 200.
- Smoke autenticado com usuário descartável no Supabase staging:

| Conferência | Resultado |
|---|---|
| JWT exigido | sem token → 401; com token → 200 |
| Versão e tamanho | versão 2, 106 exercícios |
| Chaves | 106 únicas |
| Aliases no payload | 0 |
| Métricas fora do enum | 0 |
| Cache | `private, max-age=86400` |
| ETag | presente |
| Revalidação | `If-None-Match` → 304 sem corpo |

- PWA Preview: deploy `dpl_9UTqMxhdu1M1f8JM5WMPCksxDb5J`, estado READY em
  `https://forca-lyhm60eyw-pmarconatos-projects.vercel.app` (raiz HTTP 200).
  `verify-web-bundle` passou: bundle Preview aponta para
  `forca-api-hml.cadastrai.com` e não contém endereços de LAN.
- O serviço do catálogo ainda não tem tela consumidora por desenho — a UI entra
  no PR 4. Por isso a homologação deste PR validou o contrato HTTP real e o
  cache/busca nos testes, sem inventar um fluxo visual inexistente.

---

## 26/07/2026 — Plano manual, PR 3: pipeline determinístico no backend

Branch `feat/plano-manual-backend`, empilhada sobre o PR #45. Draft PR #46.

### Entregue no código

- `PLANO_MANUAL_SCHEMA` formaliza o rascunho do editor (1–52 semanas, até 7
  treinos e 30 exercícios por treino), mantendo opcionais explícitos como
  `dia_offset`, duração, distância e `%RM` anuláveis.
- O campo opcional `metrica` fecha o contrato do seletor para nomes livres:
  `carga_reps`, `tempo` ou `tempo_distancia`. Ele só vence quando o exercício
  não casa com o catálogo; em item catalogado, a métrica canônica continua
  autoritativa. O expansor também respeita essa escolha na progressão cardio.
- `construir_molde_manual()` produz uma única semana `tipo_a`, repetida no
  calendário, deriva grupos do catálogo e injeta Aquecimento Articular /
  Alongamento Dinâmico como exercícios reais de Mobilidade quando os toggles
  estão ligados. Repetições e duração ausentes recebem os mesmos defaults do
  mapper; nenhum quilo é prescrito.
- `POST /api/manual-plan` valida schema e invariantes cruzadas, rejeita dias
  duplicados e mais de 2.000 sets **antes** de expandir, aplica limite próprio
  de 10 criações/hora, usa o pipeline existente e grava com
  `created_by='user'` pela mesma RPC transacional.
- `POST /api/manual-plan/preview` não persiste e devolve as semanas 1, meio e
  última a partir da expansão/mapeamento reais, inclusive minutos estimados.
- Limitação marcada pelo aluno chega como `['limitacao_aluno']` no exercício;
  nomes livres são preservados com `exercise_key`, grupo e equipamento nulos.
- `scripts/exercicios_fora_do_catalogo.py` é somente leitura, pagina o
  PostgREST, agrupa com a normalização canônica e conta ocorrências e usuários
  distintos, com saída de tabela ou `--json`.

### RED → GREEN e portões locais

- RED inicial: 16 falhas reproduziram módulos/rotas ausentes,
  `created_by='ai'` fixo e limitação manual descartada.
- O primeiro smoke encontrou “1 séries” na prévia; um RED isolado registrou o
  defeito antes da correção para “1 série”.
- `npx tsc --noEmit`: exit 0, 0 erros.
- `npx jest`: exit 0, 60/60 suítes e 528/528 testes.
- `python3 -m pytest backend/tests -q`: exit 0, 351/351 testes; apenas o warning
  já conhecido do urllib3/LibreSSL.

### Homologação HML

- Backend publicado no branch `staging`: `328681f → 3e10c74`; o health ficou
  200 durante a troca e `/api/manual-plan` passou de 404 para 401 quando o
  container novo entrou. A correção de singular foi publicada em seguida no
  commit `b764fbe` e confirmada por nova chamada autenticada no HML:
  `1 série × 5 min`.
- O contrato de métrica livre foi publicado depois em `bc70370`: smoke
  autenticado com “Circuito de escada do professor” confirmou progressão de
  1,05 km na semana 1 para 1,6 km na semana 12. A prévia que mostrava a duração
  decimal como 948 s ganhou um RED específico e foi corrigida em `8b3a40f`
  para exibir `15,8 min`; nova chamada autenticada confirmou no container
  `2 séries × 15,8 min / 1,05 km` na semana 1 e `24 min / 1,6 km` na semana 12.
- Smoke autenticado real com usuário descartável: preview HTTP 200; criação
  HTTP 201; plano `f3c77ea9-fe21-4fbe-844b-1357352e8992` persistido.

| Conferência no staging | Resultado |
|---|---|
| Plano | `created_by=user`, ativo, 12 semanas |
| Progressão | deload da semana 4 persistido em `progression_rules` |
| Agenda | rótulos segunda/quarta/sexta; semana 4 em 10/12/14-08 |
| Sessão sem duração declarada | estimativa do servidor = 38 min |
| Deload | Supino de segunda: 4 sets na semana 1 → 3 na semana 4 |
| Aquecimento/alongamento | exercícios `tempo`, Mobilidade, `accessory`, 300 s |
| Cardio | Caminhada `tempo_distancia`, 1.200 s e 2.000 m quando informado |
| Limitação | somente o Supino marcado recebeu `['limitacao_aluno']` |
| Nome livre | chave/grupo/equipamento nulos; reps 10–12 preservadas |
| Curadoria | relatório encontrou “Rosca escocesa no banco 45”: 12 ocorrências, 1 usuário |

Nota honesta sobre a primeira semana: o smoke ocorreu quando a data do backend
já era domingo (26/07). A trava do mapper que proíbe agendar antes de
`start_date` comprimiu seg/qua/sex da semana 1 para 26/07, mantendo os rótulos.
As semanas seguintes preservaram os offsets (semana 4: segunda 10/08, quarta
12/08, sexta 14/08). Esse é o comportamento deliberadamente mantido no PR 1,
não uma regressão do editor.

Não há migration nem artefato frontend neste PR; por isso não houve novo
deploy PWA. O Preview homologado no PR 2 continua sendo o bundle vigente, e as
telas consumidoras entram no PR 4.

---

## 26/07/2026 — Plano manual, PR 4: editor no app

Branch `feat/plano-manual-editor`, empilhada sobre o PR #46.

### Entregue no código

- O rascunho TypeScript espelha o contrato do backend, inclusive a métrica
  explícita de nomes livres. Um store Zustand dedicado coordena as três telas,
  persiste cada mutação no AsyncStorage por usuário e só apaga o rascunho após
  receber um `plan_id` válido.
- `ManualPlanEditorScreen` edita nome, duração, treinos e progressão; impede
  salvar treino vazio, explica que a carga em kg depende do que for registrado
  e mostra somente a prévia devolvida por `/api/manual-plan/preview`.
- `ManualWorkoutEditorScreen` oferece seleção seg→dom ou sem dia fixo,
  aquecimento/alongamento opcionais, duração declarada opcional e exercícios
  editáveis, removíveis e reordenáveis.
- `ExercisePickerScreen` busca sem acento, filtra por grupo, mantém
  Cardio/Mobilidade alcançáveis e aceita nome livre mesmo offline. Catálogo
  continua autoritativo para métrica/equipamento; nome livre oferece seletor de
  carga/reps, tempo ou tempo+distância. A limitação marcada alimenta o guardrail
  já existente.
- A progressão começa ligada com descarga na semana 4. Séries continuam
  desligadas por padrão e exibem janela mais aviso de efeito acumulativo;
  cardio só aparece quando existe cardio; intensidade só aparece quando existe
  `%RM`. Desligar uma regra é preservado durante edições posteriores.
- As rotas foram adicionadas à stack de Plano. Os dois pontos de entrada
  (onboarding e edição de plano ativo) pertencem deliberadamente ao PR 5.

### RED → GREEN e portões locais

- RED inicial: quatro suítes não coletavam porque tipos, storage, store e telas
  ainda não existiam. Depois, um RED específico reproduziu a progressão de
  cardio sendo religada contra a escolha do aluno.
- Novas suítes: 16 testes de rascunho, store e telas; junto do guarda Web, 26
  testes focados. O guarda repo-wide confirmou que nenhum `TextInput` flexível
  novo ficou sem `minWidth: 0`.
- `npx tsc --noEmit`: exit 0, 0 erros.
- `npx jest`: exit 0, 64/64 suítes e 544/544 testes.
- `python3 -m pytest backend/tests -q`: exit 0, 351/351 testes; apenas o warning
  conhecido do urllib3/LibreSSL.

### Homologação HML

- **Draft PR #47** aberto, empilhado sobre o #46.
- PWA Preview `forca-aa36owq5i-pmarconatos-projects.vercel.app`, deployment
  `5J9KTe6K3V3Dz2rYW15CEUHKeWqr`: estado READY e raiz HTTP 200.
- O guarda executado no build remoto confirmou um único bundle Web, ambiente
  `preview`, host `forca-api-hml.cadastrai.com` presente e nenhum endereço de
  LAN. O deploy não usou `--prod`.
- Não há migration nem mudança de backend neste PR. As telas existem na stack,
  mas não têm ponto de entrada por desenho: o onboarding e “Editar plano”
  entram no PR 5. Portanto o smoke navegável ponta a ponta não foi fingido
  neste PR; ele começa assim que a próxima camada publicar esses acessos.

---

## 26/07/2026 — Plano manual, PR 5: entradas e edição do plano ativo

Branch `feat/plano-manual-entradas`, empilhada sobre o PR #47.

### Entregue no código

- O onboarding agora oferece “Prefiro montar meu treino” com o mesmo peso das
  alternativas existentes. O questionário só pré-preenche dias, duração e as
  preferências explícitas de cardio/alongamento; nenhum exercício é escolhido
  pelo app.
- Salvar no onboarding volta ao portão de revelação já existente. O perfil
  continua intocado até o toque em “Começar”, quando `onboarding_completed` e
  `current_plan_id` são atualizados juntos.
- A aba Plano ganhou “Editar plano”. O store lê somente a semana 1 do plano
  ativo, preserva prescrição, dia, duração, limitação e regras de progressão e
  abre o mesmo editor manual.
- Aquecimento Articular e Alongamento Dinâmico persistidos voltam a toggles e
  saem da lista editável, impedindo duplicação em edições sucessivas. Planos
  atingidos pela antiga regressão de `progression_rules` ficam com todas as
  regras desligadas e recebem aviso explícito; nenhuma progressão é inferida.
- A substituição exige confirmação e explica que a RPC cria um plano novo,
  arquiva o atual e preserva os treinos já executados no histórico.
- O rascunho persistido vence o prefill ao retomar o onboarding, evitando que
  fechar e reabrir o app apague trabalho já digitado.

### RED → GREEN e portões locais

- RED inicial: o conversor não existia, a terceira opção não aparecia, o save
  manual pulava a revelação e o aviso não exigia confirmação.
- Três suítes novas cobrem importação/round-trip, onboarding manual e aviso de
  substituição; testes existentes foram ampliados para o store, metadados do
  plano e a ação na aba Plano.
- `npx tsc --noEmit`: exit 0, 0 erros.
- `npx jest`: exit 0, 67/67 suítes e 556/556 testes.
- `python3 -m pytest backend/tests -q`: exit 0, 351/351 testes; apenas o warning
  conhecido do urllib3/LibreSSL.

### Homologação HML

- Pendente de publicação do PWA Preview e smoke navegável deste PR. Não há
  migration nem alteração de backend nesta camada.
