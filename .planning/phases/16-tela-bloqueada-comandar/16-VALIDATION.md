---
phase: 16
slug: tela-bloqueada-comandar
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-17
validated: 2026-08-19
---

> **Nota de auditoria nyquist (2026-08-19):** este arquivo ficou em `draft` desde o seed do
> plan-phase, com `nyquist_compliant: true` e `wave_0_complete: true` semeados sem checagem
> real. Auditoria abaixo confere CMD-01/CMD-02 contra o teste que roda hoje no HEAD `a46bea8`
> (main, pós-merge dos fixes IN-02..IN-05), não contra a intenção do PLAN.
>
> **Gatilho da reauditoria:** os fixes IN-02 (deltaValue 0), IN-03 (decode elemento a
> elemento da fila nativa), IN-04 (checagem (k) da entitlement do App Group) e IN-05
> (persistência de `activateSet`/`adjustRest`) entraram no main em 19/08, um dia depois do
> UAT físico de force-quit+toque (18/08), tocando exatamente esse caminho quente/frio.
>
> **Achado:** cada um dos quatro fixes já nasceu com teste de regressão no mesmo commit —
> não há lacuna de cobertura automatizada aberta pelo merge:
> - IN-02 (`2c0c19c`): `__tests__/liveActivityIntentQueue.test.ts:847` prova que
>   `deltaValue === 0` faz ack+descarte em vez de decrementar reps/carga (linha 807-870).
> - IN-03 (`7ac8cdd`): `scripts/IntentActionQueueConcurrencyTests/main.swift`, exercitado por
>   `scripts/verify-intent-action-queue-race.sh`, escreve JSON cru com 3 entradas (1 sem
>   `id`) e prova que `peekAll()` preserva as 2 válidas — rodou verde no HEAD atual
>   (`OK: decode elemento a elemento preservou 2/3 entradas`).
> - IN-04 (`23437cf`): `scripts/verify-native-skeleton.sh` checagem (k) — rodou verde no HEAD
>   atual (`Rodada 1/2: (a)-(k) OK`, 2x consecutivas pós `--clean`).
> - IN-05 (`9b17135`): `__tests__/activeSessionStore.test.ts:920` (`activateSet`) e `:932`
>   (`adjustRest`) provam que as duas ações passam a chamar `saveDraft` com o campo
>   correspondente (`activatedAt`/`restEndsAt`) preenchido.
>
> Reexecução nesta auditoria: `npx jest __tests__/liveActivityIntentBridge.test.ts
> __tests__/liveActivityIntentQueue.test.ts __tests__/activeSessionStore.test.ts
> __tests__/sessionPlayerTransitions.test.tsx` → **4 suítes / 136 testes, todos PASS**;
> `bash scripts/verify-native-skeleton.sh` → exit 0; `bash
> scripts/verify-intent-action-queue-race.sh` → exit 0; suíte completa `npm test` → **169
> suítes / 2024 testes, todos PASS** (baseline igual ao registrado no prompt de auditoria —
> nenhum teste precisou ser criado); `npx tsc --noEmit` → limpo. Nenhum teste novo foi
> necessário: a amostragem para CMD-01/CMD-02 já cobre despacho de evento→store (bridge),
> reconciliação com guarda de CAS por `sessionLogId` (queue), persistência de draft
> (activeSessionStore) e presença dos cinco App Intents nos dois targets (skeleton check g).
>
> **Ressalva que permanece, e que este arquivo não pode varrer para debaixo do tapete:** a
> UAT física de CMD-01 (PASS em `16-03-SUMMARY.md`/`16-UAT.md`, item 3, força-quit+toque) é
> de 18/08 — **um dia anterior** aos 5 commits de IN-02..IN-05 (19/08) que tocam exatamente
> esse caminho quente/frio (fila do App Group, decode nativo, persistência de draft). Teste
> automatizado prova que o comportamento novo é o pretendido no nível de unidade/lógica; NÃO
> substitui a reconfirmação física do dono no aparelho pós-fix. `nyquist_compliant: true`
> reflete cobertura automatizada completa — **não** significa que a fase está pronta para
> fechar sem essa reconfirmação. Ver `16-UAT.md` para o roteiro já usado na rodada de 18/08,
> reaplicável ao build atual.

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
| 16-01-01 | 01 | 1 | CMD-01 | T-16-01-01/02/04 | Toque em "Concluir série" grava na fila durável ANTES de emitir evento; despacha para completeSet() já existente; nunca abre o app | unit | `npx tsc --noEmit && npx jest __tests__/liveActivityIntentBridge.test.ts` | ✅ presente | ✅ green |
| 16-01-02 | 01 | 1 | CMD-02 | T-16-01-01 | SkipRestIntent/AdjustRestIntent nos dois targets, botões renderizados, verify-native-skeleton (g) confirma presença | unit + static | `npx jest __tests__/liveActivityIntentBridge.test.ts && npm run verify:native` | ✅ presente | ✅ green |
| 16-02-01 | 02 | 2 | CMD-01, CMD-02 | — | drainIntentQueue() lê e limpa a fila do App Group via ponte Expo tipada | type-check | `npx tsc --noEmit` | ✅ presente | ✅ green |
| 16-02-02 | 02 | 2 | CMD-01, CMD-02 | T-16-02-01/02 | reconcileLiveActivityIntents() aplica fila com guarda de CAS por sessionLogId, nunca contra sessão errada | unit | `npx jest __tests__/liveActivityIntentQueue.test.ts && npx tsc --noEmit` | ✅ presente | ✅ green |
| 16-03-01 | 03 | 3 | CMD-01, CMD-02 | T-16-03-01 | Comportamento físico real (toque, timer, force-quit) no Lock Screen — não automatizável | manual (UAT física do dono) | — | N/A | ✅ PASS em 18/08 (`16-UAT.md`) — **pré-data os fixes IN-02..IN-05 de 19/08**, reconfirmação física pendente |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `__tests__/liveActivityIntentBridge.test.ts` — stub inicial para CMD-01/CMD-02 (despacho evento→ação de store), criado dentro da própria Plano 16-01 Task 1 (tracer, tdd="true"); confirmado presente e verde nesta auditoria (24 casos)
- [x] `__tests__/liveActivityIntentQueue.test.ts` — stub inicial para a reconciliação da fila do App Group, criado dentro da Plano 16-02 Task 2 (tdd="true"); confirmado presente e verde nesta auditoria, incluindo os testes de regressão de IN-02/IN-03 acrescentados em 19/08

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

**Approval:** full para cobertura automatizada — CMD-01 e CMD-02 têm suíte verde (4
suítes/136 testes relevantes; 169 suítes/2024 testes na suíte completa; `tsc --noEmit`
limpo; ambos os scripts nativos com exit 0). Nenhuma lacuna de amostragem automatizada
identificada. **Ressalva não removível:** UAT física de força-quit+toque é de 18/08,
anterior aos 5 commits de fix de 19/08 que tocam o mesmo caminho — a fase não está pronta
para fechar sem reconfirmação física do dono pós-fix.
