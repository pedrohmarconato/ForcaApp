---
phase: 17
slug: tela-bloqueada-registrar-e-antecipar
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-18
---

# Phase 17 — Validation Strategy

> Contrato de validação por fase para amostragem de feedback durante a execução.
> Derivado de `17-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `^29.7.0` (`[VERIFIED: package.json]`) |
| **Config file** | chave `jest` em `package.json` |
| **Quick run command** | `npx jest __tests__/sessionModel.test.ts __tests__/activeSessionStore.test.ts __tests__/liveActivityContentState.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 s (suíte completa; quick run ~15 s) |
| **Type gate** | `npx tsc --noEmit` — obrigatório junto do quick run |

**Swift não tem framework de teste automatizado neste repositório.** Nenhum alvo `XCTest`
existe nos targets. Toda verificação de código Swift é compilação (`expo prebuild` + build
Release) mais leitura manual; todo comportamento em runtime é UAT físico no iPhone 13 do dono.
Live Activity e App Intents **não são testáveis em simulador** — restrição estrutural herdada
das Fases 15/16, reafirmada pela pesquisa desta fase.

---

## Sampling Rate

- **Após cada commit de tarefa:** `npx jest <arquivo-do-domínio-tocado>` + `npx tsc --noEmit`.
  Domínios: `sessionModel`, `activeSessionStore`, `liveActivityContentState`,
  `liveActivityIntentBridge`, `liveActivityIntentQueue`.
- **Após cada wave:** `npm test` (suíte completa).
- **Antes de `/gsd-verify-work`:** suíte completa verde **e** roteiro físico dos itens
  `manual-only` reportado PASS/FAIL pelo dono.
- **Max feedback latency:** ~60 s.

**Regra inegociável:** "compilou" / "prebuild passou" **nunca** é critério de conclusão
(D-14 da Fase 15, D-10 da Fase 14, reafirmada no `Claude's Discretion` do `17-CONTEXT.md`).

---

## Per-Task Verification Map

> Seeded em `draft`. Os IDs de tarefa são preenchidos após os PLAN.md existirem; a coluna
> Requirement/Test Type/Command já está travada pela pesquisa e não deve ser reaberta.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | REG-01 | — | N/A (single-tenant, sem superfície nova) | unit | `npx jest __tests__/sessionModel.test.ts -t "stepReps"` | ✅ arquivo / ❌ casos W0 | ⬜ pending |
| TBD | TBD | TBD | REG-01 | — | N/A | unit | `npx jest __tests__/sessionModel.test.ts -t "reps"` (seed `lastRepsByExercise`) | ✅ arquivo / ❌ casos W0 | ⬜ pending |
| TBD | TBD | TBD | REG-01 | — | N/A | unit | `npx jest __tests__/sessionModel.test.ts -t "canCompleteSet"` (D-06) | ✅ | ⬜ pending |
| TBD | TBD | TBD | REG-01 | — | N/A | unit | `npx jest __tests__/activeSessionStore.test.ts` (seed + update em `completeSet()`) | ✅ arquivo / ❌ casos W0 | ⬜ pending |
| TBD | TBD | TBD | REG-01 | — | N/A | component | `npx jest __tests__/sessionPlayerTransitions.test.tsx` (sem `TextInput` no fluxo padrão + marca de herdado) | ✅ arquivo / ❌ casos W0 | ⬜ pending |
| TBD | TBD | TBD | REG-02 | T-17-01 | Delta aplicado só via ação existente da store; widget nunca escreve | integration | `npx jest __tests__/liveActivityIntentBridge.test.ts -t "adjust"` | ✅ arquivo / ❌ casos W0 | ⬜ pending |
| TBD | TBD | TBD | REG-02 | T-17-01 | Payload de delta decodificado com peek não-destrutivo e ack condicionado | integration | `npx jest __tests__/liveActivityIntentQueue.test.ts` | ✅ arquivo / ❌ casos W0 | ⬜ pending |
| TBD | TBD | TBD | PRED-01 | — | N/A | unit | `npx jest __tests__/liveActivityContentState.test.ts` (campos "A seguir", D-13..D-16) | ✅ arquivo / ❌ casos W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/sessionModel.test.ts` — casos novos: `stepReps()` (nunca abaixo de 0,
      incremento fixo), sugestão de reps a partir de `SessionDraft.lastRepsByExercise` com
      queda para `targetRepsMin` na estreia (D-01), `canCompleteSet()` no pré-preenchimento
      que faz "Iniciar série" sumir (D-06).
- [ ] `__tests__/activeSessionStore.test.ts` — casos novos: semeadura de
      `lastRepsByExercise` pelo mesmo caminho de `lastLoadByExercise` (mais recente por
      `completed_at`, chave `exerciseIdentity`) e atualização do mapa em `completeSet()`.
- [ ] `__tests__/liveActivityContentState.test.ts` — casos novos: composição dos campos de
      "A seguir" (próxima série/exercício + valor de `suggestLoad()`), rótulo único "A SEGUIR"
      com destaque na virada de exercício (D-15), ausência da linha dentro de bloco de
      cardio/alongamento **com** anúncio da entrada no bloco (D-16).
- [ ] `__tests__/liveActivityIntentBridge.test.ts` — casos novos `adjustReps`/`adjustLoad`
      roteando para a ação existente da store, sem lógica de domínio na ponte.
- [ ] `__tests__/liveActivityIntentQueue.test.ts` — casos novos para o campo de delta
      genérico em `QueuedIntentAction` (a pesquisa registra que ele **não existe** hoje).
- [ ] Nenhum framework de teste Swift a instalar — fora do escopo. Cobertura Swift = compilação
      + UAT físico.
- [ ] Nenhum teste automatizado de layout web para o stepper não-editável. Fica como verificação
      manual explícita (o bug anterior de largura em `sessionPlayerLayout.ts:9-14` só foi pego
      por medição manual), a menos que o planner introduza snapshot — fora do padrão atual do repo.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Acumulação de delta sob toque rápido | REG-02 (critério 2) | ActivityKit/App Intents não rodam em simulador nem em CI. Há relato de fórum **não respondido** de toque rápido bypassando `perform()` inteiro e abrindo o app (Pitfall 1) | Sessão ativa, iPhone bloqueado. Dar ~4 toques em `+` em ~1 s no stepper de reps; repetir no de carga. Registrar o valor final observado no card e o valor final na store ao desbloquear. **PASS:** os dois batem e valem o número de toques dados. **FAIL:** valor menor que o esperado, app abre sozinho, ou card congela |
| Orçamento de `Activity.update()` sob rajada | REG-02 (critério 2) | Apple documenta orçamento só para push remoto; updates locais não têm número público | Mesma rajada acima. Observar se o card atrasa visivelmente ou perde updates. **Não implementar debounce preventivo** — medir primeiro; só adicionar coalescing em `liveActivitySync.ts` se o atraso aparecer |
| "Abrir para ajustar" navega para a sessão certa | REG-02 (critério 3) | Deep link nativo não roda em Jest; `widgetURL` atual está quebrado (aponta para rota inexistente) | Ajustar a carga para um valor fora do passo (ex.: 37,5 kg com passo 5) pelo app. Bloquear. Tocar o alvo "abrir para ajustar" no card. **PASS:** pede desbloqueio e abre direto na sessão ativa, na série corrente. **FAIL:** não abre nada, ou abre na Home genérica |
| Linha "A SEGUIR" visível durante todo o descanso | PRED-01 (critério 4) | Depende de renderização real do widget no Lock Screen | Concluir uma série, bloquear imediatamente. **PASS:** a linha "A SEGUIR" já está no card no primeiro segundo do descanso. **FAIL:** só aparece quando o timer zera |
| Migração de `ContentState` não deixa Activity presa | PRED-01 / D-11 | ActivityKit não tem migração incremental de schema (Pitfall 4) | Iniciar sessão com o binário ANTIGO, depois `npm run resign` + reinstalar, reabrir. **PASS:** Activity antiga é encerrada/reconciliada sem campo em branco nem erro de decodificação. **FAIL:** card com "A seguir" vazio numa sessão nova, ou erro de decode no log |
| Alvo de toque e legibilidade com dois pares de −/+ | REG-02 (critério 2) | Orçamento de altura do Lock Screen e tamanho mínimo de alvo só se provam no aparelho | Aparelho apoiado no banco, dedo suado, sem olhar direito. **PASS:** acerta o botão pretendido em 5 de 5 tentativas por par e lê os números de relance. **FAIL:** erra o alvo, ou o card trunca conteúdo |
| Paridade das duas cópias de `SessionActivityAttributes.swift` | PRED-01 / D-11 | `verify-native-skeleton.sh:143-164` só confere presença do `struct`, não faz diff de conteúdo (Pitfall 5) | `diff targets/session-widget/SessionActivityAttributes.swift modules/live-activity/ios/SessionActivityAttributes.swift` — **PASS:** saída vazia |
| Regressão do PWA web após D-05 | REG-01 | Nenhum teste automatizado de layout web existe | `expo start --web`, viewport 390×844, abrir uma sessão. **PASS:** stepper não estoura a largura, número legível, teclado só pelo gesto de escape |

---

## Validation Sign-Off

- [ ] Todas as tarefas têm `<verify>` automatizado ou dependência declarada de Wave 0
- [ ] Continuidade de amostragem: nunca 3 tarefas consecutivas sem verify automatizado
- [ ] Wave 0 cobre todas as referências MISSING acima
- [ ] Nenhuma flag de watch-mode
- [ ] Latência de feedback < 60 s
- [ ] Roteiro físico das 8 verificações manual-only escrito, auto-contido, com PASS/FAIL por item
- [ ] `nyquist_compliant: true` no frontmatter

**Approval:** pending
