---
phase: 16-tela-bloqueada-comandar
verified: 2026-08-19T21:02:49Z
status: human_needed
score: 4/5 must-haves verificados
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "D2 — as SETE ações que mutam draft.exercises[].sets[] (setReps, setLoad, stepLoad, setRir, setDuration, setDistance, setEffort) chamam saveDraft(novo).catch(...) fire-and-forget. Confirmado ao vivo em src/store/activeSessionStore.ts: setReps:1313, setLoad:1331/1340, stepLoad:1345/1368 (persiste actualLoadKg do stepper +/-), stepReps:1391, setRir:1396/1411, setDuration:1416/1433 (persiste actualDurationSeconds, único campo de canCompleteSet() para isTimeBased), setDistance:1438/1451, setEffort:1456/1466. O gap remanescente da rodada anterior (stepLoad/setDuration só em memória) está fechado."
    - "CAUSA-RAIZ REAL de force_quit_toque=FAIL (achado fora do escopo original de D2): descarte silencioso de intent órfã com sessionLogId nulo em reconcileLiveActivityIntents — CompleteSetIntent.swift:12 podia resolver o id como nil no cold-launch, e o CAS tratava nulo e divergente como o mesmo caso (ack sem nunca chamar completeSet()). Corrigido no commit 54de3ef (nasceuNestaSessao, prova temporal queuedAt>=startedAt-SKEW_MS) e RE-CONFIRMADO fisicamente PASS no aparelho (16-11-SUMMARY.md, adendo) para o caminho do stepper de carga — a mesma causa que 16-06/16-09 tinham atribuído erroneamente à falta de persistência."
    - "5 achados do code review (16-REVIEW.md, 2026-08-19) fechados e mesclados (commits ec037f8/fe73503/2217663/7c61138/940478a, merge 49fa980): CR-01 (CAS de sessionLogId no caminho quente da bridge), WR-01 (ack do completeSet quente condicional ao resultado real), WR-02 (falha de um item na reconciliação não aborta o boot), WR-03 (skew de relógio de 60s na adoção de órfã — reconcilia com o SKEW_MS do commit 54de3ef), WR-04 (dedupe de entrega entre bridge quente e reconciliação fria via intentDeliveryRegistry.ts). Confirmado ao vivo em código, não apenas no relatório do review-fix."
  gaps_remaining: []
  regressions: []
---

# Phase 16: Tela bloqueada — comandar — Relatório de Verificação (re-verificação)

**Meta da fase (ROADMAP.md):** O dono controla a série atual e o descanso direto da
tela bloqueada — sem abrir o app — com cada toque seguindo o mesmo caminho de
registro (`completeSet()` → outbox → servidor) que já existe hoje; a Live
Activity nunca vira fonte de verdade.

**Verificado em:** 2026-08-19T21:02:49Z
**HEAD verificado:** `49fa980` (merge dos 5 fixes do code review sobre a Fase 16)
**Status:** `human_needed`
**Re-verificação:** Sim — sobre a `16-VERIFICATION.md` anterior (2026-08-18,
`gaps_found`, 3/5), escrita ANTES dos planos 16-10 (12:25) e 16-11 (16:02) e
antes do ciclo completo de code review → fix → merge de 2026-08-19
(`16-REVIEW.md` → `16-REVIEW-FIX.md` → commits `ec037f8`..`940478a` →
`49fa980`).

## Como esta verificação foi conduzida

Toda alegação abaixo foi checada contra o código vivo no HEAD atual (`49fa980`),
não contra texto de SUMMARY/REVIEW-FIX. Onde a rodada anterior citava
`file:linha`, reconferi a linha atual (os números mudaram — o arquivo cresceu
desde 18/08). Rodei a suíte completa de testes (`npx jest`, uma única vez) e
`npx tsc --noEmit` neste HEAD, não reaproveitei números do relatório do
executor. O gap D2 da rodada anterior foi fechado por leitura direta das sete
funções de escrita. As cinco mudanças do review-fix (CR-01, WR-01..04) foram
lidas linha a linha nos três arquivos que tocam (`activeSessionStore.ts`,
`liveActivityIntentBridge.ts`, `IntentActionQueue.swift` + 5 Intents Swift) e
confrontadas com os testes que as acompanham.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| 1 | D1 — a fila do App Group é lida de forma não-destrutiva e o ack só confirma quando a ação foi de fato aplicada | ✓ VERIFIED | `grep -rn "drainAll\|drainIntentQueue\|drainQueuedLiveActivityIntents"` em `modules/live-activity`, `src/store`, `src/native`, `__mocks__` → zero ocorrências. `IntentActionQueue.swift:130` (`peekAll()`), `:141` (`remove(ids:)`). Sem mudança desde a rodada anterior; carregado |
| 2 | D2 — a persistência que sobrevive a um force-quit cobre TODA interação de escrita relevante para `canCompleteSet()` (as sete ações, não só o campo de texto) | ✓ VERIFIED (gap fechado) | `activeSessionStore.ts`: `setReps:1313`, `setLoad:1331/1340`, `stepLoad:1345/1368` (stepper +/-, interação PRIMÁRIA de carga per PROJECT.md), `stepReps:1391`, `setRir:1396/1411`, `setDuration:1416/1433` (único campo de `canCompleteSet()` para `isTimeBased`, `sessionModel.ts:353-354`), `setDistance:1438/1451`, `setEffort:1456/1466` — todas chamam `saveDraft(novo).catch(...)`. `SessionPlayer.tsx:763,809` confirma que os botões `-`/`+` chamam `stepLoad`, o campo de texto chama `setLoad` (`:782,827`). Testes: `activeSessionStore.test.ts` (10 testes da 16-10, incluindo 2 round-trip de force-quit) |
| 3 | D3 — no máximo uma série `active` por vez (mecanismo de ativação) | ✓ VERIFIED | `deactivateOtherActiveSets` (`:347`) só é chamado de `activateSet()` (`:1298`) — confirmado por grep, sem segundo caminho novo. Inalterado desde a rodada anterior; ressalva antiga (não reforçado em `applyServerSetLogs`/ramo offline) permanece um Warning, não um Blocker — sem regressão introduzida pelo review-fix |
| 4 | ROADMAP crit. 2 (CMD-02) — pular/ajustar o descanso na tela bloqueada reflete imediatamente no timer nativo, sem regressão dos 5 fixes do review | ✓ VERIFIED | `adjustRest`/`skipRest` seguem chamando as mesmas ações de sempre; o único código novo tocando esse caminho é a guarda `if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;` (CR-01) e o dedupe `wasHotIntentDelivered` (WR-04) em `liveActivityIntentBridge.ts:73,80`, ambos passivos na sessão contínua (não bloqueiam quando o id bate ou está ausente). Suíte de testes 100% verde para esses `case`s. UAT físico 16-03 (`pular_descanso=PASS`) segue válido — mecanismo de negócio inalterado |
| 5 | ROADMAP crit. 3 — o teste deliberado de "force-quit + toque" valida o modelo de processo do `perform()` no cold-launch, NO HEAD ATUAL (pós-merge do review-fix) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Ver seção "Adjudicação da Truth 5" abaixo — mecanismo presente, testado por unidade (mutation-tested) e fisicamente confirmado PASS uma vez, mas a confirmação física é de um commit ANTERIOR aos 5 commits do review-fix que tocam o EXATO mesmo caminho quente/frio exercitado por esse cenário |

**Score:** 4/5 truths verificadas (1 presente e testada por unidade, comportamento
física não reconfirmada no HEAD atual — não é falha de código, é evidência
desatualizada em relação ao HEAD)

### Adjudicação da Truth 5 (o único item não fechado)

**O que está provado por código + teste, sem ambiguidade:**

- `src/native/liveActivityIntentBridge.ts` ganhou a guarda de CAS por
  `sessionLogId` em TODOS os `case`s (CR-01, `:41,72,79,87,101,113`) e o ack do
  `completeSet` virou condicional a `ok === true` (WR-01, `:52-64`), com
  try/catch para não gerar unhandled rejection.
- `src/store/activeSessionStore.ts` `reconcileLiveActivityIntents` ganhou
  try/catch por entrada (WR-02, `:1955-1967`, não aborta o boot da sessão) e o
  salto `wasHotIntentDelivered` contra reentrega duplicada bridge↔reconciliação
  (WR-04, `:1867`).
- `nasceuNestaSessao` (`:293-303`) ganhou `SKEW_MS = 60_000` (WR-03), reconciliando
  com o timestamp `.withFractionalSeconds` emitido pelo Swift
  (`IntentActionQueue.swift:71-77`, `queuedAtNow()`).
- Os 121 testes de `liveActivityIntentQueue.test.ts` +
  `liveActivityIntentBridge.test.ts` + `activeSessionStore.test.ts` passam neste
  HEAD (rodados nesta verificação, não reaproveitados de relatório). Os 5 fixes
  são mutation-tested individualmente (cada `SUMMARY`/`REVIEW-FIX` documenta o
  teste que falha ao reverter o fix). Suíte completa: **169 suítes / 2017 testes
  verdes** (rodada única desta verificação); `npx tsc --noEmit`: 0 erros.
- O caso feliz (sessão corrente, mesmo `sessionLogId`) segue explicitamente
  testado e passando: `liveActivityIntentBridge.test.ts:211-220`
  ("sessionLogId IGUAL ao draft atual não bloqueia — completeSet aplica e
  confirma o ack").

**O que NÃO está provado no aparelho físico, no HEAD atual:**

- O único UAT físico que confirmou o cenário "force-quit + toque na Lock
  Screen" (`16-11-SUMMARY.md`, adendo: `teste_1_stepper=PASS`, "Só pelos
  botões -/+ do stepper") rodou num build cujo HEAD era `dbb2e7e` (bundle
  reconstruído às 15:53 de 18/08/2026) — commit que contém `54de3ef` (fix do
  descarte silencioso) mas **não** contém nenhum dos 5 commits do review-fix
  (`ec037f8` 17:34 → `940478a` 17:45 de **19/08/2026**, mesclados às 17:51 em
  `49fa980`). Os 5 commits do review-fix tocam o MESMO caminho quente/frio
  exercitado por esse exato cenário (guarda de sessão, condicional de ack,
  dedupe bridge↔reconciliação).
- O caminho de duração (cardio/isometria, `setDuration`) nunca teve UAT físico
  — o dono declinou explicitamente (`16-11-SUMMARY.md`: "na parte 2 nao temos
  esse tipo de treinamento... se quiser tenta voce esse pq eu nao quero").
  Coberto só por `91ec4b4` (4 testes JS, sem cold-launch real). Isso já era
  conhecido e está documentado em `16-UAT.md`/`REQUIREMENTS.md` como resíduo
  aceito — não é um achado novo desta verificação, mas segue sem confirmação
  física.

**Por que isto não é `gaps_found`:** nenhum artefato está ausente, stub ou
desconectado; nenhum teste falha; nenhuma regressão foi encontrada nos 5 fixes
do review — pelo contrário, eles fecham defeitos reais (CR-01 é uma condição de
corrida de segurança de dados: um toque de sessão antiga podia concluir série
na sessão errada). O que falta é justamente o tipo de prova que este projeto
já provou, na prática, ser insubstituível: a Truth 5 anterior tinha "código
parece certo, prova por leitura" e o comportamento real no aparelho (nulo ≠
divergente) surpreendeu. O padrão estabelecido pela própria fase (16-06 → 16-09
→ 16-11) é sempre exigir um teste físico curto depois de qualquer mudança no
caminho quente/frio de intents — os 5 fixes do review são exatamente esse tipo
de mudança.

**Recomendação:** `npm run resign` (leva os 5 fixes ao aparelho) + repetir
SÓ o Teste 1 do `16-11-SUMMARY.md` (força-quit + ajuste de carga pelo
stepper, ~2 min) no mesmo aparelho. Se passar, a Truth 5 vira VERIFIED e a
fase fecha `passed` sem nenhuma outra ação.

### Required Artifacts

| Artifact | Expected | Status | Detalhes |
|----------|----------|--------|----------|
| `modules/live-activity/ios/IntentActionQueue.swift` | Fila durável não-destrutiva, ack por id, serializada contra concorrência | ✓ VERIFIED | `peekAll()`/`remove(ids:)` inalterados; ganhou `DispatchQueue` serial (commit `aeab6a3`, fora do escopo do review-fix mas ancestor do HEAD) fechando o Warning "sem lock entre processos concorrentes" da rodada anterior — harness dedicado (`scripts/IntentActionQueueConcurrencyTests/`) prova 20/20 enqueues sobrevivem |
| `src/store/activeSessionStore.ts` (persistência de draft) | Toda ação de escrita relevante para `canCompleteSet()` sobrevive a force-quit | ✓ VERIFIED | Sete ações confirmadas (ver Truth 2) — gap fechado |
| `src/store/activeSessionStore.ts` (reconciliação) | CAS por sessão + adoção temporal de órfã + resiliência por item | ✓ VERIFIED | `nasceuNestaSessao` (`:293-303`), try/catch por entrada (`:1955-1967`), dedupe `wasHotIntentDelivered` (`:1867`) |
| `src/native/liveActivityIntentBridge.ts` | CAS de sessão no caminho quente, ack condicional, dedupe | ✓ VERIFIED | Todos os 5 `case`s com guarda (`:41,72,79,87,101,113`); `completeSet` com ack condicional a `ok===true` (`:52-64`) |
| `src/native/intentDeliveryRegistry.ts` | Registro compartilhado de ids entregues pelo caminho quente | ✓ VERIFIED | Módulo novo, puro, sem ciclo de dependência — usado por ambos os lados (bridge marca, reconciliação salta) |

### Key Link Verification

| From | To | Via | Status | Detalhes |
|------|----|----|--------|----------|
| `SessionPlayer.tsx:763,809` (botões +/- de carga) | `activeSessionStore.stepLoad` → `saveDraft` | `onPress` → `stepLoad(...)` → `saveDraft(novo).catch(...)` | ✓ WIRED, com persistência | Gap da rodada anterior fechado |
| Lock Screen "Concluir série" (App Intent, caminho QUENTE) | `activeSessionStore.completeSet()` | `liveActivityIntentBridge.ts` CAS de sessão → ack condicional | ✓ WIRED | Mesmo caminho `completeSet()` → outbox → servidor; CR-01/WR-01 endurecem, não desviam |
| Lock Screen "Concluir série" (cold-launch, caminho FRIO) | `activeSessionStore.completeSet()` | `reconcileLiveActivityIntents()` → adoção temporal de órfã (nulo) ou CAS (divergente) | ✓ WIRED | Fix `54de3ef` — causa raiz real do `force_quit_toque=FAIL` histórico |
| Bridge (quente) ↔ Reconciliação (fria) | idempotência de entrega dupla | `intentDeliveryRegistry` (WR-04) | ✓ WIRED | Testado; sem isso um "Pular descanso" no boot avançaria 2 séries |

### Behavioral Spot-Checks

| Behavior | Comando | Resultado | Status |
|----------|---------|-----------|--------|
| Suíte completa (regressão) | `npx jest` (rodada única) | 169 suítes / 2017 testes verdes | ✓ PASS |
| Tipagem | `npx tsc --noEmit` | 0 erros | ✓ PASS |
| Testes-alvo do review-fix | `npx jest __tests__/liveActivityIntentQueue.test.ts __tests__/liveActivityIntentBridge.test.ts __tests__/activeSessionStore.test.ts` | 3 suítes / 121 testes verdes | ✓ PASS |
| D1 segue sem leitura destrutiva | `grep -rn "drainAll\|drainIntentQueue\|drainQueuedLiveActivityIntents"` | zero ocorrências | ✓ PASS |
| Sete ações de escrita persistem | leitura direta de `activeSessionStore.ts:1300-1470` | todas chamam `saveDraft(novo).catch(...)` | ✓ PASS |

### Probe Execution

Não aplicável — a fase não usa `scripts/*/tests/probe-*.sh` para o comportamento
de Lock Screen/App Intent (esse é validado por UAT físico, tratado acima como
evidência humana). O harness `scripts/verify-intent-action-queue-race.sh`
(commit `aeab6a3`) existe para a concorrência do `IntentActionQueue`, fora do
escopo desta re-verificação (não é um must-have de D1/D2/D3).

### Requirements Coverage

| Requirement | Plano de origem | Descrição | Status | Evidência |
|-------------|------------------|-----------|--------|-----------|
| CMD-01 | 16-01 a 16-11 + review-fix | Concluir série por 1 toque na tela bloqueada, mesmo caminho `completeSet()` → outbox → servidor | ✓ SATISFIED, com ressalva | Mecanismo correto e testado (D1/D2/D3/CR-01/WR-01..04); UAT físico confirma o mecanismo GERAL mas não o HEAD exato pós-review-fix (Truth 5) |
| CMD-02 | 16-01 a 16-11 + review-fix | Pular/ajustar descanso reflete imediatamente no timer nativo | ✓ SATISFIED | UAT físico 16-03 (`pular_descanso=PASS`); código tocado pelo review-fix (guarda de sessão + dedupe) é passivo no caso feliz, testado |

`REQUIREMENTS.md:114-115` marca ambos `Complete` desde 2026-08-18 — ANTES do
ciclo de code review de 19/08. A nota em `REQUIREMENTS.md:154-172` já registra
honestamente os resíduos WR-01..04 como "carregados" na data em que foi
escrita; esses resíduos específicos (não a marcação de nulo-vs-divergente, que
`54de3ef` já corrigira) foram desde então fechados pelo review-fix — a nota
ficou tecnicamente desatualizada, mas não incorreta sobre o que existia em
18/08. Atualizar essa nota é decisão de `/gsd-verify-work`, não deste relatório.

### Anti-Patterns Found

Nenhum marcador de dívida (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`)
encontrado nos arquivos tocados pelo review-fix ou pelo fix `54de3ef`
(`src/store/activeSessionStore.ts`, `src/native/liveActivityIntentBridge.ts`,
`src/native/intentDeliveryRegistry.ts`, `modules/live-activity/ios/*.swift`,
`modules/live-activity/index.ts`). O único hit de `TODO` em
`IntentActionQueue.swift:65` é falso-positivo — substring de "TODO o acesso"
(português, "ALL the access"), não um marcador de dívida.

| File | Linha | Padrão | Severidade | Impacto |
|------|-------|--------|------------|---------|
| `src/native/liveActivityIntentBridge.ts` | 60,76,83,91,105,118 | `void ackQueuedLiveActivityIntent(...)` sem `.catch()` | ⚠️ Warning (carregado, pré-existente — WR-01 do `16-UAT.md`) | O review-fix tornou o ack CONDICIONAL ao resultado (corrigiu o problema mais grave), mas a chamada em si ainda não trata rejeição da própria Promise nativa de ack — risco baixo, mesmo padrão desde a rodada anterior |
| `src/store/activeSessionStore.ts` | 374-520, 690 (aprox.) | Invariante de série `active` única (D3) não reforçada em `applyServerSetLogs`/ramo offline | ⚠️ Warning (carregado) | Sem mudança desde a rodada anterior; não bloqueia CMD-01/CMD-02 |
| `modules/live-activity/ios/LiveActivityModule.swift` | 120-127 (aprox.) | `reconcileOrphans` encerra Activities incondicionalmente no boot, chamado com `stillActiveSessionLogId=null` antes da hidratação do draft (`liveActivitySync.ts:196-199`) | ℹ️ Info | Escopo de Fase 15 (LOCK-03), não de CMD-01/CMD-02; registrado como "bug real, separado, não investigado" no próprio `16-UAT.md:111` — carregado, não uma regressão desta rodada |

### Human Verification Required

### 1. Reconfirmar fisicamente "force-quit + toque" após o merge do review-fix

**Teste:** `npm run resign` (leva os 5 commits do review-fix ao aparelho),
depois repetir SÓ o Teste 1 do `16-11-SUMMARY.md`: ajustar a carga usando
apenas os botões `-`/`+` do stepper, force-quit imediato, reabrir, tocar
"Concluir série" na tela bloqueada.
**Esperado:** A série conclui automaticamente na reabertura — mesmo resultado
PASS já obtido uma vez no commit `dbb2e7e` (18/08), agora confirmado no HEAD
`49fa980` (19/08), que difere daquele commit exatamente nos 5 arquivos do
caminho quente/frio exercitados por este cenário.
**Por que humano:** É o próprio tipo de invariante (modelo de processo do
`perform()` no cold-launch do iOS) que esta fase inteira já provou, na
prática, não ser determinável por leitura de código — o diagnóstico de
`54de3ef` só emergiu depois que um teste físico reprovou um código que
"parecia certo". Testes unitários mutation-tested cobrem cada fix
isoladamente, mas não substituem a prova de que o ActivityKit/App Intents real
se comporta como o modelo JS assume.

### 2. (Resíduo já conhecido, não um achado novo) Force-quit após informar duração de cardio/isometria

**Teste:** Em um exercício de métrica `tempo`/`tempo_distancia`, informar a
duração, force-quit imediato, reabrir, tocar "Concluir série".
**Esperado:** A série conclui automaticamente.
**Por que humano:** Nunca teve UAT físico — o dono declinou explicitamente por
não ter esse tipo de exercício no programa (`16-11-SUMMARY.md`). Coberto só
por 4 testes JS (`91ec4b4`) sem cold-launch real. Já documentado como resíduo
aceito em `16-UAT.md`/`REQUIREMENTS.md:154-172`; listado aqui só para manter a
visibilidade — não bloqueia o fechamento da fase, dado que não é um Success
Criteria literal do ROADMAP e a decisão de não testar foi do próprio dono.

### Gaps Summary

**Não há gap de código nesta rodada.** O gap D2 da verificação anterior
(persistência restrita a `setReps`/`setLoad`) foi fechado por completo no
plano 16-10, confirmado por leitura direta das sete funções de escrita. A
causa raiz REAL do sintoma histórico `force_quit_toque=FAIL` (não era D2, era
o descarte silencioso de intent órfã com `sessionLogId` nulo) foi diagnosticada
e corrigida no plano 16-11 (commit `54de3ef`) e reconfirmada PASS no aparelho.
Um code review subsequente (`16-REVIEW.md`, 19/08) encontrou 1 achado CRITICAL
(CR-01: risco real de concluir série na sessão errada) e 4 Warnings no mesmo
caminho quente/frio — todos os 5 foram corrigidos, testados (mutation-tested)
e mesclados (`49fa980`), sem nenhuma regressão detectada nesta verificação
(suíte completa 169/169 verde, `tsc` limpo, os três `case`s de CMD-02
confirmados passivos no caminho feliz).

O único item que impede `status: passed` é de **evidência**, não de **código**:
a única confirmação física do cenário de força-quit+toque (ROADMAP crit. 3)
foi feita num build anterior aos 5 commits do review-fix, que tocam
precisamente o código exercitado por esse cenário. Dado o histórico da própria
fase — onde leitura de código "correta" já divergiu do comportamento real do
iOS uma vez (o descarte silencioso) — o caminho responsável é uma reconfirmação
física curta (~2 min, mesmo roteiro já usado em 16-11), não presumir que os 5
fixes preservam o comportamento só porque os testes unitários passam.

---

_Verificado: 2026-08-19T21:02:49Z_
_Verificador: Claude (gsd-verifier)_
