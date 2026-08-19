---
phase: 17
slug: tela-bloqueada-registrar-e-antecipar
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-18
validated: 2026-08-19
reaudited: 2026-08-19
---

> **Nota de auditoria (2026-08-19, gate Nyquist retroativo):** este arquivo ficou em
> `draft`/`pending` desde o seed do plan-phase e nunca foi atualizado após a execução.
> Auditoria abaixo confere cada linha da tabela contra o teste real (arquivo existe, caso
> nomeado existe, suíte roda verde) — não contra a intenção do PLAN. Na primeira passada
> `nyquist_compliant` ficou em `false` porque REG-01 tinha lacuna real e conhecida: nenhuma
> verificação em superfície real (PWA nem app) havia ocorrido.

> **Reauditoria (2026-08-19, mesma data, sessão posterior):** a lacuna de REG-01 foi
> fechada por evidência de primeira ordem — ver §REG-01/Reabertura abaixo. `nyquist_compliant`
> passa a `true`. Os seis comandos automatizados listados na tabela abaixo foram
> re-executados nesta reauditoria (`npx jest` nos 6 arquivos do Wave 0): **6 suítes / 190
> testes, todos PASS**, idêntico ao resultado da primeira passada — nenhuma regressão
> automatizada entrou entre as duas auditorias.

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
| 17-02 | 17-02-PLAN.md | W0 | REG-01 | — | N/A (single-tenant, sem superfície nova) | unit | `npx jest __tests__/sessionModel.test.ts -t "stepReps"` | ✅ arquivo / ✅ casos (`describe('stepReps')` L171) | ✅ green |
| 17-02 | 17-02-PLAN.md | W0 | REG-01 | — | N/A | unit | `npx jest __tests__/sessionModel.test.ts -t "canCompleteSet"` (D-06) | ✅ arquivo / ✅ casos (L344-356) | ✅ green |
| 17-02 | 17-02-PLAN.md | W0 | REG-01 | — | N/A | unit | `npx jest __tests__/activeSessionStore.test.ts -t "Fase 17"` (seed `lastRepsByExercise` + update em `completeSet()`) | ✅ arquivo / ✅ casos (`describe('Fase 17 (REG-01)...D-17')` L551) | ✅ green |
| 17-04 | 17-04-PLAN.md | W0 | REG-01 | — | N/A | component (RTL/jsdom) | `npx jest __tests__/sessionPlayerTransitions.test.tsx -t "Fase 17"` (sem `TextInput` no fluxo padrão + marca de herdado + revelação direta D-06) | ✅ arquivo / ✅ casos, `describe('Fase 17 (REG-01)...')` L336, 5/5 (a)-(e) | ✅ green |
| 17-04 | 17-04-PLAN.md | W0 | REG-01 | — | N/A | manual (superfície real, app do aparelho — PWA abandonado) | Tela de sessão ativa no APP DO IPHONE (não PWA), build assinado do HEAD instalado 2026-08-19 10:12:33, exercício com histórico | ✅ executado pelo dono, 2026-08-19 — pré-preenchimento por histórico, ajuste só por +/−, marca de valor herdado, ausência de teclado, ausência de overflow. Reportado literalmente "testei e esta aprovado" | ✅ green (WINDOWS.md #5, `resolved` em 2026-08-19T15:37:59.000Z) |
| 17-01/17-03 | 17-01/17-03-PLAN.md | W0 | REG-02 | T-17-01 | Delta aplicado só via ação existente da store; widget/intent nunca escreve em ActivityKit direto | integration | `npx jest __tests__/liveActivityIntentBridge.test.ts` | ✅ arquivo / ✅ casos (`adjustLoad`/`adjustReps` roteando p/ `stepLoad`/`stepReps`) | ✅ green |
| 17-01/17-06 | 17-01/17-06-PLAN.md | W0 | REG-02 | T-17-01 | Payload de delta decodificado com peek não-destrutivo e ack condicionado; `deltaValue` propagado ponta a ponta na fila durável | integration | `npx jest __tests__/liveActivityIntentQueue.test.ts` | ✅ arquivo / ✅ casos — inclui regressão de CR-01 (`deltaValue` ausente no Record Expo, fechado em `b02041e`, +102 linhas de teste) | ✅ green |
| 17-07 | 17-07-PLAN.md | — | REG-02 | — | Acumulação sob toque rápido; orçamento de `Activity.update()`; navegação "abrir para ajustar" | manual (UAT físico) | Roteiro `17-UAT.md` itens 25-27 | ✅ executado — iPhone 13, 2026-08-19, PASS | ✅ green |
| 17-05 | 17-05-PLAN.md | W0 | PRED-01 | — | N/A | unit | `npx jest __tests__/liveActivityContentState.test.ts` (campos "A seguir", D-13..D-16) | ✅ arquivo / ✅ casos | ✅ green |
| 17-07 | 17-07-PLAN.md | — | PRED-01 | — | Linha "A SEGUIR" visível já no 1º segundo do descanso, migração de `ContentState` sem Activity presa | manual (UAT físico) | Roteiro `17-UAT.md` item 24 (+ verificação de código) | ✅ executado — PASS | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Verificação executada nesta auditoria (2026-08-19):**
`npx jest __tests__/sessionModel.test.ts __tests__/activeSessionStore.test.ts __tests__/liveActivityContentState.test.ts __tests__/sessionPlayerTransitions.test.tsx __tests__/liveActivityIntentBridge.test.ts __tests__/liveActivityIntentQueue.test.ts`
→ **6 suítes / 190 testes, todos PASS.** Todos os arquivos do Wave 0 existem e contêm os
casos nomeados que a tabela original marcava como "❌ casos W0" — essa marcação estava
desatualizada, não a implementação.

---

## Wave 0 Requirements

- [x] `__tests__/sessionModel.test.ts` — casos novos: `stepReps()` (nunca abaixo de 0,
      incremento fixo), sugestão de reps a partir de `SessionDraft.lastRepsByExercise` com
      queda para `targetRepsMin` na estreia (D-01), `canCompleteSet()` no pré-preenchimento
      que faz "Iniciar série" sumir (D-06). **Confirmado presente e verde nesta auditoria.**
- [x] `__tests__/activeSessionStore.test.ts` — casos novos: semeadura de
      `lastRepsByExercise` pelo mesmo caminho de `lastLoadByExercise` (mais recente por
      `completed_at`, chave `exerciseIdentity`) e atualização do mapa em `completeSet()`.
      **Confirmado presente e verde** (`describe('Fase 17 (REG-01)...D-17')`, L551).
- [x] `__tests__/liveActivityContentState.test.ts` — casos novos: composição dos campos de
      "A seguir" (próxima série/exercício + valor de `suggestLoad()`), rótulo único "A SEGUIR"
      com destaque na virada de exercício (D-15), ausência da linha dentro de bloco de
      cardio/alongamento **com** anúncio da entrada no bloco (D-16). **Confirmado presente e
      verde.**
- [x] `__tests__/liveActivityIntentBridge.test.ts` — casos novos `adjustReps`/`adjustLoad`
      roteando para a ação existente da store, sem lógica de domínio na ponte. **Confirmado
      presente e verde.**
- [x] `__tests__/liveActivityIntentQueue.test.ts` — casos novos para o campo de delta
      genérico em `QueuedIntentAction`. **Confirmado presente e verde** — inclui a regressão
      de CR-01 (`deltaValue` nunca chegava ao Record Expo `QueuedIntentActionRecord`,
      achado CRITICAL do `17-REVIEW.md`, fechado no commit `b02041e` com +102 linhas de teste).
- [x] Nenhum framework de teste Swift a instalar — fora do escopo. Cobertura Swift = compilação
      (`verify-native-skeleton.sh`, exit 0) + UAT físico (`17-UAT.md`, 7/7 PASS).
- [x] **GAP FECHADO nesta reauditoria (2026-08-19).** O caminho original de `17-04-PLAN.md`
      Task 2 (`npx expo start --web`, viewport 390×844, navegador real) ficou **inexequível**,
      não apenas não-executado: rodar `expo start --web` de verdade crasha no mount
      (`Cannot find native module 'LiveActivityModule'` — `modules/live-activity/index.ts:49`
      chama `requireNativeModule` no topo do módulo sem guarda de `Platform.OS`; mesmo padrão
      em `liveActivitySync.ts` e `liveActivityIntentBridge.ts`). Bug pré-existente da Fase 16
      (commit `3dabb0e`), não regressão da Fase 17 — confirmado por leitura do código, não
      apenas relatado. Por decisão do dono em 2026-08-19, web/PWA deixou de ser superfície
      suportada na v1.3 (o milestone virou app nativo pessoal); a réplica Chromium/Playwright
      do box-model (`17-04-pwa-check.png`) permanece válida como prova de layout, mas não é
      mais o critério de fechamento.
      A verificação de REG-01 migrou para a superfície real equivalente — o app do
      aparelho. Em 2026-08-19 o dono abriu a tela de sessão ativa no APP DO IPHONE (não a
      tela bloqueada — essa é REG-02), num build assinado do HEAD instalado às 10:12:33 do
      mesmo dia, num exercício com histórico, e confirmou os quatro critérios do gap
      original: pré-preenchimento vindo do histórico, ajuste só por +/−, marca de valor
      herdado, ausência de teclado e de overflow. `WINDOWS.md` janela #5 tem `status:
      "resolved"`, `resolved_at: "2026-08-19T15:37:59.000Z"` e o texto de `reason` nomeia a
      superfície (app do iPhone, não PWA) e o horário do build — bloco JSON e linha da
      tabela concordam. `REQUIREMENTS.md` reflete o mesmo fechamento (REG-01 "Complete e
      VERIFICADO EM SUPERFICIE REAL desde 2026-08-19", linha 132-145).
      **Por que a substituição de superfície é legítima:** o requisito REG-01 fala do
      comportamento do registro de série no app, não do PWA especificamente — o PWA era o
      canal de verificação planejado, não o objeto do requisito. Com o PWA descontinuado por
      decisão explícita do dono (não por atalho do executor) e o app do aparelho sendo o
      canal real de uso em produção da v1.3, a verificação no app do iPhone é evidência
      igualmente forte — na verdade mais forte, por ser a superfície que o usuário real usa.
      Não há lacuna residual: os quatro critérios do requisito foram checados um a um em
      superfície real, com timestamp de build e aprovação literal registrada.

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

- [x] Todas as tarefas têm `<verify>` automatizado ou dependência declarada de Wave 0. A
      linha REG-01/superfície-real, que na primeira auditoria era dependência declarada mas
      não satisfeita, tem agora verificação manual real executada (app do iPhone, ver acima).
- [x] Continuidade de amostragem: nunca 3 tarefas consecutivas sem verify automatizado
- [x] Wave 0 cobre todas as referências MISSING acima, sem exceção remanescente: a
      verificação de superfície real de REG-01 migrou do PWA (inexequível, ver gap acima)
      para o app do aparelho e foi executada.
- [x] Nenhuma flag de watch-mode
- [x] Latência de feedback < 60 s (`npm test` completo re-executado nesta reauditoria: 6
      suítes / 190 testes do Wave 0, todos PASS em ~1s; suíte completa 167/167, ver
      `17-06-SUMMARY.md`)
- [x] Roteiro físico das 8 verificações manual-only escrito, auto-contido, com PASS/FAIL por
      item — executado em `17-UAT.md`, 27/27 itens PASS (inclui os 7 do roteiro físico do
      dono no iPhone 13, 2026-08-19)
- [x] `nyquist_compliant: true` no frontmatter — **marcado nesta reauditoria.** REG-02 e
      PRED-01 já tinham cobertura completa (automatizada + UAT físico) na primeira passada.
      REG-01 tinha cobertura automatizada real e forte no nível de lógica/componente (unit +
      RTL/jsdom, 100% dos casos do Wave 0 presentes e verdes) mas nenhuma verificação em
      superfície real. Essa lacuna está fechada: o dono verificou os quatro critérios do
      requisito (pré-preenchimento por histórico, ajuste só por +/−, marca de valor herdado,
      ausência de teclado/overflow) na tela de sessão ativa do APP DO IPHONE, build assinado
      do HEAD instalado 2026-08-19 10:12:33, com aprovação literal registrada
      ("testei e esta aprovado"). `WINDOWS.md` #5 está `resolved` com `resolved_at` e razão
      nomeando a superfície e o horário do build; `REQUIREMENTS.md` reflete o mesmo estado
      para os três requisitos (`Complete`). A substituição PWA→app do aparelho é legítima
      porque o requisito trata do comportamento de registro no app, não do canal PWA em si,
      e o PWA foi descontinuado por decisão explícita e documentada do dono (não por atalho
      do executor), com causa técnica confirmada por leitura de código
      (`modules/live-activity/index.ts:49`), não apenas por relato.

**Approval:** full — REG-01, REG-02 e PRED-01 aprovados, todos com cobertura automatizada
(unit/integration/component) e verificação em superfície real (UAT físico no iPhone 13 do
dono). Nenhuma lacuna residual identificada nesta reauditoria.
