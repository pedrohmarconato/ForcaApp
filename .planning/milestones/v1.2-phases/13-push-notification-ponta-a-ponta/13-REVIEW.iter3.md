---
phase: 13-push-notification-ponta-a-ponta
reviewed: 2026-08-15T18:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - supabase/migrations/0038_push_subscriptions.sql
  - supabase/migrations/0039_push_reminder_idempotencia.sql
  - backend/services/push_sender.py
  - backend/services/push_reminder_scheduler.py
  - backend/app.py
  - src/services/pushSubscription.ts
  - src/screens/ProfileScreen.tsx
  - src/components/PushInviteHost.tsx
  - src/utils/pushBadge.ts
  - src/screens/HomeScreen.tsx
  - src/store/activeSessionStore.ts
  - public/push-handlers.js
  - workbox-config.cjs
  - App.tsx
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-08-15T18:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Iteration 2 re-review. All five findings from `13-REVIEW.md` iteration 1
(CR-01, WR-01..WR-04) were verified against the live code and the commits
that claim to fix them (`b7f662b`, `8fe5eef`, `b25e4df`, `e49d77a`,
`dc22bef`):

- **CR-01** (scheduler loop aborted by an unhandled exception while marking
  `reminder_sent_at`) — **confirmed fixed**. Both call sites inside
  `processar_tick`'s `for sessao in candidatos:` loop are now individually
  wrapped in `try/except Exception: logger.exception(...)`, matching the
  existing pattern already used for `enviar_push`/`delete_subscription`. The
  wrapping is scoped to the single PATCH call, not the whole loop body or the
  whole tick, so it does not swallow unrelated failures and every exception is
  still logged (with the session id), so a systemic failure (e.g.
  misconfigured `SUPABASE_URL`) remains visible in logs, just not fatal to the
  tick. Confirmed via `git show b7f662b` and by running
  `backend/tests/test_push_reminder_scheduler.py` (passes, including the two
  new regression tests for this exact failure mode).
- **WR-01** (`notifState` never reached `'subscribing'`, dead disabled guard)
  — **confirmed fixed**. `onAtivarNotificacoes` now calls
  `setNotifState('subscribing')` as its second synchronous statement
  (`subscribeToPush()` remains the first, preserving the iOS gesture
  requirement), and the failure branch explicitly resets to `'default'`
  unless the browser denied permission, so the button does not get stuck
  disabled after a transient failure. `__tests__/profileScreen.push.test.tsx`
  passes.
- **WR-02** (`push_invite_shown` AsyncStorage key not scoped per user) —
  **confirmed fixed and verified for the logout/account-switch flow**. The
  key is now `` `push_invite_shown:${user.id}` ``, computed inside the effect
  that already depends on `user.id`. `__tests__/pushInviteHost.test.tsx`
  exercises exactly the two-account-same-storage scenario and passes.
- **WR-03** (no live-Postgres RLS test) — addressed with a structural test
  (`backend/tests/test_migration_push_subscriptions.py`, parses the migration
  text) plus an explicitly documented residual gap (no Docker/Supabase local
  available on this machine) that the fix report calls out as pending
  staging validation. This is an owner-acknowledged residual risk, not a
  silently dropped finding, so it is not re-raised here as a Warning.
- **WR-04** (no length bound on `endpoint`/`p256dh`/`auth_key`) — **confirmed
  fixed**. `MAX_PUSH_SUBSCRIPTION_FIELD_BYTES = 2 * 1024` is checked before
  `endpoint_e_permitido()`/`upsert_subscription()`. `backend/tests/test_push_subscribe.py`
  passes.
- **IN-01** (`client.navigate()` not awaited before `client.focus()`) —
  unchanged, still present, still Info-level (harmless in practice per the
  original finding).

No regressions were found in the five fixed diffs themselves. However, this
iteration's full re-read of the reviewed file set surfaced **one new Critical
finding** (a bypassable SSRF allowlist — the exact threat class the code's
own comments claim to have closed) and **two new Warnings** (a cross-account
push-subscription-reassignment gap on shared devices, and a reminder payload
that violates the project's own documented shared-device mitigation). These
are pre-existing issues in the original Phase 13 implementation, not
regressions introduced by the iteration-1 fix commits — none of the four
touched files for those fixes (`push_reminder_scheduler.py` lines 148/190
only, `ProfileScreen.tsx`, `PushInviteHost.tsx`, `app.py` lines
271-281/2170-2178) overlap with the code paths below.

## Critical Issues

### CR-01: `endpoint_e_permitido()` allowlist is enforced only at the Flask entry point — direct PostgREST writes bypass it entirely, turning the backend into an authenticated SSRF proxy

**File:** `backend/services/push_sender.py:55-73,180-217`, `backend/app.py:2235-2293`, `backend/services/push_reminder_scheduler.py:171-185`, `supabase/migrations/0038_push_subscriptions.sql:22-50`

**Issue:**
The SSRF mitigation documented in `13-RESEARCH.md` ("Known Threat Patterns")
and referenced in both `push_sender.py:20-23` ("mitigação do achado de
Tampering/SSRF... sem isto, `/api/push/subscribe` viraria um proxy
autenticado que aceita POST assinado para QUALQUER endpoint") and
`app.py:2148-2150` ("T-13-01, mitigação: endpoint_e_permitido") is
`endpoint_e_permitido()`, which checks that a subscription's `endpoint`
hostname ends in a known push-service suffix (Apple/Google/Mozilla).

That function is called **exactly once** in the entire backend:
`backend/app.py:2180`, inside `handle_push_subscribe` (the `POST
/api/push/subscribe` route). It is **never** called at the point where a
push is actually sent — `push_sender.enviar_push()` (`push_sender.py:180-217`)
builds `subscription_info` straight from `subscription_row["endpoint"]` and
calls `webpush(...)` with no validation. Both call sites of `enviar_push`
(`app.py:2273` in `handle_push_notify_replan`, and
`push_reminder_scheduler.py:173` in `processar_tick`) read subscription rows
back out of `push_subscriptions` and pass them straight through — neither
re-checks the allowlist either.

This matters because `handle_push_subscribe` is **not** the only way a row
can land in `push_subscriptions`. Migration 0038 grants `INSERT`/`UPDATE` on
the table directly to the `authenticated` Postgres role
(`grant select, insert, update, delete on table public.push_subscriptions to
authenticated`, line 50), and the RLS policy only checks row ownership
(`for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`,
lines 44-45) — it does not, and structurally cannot via a simple RLS policy,
validate the *content* of `endpoint`. This codebase's own established
pattern (documented explicitly in `push_sender.py:2-4`: "mesmo padrão de
`plan_repository.py`: anon key + `Authorization: Bearer <token do usuário>`,
RLS aplica") is for the app/any authenticated client to talk to Supabase
PostgREST **directly**, using the public `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(bundled client-side, confirmed in `src/config/supabaseClient.js:7-8`) plus
the user's own session JWT. Any authenticated user can therefore:

1. `POST {SUPABASE_URL}/rest/v1/push_subscriptions` directly (bypassing the
   Flask backend and `endpoint_e_permitido()` entirely) with their own
   `user_id` and an arbitrary `endpoint`, e.g.
   `http://169.254.169.254/latest/meta-data/` or an internal service URL.
   RLS's `with check (auth.uid() = user_id)` is satisfied trivially because
   it's their own account.
2. Immediately call `POST /api/push/notify-replan-applied` with their own
   JWT (rate-limited to 20/60s, no other gate) — `handle_push_notify_replan`
   calls `listar_subscriptions(user_id, g.access_token)` (`app.py:2248`),
   which returns **all** of that user's subscription rows including the
   malicious one, then loops and calls `enviar_push()` on each
   (`app.py:2273`) with no allowlist re-check.
3. `pywebpush.webpush()` performs a real, VAPID-signed HTTP POST from the
   backend server to whatever `endpoint` was stored — a classic authenticated
   SSRF, on demand, at will, from any account with zero privilege escalation.

The same bypass is reachable passively via the daily reminder scheduler
(`push_reminder_scheduler.py:171-175`) if the attacker has a pending session
scheduled for today.

This is exactly the "Endpoint `endpoint` malicioso... vira um proxy de SSRF
autenticado" threat the phase's own research doc and code comments claim to
have closed — the mitigation exists but is checked at a layer the attacker
can trivially route around, not at the layer that actually matters (the
outbound send) or at the data layer (a DB constraint).

**Fix:** Re-check the allowlist at the point of actual send, not just at the
write gate — this closes the hole regardless of how the row entered the
table:
```python
# backend/services/push_sender.py
def enviar_push(
    subscription_row: dict,
    payload: str,
    vapid_private_key: str,
    vapid_subject: str,
) -> bool:
    if not endpoint_e_permitido(subscription_row.get("endpoint") or ""):
        # Subscription não aponta para um push service conhecido. RLS só
        # garante ownership, não valida o CONTEÚDO de `endpoint` — uma linha
        # maliciosa pode chegar aqui via escrita direta no PostgREST,
        # contornando handle_push_subscribe. Trata como sempre-inválida:
        # nunca envia (mesmo contrato de "não mascarar", mas aqui a decisão
        # é NUNCA tentar), devolve False para o chamador apagar a linha.
        return False
    subscription_info = {...}
    ...
```
Also add a defense-in-depth `CHECK` constraint on `push_subscriptions.endpoint`
in a follow-up migration (regex-restricted to the known push-service hosts),
so the invariant holds even for rows inserted by a future code path that
forgets to call `enviar_push`. Add a regression test that inserts a
subscription row bypassing `endpoint_e_permitido` (simulating the direct-write
path) and asserts `enviar_push` refuses to call `webpush()`.

## Warnings

### WR-01: No unsubscribe on logout — a shared browser/device can silently reassign or leak another account's push subscription

**File:** `src/services/pushSubscription.ts:72-81`, `src/screens/ProfileScreen.tsx:173-180`, `backend/services/push_sender.py:76-118`, `supabase/migrations/0038_push_subscriptions.sql:36-39`

**Issue:** `unsubscribeFromPush()` exists but is only ever invoked from the
manual "Desativar notificações" button in `ProfileScreen.tsx` — it is never
called from `AuthContext.js`'s `signOut()` (confirmed: `unsubscribeFromPush`
has exactly three call sites in the repo, none in the auth context or any
sign-out path). A browser Push subscription is scoped to the **origin +
service worker registration**, not to the logged-in account, and
`push_subscriptions.endpoint` is `unique` with the write path being an
`on_conflict=endpoint` upsert (by design, per the migration's own comment:
"reassinar substitui em vez de duplicar"). On a shared browser/device (family
tablet, gym/trainer device, QA account swap) this produces two concrete
failure modes once account A logs out without deactivating notifications and
account B logs in on the same browser:
1. If B taps "Ativar notificações", the upsert silently **reassigns A's
   existing subscription row to B** (same `endpoint`, `on_conflict` overwrites
   `user_id`) — A stops receiving legitimate reminders with no indication to
   either party that ownership changed.
2. If B never explicitly subscribes, `getExistingSubscriptionState()`
   (`ProfileScreen.tsx:188`) still detects the pre-existing browser-level
   subscription and flips B's UI straight to "subscribed" — but the backend
   row is still owned by A. A's next `push_reminder_scheduler` tick or
   replan-notify then delivers **A's session-title push notification to B's
   screen** (the device B is currently holding), even though B's UI shows
   "notifications are active" for what B believes is their own account.

**Fix:** Call `unsubscribeFromPush()` (best-effort, non-blocking, same
pattern as the existing fire-and-forget replan notification) from
`signOut()` in `src/contexts/AuthContext.js`, so a logged-out account's
subscription is torn down before another account can inherit it on the same
device. This does not fully close the shared-device risk (a user can still
decline the browser's unsubscribe or the network call can fail), but it
removes the default/common path where the app itself never even attempts
cleanup.

### WR-02: Daily reminder push body includes the session title, contradicting the project's own documented shared-device mitigation

**File:** `backend/services/push_reminder_scheduler.py:161-170`

**Issue:** `13-RESEARCH.md` ("Known Threat Patterns for esta stack") explicitly
lists "Payload de notificação com dado sensível (ex.: nome completo,
**detalhe de treino**) exposto na tela de bloqueio" as an Information
Disclosure threat, with the documented mitigation: "Manter o payload
genérico ('Hora do treino!'), sem dado que o dono não queira visível na tela
de bloqueio de um device compartilhado." The replan-notify payload
(`app.py:2262-2266`) follows this correctly — fully generic text ("Sua
semana foi ajustada. Toque para ver."). The daily reminder payload does not:
```python
"body": "{} está te esperando.".format(sessao.get("title") or "Seu treino"),
```
`sessao["title"]` is the student's actual workout/session name (e.g. "Peito
e Tríceps", "Treino A"), which is precisely the "detalhe de treino" example
the threat table calls out — it will render on a locked device's
notification banner/lock screen, visible to anyone with physical access,
including in the shared-device scenario WR-01 describes.

**Fix:** Drop the session title from the reminder body and use the same
fully-generic pattern already used for the replan notification, e.g.
`"body": "Confira seu treino de hoje."`, keeping the deep-link `url` (which
is not visible on the lock screen) as the only place session-specific
information travels.

## Info

### IN-01: `client.navigate()` not awaited before `client.focus()`

**File:** `public/push-handlers.js:44-49`
**Issue:** `client.navigate(url)` returns a Promise that resolves once
navigation completes, but the code calls `client.focus()` immediately
without awaiting it. In practice browsers tolerate this (navigate + focus
racing is harmless here since both target the same client), and the test
suite only asserts `navigate` was called with the right URL, not ordering —
so this is not a functional bug, just slightly imprecise sequencing.
Unchanged since iteration 1; still not required.
**Fix (optional):** `return client.navigate(url).then(() => 'focus' in client ? client.focus() : client);` for stricter sequencing, though not required.

---

_Reviewed: 2026-08-15T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
