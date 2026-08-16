---
phase: 13
slug: push-notification-ponta-a-ponta
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-15
---

# Phase 13 — Validation Strategy

> Populado dos <automated> reais dos 5 planos; sign-off formal no verify:post.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Frontend: Jest ^29.7.0 + jest-expo + RTL · Backend: pytest (backend/tests) |
| **Config file** | `package.json` campo "jest"; pytest via `cd backend && python3 -m pytest` |
| **Quick run command** | `cd backend && python3 -m pytest tests/test_push_sender.py tests/test_push_subscribe.py -x` + `npx jest __tests__/pushBadge.test.ts __tests__/pushInviteHost.test.tsx --silent` |
| **Full suite command** | `npm test` + `cd backend && python3 -m pytest -x` |
| **Estimated runtime** | ~60 seconds (ambas as suítes) |

---

## Sampling Rate

- **After every task commit:** comando `<automated>` da task correspondente
- **After every plan wave:** `npm test` (frontend) e `cd backend && python3 -m pytest -x` (backend)
- **Before `/gsd-verify-work`:** ambas as suítes verdes
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | PUSH-01, PUSH-05 | T-13-01..05 | RLS+GRANT na 0038; 410/404→delete; upsert idempotente | pytest | `cd backend && python3 -m pytest tests/test_push_sender.py tests/test_push_subscribe.py -x` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | PUSH-01 | T-13-02 | subscribe síncrono no gesto; sem VAPID privada no front | jest/RTL + grep | `npx jest __tests__/pushSubscription.test.ts --silent` (conforme plano) | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | PUSH-01 | — | DELETE endpoint + estados do botão | pytest + RTL | comandos do plano 13-01 Task 3 | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | PUSH-02 | T-13-06 | service-role restrito a colunas; idempotência reminder_sent_at | pytest | `cd backend && python3 -m pytest tests/test_push_reminder_scheduler.py -x` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | PUSH-03 | — | endpoint autenticado de replan-notify | pytest | `cd backend && python3 -m pytest tests/test_push_replan_notify.py -x` | ❌ W0 | ⬜ pending |
| 13-02-03 | 02 | 2 | PUSH-03 | — | hook confirmReplan → best-effort notify | jest | comando do plano 13-02 Task 3 | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 2 | PUSH-04 | — | setAppBadge gated; no-op sem suporte | jest | `npx jest __tests__/pushBadge.test.ts --silent` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 2 | PUSH-04 | — | hook no HomeScreen sem erro de tipo | jest+tsc | `npx tsc --noEmit -p . && npx jest __tests__/pushBadge.test.ts --silent` | ❌ W0 | ⬜ pending |
| 13-05-01 | 05 | 2 | PUSH-01 | — | convite único via alertShim; subscribe síncrono | jest/RTL | `npx jest __tests__/pushInviteHost.test.tsx --silent` | ❌ W0 | ⬜ pending |
| 13-05-02 | 05 | 2 | PUSH-01 | — | montagem no App.tsx sem regressão | tsc | `npx tsc --noEmit -p .` | ✅ | ⬜ pending |
| 13-04-01..03 | 04 | 3 | todos | T-13-* | checkpoints humanos (credenciais, migration prod md5, VPS deploy, UAT iPhone) | manual-only | — | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_push_sender.py` — 4 cenários do spike (410/404 delete, 400 propaga, 201 ok)
- [ ] `backend/tests/test_push_subscribe.py` — upsert idempotente, auth, DELETE
- [ ] `backend/tests/test_push_reminder_scheduler.py` — 8h America/Sao_Paulo, idempotência, skip sem subscription
- [ ] `backend/tests/test_push_replan_notify.py` — endpoint de replan
- [ ] `__tests__/pushSubscription.test.ts`, `__tests__/pushBadge.test.ts`, `__tests__/pushInviteHost.test.tsx`
- Frameworks já instalados (jest + pytest).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Credenciais VAPID/service-role no VPS | PUSH-01 | Segredos de produção são do dono | 13-04 Task 1 |
| Migrations 0038/0039 em produção (md5 = staging) | PUSH-01/02 | Padrão fase 7 v1.1; produção é checkpoint | 13-04 Task 2 |
| Deploy backend no VPS + UAT iPhone (lembrete, replan, toque→sessão, badge) | PUSH-02..05 | Sem toolchain iOS; produção | 13-04 Task 3 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity ok (nenhuma sequência de 3 tasks sem verify automatizado)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` confirmado no validate-phase pós-execução

**Approval:** pending
