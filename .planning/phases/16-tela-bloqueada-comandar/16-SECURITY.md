---
phase: 16
slug: tela-bloqueada-comandar
audited: 2026-08-19T21:05:51Z
status: verified
threats_total: 29
threats_mitigated: 20
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate); block_on default = high (no override in .planning/config.json)
threats_open: 0
risks_accepted: 9
asvs_level: 1
created: 2026-08-19
---

# Fase 16 — Security

> Contrato de segurança por fase: registro de ameaças, riscos aceitos e trilha de auditoria.
> Auditoria retroativa (`gsd-secure-phase`), HEAD auditado `49fa980` (branch `main`, inclui o merge
> `gsd-reviewfix/16-89574` — CR-01/WR-01..04 do `16-REVIEW.md`).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| Tela bloqueada (extensão `session-widget`) -> processo do app principal | `Button(intent:)` cruza para `perform()` rodando no processo do app (RESEARCH.md Pattern 1) — ponto onde um toque do dono vira gravação real via `completeSet()`/outbox/servidor | `kind` da ação, `sessionLogId` (opcional), deltas (`deltaSeconds`/`deltaValue`) |
| Fila durável do App Group (`UserDefaults(suiteName:)`) -> `activeSessionStore` (cold-launch) | Leitura de dado escrito por um processo potencialmente já encerrado — durabilidade para quando o app não estava vivo no momento do toque | `QueuedIntentAction` (kind/deltaSeconds/deltaValue/sessionLogId/queuedAt/id) |
| Entrega in-process (`onIntentAction`) -> confirmação de remoção da fila durável (`ackIntentAction`) | Canal de escrita no App Group acionado pelo lado JS (não só pelo Intent) — precisa remover exatamente a entrada certa | `id` (UUID) da entrada aplicada |
| Rascunho local persistido (AsyncStorage) -> `applyServerSetLogs`/`completeSet()`/`canCompleteSet()` | Dado local não-autoritativo decidindo se uma série pode ser concluída, ou sendo mesclado seletivamente sobre o dado autoritativo do servidor | reps/carga/duração/distância/RIR/esforço percebido da sessão em andamento (local, single-tenant) |
| iPhone físico do dono (UAT) | Mesmo aparelho das Fases 14/15 — nenhum trust boundary novo | resultado PASS/FAIL por item, citado literalmente |
| Build instalado vs. código-fonte mergeado | A sessão física só tem valor se o build instalado de fato contém os fixes do commit sob teste | proveniência (git status, hash/strings do bundle, recompilação) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-16-01-01 | Tampering | `IntentActionQueue` (fila do App Group) | high | mitigate | `maxEntries = 20` — `modules/live-activity/ios/IntentActionQueue.swift:64,113-115` (`enqueue` apara as mais antigas quando excede o cap) | closed |
| T-16-01-02 | Repudiation/Tampering | Toque duplo/rápido contornando o App Intent | low | accept | `completeSet` idempotente por `status==='done'` — `src/store/activeSessionStore.ts:1485`; trava de reentrância `inFlight` por `(sessionLogId, plannedSetId)` — `:261,1491-1493,1548,1750` | closed |
| T-16-01-03 | Information Disclosure | Botões de ação visíveis no aparelho fisicamente bloqueado | low | accept | Mesma aceitação de T-15-01-03 (`.planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-01-PLAN.md:398`) — app pessoal single-user, sem PII além do próprio treino | closed |
| T-16-01-04 | Elevation of Privilege | `perform()` abrindo o app ou executando trabalho pesado (rede, replanejamento) | high | mitigate | `perform()` só enfileira + `sendEvent`, nenhuma chamada de rede/navegação — `modules/live-activity/ios/CompleteSetIntent.swift:11-40`, `SkipRestIntent.swift:10-35`, `AdjustRestIntent.swift:20-45`; reabertura só via `.widgetURL()` no corpo do card, fora do intent — `targets/session-widget/WidgetLiveActivity.swift` (`ActivityConfiguration`) | closed |
| T-16-02-01 | Tampering | `reconcileLiveActivityIntents()` aplicando intenção contra a sessão ERRADA | high | mitigate | CAS por `sessionLogId` relido do `get().draft` a CADA iteração (não cópia capturada antes do loop) — `src/store/activeSessionStore.ts:1859,1869-1892`; leitura não-destrutiva via `peekIntentQueue`/`peekAll` — `modules/live-activity/ios/LiveActivityModule.swift:163-174`, `IntentActionQueue.swift:130-132` | closed |
| T-16-02-02 | Denial of Service (local) | Fila do App Group nunca drenada se o app nunca reabrir | medium | mitigate | Cap de 20 (`IntentActionQueue.swift:64`) + `reconcileLiveActivityIntents()` chamado em TODO ramo que hidrata `draft:'active'` de `startOrResume` — `src/store/activeSessionStore.ts:803,844,881` | closed |
| T-16-03-01 | Repudiation | Resultado da sessão física reportado de forma imprecisa/inferida | high | mitigate | Resposta literal do dono citada verbatim por item — `.planning/phases/16-tela-bloqueada-comandar/16-03-SUMMARY.md:95-103` (5/5 itens, incl. desambiguação PASS-B) | closed |
| T-16-04-01 | Tampering | `reconcileLiveActivityIntents()` drenando a fila antes de um draft ativo existir | high | mitigate | Guarda de hidratação `!draftAtual \|\| draftAtual.status !== 'active'` -> `return` ANTES de ler a fila — `src/store/activeSessionStore.ts:1847-1848` | closed |
| T-16-04-02 | Tampering | Chamada de reconciliação correndo contra um `startOrResume()` já superado | medium | mitigate | Guarda `if (isCurrent())` em cada call site — `src/store/activeSessionStore.ts:803,844,881` (mesmo padrão `epoch`/`isCurrent()` de `:751-752`) | closed |
| T-16-04-03 | Repudiation | Chamada de reconciliação no boot cru de `App.tsx` removida sem substituto equivalente | low | accept | `App.tsx:50-52` não chama `reconcileLiveActivityIntents` no boot cru; todos os ramos que chegam a `status:'active'` chamam via `startOrResume` (`:803,844,881`) — cobertura igual ou maior, nunca menor | closed |
| T-16-05-01 | Tampering | Ação já aplicada in-process sendo reaplicada por reconciliação de cold-launch posterior (replay) | high | mitigate | `id` UUID por entrada (`IntentActionQueue.swift:34,42`) + `ackIntentAction`/`AsyncFunction("ackIntentAction")` remove seletivamente — `LiveActivityModule.swift:182-184`, `IntentActionQueue.swift:141-147` | closed |
| T-16-05-02 | Tampering | Ack prematuro perdendo entrada que ainda precisaria de reconciliação | high | mitigate | `ackQueuedLiveActivityIntent` só dentro de `if (alvo)`/`if (proxima)`, ou incondicional só para `adjustRest`/`adjustLoad`/`adjustReps` (sem guarda de alvo aplicável) — `src/native/liveActivityIntentBridge.ts:44-119` | closed |
| T-16-05-03 | Information Disclosure | `id` (UUID) trafegando no evento e no payload da fila | low | accept | UUID opaco local ao dispositivo, sem dado sensível — `IntentActionQueue.swift:42` (`UUID().uuidString`) | closed |
| T-16-05-04 | Denial of Service (local) | `IntentActionQueue.remove(ids:)` read-modify-write sem lock | low | accept (mitigado além do exigido) | Aceito na 16-05-PLAN; posteriormente serializado por `DispatchQueue` (`queue.sync`) em TODO acesso — `IntentActionQueue.swift:71,110,131,142` (commit `aeab6a3`, fora do escopo desta fase mas presente no HEAD auditado) | closed |
| T-16-06-01 | Repudiation | Resultado da sessão física reportado de forma imprecisa/inferida | high | mitigate | Resposta literal do dono citada verbatim, 3 trechos — `.planning/phases/16-tela-bloqueada-comandar/16-06-SUMMARY.md:91-103` | closed |
| T-16-06-02 | Tampering | PASS-B reinterpretado silenciosamente como falha, ou FAIL rebaixado a PASS-B | medium | mitigate | `force_quit_toque` classificado **FAIL** (não rebaixado a PASS-B) com critério literal citado — `16-06-SUMMARY.md:105-111` | closed |
| T-16-07-01 | Tampering | `reconcileLiveActivityIntents()` aplicando entrada reprovada por validação como se aplicada (ack prematuro) | high | mitigate | Ack condicionado à variável `aplicado` (só `true` quando `completeSet()` retorna `true` ou não há alvo) — `src/store/activeSessionStore.ts:1896-1904` | closed |
| T-16-07-02 | Tampering | Regressão futura reintroduzindo leitura destrutiva | medium | mitigate | `drainAll`/`drainIntentQueue`/`drainQueuedLiveActivityIntents` ausentes do código vivo — `grep -rn "drainAll\|drainIntentQueue\|drainQueuedLiveActivityIntents" src/ modules/ targets/` só retorna `sessionOutboxDrain.ts` (subsistema não relacionado); único primitivo de leitura é `peekAll`/`peekIntentQueue`/`peekQueuedLiveActivityIntents` | closed |
| T-16-07-03 | Denial of Service (local) | Fila acumulando se `canCompleteSet()` reprovar repetidamente | low | accept | Cap de 20 inalterado — `IntentActionQueue.swift:64` (mesma mitigação de T-16-01-01) | closed |
| T-16-08-01 | Tampering | `applyServerSetLogs()` sobrepondo reps/carga locais desatualizados sobre dado já confirmado pelo servidor | medium | mitigate | Ramos `if (!sl) {...return...}` vs. `if (sl...)` mutuamente exclusivos por `return` antecipado — `src/store/activeSessionStore.ts:503-523` (overlay) vs. `:524-569` (servidor autoritativo, sempre vence quando `sl` existe) | closed |
| T-16-08-02 | Tampering | Duas séries `active` simultâneas permitindo ação sobre a série ERRADA | high | mitigate | `deactivateOtherActiveSets` chamado dentro de `activateSet()` ANTES do commit final — `src/store/activeSessionStore.ts:1298` (definição em `:347-362`) | closed |
| T-16-08-03 | Information Disclosure | `setReps`/`setLoad` persistindo em disco com maior frequência | low | accept | Mesmo mecanismo/escopo (AsyncStorage local por usuário); reps/carga não são segredo — `src/services/sessionDraftStorage.ts:5` | closed |
| T-16-09-01 | Tampering | Sessão de UAT rodando contra build que NÃO contém os fixes de 16-07/16-08 | high | mitigate | Proveniência verificada (git status, símbolos do bundle Hermes, recompilação Swift com timestamp na janela do build, ambiente Supabase) ANTES da sessão física — `.planning/phases/16-tela-bloqueada-comandar/16-09-SUMMARY.md:83-92` | closed |
| T-16-09-02 | Repudiation | Resultado da sessão física reportado de forma imprecisa/inferida, ou PASS-B aceito como PASS-A | high | mitigate\* | \*Resposta do dono veio AGREGADA ("todas foram pass agora"), não item-a-item — `16-09-SUMMARY.md:95-108` disclosa isso explicitamente ("Ressalva de honestidade... interpretação derivada, não uma transcrição item a item"), nunca apresenta a inferência como fato verificado; `CMD-01`/`CMD-02` permaneceram `Gaps Found` até prova mais forte. O resíduo desta imprecisão foi promovido a T-16-10-02 e fechado com confirmação item-a-item em 16-11 (ver abaixo) | closed — ver ressalva |
| T-16-10-01 | Tampering | Steppers (carga/duração/distância/RIR/esforço) persistindo em disco com maior frequência | low | accept | Mesmo mecanismo já aceito em T-16-08-03 — `src/services/sessionDraftStorage.ts:5` | closed |
| T-16-10-02 | Repudiation | Resposta agregada do UAT de 16-09 reaproveitada para fechar 16-10 sem confirmar o caminho de UI exercitado | high | mitigate | Plano 16-11 exigiu confirmação individual do caminho de UI antes de fechar — cumprido, ver T-16-11-02 | closed |
| T-16-10-03 | Denial of Service (local) | Escrita concorrente de múltiplos toques do stepper corrompendo o rascunho em disco | low | accept | `sessionDraftStorage.ts` serializa escritas da mesma chave via `withKeyQueue` — `src/services/sessionDraftStorage.ts:16-35`; `stepLoad`/`stepReps` chamam `saveDraft` — `src/store/activeSessionStore.ts:1368,1391` | closed |
| T-16-11-01 | Tampering | Sessão de UAT rodando contra build que NÃO contém os fixes da 16-10 | high | mitigate | Proveniência verificada de forma independente pelo orquestrador (git status, string do fix no bundle em UTF-16LE, ambiente Supabase) — `.planning/phases/16-tela-bloqueada-comandar/16-11-SUMMARY.md:39-52` (Task 1) e `:200-210` (adendo, re-teste) | closed |
| T-16-11-02 | Repudiation | Resultado da sessão física reportado de forma agregada/imprecisa, repetindo a ambiguidade de 16-09 | high | mitigate | Caminho de UI nomeado e confirmado individualmente sob pergunta dirigida ("Só pelos botões -/+ do stepper") — `16-11-SUMMARY.md:56-82` (Teste 1, FAIL com causa-raiz) e `:212-227` (adendo, PASS após fix `54de3ef`) | closed |

*Status: closed · open — blocking (severity ≥ high) · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — só ameaças abertas em severidade ≥ `block_on` (default: high, sem override em `.planning/config.json`) contam para `threats_open`*
*Disposition: mitigate (implementação exigida) · accept (risco documentado) · transfer (terceiro — não usado nesta fase)*

---

## Achados de Code Review sem Threat ID formal (superfície não coberta pelo registro original)

`16-REVIEW.md` (2026-08-19, depth standard) encontrou 1 CRITICAL + 4 WARNING que **não tinham T-16-xx
correspondente** nos 11 PLAN.md — nenhum plano declarou formalmente o risco de o caminho QUENTE
(bridge já viva) aplicar um toque sem vínculo de sessão. Todos os 5 foram corrigidos e mesclados no
HEAD auditado (`49fa980`); verificados no código vivo nesta auditoria (não apenas na documentação):

| ID | Risco | Severidade equivalente | Evidência de correção (código vivo) |
|----|-------|------------------------|--------------------------------------|
| CR-01 | Caminho quente aplicava toque de sessão ANTIGA na sessão ATUAL (mesma classe de T-16-02-01, mas no bridge, não na reconciliação) | critical | `src/native/liveActivityIntentBridge.ts:44,73,85,92,107` — guarda `if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;` em TODOS os 5 `case`s; `sessionLogId` propagado nos 5 `sendEvent` — `CompleteSetIntent.swift:37`, `SkipRestIntent.swift:32`, `AdjustRestIntent.swift:42` |
| WR-01 | Ack incondicional do `completeSet` quente destruía toque reprovado por `canCompleteSet` | high | `liveActivityIntentBridge.ts:55-68` — `await`+`try/catch`, ack só quando `ok === true` |
| WR-02 | Falha de I/O de UMA entrada na reconciliação abortava o boot inteiro para `status:'error'` | medium | `src/store/activeSessionStore.ts:1868,1956-1969` — try/catch por entrada, `console.warn`, entrada não-acked, loop continua |
| WR-03 | Heurística de órfã comparava relógios de domínios diferentes com precisão de segundos | medium | `IntentActionQueue.swift:79-88` (`.withFractionalSeconds`) + `activeSessionStore.ts:293-304` (`SKEW_MS = 60_000`) |
| WR-04 | Entrega duplicada (evento quente + snapshot da fila) podia avançar duas séries num único toque | medium | `src/native/intentDeliveryRegistry.ts` (novo) + `liveActivityIntentBridge.ts:40,60,79,87,101,115` + `activeSessionStore.ts:1867` — dedupe por `id` compartilhado entre os dois caminhos |

Testes automatizados cobrindo os 5 (confirmados verdes nesta auditoria — ver Security Audit Trail):
`__tests__/liveActivityIntentBridge.test.ts` (24 casos, incl. blocos `CR-01`/`WR-01`/`WR-04`),
`__tests__/liveActivityIntentQueue.test.ts` (blocos `16-12`/`CR-01`), `__tests__/activeSessionStore.test.ts`
(blocos `WR-02`/`WR-03`/`WR-04`).

**Informativos fora de escopo do fix (`fix_scope: critical_warning`), ainda abertos mas SEM T-16-xx e
SEM severidade ≥ medium — não bloqueiam, registrados para transparência:**

| ID | Risco | Arquivo | Por que não bloqueia |
|----|-------|---------|------------------------|
| IN-01 | Ack assimétrico: `adjustRest` sem `deltaSeconds` é acked silenciosamente; `adjustReps`/`adjustLoad` tratam a ausência com warn+não-ack | `src/store/activeSessionStore.ts:1913-1916` | Só afeta entrada corrompida/formato antigo; os 3 Intents sempre preenchem o campo |
| IN-02 | `deltaValue > 0 ? 1 : -1` mapeia delta `0` para direção `-1` | `activeSessionStore.ts:1933,1950`, `liveActivityIntentBridge.ts:100,114` | O widget nunca envia `0`; só afetaria entrada corrompida |
| IN-03 | Decode do array da fila é atômico — uma entrada malformada descarta a fila INTEIRA | `IntentActionQueue.swift:95-97` (`rawReadAll`) | Nenhum build em produção grava formato antigo; mitigação de decode elemento-a-elemento não implementada |
| IN-04 | `verify-native-skeleton.sh` não trava a entitlement `application-groups` sobrevivendo a `expo prebuild --clean` | `scripts/verify-native-skeleton.sh` (sem checagem análoga à (c)/(i)) | Config atualmente correta; regressão silenciosa é hipotética, sem checagem automatizada dedicada |
| IN-05 | `activateSet`/`adjustRest` não persistem o draft — `completeSet` de reconciliação pode gravar `started_at` nulo | `activeSessionStore.ts:1271-1298` (aprox.) | Deliberado no escopo 16-10; afeta só a linha do tempo do resumo, não a integridade da série |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| R-16-01 | T-16-01-02 | `completeSet` já idempotente e travado por reentrância; nenhuma mitigação nova necessária para o novo call site da Lock Screen | Pedro Marconato (16-01-PLAN.md) | 2026-08-19 |
| R-16-02 | T-16-01-03 | Mesma aceitação de T-15-01-03 (Fase 15) — app pessoal single-user, sem PII além do próprio treino | Pedro Marconato (16-01-PLAN.md, referenciando 15-01-PLAN.md) | 2026-08-19 |
| R-16-03 | T-16-04-03 | Remover a chamada de reconciliação do boot cru de `App.tsx` não reduz cobertura — o substituto (dentro de `startOrResume`) cobre todos os ramos que chegam a `status:'active'` | Pedro Marconato (16-04-PLAN.md) | 2026-08-19 |
| R-16-04 | T-16-05-03 | UUID opaco local ao dispositivo, sem dado sensível de treino | Pedro Marconato (16-05-PLAN.md) | 2026-08-19 |
| R-16-05 | T-16-05-04 | Read-modify-write sem lock era o mesmo risco já aceito em `enqueue`/`writeAll`; posteriormente mitigado por `DispatchQueue.sync` (além do exigido) | Pedro Marconato (16-05-PLAN.md) | 2026-08-19 |
| R-16-06 | T-16-07-03 | Cap de 20 entradas já existente cobre o pior caso mesmo com reprovação repetida | Pedro Marconato (16-07-PLAN.md) | 2026-08-19 |
| R-16-07 | T-16-08-03 | Reps/carga não são segredo (`sessionDraftStorage.ts:5`), mesmo destino/mecanismo de armazenamento já usado no resto do arquivo | Pedro Marconato (16-08-PLAN.md) | 2026-08-19 |
| R-16-08 | T-16-10-01 | Mesma aceitação de T-16-08-03 — nenhuma classe de dado nova, nenhum destino novo | Pedro Marconato (16-10-PLAN.md) | 2026-08-19 |
| R-16-09 | T-16-10-03 | `sessionDraftStorage.ts` já serializa escritas da mesma chave via `withKeyQueue`; mesma mitigação aceita para setReps/setLoad em 16-08 | Pedro Marconato (16-10-PLAN.md) | 2026-08-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open (blocking) | Open (non-blocking) | Run By |
|------------|----------------|--------|-------------------|------------------------|--------|
| 2026-08-19 | 29 | 29 | 0 | 0 | gsd-secure-phase (L1, asvs 1, HEAD `49fa980`) — evidência de código vivo (não só documentação): `npx tsc --noEmit` limpo; `npx jest __tests__/liveActivityIntentBridge.test.ts __tests__/liveActivityIntentQueue.test.ts __tests__/activeSessionStore.test.ts` → 121/121 verdes; `npm run verify:native` → checagens (a)-(j), 2 rodadas, exit 0 |

---

## Sign-Off

- [x] Todas as ameaças têm disposição (mitigate / accept / transfer)
- [x] Riscos aceitos documentados no Accepted Risks Log (9)
- [x] `threats_open: 0` confirmado — nenhuma ameaça aberta em severidade ≥ `high` (block_on default)
- [x] `status: verified` definido no frontmatter
- [ ] **Ressalva registrada, não bloqueante:** T-16-09-02 foi fechado com uma resposta AGREGADA do dono
      (não item-a-item, como o próprio `16-09-SUMMARY.md` disclosa) — o resíduo dessa imprecisão foi
      rastreado como T-16-10-02 e fechado com confirmação item-a-item em `16-11-SUMMARY.md`. Nenhuma
      ação adicional necessária, mas a ressalva permanece registrada para transparência (nunca apagada
      em silêncio).

**Approval:** verified 2026-08-19 — auditoria retroativa `gsd-secure-phase`, HEAD `49fa980`
