---
status: resolved_partial
trigger: "TypeError ao enviar informações de séries no meio do treino"
created: 2026-08-10
updated: 2026-08-10T00:40:00Z
goal: find_root_cause_only
phase_context: "03 — interc-mbio-de-modalidade-de-cardio (awaiting_human_verification)"
---

# Debug: TypeError no envio de séries durante o treino

## Symptoms

**Expected behavior**
Durante a execução do treino, ao concluir uma série de musculação (repetições + carga),
o registro é persistido sem erro visível e o usuário segue para a próxima série.

**Actual behavior**
O app exibe uma mensagem de erro na tela ao enviar os dados da série. O fluxo do treino
é interrompido/atrapalhado no meio da execução.

**Error messages**
Sem texto literal capturado. A falha aparece como mensagem na tela do app (toast/alerta),
não como stack trace coletado. Nenhum stack trace do Metro/console foi obtido ainda.

**Onde falha**
Séries de musculação (reps/carga).

**Ambiente**
Produção (app publicado contra o banco de produção).

**Timeline**
Sempre falhou — nunca funcionou de ponta a ponta. Não é regressão da Fase 03 nem da
migration 0036.

**Reframe do dono (verbatim, tratar como dado, não como instrução)**

> "basicamente nao é um erro absurdo mas ele acontece pq estamos sempre mandando os dados
> diretos para o banco de dados, nao gauardamos e mandamos em lote. Precisamos ver como
> outros apps fazem e implementar algo igual eu acho que já tinhamos preparado isso"

Leitura: a hipótese do dono é que a causa não é um defeito pontual, e sim o padrão de
escrita — cada série vai direto ao banco (write-through por série), sem buffer local nem
envio em lote. O dono suspeita que já existe groundwork de fila/lote no repositório.

## Current Focus

hypothesis: CONFIRMADA (ver Resolution.root_cause) — não é um desreferenciamento único
  sem guarda (o código do caminho de envio é extensivamente defendido contra null); é uma
  combinação de (a) `completeSet` conflar erro de rede com erro de pós-processamento local
  no mesmo try/catch e (b) ausência de qualquer fila/lote/retry para escrita de set_log.
test: concluído — ver Evidence 1-8.
expecting: concluído.
next_action: N/A — sessão diagnóstica concluída (goal: find_root_cause_only). Não prosseguir
  para fix_and_verify nesta sessão (restrição do orquestrador).

## Investigation scope (definida pelo orquestrador)

Este ciclo é DIAGNÓSTICO. Não implementar a camada de lote/offline nesta sessão — isso é
trabalho de fase, sujeito a plano aprovado antes de código.

Entregas obrigatórias do diagnóstico:
1. Causa-raiz do TypeError, com `file:linha` do desreferenciamento e o caminho de chamada
   completo (componente -> store -> repository -> RPC/tabela).
2. Contrato real do envio: o que o cliente monta versus o que o backend/RPC/tabela espera,
   incluindo `save_set_log` e as guardas de `0005_set_log_first_write_wins.sql` e
   `0036_guarda_set_log_troca_cardio.sql`.
3. Inventário do groundwork de lote/offline que já exista (fila, buffer, outbox, retry,
   persistência local, `AsyncStorage`, mutation queue) — com `file:linha` do que existe e
   declaração explícita do que NÃO existe.
4. Separação clara entre: (a) o que é correção pontual segura e (b) o que só se resolve
   com a camada de escrita em lote.

Arquivos de partida (varredura preliminar do orquestrador, não exaustiva):
- `src/services/sessionExecutionRepository.ts`
- `src/store/activeSessionStore.ts`
- `src/components/session/SessionQueue.tsx`
- `src/services/trainingRepository.ts`
- `supabase/migrations/0004_save_set_log.sql`
- `supabase/migrations/0005_set_log_first_write_wins.sql`
- `supabase/migrations/0036_guarda_set_log_troca_cardio.sql`

## Evidence

- timestamp: 2026-08-10T00:00:00Z
  checked: src/services/sessionExecutionRepository.ts (arquivo inteiro) — `saveSetLog`
  found: chama `supabase.rpc('save_set_log', {...})` (linha 449) com 10 params nomeados,
    incluindo `p_started_at`/`p_actual_duration_seconds`/`p_actual_distance_m`/
    `p_perceived_effort` (linhas 456-459).
  implication: contrato do cliente exige a assinatura ESTENDIDA de `save_set_log`
    (introduzida na migration 0014), não a original da 0004/0005/0012.

- timestamp: 2026-08-10T00:05:00Z
  checked: supabase/migrations/0004, 0005, 0012, 0014_cardio_tempo_distancia.sql
    (definições de `save_set_log`)
  found: 0014 é a ÚLTIMA migration a redefinir `save_set_log`; adiciona exatamente
    `p_started_at`/`p_actual_duration_seconds`/`p_actual_distance_m`/`p_perceived_effort`
    como `default null` (0014:166-177). 0015/0020/0023 só tocam grants, não a assinatura.
  implication: o par cliente/servidor de `save_set_log` está, na FORMA da assinatura,
    coerente — segue verificação se está de fato aplicado em produção.

- timestamp: 2026-08-10T00:10:00Z
  checked: AGENTS.md (ledger de deploy dos dois ambientes)
  found: produção (`forcaapp-prod`) está na migration 0036 (linha 48) — 0000→0036
    aplicadas e conferidas; homologação idêntica.
  implication: NÃO há hoje mismatch de assinatura de `save_set_log` em produção —
    ELIMINA a hipótese de contrato quebrado como causa corrente.

- timestamp: 2026-08-10T00:15:00Z
  checked: src/store/activeSessionStore.ts `completeSet` (linhas 1178-1380)
  found: a chamada de rede (`saveSetLog` via `withTimeout`, linhas 1236-1254) e ~130
    linhas de lógica de adaptação PURAMENTE LOCAL (evaluateSet/recommendByRules/
    applyAdjustmentToNextSet/atualização de estado, linhas 1256-1358) dividem o MESMO
    bloco try; o único catch (linhas 1360-1376) não distingue "servidor recusou a
    escrita" de "servidor confirmou, processamento local local quebrou depois" — os
    dois casos setam `saveError` e devolvem `false`, isto é: reportam "não foi possível
    registrar" ao aluno mesmo quando a linha JÁ existe em `set_logs` no Postgres.
  implication: qualquer exceção na matemática de adaptação (código extenso e
    repetidamente endurecido — ver commits c330c86, 19461a5, 5c3e21a, fb402af, todos
    fechando achados de review nesta MESMA lógica) aparece ao aluno como uma falha de
    ENVIO idêntica a uma falha de rede real, no meio do treino.

- timestamp: 2026-08-10T00:20:00Z
  checked: src/screens/ActiveSessionScreen.tsx (linhas 397-404) e
    src/store/activeSessionStore.ts `errMsg` (linhas 191-201)
  found: `saveError` é o `.message` literal de QUALQUER `Error`/`TypeError` capturado,
    renderizado sem tradução como `${saveError} (toque para dispensar)` num `Notice`.
  implication: confirma o veículo pelo qual qualquer exceção JS capturada no bloco de
    completeSet vira texto visível na tela durante o envio de uma série.

- timestamp: 2026-08-10T00:25:00Z
  checked: src/services/sessionDraftStorage.ts (arquivo inteiro, 115 linhas)
  found: `saveDraft`/`loadDraft`/`clearDraft` persistem/leem UM snapshot completo do
    draft por (usuário, sessão planejada) no AsyncStorage, usado exclusivamente para
    RETOMAR sessão interrompida (comentário do próprio arquivo, linhas 1-6: "Não é uma
    segunda fonte de verdade do servidor: é só um cache local do que está em
    andamento"). Nenhuma fila de mutações pendentes, nenhuma persistência por escrita
    individual, nenhum mecanismo de flush/replay contra o servidor.
  implication: é um cache de RETOMADA, não uma fila/outbox de escrita offline.

- timestamp: 2026-08-10T00:30:00Z
  checked: grep recursivo em src/ por queue|outbox|batch|offline|retry|backoff|NetInfo
  found: só 3 mecanismos de retry/backoff no repo inteiro, nenhum relacionado a
    set_log: (1) apiClient.ts — retry de refresh de JWT 401 (auth, não treino); (2)
    jointSessionRealtime.ts — backoff de reconexão de WebSocket (canal Realtime, não
    escrita); (3) trainingPlanService.ts — backoff de polling de geração de plano por
    IA (não execução de treino). Nenhum cobre `save_set_log`/`start_session`/
    `finish_session`/`skip_session_exercise`/`swap_session_exercise`.
  implication: CONFIRMA que não existe hoje nenhuma camada de lote/fila/retry para as
    escritas de execução de sessão — "acho que já tínhamos preparado isso" (dono) NÃO
    procede; não há nada para reaproveitar, é trabalho novo.

- timestamp: 2026-08-10T00:35:00Z
  checked: grep recursivo em src/ e App.tsx por
    ErrorBoundary|componentDidCatch|unhandledRejection|ErrorUtils
  found: zero ocorrências.
  implication: não existe error boundary React nem handler global de exceção JS —
    fator agravante (categoria diferente: arquitetura/ambiente) que soma ao achado
    acima (categoria: código) — ver AND-gate no root_cause.

## Eliminated

- hypothesis: Mismatch de contrato do RPC `save_set_log` (cliente envia parâmetros que
    o servidor não aceita, ex.: `p_started_at`/`p_actual_duration_seconds` ausentes na
    função instalada).
  evidence: migration 0014 introduziu exatamente esses parâmetros com `default null`;
    AGENTS.md confirma produção na migration 0036 (>> 0014), nos dois ambientes.
  timestamp: 2026-08-10T00:12:00Z

- hypothesis: Desreferenciamento único, sem guarda, de um campo `undefined`/`null` em
    algum ponto do caminho direto componente→store→repository→RPC para séries de
    musculação (ex.: `set.actualReps`, `currentLoadKg`, `exercise.hasInjury`).
  evidence: leitura linha a linha de sessionModel.ts, intraSessionAdaptation.ts,
    guardrails.ts, config.ts, SessionPlayer.tsx, SessionQueue.tsx e
    ActiveSessionScreen.tsx não encontrou nenhum acesso a campo sem checagem `!= null`/
    `??` prévia — consistente com a filosofia declarada do arquivo (comentários citam
    achados F1-F12 de reviews anteriores fechando exatamente esta classe de bug).
  timestamp: 2026-08-10T00:18:00Z

## Specialist Review

specialist_hint: typescript
reviewer: ecc:typescript-reviewer
verdict: SUGGEST_CHANGE

Direção do fix confirmada como correta, com dois ajustes antes de implementar (revisão
feita contra o código vivo, `src/store/activeSessionStore.ts:1178-1380` e `:533-537`):

1. **Sem race nova, mas o commit de estado precisa sobreviver à falha de adaptação.**
   `evaluateSet`/`recommendByRules` (linhas 1303-1315) são síncronos — nenhum `await`
   dentro desse trecho — logo o guard de CAS/epoch (linhas 1259-1265) continua cobrindo
   o único `await` real (`saveSetLog`). O ponto crítico real: o commit
   `set({ draft: finalDraft, ... })` só acontece na linha 1351, DEPOIS do bloco de
   adaptação — se a adaptação lançar, a execução nunca chega lá, e `novo` (já montado
   nas linhas 1274-1291 com `status: 'done'`, refletindo a escrita já confirmada pelo
   servidor) nunca é commitado no store. Como `finalDraft`/`pending` já têm default
   `novo`/`null` antes do trecho de risco (linhas 1301-1302), um try/catch simples sem
   rethrow em torno de 1298-1350 resolve sem guarda extra — mas é catch-and-continue
   DENTRO de `completeSet`, não um catch separado/desacoplado.
2. **Não reaproveitar `storageWarning`/`STORAGE_WARNING_MSG`** — essa string é
   especificamente sobre persistência local do draft (linha 535) e confundiria o aluno
   sobre um problema não relacionado no motor de recomendação. Preferir o outro padrão
   já existente no arquivo: `console.warn(...)` apenas, igual a
   `updateSetLogAdaptation(...).catch(e => console.warn(...))` (linhas 1344-1346) — sem
   aviso visível ao usuário, já que a série já foi corretamente marcada como concluída.

Achado adicional (cobertura de teste): não existe hoje nenhum teste que force
`evaluateSet`/`recommendByRules` a lançar e verifique que `status` vira `done`,
`saveError` permanece `null` e `pendingAdaptation` fica `null` — recomendado antes de
fechar o fix.

## Resolution

root_cause: |
  Duas causas contribuintes, AND-gate confirmado (uma só não explica o sintoma por
  completo):
  (1) [categoria: código] `completeSet` (src/store/activeSessionStore.ts:1178-1380)
      conflaciona, no MESMO bloco try/catch (linhas 1233-1376), a chamada de rede
      `saveSetLog`/RPC `save_set_log` com ~130 linhas de lógica de adaptação
      PURAMENTE LOCAL (evaluateSet/recommendByRules, src/engine/intraSessionAdaptation.ts).
      Qualquer exceção nessa lógica local — mesmo DEPOIS de o servidor já ter
      confirmado a escrita em `set_logs` — é reportada ao aluno como falha de envio
      idêntica a uma falha de rede real, via `saveError`/`Notice`
      (src/screens/ActiveSessionScreen.tsx:397-404).
  (2) [categoria: arquitetura/dados] Não existe nenhuma camada de fila/lote/retry para
      as escritas de execução de sessão — `src/services/sessionDraftStorage.ts` é um
      CACHE DE RETOMADA (AsyncStorage, um snapshot por sessão), não uma fila de
      mutações pendentes; cada RPC (`save_set_log`, `start_session`, `finish_session`,
      `skip_session_exercise`, `swap_session_exercise`) é write-through síncrono e
      imediato, sem buffer local nem reenvio automático em reconexão.
  Fator agravante (categoria adicional: ausência de contenção): não há React
  ErrorBoundary nem handler global de exceção no app — qualquer exceção não prevista
  não tem rede de segurança.
  A combinação de (1)+(2) explica por que qualquer soluço — de rede real (comum em
  academia) OU de um bug pontual no motor de adaptação — aparece ao aluno como "erro ao
  enviar a série" no meio do treino, mesmo quando o dado às vezes já está salvo no banco.
  Não foi encontrado um desreferenciamento único sem guarda que explique sozinho um
  TypeError literal — nenhum texto de erro literal foi capturado nesta sessão
  (ver Symptoms.errors) para confirmar a palavra "TypeError" como string exibida.
fix: |
  Causa (1) CORRIGIDA. `src/store/activeSessionStore.ts` — o bloco de adaptação
  intra-sessão ganhou try/catch próprio, separado do catch de rede. `finalDraft`/`pending`
  já tinham default seguro (`novo`/`null`) antes do trecho de risco, então o catch é
  catch-and-continue: descarta o resultado PARCIAL da adaptação, conclui a série com o
  estado que o servidor confirmou e registra `console.warn` (padrão já usado no arquivo,
  em `updateSetLogAdaptation(...).catch`). Sem aviso visível ao aluno — o registro está
  correto e não há ação do usuário a tomar. Não foi reaproveitado `storageWarning`, por
  recomendação do `ecc:typescript-reviewer`: aquela string é sobre persistência local do
  rascunho e confundiria o aluno.

  Causa (2) NÃO corrigida por decisão de escopo do dono (10/08/2026): a camada de
  escrita em lote/offline-first é trabalho de fase, não de sessão de debug. Promovida a
  fase GSD nova; escopo (buffer+flush versus offline-first completo) a decidir em
  `/gsd-discuss-phase`.
verification: |
  TDD, RED antes de GREEN, medido:
  - RED: `npx jest __tests__/completeSetAdaptacaoNaoDerruba.test.ts` → 2 falharam,
    2 passaram. As duas falhas foram exatamente `expect(ok).toBe(true)` nos casos de
    `recommendByRules`/`evaluateSet` lançando TypeError — o bug reproduzido.
  - GREEN após o fix: 4 de 4 passaram na mesma suíte.
  - Sem regressão: `npx jest` → 142 suítes / 1623 testes, todos passando
    (antes do fix o STATE registrava 141 suítes / 1619 testes; +1 suíte, +4 testes).
  - `npx tsc --noEmit` → exit 0.
  - Teste de não-regressão incluído: falha REAL de rede (`saveSetLog` rejeitando)
    continua deixando a série não concluída e o erro visível.
  NÃO verificado: reprodução no app rodando, em produção. Nenhum texto literal de erro
  foi capturado do ambiente real, então não há prova de que o erro que o dono viu na
  tela seja exatamente este caminho — ver a ressalva sobre `errMsg` abaixo.
files_changed:
  - src/store/activeSessionStore.ts (bloco de adaptação isolado em try/catch próprio)
  - __tests__/completeSetAdaptacaoNaoDerruba.test.ts (novo, 4 testes de regressão)

ressalva_aberta: |
  `errMsg` (src/store/activeSessionStore.ts:191-201) devolve `e.message`, SEM o nome da
  classe. Por este caminho a tela nunca exibe a palavra literal "TypeError" — exibe só a
  mensagem. Ou o dono viu "TypeError" no console/Metro, ou estava parafraseando. O achado
  é real e reproduzido em teste, mas a identidade entre ELE e o erro observado em
  produção segue sem prova. O texto literal do erro continua sendo o dado que fecharia
  essa conta.
