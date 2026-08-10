---
phase: 03-interc-mbio-de-modalidade-de-cardio
reviewed: 2026-08-10T17:29:24Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/services/sessionExecutionRepository.ts
  - src/components/session/SessionQueue.tsx
  - src/screens/ActiveSessionScreen.tsx
  - supabase/migrations/0036_guarda_set_log_troca_cardio.sql
  - __tests__/integration/getSessionLogDetail.postgrest.test.ts
  - __tests__/cardioSwapGuardaSerieConcluida.test.ts
  - __tests__/activeSessionScreen.test.tsx
  - __tests__/sessionExecutionRepository.test.ts
  - jest.integration.config.js
  - package.json
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 3: Code Review Report (Gap Closure — Wave 1: 03-07/03-08/03-09)

**Reviewed:** 2026-08-10T17:29:24Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found (nenhum CRITICAL — 2 WARNING, 2 INFO)

## Summary

Revisão do diff `628f050..HEAD`, escopo desta onda de gap closure (planos 03-07,
03-08, 03-09). Este NÃO é um review completo da Fase 3 — o round anterior
(ver git, commit `b309046`) cobriu o resto; este arquivo foi intencionalmente
sobrescrito para focar só no que esta onda introduziu, conforme o
`scope_note` do disparo.

As três mudanças de maior risco apontadas no `scope_note` foram verificadas
linha a linha contra a fonte de verdade:

1. **`sessionExecutionRepository.ts`** — o rename `planned_exercise_id` →
   `exercise_id` no select de `set_logs` e na leitura da linha foi conferido
   contra `supabase/migrations/0001_modelo_treino.sql:91`
   (`exercise_id uuid not null references public.planned_exercises (id)`):
   **correto**, é a coluna real. Nenhuma outra ocorrência de
   `planned_sets(..., planned_exercise_id, ...)` sobrou no arquivo — as demais
   referências a `planned_exercise_id` são de `exercise_skips` e
   `cardio_exercise_swaps`, tabelas onde essa É a coluna real (0020/0034). O
   comentário novo que justifica a ausência do degrau `erroDeColunaAusente`
   também se sustenta: as colunas desta query nasceram todas na migration 0014
   (`metric`, `actual_duration_seconds`, `actual_distance_m`,
   `perceived_effort` — conferido linha a linha em `0014_cardio_tempo_distancia.sql`),
   anterior a 0020/0034, que este mesmo `getSessionLogDetail` já embute no
   `select` do cabeçalho (`cardio_exercise_swaps`) — logo, dado que migrations
   aplicam em ordem sequencial (AGENTS.md), nenhum ambiente real pode ter 0034
   sem já ter 0014.

2. **`0036_guarda_set_log_troca_cardio.sql`** — comparado byte a byte contra
   `0035_guarda_metric_troca_cardio.sql`: o corpo da função é idêntico até a
   guarda de métrica (só diffs de comentário), a guarda nova de `set_logs`
   (errcode `P0005`, join via `planned_sets.exercise_id` — coerente com o
   achado do item 1) foi inserida exatamente entre a guarda de métrica e o
   `insert`, sem alterar nada anterior. `revoke ... from public, anon` +
   `grant ... to authenticated` reproduzidos identicamente ao padrão de
   0034/0035; nenhuma ocorrência de `to anon` no arquivo. O bloco de asserção
   runtime foi estendido (não substituído) com as duas checagens novas,
   preservando a checagem herdada de `pe.metric in (...)` e a negativa de
   `muscle_group = 'Cardio'`. `P0005` é um errcode PL/pgSQL novo e não
   conflita com os reservados internos (`P0001`–`P0004`). Migration ainda não
   aplicada a banco nenhum — decisão do dono registrada em 03-08-SUMMARY.md.

3. **`package.json` / `jest.integration.config.js`** — `testPathIgnorePatterns`
   inclui `<rootDir>/__tests__/integration/`; confirmado rodando
   `npx jest --listTests` (o diretório `integration/` não aparece na lista
   padrão) e `npx jest` completo continua sem esse harness. `npx tsc --noEmit`
   limpo. `npx jest __tests__/sessionExecutionRepository.test.ts
   __tests__/activeSessionScreen.test.tsx
   __tests__/cardioSwapGuardaSerieConcluida.test.ts` — 67/67 passando,
   reexecutado nesta revisão.

4. **`__tests__/integration/getSessionLogDetail.postgrest.test.ts`** — sem
   segredo commitado: a única chave hardcoded é a `anon key` demo pública
   padrão de qualquer `supabase init` local (documentada como tal no
   comentário, e é o mesmo valor que qualquer stack Supabase local imprime).
   `service_role` vem só de env var, sem default. A trava de loopback
   (`LOOPBACK_ONLY` regex) roda no topo do módulo, antes de qualquer
   `createClient`/chamada de rede, e aborta se a URL não for
   `127.0.0.1`/`localhost` — corretamente impede apontar para staging/produção
   por engano de env var.

5. **`SessionQueue.tsx` / `ActiveSessionScreen.tsx`** — o predicado novo
   `!ex.sets.some(s => s.status === 'done')` reaproveita exatamente o guard
   client-side de CR-01 (`activeSessionStore.ts:1518`,
   `alvo.sets.some(s => s.status === 'done')`) — mesma fonte de verdade, sem
   duplicar lógica com deriva possível. Confirmado que o botão "Não vou fazer"
   (linha ~106 de `SessionQueue.tsx`) e `SkipReasonSheet` continuam
   condicionados apenas a `!foraDeJogo`/`!recusado`, **não** ao predicado novo
   — o caminho de recusa declarada permanece alcançável mesmo com série já
   concluída, como o `scope_note` exige. Tipos usados (`DraftExercise`,
   `DraftSet`) evitam `any`.

Nenhum achado desta onda chega a CRITICAL. Os dois WARNINGs abaixo são gaps de
cobertura de teste, não bugs de comportamento observado.

## Warnings

### WR-01: Harness de integração nunca exercita o caminho com dado populado

**File:** `__tests__/integration/getSessionLogDetail.postgrest.test.ts:164-170`
**Issue:** O único teste do harness (`beforeAll`) semeia `training_plans` →
`planned_sessions` → `session_logs`, mas **nunca insere `planned_exercises`,
`planned_sets` nem `set_logs`**. A asserção final é `exercises: []`. Isso é
suficiente para provar que o `select` não lança mais `42703` (PostgREST valida
a existência da coluna no parse da query, independente de haver linha
correspondente), mas **não** exercita o trecho de mapeamento
(`l?.planned_sets?.exercise_id`, `mapaTrocas.get(plannedExerciseId)`,
agrupamento por `chave`) contra uma resposta real do PostgREST — exatamente o
tipo de lógica que o mock antigo (`__tests__/sessionExecutionRepository.test.ts`)
já mostrou não ser confiável para pegar (ele aceitava qualquer nome de
propriedade, inclusive o nome errado que causou o bug original). Um `set_log`
real populado (mesmo 1 linha, com `planned_sets`/`planned_exercises` mínimos)
fecharia esse ponto cego por completo, em vez de só a metade (existência da
coluna) dele.
**Fix:** Estender o `beforeAll` para inserir 1 `planned_exercises` +
1 `planned_sets` + 1 `set_log` via `userClient`, e trocar a asserção para
verificar que `exercises[0].sets[0]` reflete os valores gravados — prova a
leitura ponta a ponta, não só a ausência do 42703.

### WR-02: `beforeAll` do harness de integração pode deixar usuário órfão em caso de exceção após a criação do usuário

**File:** `__tests__/integration/getSessionLogDetail.postgrest.test.ts:106-115`
**Issue:** Se `admin.auth.admin.createUser(...)` suceder mas uma chamada
posterior (`signInWithPassword`, insert em `training_plans`/`planned_sessions`/
`session_logs`) rejeitar via exceção de rede (não erro retornado no objeto,
que já é tratado pelos `if (...Error || !...)`), o `throw` propaga para fora
do `beforeAll` sem que nenhum código de limpeza rode ali — o `afterAll` do
`describe` ainda executa (Jest chama `afterAll` mesmo com `beforeAll` falho) e
`userId` já foi atribuído nesse ponto, então a limpeza acontece na prática.
O buraco real é mais estreito (erro de rede síncrono entre o sucesso de
`createUser` e a atribuição de `userId`) mas o padrão geral, sem `try/finally`
explícito, é frágil para acúmulo de usuários de teste órfãos no stack local
ao longo de múltiplas execuções com falha parcial.
**Fix:** Envolver o corpo do `beforeAll` num `try { ... } catch (e) { if
(userId) await admin.auth.admin.deleteUser(userId); throw e; }` para garantir
limpeza determinística em qualquer ponto de falha após a criação do usuário.

## Info

### IN-01: Migration 0036 ainda não aplicada — dependência externa não verificável neste review

**File:** `supabase/migrations/0036_guarda_set_log_troca_cardio.sql`
**Issue:** A truth `backstop` do plano 03-08 ("aplicada a um banco vivo, uma
chamada direta a `swap_session_exercise` para um `planned_exercise_id` que já
tem `set_logs` é recusada com P0005") permanece não verificada contra um banco
real — o arquivo foi revisado e testado só via leitura textual
(`cardioSwapGuardaSerieConcluida.test.ts`, sem conexão de banco). Isto já está
registrado como risco conhecido em `03-08-SUMMARY.md`; incluído aqui apenas
para registro formal do review — nenhuma ação deste agente pode fechá-lo
(comando `supabase db push` é do dono, conforme AGENTS.md).
**Fix:** N/A — ação pendente do dono, já documentada no runbook do
03-08-SUMMARY.md.

### IN-02: Nome de variável `plannedExerciseId` no `getSessionLogDetail` continua referenciando `planned_exercises.id`, não uma FK própria

**File:** `src/services/sessionExecutionRepository.ts:924`
**Issue:** Estilo, não bug: a variável `plannedExerciseId` é preenchida a
partir de `planned_sets.exercise_id` (o id do `planned_exercise` pai), e não
de uma coluna literalmente chamada `planned_exercise_id`. O nome pré-existe ao
diff desta onda (só a fonte mudou de coluna errada para coluna certa) e é
usado de forma consistente com o resto da função (chave de `mapaTrocas`, que
também é o `planned_exercise_id` de `cardio_exercise_swaps` — mesmo espaço de
IDs, `planned_exercises.id`). Não é um erro funcional, mas o nome pode
confundir um leitor futuro que assuma que existe uma coluna com esse nome
literal em `planned_sets`.
**Fix:** Opcional — renomear para `exerciseId` ou `plannedExercisePk` na
próxima vez que este trecho for tocado, para deixar claro que é o id do
próprio `planned_exercise`, não uma FK com esse nome.

---

_Reviewed: 2026-08-10T17:29:24Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
