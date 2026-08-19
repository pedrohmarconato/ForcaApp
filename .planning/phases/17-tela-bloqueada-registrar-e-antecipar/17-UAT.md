---
status: complete
phase: 17-tela-bloqueada-registrar-e-antecipar
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md, 17-06-SUMMARY.md, 17-07-SUMMARY.md
started: 2026-08-19T14:58:31Z
updated: 2026-08-19T15:16:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Após instalação do binário Release, o app abre do zero sem erro: sessão nova inicia limpa, Live Activity sem campos em branco/zerados e sem erro de decode do ContentState.
result: pass

### 2. AdjustLoadIntent — fila e despacho (17-01 D1)
expected: Ajuste de carga vindo do Lock Screen enfileira via IntentActionQueue, dispara sendEvent e nunca chama Activity.update() direto — comportamento espelhado do AdjustRestIntent, com stub e impl real.
result: pass

### 3. ContentState de carga em edição (17-01 D2)
expected: ContentState carrega currentLoadKg/isLoadInherited/loadIncrementKg só em measuring (precedência actual > target > histórico via suggestLoad); bridge JS despacha 'adjustLoad' via stepLoad() da store, nunca grava direto.
result: pass
source: automated
coverage_id: D2

### 4. Stepper de carga no Lock Screen (17-01 D3)
expected: No caso .measuring, o par −/+ de carga aparece com o valor herdado em opacidade reduzida; affordance "Ajustar no app" sem tap target próprio; widgetURL aponta para forcaapp://home/active-session/<sessionLogId>.
result: pass

### 5. Confirmação automática — reps herdadas (17-02)
expected: Os três entregáveis de reps herdadas foram cobertos por testes de unidade passando: suggestReps() com precedência híbrida (1ª série = histórico>alvo; seguinte = alvo>histórico), getLastRepsByExercise() no repositório (fallback 42703, sem migration nova), e stepReps/seedLastReps/reconciliação no activeSessionStore. Confirmar que a cobertura automática reflete o comportamento esperado.
result: pass

### 6. suggestReps híbrido (17-02 D1)
expected: SessionDraft.lastRepsByExercise + isFirstSetOfExerciseInSession() + suggestReps() com precedência híbrida D-17 + stepReps() + resolveInheritedSet() em sessionModel.ts.
result: pass
source: automated
coverage_id: D1

### 7. getLastRepsByExercise no repositório (17-02 D2)
expected: getLastRepsByExercise() em sessionExecutionRepository.ts espelha getLastLoadByExercise() filtrando em actual_reps, com fallback 42703 da migration 0026.
result: pass
source: automated
coverage_id: D2

### 8. stepReps e materialização na store (17-02 D3)
expected: activeSessionStore.ts: stepReps, suggestedRepsFor(), seedLastReps() nos dois call sites de startOrResume, reconciliação em applyServerSetLogs() e materialização via resolveInheritedSet() antes de canCompleteSet().
result: pass
source: automated
coverage_id: D3

### 9. AdjustRepsIntent — fila e despacho (17-03 D1)
expected: Ajuste de reps vindo do Lock Screen enfileira via IntentActionQueue, dispara sendEvent e nunca chama Activity.update() direto — espelhando o AdjustLoadIntent, com stub e impl real.
result: pass

### 10. ContentState de reps em edição (17-03 D2)
expected: ContentState carrega currentReps/isRepsInherited só em measuring (precedência híbrida D-17 via suggestReps()); bridge JS despacha 'adjustReps' via stepReps() da store.
result: pass
source: automated
coverage_id: D2

### 11. Stepper de reps no Lock Screen (17-03 D3)
expected: No caso .measuring, o par −/+ de reps aparece em todo exercício carga_reps (inclusive bodyweight); reconcileLiveActivityIntents() trata os cinco kinds (completeSet/skipRest/adjustRest/adjustReps/adjustLoad) sem deixar entrada presa na fila.
result: pass

### 12. Reps viram stepper no fluxo padrão (17-04 D1)
expected: Reps deixa de ser TextInput editável no fluxo padrão — vira stepper (−/valor/+) via stepReps(); TextInput só sobrevive na estreia sem histórico/alvo (carga).
result: pass
source: automated
coverage_id: D1

### 13. Valor herdado marcado visualmente (17-04 D2)
expected: Valor herdado (ainda não tocado) marcado com styles.inheritedValue até o primeiro +/−, para reps e carga.
result: pass
source: automated
coverage_id: D2

### 14. Card measuring revela-se direto (17-04 D3)
expected: Card measuring abre direto (sem "Iniciar série") quando o pré-preenchimento passa em canCompleteSet(); continua exigindo "Iniciar série" quando não passa.
result: pass
source: automated
coverage_id: D3

### 15. PWA web não regride a 390×844 (17-04 D4)
expected: App real rodando via `npx expo start --web` em viewport 390×844 (DevTools): stepper de reps e de carga empilhados não estouram a largura (sem overflow horizontal). Existe compensação forte (replicação exata do box-model em Chromium via Playwright, 0 overflow medido, screenshot em 17-04-pwa-check.png), mas o app real não foi rodado neste ambiente — janela #5 do WINDOWS.md. Rodar a checagem real agora ou aceitar a compensação.
result: pass

### 16. findPendingSetAfter (17-05 D1)
expected: findPendingSetAfter() — série pendente estritamente posterior a uma referência, ignorando cutByReplan, nunca lança para referência ausente.
result: pass
source: automated
coverage_id: D1

### 17. Campos next* antecipados (17-05 D2)
expected: 6 campos next* compostos por anticipatedFieldsFor() em measuring/resting/readyOvertime; suprimidos em blockOnly; virada para cardio/alongamento mostra só o nome; buildFinishedContentState preenche null.
result: pass
source: automated
coverage_id: D2

### 18. Linha "A SEGUIR" no Lock Screen (17-05 D3)
expected: Linha "A SEGUIR" aparece no WidgetLiveActivity nos casos .measuring/.resting/.readyOvertime, com destaque visual (activityNeon + peso de fonte) só quando o exercício antecipado difere do atual.
result: pass

### 19. Suíte Jest completa (17-06 D1)
expected: Suite Jest completa (167/167 suítes, 1977/1977 testes) passa após integração dos 5 planos anteriores.
result: pass
source: automated
coverage_id: D1

### 20. tsc sem erros (17-06 D2)
expected: npx tsc --noEmit não acusa erro em nenhum arquivo tocado pela fase.
result: pass
source: automated
coverage_id: D2

### 21. verify-native-skeleton.sh (17-06 D3)
expected: scripts/verify-native-skeleton.sh passa (a)-(h) em 2 rodadas consecutivas, incluindo diff-parity de SessionActivityAttributes.swift.
result: pass
source: automated
coverage_id: D3

### 22. expo prebuild preserva nativos (17-06 D4)
expected: expo prebuild --clean não apaga nenhum target/módulo nativo da fase (session-widget, native-info, live-activity sobrevivem, autolinked e no Podfile.lock).
result: pass
source: automated
coverage_id: D4

### 23. Binário Release compila (17-06 D5)
expected: Binário Release compila com todas as mudanças Swift+TS da fase (npm run resign: BUILD SUCCEEDED na etapa 4/8). Instalação no aparelho via cabo é a etapa física que falta — já coberta pelo UAT físico de 17-07.
result: pass

### 24. Migração de ContentState pós-instalação (17-07 D1)
expected: Sessão nova após instalação do binário 17-06 não apresenta campo em branco/zerado nem erro de decode no Live Activity (Pitfall 4).
result: pass

### 25. Critério 2 — ajuste com valor preservado (17-07 D2)
expected: Ajuste de reps/carga na tela bloqueada preserva o valor entre toques (REG-02).
result: pass

### 26. Rajada de toques (17-07 D3)
expected: Toque rápido repetido não abre o app sozinho e não perde incrementos (Pitfall 1).
result: pass

### 27. Orçamento de Activity.update() (17-07 D4)
expected: Sob rajada de toques, o card acompanha sem atraso perceptível (Pitfall 2).
result: pass

### 28. Critério 3 — deep link de carga fora do passo (17-07 D5)
expected: Valor de carga fora do passo do stepper abre o app direto na sessão/série correta (forcaapp://home/active-session/<sessionLogId>).
result: pass

### 29. Critério 4 — "A SEGUIR" desde o primeiro segundo (17-07 D6)
expected: Linha "A SEGUIR" visível desde o primeiro segundo do descanso (PRED-01).
result: pass

### 30. Alvo de toque e legibilidade (17-07 D7)
expected: Acerta o botão pretendido 5/5 por par e lê os números de relance. Atenção: o achado de design registrado (card denso no Lock Screen — "box pequeno para tanta informação", escopo novo de design sem plano) não reabre REG-02/PRED-01; decidir se vira fase própria.
result: pass

### 31. Paridade das cópias de SessionActivityAttributes.swift (17-07 D8)
expected: As duas cópias de SessionActivityAttributes.swift permanecem byte-idênticas (diff-parity check).
result: pass
source: automated
coverage_id: D8

## Summary

total: 31
passed: 31
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]

## Deferred Follow-Ups

- test: 30
  idea: "Card do Lock Screen está pequeno para a quantidade de informação — remodelar design (achado registrado em 17-07-SUMMARY.md, escopo novo, sem plano)"
  deferred_at: 2026-08-19
