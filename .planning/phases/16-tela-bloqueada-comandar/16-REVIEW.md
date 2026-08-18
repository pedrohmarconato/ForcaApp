---
phase: 16-tela-bloqueada-comandar
reviewed: 2026-08-18T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - modules/live-activity/ios/IntentActionQueue.swift
  - modules/live-activity/ios/LiveActivityModule.swift
  - modules/live-activity/index.ts
  - __mocks__/modules-live-activity.ts
  - src/store/activeSessionStore.ts
  - __tests__/liveActivityIntentQueue.test.ts
  - __tests__/activeSessionStore.test.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 16: Code Review Report (rodada de gap-closure — planos 16-07/16-08)

**Reviewed:** 2026-08-18
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Esta rodada (16-07 + 16-08) fecha os três defeitos confirmados por UAT físico real em `16-06-SUMMARY.md`: leitura destrutiva da fila (D1), perda de reps/carga digitados antes de um force-quit (D2/D2b) e mais de uma série `active` simultânea (D3). O mecanismo de D1 é sólido — `peekAll()`/`ackIntentAction` substituem `drainAll()` por completo (nenhum caminho morto ficou alcançável), o `ack` é condicionado ao resultado real de `completeSet()`, e os dois novos testes com `withRealActions` exercitam `canCompleteSet()` de verdade, fechando exatamente o WR-01 da rodada anterior. D3 também está corretamente centralizado: `deactivateOtherActiveSets` só é chamado de dentro de `activateSet()`, sem segundo caminho de ativação.

O achado crítico desta rodada é em D2: a persistência via `saveDraft` fire-and-forget só foi conectada a `setReps`/`setLoad` — o stepper de carga por botões `+/-` (`stepLoad`, que é a interação PRIMÁRIA de carga descrita no `PROJECT.md` do milestone: "ajuste só por botões +/− e confirmação em 1 toque") e os campos de cardio (`setDuration`, que é o ÚNICO critério de `canCompleteSet()` para exercícios de tempo/distância) continuam gravando só em memória. Um force-quit logo depois de usar o `+/-` de carga ou de informar o tempo de um cardio reproduz exatamente a mesma classe de bug que esta rodada afirma ter fechado (`force_quit_toque=FAIL`), só que por um caminho de UI diferente do testado.

Dois warnings novos: o `ack` da fila (`void ackQueuedLiveActivityIntent(...)`) nunca trata rejeição — para `skipRest`/`adjustRest` (ao contrário de `completeSet`, que é idempotente por natureza) isso pode causar reaplicação real se o `ack` falhar; e a invariante de D3 (no máximo uma série `active`) não é reforçada na reconstrução de retomada (`applyServerSetLogs`) nem no ramo offline — só em `activateSet()` — então um rascunho já corrompido em disco (por exemplo, o mesmo que causou o `regressao_geral=FAIL` do UAT anterior) não se autocorrige ao reabrir o app.

Os três achados WARNING/INFO da rodada anterior que não foram tocados neste round (WR-02, WR-03, IN-01) seguem válidos e são carregados adiante.

## Critical Issues

### CR-01: D2 só persiste `setReps`/`setLoad` — o stepper `+/-` de carga (interação primária) e os campos de cardio não sobrevivem a um force-quit

**File:** `src/store/activeSessionStore.ts:1203-1233` (setReps/setLoad, ÚNICOS com `saveDraft`), `src/store/activeSessionStore.ts:1235-1298` (`stepLoad`/`setRir`/`setDuration`/`setDistance`/`setEffort`, SEM `saveDraft`), `src/components/session/SessionPlayer.tsx:681,708` (botões `+/-` chamam `stepLoad`, não `setLoad`)

**Issue:**
`setReps` (linha 1203) e `setLoad` (linha 1221) agora chamam `saveDraft(novo).catch(...)` fire-and-forget a cada toque — mas são as ÚNICAS duas ações de escrita de série que persistem. As outras quatro ações que também mutam `draft.exercises[].sets[]` continuam fazendo só `set({ draft: withSet(...) })`, sem qualquer `saveDraft`:

- `stepLoad` (linha 1235-1252) — os botões `-`/`+` de carga em `SessionPlayer.tsx:681` e `:708`. Este é o mecanismo de ajuste de carga **primário** do milestone v1.3: `PROJECT.md` descreve o registro sem teclado como "ajuste só por botões +/− e confirmação em 1 toque" como pré-requisito da tela bloqueada (não há teclado na Live Activity). `setLoad` só é acionado pelo campo de texto (linha 698) e pelo botão "usar sugestão" (linha 726) — caminhos secundários.
- `setDuration` (linha 1269-1283) — o único campo que alimenta `canCompleteSet()` para exercícios `isTimeBased` (cardio/isometria): `canCompleteSet` (`sessionModel.ts:272-274`) retorna `set.actualDurationSeconds != null && set.actualDurationSeconds > 0` para esse metric, ignorando reps/carga por completo.
- `setDistance`, `setEffort`, `setRir` (linhas 1285-1309, 1254-1267) — mesma lacuna, campos de menor criticidade para `canCompleteSet()` mas ainda auxiliares do registro.

Cenário de falha concreto: o dono ajusta a carga pelo botão `+` na tela do app (ou eventualmente na Live Activity, quando esse controle existir lá), sem tocar no campo de texto; ou está fazendo um cardio e informa o tempo pelo seletor. Em qualquer um dos dois casos, um force-quit imediatamente depois — o MESMO gatilho documentado em `16-06-SUMMARY.md` como `force_quit_toque=FAIL` — descarta o valor só-em-memória. Na reabertura, `canCompleteSet()` reprova de novo (para cardio, sempre reprova, porque `actualDurationSeconds` nunca chega a ser gravado por nenhum outro caminho) e uma eventual entrada da fila de intents da tela bloqueada (`completeSet`) fica presa na fila (não é um bug de D1 — D1 está correto: a entrada sobrevive por design até a validação passar — mas para cardio ela NUNCA vai passar, porque o dado que faltava nunca é persistido por caminho nenhum).

Os testes de D2 (`__tests__/activeSessionStore.test.ts:607-642`) só verificam `setReps`/`setLoad` diretamente — nenhum teste da rodada exercita `stepLoad` nem `setDuration` após um "force-quit" simulado (recarregar o draft do `saveDraft` mais recente), então esta lacuna de cobertura é consistente com a lacuna de código: o teste passaria de novo mesmo que o fix inteiro de D2 fosse revertido, DESDE que a interação usada no teste continue sendo só `setReps`/`setLoad`.

**Fix:**
Estender o mesmo padrão fire-and-forget para as quatro ações restantes que também deveriam sobreviver a um force-quit — pelo menos `stepLoad` e `setDuration`, que são as duas com maior probabilidade de reproduzir o UAT `force_quit_toque=FAIL`:

```ts
stepLoad: (exerciseId, setOrder, direction) => {
  const draft = get().draft;
  if (!draft) return;
  const novo = withSet(draft, exerciseId, setOrder, (s, ex) => { /* ...cálculo atual... */ });
  set({ draft: novo });
  saveDraft(novo).catch((e) => {
    console.warn('[activeSession] carga (stepper) não persistida (não-fatal):', e);
  });
},

setDuration: (exerciseId, setOrder, seconds) => {
  const draft = get().draft;
  if (!draft) return;
  const limpo = /* ...cálculo atual... */;
  const novo = withSet(draft, exerciseId, setOrder, (s) => ({ ...s, actualDurationSeconds: limpo }));
  set({ draft: novo });
  saveDraft(novo).catch((e) => {
    console.warn('[activeSession] duração não persistida (não-fatal):', e);
  });
},
```

Considerar o mesmo tratamento para `setDistance`/`setEffort`/`setRir` por consistência (são baratos — `withKeyQueue` já serializa as escritas da mesma chave). Se a decisão for deliberadamente restringir o escopo a `setReps`/`setLoad` só (por exemplo, por custo de I/O), isso precisa ser uma decisão explícita registrada — hoje o `16-08-SUMMARY.md` não menciona a exclusão de `stepLoad`/`setDuration`, o que sugere lacuna não-intencional, não escopo deliberado.

## Warnings

### WR-01: `ack` da fila de intents nunca trata rejeição — para `skipRest`/`adjustRest` isso pode causar reaplicação real (não é só idempotência de log)

**File:** `src/store/activeSessionStore.ts:1682,1696,1702,1707`, `modules/live-activity/index.ts:85-86`

**Issue:** Os quatro call sites de `ackQueuedLiveActivityIntent` dentro de `reconcileLiveActivityIntents()` são todos `void ackQueuedLiveActivityIntent(entry.id);` — sem `.catch()`. `ackQueuedLiveActivityIntent` (`modules/live-activity/index.ts:85-86`) devolve a Promise crua de `LiveActivityModule.ackIntentAction(id)` sem nenhum tratamento interno; se essa chamada nativa rejeitar (falha de IPC do bridge, por exemplo durante um force-quit em andamento — justamente o cenário que esta fase inteira trata), o resultado é uma promise rejeitada sem handler.

Para o caso `completeSet`, isso é inofensivo: a entrada permanece na fila e será reprocessada na próxima reconciliação, mas `completeSet()` é idempotente (`serie.status === 'done'` retorna `true` sem regravar — `activeSessionStore.ts:1322`), então o retry converge sem duplicar nada.

Para `skipRest` (linha 1699-1704) e `adjustRest` (linha 1705-1709) isso NÃO é idempotente: se o `ack` falhar depois que a ação já foi aplicada com sucesso, a MESMA entrada é reaplicada na reconciliação seguinte —
- `skipRest`: `findNextPendingSet(draft)` já não vai mais encontrar a série que acabou de ser ativada (ela virou `'active'`, não é mais `'pending'`), então `activateSet` é chamado sobre a PRÓXIMA série depois dela — pulando uma série a mais do que o toque original pedia.
- `adjustRest`: `adjustRest(entry.deltaSeconds)` desloca `restEndsAt` de novo pelo mesmo delta — um "+30s" vira "+60s" sem um segundo toque do usuário.

**Fix:**
```ts
void ackQueuedLiveActivityIntent(entry.id).catch((e) => {
  console.warn('[liveActivity] ack de intent falhou (entrada pode ser reaplicada):', e);
});
```
Isso pelo menos evita a rejeição não tratada e deixa rastro no Console. Se o `ack` puder falhar de forma reproduzível na prática (vale investigar em UAT), considerar adicionar um `id` já processado a um Set em memória de curta duração para não reaplicar `skipRest`/`adjustRest` mesmo que o `ack` não confirme — mas isso é mitigação adicional, não obrigatória para fechar o achado mínimo (tratar a rejeição).

### WR-02: Invariante de D3 (no máximo uma série `active`) não é reforçada na retomada — um rascunho já corrompido em disco (inclusive pela FALHA que esta rodada corrige) não se autocorrige

**File:** `src/store/activeSessionStore.ts:374-520` (`applyServerSetLogs`, ramo D2b), `src/store/activeSessionStore.ts:690` (ramo offline, `set({ draft: local, ... })`)

**Issue:** `deactivateOtherActiveSets` (linhas 303-318) só é invocada de dentro de `activateSet()` (linha 1188). Isso fecha o caminho de ATIVAÇÃO daqui para frente, mas não normaliza um `draft` que chega de disco JÁ com mais de uma série `'active'` — cenário plausível justamente porque essa é a exata corrupção que o `regressao_geral=FAIL` do UAT anterior (`16-06-SUMMARY.md`) documentou, e que pode estar gravada no rascunho local do dono AGORA (sessão que ficou travada antes deste fix).

Dois caminhos de retomada carregam o `draft` sem passar por `deactivateOtherActiveSets`:
1. **Ramo offline** (linha 690): `set({ draft: local, status: 'active' })` — adota o rascunho local CRU, sem qualquer normalização.
2. **Ramo reconciliado com o servidor** (`applyServerSetLogs`, overlay D2b, linhas 414-431): para cada série sem confirmação do servidor (`!sl`), copia `status: emAndamentoLocal.status === 'active' ? 'active' : s.status` — se DUAS séries diferentes do `local` já estiverem `'active'` (dado corrompido pré-fix), a reconstrução preserva as DUAS como `'active'` na sessão retomada. `findActiveSet()` (`sessionModel.ts:290-297`) devolve a primeira por ordem de array, então a série "ativa" que a tela mostra pode não ser a que o usuário estava de fato preenchendo.

Nenhum teste da rodada (`__tests__/activeSessionStore.test.ts:751-807`, describe "D3") cobre este caminho — todos os três testes de D3 chamam `activateSet()` diretamente; nenhum constrói um `local` com duas séries `'active'` e verifica que a retomada (`startOrResume`) normaliza para uma só.

**Fix:** Aplicar `deactivateOtherActiveSets` (ou uma normalização equivalente que escolha determinística e documentadamente qual das ativas "vence") no ponto único de reconstrução do draft antes de ele ser exposto pelo `set()`, cobrindo os dois ramos:
```ts
// applyServerSetLogs, no retorno final (ou logo após), e no ramo offline antes do set({ draft: local, ... }):
const semDuplicidadeDeAtiva = normalizeSingleActiveSet(reaplicado);
```
onde `normalizeSingleActiveSet` reaproveita a mesma lógica de `deactivateOtherActiveSets`, generalizada para não exigir um par exerciseId/setOrder de exceção (por exemplo: mantém a primeira `'active'` encontrada e desativa as demais).

### WR-03 (carregado da rodada anterior, ainda aberto): `IntentActionQueue.enqueue`/`writeAll` não é atômico entre processos concorrentes

**File:** `modules/live-activity/ios/IntentActionQueue.swift:59-77`

**Issue:** Inalterado nesta rodada. `enqueue` continua fazendo `readAll()` → `append` em memória → `writeAll()`, sem lock nem CAS a nível de `UserDefaults`. Risco baixo (toques quase simultâneos raramente colidem nessa janela), mas segue sem mitigação.

**Fix:** Ver `16-REVIEW.md` anterior (WR-02 original) — `NSFileCoordinator`/semáforo ao redor de `readAll`+`writeAll`, ou formato append-only por entrada.

### WR-04 (carregado da rodada anterior como WR-03, ainda aberto): Falha ao gravar na fila do App Group é engolida em silêncio, sem log

**File:** `modules/live-activity/ios/IntentActionQueue.swift:59-67`

**Issue:** Inalterado nesta rodada. `readAll`/`writeAll` seguem usando `?.` sobre `defaults()`, sem `os_log` no ramo de falha — uma regressão de entitlements no App Group continua sem deixar rastro no Console.

**Fix:** Ver `16-REVIEW.md` anterior (WR-03 original) — `os_log` no `guard`/`else` de `readAll`/`writeAll`.

## Info

### IN-01 (carregado da rodada anterior, ainda aberto): `moduleNameMapper` do Jest não está ancorado no início

**File:** `package.json:125-126`

**Issue:** Inalterado nesta rodada — não tocado pelo diff de 16-07/16-08. `"modules/live-activity$"` continua sem `^`, casando qualquer path terminado nesse sufixo.

**Fix:** Ver `16-REVIEW.md` anterior (IN-01 original) — `"(^|/)modules/live-activity$"`.

---

## Achados da rodada anterior FECHADOS por 16-07/16-08 (confirmado contra o código vivo)

- **CR-01 anterior** (reconciliação corria com a hidratação do draft, fila destrutiva perdia a ação) — RESOLVIDO. `reconcileLiveActivityIntents()` só é chamada de dentro de `startOrResume()` (3 ramos, todos atrás de `isCurrent()`), nunca mais no mount de `App.tsx` (confirmado: `git diff` não toca `App.tsx` nesta rodada porque o call site já havia sido movido antes de `1689e08`). A leitura agora é `peekAll()`, não-destrutiva — `drainAll()` foi removido do código Swift/TS/mock por completo (grep confirmado: zero ocorrências de `drainAll|drainIntentQueue|drainQueuedLiveActivityIntents`).
- **CR-02 anterior** (entrega in-process bem-sucedida nunca removia a entrada, replay duplicado no boot) — RESOLVIDO antes desta rodada (mecanismo `id`/`ackIntentAction`/`remove(ids:)` já existia em `IntentActionQueue.swift`/`LiveActivityModule.swift` antes de `1689e08`); esta rodada generaliza o `ack` condicionado também para o caminho de reconciliação de boot (antes só usado no caminho quente).
- **WR-01 anterior** (suíte nunca testava `draft === null` no momento da reconciliação) — RESOLVIDO. `__tests__/liveActivityIntentQueue.test.ts:227-262` reproduz exatamente a ordem real (reconcile com `draft: null`, sem `setState` prévio, depois hidrata e reconcilia de novo).

---

_Reviewed: 2026-08-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
