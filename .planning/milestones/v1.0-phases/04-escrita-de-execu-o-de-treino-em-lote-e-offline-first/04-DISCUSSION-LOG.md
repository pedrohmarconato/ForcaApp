# Phase 4: Escrita de execução de treino em lote e offline-first - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-11
**Phase:** 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first
**Areas discussed:** Alcance da fila, O que o aluno vê, Durabilidade e desistência, Identidade e dedupe

---

## Alcance da fila

### Quais escritas de execução entram na fila local?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Tudo depois do start | `start_session` continua exigindo rede (devolve o `session_log_id`); série, adaptação, recusa, troca e finalização entram na fila. Sem tocar contrato de RPC nem schema. | ✓ |
| Só a série | Fila cobre apenas `save_set_log` + adaptação; recusa, troca e finalização seguem write-through. | |
| Ciclo inteiro, inclusive o start | Offline-first pleno; exige id gerado no cliente → migration, porta de mão única. | |

**Escolha do dono:** Tudo depois do start.
**Notas:** É a decisão de escopo que o dono adiou explicitamente em 10/08/2026 e que
destrava os Success Criteria da fase, hoje `TBD` no ROADMAP.

### "Envio agrupado" é drenar com as RPCs atuais ou uma RPC nova em lote?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Drenar com as RPCs atuais | Agrupamento temporal; chamadas sequenciais. Zero migration; guardas 0005/0036 intactas. | ✓ |
| RPC nova em lote | `save_set_logs(jsonb)` grava N séries numa transação; exige migration e reimplementar 0005/0036 dentro dela. | |

**Escolha do dono:** Drenar com as RPCs atuais.

### O que dispara a drenagem da fila?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Tentativa imediata + backoff | Cada escrita tenta na hora; falha reagenda com backoff; soma `AppState` (padrão de `useDiaLocal.ts:11`). Sem dependência nova. | ✓ |
| Detector de rede explícito | `@react-native-community/netinfo` ou `expo-network`; reage à reconexão, mas soma dependência nativa. | |
| Janela por tempo/quantidade | Acumula por N segundos ou N itens; muda o comportamento também no caminho feliz. | |

**Escolha do dono:** Tentativa imediata + backoff.
**Notas:** Medido durante a discussão — o repo não tem `NetInfo` nem `expo-network` hoje;
só `AsyncStorage` e o padrão de `AppState`.

### Ordem de drenagem e item recusado em definitivo

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| FIFO estrito + quarentena | Ordem preservada; falha de rede retenta; recusa definitiva sai para quarentena e a fila segue. | ✓ |
| FIFO estrito, item recusado trava a fila | Nunca grava algo cuja pré-condição falhou; um item envenenado interrompe o resto. | |
| Sem ordem, cada item por si | Esvazia mais rápido; pode inverter causalidade e ser recusado pela 0036. | |

**Escolha do dono:** FIFO estrito com quarentena.

---

## O que o aluno vê

### A série conta como concluída na hora — e o que aparece na tela?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Conta na hora, com indicador de pendência | Série vira `done` imediatamente; selo discreto mostra registro a caminho, sem cor de erro. | ✓ |
| Conta na hora, sem sinal nenhum | Fila invisível; o aluno não sabe que há coisa não salva. | |
| Conta na hora, sinal só no fim | Nada durante o treino; aviso apenas ao finalizar. | |

**Escolha do dono:** Conta na hora, com indicador de pendência.

### Quando o servidor recusa um item em definitivo (quarentena), o que o aluno vê?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Aviso no fim do treino, nomeando o que não entrou | Não interrompe a execução; ao finalizar, diz em linguagem de gente o que não foi registrado. *(recomendada)* | |
| Aviso discreto na hora | Honesto no tempo certo; interrompe visualmente por algo que o aluno raramente resolve ali. | |
| Só no log, nada na tela | `logger.warn` e telemetria; zero atrito; o histórico pode divergir do vivido sem explicação. | ✓ |

**Escolha do dono:** Só no log, nada na tela.
**Notas:** Escolha contra a recomendação apresentada, com a consequência já explicitada no
texto da opção. Registrada em CONTEXT.md (D-06) como decisão consciente do dono, com a
consequência nomeada — não como omissão a corrigir depois.

### O item recusado some depois do log, ou fica guardado?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Fica no disco para diagnóstico, expira depois | Nada na tela, mas gravado com motivo e carimbo de tempo; some sozinho após alguns dias. | ✓ |
| Descarta na hora, só `logger.warn` | Implementação mínima; mantém o ponto cego do `CONCERNS.md`. | |
| Fica no disco para sempre | Nada se perde; AsyncStorage cresce sem teto. | |

**Escolha do dono:** Fica no disco para diagnóstico, expira depois.

### Ao finalizar o treino com a fila ainda cheia?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Finaliza normal e drena em segundo plano | Tela de fim igual à de hoje; drena depois, inclusive na próxima abertura. | ✓ |
| Segura na tela de fim até esvaziar, com escape | Garante histórico completo; com rede ruim, o aluno espera na hora de ir embora. | |
| Finaliza normal, mas o selo de pendência continua visível | Não bloqueia e mantém o aluno informado depois do fim. | |

**Escolha do dono:** Finaliza normal e drena em segundo plano.

---

## Durabilidade e desistência

### Onde a fila durável mora?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Storage próprio, no molde do `sessionDraftStorage` | Chave por usuário+sessão, `withKeyQueue`, `version` no JSON. `clearDraft` apaga o rascunho ao finalizar e destruiria pendência. | ✓ |
| Dentro do rascunho existente | Menos código novo; exige mudar o contrato de `clearDraft` e mistura dois ciclos de vida. | |

**Escolha do dono:** Storage próprio.
**Notas:** Verificado no código durante a discussão — `clearDraft` é chamado em
`activeSessionStore.ts:346` e `:1616`, e a finalização passou a ser otimista (D-08).

### Pendência que sobreviveu ao fim do treino

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Fila do usuário, drena na abertura do app | De qualquer sessão, sem exigir reabrir o treino; treino novo não espera nada. | ✓ |
| Só drena com a sessão correspondente aberta | Escopo mais estreito; pendência de treino encerrado pode nunca mais ser tentada. | |
| Drena na abertura, e trava treino novo até esvaziar | Elimina dúvida de ordem; rede ruim no dia seguinte impediria o aluno de treinar. | |

**Escolha do dono:** Fila do usuário, drena na abertura do app.

### Quando a fila desiste de um item por falha de rede?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Nunca por tentativa, só por idade | Retry indefinido com backoff enquanto o item for mais novo que o prazo (candidato 7 dias); vencido, vai para quarentena. | ✓ |
| Teto de tentativas | Regra mais simples; descarta dado válido por azar de conectividade prolongada. | |
| Nunca desiste, nunca expira | Nada se perde; a fila cresce sem teto. | |

**Escolha do dono:** Nunca por tentativa, só por idade.

### Se o AsyncStorage falhar ao enfileirar?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Segue em memória e reaproveita o aviso de armazenamento | Item continua tentando pela rede; perde só a garantia de sobreviver ao app ser morto. | ✓ |
| Trata como falha de verdade e bloqueia a série | Nunca promete o que não pode cumprir; recria a interrupção que a fase existe para eliminar. | |
| Silencioso, só `console.warn` | Padrão atual; mantém o ponto cego. | |

**Escolha do dono:** Segue em memória e reaproveita o aviso de armazenamento.
**Notas:** Aqui a string `STORAGE_WARNING_MSG` é literalmente verdadeira — diferente do
caso do motor de adaptação, onde o `ecc:typescript-reviewer` vetou reaproveitá-la.

---

## Identidade e dedupe

### Qual é a identidade de um item na fila?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Chave natural por tipo de operação | Série = `(session_log_id, planned_set_id)`; recusa/troca = `(session_log_id, planned_exercise_id)`; finalização = `(session_log_id)`. | ✓ |
| UUID próprio por item | Mais genérico; permite dois itens para a mesma série e a 0005 descarta o segundo em silêncio. | |
| Híbrido: UUID para rastrear, chave natural para coalescer | Melhor rastreabilidade; dois conceitos de identidade no mesmo módulo. | |

**Escolha do dono:** Chave natural por tipo de operação.
**Notas:** Verificado no código — `completeSet` já trata série concluída como no-op
(`activeSessionStore.ts:1189`) e a trava de reentrância usa `${sessionLogId}:${plannedSetId}`,
a mesma chave da 0005. Não existe caminho de reeditar série concluída.

### Como a fila decide entre retentar e mandar para quarentena?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Reaproveitar `isTransportSessionExecutionError` | Transporte volta para a fila; resposta com código do Postgres (P0005, 42501, 22023) é definitiva. | ✓ |
| Lista explícita de códigos que retentam | Controle fino; mais uma lista para manter em sincronia com o banco. | |
| Retentar tudo menos códigos fatais conhecidos | Nunca descarta por classificação errada; item impossível ocupa a fila até vencer por idade. | |

**Escolha do dono:** Reaproveitar `isTransportSessionExecutionError`.

### Onde a fila entra na arquitetura?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Camada nova entre store e repository | Política pura em `src/engine/`, I/O em `src/services/`; repository e RPCs intactos; store não engorda. | ✓ |
| Dentro do repository | Menor diff; uma função que promete confirmação passaria a devolver "aceitei". | |
| Dentro do `activeSessionStore` | Sem arquivo novo; engorda o módulo já apontado como o mais frágil. | |

**Escolha do dono:** Camada nova entre store e repository.

### O que conta como prova de que a fase está pronta?

| Opção | Descrição | Escolhida |
|-------|-----------|-----------|
| Política pura + integração contra Postgres real + UAT em modo avião | Três níveis; o UAT é o único que reproduz o sintoma original. | ✓ |
| Política pura + integração contra Postgres real | Tudo automático; sem prova da experiência no aparelho. | |
| Política pura com repository mockado | Mais barato; não exercita nenhuma guarda de servidor. | |

**Escolha do dono:** Os três níveis, incluindo UAT em modo avião.

---

## Claude's Discretion

- Copy e forma exata do selo de pendência (respeitando: sem cor de erro, não bloqueante,
  sem dado inventado).
- Nomes de arquivos, funções e tipos, seguindo `CONVENTIONS.md`.
- Valor exato do backoff e do prazo de expiração, dentro da regra do D-11.
- Formato do registro de quarentena em disco, desde que carregue motivo, carimbo de tempo
  e expiração.
- Se a política pura vira módulo novo em `src/engine/` ou entra num existente.

## Deferred Ideas

- React ErrorBoundary / handler global de exceção JS (constatado ausente no diagnóstico de
  origem; categoria arquitetura do app, fase própria).
- RPC de escrita em lote no servidor (`save_set_logs` transacional) — descartada pelo D-02;
  reconsiderar se o volume de chamadas na drenagem virar problema medido.
- Detector de conectividade explícito (`netinfo`/`expo-network`) — descartado pelo D-03
  para não somar dependência nativa enquanto o teste de build nativo da Fase 03 segue
  pendente.
