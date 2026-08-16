---
phase: 13-push-notification-ponta-a-ponta
verified: 2026-08-15T22:30:00Z
status: human_needed
score: 5/5 automatable truths verified (0 present-behavior-unverified); 3 roadmap success criteria require production deploy + real-iPhone UAT (not automatable, deliberately deferred to 13-04)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "1. Pré-requisitos de infraestrutura: aplicar migrations 0038+0039 em staging (mjdjtiujhwklchalquhc) e depois em produção (zanqygwsgxkyjiuhrzju) com md5 idêntico; gerar par VAPID de produção e configurar VAPID_PRIVATE_KEY/VAPID_SUBJECT/SUPABASE_SERVICE_ROLE_KEY no VPS; configurar EXPO_PUBLIC_VAPID_PUBLIC_KEY na Vercel e redeploy web; deploy do backend (docker-compose) no VPS."
    expected: "supabase/.temp/project-ref confirmado antes de cada push; select * from pg_policies where tablename='push_subscriptions' retorna 1 linha em staging e produção; GET /api/health e /api/ready respondem 200 pós-deploy."
    why_human: "Requer credencial Supabase do org do ForçaApp (a máquina atual está autenticada numa conta diferente — WINDOWS.md #2/#3) e acesso ao painel do VPS/Vercel; nenhuma automação deste ambiente pode aplicar migration em produção."
  - test: "2. Opt-in e subscription (PUSH-01) no iPhone real: tocar 'Ativar notificações' no Perfil (ou aceitar o convite único) concede a permissão do iOS e grava uma linha em push_subscriptions do próprio usuário; outro usuário não vê essa linha (RLS)."
    expected: "Linha aparece em push_subscriptions só para o dono da subscription; um segundo toque rápido (double-tap) não dispara duas subscriptions divergentes nem trava o botão."
    why_human: "Comportamento de permissão nativa do Safari/iOS e persistência real via RLS só são observáveis em hardware real com PWA instalado — não simulável neste ambiente (sem toolchain nativa, MEMORY.md)."
  - test: "2b. (Observação adicional para o UAT #2 acima) Confirmar que o toque em 'Ativar notificações' ainda dispara o prompt nativo de permissão do iOS mesmo com a linha `setNotifState('subscribing')` executando ANTES de `subscribeToPush()` em ProfileScreen.tsx (ver Gaps/Notas abaixo)."
    expected: "O prompt de permissão do iOS aparece normalmente (o gesto do usuário não é descartado por causa da chamada de estado síncrona adicional antes do subscribe)."
    why_human: "A regra de 'user activation' do WebKit/iOS Safari só é verificável em Safari real; a suíte jsdom não modela esse comportamento do navegador."
  - test: "3. Lembrete de treino às 8h (PUSH-02) no iPhone real: em dia com planned_session pendente, o lembrete chega por volta das 8h America/Sao_Paulo; reminder_sent_at é preenchido; reiniciar o backend no mesmo dia não duplica o envio."
    expected: "Notificação chega uma única vez por sessão/dia; reminder_sent_at não-nulo após o envio."
    why_human: "Depende do scheduler rodando em produção (PUSH_REMINDER_SCHEDULER_ENABLED=true, checkpoint do Plano 13-04) e da entrega real de push pelo provedor da Apple — não simulável localmente."
  - test: "4. Notificação de replanejamento (PUSH-03) no iPhone real: confirmar uma proposta de replanejamento numa sessão ativa dispara a notificação 'Sua semana foi ajustada.'"
    expected: "Notificação chega best-effort após a confirmação, sem travar nem falhar o replanejamento em si mesmo se a notificação falhar."
    why_human: "Depende de VAPID/produção configurados e do dispositivo real recebendo o push."
  - test: "5. Toque → sessão (PUSH-05) e badge (PUSH-04) no iPhone real: tocar na notificação de lembrete abre o app direto na tela da sessão ativa (1 toque do bloqueio ao registro); com permissão concedida e treino pendente hoje, o ícone mostra o badge e ele some após a sessão concluir; uma subscription inválida (410/404 orgânico ou simulado) some da tabela sem intervenção manual."
    expected: "Navegação direta para active-session/:sessionId; badge aparece/some corretamente; subscription expirada é removida automaticamente no próximo envio."
    why_human: "Badging API (navigator.setAppBadge) e o comportamento real de clique em notificação só são observáveis em iOS 16.4+ real com o PWA instalado — não simulável em jsdom."
gaps: []
deferred:
  - truth: "Migrations 0038/0039 aplicadas em staging e produção; credenciais VAPID/service-role de produção; deploy do backend no VPS; UAT completo no iPhone real (Roadmap Success Criteria 3, 4, 5 e a metade 'RLS por usuário em produção' do Success Criteria 2)."
    addressed_in: "Phase 13, Plano 13-04 (mesma fase, ainda não executado — ROADMAP.md mostra 'Plans: 4/5 plans executed', 13-04-PLAN.md com todas as 3 tasks `checkpoint:human-verify`)."
    evidence: "13-04-PLAN.md must_haves.truths (todas `verification: backstop`, checkpoint do dono); 13-UAT.md (status: testing, 5 testes pending); WINDOWS.md #2/#3 (open, mesma causa raiz: credencial Supabase de outra conta nesta máquina)."
---

# Phase 13: Push notification ponta a ponta Verification Report

**Phase Goal:** O aluno recebe notificações push relevantes (lembrete de
treino, replanejamento pronto) e um toque leva direto à sessão, com infra
própria (`pywebpush`) e sem SDK de terceiros.

**Verified:** 2026-08-15T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (source) | Status | Evidence |
|---|---|---|---|
| 1 | [ROADMAP SC1] Spike técnico prévio documenta o tratamento de 410/expiração no `pywebpush` ANTES da implementação | ✓ VERIFIED | `13-SPIKE.md` existe, executado 2026-08-15, veredito "GO", 4 cenários (410/404/400/201) provados por execução real. `git log` confirma o commit do spike (`6b8f1e8`, 11:25:18) precede o primeiro commit de implementação (`cbd0f58`, 12:13:14). |
| 2a | [ROADMAP SC2 — código] Botão "Ativar notificações" dispara `PushManager.subscribe()` como ação síncrona do clique (sem `await`/`fetch` antes) | ✓ VERIFIED (com nota) | `src/services/pushSubscription.ts:subscribeToPush()` é chamado dentro de `onAtivarNotificacoes` (ProfileScreen.tsx) e do onPress do convite (`PushInviteHost.tsx:90`, literalmente a primeira expressão). **Nota:** em `ProfileScreen.tsx`, o fix de code-review WR-01 (commit `8fe5eef`) inseriu `setNotifState('subscribing')` ANTES de `subscribeToPush()` — o comentário no código ainda afirma "subscribeToPush() é a PRIMEIRA expressão síncrona", o que hoje é falso literalmente (é a segunda). `setNotifState` é uma chamada síncrona pura (não introduz `await`/microtask antes do subscribe), então o mecanismo técnico que preserva o "user gesture" do iOS (nenhuma fronteira de macrotask antes do `PushManager.subscribe()` real, que só ocorre dentro do `.then()` de `navigator.serviceWorker.ready`, já resolvido) não muda — mas isto é uma alegação de engenharia, não provada em hardware real. Ver item de UAT #2b abaixo. |
| 2b | [ROADMAP SC2 — dado] Subscription gravada em `push_subscriptions` com RLS por usuário | ✓ VERIFIED (schema) / pendente (deploy) | `supabase/migrations/0038_push_subscriptions.sql` contém a tabela, RLS (`for all using/with check auth.uid() = user_id`), GRANT DML explícito incl. UPDATE, e um DO-block de asserção. **Não aplicada em nenhum ambiente vivo** (staging nem produção) — bloqueada por credencial Supabase de outra conta nesta máquina (WINDOWS.md #2, aberto). Este é exatamente o item coberto pelo checkpoint humano do Plano 13-04 (mesma fase, ainda não executado). |
| 3 | [ROADMAP SC3] UAT iPhone real: lembrete de treino no horário + notificação de replanejamento | ⏳ human_needed | Código completo e testado (57 testes pytest cobrindo `push_reminder_scheduler.py` e `/api/push/notify-replan-applied`), mas backend não deployado em produção e migrations não aplicadas — nenhuma notificação real pode ter chegado a um iPhone ainda. `13-UAT.md` (status: testing) confirma os 5 testes como `pending`. |
| 4 | [ROADMAP SC4] UAT iPhone real: toque na notificação abre direto a sessão | ⏳ human_needed | `public/push-handlers.js` implementado e testado (8 testes jest), confirmado servido em produção web (ver Artefatos) — mas depende do fluxo completo (push real chegando) para ser exercitado ponta a ponta em hardware. |
| 5 | [ROADMAP SC5] Badge gated por permissão + subscriptions 410/404 removidas sem órfãs | ✓ VERIFIED (lógica) / ⏳ human_needed (efeito visual real) | `src/utils/pushBadge.ts` cobre os 3 casos (sem suporte, permissão não concedida, Promise rejeitada) — 7 testes jest. Remoção de subscription expirada: `enviar_push()` retorna `False` só para 404/410 confirmado (contrato do spike) e `None` para allowlist rejeitada (não apaga, ver CR-01/WR-01 abaixo) — ambos os chamadores (`push_reminder_scheduler.py`, `app.py`) tratam corretamente as 3 respostas. O efeito visual real do badge no ícone (iOS 16.4+) só é observável em hardware. |
| 6 | [13-01 truth] Duplo-clique/duas abas não cria duas linhas (upsert idempotente por `on_conflict=endpoint`) | ✓ VERIFIED | `backend/tests/test_push_sender.py`/`test_push_subscribe.py` cobrem chamada dupla com o mesmo endpoint; migration usa `Prefer: resolution=merge-duplicates` + `on_conflict=endpoint`. |
| 7 | [13-01 truth] `push_sender.py` trata 410/404 como expirada (delete), outro erro propaga | ✓ VERIFIED | 4 cenários (410/404/400/201) replicados em pytest, mesmo contrato do spike; confirmado por leitura de `push_sender.py:194-240`. |
| 8 | [13-01 truth] `push-handlers.js` nunca termina o evento `push` sem `showNotification`; `notificationclick` sempre usa `waitUntil` | ✓ VERIFIED | Leitura do arquivo (55 linhas): único `showNotification` no código (fora do comentário), zero `fetch(`; `notificationclick` sempre dentro de `event.waitUntil(...)`. 8 testes jest confirmam. |
| 9 | [13-01 truth] Aluno que revoga permissão e reabre o Perfil volta ao estado "Ativar notificações" | ✓ VERIFIED | `__tests__/profileScreen.push.test.tsx` (6 testes: denied sem botão, default habilitado, subscribed→desativar→default, subscription existente no mount). |
| 10 | [13-02 truth] Scheduler às 8h America/Sao_Paulo, idempotente a restart (chave persistida, não em memória) | ✓ VERIFIED | `processar_tick(agora)` recebe "agora" como parâmetro puro (`grep` confirma zero `datetime.now()` dentro da função); 9 testes pytest incluindo duas rodadas consecutivas sem duplicar. |
| 11 | [13-02 truth] Aluno sem subscription é pulado sem erro mas a sessão recebe `reminder_sent_at` | ✓ VERIFIED | Teste dedicado (`test_sessao_sem_subscription_nao_chama_enviar_push...`); reforçado pelo fix CR-01 do review (iter1→iter2, commit `b7f662b`) que envolveu a marcação em try/except por sessão, evitando que uma falha de um aluno aborte o resto do tick. |
| 12 | [13-02 truth] `confirmReplan()` dispara `POST /api/push/notify-replan-applied` best-effort, nunca `await`ado, nunca bloqueia o replanejamento | ✓ VERIFIED | `grep -n "await apiClient.post(ENDPOINTS.PUSH.NOTIFY_REPLAN"` não retorna nada; `grep -n "NOTIFY_REPLAN"` confirma a chamada fire-and-forget com `.catch(logger.warn)`. |
| 13 | [13-02 truth] `/api/push/notify-replan-applied` só envia para as subscriptions do próprio usuário (JWT, nunca corpo) | ✓ VERIFIED | `backend/app.py:2273` usa `g.user['id']`; 6 testes em `test_push_replan_notify.py` incl. teste explícito que envia `user_id` arbitrário no corpo e confirma que é ignorado. |
| 14 | [13-03 truth] Badge chama `setAppBadge(1)`/`clearAppBadge()` só com suporte + permissão `granted`; no-op silencioso e `.catch` silencioso nos demais casos | ✓ VERIFIED | 7 testes jest cobrindo os 5 comportamentos + 2 sub-casos; `grep` confirma o gate de `Notification.permission` antes de qualquer chamada. |
| 15 | [13-05 truth] Convite único via `alertShim`, nunca reaparece (aceito ou recusado), nunca durante onboarding incompleto | ✓ VERIFIED | 7 testes jest; flag `push_invite_shown:${user.id}` escrita nos dois `onPress` (aceitar/recusar) — corrigida para ser por-usuário no fix WR-02 (13-REVIEW.iter2.md → 13-REVIEW-FIX.iter2.md). |
| 16 | [prohibition, todos os planos] `VAPID_PRIVATE_KEY` nunca hardcoded/logada, só lida de `os.environ` | ✓ VERIFIED | `grep -rn "VAPID_PRIVATE_KEY" backend/` retorna só 2 ocorrências, ambas `os.environ.get("VAPID_PRIVATE_KEY")`. |
| 17 | [prohibition, 13-02] `SUPABASE_SERVICE_ROLE_KEY` nunca usada em rota HTTP alcançável | ✓ VERIFIED | `grep -n "SUPABASE_SERVICE_ROLE_KEY" backend/app.py` retorna vazio; só aparece em `push_reminder_scheduler.py` (processo interno) e no teste correspondente. |
| 18 | [prohibition, 13-01] Upsert de `push_subscriptions` nunca aceita endpoint fora da allowlist (SSRF) | ✓ VERIFIED (reforçado no loop de review) | Ver seção "Review→Fix loop" abaixo — o achado crítico CR-01 (bypass via escrita direta no PostgREST) foi corrigido (commit `7319fbe`) revalidando o allowlist no ponto de envio real (`enviar_push`), não só no gate de escrita. |

**Score:** 15/18 truths fully VERIFIED at the automatable level; 3 (rows 3, 4, and the deploy half of row 2b/5) require production infra + real-iPhone UAT, explicitly deferred to the not-yet-executed Plano 13-04 within this same phase — no behavior was left silently unproven.

### Review→Fix Loop (independently re-verified)

Three review iterations ran against this phase (`13-REVIEW.iter2.md` →
`13-REVIEW-FIX.iter2.md` → `13-REVIEW.iter3.md` → `13-REVIEW-FIX.iter3.md`
[labeled iteration 2 internally] → `13-REVIEW.md` → `13-REVIEW-FIX.md`
[iteration 3, final]). All commits claimed as fixes exist in `git log`
(`8fe5eef`, `7319fbe`, `62a18eb`, `c891b8f`, `cf70e4b`, `b7f662b`, `a0078c1`
— all confirmed present via `git cat-file -e`). Independently re-read the
live code (not the SUMMARY narrative) for each claimed fix:

| Finding | Fix commit | Independently confirmed in live code |
|---|---|---|
| CR-01 (iter2): SSRF allowlist bypassable via direct PostgREST write | `7319fbe` | ✓ `push_sender.py:234` re-checks `endpoint_e_permitido()` inside `enviar_push()`, before building `subscription_info`/calling `webpush()`. |
| WR-01 (iter1): `notifState` never reaches `'subscribing'`, dead disabled guard | `8fe5eef` | ✓ present, but introduced the ordering nuance noted in Truth #2a above. |
| WR-01 (iter2, logout leak): no `unsubscribeFromPush()` on `signOut()` | `62a18eb`/`c891b8f` | ✓ `AuthContext.js:153-157` calls `unsubscribeFromPush()` guarded by `isPushSupported()`, fire-and-forget, before the blocking `supabase.auth.signOut()`. |
| WR-02 (iter1): `push_invite_shown` not scoped per user | (part of iter2 fix set) | ✓ `PushInviteHost.tsx:58` — `push_invite_shown:${user.id}`. |
| WR-02 (iter2): reminder body leaked session title on lock screen | `cf70e4b` | ✓ `push_reminder_scheduler.py:173` — fixed generic string `"Confira seu treino de hoje."`; `sessao["title"]` no longer read in the payload. |
| CR-01 fault-isolation (iter1): unhandled exception in `_marcar_lembrete_enviado` aborts rest of tick | `b7f662b` | ✓ both call sites of `_marcar_lembrete_enviado` inside `processar_tick`'s loop wrapped in their own `try/except Exception: logger.exception(...)`. |
| WR-01 (iter3, final): `False` conflated "confirmed 404/410" with "allowlist refused" — both deleted the subscription | `a0078c1` | ✓ `enviar_push()` now returns `True`/`False`/`None` (three states); both callers have an explicit `elif sucesso is None: continue` that skips the send WITHOUT deleting. |
| IN-02 (iter3, final): 3 of 4 `PUSH_SERVICE_HOST_SUFFIXES` lacked a leading-dot boundary | `a0078c1` | ✓ `endpoint_e_permitido()` now checks `hostname == sufixo or hostname.endswith("." + sufixo)` uniformly. |
| WR-04 (iter1): no length bound on subscribe fields | (iter1→iter2 fix set) | ✓ `MAX_PUSH_SUBSCRIPTION_FIELD_BYTES = 2 * 1024` checked in `backend/app.py:2177` before allowlist/upsert. |
| WR-03 (iter1): no real-Postgres RLS test | (structural mitigation) | Partially addressed — `backend/tests/test_migration_push_subscriptions.py` parses the migration text (structural check), not a live-RLS integration test. Explicitly documented as a residual, owner-acknowledged gap (no Docker/local Postgres available in this environment) rather than silently dropped — carried forward, not re-raised as a new finding in iteration 3. |
| IN-01: `client.navigate()` not awaited before `client.focus()` | Not applied (explicit user direction) | Confirmed unchanged, still info-level/optional — not a functional bug (test only asserts `navigate` was called with the right URL). |

No unresolved CRITICAL or WARNING findings remain in the final review
(`13-REVIEW.md`, iteration 3: 0 critical, 1 warning fixed in the same pass,
2 info carried forward as explicitly non-blocking).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/0038_push_subscriptions.sql` | Tabela + RLS + GRANT DML | ✓ VERIFIED (file) / ⏳ not applied to any live DB | 86 lines, well-formed, DO-block asserts policy+grants. |
| `supabase/migrations/0039_push_reminder_idempotencia.sql` | `reminder_sent_at` + índice parcial | ✓ VERIFIED (file) / ⏳ not applied to any live DB | 63 lines, DO-block asserts column+index. |
| `backend/services/push_sender.py` | CRUD + `enviar_push()` (410/404 contrato, allowlist SSRF) | ✓ VERIFIED, WIRED | 265 lines; allowlist re-validated at send-time (CR-01 fix). |
| `backend/services/push_reminder_scheduler.py` | Scheduler diário, idempotente | ✓ VERIFIED, WIRED | 253 lines; `iniciar_scheduler()` called at `backend/app.py` module import (confirmed by `key-decisions` + grep), gated by `PUSH_REMINDER_SCHEDULER_ENABLED`. |
| `src/services/pushSubscription.ts` | subscribe/unsubscribe/state helpers | ✓ VERIFIED, WIRED | 91 lines; used by `ProfileScreen.tsx` and `PushInviteHost.tsx`. |
| `public/push-handlers.js` | push/notificationclick handlers | ✓ VERIFIED, WIRED, **DEPLOYED** | 55 lines; `curl https://forca-app-six.vercel.app/push-handlers.js` (HTTP 200) is byte-identical (`diff`) to the local file; `sw.js` on the same domain contains `importScripts("push-handlers.js")` and precaches it with a matching revision hash. |
| `src/utils/pushBadge.ts` | Badge gated by support+permission | ✓ VERIFIED, WIRED | 42 lines; used by `HomeScreen.tsx`. |
| `src/components/PushInviteHost.tsx` | Convite único de opt-in | ✓ VERIFIED, WIRED | 119 lines; mounted in `App.tsx` after `AlertHost`. |
| `backend/tests/test_push_sender.py`, `test_push_subscribe.py`, `test_push_reminder_scheduler.py`, `test_push_replan_notify.py` | pytest coverage | ✓ VERIFIED | 57/57 passed when run in isolation; 681/681 in the full backend suite (independently re-run, matches claimed number). |
| `__tests__/pushHandlers.test.ts`, `pushBadge.test.ts`, `pushInviteHost.test.tsx`, `profileScreen.push.test.tsx`, `serviceWorkerConfig.test.ts` | jest coverage | ✓ VERIFIED | All 6 phase-specific suites pass (46 tests); full jest suite 1808/1808 passed (independently re-run, matches claimed number). |

### Data-Flow Trace (Level 4)

Not applicable in the classic "renders dynamic data" sense — this phase's
runtime data flow (push delivery, badge state, subscription rows) is
inherently server/hardware-dependent and is covered by the UAT items above
rather than a client-render trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full backend test suite (existence + pass, run once) | `.venv/bin/python3 -m pytest backend/tests/ -q` | `681 passed, 1 warning` | ✓ PASS (matches SUMMARY/REVIEW-FIX claim exactly) |
| Full frontend test suite (existence + pass, run once) | `npx jest --silent` | `160 suites, 1808 tests passed` | ✓ PASS (matches claim exactly) |
| Type check | `npx tsc --noEmit -p .` | exit 0, no output | ✓ PASS |
| Production service worker wiring | `curl .../sw.js \| grep importScripts` | `importScripts("push-handlers.js")` present | ✓ PASS — deployed web build genuinely includes the handlers, not just claimed in a SUMMARY |
| Production push-handlers.js integrity | `curl .../push-handlers.js` + `diff` vs local file | byte-identical | ✓ PASS |
| Allowlist SSRF fix re-check | `grep endpoint_e_permitido backend/services/push_sender.py` | present inside `enviar_push()`, not just `handle_push_subscribe` | ✓ PASS |
| VAPID key never hardcoded | `grep -rn VAPID_PRIVATE_KEY backend/` | only `os.environ.get(...)` reads | ✓ PASS |
| `SUPABASE_SERVICE_ROLE_KEY` never in an HTTP route | `grep SUPABASE_SERVICE_ROLE_KEY backend/app.py` | empty | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention found and none declared in any
PLAN/SUMMARY of this phase — Step 7c skipped (no probes declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PUSH-01 | 13-01, 13-05 | Infra de push ponta a ponta, gesto síncrono, tabela RLS, envio via pywebpush | ✓ SATISFIED (code) / ⏳ pending deploy | Migration file + endpoints + opt-in UI + service worker all present and tested; DB not live. |
| PUSH-02 | 13-02 | Lembrete de treino no dia/horário configurado | ✓ SATISFIED (code) / ⏳ pending UAT | Scheduler tested, gated, wired at import; not yet running in production. |
| PUSH-03 | 13-02 | Notificação de replanejamento pronto | ✓ SATISFIED (code) / ⏳ pending UAT | Endpoint + best-effort hook tested; not yet exercised end-to-end. |
| PUSH-04 | 13-03 | Badge gated por permissão | ✓ SATISFIED (code) / ⏳ pending UAT | Logic fully tested; real-device visual effect unverified. |
| PUSH-05 | 13-01 | 1 toque abre direto a sessão | ✓ SATISFIED (code, deployed to web) / ⏳ pending UAT | `notificationclick` handler tested and confirmed deployed to production web build; real notification tap not yet exercised. |

No orphaned requirements — REQUIREMENTS.md maps exactly PUSH-01..05 to
Phase 13, and every one appears in at least one plan's `requirements`
frontmatter. **Note:** REQUIREMENTS.md marks all 5 as "Complete" already
(`[x]`), which is optimistic relative to the roadmap's own tracking
("4/5 plans executed") and the still-`pending` 13-UAT.md — this verification
does not change REQUIREMENTS.md, but flags the discrepancy for the human
checkpoint.

### Anti-Patterns Found

None. Scanned all 14 phase-modified source files for `TBD`/`FIXME`/`XXX`/
`TODO`/`HACK`/`PLACEHOLDER`/"not implemented"/"coming soon" (case-insensitive)
and for stub-shaped returns — the handful of matches were false positives
(the Portuguese word "todo", an existing pre-phase comment in `HomeScreen.tsx`
about weekly goals, and "hack" appearing only inside "backend" strings by
substring). No debt markers requiring a `#issue` reference were introduced by
this phase.

### Human Verification Required

See the `human_verification` block in the frontmatter above — it mirrors and
extends `13-UAT.md` (currently `status: testing`, 5/5 tests `pending`),
adding one specific observation (item 2b) about the `setNotifState` ordering
change in `ProfileScreen.tsx` that the code-review loop introduced without
updating the stale "primeira expressão síncrona" comment.

### Gaps Summary

**No blocking gaps.** Every automatable truth for this phase (all 4 completed
plans: 13-01, 13-02, 13-03, 13-05) is genuinely implemented, tested, and — for
the web-deployable pieces (service worker) — confirmed live in production,
not just claimed in a SUMMARY.md. The three-iteration review→fix loop closed
every CRITICAL and WARNING finding it raised, and each fix was independently
re-confirmed against the live code in this verification (not re-trusted from
the fix reports).

What remains is exactly what the phase's own plan structure already scoped
as a separate, not-yet-executed, fully-human plan: **13-04** (migrations in
production, VAPID/service-role secrets on the VPS, backend deploy, and real
iPhone UAT). This is not a silently-dropped gap — it is tracked in
`.planning/WINDOWS.md` (#2, #3, both `open`), documented as a blocker in
every SUMMARY.md that touched a migration, and is the explicit subject of
`13-UAT.md`. Per the deferred-items rule (Step 9b), the 3 roadmap success
criteria that require live infrastructure (SC3, SC4, SC5's device-visual half,
and SC2's deploy half) are recorded as `deferred` to Plano 13-04 within this
same phase, not as gaps against this verification.

One implementation nuance is flagged for the dono's attention during UAT
(item 2b): the WR-01 code-review fix (`8fe5eef`) made `setNotifState('subscribing')`
run before `subscribeToPush()` in `ProfileScreen.tsx`, contradicting both the
adjacent code comment and the review's own claim that "subscribeToPush()
remains the first synchronous expression." Technically this should not break
iOS gesture preservation (no `await`/microtask boundary was introduced before
the real `PushManager.subscribe()` call, which itself only fires inside a
`.then()` on an already-resolved promise), but this is an engineering
argument, not a hardware-proven fact — worth an explicit tap-test during UAT
#2.

---

_Verified: 2026-08-15T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
