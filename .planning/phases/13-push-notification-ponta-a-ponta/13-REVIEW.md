---
phase: 13-push-notification-ponta-a-ponta
reviewed: 2026-08-15T00:00:00Z
depth: standard
files_reviewed: 20
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
  - backend/tests/test_push_sender.py
  - backend/tests/test_push_subscribe.py
  - backend/tests/test_push_reminder_scheduler.py
  - backend/tests/test_push_replan_notify.py
  - __tests__/pushHandlers.test.ts
  - __tests__/pushInviteHost.test.tsx
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-08-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The Web Push implementation (RLS/GRANT migration, subscribe/unsubscribe/notify-replan
endpoints, reminder scheduler, service worker handlers, and the two frontend opt-in
paths) is generally solid: the SSRF allowlist on outbound push endpoints, the RLS
policy + GRANT on `push_subscriptions`, the JWT-derived (never body-derived)
`user_id` on write/delete, the fire-and-forget replan notification, and the
service-worker guard against silent push are all correctly implemented and match
the invariants the plan calls out.

One real reliability bug was found in the reminder scheduler: an unhandled
exception while marking one student's `reminder_sent_at` aborts the rest of that
tick's candidate loop, which directly contradicts the "one student's failure must
never affect the others" invariant the code's own comments assert. Four warnings
cover a dead UI state, a cross-account AsyncStorage leak in the invite host, a
coverage gap on the specific RLS-isolation attack this phase was built to defend
against, and unbounded field lengths on the subscribe payload.

## Critical Issues

### CR-01: Exception while marking `reminder_sent_at` aborts the rest of the tick's students

**File:** `backend/services/push_reminder_scheduler.py:148` and `backend/services/push_reminder_scheduler.py:190`
**Issue:**
`processar_tick` iterates `candidatos` (one per pending session/student) and, for
every student, calls `_marcar_lembrete_enviado(sessao["id"], quando_iso)` — once
directly when the student has no subscription (line 148), and once
unconditionally after the per-subscription send loop (line 190). Unlike the
`push_sender.enviar_push` / `push_sender.delete_subscription` calls just above it
(which are wrapped in `try/except Exception` at lines 162-175 and 181-189
specifically so "uma falha numa subscription não impede as demais"),
`_marcar_lembrete_enviado` itself is **not** wrapped in any try/except. It issues
a PostgREST `PATCH` and calls `response.raise_for_status()`
(`push_reminder_scheduler.py:116`), which raises `requests.exceptions.HTTPError`
on any 4xx/5xx from PostgREST, and `requests.get`/`requests.patch` can also raise
`requests.RequestException` on a transient network error.

When that happens for student N (out of M candidates), the exception propagates
straight out of the `for sessao in candidatos:` loop and out of `processar_tick`
itself — there is no try/except around the loop in `processar_tick`, only around
the outer call in `_loop()` (lines 195-204). The result: students N+1..M in that
tick never get a push attempt at all this tick, and the tick silently ends after
being logged by `_loop()`'s `except Exception: logger.exception(...)`. Because
the reminder window is gated to a single wall-clock hour
(`agora_local.hour != REMINDER_HOUR`, line 125) and the candidate query filters
on **today's** `scheduled_date` (line 70), a student pushed past the last tick of
the hour by this failure silently never receives a reminder that day — no retry,
no alert, no log calling out which students were skipped.

This is exactly the failure mode flagged as a priority to attack for this phase:
"exceção num aluno não pode matar o loop dos demais." The current code protects
against failures in `enviar_push`/`delete_subscription`, but not against failures
in the idempotency-marking call itself, which sits in the same per-student loop.

**Fix:**
```python
for sessao in candidatos:
    subscriptions = subs_por_usuario.get(sessao["user_id"]) or []
    if not subscriptions:
        try:
            _marcar_lembrete_enviado(sessao["id"], quando_iso)
        except Exception:
            logger.exception(
                "Falha ao marcar lembrete (sem subscription) da sessão %s.",
                sessao["id"],
            )
        continue

    ...  # envio de push por subscription (já protegido)

    try:
        _marcar_lembrete_enviado(sessao["id"], quando_iso)
    except Exception:
        logger.exception(
            "Falha ao marcar reminder_sent_at da sessão %s — será reprocessada "
            "no próximo tick dentro da mesma hora, se houver.",
            sessao["id"],
        )
```
Consider also wrapping the initial `_candidatos_do_dia`/`_subscriptions_por_usuarios`
calls (or at least documenting that a failure there aborts the whole tick, which is
a much smaller blast radius than losing only the tail of the candidate list).

## Warnings

### WR-01: `notifState` is never set to `'subscribing'` — the disabled guard is dead code

**File:** `src/screens/ProfileScreen.tsx:149-161` (state declared at line 44, used at line 290)
**Issue:**
`NotifState` includes `'subscribing'`, and the "Ativar notificações" button reads
`disabled={notifState === 'subscribing'}` (line 290) to prevent a second tap while
the first `subscribeToPush()` call is in flight. But `onAtivarNotificacoes`
(lines 149-161) never calls `setNotifState('subscribing')` — it goes straight from
whatever the current state is to `.then(() => setNotifState('subscribed'))` on
success. Since the state is never `'subscribing'`, the button is **never actually
disabled** while the async subscribe chain (`subscribeToPush().then(apiClient.post)`)
is pending, so a fast double-tap can fire two concurrent
`PushManager.subscribe()` + `POST /api/push/subscribe` sequences. The backend
upsert is idempotent (`on_conflict=endpoint`), so this doesn't corrupt data, but
the intended UX guard against duplicate in-flight requests silently does nothing.
**Fix:** Set the state at the start of the handler and only clear it on
success/failure:
```typescript
const onAtivarNotificacoes = useCallback(() => {
  setNotifState('subscribing');
  subscribeToPush()
    .then((subJson) => apiClient.post(ENDPOINTS.PUSH.SUBSCRIBE, subJson))
    .then(() => setNotifState('subscribed'))
    .catch((err) => {
      logger.warn('[profile] falha ao ativar notificações:', err);
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setNotifState('denied');
      } else {
        setNotifState('default');
        setNotifError(true);
      }
    });
}, []);
```
Note `subscribeToPush()` is still the first synchronous expression, so this fix
does not break the iOS-gesture requirement (Critério 2).

### WR-02: `push_invite_shown` AsyncStorage flag is not scoped per user — second account on the same browser never sees the invite

**File:** `src/components/PushInviteHost.tsx:57, 73, 89`
**Issue:**
The convite-único flag is stored under a fixed, unscoped key
(`AsyncStorage.getItem('push_invite_shown')` / `.setItem('push_invite_shown', 'true')`).
On the web target (the only target where push is supported, per `isPushSupported()`),
`AsyncStorage` persists per-browser, not per-account. If account A dismisses or
accepts the invite and later account B logs into the same browser/device (shared
computer, QA/test accounts, family members), account B will **never** see the
opt-in invite, even though B never made a choice about it — the flag was set by A.
This silently defeats the "convite único" feature for every account after the
first one on a given browser.
**Fix:** Scope the key per user, e.g. `` `push_invite_shown:${user.id}` ``, when
reading/writing the flag inside the effect (which already has `user.id` in scope
via the dependency array).

### WR-03: No test exercises the actual RLS isolation on `push_subscriptions` — the specific attack this phase was built to defend against is untested

**File:** `backend/tests/test_push_sender.py`, `backend/tests/test_push_subscribe.py`, `supabase/migrations/0038_push_subscriptions.sql:43-45`
**Issue:**
Migration 0038's policy (`for all using (auth.uid() = user_id) with check
(auth.uid() = user_id)`) reads correctly by inspection, and the GRANT
assertions (`do $$ ... raise exception ...`) confirm the *privileges* exist. But
none of the Python test suites actually exercise Postgres RLS: every backend push
test mocks `requests.post`/`requests.get`/`requests.delete` at the HTTP-transport
layer (`backend/tests/test_push_sender.py:129, 145, 159, 166`;
`backend/tests/test_push_subscribe.py:69, 92, 109, 129...`), so `upsert_subscription`,
`delete_subscription`, and `listar_subscriptions` never actually hit a real (or
even a fake-Postgres) RLS-enforcing backend. There is no test proving that user B's
JWT cannot read or overwrite user A's subscription row (e.g. via the `endpoint`
`UNIQUE` + `on_conflict` upsert path, which is the one genuinely subtle interaction
between RLS and `ON CONFLICT DO UPDATE`). A future regression to the policy text
(e.g. a typo turning `with check` into a no-op, or a GRANT that widens `anon`)
would not be caught by CI.
**Fix:** Add an integration test against a real (or dockerized) Supabase/Postgres
instance — or at minimum a `psql`/pgTAP script run in CI — that: (1) inserts a
`push_subscriptions` row as user A, (2) attempts to `SELECT`/`UPDATE`/`DELETE` that
row as user B and asserts 0 rows affected/visible, and (3) attempts the
`on_conflict=endpoint` upsert as user B against A's existing `endpoint` and asserts
it fails (or is rejected) rather than silently reassigning the row to B.

### WR-04: `POST /api/push/subscribe` has no length bound on `endpoint`/`p256dh`/`auth_key`

**File:** `backend/app.py:2158-2163`
**Issue:** Unlike `questionnaireData`/`diretrizes` elsewhere in this file (which
are explicitly measured against `MAX_QUESTIONNAIRE_JSON_BYTES`/
`MAX_DIRETRIZES_JSON_BYTES` before being accepted), the push subscribe fields are
only checked for `isinstance(v, str) and v.strip()` — no upper bound. The only
backstop is the global `app.config["MAX_CONTENT_LENGTH"] = 256 * 1024` (line 61)
and the 20/60s rate limit on the route. An authenticated user can still write
near-256 KiB strings into `p256dh`/`auth`/`endpoint` repeatedly (bounded only by
rate limit), which is unusual for keys that are always ~87/22 base64url
characters in a real browser subscription.
**Fix:** Add an explicit length ceiling (e.g. 2 KB combined, generous for any real
VAPID key material) and reject anything larger with 400, consistent with the
pattern already used for the other JSON-body endpoints in this file.

## Info

### IN-01: `client.navigate()` not awaited before `client.focus()`

**File:** `public/push-handlers.js:44-49`
**Issue:** `client.navigate(url)` returns a Promise that resolves once navigation
completes, but the code calls `client.focus()` immediately without awaiting it.
In practice browsers tolerate this (navigate + focus racing is harmless here
since both target the same client), and the test suite
(`__tests__/pushHandlers.test.ts:111-129`) only asserts `navigate` was called
with the right URL, not ordering — so this is not a functional bug, just slightly
imprecise sequencing.
**Fix (optional):** `return client.navigate(url).then(() => 'focus' in client ? client.focus() : client);` for stricter sequencing, though not required.

---

_Reviewed: 2026-08-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
