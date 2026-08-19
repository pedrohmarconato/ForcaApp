---
phase: 17
slug: tela-bloqueada-registrar-e-antecipar
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-19
---

# Phase 17 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Lock Screen (widget extension) -> App Group UserDefaults | Toque do usuário no `Button(intent:)` grava na fila durável compartilhada; único IPC local entre extensão e app | valores numéricos de reps/carga da série ativa (local, single-tenant) |
| App Group queue -> processo do app (foreground) | `sendEvent`/peek in-process aplica a entrada contra a store real | intents de ajuste (adjustRest/adjustReps/adjustLoad/completeSet/skipRest) |
| Deep link (`widgetURL`) -> app | Tela bloqueada abre o app via URL scheme customizado (`forcaapp://home/active-session/<sessionLogId>`) | sessionLogId da sessão ativa validada |
| Supabase (histórico de set_logs) -> app | Leitura de dados do próprio usuário (RLS existente, sem mudança de escopo) | histórico de reps/carga do usuário |
| Store (draft em memória) -> disco (sessionDraftStorage) | Persistência local do rascunho, incluindo `lastRepsByExercise` | draft da sessão (local, single-tenant) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-17-01 | Tampering | `AdjustLoadIntent.perform()` / `stepLoad()` | medium | mitigate | Delta sempre múltiplo fixo de `loadIncrementKg` por toque; `stepLoad()` clampa em `Math.max(0, ...)` — provado por `liveActivityIntentBridge.test.ts#adjustLoad` + `liveActivityContentState.test.ts` e UAT Teste 2 | closed |
| T-17-02 | Denial of Service | `IntentActionQueue` (App Group `UserDefaults`) | low | accept | `maxEntries = 20` herdado da Fase 16, sem superfície nova — ver Accepted Risks Log | closed |
| T-17-03 | Information Disclosure | `widgetURL` apontando para rota errada | low | mitigate | Corrigido para `forcaapp://home/active-session/<sessionLogId>` — deep link real validado no aparelho (UAT Testes 4 e 28) | closed |
| T-17-04 | Tampering | `perform()` de `LiveActivityIntent` escrevendo em ActivityKit direto | high | mitigate | `perform()` só enfileira via `IntentActionQueue.enqueue` e dispara `sendEvent` — nunca chama `Activity.update()`; `liveActivitySync.ts` único escritor; provado por skeleton checks (a-h) e UAT Testes 2/9 | closed |
| T-17-05 | Tampering | `stepReps()` / `resolveInheritedSet()` | medium | mitigate | `stepReps` clampa em `Math.max(0, ...)`; `resolveInheritedSet` retorna null quando nenhum valor existe, reprovando `canCompleteSet` — provado por `sessionModel.test.ts` | closed |
| T-17-06 | Tampering | rascunho persistido sem `lastRepsByExercise` | low | mitigate | `coerceDraftNumerics` trata ausência como `{}`, nunca `undefined` propagando para `suggestReps` — provado por `sessionModel.test.ts#coerceDraftNumerics` | closed |
| T-17-07 | Tampering | `AdjustRepsIntent.perform()` / `stepReps()` | medium | mitigate | Delta sempre ±1 fixo por toque; `stepReps()` clampa em `Math.max(0, ...)` — provado por UAT Teste 11 (aparelho físico) + unidade | closed |
| T-17-08 | Denial of Service | `reconcileLiveActivityIntents` processando fila acumulada | low | accept | Cap de 20 entradas herdado; ack incondicional nos dois kinds novos evita reprocessamento infinito — ver Accepted Risks Log | closed |
| T-17-09 | Repudiation | Entrada de fila sem `sessionLogId` correspondente ao draft atual | low | mitigate | CAS herdado (16-12): `sessionLogId` divergente descarta; nulo usa `nasceuNestaSessao` como prova de origem — provado por `liveActivityIntentQueue.test.ts#reconcileLiveActivityIntents` | closed |
| T-17-10 | Tampering | Valor herdado exibido sem nunca ter sido confirmado pelo usuário | medium | mitigate | Marca visual de herdado (D-03) evita confusão; `resolveInheritedSet` só materializa no `completeSet()` real — provado por `sessionPlayerTransitions.test.tsx` (a)/(b) e UAT Testes 13/25 | closed |
| T-17-11 | Spoofing | Componente compartilhado entre app nativo e PWA web sem isolamento de canal | low | accept | Desenho existente do projeto (mesmo componente, mesma store), sem superfície nova — ver Accepted Risks Log | closed |
| T-17-12 | Information Disclosure | Linha A SEGUIR expondo prescrição de cardio (vetada pela D-03 da Fase 15) | low | mitigate | Antecipação só preenche campos numéricos quando o próximo exercício NÃO é isTimeBased; virada para bloco mostra só o nome — provado por `liveActivityContentState.test.ts` (17-05 D2) | closed |
| T-17-13 | Tampering | ContentState mudando de schema com Activities já em curso (Pitfall 4) | medium | mitigate | Limitação da plataforma — sem mitigação em código; pré-condição executada no Plano 17-07 (encerrar/recriar Activities antes do UAT): nenhum campo em branco nem erro de decode no aparelho (UAT Testes 1 e 24) | closed |
| T-17-14 | Tampering | Build Release divergindo de Debug (não embute main.jsbundle) | medium | mitigate | `verify-native-skeleton.sh` checagem (f) prova `-configuration Release` — exit 0 em 2 rodadas; BUILD SUCCEEDED no resign (UAT Teste 23) | closed |
| T-17-15 | Repudiation | Resultado de UAT físico não registrado com detalhe suficiente | medium | mitigate | `resume-signal` exigiu PASS/FAIL item a item — relato físico 2026-08-19 registrado em 17-07-SUMMARY.md (UAT Testes 24-30) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-17-01 | T-17-02 | Fila compartilhada com cap `maxEntries = 20` desde a Fase 16; os novos kinds (adjustReps/adjustLoad) competem pelo mesmo cap e não criam superfície nova | Pedro Marconato (decisão de planejamento registrada em 17-01-PLAN.md) | 2026-08-19 |
| R-17-02 | T-17-08 | Mesmo cap de 20 entradas herdado para os 5 kinds; ack incondicional nos kinds novos impede reprocessamento infinito da mesma entrada | Pedro Marconato (17-03-PLAN.md) | 2026-08-19 |
| R-17-03 | T-17-11 | Componente compartilhado app nativo × PWA é o desenho existente do projeto; nenhuma superfície nova introduzida pela fase | Pedro Marconato (17-04-PLAN.md) | 2026-08-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-19 | 15 | 15 | 0 | gsd-secure-phase (L1, asvs 1, register authored at plan time — short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-19
