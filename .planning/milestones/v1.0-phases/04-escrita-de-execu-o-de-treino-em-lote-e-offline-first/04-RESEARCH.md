# Phase 4: Escrita de execução de treino em lote e offline-first - Research

**Researched:** 2026-08-12
**Domain:** Fila de mutações local durável (outbox) para escrita de execução de treino, React Native + Supabase RPC
**Confidence:** HIGH (código vivo lido integralmente nos pontos que a fila reveste; nenhuma lib nova; ambiguidades reais do CONTEXT.md documentadas como Open Questions, não inventadas)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Alcance da fila**
- **D-01:** A fila cobre **tudo depois do start**. `start_session` continua write-through
  síncrono — é ele que devolve o `session_log_id` que ancora todo o resto. Entram na fila:
  `save_set_log`, `update_set_log_adaptation`, `skip_session_exercise`,
  `unskip_session_exercise`, `swap_session_exercise` e `finish_session`. Nenhuma mudança de
  contrato de RPC nem de schema.
- **D-02:** "Envio agrupado" do REQ-07 significa **agrupamento temporal**: a fila junta o
  pendente e drena em sequência chamando as RPCs que já existem. Nenhuma RPC nova em lote,
  nenhuma migration. As guardas `0005_set_log_first_write_wins.sql` (first-write-wins) e
  `0036_guarda_set_log_troca_cardio.sql` continuam sendo a fonte de verdade da
  idempotência — o cliente é desenhado CONTRA elas, não em paralelo. Reversibility: costly.
- **D-03:** Gatilho de drenagem: tentativa imediata a cada escrita, backoff em caso de
  falha, e retorno do app ao primeiro plano (`AppState`, padrão já usado em
  `src/hooks/useDiaLocal.ts:11`). **Sem** `@react-native-community/netinfo` e sem
  `expo-network` — nenhuma dependência nativa nova.
- **D-04:** Ordem **FIFO estrita por sessão**, preservando a causalidade que as guardas
  0005/0036 esperam. Falha de rede mantém o item na fila e retenta. Recusa definitiva do
  servidor remove o item para **quarentena** e a fila segue drenando.

**O que o aluno vê**
- **D-05:** A série é marcada como concluída **na hora**, sem erro na tela. Um selo
  discreto de pendência (sem cor de erro, sem bloquear nada) indica que há registro a
  caminho. Substitui o comportamento atual, em que a série não é concluída e a mensagem
  crua do erro vai para a tela.
- **D-06:** Item em quarentena **não gera nada na tela** — apenas log. Decisão do dono
  contra a recomendação apresentada. Consequência aceita: o histórico do aluno pode
  divergir do que ele viveu, sem explicação na UI.
- **D-07:** O item recusado em definitivo **fica gravado localmente** com motivo e carimbo
  de tempo, e expira sozinho após um prazo, sem crescer sem teto no AsyncStorage.
- **D-08:** Finalizar o treino **não bloqueia**. A tela de fim aparece como hoje e a fila
  drena em segundo plano, inclusive na próxima abertura do app. Consequência aceita: por
  alguns instantes a sessão segue aberta no servidor e o histórico demora a refletir o
  treino.

**Durabilidade e desistência**
- **D-09:** A fila mora em **storage próprio** (ex.: `src/services/sessionOutboxStorage.ts`),
  no molde de `src/services/sessionDraftStorage.ts`: chave por usuário+sessão,
  `withKeyQueue` serializando escritas da mesma chave, campo `version` no JSON para ignorar
  formato antigo. Motivo duro: `clearDraft` apaga o rascunho ao finalizar
  (`src/store/activeSessionStore.ts:346` e `:1616`) e destruiria registro não enviado.
  Reversibility: costly.
- **D-10:** A fila é **do usuário, não da tela**: drena na abertura do app, de qualquer
  sessão, sem exigir reabrir aquele treino. Começar treino novo não espera nada; itens
  antigos seguem à frente na ordem FIFO.
- **D-11:** Desistência **por idade, nunca por número de tentativas**. Retry indefinido com
  backoff enquanto o item for mais novo que o prazo (candidato: 7 dias). Vencido o prazo, o
  item vai para a mesma quarentena do D-07. O valor exato é constante nomeada —
  `src/engine/config.ts` é o lugar canônico do projeto para número tunável.
- **D-12:** Falha de `AsyncStorage` ao enfileirar **não bloqueia**: o item segue em memória
  e continua tentando pela rede; perde-se apenas a garantia de sobreviver ao app ser morto.
  Reaproveita `storageWarning`/`STORAGE_WARNING_MSG` (aqui é literalmente verdadeiro).

**Identidade e dedupe**
- **D-13:** Identidade do item por **chave natural, por tipo de operação**: série =
  `(session_log_id, planned_set_id)`; recusa/troca = `(session_log_id, planned_exercise_id)`;
  finalização = `(session_log_id)`. Enfileirar de novo o mesmo alvo é no-op. Alinha a fila
  com as três camadas que já concordam entre si: a trava de reentrância
  `${sessionLogId}:${plannedSetId}` (`activeSessionStore.ts:1191`), o
  `if (serie.status === 'done') return true` (`:1189`) e o first-write-wins da 0005.
- **D-14:** A classificação "retentável × definitivo" reaproveita
  `isTransportSessionExecutionError` (`src/services/sessionExecutionRepository.ts:112`), já
  usada no store em `:524` e `:593`. Erro de transporte volta para a fila; resposta que o
  Postgres devolveu com código próprio (`P0005` da 0036, `42501` de RLS, `22023` de
  vocabulário fechado) é recusa definitiva → quarentena. Timeout é ambíguo por natureza,
  mas a 0005 torna o reenvio seguro.
- **D-15:** A fila é **camada nova entre store e repository**. A política — ordem FIFO,
  backoff, expiração, quarentena — nasce como **função pura em `src/engine/`**, testável
  offline sem mock de rede; o I/O fica em `src/services/`; o repository e o contrato das
  RPCs ficam intactos; o `activeSessionStore.ts` (1570 linhas, apontado como área frágil no
  `CONCERNS.md`) não engorda.
- **D-16:** Barra de prova em três níveis: (1) política pura em teste unitário — ordem,
  backoff, expiração, quarentena; (2) drenagem real contra Postgres local, reaproveitando o
  harness de integração que o `03-07-PLAN.md` construiu, provando que retry não duplica e
  que `P0005` vira quarentena; (3) UAT com o aparelho em **modo avião** no meio de um
  treino — único nível que reproduz o sintoma que originou a fase.

### Claude's Discretion

- Copy e forma exata do selo de pendência (D-05), respeitando: sem cor de erro, não
  bloqueante, e "sem dado inventado" — sem amostra é "—", nunca "0".
- Nomes de arquivos, funções e tipos, seguindo `.planning/codebase/CONVENTIONS.md`.
- Valor exato do backoff e do prazo de expiração, dentro da regra do D-11.
- Formato do registro de quarentena em disco (D-07), desde que carregue motivo e carimbo de
  tempo e tenha expiração.
- Se a política pura vira um módulo novo em `src/engine/` ou entra num existente.

### Deferred Ideas (OUT OF SCOPE)

- React ErrorBoundary / handler global de exceção JS — categoria diferente, vale fase
  própria.
- RPC de escrita em lote no servidor (`save_set_logs` transacional) — descartada pelo D-02;
  volta a fazer sentido só se o volume medido virar problema.
- Detector de conectividade explícito (`@react-native-community/netinfo`/`expo-network`) —
  descartado pelo D-03 para não somar dependência nativa.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-07 | Escritas de execução de sessão (`save_set_log` e correlatas) ganham buffer local durável e envio agrupado/reenviado, de modo que soluço de rede na academia não interrompa o treino nem apareça ao aluno como falha. | Seções "Architecture Patterns", "Code Examples" e "Common Pitfalls" abaixo mapeiam cada uma das 6 operações (`save_set_log`, `update_set_log_adaptation`, `skip_session_exercise`, `unskip_session_exercise`, `swap_session_exercise`, `finish_session`) para o desenho da fila, com os 9 pontos de chamada atuais em `activeSessionStore.ts` identificados por linha. |
</phase_requirements>

## Summary

Hoje não existe nenhuma fila/outbox para as escritas de execução de sessão
`[VERIFIED: .planning/debug/typeerror-envio-series-treino.md, Evidence 2026-08-10T00:30:00Z]`
— cada uma das 6 operações do REQ-07 é `await`ada direto contra o repository dentro de
`activeSessionStore.ts`, em 9 pontos de chamada
(`:682` `startSessionLog` — fora de escopo, D-01;
`:1238` `saveSetLog`;
`:1351`/`:1429` `updateSetLogAdaptation`;
`:1453` `skipSessionExercise`;
`:1497` `unskipSessionExercise`;
`:1544` `swapSessionExercise`;
`:1595` `skipPlannedSession` — fora de escopo, não está na lista D-01;
`:1636` `finishSessionLog`)
`[VERIFIED: src/store/activeSessionStore.ts:682,1238,1351,1429,1453,1497,1544,1595,1636]`.
O trabalho da fase é 100% novo: uma camada de outbox entre o store e o repository, sem
tocar contrato de RPC nem schema (D-02), sem dependência nativa nova (D-03), reusando
exatamente os mecanismos de storage (`sessionDraftStorage.ts`), classificação de erro
(`isTransportSessionExecutionError`) e dedupe (trava de reentrância `inFlight` +
`status === 'done'`) que já existem e já concordam entre si.

A dificuldade real desta fase não é "escrever numa fila" — é manter as invariantes que o
`activeSessionStore.ts` já garante (CAS/epoch, reentrância, first-write-wins, ordem causal
frente às guardas 0005/0036) depois que a escrita deixa de ser síncrona e passa a ser
otimista (D-05: a série conclui na tela antes da confirmação do servidor). Duas lacunas
reais do CONTEXT.md — não decisões erradas, decisões que faltam — são documentadas em
"Open Questions": (1) `update_set_log_adaptation` não tem chave de identidade no D-13 e
depende de um `set_log_id` que só existe DEPOIS que o `save_set_log` correspondente drena;
(2) a granularidade de chave de storage do D-09 ("por usuário+sessão", no molde do
`sessionDraftStorage`) precisa decidir SESSÃO = `planned_session_id` (a chave do draft) ou
`session_log_id` (a chave que ancora os itens da fila, per D-13) — drenar depois de
`finish_session` (critério de sucesso #3) só funciona se a fila for descobrível sem
depender do rascunho ativo, que já foi limpo.

**Primary recommendation:** Um documento por usuário (`@session_outbox_<userId>`, um único
`AsyncStorage.setItem`/`getItem`, `withKeyQueue` por `userId`) contendo um array de itens
com `sessionLogId` embutido em cada item, mais um array de quarentena separado no mesmo
documento. Drenagem processa cada `sessionLogId` como sub-fila FIFO independente — head
bloqueado de uma sessão nunca atrasa outra sessão (D-10), mas dentro da mesma sessão a
ordem é estritamente preservada (D-04). Isso resolve as duas lacunas acima sem inventar
mecanismo de índice/enumeração: um único documento é sempre descobrível por `userId` puro,
independente de qual `plannedSessionId`/`sessionLogId` estiver ativo na tela.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Política de fila (ordem FIFO, backoff, expiração, classificação retry×quarentena) | Frontend — Domain (pure) `src/engine/` | — | D-15 exige função pura testável offline; nenhuma decisão de política pode depender de I/O |
| Persistência durável da fila e da quarentena | Frontend — I/O `src/services/` | — | D-09 exige storage próprio via AsyncStorage, no molde de `sessionDraftStorage.ts` |
| Drenagem (orquestra política + storage + repository, dispara RPC) | Frontend — I/O `src/services/` | Frontend — State & Orchestration `src/store/` | A chamada de RPC é I/O puro (fica em services); o gatilho por `AppState` e a integração com o ciclo de vida do app pode viver num hook, mas a lógica de "quem tenta agora" não pertence ao Zustand store |
| Gatilho de drenagem no retorno ao primeiro plano | Frontend — State & Orchestration (`src/hooks/`) | App shell (`App.tsx`/`RootNavigator`) | Mesmo padrão de `useDiaLocal.ts:40` (`AppState.addEventListener('change', ...)`); drena "do usuário", então o hook deve montar acima da tela de sessão, não dentro dela (D-10) |
| Selo de pendência na UI | Frontend — Presentation `src/screens/`, `src/components/` | — | D-05 é puramente visual; lê estado derivado da fila, não decide nada |
| RPCs `save_set_log`/`update_set_log_adaptation`/`skip_session_exercise`/`unskip_session_exercise`/`swap_session_exercise`/`finish_session` | Database/Storage (Supabase RPC) | — | Contrato intocado por D-02; a fila é cliente da mesma API que já existe |
| Guardas de idempotência (`0005`, `0036`) | Database/Storage (Postgres) | — | Fonte de verdade da idempotência; o cliente é desenhado CONTRA elas (D-02), nunca duplica a lógica |

## Standard Stack

### Core

Nenhuma dependência nova. A fase reusa integralmente o que já está instalado:

| Library | Version | Purpose | Why Standard (neste projeto) |
|---------|---------|---------|--------------|
| `@react-native-async-storage/async-storage` | `2.2.0` `[VERIFIED: package.json:33]` | Persistência local durável da fila e da quarentena | Já é a base de `sessionDraftStorage.ts`; `getAllKeys`/`multiGet`/`multiSet`/`multiRemove` confirmados na API instalada `[VERIFIED: node_modules/@react-native-async-storage/async-storage/lib/typescript/types.d.ts:69,92,99,105]` — cobre qualquer necessidade de enumeração sem precisar de índice hand-rolled |
| `react-native` `AppState` | `0.81.5` (built-in) | Gatilho de drenagem no retorno ao primeiro plano | Padrão já em produção em `src/hooks/useDiaLocal.ts:11,40` — zero dependência nova, exatamente o que o D-03 exige |
| `zustand` | `^4.5.7` | Estado observável do selo de pendência (D-05) e da UI | Já é o estado global do app; a fila em si NÃO deve virar estado do Zustand (I/O pesado, ver "Anti-Patterns") — só o resumo derivado (contagem de pendentes/quarentena por série) precisa ser observável |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Documento único por usuário em AsyncStorage | SQLite/`expo-sqlite` como store da fila | Mais robusto para volume alto, mas é dependência nativa nova — vetado pelo espírito do D-03 (nenhuma dependência nativa nova enquanto o teste de build nativo da Fase 03 segue pendente, `STATE.md:44`) e desproporcional ao volume real (dezenas de itens por treino, não milhares) |
| Storage sharded por `sessionLogId` (`getAllKeys` + prefixo) | Documento único por usuário | `getAllKeys` funciona e está confirmado na API, mas exige uma segunda leitura (enumerar chaves, depois `multiGet`) a cada drenagem e não resolve sozinho o problema de "múltiplas sessões independentes não se bloqueiam" (ainda precisaria orquestrar N leituras). Documento único com sub-filas por `sessionLogId` no mesmo array atinge o mesmo resultado com 1 leitura/1 escrita por ciclo |
| `@react-native-community/netinfo` para saber se há rede antes de tentar | Tentativa direta + classificação do erro pós-falha | Descartado explicitamente pelo D-03 — dependência nativa nova. A classificação de erro já distingue transporte de servidor sem precisar saber "há rede" a priori |

**Installation:** nenhuma — todas as dependências já estão em `package.json`.

## Package Legitimacy Audit

Não aplicável. Esta fase não introduz nenhum pacote novo (D-03 proíbe dependência nativa
nova; D-09 reusa AsyncStorage já instalado; D-15 usa apenas TypeScript/Zustand já
presentes). Nenhum `npm install` é esperado nos planos desta fase — se um plano propuser
instalar algo, isso contradiz o CONTEXT.md e deve voltar para discussão com o dono antes de
prosseguir.

## Architecture Patterns

### System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  UI — ActiveSessionScreen.tsx                                           │
│  toca "concluir série" / "recusar" / "trocar modalidade" / "finalizar"  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 │ chama a action do store (mesma API pública)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  activeSessionStore.ts (Zustand) — completeSet/skipExercise/…           │
│  1. aplica a mudança OTIMISTA no draft (D-05: série "done" na hora)     │
│  2. monta o item de fila (payload + chave natural D-13)                 │
│  3. chama enqueueAndDrain(item)  ──────────────┐                        │
│  4. observa pendingCount/quarantineCount        │  (selo de pendência)   │
└──────────────────────────────────────────────────┼──────────────────────┘
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  sessionOutboxDrain.ts (src/services/) — orquestrador de I/O            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. loadOutbox(userId)  ← sessionOutboxStorage.ts (AsyncStorage)  │   │
│  │ 2. nextDrainable(state, now)  ← sessionOutboxPolicy.ts (PURO)    │   │
│  │       decide: por sessionLogId, o item na cabeça de CADA         │   │
│  │       sub-fila que não está em cooldown de backoff               │   │
│  │ 3. para cada item elegível: chama a RPC via sessionExecution-    │   │
│  │    Repository.ts (contrato intocado, D-02)                       │   │
│  │ 4. classifica erro: isTransportSessionExecutionError +           │   │
│  │    allowlist de códigos definitivos (P0005/42501/22023/22004)    │   │
│  │       ├─ sucesso            → remove item, segue para o próximo  │   │
│  │       ├─ transporte/timeout → mantém item, agenda backoff        │   │
│  │       ├─ código definitivo  → move para quarentena, segue        │   │
│  │       └─ idade > 7 dias     → move para quarentena, segue        │   │
│  │ 5. persiste o novo estado   ← sessionOutboxStorage.ts             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
        save_set_log   update_set_log_adaptation  finish_session
        skip_session_exercise / unskip_session_exercise / swap_session_exercise
                 (sessionExecutionRepository.ts — RPCs Supabase existentes)
                                 │
                                 ▼
                    Postgres: guardas 0005 (first-write-wins)
                              0036 (P0005, troca × série gravada)

Gatilhos de drenagem (chamam sessionOutboxDrain.drainAll(userId)):
  (a) logo após enqueueAndDrain (D-03: tentativa imediata)
  (b) AppState → 'active' (useSessionOutboxDrain hook, molde de useDiaLocal.ts:40)
  (c) timer de backoff por item (D-03: retry com backoff)
```

### Recommended Project Structure

```
src/
├── engine/
│   ├── sessionOutboxPolicy.ts   # NOVO — puro: dedupe (D-13), FIFO por sessionLogId (D-04),
│   │                             # backoff, classificação idade→quarentena (D-11), seleção
│   │                             # do próximo item drenável por sub-fila
│   └── config.ts                 # EDITADO — nova seção OUTBOX_CONFIG (backoff, maxAgeDays,
│                                  # quarantineRetentionDays), mesmo padrão de ADAPT_CONFIG/
│                                  # REPLAN_CONFIG já existentes
├── services/
│   ├── sessionOutboxStorage.ts  # NOVO — I/O puro: AsyncStorage, chave por usuário,
│   │                             # withKeyQueue, version no JSON (molde de sessionDraftStorage.ts)
│   ├── sessionOutboxDrain.ts    # NOVO — orquestra policy + storage + repository;
│   │                             # único ponto que decide "chamar a RPC agora"
│   └── sessionExecutionRepository.ts  # INTOCADO no contrato — consumido pelo drain,
│                                        # não mais chamado direto pelo store (exceto
│                                        # startSessionLog, fora de escopo)
├── hooks/
│   └── useSessionOutboxDrain.ts # NOVO — AppState listener (molde de useDiaLocal.ts),
│                                  # monta uma vez perto da raiz (App.tsx/RootNavigator),
│                                  # não dentro de ActiveSessionScreen (D-10: "fila é do
│                                  # usuário, não da tela")
└── store/
    └── activeSessionStore.ts     # EDITADO — completeSet/skipExercise/unskipExercise/
                                    # swapExercise/finishSession passam a enfileirar em vez
                                    # de aguardar a RPC direto; expõe pendingCount/selo
```

### Pattern 1: Documento único por usuário com sub-filas por `sessionLogId`

**What:** Uma chave AsyncStorage por usuário (`@session_outbox_${userId}`) guarda
`{ version: 1, items: OutboxItem[], quarantine: QuarantineItem[] }`. `items` preserva a
ordem de inserção (array = FIFO natural); cada item carrega `sessionLogId` e o tipo de
operação. A política (`nextDrainable`) agrupa `items` por `sessionLogId` em memória e
devolve, para CADA grupo, só a cabeça (o item mais antigo daquele grupo que não esteja em
cooldown de backoff).

**When to use:** Sempre que a UI ou o gatilho de `AppState` pedir uma passada de drenagem.

**Example:**
```typescript
// src/engine/sessionOutboxPolicy.ts (esboço — nomes sujeitos ao Claude's Discretion do D-15)
export type OutboxItemKind =
  | 'save_set_log'
  | 'update_set_log_adaptation'
  | 'skip_session_exercise'
  | 'unskip_session_exercise'
  | 'swap_session_exercise'
  | 'finish_session';

export type OutboxItem = {
  id: string; // chave natural serializada — ver D-13, tabela abaixo
  sessionLogId: string;
  kind: OutboxItemKind;
  payload: unknown; // shape específico do kind — nunca `any` em runtime, narrow por kind
  enqueuedAt: string; // ISO — base da expiração por idade (D-11)
  nextAttemptAt: string; // ISO — cooldown de backoff; enqueuedAt no primeiro enfileiramento
  attempts: number; // só telemetria/log — NUNCA critério de desistência (D-11 é por idade)
};

/** Cabeça de CADA sub-fila (por sessionLogId) que não está em cooldown agora. */
export const nextDrainable = (items: readonly OutboxItem[], nowISO: string): OutboxItem[] => {
  const heads = new Map<string, OutboxItem>();
  for (const item of items) {
    if (!heads.has(item.sessionLogId)) heads.set(item.sessionLogId, item); // primeira ocorrência = mais antiga (ordem de inserção)
  }
  return [...heads.values()].filter((item) => item.nextAttemptAt <= nowISO);
};
```

### Pattern 2: Chave de identidade por tipo (D-13) — tabela completa

O CONTEXT.md (D-13) dá 3 buckets; a tabela abaixo estende para as 6 operações do D-01,
preenchendo a lacuna (ver "Open Questions" para o porquê de `update_set_log_adaptation` ser
o caso especial):

| `kind` | Chave natural (`id`) | RPC | Payload mínimo |
|---|---|---|---|
| `save_set_log` | `${sessionLogId}:set:${plannedSetId}` | `save_set_log` | tudo que `saveSetLog(params)` já recebe hoje (`sessionExecutionRepository.ts:420-434`) |
| `update_set_log_adaptation` | `${sessionLogId}:set:${plannedSetId}:adapt` | `update_set_log_adaptation` | `plannedSetId` (não `setLogId` — ver Open Questions), `adaptation`, `decision` |
| `skip_session_exercise` | `${sessionLogId}:exercise:${plannedExerciseId}` | `skip_session_exercise` | `reason`, `note` |
| `unskip_session_exercise` | `${sessionLogId}:exercise:${plannedExerciseId}` | `unskip_session_exercise` | — |
| `swap_session_exercise` | `${sessionLogId}:exercise:${plannedExerciseId}` | `swap_session_exercise` | `toModality`, `note` |
| `finish_session` | `${sessionLogId}:finish` | `finish_session` | — |

Reenfileirar o MESMO alvo (mesma `id`) é no-op — substitui o payload do item existente em
vez de duplicar (D-13: "Enfileirar de novo o mesmo alvo é no-op"). `skip`/`unskip` do MESMO
exercício têm chaves iguais mas payloads/RPCs diferentes — o no-op vale para o mesmo `kind`
+ mesmo alvo, não entre `skip` e `unskip` (são operações opostas, ambas legítimas na fila se
o aluno mudar de ideia rápido).

### Pattern 3: Classificação retry × quarentena por allowlist, não denylist

**What:** `isTransportSessionExecutionError` só distingue "sem resposta HTTP" (`kind:
'transport'`, `status === 0`) de "houve resposta HTTP" (`kind: 'server'`)
`[VERIFIED: src/services/sessionExecutionRepository.ts:100-115]`. Um 5xx do PostgREST tem
`kind: 'server'` mas NÃO é definitivo — é exatamente o tipo de falha transitória que a fila
existe para absorver. D-14 lista os códigos que SÃO definitivos (`P0005`, `42501`,
`22023`) — a leitura correta é allowlist: só esses códigos (mais os que a leitura do
código-fonte abaixo confirma) removem o item para quarentena na hora; qualquer outro erro
de `kind: 'server'` (5xx sem `.code`, código desconhecido, etc.) fica retentável até a
expiração por idade (D-11) — nunca quarentena imediata por default, porque D-06 tornou a
quarentena SILENCIOSA na tela (perder um item por engano de classificação é invisível ao
aluno).

**When to use:** Toda vez que o drain recebe um erro do repository.

**Codes confirmados por leitura das migrations desta fase** (verbatim, com o `raise
exception` que os produz):

- `[VERIFIED: supabase/migrations/0005_set_log_first_write_wins.sql:86-88]` — `save_set_log`:
  `"raise exception 'planned_set_id não pode ser nulo' using errcode = '22004';"` (não deve
  ocorrer vindo do cliente correto — defensivo, tratar como definitivo)
- `[VERIFIED: supabase/migrations/0005_set_log_first_write_wins.sql:98-101]` — `save_set_log`:
  `"raise exception 'session_log % inexistente ou alheio', p_session_log_id using errcode = 'P0002';"`
- `[VERIFIED: supabase/migrations/0005_set_log_first_write_wins.sql:103-106]` — `save_set_log`:
  `"raise exception 'session_log % já finalizado; não aceita novas séries', p_session_log_id using errcode = 'P0001';"`
  (já tratado hoje via `isClosedSessionError`, `activeSessionStore.ts:267-268` — comportamento
  especial, não é quarentena simples: fecha a sessão local, ver Pitfall 3)
- `[VERIFIED: supabase/migrations/0005_set_log_first_write_wins.sql:108-118]` — `save_set_log`:
  `"raise exception 'planned_set % não pertence ao session_log %', ... using errcode = '42501';"`
- `[VERIFIED: supabase/migrations/0036_guarda_set_log_troca_cardio.sql:63-64]` —
  `swap_session_exercise`: `"raise exception 'autenticação obrigatória' using errcode = '42501';"`
- `[VERIFIED: supabase/migrations/0036_guarda_set_log_troca_cardio.sql:69-72]` —
  `swap_session_exercise`: `"raise exception 'modalidade de troca inválida: %', ... using errcode = '22023';"`
- `[VERIFIED: supabase/migrations/0036_guarda_set_log_troca_cardio.sql:134-137]` —
  `swap_session_exercise`: `"raise exception 'exercício % já tem série registrada nesta sessão; troca de modalidade recusada', ... using errcode = 'P0005';"`
  (a guarda que D-14 cita nominalmente)

**Example:**
```typescript
// src/engine/sessionOutboxPolicy.ts (esboço)
const DEFINITIVE_CODES = new Set(['P0005', '42501', '22023', '22004', 'P0002']);
// P0001 (sessão fechada) é tratado à parte — ver Pitfall 3, não é quarentena comum.

export const isDefinitiveRejection = (code: string | null): boolean =>
  code !== null && DEFINITIVE_CODES.has(code);
```

### Anti-Patterns to Avoid

- **Fila como estado do Zustand store:** guardar o array de itens pendentes DENTRO de
  `useActiveSessionStore` engordaria ainda mais um arquivo de 1570 linhas já apontado como
  frágil (`CONCERNS.md`) e misturaria I/O (persistência AsyncStorage) com orquestração de
  tela — viola D-15 explicitamente. O store só deve expor um resumo derivado (contagem
  pendente/quarentena) para o selo de pendência.
- **Drenagem disparada de dentro de `ActiveSessionScreen.tsx`:** o gatilho de `AppState`
  (D-03) e a semântica "fila do usuário, não da tela" (D-10) exigem que a drenagem funcione
  mesmo com o aluno fora da tela de treino (ex.: abriu o app na aba Progresso). O hook deve
  montar perto da raiz (`App.tsx`/`RootNavigator`), não dentro da tela de sessão.
- **Backoff por contagem de tentativas:** D-11 é explícito — desistência é por IDADE, nunca
  por número de tentativas. Um contador de `attempts` pode existir para telemetria, mas
  NUNCA deve alimentar a decisão de quarentena.
- **Tratar qualquer erro `kind: 'server'` como definitivo:** ver Pattern 3 acima — isso
  quarentenaria silenciosamente (D-06) uma falha 5xx transitória do Supabase, perdendo dado
  do aluno sem qualquer sinal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enumerar sessões pendentes de um usuário | Índice separado (`@outbox_index_<userId>` com lista de `sessionLogId`s, mantido manualmente em paralelo aos documentos) | Documento único por usuário (Pattern 1) — a lista de sessões pendentes é derivada em memória agrupando `items` por `sessionLogId`, sempre consistente porque é a MESMA leitura/escrita atômica | Um índice mantido à parte pode dessincronizar (escrita no documento sem atualizar o índice, ou vice-versa) — exatamente a classe de bug que motivou reescrever a fila do zero |
| Serializar escritas concorrentes no storage da fila | Lock manual com `Promise`/flag global | `withKeyQueue` já existe e está testado em produção (`sessionDraftStorage.ts:19-36`) | Reimplementar o mesmo padrão é retrabalho e superfície nova de bug de concorrência |
| Classificar erro de rede × erro de servidor | Nova heurística (`error.message.includes('fetch')` etc.) | `isTransportSessionExecutionError` + `SessionExecutionRequestError.code` (já existe, já usado no store, D-14 manda reusar) | Reimplementar duplicaria a lógica e divergiria com o tempo — a mesma classe de bug que a Fase 3 já resolveu para `isReplanTransportError` |
| Timeout de RPC que sempre libera a trava | Novo wrapper de `AbortController` | `withTimeout` + `RPC_TIMEOUT_MS` já existem em `activeSessionStore.ts:215-265`, comentado como "exportado para o teste exercitar o limite" | O comentário do próprio código documenta que o `finally` sempre roda mesmo com timeout — reescrever arrisca perder essa garantia |
| Vocabulário de motivo de recusa / modalidade de cardio no payload da fila | Nova checagem de string | `isSkipReason` (`src/engine/sessionModel.ts:57-58`) e `isCardioModalidade` (já usados em `sessionExecutionRepository.ts`) | Os vocabulários já espelham as guardas do banco (`_forca_motivo_recusa_valido`, `_forca_modalidade_cardio_valida`) — divergir vira `22023` na drenagem |

**Key insight:** Toda a "primitiva difícil" desta fase (serialização de escrita local,
classificação de erro, timeout que sempre libera lock, vocabulário fechado) já existe e já
está testada em produção. O trabalho real é composição — orquestrar essas primitivas numa
nova camada — não invenção de mecanismo novo.

## Common Pitfalls

### Pitfall 1: `update_set_log_adaptation` precisa de um `setLogId` que só existe depois que `save_set_log` drena

**What goes wrong:** O payload de `updateSetLogAdaptation(setLogId, adaptation, decision)`
(`sessionExecutionRepository.ts:509-528`) exige `setLogId` — o `id` que o Postgres só
devolve DEPOIS que `save_set_log` insere a linha. Com escrita otimista (D-05), o item de
adaptação pode ser enfileirado ANTES de `save_set_log` ter sido de fato confirmado pelo
servidor (o item de `save_set_log` correspondente ainda está na fila, talvez em cooldown de
backoff). Serializar o item de adaptação com um `setLogId` vazio/inventado não é opção
("sem dado inventado", `.planning/PROJECT.md`).

**Why it happens:** D-13 não lista uma chave de identidade para
`update_set_log_adaptation` — só para série, recusa/troca e finalização. É uma lacuna real
do CONTEXT.md, não uma decisão implícita.

**How to avoid:** Duas opções, ambas compatíveis com D-01/D-02 (nenhuma RPC nova):
1. **Resolução tardia por FIFO estrito (recomendado):** o item de adaptação guarda
   `plannedSetId` (não `setLogId`) no payload. Como a ordem é FIFO por `sessionLogId`
   (D-04), o item de `save_set_log` do MESMO `plannedSetId` sempre drena antes (foi
   enfileirado antes, no mesmo `completeSet`). No momento de drenar o item de adaptação, o
   drain resolve `setLogId` olhando o resultado do item de `save_set_log` que acabou de
   confirmar NESTA MESMA passada, ou — se a passada for outra (app reaberto depois) —
   lendo `draft.exercises[].sets[].setLogId` do rascunho local já reconciliado, ou, no pior
   caso, chamando `getOpenSessionLog` (RPC que já existe, já é chamada na retomada) para
   obter o `set_logs.id` pelo `planned_set_id`.
2. **Item composto:** um único item de fila que executa `save_set_log` e, se houver
   decisão de adaptação, encadeia `update_set_log_adaptation` dentro do MESMO handler de
   drenagem (sem persistir como dois itens separados). Mais simples de raciocinar, mas
   quebra a granularidade "um item = uma chamada" que o resto do desenho assume.

Esta é uma decisão de planejamento em aberto — ver "Open Questions".

### Pitfall 2: allowlist de código definitivo errada vira perda de dado silenciosa

**What goes wrong:** Se o classificador tratar qualquer erro sem `.code` reconhecido (ex.:
503 do Supabase, erro de parsing do PostgREST) como quarentena "por segurança", o item
some da fila sem nunca mais tentar — e D-06 torna isso silencioso na tela. O aluno nunca
saberia que uma série sumiu.

**Why it happens:** É tentador tratar "não sei classificar" como definitivo para não
deixar a fila crescer sem fim. É o caminho errado.

**How to avoid:** Allowlist estrita (Pattern 3) — só os códigos confirmados por leitura das
migrations (`P0001` tratado à parte, `P0002`, `P0005`, `42501`, `22023`, `22004`) vão
direto para quarentena. Qualquer outro erro de servidor ou de transporte fica retentável
até a expiração por idade do D-11 (7 dias candidato) — a quarentena "por idade" é o
backstop, não a classificação otimista de código desconhecido.

### Pitfall 3: `P0001` (sessão já finalizada) não é quarentena comum — é reconciliação de estado

**What goes wrong:** Hoje, `completeSet` trata `P0001` (`isClosedSessionError`,
`activeSessionStore.ts:267-268,1380-1386`) fechando a sessão local (`status: 'finished'`) e
chamando `retireLocalDraft`. Se a fila tratar `P0001` como "só mais um código definitivo →
quarentena", o item some mas o draft local continua achando que a sessão está `'active'` —
o aluno ficaria numa tela de treino "ativo" que o servidor já considera finalizado, sem
nenhum sinal (quarentena é silenciosa, D-06).

**Why it happens:** `P0001` está na mesma família sintática dos outros `raise exception`
com código próprio, mas semanticamente é diferente: os outros dizem "este item específico é
inválido"; `P0001` diz "esta SESSÃO INTEIRA mudou de estado, todos os itens pendentes dela
são obsoletos".

**How to avoid:** Ao encontrar `P0001` durante a drenagem de QUALQUER item de uma sessão, o
drain deve: (1) descartar TODOS os itens pendentes daquela `sessionLogId` (não só o item
que falhou — nenhum outro vai ter sucesso, a sessão está fechada), (2) disparar a mesma
reconciliação que `completeSet` já faz hoje (fechar o draft local, `retireLocalDraft`), (3)
não silenciar — isso é estado descoberto, não recusa de item, então o comportamento visível
atual (fechar a tela como finalizada) deve ser preservado, não substituído pelo silêncio do
D-06 (que é sobre item recusado, não sobre sessão inteira mudando de estado).

### Pitfall 4: cooldown de backoff que respeita FIFO mas ainda assim atrasa uma sessão inteira

**What goes wrong:** Com FIFO estrito por sessão (D-04), se o item na CABEÇA de uma
sessão está em cooldown de backoff (ex.: falhou há 10s, próxima tentativa em 30s), NENHUM
outro item daquela sessão pode drenar, mesmo que sejam operações independentes na prática
(ex.: séries de exercícios diferentes). Isso é uma escolha correta e intencional (D-04:
"preservando a causalidade que as guardas 0005/0036 esperam"), mas se implementado sem
cuidado pode se espalhar por engano para BLOQUEAR outras sessões também.

**Why it happens:** É fácil escrever `nextDrainable` como "primeiro item elegível da fila
inteira" em vez de "primeiro item elegível de CADA sub-fila por sessão" — a diferença entre
os dois é exatamente a diferença entre D-04 (correto, por sessão) e uma violação de D-10
("Começar treino novo não espera nada").

**How to avoid:** A política (Pattern 1) deve agrupar por `sessionLogId` ANTES de aplicar o
filtro de cooldown — testar explicitamente com um teste unitário puro (D-16 nível 1): duas
sessões, uma com item em cooldown, a outra sem — a segunda deve aparecer em
`nextDrainable`, a primeira não.

### Pitfall 5: escrita otimista (D-05) muda o contrato de retorno de `completeSet`

**What goes wrong:** Hoje `completeSet` retorna `Promise<boolean>` e o chamador (UI) usa o
retorno para saber se deu certo (`activeSessionStore.ts:100`: "Store actions return
Promise<boolean> for success/failure"). Com D-05, a série é marcada `'done'` ANTES de
qualquer confirmação de rede — `completeSet` teria que retornar `true` quase sempre
(exceto falhas de validação local, ex.: `canCompleteSet` falso), porque o "sucesso" agora é
local, não mais o resultado da RPC. Isso muda a semântica do valor de retorno para
qualquer teste/tela que dependa dele.

**Why it happens:** É uma consequência direta e correta de D-05, mas é fácil esquecer de
atualizar os ~35KB de `__tests__/activeSessionStore.test.ts` que hoje testam o caminho
"RPC falha → `completeSet` retorna `false`" como comportamento principal — esse teste
precisa ser reescrito para refletir "RPC falha → item fica pendente na fila, mas
`completeSet` já retornou `true`", preservando só o teste de regressão explícito que este
próprio ciclo de debug já escreveu
(`__tests__/completeSetAdaptacaoNaoDerruba.test.ts:237-248`, "falha REAL de rede continua
sendo reportada" — ESTE teste específico precisa ser revisto/substituído, porque ele afirma
exatamente o comportamento PRÉ-fase que o REQ-07 substitui).

**How to avoid:** Tratar a reescrita de `__tests__/activeSessionStore.test.ts` e de
`__tests__/completeSetAdaptacaoNaoDerruba.test.ts` (o teste "falha REAL de rede continua
sendo reportada") como parte explícita do escopo do plano, não como efeito colateral
descoberto tarde.

## Code Examples

### Storage da fila — esboço no molde do `sessionDraftStorage.ts`

```typescript
// src/services/sessionOutboxStorage.ts (esboço — nomes por conta do D-15)
// Fase 4 — Fila DURÁVEL de mutações de execução pendentes de envio. Diferente de
// sessionDraftStorage.ts (cache de retomada): aqui, perder o dado é perder um
// registro de treino que o servidor nunca viu. Storage PRÓPRIO — nunca compartilha
// chave com o draft, porque clearDraft() apaga o draft ao finalizar
// (activeSessionStore.ts:346, :1616) e destruiria itens não enviados.

import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string): string => `@session_outbox_${userId}`;

export type OutboxDocument = {
  version: 1;
  items: OutboxItem[];
  quarantine: QuarantineItem[];
};

const keyQueues = new Map<string, Promise<void>>(); // mesmo padrão de withKeyQueue

export const loadOutbox = async (userId: string): Promise<OutboxDocument> => {
  /* ...parseia; version !== 1 ou corrompido => documento vazio, nunca lança */
};

export const saveOutbox = async (userId: string, doc: OutboxDocument): Promise<void> => {
  /* ...withKeyQueue(keyFor(userId), () => AsyncStorage.setItem(...)) */
};
```

### Integração no store — `completeSet` otimista (esboço conceitual)

```typescript
// src/store/activeSessionStore.ts — completeSet, reescrito conceitualmente
// (NÃO literal — o código real de validação/CAS/reentrância de hoje continua
// valendo; isto ilustra só a MUDANÇA: onde a RPC direta vira enfileiramento)

completeSet: async (exerciseId, setOrder) => {
  // ...validação local igual a hoje (canCompleteSet, reentrância, CAS)...

  // ANTES: const saved = await withTimeout((signal) => saveSetLog(params, signal), RPC_TIMEOUT_MS);
  // DEPOIS:
  const item = buildSaveSetLogItem({ sessionLogId: sid, plannedSetId: serie.plannedSetId, ...params });
  await enqueueAndDrain(draft.userId, item); // durável primeiro (D-12: falha de AsyncStorage não bloqueia), drena em seguida

  // Commit OTIMISTA do draft — série "done" na hora (D-05), sem esperar confirmação.
  // O `saved.setLogId`/`saved.completedAt` de hoje não existem ainda; ficam null até a
  // drenagem confirmar e reconciliar o draft (mesmo caminho de applyServerSetLogs).
  const novo = withSet(atual, exerciseId, setOrder, (s) => ({ ...s, status: 'done', /* ... */ }));
  set({ draft: novo, saveError: null }); // NUNCA saveError aqui — D-05
  return true;
},
```

### Gatilho de `AppState` — molde de `useDiaLocal.ts`

```typescript
// src/hooks/useSessionOutboxDrain.ts (esboço)
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { drainAll } from '../services/sessionOutboxDrain';

export const useSessionOutboxDrain = (userId: string | null): void => {
  useEffect(() => {
    if (!userId) return;
    void drainAll(userId); // drena ao montar (cobre reabertura do app, D-10/critério #3)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainAll(userId); // mesmo padrão de useDiaLocal.ts:40
    });
    return () => sub.remove();
  }, [userId]);
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Write-through síncrono por série (`await saveSetLog(...)` direto no `completeSet`) | Buffer local durável + drenagem agrupada/reenviada (outbox pattern) | Esta fase (REQ-07) | Soluço de rede não interrompe o treino nem aparece como erro; UAT decisivo é modo avião no meio de um treino (D-16 nível 3) |
| — (padrão geral da indústria) | Outbox pattern para mobile offline-first: fila persistida ANTES de tentar rede, idempotência por chave derivada da intenção da operação (não por contador de tentativa), backoff exponencial com jitter para evitar carga concentrada no reconecte, item "envenenado" isolado (dead-letter/quarentena) sem travar o resto da fila `[CITED: web search — múltiplas fontes convergentes sobre outbox mobile, ago/2026]` | prática consolidada, não uma novidade desta fase | Confirma que o desenho já locked no CONTEXT.md (D-04 FIFO+quarentena, D-11 expiração por idade, D-13 chave natural) está alinhado com o padrão de mercado — nenhuma mudança de abordagem sugerida pela pesquisa externa |

**Deprecated/outdated:** nenhum código a aposentar nesta fase além do caminho síncrono
descrito acima — `sessionExecutionRepository.ts` (as próprias RPCs) permanece intocado.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Um documento único por usuário (`@session_outbox_<userId>`) é a granularidade de storage recomendada para D-09, em vez de um documento por `sessionLogId` (leitura mais literal de "molde do sessionDraftStorage, chave por usuário+sessão"). | Summary, Pattern 1, "Alternatives Considered" | Se o planner/dono preferir sharding por sessão, a lógica de enumeração de sessões pendentes precisa de `AsyncStorage.getAllKeys()` + prefixo — mais leituras por ciclo de drenagem, mas tecnicamente viável (API confirmada); não é um bloqueio, só uma escolha de design diferente da recomendada |
| A2 | `update_set_log_adaptation` deve resolver `setLogId` tardiamente (via FIFO + `draft` reconciliado ou `getOpenSessionLog`), guardando `plannedSetId` no payload em vez de `setLogId`. | Pitfall 1 | Se o plano escolher a alternativa "item composto" (save+adapt no mesmo handler), a chave de identidade e o desenho de retry mudam — não é uma falha da pesquisa, é uma decisão de design que o CONTEXT.md não travou (D-13 não cobre este `kind`) |
| A3 | Backoff exponencial com jitter é a estratégia recomendada (prática de mercado citada no "State of the Art"), mas o valor exato dos parâmetros é 100% discretion do D-11/D-15 — nenhum número é travado aqui. | State of the Art, User Constraints (Claude's Discretion) | Nenhum — está explicitamente marcado como discretion, não decisão travada |
| A4 | `P0001` (sessão finalizada) precisa de tratamento especial na drenagem (descarta toda a sub-fila daquela sessão + reconcilia estado local), diferente da quarentena silenciosa comum do D-06/D-07. | Pitfall 3 | Se implementado como quarentena comum, o draft local ficaria dessincronizado do estado real do servidor sem nenhum sinal — risco médio, mas seria descoberto no nível 2 de prova do D-16 (harness contra Postgres real) antes de chegar a produção |

**Se esta tabela estiver vazia:** não está — 4 claims exigem confirmação do dono/planner
antes de virar decisão travada de plano, especialmente A2 (afeta diretamente o desenho de
`update_set_log_adaptation`, uma das 6 operações do escopo D-01).

## Open Questions

1. **Chave de identidade e resolução de dependência de `update_set_log_adaptation`**
   - What we know: é uma das 6 operações do D-01 e reusa `isTransportSessionExecutionError`
     como o resto (D-14); a RPC (`sessionExecutionRepository.ts:509-528`) exige `setLogId`,
     que só existe após o `save_set_log` correspondente confirmar no servidor.
   - What's unclear: D-13 não lista chave natural para este `kind`; não há decisão travada
     sobre "item composto" vs. "resolução tardia por FIFO" (Pitfall 1).
   - Recommendation: levar as duas opções da seção Pitfall 1 para o planner decidir
     explicitamente antes de gerar as tasks — não é ambiguidade que a implementação deva
     resolver ad-hoc no meio do código.

2. **Granularidade de storage: documento por usuário vs. sharded por `sessionLogId`**
   - What we know: D-09 diz "chave por usuário+sessão, no molde do
     `sessionDraftStorage.ts`"; `sessionDraftStorage.ts` usa `plannedSessionId`, não
     `sessionLogId`, como parte da chave (`keyFor(userId, plannedSessionId)`,
     `sessionDraftStorage.ts:13-14`); a fila precisa ser descobrível depois de
     `finish_session` (critério de sucesso #3), quando o draft (e o `plannedSessionId` em
     memória) já foi limpo.
   - What's unclear: se "sessão" em D-09 significa `plannedSessionId` (literal, mesma
     chave do draft) ou `sessionLogId` (o que os itens de fila realmente carregam, per
     D-13) — e se a resposta muda a recomendação A1 deste documento.
   - Recommendation: a Recomendação A1 (documento único por usuário, sub-filas em memória
     por `sessionLogId`) evita a pergunta por completo — não depende de decidir a
     granularidade de chave porque só há UMA chave (`userId`). Se o planner preferir
     shardear mesmo assim (ex.: por performance com muitos usuários ativos — não é o caso
     deste app), decidir explicitamente qual identificador ancora a chave antes de
     implementar.

3. **`skip_planned_session` (recusar a sessão inteira) fica fora da fila?**
   - What we know: D-01 lista exatamente 6 operações; `skipPlannedSession`
     (`activeSessionStore.ts:1595`, "não vou treinar hoje") NÃO está na lista.
   - What's unclear: se é uma omissão do CONTEXT.md ou uma exclusão deliberada (a RPC fecha
     o `session_log` em aberto — "a RPC fecha o session_log em aberto: sem isso a sessão
     ficaria recusada com log aberto", comentário em `activeSessionStore.ts:1592-1594` — e
     por isso pode ter sido considerada "não passível de soluço de rede no mesmo sentido",
     já que acontece tipicamente ANTES de qualquer série).
   - Recommendation: tratar como fora de escopo por leitura literal do D-01 (lista fechada,
     "Cobre save_set_log, update_set_log_adaptation, skip_session_exercise,
     unskip_session_exercise, swap_session_exercise e finish_session" — `04-CONTEXT.md:13-15`,
     sem `skip_planned_session`) — mas o planner deve confirmar essa leitura com o dono
     antes de excluir, porque "não vou treinar hoje" também pode falhar por rede na
     academia.

4. **Texto literal do erro em produção (ressalva aberta da sessão de debug) não bloqueia esta fase**
   - What we know: `STATE.md` registra que `errMsg` nunca exibe a palavra "TypeError" — a
     identidade entre o achado da causa-raiz (1) e o que o dono viu em produção segue sem
     prova (`.planning/debug/typeerror-envio-series-treino.md`, `ressalva_aberta`).
   - What's unclear: nada que afete esta fase — causa-raiz (1) já foi corrigida fora de
     escopo (STATE.md, "Pending Todos"); esta fase ataca causa-raiz (2), que é
     estruturalmente confirmada (ausência de fila) independente do texto literal do erro.
   - Recommendation: nenhuma ação necessária aqui; mencionado só para não reabrir a
     pergunta durante o planejamento desta fase.

## Environment Availability

Não aplicável — esta fase não introduz dependência externa nova (ferramenta, serviço,
runtime, CLI). Toda a infraestrutura necessária (`AsyncStorage`, `AppState`, Supabase RPC,
Jest, harness de integração Postgres local do `03-07-PLAN.md`) já está presente e
verificada no repositório.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` com preset `jest-expo` `[VERIFIED: package.json:89,109]` |
| Config file | `package.json` (bloco `jest`) para a suíte padrão; `jest.integration.config.js` para o harness contra Postgres real `[VERIFIED: jest.integration.config.js]` |
| Quick run command | `npx jest __tests__/sessionOutboxPolicy.test.ts -q` (nível 1, política pura) |
| Full suite command | `npx jest -q` (suíte padrão) + `npm run test:integration:pg` (nível 2, Postgres local) + `npx tsc --noEmit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-07 | Ordem FIFO por sessão, sem bloquear outras sessões (D-04, Pitfall 4) | unit | `npx jest __tests__/sessionOutboxPolicy.test.ts -x` | ❌ Wave 0 |
| REQ-07 | Backoff/expiração por idade, nunca por tentativas (D-11) | unit | `npx jest __tests__/sessionOutboxPolicy.test.ts -x` | ❌ Wave 0 |
| REQ-07 | Dedupe por chave natural (D-13) — reenfileirar mesmo alvo é no-op | unit | `npx jest __tests__/sessionOutboxPolicy.test.ts -x` | ❌ Wave 0 |
| REQ-07 | Allowlist de código definitivo → quarentena; resto retenta (Pitfall 2/3) | unit | `npx jest __tests__/sessionOutboxPolicy.test.ts -x` | ❌ Wave 0 |
| REQ-07 | Retry não duplica contra `0005` real; `P0005` da `0036` vira quarentena (D-16 nível 2) | integration | `npm run test:integration:pg` | ❌ Wave 0 — estende o harness do `03-07-PLAN.md` |
| REQ-07 | `completeSet` otimista: série "done" na hora, sem `saveError` de rede (D-05) | integration (store, mocks) | `npx jest __tests__/activeSessionStore.test.ts -q` | ✅ existe — precisa ser REESCRITO (Pitfall 5), não é gap de arquivo |
| REQ-07 | Fechar app com fila pendente e reabrir drena, inclusive após `finish_session` (critério de sucesso #3) | integration (store + storage, mocks de AsyncStorage) | novo arquivo dedicado | ❌ Wave 0 |
| REQ-07 | Modo avião no meio do treino (UAT, D-16 nível 3) | manual-only | — (sem automação possível para desligar rádio do aparelho) | manual-only — justificado: é o único nível que reproduz o sintoma real que originou a fase |

### Sampling Rate

- **Per task commit:** `npx jest <arquivo-do-módulo-tocado> -q` + `npx tsc --noEmit`
- **Per wave merge:** `npx jest -q` (suíte padrão completa) + `npm run test:integration:pg`
- **Phase gate:** suíte completa + harness de integração verdes + UAT modo avião manual
  antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `__tests__/sessionOutboxPolicy.test.ts` — cobre FIFO por sessão, backoff/idade,
      dedupe, allowlist de quarentena (nível 1 do D-16)
- [ ] `__tests__/sessionOutboxStorage.test.ts` — parse/version, `withKeyQueue`, falha de
      AsyncStorage não bloqueia (D-12)
- [ ] `__tests__/integration/sessionOutboxDrain.postgrest.test.ts` — estende o harness do
      `03-07-PLAN.md` (mesma trava de loopback, mesmo padrão de seed via `service_role`);
      prova retry sem duplicar contra `0005` real e `P0005` da `0036` virando quarentena
      (nível 2 do D-16)
- [ ] Reescrita de `__tests__/activeSessionStore.test.ts` (caminhos de `completeSet`,
      `skipExercise`, `unskipExercise`, `swapExercise`, `finishSession` que hoje esperam
      `false`/`saveError` em falha de rede — Pitfall 5) e de
      `__tests__/completeSetAdaptacaoNaoDerruba.test.ts` (o `describe` "falha REAL de rede
      continua sendo reportada", linhas 237-248, afirma o comportamento PRÉ-fase)
- [ ] Framework install: nenhum — Jest/`jest-expo`/`ts-jest` já cobrem os três níveis

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Camada nova isolada (`engine` puro / `services` I/O), sem novo trust boundary — a fila fala com a MESMA API (RLS por `auth.uid()`, JWT do usuário) que o repository já usa hoje |
| V5 Input Validation | yes | Allowlist de código de erro definitivo (Pattern 3) em vez de denylist; vocabulários fechados (`isSkipReason`, `isCardioModalidade`) reusados sem duplicar, mantendo paridade com as guardas do banco |
| V8 Data Protection | yes (sem mudança de postura) | Itens da fila e da quarentena guardam reps/carga/motivo de recusa em `AsyncStorage` sem criptografia — MESMA postura já aceita para `sessionDraftStorage.ts` (`sessionDraftStorage.ts:6`: "Reps/cargas não são segredo, então AsyncStorage... é suficiente"). Nenhuma nova categoria de dado sensível é introduzida; o motivo de recusa (`SkipReason`) já é um vocabulário fechado não-identificável isoladamente |
| V6 Cryptography | no | Nenhuma operação de fila envolve segredo/token novo — a autenticação continua sendo o JWT de sessão já gerenciado por `AuthContext`/`apiClient` |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reenvio duplicado de série após retry (rede caiu depois do INSERT, antes da resposta chegar ao cliente) | Tampering (integridade do dado) | Guarda `0005` (first-write-wins, `on conflict ... do update set planned_set_id = excluded.planned_set_id` — no-op que preserva a primeira linha) — já existe, a fila é desenhada CONTRA ela (D-02), nunca duplica a lógica no cliente |
| Item adulterado localmente no AsyncStorage antes de drenar (device rooteado/jailbroken) | Tampering | Nenhuma mitigação nova necessária — o mesmo risco já existe para `sessionDraftStorage.ts` hoje, e os CHECKs/vocabulários fechados do servidor (RIR 0–10, `SkipReason`, modalidade) validam no lado autoritativo independente do que o cliente envia |
| Item "envenenado" (payload que sempre falha) travando a fila inteira indefinidamente | Denial of Service (para o próprio usuário, não multi-tenant) | Quarentena por código definitivo (Pattern 3) + expiração por idade (D-11) — nenhum item pode bloquear a sub-fila da sessão para sempre |
| Confundir P0001 (sessão fechada) com recusa de item comum, gravando série em log já finalizado silenciosamente | Tampering / Elevation (escrever fora do estado esperado) | Tratamento especial de `P0001` na drenagem (Pitfall 3) — nunca silencioso, sempre reconcilia o estado local |

## Sources

### Primary (HIGH confidence)

- `src/store/activeSessionStore.ts` (lido integralmente, 1684 linhas) — fluxo de escrita
  atual, CAS/epoch, reentrância, `withTimeout`, tratamento de `P0001`
- `src/services/sessionExecutionRepository.ts` (lido integralmente, 968 linhas) — todas as
  6+1 RPCs, `SessionExecutionRequestError`, `isTransportSessionExecutionError`
- `src/services/sessionDraftStorage.ts` (lido integralmente) — molde de storage a copiar
- `src/hooks/useDiaLocal.ts` (lido integralmente) — molde de gatilho `AppState`
- `src/engine/config.ts` (lido integralmente) — onde `OUTBOX_CONFIG` deve entrar
- `src/engine/sessionModel.ts` (trecho lido) — `SkipReason`, `DraftSet`, `SetStatus`
- `supabase/migrations/0005_set_log_first_write_wins.sql` (lido integralmente) — guarda
  first-write-wins, códigos `P0001`/`P0002`/`22004`/`42501`
- `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` (lido integralmente) — guarda
  `P0005`, códigos `42501`/`22023`/`P0001`/`P0002`
- `supabase/migrations/0014_cardio_tempo_distancia.sql` (trecho lido) — assinatura vigente
  de `save_set_log` (10 params)
- `.planning/debug/typeerror-envio-series-treino.md` (lido integralmente) — inventário
  exaustivo do que NÃO existe hoje
- `.planning/phases/04-escrita-de-execu-o-de-treino-em-lote-e-offline-first/04-CONTEXT.md`
  (lido integralmente) — as 16 decisões travadas
- `.planning/phases/03-interc-mbio-de-modalidade-de-cardio/03-07-PLAN.md` (lido
  integralmente) — harness de integração real a estender no nível 2 do D-16
- `package.json` (lido integralmente) — versões confirmadas, ausência de dependências
  candidatas ao escopo
- `node_modules/@react-native-async-storage/async-storage/lib/typescript/types.d.ts` (grep
  dirigido) — confirma `getAllKeys`/`multiGet`/`multiSet`/`multiRemove` na API instalada
- `__tests__/completeSetAdaptacaoNaoDerruba.test.ts` (lido integralmente) — teste que
  precisa ser revisado (Pitfall 5)

### Secondary (MEDIUM confidence)

- WebSearch "offline-first mutation outbox queue pattern mobile app FIFO idempotency retry
  backoff" — confirma que o desenho já travado no CONTEXT.md (FIFO por unidade causal,
  idempotência por chave derivada da intenção, backoff com jitter, dead-letter isolado sem
  travar o resto) é consistente com a prática de mercado; nenhuma fonte única citável
  (agregado de múltiplos artigos de 2026), por isso classificado MEDIUM, não HIGH

### Tertiary (LOW confidence)

- Nenhuma — toda claim relevante foi verificada contra código vivo ou o CONTEXT.md.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova, tudo confirmado em `package.json` e na
  API instalada
- Architecture: HIGH para o que reusa código existente (storage, classificação de erro,
  reentrância); MEDIUM para o desenho novo de sub-filas por `sessionLogId` (recomendação
  original desta pesquisa, não uma decisão travada — ver Assumptions A1/A2)
- Pitfalls: HIGH — os 5 pitfalls vêm de leitura direta do código vivo (CAS/epoch, `P0001`,
  contrato de retorno de `completeSet`, dependência `setLogId`), não de especulação

**Research date:** 2026-08-12
**Valid until:** ~2026-09-11 (30 dias — nenhuma parte deste domínio é fast-moving; o código
que ancora as claims HIGH não deve mudar sem que uma nova sessão de pesquisa seja mais
barata que reler os mesmos arquivos)
