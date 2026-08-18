---
phase: 16-tela-bloqueada-comandar
plan: 06
subsystem: testing
tags: [uat, live-activity, app-intents, lock-screen, ios, gap-closure]

requires:
  - phase: 16-tela-bloqueada-comandar (planos 16-04 e 16-05)
    provides: guarda de hidratação + reconciliação em startOrResume (16-04); id estável + ackIntentAction (16-05)
provides:
  - Resposta explícita do dono aos 3 itens do runbook de re-execução (formato obrigatório do plano)
  - Confirmação física de que o gap 2 (duplicação) está fechado
  - Descoberta de 3 defeitos pré-existentes que impedem o fechamento do gap 1
affects: [fase-17-registro, live-activity, reconciliacao, active-session-store]

actuals:
  tokens: 1200
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "sem_duplicacao=PASS — o requisito não-negociável desta rodada (nenhuma duplicação de gravação) está confirmado no aparelho físico; o ack seletivo de 16-05 funciona no caminho in-process"
  - "force_quit_toque=FAIL — não é PASS-A nem PASS-B: há erro visível ('Informe repetições e carga antes de concluir a série'), o toque é perdido de forma irrecuperável, e a série fica em estado inconsistente. O critério literal do plano classifica erro visível + estado inconsistente como FAIL"
  - "regressao_geral=FAIL — 'Pular' na última série de um exercício retorna à mesma série em vez de avançar"
  - "requirements-completed deixado VAZIO deliberadamente: CMD-01/CMD-02 permanecem Gaps Found. Marcar como completo aqui repetiria exatamente o erro revertido no commit 82c23c8"
  - "Os 3 defeitos são PRÉ-EXISTENTES (blame: 17946c2 da plano 16-02, e d249212 de 23/07) — 16-04/16-05 não introduziram regressão; 16-04 trocou uma perda silenciosa por uma falha visível"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "Sequência de toques com o app vivo, seguida de force-quit e reabertura, não duplica nem reaplica nenhuma ação"
    requirement: CMD-02
    verification:
      - kind: manual_procedural
        ref: "sessão física 18/08/2026, iPhone real (UDID 4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7), build Release reassinado — item sem_duplicacao=PASS"
        status: pass
    human_judgment: true
    rationale: "Só o aparelho físico, com o app genuinamente vivo/backgrounded e depois morto, exercita o caminho de ack in-process contra a fila durável do App Group"
  - id: D2
    description: "Force-quit seguido de toque em 'Concluir série' na tela bloqueada aplica a intenção automaticamente ao reabrir (PASS-A)"
    requirement: CMD-01
    verification:
      - kind: manual_procedural
        ref: "sessão física 18/08/2026 — item force_quit_toque=FAIL (erro visível + toque perdido + série travada em active)"
        status: fail
    human_judgment: true
    rationale: "O comportamento de cold-launch após force-quit real não é reproduzível fora do aparelho"
  - id: D3
    description: "Tocar 'Pular' num descanso ativa somente a série seguinte"
    verification:
      - kind: manual_procedural
        ref: "sessão física 18/08/2026 — item regressao_geral=FAIL (última série do exercício retorna à mesma série)"
        status: fail
    human_judgment: true
    rationale: "Depende da sequência real de estado no aparelho após um completeSet reprovado"

duration: ~40min
completed: 2026-08-18
status: complete
---

# Fase 16 — Plano 06: Re-execução do UAT físico após os fixes

**A sessão física confirmou o fechamento do gap 2 (nenhuma duplicação), mas reprovou o gap 1: o toque na tela bloqueada durante force-quit é perdido de forma irrecuperável por três defeitos pré-existentes que os fixes de 16-04/16-05 expuseram sem corrigir.**

## Performance

- **Duração:** ~40 min (build reassinado instalado às 09:16, relato do dono na sequência)
- **Aparelho:** iPhone físico do dono, UDID `4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7`, bundleID `com.pmarconato.forcaapp`
- **Build:** Release reassinado via `npm run resign`, exit 0, a partir de `e201cd0` (HEAD pós-merge de 16-04 + 16-05)

## Proveniência do build (verificada antes da sessão)

O build instalado continha de fato os dois fixes — verificado, não presumido:

- `ackIntentAction` (16-05) e `reconcileLiveActivityIntents` (16-04) presentes na tabela de strings do bytecode Hermes de `main.jsbundle`
- Os 5 arquivos Swift de 16-05 compilados neste build (`LiveActivityModule` 29 refs, os 3 `LiveActivityIntent` 6 cada, `IntentActionQueue` 3)
- `git status` limpo em `e201cd0` no momento do build

## Resposta literal do dono

Formato obrigatório do `resume-signal`. Transcrição literal, sem parafrasear:

> "parte 1 deu tudo certo, na parte dois funciona mas só quando eu coloco as reps e cargas antes de dar o force quit pois com a tela bloqueada nao consigo colocar"

Sobre o item `force_quit_toque`, questionado especificamente sobre o caso em que reps/carga **foram** informados antes do force-quit:

> "da uma informacao de 'informe repetições e carga antes de concluir a série' volta para o timer e ao terminar o timer ou pular descanso ele volta para série, ou seja, não avança"

Sobre o item `regressao_geral`:

> "fiz na última série do exercicio coloquei para pular com a tela bloqueada e ela simplesmente voltou para a serie que eu estava, não avançou"

## Resultado por item

| Item | Resultado | Base |
|------|-----------|------|
| `sem_duplicacao` | **PASS** | "parte 1 deu tudo certo" — nenhuma ação reaplicada após force-quit |
| `force_quit_toque` | **FAIL** | Erro visível + toque perdido + série em estado inconsistente |
| `regressao_geral` | **FAIL** | "Pular" na última série não avança |

`force_quit_toque` não foi classificado como PASS-B. A prohibition do plano proíbe rebaixar um PASS-B a falha, mas o observado não é um PASS-B: PASS-B exige "concluir manualmente **sem erro/travamento**", e aqui há mensagem de erro, perda irrecuperável do toque e duas séries simultaneamente `active`. O critério literal do plano — "Qualquer travamento, erro visível, ou série em estado inconsistente é FAIL" — se aplica.

## Causa raiz — três defeitos pré-existentes

Investigação por leitura de código com confirmação em `file:linha`.

**D1 — a fila durável é destruída antes de saber se a ação pode ser aplicada.**
`drainAll()` apaga a fila inteira do App Group antes de devolver as ações ao JS (`modules/live-activity/ios/IntentActionQueue.swift:80-84` — `removeObject(forKey:)` roda antes do retorno). Se `completeSet()` reprova na validação (`src/store/activeSessionStore.ts:1259-1268`), retorna `false`, e `reconcileLiveActivityIntents()` ignora o retorno (`:1605`) sem re-enfileirar. **O toque do dono é perdido para sempre.**

Isso viola a prohibition escrita no próprio `16-04-PLAN.md`: *"uma entrada só pode ser destruída no momento em que é de fato aplicada ou definitivamente descartada por CAS"*. A guarda de hidratação de 16-04 cobre o caso "draft ausente", mas não o caso "aplicação reprovada".

**D2 — reps/carga nunca são persistidos.**
`setReps`/`setLoad` (`src/store/activeSessionStore.ts:1137-1157`) não chamam `saveDraft` — os valores vivem só em memória. O force-quit os descarta; o app reabre sem eles; `canCompleteSet()` (`src/engine/sessionModel.ts:262-278`) reprova legitimamente. É a causa direta da mensagem que o dono viu, e explica por que sua observação ("informei reps e carga") e a mensagem de erro são ambas verdadeiras.

**D3 — duas séries ficam `active` simultaneamente.**
`activateSet` não desativa a série anterior (`src/store/activeSessionStore.ts:1111-1124`). Depois de um `completeSet` reprovado deixar uma série travada em `active`, o `skipRest` seguinte ativa a do próximo exercício via a busca **global** `findNextPendingSet` (`src/engine/sessionModel.ts:300-307`). Com duas séries `active`, `findActiveSet` devolve a **primeira por ordem de array** (`src/engine/sessionModel.ts:290-297`) — a travada. É exatamente o "voltou para a série que eu estava".

## Regressão: nenhuma

Veredito explícito: **os três defeitos são PRÉ-EXISTENTES.**

- O corpo do `switch (entry.kind)` (`activeSessionStore.ts:1602-1618`) é **byte-idêntico** entre `567ac9e` e `HEAD`; `git blame` atribui todas as linhas a `17946c2` (plano 16-02), anterior aos fixes
- `canCompleteSet()` vem de `d249212` (23/07/2026), sem relação com a Fase 16
- O diff `567ac9e..HEAD` nos dois arquivos contém apenas: a guarda de hidratação, os 3 novos call sites em `startOrResume()`, e as chamadas de ack no bridge in-process

O que 16-04 mudou foi **quando** a reconciliação roda. Antes, `App.tsx` a chamava no boot cru com `draft` sempre `null`: a fila era lida e apagada sem nunca chegar ao `switch`, perdendo a ação **em silêncio, sem mensagem**. 16-04 fez a fila finalmente chegar ao `switch` com um draft real — corrigindo a perda silenciosa e, no mesmo movimento, tornando visível o defeito que antes nunca era alcançado. Perda silenciosa virou falha visível: melhor de diagnosticar, mas ainda perda.

## Por que a suíte automatizada não pegou

`__tests__/liveActivityIntentQueue.test.ts:162-172` substitui `completeSet`/`activateSet`/`adjustRest` por `jest.fn()` — `completeSet = jest.fn().mockResolvedValue(true)` — então `canCompleteSet()` **nunca roda** nos testes de reconciliação. `__tests__/liveActivityIntentBridge.test.ts:1-3` mocka a store inteira pelo mesmo motivo.

Nenhum teste cobre: (a) `completeSet` retornando `false` por validação dentro do fluxo de reconciliação; (b) duas séries `active` simultâneas após a sequência completeSet-reprovado + skipRest. Os 1880 testes verdes são compatíveis com o aparelho falhando.

## Peça de conserto que já existe

16-05 construiu a remoção seletiva não-destrutiva (`IntentActionQueue.remove(ids:)` + `ackIntentAction`), mas ela está ligada **somente** no caminho in-process: `activeSessionStore.ts` nunca importa `ackQueuedLiveActivityIntent`. Conectar a reconciliação ao mesmo mecanismo — drenar sem apagar, confirmar só o que foi aplicado — é o caminho direto para D1.

## Estado dos requisitos

`CMD-01` e `CMD-02` permanecem **Gaps Found**. Não foram marcados como completos aqui: o gap 2 fechou, o gap 1 não. Marcar agora repetiria o erro já revertido em `82c23c8`.

## Follow-up

Os três defeitos vão para gap closure da Fase 16, por decisão explícita do dono nesta sessão.
