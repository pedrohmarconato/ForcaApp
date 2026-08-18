---
phase: 16-tela-bloqueada-comandar
verified: 2026-08-18T14:00:00Z
status: gaps_found
score: 7/9 must-haves verificados
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/8
  gaps_closed:
    - "Gap 2 (truth #8) — nenhum caminho de gravação paralelo/duplicado: id estável (UUID) + ackIntentAction (16-05) fecham a janela de replay do caminho quente. Confirmado por UAT físico real (sem_duplicacao=PASS, 16-06-SUMMARY.md)."
  gaps_remaining:
    - "Gap 1 (truth #6) — reconcileLiveActivityIntents() ainda NÃO aplica a intenção no cenário de cold-launch que motivou sua criação. A guarda de hidratação de 16-04 impede a perda quando draft ainda é null, mas não cobre o caso em que draft já foi hidratado e completeSet() reprova a validação (canCompleteSet) — a fila já foi drenada e destruída antes dessa reprovação ser conhecida. Confirmado por UAT físico real (force_quit_toque=FAIL, não PASS-A nem PASS-B, 16-06-SUMMARY.md)."
  regressions: []
gaps:
  - truth: "D1 — drainAll() destrói a fila do App Group antes de saber se a ação pode ser aplicada; um completeSet() reprovado perde o toque para sempre"
    status: failed
    reason: >
      Viola diretamente a prohibition escrita em 16-04-PLAN.md ("uma entrada só
      pode ser destruída no momento em que é de fato aplicada ou definitivamente
      descartada por CAS ... nunca por estar 'de passagem'"). A guarda de
      hidratação de 16-04 (`if (!draftAtual || draftAtual.status !== 'active')
      return;`) só cobre o caso "draft ausente" — uma vez que draft existe e
      está 'active', reconcileLiveActivityIntents() chama
      drainQueuedLiveActivityIntents() (destrutivo: readAll + removeObject na
      mesma chamada) e SÓ DEPOIS tenta aplicar cada entrada. Se completeSet()
      reprova a validação (canCompleteSet retorna false por reps/carga
      ausentes) e retorna `false`, o switch em activeSessionStore.ts:1602-1618
      ignora esse retorno — não há re-enfileiramento, não há segunda chance. O
      toque do dono é perdido de forma irrecuperável. Confirmado por leitura de
      código E por UAT físico real: force_quit_toque=FAIL com o erro exato
      previsto por essa causa raiz ("Informe repetições e carga antes de
      concluir a série").
    artifacts:
      - path: "modules/live-activity/ios/IntentActionQueue.swift"
        issue: "drainAll() (linhas 80-83) permanece destrutivo — lê e remove do UserDefaults na mesma chamada, sem devolução em caso de aplicação reprovada. remove(ids:) seletivo (16-05) existe mas não é usado por este caminho."
      - path: "src/store/activeSessionStore.ts"
        issue: "reconcileLiveActivityIntents() (linhas 1574-1618) drena a fila incondicionalmente assim que há draft ativo (linha 1584), e o switch (linha 1602-1618, case 'completeSet' linha 1603) ignora o retorno booleano de completeSet() — nenhum re-enfileiramento quando a validação reprova."
      - path: "src/store/activeSessionStore.ts"
        issue: "ackQueuedLiveActivityIntent (mecanismo de remoção seletiva construído em 16-05) NUNCA é importado nem usado neste arquivo — a reconciliação de cold-launch continua ligada só a drainAll(), não ao remove(ids:) seletivo já disponível."
    missing:
      - "Trocar drainAll() por uma leitura não-destrutiva na reconciliação de cold-launch: aplicar cada entrada e só confirmar remoção (via IntentActionQueue.remove(ids:) + ackIntentAction, já implementados em 16-05) para as entradas efetivamente aplicadas ou definitivamente descartadas por CAS — nunca para as que completeSet() reprovou por validação."
      - "Um caso de teste que reproduza exatamente o cenário do UAT: draft hidratado, entrada 'completeSet' na fila, canCompleteSet() reprovando (reps/carga ausentes) — hoje a suíte (__tests__/liveActivityIntentQueue.test.ts) mocka completeSet como jest.fn().mockResolvedValue(true), então esse caminho nunca é exercitado (confirmado em 16-06-SUMMARY.md)."
  - truth: "D2 — reps/carga informados na tela bloqueada nunca são persistidos; force-quit os descarta antes de completeSet() poder usá-los"
    status: failed
    reason: >
      setReps/setLoad (activeSessionStore.ts:1137-1157) só fazem `set({ draft:
      ... })` — nenhuma chamada a saveDraft(). Os valores digitados vivem
      exclusivamente em memória (estado do Zustand); um force-quit descarta
      esse estado antes de qualquer persistência em disco. Ao reabrir, o app
      hidrata `draft` a partir do último saveDraft() persistido (sem os
      valores digitados), e canCompleteSet() (sessionModel.ts:262-278) reprova
      legitimamente por reps/carga ausentes — é a causa direta do erro visível
      "Informe repetições e carga antes de concluir a série" que o dono viu no
      UAT, mesmo tendo informado os valores antes do force-quit.
    artifacts:
      - path: "src/store/activeSessionStore.ts"
        issue: "setReps (linhas 1137-1146) e setLoad (linhas 1148-1157) atualizam o draft em memória via set({ draft: ... }) mas não chamam saveDraft — comparar com stepLoad e outras ações da store que persistem via saveDraft (linhas 954, 1038, 1479, 1513, 1680, 1723, 1792)"
    missing:
      - "setReps/setLoad passam a persistir via saveDraft (ou um debounce equivalente) para que valores digitados sobrevivam a um force-quit — sem isso, D1 continuaria acontecendo mesmo que a fila fosse não-destrutiva, porque o draft reidratado nunca teria os valores para canCompleteSet() aprovar"
  - truth: "D3 — activateSet() não desativa a série anterior; duas séries ficam 'active' simultaneamente e findActiveSet() devolve a errada"
    status: failed
    reason: >
      activateSet() (activeSessionStore.ts:1109-1120) só ativa a série alvo
      (via withSet, escopado a exerciseId/setOrder) e nunca desativa nenhuma
      série que já estivesse 'active'. Depois de um completeSet() reprovado
      (D1) deixar uma série travada em 'active', o skipRest seguinte ativa a
      série do próximo exercício pendente via a busca GLOBAL
      findNextPendingSet() (sessionModel.ts:300-307) — sem nunca desativar a
      travada. Com duas séries 'active' simultâneas, findActiveSet()
      (sessionModel.ts:290-297) devolve a PRIMEIRA por ordem de array, que é a
      travada, não a nova. Confirmado por UAT físico: "Pular" na última série
      de um exercício volta para a mesma série em vez de avançar
      (regressao_geral=FAIL, 16-06-SUMMARY.md).
    artifacts:
      - path: "src/store/activeSessionStore.ts"
        issue: "activateSet (linhas 1109-1120) não desativa nenhuma série previamente 'active' antes de ativar o alvo"
      - path: "src/engine/sessionModel.ts"
        issue: "findActiveSet (linhas 290-297) devolve a primeira série 'active' por ordem de array — sem invariante de unicidade garantida por activateSet, o resultado é ambíguo quando duas séries estão 'active'"
    missing:
      - "activateSet() (ou um invariante equivalente em completeSet()/skipRest) garantir que no máximo uma série do draft esteja 'active' por vez — desativando qualquer série 'active' remanescente antes/ao ativar a nova"
      - "Um caso de teste que reproduza a sequência real: completeSet reprovado deixando uma série 'active' + skipRest no exercício seguinte + assert de que apenas a série nova está 'active'"
deferred: []
human_verification: []
---

# Phase 16: Tela bloqueada — comandar Verification Report

**Phase Goal:** O dono controla a série atual e o descanso direto da tela bloqueada — sem abrir o app — com cada toque seguindo o mesmo caminho de registro (`completeSet()` → outbox → servidor) que já existe hoje; a Live Activity nunca vira fonte de verdade.
**Verified:** 2026-08-18
**Status:** gaps_found
**Re-verification:** Sim — segunda rodada, após execução das planos de gap closure 16-04 (fix candidato do gap 1), 16-05 (fix do gap 2) e 16-06 (UAT física de re-execução)

## Contexto desta rodada

A verificação anterior (`gaps_found`, 6/8) identificou dois gaps críticos: (1)
`reconcileLiveActivityIntents()` nunca aplicava a intenção no cold-launch por
causa de uma corrida com a hidratação do `draft`; (2) nenhum mecanismo de ack
impedia replay/duplicação do caminho quente contra o cold-launch. Duas planos
de correção foram executadas (16-04, 16-05) e uma sessão de UAT físico real
(16-06) re-executou o runbook no aparelho do dono.

**Resultado da sessão física (18/08/2026, iPhone real, build Release
reassinado a partir de `e201cd0`):**

| Item do runbook | Resultado |
|---|---|
| `sem_duplicacao` | **PASS** |
| `force_quit_toque` | **FAIL** |
| `regressao_geral` | **FAIL** |

O gap 2 fechou de fato. O gap 1 **não fechou** — o toque na tela bloqueada
durante force-quit continua sendo perdido, agora por uma causa raiz mais
profunda que o fix de 16-04 expôs (transformou perda silenciosa em falha
visível) sem eliminar. Investigação por leitura de código identificou três
defeitos pré-existentes (D1, D2, D3) responsáveis pelas duas falhas do UAT.
Nenhum dos três é regressão de 16-04/16-05 — todos antecedem a Fase 16 (D1
herda de 16-02/`17946c2`, D2/D3 vêm de `d249212`, 23/07/2026) — mas os três
seguem bloqueando o fechamento de CMD-01.

**CMD-01 e CMD-02 permanecem `Gaps Found`.** Não foram marcados como
completos nesta verificação nem em nenhum artefato da rodada — o
`requirements-completed` de `16-06-SUMMARY.md` foi deixado vazio
deliberadamente, e `REQUIREMENTS.md` mantém `- [ ]` para os dois. Isso evita
repetir o erro revertido no commit `82c23c8`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (16-01) Toque em "Concluir série" no Lock Screen registra via completeSet() já existente, caminho quente | ✓ VERIFIED | Regressão confirmada em 16-05 (`npm test` 167/167 suites, 1877/1877 testes); nenhuma mudança nesse caminho desde a verificação anterior |
| 2 | (16-01) "-30s"/"+30s" chama adjustRest(deltaSeconds) com o delta exato, sem lag perceptível | ✓ VERIFIED | UAT físico anterior (16-03): `ajustar_descanso=PASS`, `sem_lag=PASS`; nenhuma mudança relevante nesta rodada |
| 3 | (16-01) "Pular" ativa a próxima série pendente via activateSet(), mesma função do app | ⚠️ CONDICIONAL — verdadeiro apenas quando não há série travada por D1 | UAT físico anterior confirmou o caminho feliz (`pular_descanso=PASS`, 16-03). Mas o UAT desta rodada (16-06) mostra que, quando uma série anterior fica travada `active` por D1, `activateSet()`/`findActiveSet()` produzem o resultado errado (D3) — "Pular" na última série de um exercício não avança. A função em si despacha corretamente; o defeito é a ausência de invariante de unicidade de série ativa (ver gap D3) |
| 4 | (16-01) Nenhum botão abre o app a partir de dentro de perform() | ✓ VERIFIED | Sem mudança desde a verificação anterior; confirmado por leitura |
| 5 | (16-01) Cada toque escreve na fila durável ANTES do evento in-process | ✓ VERIFIED | Sem mudança de comportamento; `id` estável (16-05) viaja no mesmo enqueue+sendEvent |
| 6 | (16-02+16-04) reconcileLiveActivityIntents() aplica cada intenção pendente drenada no boot/retomada, no cenário de cold-launch para o qual foi construída | ✗ FAILED | 16-04 corrigiu a corrida com a hidratação (guarda `!draftAtual \|\| status !== 'active'`), mas NÃO corrigiu o caso em que o draft já existe e `completeSet()` reprova a validação — a fila já foi drenada (destrutivamente) antes disso ser sabido. UAT físico real: `force_quit_toque=FAIL` (erro visível + toque perdido + série travada), não o PASS-A esperado. Causa raiz: D1+D2 (ver gaps) |
| 7 | (16-02) Intenção com sessionLogId nulo/divergente é descartada, nunca aplicada contra sessão errada | ✓ VERIFIED | Guarda de CAS inalterada desde a verificação anterior; sem regressão |
| 8 | Nenhum caminho de gravação paralelo/duplicado — cada toque produz exatamente uma gravação | ✓ VERIFIED (fechado nesta rodada) | 16-05 implementou id estável (UUID) + `ackIntentAction`/`IntentActionQueue.remove(ids:)`; UAT físico real confirma: `sem_duplicacao=PASS` — nenhuma ação reaplicada após a sequência "toque com app vivo → force-quit → reabrir" |
| 9 | (roadmap SC-3) Um teste de "force-quit + toque" mostra comportamento aceitável — ação aplicada de fato OU app reaberto para concluir sem erro/travamento (PASS-A ou PASS-B) | ✗ FAILED | O resultado observado não é nenhuma das duas saídas aceitáveis do critério: há erro visível ("Informe repetições e carga antes de concluir a série"), o toque é perdido de forma irrecuperável, e a série fica em estado inconsistente (duas séries `active` simultâneas). `16-06-SUMMARY.md` classifica explicitamente esse resultado como FAIL, não PASS-B, citando o próprio critério do plano ("qualquer travamento, erro visível, ou série em estado inconsistente é FAIL") |

**Score:** 7/9 truths verificadas (0 presentes-comportamento-não-exercitado)

### Defeitos pré-existentes descobertos nesta rodada (D1/D2/D3)

Estes três defeitos são a causa raiz comprovada (por UAT físico + leitura de
código) das falhas `force_quit_toque` e `regressao_geral`. Cada um está
estruturado como gap acionável na seção YAML acima para `/gsd-plan-phase 16
--gaps`.

| ID | Defeito | Arquivo:linha | Consequência observada no UAT |
|----|---------|----------------|-------------------------------|
| D1 | `drainAll()` destrói a fila antes de saber se `completeSet()` vai aplicar com sucesso; retorno `false` é ignorado, sem re-enfileiramento | `IntentActionQueue.swift:80-83`; `activeSessionStore.ts:1602-1618` (case `'completeSet'`, linha 1603) | Toque perdido para sempre quando a validação reprova |
| D2 | `setReps`/`setLoad` nunca chamam `saveDraft` — valores digitados vivem só em memória | `activeSessionStore.ts:1137-1157` | Force-quit descarta reps/carga informados; a próxima abertura reprova `canCompleteSet()` mesmo quando o dono já havia informado os valores |
| D3 | `activateSet()` não desativa a série anterior; `findActiveSet()` devolve a primeira por ordem de array quando há duas `active` | `activeSessionStore.ts:1109-1120`; `sessionModel.ts:290-297`, `300-307` | "Pular" na última série de um exercício retorna à série travada em vez de avançar |

### Prohibition Check (16-04-PLAN.md, 16-05-PLAN.md)

| Prohibition | Origem | Status | Evidência |
|---|---|---|---|
| "uma entrada só pode ser destruída no momento em que é de fato aplicada ou definitivamente descartada por CAS ... nunca por estar 'de passagem'" | 16-04-PLAN.md | ✗ VIOLADA | `drainAll()` continua destruindo a fila inteira ANTES de saber se `completeSet()` vai aplicar com sucesso (D1). A guarda de hidratação de 16-04 só cobre "draft ausente" — não cobre "draft presente, validação reprovada". Uma entrada reprovada por `canCompleteSet()` não é "aplicada" nem "descartada por CAS" — é perdida em silêncio pelo mecanismo destrutivo, exatamente o cenário que a prohibition proíbe |
| "MUST NOT introduzir um segundo caminho de gravação paralelo a completeSet()/activateSet()/adjustRest()" | 16-04-PLAN.md | ✓ RESPEITADA | `reconcileLiveActivityIntents()` continua chamando exclusivamente essas três funções; nenhuma lógica de persistência nova |
| "MUST NOT permitir que uma ação já aplicada com sucesso pela entrega in-process seja reaplicada por uma reconciliação de cold-launch posterior" | 16-05-PLAN.md | ✓ RESPEITADA | Confirmado por UAT físico real: `sem_duplicacao=PASS` |
| "MUST NOT confirmar (ack/remover) uma entrada antes de a ação ter sido de fato despachada contra um alvo resolvido" | 16-05-PLAN.md | ✓ RESPEITADA | `ackQueuedLiveActivityIntent` só é chamado dentro dos blocos `if (alvo)`/`if (proxima)` em `liveActivityIntentBridge.ts`, confirmado por leitura de código e pela suíte de 8 casos |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/store/activeSessionStore.ts::reconcileLiveActivityIntents` | Guarda de hidratação + drena/aplica com CAS, sem perder entradas reprovadas | ⚠️ PARCIAL | Guarda de hidratação (16-04) existe e funciona para o caso `draft === null`. `drainAll()` destrutivo permanece o único mecanismo de leitura — `ackQueuedLiveActivityIntent`/`remove(ids:)` seletivo (construído em 16-05) nunca é importado aqui. Uma entrada reprovada por validação é perdida do mesmo jeito que antes de 16-04 |
| `modules/live-activity/ios/IntentActionQueue.swift` | Fila durável + remoção seletiva não-destrutiva disponível | ✓ VERIFICADO (mecanismo existe) | `remove(ids:)` implementado e testado (16-05) — mas não conectado ao caminho de cold-launch (só ao caminho quente via `ackIntentAction`) |
| `src/native/liveActivityIntentBridge.ts` | Ack seletivo pós-aplicação bem-sucedida | ✓ VERIFICADO | `ackQueuedLiveActivityIntent(event.id)` chamado dentro de cada bloco de despacho bem-sucedido; suíte de 8 casos passa |
| `src/store/activeSessionStore.ts::setReps/setLoad` | Persistir reps/carga digitados para sobreviver a force-quit | ✗ AUSENTE | Nenhuma chamada a `saveDraft` — valores só em memória (D2) |
| `src/store/activeSessionStore.ts::activateSet` | Garantir no máximo uma série `active` por vez | ✗ AUSENTE | Não desativa série anterior (D3) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CMD-01 | 16-01, 16-02, 16-03, 16-04, 16-06 | Concluir série com 1 toque, mesmo caminho completeSet()→outbox→servidor, inclusive no cenário force-quit | ✗ GAPS FOUND | Caminho quente totalmente provado (teste + UAT PASS). Caminho frio (cold-launch) reprovado por UAT físico real nesta rodada — nem PASS-A nem PASS-B; erro visível + perda + estado inconsistente. Critério de sucesso 3 do ROADMAP não é satisfeito |
| CMD-02 | 16-01, 16-03, 16-05 | Pular/ajustar descanso com timer refletindo sem lag | ✗ GAPS FOUND | Caminho quente provado (teste + UAT). Mas o UAT desta rodada expôs uma regressão observável de "Pular" (D3) quando uma série fica travada por D1 — o requisito de "pular descanso ativa somente a próxima série" não se sustenta em todos os cenários reais |

REQUIREMENTS.md mantém CMD-01/CMD-02 como `Gaps Found` (linha 114-115) —
consistente com esta verificação. Nenhum requirement órfão.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `modules/live-activity/ios/IntentActionQueue.swift` | 80-83 | `drainAll()` destrutivo continua sendo o único mecanismo usado pela reconciliação de cold-launch, apesar de `remove(ids:)` seletivo já existir no mesmo arquivo (16-05) | 🛑 Blocker | Causa raiz de D1 — a peça de conserto existe mas não está conectada |
| `src/store/activeSessionStore.ts` | 1137-1157 | `setReps`/`setLoad` sem persistência (`saveDraft`) | 🛑 Blocker | Causa raiz de D2 — reps/carga digitados não sobrevivem a force-quit |
| `src/store/activeSessionStore.ts` | 1109-1120 | `activateSet()` sem invariante de unicidade de série ativa | 🛑 Blocker | Causa raiz de D3 — regressão observável de "Pular" |
| `__tests__/liveActivityIntentQueue.test.ts` | 162-172 | `completeSet`/`activateSet`/`adjustRest` mockados como `jest.fn().mockResolvedValue(true)` — `canCompleteSet()` nunca roda nos testes de reconciliação | ⚠️ Warning | A suíte 100% verde (1880/1880) é compatível com o aparelho falhando; nenhum teste cobre o caminho que causou o UAT FAIL |

Nenhum marcador de dívida (`TBD`/`FIXME`/`XXX`) sem referência formal
encontrado nos arquivos desta rodada (`git log` de 16-04/16-05/16-06
inspecionado; `grep` nos arquivos-chave não retornou ocorrências).

### Behavioral Spot-Checks / Probe Execution

Não aplicável nesta rodada — a evidência comportamental decisiva já veio de
UAT físico real (16-06), documentado com transcrição literal do dono e
diagnóstico de causa raiz com file:linha, superior em confiabilidade a
qualquer spot-check automatizado disponível neste ambiente (o comportamento
de cold-launch real não é reproduzível fora do aparelho). A suíte automatizada
completa (`npm test`, 1880/1880) foi confirmada verde por 16-05, mas — como
registrado no anti-pattern acima — não exercita o caminho que falhou no
aparelho; não é reexecutada aqui porque não mudaria a conclusão.

## Human Verification Required

Nenhum item novo. O UAT físico da rodada anterior (16-03) e desta rodada
(16-06) já cobriram todo o comportamento observável relevante
(`concluir_serie`, `ajustar_descanso`, `pular_descanso`, `sem_lag`,
`sem_duplicacao`, `force_quit_toque`, `regressao_geral`). Os gaps
identificados aqui (D1/D2/D3) são causas raiz confirmadas tanto por leitura
estática quanto pelo resultado físico já coletado — não dependem de novo
julgamento humano para serem classificados como gap.

## Gaps Summary

O gap 2 da rodada anterior fechou de fato: id estável + ack seletivo (16-05)
eliminam o replay do caminho quente contra reconciliações de cold-launch
subsequentes, confirmado no aparelho físico do dono.

O gap 1 não fechou. 16-04 corrigiu a corrida entre a drenagem da fila e a
hidratação do `draft` (o mecanismo destrutivo não roda mais quando `draft`
ainda é `null`), mas essa correção só resolve uma fatia do problema: quando o
`draft` já existe e a entrada é de fato processada, a fila continua sendo
destruída (`drainAll()`) ANTES de se saber se `completeSet()` vai aplicar com
sucesso. Como `canCompleteSet()` reprova legitimamente quando reps/carga não
foram persistidos (e `setReps`/`setLoad` nunca persistem — D2), o toque do
dono na tela bloqueada é perdido de forma irrecuperável assim que ele tenta o
cenário mais realista (informar reps/carga antes do force-quit). O estado
resultante — uma série travada em `active` — propaga um terceiro defeito
(D3): "Pular" no exercício seguinte não avança, porque `findActiveSet()`
devolve a série travada em vez da nova.

Os três defeitos (D1/D2/D3) são pré-existentes — não regressões desta Fase.
Mas continuam bloqueando o critério de sucesso 3 do ROADMAP e o requisito
CMD-01 (garantia de aplicação no cenário de cold-launch) e CMD-02 (integridade
de "Pular" em todos os cenários). A peça de conserto para D1 já existe
parcialmente construída em 16-05 (`IntentActionQueue.remove(ids:)` +
`ackIntentAction`) — só não está conectada ao caminho de reconciliação de
cold-launch, que continua usando exclusivamente `drainAll()`.

CMD-01 e CMD-02 permanecem `Gaps Found`. Marcar como completo aqui repetiria
o erro já revertido em `82c23c8`.

---

_Verified: 2026-08-18_
_Verifier: Claude (gsd-verifier)_
