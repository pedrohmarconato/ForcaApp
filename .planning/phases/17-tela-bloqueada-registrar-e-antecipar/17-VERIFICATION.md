---
phase: 17-tela-bloqueada-registrar-e-antecipar
verified: 2026-08-19T14:33:32Z
status: passed
score: 3/4 must-haves verified
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:

  - truth: "Criterio 1 do ROADMAP (REG-01, no app): reps e carga pre-preenchidos, ajustaveis so por botoes +/-, confirmados em 1 toque, sem teclado — nunca renderizado numa superficie REAL (nem tela do app no aparelho fisico, nem PWA em navegador real). So existe evidencia de (a) testes unitarios da funcao pura, (b) testes de comportamento React Testing Library/jsdom do componente, e (c) uma replica de CSS/box-model em Chromium via Playwright — nenhuma delas e o app rodando de verdade."
    test: "Abrir a tela de sessao ativa (nao a tela bloqueada) no iPhone fisico do dono numa serie com historico, e separadamente `npx expo start --web` num navegador real a 390x844, e confirmar visualmente: nenhum TextInput no fluxo padrao, steppers −/+ funcionais, card revela direto sem 'Iniciar serie' quando ja ha pre-preenchimento valido, nenhum overflow/corte de layout."
    expected: "Card renderiza sem estourar a largura, os dois steppers respondem ao toque, o valor herdado tem marca visual distinta, e 'Concluir serie' fecha a serie em 1 toque — igual ao que os testes automatizados jah prevem."
    why_human: "Nenhuma ferramenta neste ambiente sandboxed consegue rodar o app nativo real nem abrir um navegador real contra o Supabase do dono; testes automatizados provam a LOGICA mas nao a RENDERIZACAO real em nenhum dos dois canais (app nativo + PWA)."
human_verification:

  - test: "Abrir a tela de sessao ativa (nao a tela bloqueada) no iPhone fisico do dono numa serie com historico, e separadamente `npx expo start --web` num navegador real a 390x844, e confirmar visualmente: nenhum TextInput no fluxo padrao, steppers −/+ funcionais, card revela direto sem 'Iniciar serie' quando ja ha pre-preenchimento valido, nenhum overflow/corte de layout."
    expected: "Card renderiza sem estourar a largura, os dois steppers respondem ao toque, o valor herdado tem marca visual distinta, e 'Concluir serie' fecha a serie em 1 toque."
    why_human: "Restricao estrutural deste worktree sandboxed (sem .env/Supabase, sem MCP de browser, sem app nativo instalavel aqui) — so o dono, no aparelho ou num navegador real, pode confirmar a renderizacao. Ja registrado como WINDOWS.md #5 (kind=unrun-verify, status=open); esta verificacao preserva o item como pendencia formal em vez de aceitar a substituicao por replica como equivalente."
---

# Phase 17: Tela bloqueada — registrar e antecipar Verification Report

**Phase Goal:** O dono registra reps e carga sem teclado — pré-preenchido do histórico,
ajuste só por botões +/− e confirmação em 1 toque — tanto no app quanto na Live Activity
da tela bloqueada, e a tela bloqueada já antecipa a próxima série/exercício antes do
descanso acabar.

**Verified:** 2026-08-19T14:33:32Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | App: reps/carga pré-preenchidos, ajuste só +/−, confirmação 1 toque, sem teclado (REG-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Lógica implementada e testada por unit + RTL (código real, comportamento real exercitado — ver `sessionModel.ts:268-336`, `SessionPlayer.tsx`, `__tests__/sessionPlayerTransitions.test.tsx` 5/5 casos "Fase 17 (REG-01)" passam). **Nunca renderizado numa superfície real**: nem no app físico (17-07 excluiu explicitamente o Critério 1 do roteiro de UAT), nem no PWA real (checagem substituída por réplica Chromium/Playwright de box-model — `17-04-pwa-check.png`, não é o app rodando). Window `WINDOWS.md #5` continua `status: open`. |
| 2 | Live Activity: mesmo ajuste +/− e confirmação, valor acumulado preservado entre toques (REG-02) | ✓ VERIFIED | UAT físico do dono, iPhone 13, 2026-08-19 — Item 1 do roteiro PASS (`17-07-SUMMARY.md`). Código: `AdjustLoadIntent`/`AdjustRepsIntent` (Swift) → `IntentActionQueue` → `liveActivityIntentBridge.ts` `case 'adjustLoad'/'adjustReps'` → `stepLoad()`/`stepReps()` da store (nunca escreve em ActivityKit direto) — confirmado por leitura de código E por 5 testes nomeados que exercitam o comportamento (`liveActivityIntentQueue.test.ts`, rodados nesta verificação: PASS). |
| 3 | Valor fora do passo do stepper abre o app a partir da tela bloqueada (REG-02, D-12) | ✓ VERIFIED | UAT físico do dono, Item 4 do roteiro PASS. Código: `widgetURL` do card inteiro corrigido para `forcaapp://home/active-session/<sessionLogId>` (`WidgetLiveActivity.swift:277`); `stepLoad()` preserva o offset (37,5+5=42,5) sem snapping, confirmado em `sessionModel.ts:251-259`. |
| 4 | Tela bloqueada antecipa a próxima série/exercício antes do descanso zerar (PRED-01) | ✓ VERIFIED | UAT físico do dono, Item 5 do roteiro PASS. Código: `findPendingSetAfter()` + `anticipatedFieldsFor()` publicados em `measuring`/`resting`/`readyOvertime` (não só quando o timer zera) — `liveActivityContentState.ts:92-125`, linha "A SEGUIR" em `WidgetLiveActivity.swift:53-67`; suprimida em `blockOnly` (D-16) e com rótulo único + destaque só na virada de exercício (D-15), confirmado por leitura de código. |

**Score:** 3/4 truths verified (1 present, behavior-unverified)

### Ponto de ceticismo 1 — Conclusão explícita sobre REG-01/Critério 1

**Não considero o Critério 1 verificado ponta a ponta.** A lógica está corretamente
implementada (precedência híbrida D-17, materialização em `completeSet()`, stepper sem
teclado, marca de herdado, revelação direta D-06) e genuinamente testada por unit tests da
função pura e por testes de comportamento (React Testing Library) que de fato pressionam
botões e leem o DOM renderizado em jsdom — isso é mais forte que presença de símbolo. Mas
**nenhuma dessas evidências é a app rodando de verdade** em qualquer um dos dois canais que
o componente serve: (a) a tela do app no aparelho físico nunca foi incluída no roteiro de
UAT (o próprio `17-07-PLAN.md` a excluiu explicitamente), e (b) o PWA real nunca rodou neste
ambiente — foi substituído por uma réplica de CSS/box-model em Chromium (real, mas não é o
app). O próprio `SessionPlayer.tsx` é compartilhado entre os dois canais e já teve um bug de
largura real descoberto só por essa medição manual (não pelo automatizado) na própria
Task 2 do Plano 17-04 — o que mostra que o automatizado sozinho já errou uma vez nesta fase
para esse tipo de risco. Por isso mantenho o item como pendência formal de verificação
humana (não como gap de código) — a classificação de `WINDOWS.md #5` como `status: open`
está correta e não deveria ser fechada por esta verificação.

### Ponto de ceticismo 4 — Achado de design do Lock Screen não compromete Success Criteria

O achado registrado em `17-07-SUMMARY.md` ("o box na tela bloqueada está pequeno para tanta
informação") foi cruzado contra o critério PASS/FAIL literal do Item 6 do roteiro de UAT
(acertar o botão pretendido 5/5 por par, ler os números de relance) — o dono reportou PASS
nesse critério específico, sem menção a erro de toque ou corte de conteúdo. A consequência
"card denso" já estava aceita por escrito na D-09 do `17-CONTEXT.md` antes da implementação
("Consequência aceita: o card do Lock Screen fica denso... legibilidade de longe e tamanho
dos botões são critério de aprovação no UAT físico, não detalhe"). Concordo com a
classificação do executor: **não é gap da Fase 17**, é observação de qualidade sobre uma
consequência já prevista e aceita, sem correspondência com nenhum dos 4 Success Criteria do
ROADMAP. Fica como escopo novo de design, decisão do dono sobre onde alocar.

### Required Artifacts (amostra verificada por leitura direta do código)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `modules/live-activity/ios/AdjustLoadIntent.swift` + stub em `targets/session-widget/` | Intent enfileira via `IntentActionQueue`, nunca escreve em ActivityKit | ✓ VERIFIED | Código lido; `perform()` só chama `enqueue` + `sendEvent`, `Activity.update()` ausente |
| `modules/live-activity/ios/AdjustRepsIntent.swift` + stub | Espelha `AdjustLoadIntent` para reps | ✓ VERIFIED | Código lido, idêntico ao molde |
| `src/engine/sessionModel.ts` — `lastRepsByExercise`, `isFirstSetOfExerciseInSession`, `suggestReps`, `stepReps`, `resolveInheritedSet` | Motor de precedência híbrida D-17 | ✓ VERIFIED | Código lido linha a linha; 13 testes nomeados D-17 rodados nesta verificação, PASS |
| `src/store/activeSessionStore.ts` — `completeSet()` materializa via `resolveInheritedSet()` antes de `canCompleteSet()` | "1 toque" sem ajuste grava herdado | ✓ VERIFIED | Código lido (`activeSessionStore.ts:1481-1497`); 6 testes "REG-01" rodados, PASS |
| `src/store/activeSessionStore.ts` — `reconcileLiveActivityIntents()` cobre `adjustReps`/`adjustLoad` | Cold-launch não perde toque enfileirado | ✓ VERIFIED | Código lido (`:1892-1911`); 5 testes nomeados rodados, PASS |
| `src/components/session/SessionPlayer.tsx` — steppers, marca herdado, revelação direta | REG-01 no app | ⚠️ PRESENT, comportamento provado só em RTL/jsdom | Ver Ponto de ceticismo 1 |
| `src/engine/liveActivityContentState.ts` + 2 cópias de `SessionActivityAttributes.swift` — campos `current*`/`next*` | Contrato ContentState estendido 3x, cópias idênticas | ✓ VERIFIED | `diff -q` das duas cópias rodado nesta verificação: idênticas |
| `targets/session-widget/WidgetLiveActivity.swift` — steppers, "Ajustar no app", linha "A SEGUIR" | UI do Lock Screen | ✓ VERIFIED | Código lido; `openAppWhenRun` ausente (prohibition respeitada); widgetURL corrigido |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `AdjustLoadIntent.perform()` | `liveActivityIntentBridge.ts` case `adjustLoad` | `IntentActionQueue.enqueue` → `sendEvent('onIntentAction')` | ✓ WIRED |
| `AdjustRepsIntent.perform()` | `liveActivityIntentBridge.ts` case `adjustReps` | idem | ✓ WIRED |
| `liveActivityIntentBridge.ts` cases | `activeSessionStore.stepLoad()`/`stepReps()` | chamada direta, delta reaplicado pelo passo real do exercício | ✓ WIRED |
| `activeSessionStore.completeSet()` | `resolveInheritedSet()` → `canCompleteSet()` | materialização antes da validação | ✓ WIRED |
| `buildLiveActivityContentState()` | `WidgetLiveActivity.swift` | campos `current*`/`next*` no `ContentState` | ✓ WIRED (leitura de código; renderização real não confirmada para o app-screen equivalente, mas confirmada para o Lock Screen via UAT físico) |
| `reconcileLiveActivityIntents()` | `stepReps()`/`stepLoad()` (cold-launch) | `case 'adjustReps'/'adjustLoad'` no switch | ✓ WIRED |

### Behavioral Spot-Checks (rodados nesta verificação, não apenas citados do SUMMARY)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Precedência híbrida D-17 (ambos os ramos) | `npx jest __tests__/sessionModel.test.ts -t "D-17"` | 13 passed | ✓ PASS |
| Materialização herdada em `completeSet()` | `npx jest __tests__/activeSessionStore.test.ts -t "REG-01"` | 6 passed | ✓ PASS |
| Reconciliação cold-launch adjustReps/adjustLoad | `npx jest __tests__/liveActivityIntentQueue.test.ts -t "adjustReps\|adjustLoad"` | 5 passed | ✓ PASS |
| Steppers sem teclado / marca herdado / revelação direta (RTL) | `npx jest __tests__/sessionPlayerTransitions.test.tsx -t "Fase 17"` | 5 passed | ✓ PASS |
| Largura PWA em viewport 390×844 (matemática, não app real) | `npx jest __tests__/loadInputLayoutWeb.test.ts` | 12 passed | ✓ PASS (não substitui o app real) |
| Paridade das duas cópias `SessionActivityAttributes.swift` | `diff -q targets/... modules/...` | idênticas | ✓ PASS |
| Esqueleto nativo sobrevive a `--clean` (2 rodadas) | `bash scripts/verify-native-skeleton.sh` | exit 0, (a)-(h) OK 2x | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Ausência de debt markers nos arquivos tocados pela fase | `grep TODO\|FIXME\|TBD\|XXX\|PLACEHOLDER` nos 19 arquivos de produção da fase | nenhum resultado | ✓ PASS |
| `openAppWhenRun` (prohibition do Plano 17-01) | `grep -rn openAppWhenRun targets/ modules/ src/` | nenhum resultado | ✓ PASS |

Suíte completa (167 suítes/1977 testes, exit 0) e build assinado no aparelho — **não
re-rodados nesta verificação** (fato já estabelecido, confirmado por evidência de máquina
citada em `17-06-SUMMARY.md`/`17-07-SUMMARY.md`); os spot-checks acima usam testes nomeados
únicos, sem repetir a suíte inteira, conforme a restrição de custo desta verificação.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| REG-01 | 17-02 (motor), 17-04 (UI) | ⚠️ Human needed (não FAILED) | Lógica implementada e testada; renderização real (app físico ou PWA real) nunca confirmada — `WINDOWS.md #5` open |
| REG-02 | 17-01 (carga), 17-03 (reps + reconciliação) | ✓ SATISFIED | UAT físico PASS (17-07), código lido e testado |
| PRED-01 | 17-05 | ✓ SATISFIED | UAT físico PASS (17-07), código lido e testado |

Todos os IDs de requisito declarados nos frontmatters de `17-01` a `17-07` (`REG-01`,
`REG-02`, `PRED-01`) aparecem em `.planning/REQUIREMENTS.md` sob a fase 17 — nenhum
requisito órfão encontrado. **Discrepância de documentação (não de código):**
`REQUIREMENTS.md` marca REG-01 como `[x]`/`Complete` na tabela de traceability (linha 51 e
116), mas a nota narrativa abaixo da mesma tabela (linhas 122-142) contradiz isso e mantém a
janela aberta. Recomenda-se ao dono decidir se a marcação `[x]`/`Complete` deve ser
rebaixada até o item humano acima ser resolvido — não alterei `REQUIREMENTS.md` (fora do
escopo desta verificação, que não deve tocar STATE.md/ROADMAP.md nem, por extensão,
comprometer a mesma trilha de documentação de forma unilateral).

### Anti-Patterns Found

Nenhum. Varredura de `TODO|FIXME|TBD|XXX|HACK|PLACEHOLDER|not yet implemented|coming soon`
nos 19 arquivos de produção tocados pela fase (Swift + TS) não retornou nenhuma ocorrência.
Nenhuma prohibition violada (`openAppWhenRun` ausente; nenhuma escrita direta em
`Activity.update()` dentro de um `LiveActivityIntent`; nenhum snapping de carga a múltiplos
do passo — `stepLoad()` preserva offset).

### Human Verification Required

#### 1. Renderização real de REG-01 (Critério 1) — nem app físico, nem PWA real

**Test:** Abrir a tela de sessão ativa (não a tela bloqueada) no iPhone físico do dono numa
série com histórico, e separadamente `npx expo start --web` num navegador real a 390×844.
**Expected:** Card renderiza sem estourar a largura, os dois steppers respondem ao toque, o
valor herdado tem marca visual distinta, "Concluir série" fecha a série em 1 toque, nenhum
TextInput aparece exceto na estreia sem histórico/alvo (D-04).
**Why human:** Restrição estrutural do ambiente de execução — sem Supabase real, sem MCP de
browser, sem app nativo instalável aqui. Já registrado formalmente em `WINDOWS.md` (#5,
`status: open`); esta verificação preserva o item em vez de aceitar a réplica Chromium como
equivalente ao app rodando.

### Gaps Summary

Nenhum gap de código encontrado — toda a lógica, wiring e testes automatizados das 7
plans estão presentes, corretos e coerentes com o `CONTEXT.md` (D-01 a D-17 honradas,
confirmado por leitura direta do código, não pelos SUMMARYs). O único item pendente é de
**verificação humana**, não de implementação: a renderização real do Critério 1 (REG-01) em
qualquer superfície de fato rodando (app físico ou PWA real), que o UAT físico do Plano
17-07 deliberadamente não cobriu (por desenho do próprio ROADMAP, que não marca o Critério 1
como UAT físico) e que o worktree sandboxed não conseguiu cobrir por conta própria. Critérios
2, 3 e 4 do ROADMAP (REG-02 e PRED-01) estão fechados com evidência de aparelho físico real.

---

_Verified: 2026-08-19T14:33:32Z_
_Verifier: Claude (gsd-verifier)_
