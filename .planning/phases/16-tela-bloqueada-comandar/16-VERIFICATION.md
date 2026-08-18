---
phase: 16-tela-bloqueada-comandar
verified: 2026-08-18T00:00:00Z
status: gaps_found
score: 3/5 must-haves verificados
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/9
  gaps_closed:
    - "D1 — leitura destrutiva da fila (peekAll()/ackIntentAction substituem drainAll() por completo; grep confirma zero ocorrências de drainAll/drainIntentQueue/drainQueuedLiveActivityIntents no Swift/TS/mock)"
    - "D3 (mecanismo de ativação) — deactivateOtherActiveSets só é chamado de dentro de activateSet(), nenhum segundo caminho de ativação; testado e confirmado por UAT físico (regressao_geral=PASS)"
    - "force_quit_toque e regressao_geral revertem de FAIL (16-06) para PASS-A/PASS no UAT físico de 16-09, para o caminho especificamente exercitado pelo dono"
  gaps_remaining:
    - "D2 — persistência via saveDraft só foi conectada a setReps/setLoad; stepLoad (ajuste de carga por +/-, a interação PRIMÁRIA do milestone) e setDuration (único campo que canCompleteSet() exige para cardio/isometria) continuam só em memória — CR-01 do 16-REVIEW.md, confirmado ao vivo nesta verificação"
  regressions: []
gaps:
  - truth: "A persistência fire-and-forget que sobrevive a um force-quit cobre toda interação de escrita relevante para canCompleteSet(), não só setReps/setLoad"
    status: failed
    reason: "setReps (activeSessionStore.ts:1203) e setLoad (:1221) chamam saveDraft(novo).catch(...) a cada toque, mas stepLoad (:1235-1252) — os botões +/- de carga, únicos wired em SessionPlayer.tsx:681 e :708 — e setDuration (:1269-1283) — o único campo que canCompleteSet() aceita para exercícios isTimeBased (sessionModel.ts:272-274) — fazem só set({ draft: ... }), sem saveDraft. Um force-quit logo após usar o stepper de carga ou informar duração de cardio reproduz o MESMO sintoma que 16-06-SUMMARY.md documentou como force_quit_toque=FAIL, por um caminho que os testes de D2 (__tests__/activeSessionStore.test.ts:607-642) não exercitam e que o UAT de 16-09 não distingue (resposta agregada do dono, sem confirmação de qual caminho de UI foi usado)."
    artifacts:
      - path: "src/store/activeSessionStore.ts"
        issue: "stepLoad (1235-1252) e setDuration (1269-1283) mutam draft.exercises[].sets[] sem chamar saveDraft — setDistance (1285-1298), setRir (1254-1267) e setEffort (1300-1309) têm a mesma lacuna, de menor criticidade"
    missing:
      - "Estender saveDraft(novo).catch(...) fire-and-forget para stepLoad e setDuration no mínimo (setDistance/setRir/setEffort por consistência)"
      - "Teste que simula force-quit (recarregar o draft do saveDraft mais recente) especificamente após stepLoad e após setDuration, não só setReps/setLoad"
      - "Decisão explícita registrada se o escopo for deliberadamente restrito a setReps/setLoad (hoje não está — 16-08-SUMMARY.md não menciona a exclusão)"
human_verification:
  - test: "Ajustar carga usando SÓ os botões +/- (não o campo de texto nem 'usar sugestão'), depois force-quit imediato do app, depois reabrir e tocar 'Concluir série' na tela bloqueada"
    expected: "A série conclui automaticamente na reabertura (PASS-A), como aconteceu no UAT de 16-09 para o caminho testado"
    why_human: "Requer aparelho físico; o código hoje (stepLoad sem saveDraft) sugere que o resultado real é FAIL — precisa confirmação física antes de fechar CMD-01"
  - test: "Em um exercício de métrica 'tempo' (cardio/isometria), informar a duração pelo seletor, depois force-quit imediato, depois reabrir e tocar 'Concluir série' na tela bloqueada"
    expected: "A série conclui automaticamente na reabertura"
    why_human: "Requer aparelho físico; setDuration sem saveDraft implica que actualDurationSeconds nunca é persistido, então canCompleteSet() reprova indefinidamente para esse caminho — precisa confirmação física"
---

# Phase 16: Tela bloqueada — comandar — Relatório de Verificação

**Meta da fase (ROADMAP.md):** O dono controla a série atual e o descanso direto da
tela bloqueada — sem abrir o app — com cada toque seguindo o mesmo caminho de
registro (`completeSet()` → outbox → servidor) que já existe hoje; a Live
Activity nunca vira fonte de verdade.

**Verificado em:** 2026-08-18
**Status:** `gaps_found`
**Re-verificação:** Sim — após a rodada de gap-closure 16-07/16-08/16-09 (a
verificação anterior estava em `gaps_found`, 7/9 must-haves)

## Como esta verificação foi conduzida

Esta é uma re-verificação sobre um `16-REVIEW.md` que **já** confirmou, contra
o código vivo, um achado CRITICAL (CR-01) que o orquestrador também confirmou
independentemente antes de me chamar. Eu re-confirmei CR-01 por conta própria
(leitura direta de `activeSessionStore.ts`, `sessionModel.ts` e
`SessionPlayer.tsx`, não apenas leitura do `16-REVIEW.md`) e também re-verifiquei
os itens que o review deu como RESOLVIDOS (D1, D3-mecanismo) via `grep` direto no
código, não por confiança no texto do review. Achados abaixo citam `file:line`
do estado atual do repositório.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| 1 | D1 — a fila do App Group é lida de forma não-destrutiva e o ack só confirma quando a ação foi de fato aplicada; nenhuma ação é reaplicada nem perdida | ✓ VERIFIED | `grep -rn "drainAll\|drainIntentQueue\|drainQueuedLiveActivityIntents" modules/live-activity src/store __mocks__` → zero ocorrências. `modules/live-activity/ios/IntentActionQueue.swift:87` (`peekAll`), `:97` (`remove(ids:)`). `src/store/activeSessionStore.ts:1663` (`peekQueuedLiveActivityIntents`), `:1682/1696/1702/1707` (ack condicionado ao resultado). Testes: `__tests__/liveActivityIntentQueue.test.ts:227-262`. UAT físico 16-09: `sem_duplicacao=PASS` |
| 2 | D2 — a persistência que sobrevive a um force-quit cobre TODA interação de escrita relevante para `canCompleteSet()` (não só o campo de texto) | ✗ FAILED | Ver seção Gaps. `stepLoad` (`activeSessionStore.ts:1235-1252`, único caminho wired ao stepper +/- em `SessionPlayer.tsx:681,708`) e `setDuration` (`:1269-1283`, único campo de `canCompleteSet` para métricas `isTimeBased`, `sessionModel.ts:272-274`) não chamam `saveDraft` |
| 3 | D3 — no máximo uma série `active` por vez (mecanismo de ativação) | ✓ VERIFIED (com ressalva) | `deactivateOtherActiveSets` (`activeSessionStore.ts:303`) só é chamado de `activateSet()` (`:1188`) — confirmado por grep, sem segundo caminho. Testes: `__tests__/activeSessionStore.test.ts:751-807`. UAT físico 16-09: `regressao_geral=PASS`. Ressalva: a invariante NÃO é reforçada na retomada (`applyServerSetLogs`/ramo offline) — ver Achados Adicionais, WR-02 |
| 4 | CMD-02 — pular ou ajustar o descanso na tela bloqueada reflete imediatamente no timer nativo | ✓ VERIFIED | `adjustRest` (`activeSessionStore.ts:1192-1201`) e `skipRest` (case `'skipRest'`, `:1698-1702`) inalterados desde a rodada 1; UAT físico 16-03: `pular_descanso=PASS` (`16-03-SUMMARY.md:58,91`); sem código tocado nesse caminho nas rodadas 2/3 além do `ack` (ver WR-01, ressalva de baixa probabilidade, não uma falha confirmada) |
| 5 | ROADMAP SC3 — o teste deliberado de "force-quit + toque" valida o modelo de processo do `perform()` de forma robusta, cobrindo os caminhos primários de interação (não só reps/carga digitados por teclado) | ✗ FAILED | O UAT de 16-09 confirma PASS-A **apenas para o caminho testado** (resposta agregada "todas foram pass agora", sem confirmação de qual UI foi usada — `16-09-SUMMARY.md:97-111`). CR-01 demonstra em código vivo que o MESMO sintoma documentado como `force_quit_toque=FAIL` em `16-06-SUMMARY.md` é reproduzível hoje via `stepLoad`/`setDuration`, caminhos que nem o UAT nem os testes automatizados (`__tests__/activeSessionStore.test.ts:607-642`, só `setReps`/`setLoad`) cobrem |

**Score:** 3/5 truths verificadas (2 falharam — mesma causa raiz, CR-01)

### Adjudicação de CR-01

O achado do `16-REVIEW.md` está correto e foi CONFIRMADO por leitura direta e
independente do código nesta verificação, não apenas repetido do texto do
review:

- `src/store/activeSessionStore.ts:1203-1219` (`setReps`) e `:1221-1233`
  (`setLoad`) chamam `saveDraft(novo).catch(...)` fire-and-forget.
- `src/store/activeSessionStore.ts:1235-1252` (`stepLoad`) e `:1269-1283`
  (`setDuration`) **não** chamam `saveDraft` — só `set({ draft: novo })`.
- `src/components/session/SessionPlayer.tsx:681` e `:708` confirmam que os
  botões `-`/`+` de carga (a interação primária descrita no PROJECT.md como
  "ajuste só por botões +/− e confirmação em 1 toque") chamam `stepLoad`, não
  `setLoad`. `setLoad` só é acionado pelo campo de texto (`:698`) e pelo botão
  "usar sugestão" (`:726`) — caminhos secundários.
- `src/engine/sessionModel.ts:272-274` confirma que `canCompleteSet()` para
  métricas `isTimeBased` (cardio/isometria) depende exclusivamente de
  `actualDurationSeconds`, que só `setDuration` grava — e `setDuration` não
  persiste.

**Isto NÃO é um detalhe cosmético — é o mesmo defeito de classe que a fase
inteira (16-04 a 16-09) foi desenhada para fechar, só que por um caminho de UI
diferente do que o teste de gap-closure (16-08) e o UAT físico (16-09)
exercitaram.** O `must_haves.truths` do `16-08-PLAN.md` nomeou explicitamente
só `setReps`/`setLoad` — então o executor cumpriu o que o plano pediu; a
lacuna é de PLANEJAMENTO (o plano restringiu o escopo do que a causa raiz D2
exigia), não de execução fora do plano. Isso não muda o veredito sobre se
CMD-01 está de fato entregue: **não está**, para o ajuste de carga por
stepper e para qualquer exercício de cardio/isometria.

A ressalva do UAT de 16-09 pedida explicitamente para ser pesada com
honestidade: a resposta do dono foi a frase agregada "todas foram pass
agora", sem confirmação de qual interação de UI foi usada durante o teste de
force-quit. É plausível — e, dado que o dono não relatou o erro visível
"Informe repetições e carga..." que caracterizou o FAIL de 16-06, provável —
que o teste tenha usado o campo de texto (`setReps`/`setLoad`, que hoje
persiste) e não o stepper de carga nem um exercício de cardio. Isso é
consistente com "PASS-A no caminho testado" e "FAIL não descoberto porque não
testado" ao mesmo tempo — não uma contradição, uma lacuna de cobertura do
próprio UAT que o CR-01 do code review expõe.

### Required Artifacts

| Artifact | Expected | Status | Detalhes |
|----------|----------|--------|----------|
| `modules/live-activity/ios/IntentActionQueue.swift` | Fila durável não-destrutiva, ack por id | ✓ VERIFIED | `peekAll()` (:87), `remove(ids:)` (:97), sem `drainAll` |
| `src/store/activeSessionStore.ts` (reconciliação) | `reconcileLiveActivityIntents()` chamado só dentro de `startOrResume`, ack condicionado | ✓ VERIFIED | `:695,735,771` (3 call sites, todos atrás de `isCurrent()`); zero chamada em `App.tsx` |
| `src/store/activeSessionStore.ts` (persistência de draft) | Toda ação de escrita relevante para `canCompleteSet()` sobrevive a force-quit | ✗ STUB parcial | `setReps`/`setLoad` persistem; `stepLoad`/`setDuration`/`setDistance`/`setRir`/`setEffort` não |
| `src/store/activeSessionStore.ts` (`deactivateOtherActiveSets`) | Invariante de série `active` única | ⚠️ ORPHANED parcial | Reforçada em `activateSet()` (:1188); NÃO reforçada em `applyServerSetLogs` (:374-520) nem no ramo offline (:690) — WR-02 |

### Key Link Verification

| From | To | Via | Status | Detalhes |
|------|----|----|--------|----------|
| `SessionPlayer.tsx:681,708` (botões +/- de carga) | `activeSessionStore.stepLoad` | `onPress` → `stepLoad(...)` | WIRED, mas sem persistência downstream | Chamada correta; `stepLoad` em si não persiste (CR-01) |
| Lock Screen "Concluir série" (App Intent) | `activeSessionStore.completeSet()` | `IntentActionQueue` → `reconcileLiveActivityIntents()` → `case 'completeSet'` (`:1685-1694`) | ✓ WIRED | Mesmo caminho `completeSet()` → outbox → servidor, nenhum caminho paralelo |
| Lock Screen "Pular"/"±30s" | `activeSessionStore.skipRest()`/`adjustRest()` | `case 'skipRest'`/`case 'adjustRest'` (`:1698-1709`) | ✓ WIRED | Confirmado por UAT 16-03 (`pular_descanso=PASS`) |

### Behavioral Spot-Checks

| Behavior | Comando | Resultado | Status |
|----------|---------|-----------|--------|
| `stepLoad` persiste via `saveDraft` | `grep -n "saveDraft" -A2 -B10` no bloco `stepLoad` (`activeSessionStore.ts:1235-1252`) | Nenhuma chamada a `saveDraft` no corpo da função | ✗ FAIL (confirma CR-01) |
| `setDuration` persiste via `saveDraft` | idem, bloco `setDuration` (`:1269-1283`) | Nenhuma chamada a `saveDraft` | ✗ FAIL (confirma CR-01) |
| Fila não-destrutiva (D1) | `grep -rn "drainAll\|drainIntentQueue\|drainQueuedLiveActivityIntents"` | Zero ocorrências em todo o projeto | ✓ PASS |
| `tsc --noEmit` / suíte de testes | Fornecido pelo orquestrador (não re-executado nesta verificação) | exit 0; 167 suites / 1890 testes; regressão de 19 suites de fases anteriores (249 testes) também verde | ✓ PASS (evidência do orquestrador, não re-derivada aqui) |

### Probe Execution

Não aplicável — fase não usa `scripts/*/tests/probe-*.sh`; a "prova" de comportamento
físico desta fase é o UAT no aparelho (`16-09-SUMMARY.md`), tratado acima como
evidência humana, não como probe automatizado.

### Requirements Coverage

| Requirement | Plano de origem | Descrição | Status | Evidência |
|-------------|------------------|-----------|--------|-----------|
| CMD-01 | 16-01 a 16-09 | Concluir série por 1 toque na tela bloqueada, mesmo caminho `completeSet()` → outbox → servidor | ✗ BLOCKED | Mecanismo de toque/reconciliação está correto (D1); mas a robustez a force-quit exigida pelo critério de sucesso 3 do ROADMAP falha para o ajuste de carga por stepper e para cardio/isometria (CR-01) |
| CMD-02 | 16-01 a 16-09 | Pular/ajustar descanso reflete imediatamente no timer nativo | ✓ SATISFIED | UAT físico 16-03 (`pular_descanso=PASS`), mecanismo inalterado desde então; WR-01 é um risco residual de baixa probabilidade (rejeição de `ack` não tratada), não uma falha confirmada |

**Nenhum requisito órfão** — `CMD-01`/`CMD-02` são os dois únicos mapeados
para a Fase 16 em `REQUIREMENTS.md:114-115`, e ambos aparecem em
`requirements:` de todos os 9 planos.

**Nota de escopo:** Esta verificação NÃO altera `REQUIREMENTS.md`. O estado
atual do arquivo (`CMD-01 | Phase 16 | Gaps Found`, `CMD-02 | Phase 16 | Gaps
Found`) permanece correto para CMD-01; para CMD-02 a evidência aqui reunida
sustenta "Satisfied", mas a marcação formal em `REQUIREMENTS.md` é
exclusivamente escopo de `/gsd-verify-work`, não deste relatório (instrução
explícita desta rodada, reforçada pelo histórico do commit `82c23c8`).

### Anti-Patterns Found

Nenhum marcador de dívida (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`)
encontrado nos arquivos tocados por esta fase (`src/store/activeSessionStore.ts`,
`modules/live-activity/ios/*.swift`, `modules/live-activity/index.ts`,
`__mocks__/modules-live-activity.ts`).

| File | Linha | Padrão | Severidade | Impacto |
|------|-------|--------|------------|---------|
| `src/store/activeSessionStore.ts` | 1682,1696,1702,1707 | `void ackQueuedLiveActivityIntent(...)` sem `.catch()` | ⚠️ Warning (WR-01 do review, carregado) | Rejeição de `ack` não tratada; para `skipRest`/`adjustRest` (não-idempotentes) pode causar reaplicação real numa reconciliação seguinte |
| `src/store/activeSessionStore.ts` | 374-520, 690 | Invariante de série `active` única não reforçada na retomada | ⚠️ Warning (WR-02 do review, carregado) | Um rascunho já corrompido em disco (inclusive pela FALHA que este round corrige) não se autocorrige ao reabrir |
| `modules/live-activity/ios/IntentActionQueue.swift` | 59-77 | `enqueue`/`writeAll` sem lock entre processos concorrentes | ⚠️ Warning (WR-03 do review, carregado da rodada anterior) | Risco baixo, sem mitigação |
| `modules/live-activity/ios/IntentActionQueue.swift` | 59-67 | Falha de escrita no App Group engolida sem `os_log` | ⚠️ Warning (WR-04 do review, carregado da rodada anterior) | Regressão de entitlements não deixaria rastro |

### Human Verification Required

### 1. Force-quit após ajustar carga só pelo stepper +/-

**Teste:** No app aberto, ajustar a carga de uma série usando SÓ os botões
`-`/`+` (não digitar no campo de texto, não usar "usar sugestão"), então
force-quit imediato do app, então reabrir e tocar "Concluir série" na tela
bloqueada.
**Esperado:** A série conclui automaticamente na reabertura (mesmo
comportamento PASS-A do UAT de 16-09).
**Por que humano:** Requer aparelho físico com cold-launch real. O código
hoje (`stepLoad` sem `saveDraft`) indica que o resultado provável é FAIL —
esta verificação não pode confirmar em nenhuma direção sem o aparelho.

### 2. Force-quit após informar duração de um exercício de cardio/isometria

**Teste:** Em um exercício de métrica `tempo`/`tempo_distancia`, informar a
duração, force-quit imediato, reabrir, tocar "Concluir série" na tela
bloqueada.
**Esperado:** A série conclui automaticamente.
**Por que humano:** Idem — `setDuration` sem `saveDraft` implica que
`actualDurationSeconds` nunca é persistido por nenhum caminho, então
`canCompleteSet()` reprovaria indefinidamente; precisa confirmação física
antes de declarar o caminho quebrado ou funcional (pode haver mitigação não
identificada nesta leitura de código).

### Gaps Summary

A fase fechou de fato dois dos três defeitos identificados no UAT anterior
(D1 — leitura destrutiva da fila; D3 — mecanismo de ativação de série única),
com evidência sólida em código, teste automatizado e UAT físico convergindo.
O terceiro (D2 — persistência que sobrevive a force-quit) foi fechado **só
parcialmente**: o plano 16-08 restringiu a correção a `setReps`/`setLoad`
(entrada por teclado), deixando de fora `stepLoad` (o ajuste de carga por
botões +/-, que o próprio PROJECT.md descreve como a interação PRIMÁRIA do
milestone) e `setDuration` (o único campo que fecha `canCompleteSet()` para
cardio/isometria). Isso significa que o sintoma exato documentado como
`force_quit_toque=FAIL` em `16-06-SUMMARY.md` é reproduzível hoje por um
caminho de UI comum e plausível, não coberto pelos testes automatizados nem
distinguível na resposta agregada do UAT de 16-09.

Como o achado é de causa raiz idêntica ao que a fase inteira (16-04 a 16-09)
existe para fechar, e como CMD-01 é justamente o requisito que promete
"concluir a série atual com 1 toque... sem abrir o app" — a fase **não** pode
ser considerada `passed`. O caminho recomendado é fechar CR-01 (estender
`saveDraft` a `stepLoad`/`setDuration`, com teste que force-quit-simula
especificamente esses dois caminhos) antes de reabrir para verificação, e
então repetir o UAT físico pedindo explicitamente ao dono que use o stepper
de carga (não o teclado) e, se possível, um exercício de cardio.

---

_Verificado: 2026-08-18_
_Verificador: Claude (gsd-verifier)_
