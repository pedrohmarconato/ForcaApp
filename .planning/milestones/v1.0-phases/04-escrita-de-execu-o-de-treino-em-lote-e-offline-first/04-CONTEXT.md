# Phase 4: Escrita de execução de treino em lote e offline-first - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning
**Source:** Discuss-phase com o dono — quatro áreas discutidas a fundo (Alcance da fila,
O que o aluno vê, Durabilidade e desistência, Identidade e dedupe), 16 decisões travadas.

<domain>
## Phase Boundary

**IN:** REQ-07 apenas — as escritas de execução de sessão ganham buffer local durável e
envio agrupado/reenviado, de modo que soluço de rede na academia não interrompa o treino
nem apareça ao aluno como falha. Cobre `save_set_log`, `update_set_log_adaptation`,
`skip_session_exercise`, `unskip_session_exercise`, `swap_session_exercise` e
`finish_session`.

**OUT:** `start_session` (permanece write-through síncrono, por decisão D-01); cardio,
alongamento e troca de modalidade (Fases 1–3, já entregues); geração de plano; treino
conjunto e seu Realtime; backend Flask; qualquer mudança de schema ou de assinatura de
RPC. Escopo não se estreita nem se alarga em silêncio.

**Origem:** sessão de debug `.planning/debug/typeerror-envio-series-treino.md`,
causa-raiz (2). A causa-raiz (1) do mesmo diagnóstico — `completeSet` conflando erro de
rede com erro de adaptação local — **já foi corrigida** e não faz parte desta fase.

## Success Criteria derivados (o ROADMAP ainda diz "TBD")

Derivados agora que a decisão de escopo (D-01) está fechada. O ROADMAP.md segue com `TBD`
no lugar — atualizar via `/gsd-phase` antes de planejar.

1. Com o aparelho sem rede no meio do treino, concluir uma série NÃO exibe erro: a série
   é marcada como concluída e o treino segue sem interrupção.
2. Restabelecida a rede, toda série registrada offline aparece no banco exatamente uma
   vez — reenvio não duplica (provado contra Postgres real, com a guarda 0005 viva).
3. Fechar o app com fila pendente e reabrir drena o que faltou, inclusive quando a sessão
   já foi finalizada.
4. Item recusado em definitivo pelo servidor (ex.: `P0005` da 0036) sai da fila, fica
   registrado localmente com motivo e NÃO trava a drenagem do restante.
5. Com rede boa, o comportamento observável do registro de séries é o mesmo de hoje.

</domain>

<decisions>
## Implementation Decisions

### Alcance da fila

- **D-01:** A fila cobre **tudo depois do start**. `start_session` continua write-through
  síncrono — é ele que devolve o `session_log_id` que ancora todo o resto. Entram na fila:
  `save_set_log`, `update_set_log_adaptation`, `skip_session_exercise`,
  `unskip_session_exercise`, `swap_session_exercise` e `finish_session`. Nenhuma mudança de
  contrato de RPC nem de schema.
- **D-02:** "Envio agrupado" do REQ-07 significa **agrupamento temporal**: a fila junta o
  pendente e drena em sequência chamando as RPCs que já existem. Nenhuma RPC nova em lote,
  nenhuma migration. As guardas `0005_set_log_first_write_wins.sql` (first-write-wins) e
  `0036_guarda_set_log_troca_cardio.sql` continuam sendo a fonte de verdade da
  idempotência — o cliente é desenhado CONTRA elas, não em paralelo.
  — **Reversibility:** costly — introduzir depois uma RPC de lote exige migration nova,
  preflight staging→prod e reimplementar as guardas 0005/0036 dentro dela.
- **D-03:** Gatilho de drenagem: tentativa imediata a cada escrita, backoff em caso de
  falha, e retorno do app ao primeiro plano (`AppState`, padrão já usado em
  `src/hooks/useDiaLocal.ts:11`). **Sem** `@react-native-community/netinfo` e sem
  `expo-network` — nenhuma dependência nativa nova (a Fase 03 fechou com o teste de build
  nativo iOS/Android ainda pendente).
- **D-04:** Ordem **FIFO estrita por sessão**, preservando a causalidade que as guardas
  0005/0036 esperam. Falha de rede mantém o item na fila e retenta. Recusa definitiva do
  servidor remove o item para **quarentena** e a fila segue drenando — um item envenenado
  não trava o registro do resto do treino.

### O que o aluno vê

- **D-05:** A série é marcada como concluída **na hora**, sem erro na tela. Um selo
  discreto de pendência (sem cor de erro, sem bloquear nada) indica que há registro a
  caminho. Substitui o comportamento atual, em que a série não é concluída e a mensagem
  crua do erro vai para a tela.
- **D-06:** Item em quarentena **não gera nada na tela** — apenas log.
  *Decisão do dono contra a recomendação apresentada.* Consequência aceita e registrada: o
  histórico do aluno pode divergir do que ele viveu, sem explicação na UI.
- **D-07:** O item recusado em definitivo **fica gravado localmente** com motivo e carimbo
  de tempo, e expira sozinho após um prazo. Fecha o ponto cego que o `CONCERNS.md` aponta
  ("comportamento deliberado, mas sem telemetria para medir a frequência") sem crescer sem
  teto no AsyncStorage.
- **D-08:** Finalizar o treino **não bloqueia**. A tela de fim aparece como hoje e a fila
  drena em segundo plano, inclusive na próxima abertura do app. Consequência aceita: por
  alguns instantes a sessão segue aberta no servidor e o histórico demora a refletir o
  treino.

### Durabilidade e desistência

- **D-09:** A fila mora em **storage próprio** (ex.: `src/services/sessionOutboxStorage.ts`),
  no molde de `src/services/sessionDraftStorage.ts`: chave por usuário+sessão,
  `withKeyQueue` serializando escritas da mesma chave, campo `version` no JSON para ignorar
  formato antigo. Motivo duro: `clearDraft` apaga o rascunho ao finalizar
  (`src/store/activeSessionStore.ts:346` e `:1616`) e destruiria registro não enviado.
  — **Reversibility:** costly — trocar de storage depois exige migrar dado local já gravado
  no aparelho dos alunos.
- **D-10:** A fila é **do usuário, não da tela**: drena na abertura do app, de qualquer
  sessão, sem exigir reabrir aquele treino. Começar treino novo não espera nada; itens
  antigos seguem à frente na ordem FIFO.
- **D-11:** Desistência **por idade, nunca por número de tentativas**. Retry indefinido com
  backoff enquanto o item for mais novo que o prazo (candidato: 7 dias). Vencido o prazo, o
  item vai para a mesma quarentena do D-07. O valor exato é constante nomeada —
  `src/engine/config.ts` é o lugar canônico do projeto para número tunável.
- **D-12:** Falha de `AsyncStorage` ao enfileirar **não bloqueia**: o item segue em memória
  e continua tentando pela rede; perde-se apenas a garantia de sobreviver ao app ser morto.
  Reaproveita `storageWarning`/`STORAGE_WARNING_MSG`, que aqui é literalmente verdadeiro (é
  sobre persistência local) — diferente do caso do motor de adaptação, onde o
  `ecc:typescript-reviewer` vetou reaproveitar a mesma string.

### Identidade e dedupe

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Origem e diagnóstico da fase
- `.planning/debug/typeerror-envio-series-treino.md` — causa-raiz (2), inventário exaustivo
  do que NÃO existe (nenhuma fila/outbox/retry para escritas de execução) e a ressalva
  aberta sobre o texto literal do erro em produção
- `.planning/ROADMAP.md` §"Phase 4" — goal, riscos conhecidos e os Success Criteria ainda
  marcados como `TBD` (substituir pelos derivados neste documento)

### Caminho de escrita que a fase reveste
- `src/store/activeSessionStore.ts` — `completeSet` (`:1178-1380`), trava de reentrância e
  CAS/epoch (`:1189-1191`), `clearDraft` na finalização (`:346`, `:1616`),
  `storageWarning`/`STORAGE_WARNING_MSG`
- `src/services/sessionExecutionRepository.ts` — todas as RPCs de execução;
  `SessionExecutionRequestError` (`:78`) e `isTransportSessionExecutionError` (`:112`)
- `src/services/sessionDraftStorage.ts` — molde a copiar: chave por usuário+sessão,
  `withKeyQueue`, `version` no parse; e o que NÃO é (cache de retomada, não fila)
- `src/screens/ActiveSessionScreen.tsx:397-404` — onde `saveError` vira texto na tela hoje
- `src/hooks/useDiaLocal.ts:11` — padrão de `AppState` já estabelecido no repo
- `src/engine/config.ts` — lugar canônico de número tunável

### Guardas de servidor (desenhar CONTRA elas, não em paralelo)
- `supabase/migrations/0005_set_log_first_write_wins.sql` — first-write-wins por
  `(session_log_id, planned_set_id)` e `start_session` idempotente por sessão planejada
- `supabase/migrations/0014_cardio_tempo_distancia.sql:163-177` — assinatura vigente de
  `save_set_log` (10 parâmetros)
- `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` — guarda CR-01 no servidor
  (`P0005`): recusa troca de modalidade quando já há série concluída

### Projeto e convenções
- `.planning/PROJECT.md` — restrições: sem CI (verificação local `tsc` + `jest` + `pytest`);
  sem dado inventado na UI; schema do plano é porta de mão única; dois projetos Supabase
- `.planning/codebase/ARCHITECTURE.md` — camadas (engine puro sem I/O → store fino →
  repository) e restrições arquiteturais
- `.planning/codebase/CONCERNS.md` — classe de bug "falhas de persistência engolidas como
  não-fatal" e `activeSessionStore.ts` como área frágil
- `.planning/codebase/TESTING.md` — suítes planas em `__tests__/`, apoio em `test-utils/`
- `.planning/codebase/CONVENTIONS.md` — nomes e estilo
- `.planning/phases/03-interc-mbio-de-modalidade-de-cardio/03-07-PLAN.md` — harness de
  integração real contra Postgres local, a reaproveitar no D-16
- `AGENTS.md` — regras de ambiente Supabase (staging `mjdjtiujhwklchalquhc` × produção
  `zanqygwsgxkyjiuhrzju`; conferir `supabase/.temp/project-ref`; `scripts/supabase-preflight.sh`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sessionDraftStorage.ts`: molde direto para o storage da fila — `withKeyQueue` (serializa
  escritas da mesma chave, impede que gravação antiga sobrescreva a nova), `parseDraft` com
  checagem de `version`, chave por usuário+sessão.
- `isTransportSessionExecutionError` + `SessionExecutionRequestError`: classificação de erro
  já pronta e já usada no store — é a linha divisória do D-14, não precisa nascer.
- Trava de reentrância `inFlight` por `${sessionLogId}:${plannedSetId}` e o short-circuit
  `status === 'done'`: já entregam a mesma semântica de dedupe que o D-13 quer na fila.
- `AppState` em `useDiaLocal.ts`: padrão de retorno ao primeiro plano, sem dependência nova.
- Harness de integração real contra Postgres local (`03-07-PLAN.md`): a única forma já
  provada no repo de exercitar guarda de servidor de verdade.

### Established Patterns
- Engine puro sem I/O (`src/engine/`) — a política da fila nasce como função pura + teste
  antes de qualquer I/O; `src/engine/` não pode importar storage nem rede.
- Repositórios encapsulam RPCs; nada de SQL ad-hoc do cliente.
- Store fino: orquestra, delega cálculo ao engine e I/O ao service.
- Número tunável em `config.ts`, nunca literal espalhado.
- Sem dado inventado na UI: sem amostra é "—", nunca "0".
- Suítes planas em `__tests__/`; módulo de apoio compartilhado vai em `test-utils/`, nunca
  dentro de `__tests__/`.

### Integration Points
- `activeSessionStore.ts` → hoje chama o repository direto em 9 pontos (`:682`, `:1238`,
  `:1351`, `:1429`, `:1453`, `:1497`, `:1544`, `:1595`, `:1636`); com o D-15, todos menos o
  `startSessionLog` (`:682`) passam a falar com a fila.
- `ActiveSessionScreen.tsx` — onde o selo de pendência do D-05 aparece e onde `saveError`
  deixa de ser acionado por falha de rede.
- Abertura do app (`App.tsx` / `AuthProvider`) — ponto de partida da drenagem do D-10.

</code_context>

<specifics>
## Specific Ideas

- O UAT que fecha a fase é com o aparelho em **modo avião no meio de um treino** — o dono
  escolheu explicitamente a barra que inclui esse teste manual, e não só o automatizado.
- Prazo candidato de expiração da fila: **7 dias** (valor final é constante nomeada).
- O dono escolheu deliberadamente a quarentena silenciosa (D-06) mesmo com a consequência
  apontada — registrar como decisão consciente, não como omissão a "consertar" depois.

</specifics>

<deferred>
## Deferred Ideas

- **React ErrorBoundary / handler global de exceção JS.** O diagnóstico
  (`.planning/debug/typeerror-envio-series-treino.md`, Evidence 00:35) constatou zero
  ocorrências de `ErrorBoundary`/`componentDidCatch`/`unhandledRejection`/`ErrorUtils` no
  app inteiro e classificou isso como "fator agravante — ausência de contenção". Categoria
  diferente (arquitetura do app, não escrita de sessão); vale fase própria.
- **RPC de escrita em lote no servidor** (`save_set_logs` transacional). Descartada agora
  pelo D-02; volta a fazer sentido se o volume de chamadas na drenagem virar problema
  medido. Exige migration e reimplementar as guardas 0005/0036 dentro dela.
- **Detector de conectividade explícito** (`@react-native-community/netinfo` ou
  `expo-network`). Descartado pelo D-03 para não somar dependência nativa enquanto o teste
  de build nativo da Fase 03 segue pendente.

</deferred>

---

*Phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first*
*Context gathered: 2026-08-11*
