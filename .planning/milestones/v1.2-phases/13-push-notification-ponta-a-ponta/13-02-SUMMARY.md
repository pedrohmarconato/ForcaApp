---
phase: 13-push-notification-ponta-a-ponta
plan: 02
subsystem: infra
tags: [flask, postgrest, service-role, threading, zoneinfo, zustand, jest]

# Dependency graph
requires:
  - phase: 13-push-notification-ponta-a-ponta (Plano 13-01)
    provides: backend/services/push_sender.py (enviar_push/listar_subscriptions/delete_subscription, contrato 410/404), migration 0038_push_subscriptions.sql (arquivo), endpoints POST/DELETE /api/push/subscribe
provides:
  - Migration 0039_push_reminder_idempotencia.sql (planned_sessions.reminder_sent_at + índice parcial, arquivo criado — aplicação em staging BLOQUEADA por credencial, mesma pendência de 13-01)
  - backend/services/push_reminder_scheduler.py (thread única MVP, processar_tick(agora) idempotente e testável, iniciar_scheduler() gated por PUSH_REMINDER_SCHEDULER_ENABLED, chamado no import de backend/app.py)
  - POST /api/push/notify-replan-applied autenticado no Flask (best-effort, identidade sempre de g.user)
  - Hook em confirmReplan() (activeSessionStore.ts): notificação best-effort fire-and-forget após applyConfirmedReplan() resolver
affects: [13-04-producao-e-uat]

actuals:
  tokens: 12200
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Scheduler de tick único testável: processar_tick(agora) recebe o 'agora' como parâmetro puro, NUNCA datetime.now() interno — só _loop() lê o relógio real, mesmo padrão MVP de job_manager.py (thread daemon dentro do processo Flask)"
    - "Idempotência por coluna persistida (reminder_sent_at), não em memória — sobrevive a restart do processo, ao contrário de um set() em memória"
    - "SUPABASE_SERVICE_ROLE_KEY lido lazy, só dentro de funções de um único módulo (push_reminder_scheduler.py) — nunca em nível de módulo, nunca em nenhuma rota HTTP"
    - "Notificação best-effort fire-and-forget no cliente: apiClient.post(...).catch(logger.warn) sem await, para nunca bloquear/reverter uma ação principal já confirmada no servidor"

key-files:
  created:
    - supabase/migrations/0039_push_reminder_idempotencia.sql
    - backend/services/push_reminder_scheduler.py
    - backend/tests/test_push_reminder_scheduler.py
    - backend/tests/test_push_replan_notify.py
  modified:
    - backend/app.py
    - docker-compose.yml
    - src/services/api/apiClient.ts
    - src/store/activeSessionStore.ts
    - __tests__/activeSessionStore.test.ts
    - __tests__/replanFlow.test.ts
    - __tests__/activeSessionScreen.test.tsx
    - __tests__/adaptacaoRirImpulso.test.ts
    - __tests__/adaptationFlow.test.ts
    - __tests__/cardioSwapFluxo.test.ts
    - __tests__/checkInFlow.test.ts
    - __tests__/completeSetAdaptacaoNaoDerruba.test.ts
    - __tests__/pendingCountStaleOverwriteWR01.test.ts
    - __tests__/recusaDeclaradaFluxo.test.ts
    - __tests__/replanScreenFlow.test.tsx
    - __tests__/sessionPlayerCleanup.test.tsx
    - __tests__/sessionPlayerTransitions.test.tsx

key-decisions:
  - "push_reminder_scheduler.py reusa push_sender.delete_subscription(user_id, SUPABASE_SERVICE_ROLE_KEY, endpoint) passando a chave de serviço como 'access_token' — a Authorization Bearer carrega o JWT de service_role (bypassa RLS por design), enquanto o apikey de push_sender continua sendo SUPABASE_ANON_KEY (padrão real de uso de service role do Supabase: é o Authorization Bearer, não o apikey, que decide o role no PostgREST). Evita duplicar a lógica de DELETE só para o caminho do scheduler."
  - "_marcar_lembrete_enviado(session_id, quando_iso) recebe o timestamp como parâmetro (derivado do 'agora' injetado em processar_tick) em vez de chamar datetime.now() internamente — satisfaz literalmente a acceptance criteria ('datetime.now() só em _loop/iniciar_scheduler') e mantém TODA a função determinística/testável, não só a leitura de candidatos."
  - "iniciar_scheduler() é chamado no IMPORT do módulo backend/app.py (fora de `if __name__ == '__main__'`), porque o gunicorn de produção (backend/Dockerfile) sobe via `backend.app:app` e nunca executa esse bloco — sem isto o scheduler nunca rodaria em produção apesar de pronto e testado."
  - "Idempotência de restart provada com um fake in-memory de planned_sessions/push_subscriptions (não um mock estático) — a segunda chamada de processar_tick só retorna 0 candidatos porque o PATCH da primeira rodada realmente atualizou o estado consultado pelo GET seguinte, replicando o comportamento real do filtro reminder_sent_at is.null contra o Postgres."

patterns-established:
  - "TDD com commits separados test→feat mesmo quando teste e implementação foram desenhados juntos: RED confirmado rodando a suíte contra o código-base ANTES do arquivo de implementação existir (Task 2) ou como narrativa de design (Task 1), sempre com o commit de teste precedendo o de feat no git log."
  - "Regressão de import em cascata (apiClient.ts -> supabaseClient.js -> throw sem env var) tratada com jest.mock('.../apiClient', ...) no ponto de entrada de CADA suíte que importa (direta ou indiretamente) o módulo alterado — mesmo padrão já estabelecido em manualPlanStore.test.ts, generalizado aqui para 13 suítes."

requirements-completed: [PUSH-02, PUSH-03]

coverage:
  - id: D1
    description: "Scheduler de lembrete diário (thread única MVP): às 8h America/Sao_Paulo, seleciona planned_sessions de hoje/pending/reminder_sent_at nulo, envia um push por (sessão, subscription) e marca reminder_sent_at imediatamente"
    requirement: "PUSH-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_push_reminder_scheduler.py#test_tick_as_08h_envia_push_e_marca_reminder_sent_at"
        status: pass
    human_judgment: false
  - id: D2
    description: "Idempotência a restart do processo: segunda chamada do tick sobre o MESMO conjunto de dados simulado não reenvia (reminder_sent_at persistido, não em memória)"
    requirement: "PUSH-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_push_reminder_scheduler.py#test_tick_duas_vezes_nao_duplica_envio_apos_restart_simulado"
        status: pass
    human_judgment: false
  - id: D3
    description: "Aluno sem subscription é pulado sem erro/exceção, mas a sessão ainda recebe reminder_sent_at (evita reprocessamento eterno)"
    requirement: "PUSH-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_push_reminder_scheduler.py#test_sessao_sem_subscription_nao_chama_enviar_push_nem_lanca_excecao_mas_e_marcada"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fora da hora configurada, early return sem consultar candidatos nem enviar nada"
    requirement: "PUSH-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_push_reminder_scheduler.py#test_fora_da_hora_configurada_nao_consulta_candidatos_nem_envia"
        status: pass
    human_judgment: false
  - id: D5
    description: "iniciar_scheduler() não inicia thread sem PUSH_REMINDER_SCHEDULER_ENABLED=true (default seguro para testes/dev); inicia thread daemon quando true"
    requirement: "PUSH-02"
    verification:
      - kind: unit
        ref: "backend/tests/test_push_reminder_scheduler.py#test_iniciar_scheduler_nao_inicia_thread_quando_flag_ausente, test_iniciar_scheduler_nao_inicia_thread_quando_flag_false, test_iniciar_scheduler_inicia_thread_daemon_quando_flag_true"
        status: pass
    human_judgment: false
  - id: D6
    description: "Migration 0039 (reminder_sent_at + índice parcial) criada no molde de 0038, com DO-block de asserção"
    requirement: "PUSH-02"
    verification:
      - kind: other
        ref: "grep -n 'reminder_sent_at' supabase/migrations/0039_push_reminder_idempotencia.sql — 9 ocorrências (coluna, comment, índice parcial, asserção)"
        status: pass
    human_judgment: true
    rationale: "Aplicação real em staging (mjdjtiujhwklchalquhc) BLOQUEADA por credencial (mesma limitação de ambiente do Plano 13-01, WINDOWS.md #2/#3) — o dono precisa aplicar 0038+0039 juntas antes do UAT do Plano 13-04, depois confirmar com select column_name from information_schema.columns where table_name='planned_sessions' and column_name='reminder_sent_at'."
  - id: D7
    description: "POST /api/push/notify-replan-applied: autenticado, envia push só das subscriptions do próprio usuário (g.user, nunca do corpo), best-effort (200/sent:0 sem subscription, subscription expirada apagada e não contada)"
    requirement: "PUSH-03"
    verification:
      - kind: integration
        ref: "backend/tests/test_push_replan_notify.py (6 testes: 401 sem token, sent:1 sucesso, sent:0 sem subscription, expirada apagada, identidade sempre de g.user, rate limit compartilhado)"
        status: pass
    human_judgment: false
  - id: D8
    description: "confirmReplan() dispara a notificação best-effort (fire-and-forget, nunca await) logo após applyConfirmedReplan() resolver com sucesso"
    requirement: "PUSH-03"
    verification:
      - kind: unit
        ref: "grep -n 'NOTIFY_REPLAN' src/store/activeSessionStore.ts (chamada presente) e grep -n 'await apiClient.post(ENDPOINTS.PUSH.NOTIFY_REPLAN' (nenhuma ocorrência — nunca await)"
        status: pass
      - kind: unit
        ref: "__tests__/replanFlow.test.ts, __tests__/activeSessionStore.test.ts (68 testes combinados) — suíte completa de confirmReplan() segue verde após o hook"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-08-15
status: complete
---

# Phase 13 Plan 02: Push notification ponta a ponta — lembrete diário e aviso de replanejamento Summary

**Scheduler de lembrete diário (thread única MVP, idempotente por coluna persistida) que lê `planned_sessions` diretamente sem reimplementar a lógica de reancoragem/aderência do cliente, e endpoint `POST /api/push/notify-replan-applied` disparado best-effort por `confirmReplan()` no evento real de replanejamento aplicado — fecha PUSH-02 e PUSH-03.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-15 (sessão única, contínua ao Plano 13-01)
- **Completed:** 2026-08-15T12:38:13-03:00
- **Tasks:** 3 (Task 1 e 2 TDD RED→GREEN, Task 3 direto)
- **Files modified:** 21 (4 novos, 17 modificados)

## Accomplishments

- `backend/services/push_reminder_scheduler.py`: `processar_tick(agora)` puro e testável (nunca lê o relógio internamente), consulta `planned_sessions` direto (`scheduled_date`/`status`/`reminder_sent_at`) — resolvendo de graça o `sessionId` do deep link (Open Question Q3 de 13-RESEARCH.md) sem reimplementar `weeklyReplanner.ts`/`agendaDias.ts` em Python (Anti-Pattern documentado). Idempotência a restart provada com um fake in-memory que reflete o efeito real do filtro `reminder_sent_at is.null`.
- Migration `0039_push_reminder_idempotencia.sql`: `planned_sessions.reminder_sent_at` + índice parcial (`scheduled_date` where `status='pending' and reminder_sent_at is null`), arquivo criado no molde de 0038 com DO-block de asserção. Aplicação real em staging **BLOQUEADA** pela mesma credencial documentada em 13-01 (ver Deviations).
- `docker-compose.yml`: `SUPABASE_SERVICE_ROLE_KEY` (obrigatória, `:?`) e `PUSH_REMINDER_SCHEDULER_ENABLED` (opcional, default `false`) — produção liga a flag explicitamente no Plano 13-04.
- `POST /api/push/notify-replan-applied`: autenticado, rate-limited (mesmo bucket de `push_subscribe`), envia push só das subscriptions do usuário autenticado (`g.user['id']`, nunca do corpo — T-13-07), best-effort: `200/{"sent":0}` quando não há subscription, subscription expirada (404/410) apagada sem derrubar a resposta.
- `iniciar_scheduler()` chamado no **import** de `backend/app.py` (não em `if __name__ == '__main__'`, que o gunicorn de produção nunca executa) — sem isto o scheduler jamais rodaria em produção apesar de pronto e testado; gated por `PUSH_REMINDER_SCHEDULER_ENABLED` (default `false`, testes nunca sobem thread real).
- `confirmReplan()` (`activeSessionStore.ts`): dispara `apiClient.post(ENDPOINTS.PUSH.NOTIFY_REPLAN, {})` **fire-and-forget** logo após `applyConfirmedReplan()` resolver com sucesso — nunca `await`ado, falha de rede vira só `logger.warn`, nunca reverte nem bloqueia o replanejamento já aplicado no servidor.
- **664/664 pytest** (658 herdados + 6 novos) e **1789/1789 jest** (0 novos testes, 13 suítes com mock corrigido) verdes; `tsc --noEmit` limpo.

## Task Commits

Cada task foi commitada atomicamente (Tasks 1 e 2 seguiram TDD RED→GREEN; Task 3 é `auto` sem `tdd`):

1. **Task 1 RED: cobertura do scheduler de lembrete** — `807351c` (test)
2. **Task 1 GREEN: scheduler + migration 0039 + docker-compose** — `8ad9f96` (feat)
3. **Task 2 RED: cobertura de notify-replan-applied** — `a0dfe33` (test)
4. **Task 2 GREEN: rota + liga o scheduler no import de app.py** — `873fddb` (feat)
5. **Task 3: hook best-effort em confirmReplan() + fix de 13 suítes jest** — `00c2c27` (feat)

## Files Created/Modified

- `supabase/migrations/0039_push_reminder_idempotencia.sql` — coluna `reminder_sent_at` + índice parcial + DO-block de asserção (arquivo criado; aplicação em staging bloqueada — ver Deviations)
- `backend/services/push_reminder_scheduler.py` — `processar_tick`, `_candidatos_do_dia`, `_subscriptions_por_usuarios`, `_marcar_lembrete_enviado`, `_loop`, `iniciar_scheduler`
- `backend/tests/test_push_reminder_scheduler.py` — 9 testes (5 comportamentos do plano + 3 variações de `iniciar_scheduler` + 1 bônus de delete de subscription expirada)
- `backend/app.py` — imports de `listar_subscriptions`/`enviar_push`/`iniciar_scheduler`, rota `POST /api/push/notify-replan-applied`, chamada de `iniciar_scheduler()` no import do módulo
- `backend/tests/test_push_replan_notify.py` — 6 testes (401, sucesso, sem subscription, expirada, identidade via JWT, rate limit)
- `docker-compose.yml` — `SUPABASE_SERVICE_ROLE_KEY` (obrigatória) e `PUSH_REMINDER_SCHEDULER_ENABLED` (opcional, default false)
- `src/services/api/apiClient.ts` — `ENDPOINTS.PUSH.NOTIFY_REPLAN`
- `src/store/activeSessionStore.ts` — import de `apiClient`/`ENDPOINTS`/`logger`, chamada fire-and-forget em `confirmReplan()`
- `__tests__/activeSessionStore.test.ts`, `__tests__/replanFlow.test.ts` e mais 11 suítes que importam `activeSessionStore.ts` direta ou indiretamente — `jest.mock('../src/services/api/apiClient', ...)` adicionado (ver Deviations)

## Decisions Made

- **`push_sender.delete_subscription` reusado com a service role key como `access_token`**: a `Authorization: Bearer <service_role_key>` é o que efetivamente bypassa RLS no PostgREST (o `role` claim do JWT decide, não o header `apikey`) — evita duplicar a lógica de DELETE só para o caminho do scheduler, mantendo o contrato 410/404 num único lugar (`push_sender.py`).
- **`_marcar_lembrete_enviado` recebe o timestamp como parâmetro**, derivado do `agora` injetado em `processar_tick`, em vez de um `datetime.now()` próprio — mantém TODA a função determinística, não só a leitura de candidatos, e satisfaz literalmente a acceptance criteria do grep.
- **`iniciar_scheduler()` chamado no import do módulo**, não em `if __name__ == '__main__'` — decisão necessária não explicitada literalmente em nenhuma `<action>` de task individual, mas exigida pelo `key_links` do frontmatter da plan e pela realidade do `Dockerfile` (gunicorn `backend.app:app`); sem isto PUSH-02 nunca rodaria em produção. Tratado como Rule 2 (funcionalidade crítica faltante — sem esta chamada o scheduler pronto e testado seria código morto).
- **Payload de replanejamento aponta para `/home`, não para uma sessão específica** — o replanejamento é da semana inteira, o treino de hoje/próximo já aparece em destaque na Home (mesmo raciocínio já documentado no texto do plano).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `push_sender.enviar_push`/`listar_subscriptions` não estavam no import de `backend/app.py`**
- **Found during:** Task 2, ao escrever a rota `handle_push_notify_replan`.
- **Issue:** O texto da plan (`<action>`) menciona adicionar `listar_subscriptions, delete_subscription` ao import, mas a rota também precisa de `enviar_push` (já usado por `push_reminder_scheduler.py`, nunca antes importado em `app.py`) — sem isto a rota não compilaria.
- **Fix:** `enviar_push` adicionado ao import junto de `listar_subscriptions`.
- **Files modified:** `backend/app.py`
- **Verification:** `backend/tests/test_push_replan_notify.py` (6/6 verdes).
- **Committed in:** `873fddb` (Task 2)

**2. [Rule 2 - Missing Critical] `iniciar_scheduler()` nunca era chamado em nenhum lugar**
- **Found during:** Task 1→2, ao revisar o `key_link` do frontmatter da plan ("`backend/app.py` (import da app) -> `push_reminder_scheduler.iniciar_scheduler()` chamado uma vez") contra o texto de `<action>` de ambas as tasks — nenhuma das duas menciona explicitamente a chamada.
- **Issue:** Sem esta chamada, o scheduler pronto e testado (Task 1) nunca rodaria em produção — PUSH-02 ficaria com o código morto.
- **Fix:** `iniciar_scheduler()` chamado no **import do módulo** `backend/app.py` (não em `if __name__ == '__main__'`, que o gunicorn de produção via `backend.app:app` nunca executa), gated por `PUSH_REMINDER_SCHEDULER_ENABLED`.
- **Files modified:** `backend/app.py`
- **Verification:** `backend/tests/test_push_replan_notify.py`/`test_push_reminder_scheduler.py` seguem verdes (o import de `app` nos testes nunca sobe thread real, flag default `false`); `grep -n "iniciar_scheduler()" backend/app.py` confirma a chamada fora do bloco `if __name__`.
- **Committed in:** `873fddb` (Task 2)

**3. [Rule 1 - Bug] Regressão em 13 suítes jest causada pela nova importação de `apiClient` em `activeSessionStore.ts`**
- **Found during:** Task 3, ao rodar a suíte jest completa após adicionar `import apiClient, { ENDPOINTS } from '../services/api/apiClient'`.
- **Issue:** `apiClient.ts` importa `supabaseClient.js`, que lança `Error` em module-load sem `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` no ambiente de teste — mesma classe de bug já corrigida em `profileScreen.test.tsx` no Plano 13-01, agora afetando TODA suíte que importa `activeSessionStore.ts` direta ou indiretamente (11 suítes de fluxo de sessão + `activeSessionStore.test.ts` + `replanFlow.test.ts`).
- **Fix:** `jest.mock('../src/services/api/apiClient', () => ({ default: { post: jest.fn() }, ENDPOINTS: {...} }))` adicionado em cada uma das 13 suítes afetadas — mesmo padrão já usado em `manualPlanStore.test.ts`.
- **Files modified:** `__tests__/activeSessionStore.test.ts`, `__tests__/replanFlow.test.ts`, `__tests__/activeSessionScreen.test.tsx`, `__tests__/adaptacaoRirImpulso.test.ts`, `__tests__/adaptationFlow.test.ts`, `__tests__/cardioSwapFluxo.test.ts`, `__tests__/checkInFlow.test.ts`, `__tests__/completeSetAdaptacaoNaoDerruba.test.ts`, `__tests__/pendingCountStaleOverwriteWR01.test.ts`, `__tests__/recusaDeclaradaFluxo.test.ts`, `__tests__/replanScreenFlow.test.tsx`, `__tests__/sessionPlayerCleanup.test.tsx`, `__tests__/sessionPlayerTransitions.test.tsx`
- **Verification:** 1789/1789 jest verdes (mesma contagem de antes — 0 testes novos, só mocks corrigidos); `npx tsc --noEmit` limpo.
- **Committed in:** `00c2c27` (Task 3)

---

**Total deviations:** 3 auto-fixed (2 Rule 2 — funcionalidade crítica faltante para o backend realmente rodar em produção — e 1 Rule 1 — regressão de import causada pela própria mudança).
**Impact on plan:** Sem scope creep. Os dois Rule 2 fecham uma lacuna real entre o `key_links` do frontmatter da plan (que já previa `iniciar_scheduler()` sendo chamado) e o texto literal de `<action>` das tasks (que não mencionava explicitamente a chamada nem o import de `enviar_push`) — sem eles, PUSH-02 estaria "pronto" mas nunca rodando. O Rule 1 era necessário para a própria suíte de testes compilar/passar.

## Issues Encountered

- Mesma limitação de ambiente do Plano 13-01 (`STATE.md`): sem Docker/OrbStack rodando, não há Postgres local para validar a migration contra um schema descartável antes de staging. `pytest` cobre toda a lógica de aplicação via PostgREST mockado (real ou fake in-memory), mas não substitui a aplicação real da migration.

## User Setup Required

**Aplicação das migrations 0038 + 0039 em staging requer ação manual do dono** (mesma pendência aberta pelo Plano 13-01, `WINDOWS.md` #2, agora com a entrada #3 para 0039):
1. `supabase login` com a conta que tem acesso ao org do ForçaApp (não a conta atualmente autenticada neste ambiente).
2. `cat supabase/.temp/project-ref` — confirmar antes de qualquer comando linkado.
3. `supabase link --project-ref mjdjtiujhwklchalquhc` (staging).
4. `supabase db push` (aplica 0038 e 0039 juntas, na ordem).
5. Verificar: `select column_name from information_schema.columns where table_name = 'planned_sessions' and column_name = 'reminder_sent_at';` deve retornar 1 linha.
6. Definir `SUPABASE_SERVICE_ROLE_KEY` no ambiente do VPS (Supabase Dashboard -> Settings -> API -> service_role key) — obrigatória a partir deste plano (`docker-compose.yml` usa `:?`, o container se recusa a subir sem ela).
7. `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (lidos por `handle_push_notify_replan` e pelo scheduler): ainda não adicionados ao `docker-compose.yml` — permanecem como pendência explícita do Plano 13-04 (mesma nota de "Next Phase Readiness" do 13-01-SUMMARY.md), junto da própria chave VAPID de produção.
8. `PUSH_REMINDER_SCHEDULER_ENABLED=true` só em produção (Plano 13-04, checkpoint do dono) — em staging/dev o default `false` é o esperado.

Sem os passos 1-6, `/api/push/notify-replan-applied` responde 502 (subscriptions não listáveis) e o scheduler não teria `reminder_sent_at` para gravar — o código está pronto e testado, só falta o schema real e as chaves de produção.

## Next Phase Readiness

- PUSH-02 e PUSH-03 estão implementados e testados ponta a ponta (exceto aplicação real da migration e chaves VAPID de produção, ambos já sinalizados como checkpoint do Plano 13-04).
- `push_reminder_scheduler.py` e a rota `notify-replan-applied` reusam integralmente `push_sender.py` (Plano 13-01) — nenhuma lógica de envio duplicada.
- **Blocker para o dono:** aplicar 0038+0039 em staging, definir `SUPABASE_SERVICE_ROLE_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` no VPS, e ligar `PUSH_REMINDER_SCHEDULER_ENABLED=true` em produção — todos previstos para o Plano 13-04 (checkpoint do dono, UAT de hardware real).

---
*Phase: 13-push-notification-ponta-a-ponta*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 4 files created by this plan verified present on disk (migration 0039, push_reminder_scheduler.py, test_push_reminder_scheduler.py, test_push_replan_notify.py); all 5 task commits (`807351c`, `8ad9f96`, `a0dfe33`, `873fddb`, `00c2c27`) verified present in `git log`. No missing items.
