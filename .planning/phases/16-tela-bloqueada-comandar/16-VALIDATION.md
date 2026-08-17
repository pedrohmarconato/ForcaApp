---
phase: 16
slug: tela-bloqueada-comandar
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-17
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 (config inline em `package.json`, chave `"jest"`) |
| **Config file** | `package.json` (chave `jest`) — não há `jest.config.*` separado |
| **Quick run command** | `npx jest __tests__/liveActivityIntentBridge.test.ts` (ou `__tests__/liveActivityIntentQueue.test.ts` conforme o arquivo tocado) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 segundos (suíte completa do repo) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <arquivo de teste tocado pela task>` + `npx tsc --noEmit`
- **After every plan wave:** Run `npm test` (suíte completa)
- **Before `/gsd-verify-work`:** Full suite must be green, `npm run verify:native` deve sair 0, e a sessão física da Plano 16-03 deve ter resposta PASS/FAIL explícita do dono
- **Max feedback latency:** ~30 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | CMD-01 | T-16-01-01/02/04 | Toque em "Concluir série" grava na fila durável ANTES de emitir evento; despacha para completeSet() já existente; nunca abre o app | unit | `npx tsc --noEmit && npx jest __tests__/liveActivityIntentBridge.test.ts` | ❌ Wave 0 | ⬜ pending |
| 16-01-02 | 01 | 1 | CMD-02 | T-16-01-01 | SkipRestIntent/AdjustRestIntent nos dois targets, botões renderizados, verify-native-skeleton (g) confirma presença | unit + static | `npx jest __tests__/liveActivityIntentBridge.test.ts && npm run verify:native` | ❌ Wave 0 | ⬜ pending |
| 16-02-01 | 02 | 2 | CMD-01, CMD-02 | — | drainIntentQueue() lê e limpa a fila do App Group via ponte Expo tipada | type-check | `npx tsc --noEmit` | ❌ Wave 0 | ⬜ pending |
| 16-02-02 | 02 | 2 | CMD-01, CMD-02 | T-16-02-01/02 | reconcileLiveActivityIntents() aplica fila com guarda de CAS por sessionLogId, nunca contra sessão errada | unit | `npx jest __tests__/liveActivityIntentQueue.test.ts && npx tsc --noEmit` | ❌ Wave 0 | ⬜ pending |
| 16-03-01 | 03 | 3 | CMD-01, CMD-02 | T-16-03-01 | Comportamento físico real (toque, timer, force-quit) no Lock Screen — não automatizável | manual (UAT física do dono) | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/liveActivityIntentBridge.test.ts` — stub inicial para CMD-01/CMD-02 (despacho evento→ação de store), criado dentro da própria Plano 16-01 Task 1 (tracer, tdd="true")
- [ ] `__tests__/liveActivityIntentQueue.test.ts` — stub inicial para a reconciliação da fila do App Group, criado dentro da Plano 16-02 Task 2 (tdd="true")

Nenhum framework novo é necessário — Jest 29.7.0 já cobre TypeScript/JS; os
arquivos Swift novos (`CompleteSetIntent.swift`, `SkipRestIntent.swift`,
`AdjustRestIntent.swift`, `IntentActionQueue.swift`) não têm suíte XCTest no
projeto, consistente com o padrão já estabelecido na Fase 15
(`LiveActivityModule.swift` também não tem testes nativos) — o lado Swift é
validado por `scripts/verify-native-skeleton.sh` (compilação/presença) e pela
UAT física da Plano 16-03.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toque real no botão "Concluir série"/"-30s"/"Pular"/"+30s" no Lock Screen produz o efeito esperado no app, sem lag perceptível | CMD-01, CMD-02 | App Intents em Live Activity não rodam em Simulator com fidelidade; nenhum framework de teste do projeto exercita `perform()` num Lock Screen real | Runbook completo na Plano 16-03 (`checkpoint:human-verify`), resposta PASS/FAIL por item |
| Comportamento após force-quit do app seguido de toque no botão da tela bloqueada (cold-launch de `perform()`) | CMD-01, CMD-02 | Depende do modelo de processo real do iOS relançando o app brevemente sem UI — nenhuma fonte documental garante o timing; só o aparelho físico decide (RESEARCH.md Assumption A1) | Passo 8 do runbook da Plano 16-03, reportando PASS-A/PASS-B/FAIL |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
