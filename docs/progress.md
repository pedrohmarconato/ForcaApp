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
