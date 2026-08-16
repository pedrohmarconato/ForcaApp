---
phase: 13-push-notification-ponta-a-ponta
reviewed: 2026-08-15T20:00:00Z
depth: standard
files_reviewed: 15
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
  - src/contexts/AuthContext.js
  - public/push-handlers.js
  - workbox-config.cjs
  - App.tsx
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-08-15T20:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Iteration 3 (final) re-review. All findings raised in iteration 2
(`13-REVIEW.iter3.md`) were verified against the live code and the commits
that claim to fix them:

- **CR-01** (SSRF: `endpoint_e_permitido()` enforced only at
  `handle_push_subscribe`, bypassable via a direct PostgREST write) —
  **confirmed fixed**. `push_sender.enviar_push()` (`backend/services/push_sender.py:206-207`)
  now re-validates `endpoint_e_permitido(subscription_row.get("endpoint") or "")`
  at the point of actual send, before building `subscription_info` or calling
  `webpush()`, closing the hole regardless of how the row entered
  `push_subscriptions` (commit `7319fbe`).
- **WR-01** (no unsubscribe on logout — shared-device subscription
  reassignment/leak) — **confirmed fixed and non-regressive**.
  `AuthContext.js:153-157` calls `unsubscribeFromPush()` guarded by
  `isPushSupported()`, fire-and-forget (never `await`ed), with its own
  `.catch()` that only logs — it runs *before* `await
  supabase.auth.signOut()` (line 160) but does not block on it, so a slow or
  failing browser unsubscribe/network call cannot delay or fail the logout
  itself. Confirmed by re-reading the full `signOut()` body: `setSession(null)`
  /`setUser(null)`/`setProfile(null)` execute unconditionally afterward,
  independent of the push call's outcome.
- **WR-02** (reminder payload leaked the session title on the lock screen) —
  **confirmed fixed**. `push_reminder_scheduler.py:173` now sends the fixed
  generic string `"Confira seu treino de hoje."`; `sessao["title"]` is no
  longer read anywhere in the payload construction, only used for logging.
- **IN-01** (`client.navigate()` not awaited before `client.focus()`,
  `public/push-handlers.js:44-49`) — unchanged, still present, still
  info-level and harmless in practice (both target the same client). Carried
  forward, not re-argued in detail below.

No regressions were found in the three fixed code paths themselves, and the
allowlist (`PUSH_SERVICE_HOST_SUFFIXES`) correctly matches real endpoint
hosts for Apple (`web.push.apple.com` → `.push.apple.com` suffix), Google/FCM
(`fcm.googleapis.com`, exact match) and Mozilla
(`updates.push.services.mozilla.com` / `push.services.mozilla.com`), so the
iteration-2 CR-01 fix does not, today, delete any subscription from those
three vendors.

This iteration's full re-read of the reviewed file set surfaced one new
Warning: the iteration-2 CR-01 fix changed what a `False` return from
`enviar_push()` *means* (it now covers both "confirmed 404/410 from the push
service" and "our own allowlist refused to even try"), but every caller
still treats `False` as unconditional grounds to `delete_subscription()`,
identically for both cases. Two Info-level notes are also included.

## Warnings

### WR-01: `enviar_push()` returning `False` for an allowlist rejection is treated identically to a confirmed 404/410 — every caller deletes the subscription either way

**File:** `backend/services/push_sender.py:195-230`, `backend/services/push_reminder_scheduler.py:194-207`, `backend/app.py:2279-2290`

**Issue:**
Before the iteration-2 CR-01 fix, `enviar_push()` returning `False` had exactly
one meaning: the push service itself responded 404/410, i.e. "this
subscription is confirmed gone." That is the contract both callers document
and rely on when they unconditionally call `delete_subscription()` on
`False` — `push_reminder_scheduler.py:197-198` ("`enviar_push` devolveu
`False`: subscription expirada (404/410, contrato provado em 13-SPIKE.md) —
apaga.") and `app.py:2282-2283` (identical comment).

The CR-01 fix added a second, unrelated reason for `False`:
`push_sender.py:206-207` now returns `False` *before ever attempting to
send* whenever `endpoint_e_permitido()` rejects the stored `endpoint` — i.e.
"our allowlist doesn't recognize this host," which says nothing about
whether the push service itself considers the subscription valid. The
function's own docstring acknowledges this precisely (`push_sender.py:202-204`:
"Recusa (nunca envia) e devolve False pelo MESMO contrato do 404/410 — os
chamadores já tratam False como 'subscription inválida, apagar linha'"), but
neither caller was updated to distinguish the two cases — both still delete
on any `False`, with a log message ("subscription expirada") that assumes
the 404/410 case specifically.

Today this is not observable in production because the allowlist
(`PUSH_SERVICE_HOST_SUFFIXES`) happens to cover every push-service host this
app's own frontend can produce (`isPushSupported()` is web-only; Apple/FCM/
Mozilla are the only vendors reachable from the supported browsers). But the
conflation is a latent landmine: if any push provider ever migrates its web
push relay domain (this has happened historically, e.g. Google's own FCM/GCM
endpoint moved from `android.googleapis.com/gcm/send` to
`fcm.googleapis.com`), or if the allowlist is ever edited with a typo, or a
user reaches the app from a browser/push vendor not in the list, every
affected subscription is now **silently and permanently deleted** on the
very next send attempt — indistinguishable in the logs from ordinary
expiry, with no operator signal that the allowlist itself is stale or wrong.
The user is not notified; they simply stop receiving notifications until
they notice and manually re-subscribe. This directly undermines the CR-01
fix's own goal: an SSRF defense that silently destroys legitimate user data
whenever it (correctly or incorrectly) trips is a much harder fix to detect
and roll back than an SSRF hole is to close in the first place.

**Fix:** Make the allowlist-rejection case distinguishable from the
404/410 case so callers (or at least the logs) can tell them apart, e.g.
return a 3-state result instead of a bool, or keep the bool contract for
transport but log at `warning`/`error` (not silently) with the specific
reason before deleting:
```python
# backend/services/push_sender.py
def enviar_push(subscription_row, payload, vapid_private_key, vapid_subject) -> bool:
    if not endpoint_e_permitido(subscription_row.get("endpoint") or ""):
        logger.error(
            "enviar_push recusou endpoint fora da allowlist (possível "
            "linha maliciosa OU allowlist desatualizada) — apagando "
            "subscription %s do usuário implicado.",
            subscription_row.get("endpoint"),
        )
        return False
    ...
```
and update the callers' comments to stop asserting the deletion is *always*
"subscription expirada (404/410)" — at minimum, this makes an allowlist
regression loud in the logs instead of indistinguishable from routine churn.
A stronger fix is a distinct return value/exception for the allowlist case so
callers can choose not to delete (e.g. quarantine the row and alert) instead
of destroying it outright.

## Info

### IN-02: Three of four `PUSH_SERVICE_HOST_SUFFIXES` entries lack a leading `.` boundary

**File:** `backend/services/push_sender.py:24-29`

**Issue:** `PUSH_SERVICE_HOST_SUFFIXES` mixes a dot-anchored suffix
(`".push.apple.com"`) with three bare suffixes (`"fcm.googleapis.com"`,
`"updates.push.services.mozilla.com"`, `"push.services.mozilla.com"`).
`endswith()` without a leading `.` is the classic subdomain-suffix-check
anti-pattern (e.g. `"evil-fcm.googleapis.com".endswith("fcm.googleapis.com")`
is `True` in the abstract). In this specific case it is not practically
exploitable — matching those three suffixes at all requires DNS resolution
under `googleapis.com`/`mozilla.com`, which only Google/Mozilla control, not
an arbitrary attacker-registrable sibling domain (unlike, say, a bare
`"amazonaws.com"` suffix, where `"evil-amazonaws.com"` is a fully
attacker-registrable domain). Still worth fixing for consistency with the
one entry that already does it right, and as cheap defense-in-depth against
any future entry added to this list without noticing the pattern.
**Fix:** Add the leading `.` to all three, and special-case (or fold into
the tuple as `".googleapis.com"` if a broader Google subdomain is ever
intended) the equality case for the bare-domain scenario:
```python
PUSH_SERVICE_HOST_SUFFIXES = (
    ".push.apple.com",
    "fcm.googleapis.com",  # exact host, no subdomains expected
)
# and check separately: hostname == suffix or hostname.endswith("." + suffix)
```

### IN-01: `client.navigate()` not awaited before `client.focus()` (carried forward, unchanged)

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

_Reviewed: 2026-08-15T20:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
