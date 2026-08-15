---
phase: 13-push-notification-ponta-a-ponta
fixed_at: 2026-08-15T16:45:00Z
review_path: .planning/phases/13-push-notification-ponta-a-ponta/13-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-08-15T16:45:00Z
**Source review:** .planning/phases/13-push-notification-ponta-a-ponta/13-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope (critical + warning): 3
- Fixed: 3
- Skipped: 0

Info-level finding IN-01 (`client.navigate()` not awaited before `client.focus()`)
is out of `fix_scope: critical_warning` and was left untouched, as before.

## Fixed Issues

### CR-01: `endpoint_e_permitido()` allowlist enforced only at the Flask entry point — direct PostgREST writes bypassed it entirely

**Files modified:** `backend/services/push_sender.py`, `backend/tests/test_push_sender.py`
**Commit:** `7319fbe`
**Applied fix:** Defense-in-depth — `enviar_push()` now re-validates
`endpoint_e_permitido(subscription_row.get("endpoint") or "")` at the point of
actual send, BEFORE building `subscription_info`/calling `webpush()`. If the
endpoint is not on the known-push-service allowlist, the function refuses to
send and returns `False` — the exact same contract already used for 404/410
("subscription inválida, apagar linha"), so no caller code (`app.py`,
`push_reminder_scheduler.py`) needed to change; both already treat a `False`
return as "delete the row." This closes the SSRF hole regardless of how the
malicious row entered `push_subscriptions` (direct PostgREST write, future
code path that forgets to call the write-gate, etc.), not just at
`handle_push_subscribe`.

Test-before-fix: added
`test_enviar_push_recusa_endpoint_fora_da_allowlist_mesmo_vindo_do_banco`,
which passes a subscription row with a malicious endpoint
(`http://169.254.169.254/latest/meta-data/`) directly to `enviar_push()` —
simulating a row that arrived via the direct-PostgREST-write path — and
asserts `webpush()` is never called and the function returns `False`.
Confirmed RED before the fix (assert failed: `webpush` was called, result was
`True`), GREEN after.

Note: the REVIEW.md fix suggestion also proposed a follow-up DB `CHECK`
constraint on `push_subscriptions.endpoint` as an additional defense-in-depth
layer (belt-and-suspenders at the data layer). That is a separate migration
change beyond the scope of this code-level fix and was not applied here — the
application-layer defense in `enviar_push()` is sufficient to close the
reported vulnerability (every send path now re-validates), but a future
migration could add the DB-level constraint as a second independent layer.

### WR-01: No unsubscribe on logout — shared browser/device could silently reassign or leak another account's push subscription

**Files modified:** `src/contexts/AuthContext.js`, `__tests__/authContextSignOut.test.tsx`
**Commit:** `62a18eb` (fix), `c891b8f` (tsc correction to the new test file)
**Applied fix:** `signOut()` in `AuthContext.js` now calls
`unsubscribeFromPush()` best-effort — guarded by `isPushSupported()` (web-only,
since the function uses `navigator.serviceWorker`), fired without `await`
(fire-and-forget, same pattern already used for the replan-notify push in
`activeSessionStore.ts`), with its own `.catch()` that only logs a warning and
never propagates. This means a logged-out account's browser-level push
subscription is torn down before another account can inherit it on the same
shared device — closing the default/common path where the app previously
never attempted cleanup at all. It does not fully close the shared-device risk
(a user can still decline the browser prompt or the network call can fail),
matching the residual risk the review's own Fix section already called out.

Test-before-fix: added `__tests__/authContextSignOut.test.tsx` with 3 cases —
(1) `signOut()` calls `unsubscribeFromPush()` exactly once when push is
supported; (2) `signOut()` still completes the logout (Supabase `signOut`
called, state reaches `'deslogado'`) even when `unsubscribeFromPush()`
rejects, proving the best-effort/non-blocking contract; (3) `signOut()` does
NOT call `unsubscribeFromPush()` on a platform where `isPushSupported()` is
`false` (native). Case (1) was confirmed RED before the fix (0 calls recorded
instead of 1); cases (2) and (3) were already green pre-fix (current behavior
already satisfied them) and remained green after.

During verification, a full-project `tsc --noEmit` pass surfaced two TS2556
errors in the new test file (spreading a generic `unknown[]` into a
zero-arg-typed jest mock is not tuple-safe). Fixed in a follow-up commit
(`c891b8f`) by calling the mocks with no arguments instead of spreading —
matches how `signOut()`/`unsubscribeFromPush()` are actually invoked in
production code (zero args) and does not affect test semantics. Full project
`tsc --noEmit` is clean (0 errors) after this correction.

### WR-02: Daily reminder push body included the session title, contradicting the project's own documented shared-device mitigation

**Files modified:** `backend/services/push_reminder_scheduler.py`, `backend/tests/test_push_reminder_scheduler.py`
**Commit:** `cf70e4b`
**Applied fix:** The reminder payload `body` is now the fully generic
`"Confira seu treino de hoje."`, matching the pattern already used for the
replan-notify payload in `app.py` (`"Sua semana foi ajustada. Toque para
ver."`). The session title (`sessao["title"]`) is no longer interpolated into
any field visible on a locked device's notification banner/lock screen. The
deep-link `url` (`/home/active-session/{id}`) — not rendered on the lock
screen — remains the only place session-specific information travels.

Test-before-fix: added `test_payload_do_lembrete_nao_inclui_titulo_da_sessao`,
which seeds a session with a deliberately sensitive title ("Treino de pernas —
lesão no joelho"), captures the JSON payload passed to `enviar_push()`, and
asserts the title appears in neither `payload["title"]` nor `payload["body"]`,
and that `payload["body"]` equals the fixed generic string. Confirmed RED
before the fix (title was found inside the body), GREEN after.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification Summary

All verification ran inside the isolated worktree at
`/tmp/sv-13-reviewfix-h0aqCD` (branch `gsd-reviewfix/13-24104`), NOT the main
checkout — the numbers below are reproducible only from that tree while it
existed (it is removed by the cleanup tail after this report is written).
`node_modules` was a symlink to the main checkout's `node_modules` (removed
before each commit; never a target of `rm -rf`, only ever created/removed as
a plain symlink).

- **pytest** (`backend/tests/`, full suite): **678 passed**, 0 failed, 1
  pre-existing warning (`NotOpenSSLWarning`, unrelated to this change).
- **jest** (full suite, project root): **1808 passed** across **160 test
  suites**, 0 failed.
- **tsc --noEmit** (full project, default `tsconfig.json`): **0 errors**
  after the `c891b8f` correction (2 errors present transiently in the WR-01
  test file before that correction — documented above, not a regression in
  any pre-existing file).

No pre-existing test was modified to make it pass — only new tests were added
(one per finding) and the three source files identified in CR-01/WR-01/WR-02.

---

_Fixed: 2026-08-15T16:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
