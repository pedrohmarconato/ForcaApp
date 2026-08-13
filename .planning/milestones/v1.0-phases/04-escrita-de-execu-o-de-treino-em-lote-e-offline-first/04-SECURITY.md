---
phase: 04
slug: escrita-de-execu-o-de-treino-em-lote-e-offline-first
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-12
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| `sessionOutboxDrain.ts` → `sessionExecutionRepository` (RPCs Supabase) | Mesmo boundary pré-existente (JWT do usuário, RLS por `auth.uid()`); a fila só reordena QUANDO a chamada acontece, não introduz boundary novo. | Logs de série/execução do próprio usuário |
| App → AsyncStorage local (`@session_outbox_<userId>`) | Dado do próprio usuário no próprio aparelho; mesma postura de `sessionDraftStorage.ts` (sem criptografia). | Reps/carga/motivo de recusa — não sensível |
| Harness de integração (client usuário + client `service_role`) → stack Supabase LOCAL | `service_role` bypassa RLS só para seed/teardown; a RPC sob teste roda como usuário real, respeitando `auth.uid()`. | Credenciais de teste e chave `service_role` (só ambiente local) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Tampering | `sessionOutboxDrain.drainAll` reenviando `save_set_log` após timeout/retry | medium | mitigate | Guarda server-side first-write-wins em `supabase/migrations/0005_set_log_first_write_wins.sql`; cliente chama a MESMA RPC com a MESMA chave natural (D-02, D-13), provado no nível 2 contra Postgres real (`__tests__/integration/sessionOutboxDrain.postgrest.test.ts`). | closed |
| T-04-02 | Tampering | Documento `@session_outbox_<userId>` editável em aparelho comprometido | low | accept | Risco residual já aceito para `sessionDraftStorage.ts`; vocabulários fechados e CHECKs do servidor permanecem autoritativos. Ver Accepted Risks Log (R-04-01). | closed |
| T-04-03 | Denial of Service | Item "envenenado" travando a sub-fila de uma sessão | medium | mitigate | `isDefinitiveRejection` (allowlist de código definitivo) move o item para quarentena; `isExpired`/D-11 é o backstop de idade — `src/engine/sessionOutboxPolicy.ts` e `src/services/sessionOutboxDrain.ts`. | closed |
| T-04-04 | Tampering / Elevation of Privilege | P0001 (sessão já finalizada) tratado como quarentena comum, deixando draft local "ativo" | high | mitigate | Branch dedicado `isSessionClosedCode` em `drainAll` descarta a sub-fila da sessão e chama `onSessionClosed`, que reconcilia o estado local (mesmo caminho de `retireLocalDraft`) — presente em `src/services/sessionOutboxDrain.ts`, `src/engine/sessionOutboxPolicy.ts`, `src/hooks/useSessionOutboxDrain.ts`, `src/store/activeSessionStore.ts`. | closed |
| T-04-05 | Tampering | Reenvio de `swap_session_exercise`/`skip_session_exercise` após retry | medium | mitigate | Guardas server-side em `supabase/migrations/0005_set_log_first_write_wins.sql` e `0036_guarda_set_log_troca_cardio.sql`; identidade por chave natural `(sessionLogId, plannedExerciseId)` substitui o item existente, nunca duplica — `src/engine/sessionOutboxPolicy.ts:79,91`. | closed |
| T-04-06 | Repudiation | `finishSession` retorna sucesso ao usuário antes de o servidor confirmar `finish_session` | low | accept | RPC idempotente (migration 0004); item fica na fila até drenar, com backstop de expiração/quarentena do D-11. D-08 exige comportamento não-bloqueante. Ver Accepted Risks Log (R-04-02). | closed |
| T-04-07 | Information Disclosure / Elevation of Privilege | Harness de integração com `service_role` e credencial de usuário sobre a rede | high | mitigate | Trava loopback hard-fail (regex só `127.0.0.1`/`localhost`) roda antes de qualquer chamada de rede — `__tests__/integration/sessionOutboxDrain.postgrest.test.ts:61-67`; chaves só via env var (`SUPABASE_INTEGRATION_SERVICE_ROLE_KEY`, linhas 46-53); harness fora de `npm test`/CI via `testPathIgnorePatterns` (`package.json`). | closed |
| T-04-08 | Repudiation | UAT manual (Task 2 do plano 04-03) sem log automatizado do resultado | low | accept | Natureza de teste manual; resultado registrado no `04-03-SUMMARY.md` e no resume-signal do checkpoint. Único nível capaz de reproduzir o sintoma real (rádio do aparelho). Ver Accepted Risks Log (R-04-03). | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-04-01 | T-04-02 | Aparelho rooteado/jailbroken pode editar o outbox local; mesmo risco residual já aceito para `sessionDraftStorage.ts`. O servidor permanece autoritativo (vocabulários fechados e CHECKs de RIR, outcome, `SkipReason`, modalidade) independentemente do que o cliente envia. | Plan-time disposition (04-01-PLAN.md) | 2026-08-12 |
| R-04-02 | T-04-06 | Sucesso otimista de `finishSession` é exigência explícita do D-08 (não-bloqueante). A RPC é idempotente (migration 0004) e falha definitiva cai no backstop de expiração/quarentena do D-11 — nunca perda silenciosa sem registro na fila. | Plan-time disposition (04-02-PLAN.md) | 2026-08-12 |
| R-04-03 | T-04-08 | UAT manual do rádio do aparelho não tem alternativa automatizável; resultado registrado no `04-03-SUMMARY.md`. | Plan-time disposition (04-03-PLAN.md) | 2026-08-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-12 | 8 | 8 | 0 | gsd-secure-phase (L1 grep-depth, short-circuit — register authored at plan time, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
