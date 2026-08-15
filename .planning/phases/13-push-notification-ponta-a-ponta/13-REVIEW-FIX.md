---
phase: 13-push-notification-ponta-a-ponta
fixed_at: 2026-08-15T21:30:00Z
review_path: .planning/phases/13-push-notification-ponta-a-ponta/13-REVIEW.md
iteration: 3
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-08-15T21:30:00Z
**Source review:** .planning/phases/13-push-notification-ponta-a-ponta/13-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope: 2 (WR-01, in `critical_warning` scope; IN-02, explicitly approved for inclusion in this pass per user direction)
- Fixed: 2
- Skipped: 0
- Out of scope (not touched): IN-01 — explicitly excluded by user direction, carried forward unchanged

**Verification environment:** pytest ran against the project's real `.venv`
(`/Users/phmarconato/ForcaApp/.venv/bin/python3`) inside the isolated git
worktree (`git worktree add -b gsd-reviewfix/13-38551`), since `node_modules`/
venvs are not duplicated into a fresh worktree by design. jest and `tsc
--noEmit` ran in the main checkout after the worktree's commit was
fast-forwarded onto `main` — this pass touched Python files only, so the
JS/TS numbers are identical whether measured against the worktree branch or
`main` post-fast-forward, and are reproducible from the tree currently
checked out.

## Fixed Issues

### WR-01: `enviar_push()` returning `False` for an allowlist rejection was treated identically to a confirmed 404/410 — every caller deleted the subscription either way

**Files modified:** `backend/services/push_sender.py`, `backend/services/push_reminder_scheduler.py`, `backend/app.py`, `backend/tests/test_push_sender.py`, `backend/tests/test_push_reminder_scheduler.py`, `backend/tests/test_push_replan_notify.py`
**Commit:** `a0078c1`
**Applied fix:**
Per direction for this iteration, separated the two destinies instead of
keeping a shared `False` contract:

- `enviar_push()` (`backend/services/push_sender.py`) now returns three
  distinct states: `True` (sent), `False` (confirmed 404/410 from the push
  service — unchanged contract, proven in 13-SPIKE.md), and `None` (the
  allowlist itself refused the endpoint *before* attempting any send). The
  `None` branch logs at `logger.error(...)` with an explicit message
  ("enviar_push recusou endpoint fora da allowlist — revisar
  allowlist/vendor...", including the offending endpoint and user_id) so an
  allowlist regression is loud in the logs instead of indistinguishable from
  routine 404/410 churn.
- Both callers (`backend/services/push_reminder_scheduler.py:195-208` and
  `backend/app.py:2279-2290`) were updated with an explicit
  `elif sucesso is None: continue` branch — the allowlist-rejection case now
  skips the send *without* deleting the subscription. Only the `else`
  branch (confirmed `False` / 404-410) still calls `delete_subscription()`.
  The old comments asserting deletion is *always* "subscription expirada
  (404/410)" no longer apply to the `None` case; the `else` branches keep
  that comment since it is now accurate again for that branch specifically.

**Tests (written before the fix, TDD):**
- `test_push_sender.py::test_enviar_push_recusa_endpoint_fora_da_allowlist_mesmo_vindo_do_banco` —
  updated to assert `resultado is None` (was `is False`) and to assert an
  ERROR-level log record containing "allowlist" was emitted (`caplog`).
- `test_push_reminder_scheduler.py::test_enviar_push_retornando_none_por_allowlist_nao_apaga_subscription` —
  new: proves `delete_subscription` is **not** called when `enviar_push`
  returns `None`, and the session is still marked as reminded (best-effort).
- `test_push_replan_notify.py::test_notify_replan_allowlist_rejeitada_nao_apaga_e_nao_conta_em_sent` —
  new: same proof at the `/api/push/notify-replan-applied` endpoint level.
- Pre-existing `test_410_gone_apaga_subscription` / `test_404_not_found_apaga_subscription`
  (still `resultado is False`) and
  `test_push_reminder_scheduler.py::test_enviar_push_retornando_false_apaga_subscription_expirada`
  / `test_push_replan_notify.py::test_notify_replan_subscription_expirada_apaga_e_nao_conta_em_sent`
  (still assert `delete_subscription` **is** called) prove the 410/404 path
  is unchanged — confirmed passing, no regression.

### IN-02: Three of four `PUSH_SERVICE_HOST_SUFFIXES` entries lacked a leading `.` boundary

**Files modified:** `backend/services/push_sender.py`, `backend/tests/test_push_sender.py`
**Commit:** `a0078c1` (same commit as WR-01 — same file/same surface, applied in one pass per user direction)
**Applied fix:**
Rather than adding a leading `.` to three of four tuple entries (which would
have broken the exact-host match for `fcm.googleapis.com` itself), normalized
`PUSH_SERVICE_HOST_SUFFIXES` to bare hostnames and replaced the raw
`hostname.endswith(sufixo)` check in `endpoint_e_permitido()` with a
boundary-safe check applied uniformly to all four entries:
`hostname == sufixo or hostname.endswith("." + sufixo)`. This closes the
classic suffix-check anti-pattern
(`"evilfcm.googleapis.com".endswith("fcm.googleapis.com")` was `True`) while
still accepting legitimate subdomains of a listed host (e.g.
`web.push.apple.com` under `push.apple.com`).

**Test:** `test_push_sender.py::test_endpoint_e_permitido_rejeita_hosts_desconhecidos` —
added `https://evilfcm.googleapis.com/fcm/send/xyz` to the rejected-hosts
parametrization; confirmed rejected only after the fix (failed before,
`endpoint_e_permitido` returned `True`). A second candidate case
(`evil-updates.push.services.mozilla.com`) was tried and intentionally
dropped — it is correctly *accepted* under either implementation, since it
is a genuine subdomain of `mozilla.com` (attacker-unregistrable), not an
attacker-registrable sibling domain; including it as a "must reject" case
would have been a wrong assertion, not a real regression.

## Skipped Issues

None — both in-scope findings for this pass were fixed. IN-01
(`client.navigate()` not awaited, `public/push-handlers.js:44-49`) was
explicitly excluded from this pass by user direction and remains unchanged;
it was carried forward as info-level/optional in `13-REVIEW.md` itself
(iteration 3, unchanged since iteration 1).

## Full Verification Numbers

- **pytest** (`.venv/bin/python3 -m pytest backend/tests/`): **681 passed**, 0 failed, 1 pre-existing unrelated warning (urllib3/LibreSSL `NotOpenSSLWarning`).
- **jest** (`npx jest --silent`): **160 test suites / 1808 tests passed**, 0 failed.
- **tsc** (`npx tsc --noEmit`): **0 errors** (clean, no output).

---

_Fixed: 2026-08-15T21:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
