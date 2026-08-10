---
phase: 03-interc-mbio-de-modalidade-de-cardio
verified: 2026-08-10T18:40:00Z
status: human_needed
score: 6/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/6
  gaps_closed:
    - "G-03-3 (blocker, 03-UAT.md teste 3): getSessionLogDetail lia planned_sets.planned_exercise_id (coluna inexistente); corrigido para exercise_id (coluna real, migration 0001). Histórico volta a abrir. Confirmado por leitura direta + 67/67 testes verdes + review independente (03-REVIEW.md item 1)."
    - "UX dead-end (03-UAT.md teste 5, caveat): os dois entry points de troca (fila + SkipReasonSheet) agora somem assim que há série concluída, em vez de deixar o aluno entrar num fluxo que já sabe que vai terminar em recusa. Confirmado por leitura direta + 12/12 testes verdes."
  gaps_remaining:
    - "G-03-5-servidor (major, 03-UAT.md teste 5, server_gap): migration 0036 escrita e testada localmente (sem banco), mas NÃO aplicada a nenhum ambiente — o comportamento que o UAT comprovou explorável contra a RPC real (troca aceita mesmo com set_log já gravado) continua vivo em staging e produção enquanto o dono não rodar o runbook de 03-08-SUMMARY.md."
  regressions: []
behavior_unverified_items:
  - truth: "getSessionLogDetail devolve o detalhe da sessão sem lançar 42703, RODADO contra um Postgres/PostgREST real (não mock) — must_have verification:backstop do plano 03-07"
    test: "npm run test:integration:pg (harness __tests__/integration/getSessionLogDetail.postgrest.test.ts), com o stack Supabase local (OrbStack/Docker) de pé"
    expected: "1/1 teste passa; a promise resolve sem erro .code === '42703'"
    why_human: "O 03-07-SUMMARY.md relata RED (42703 confirmado) seguido de GREEN, mas este verificador encontrou o stack Supabase local PARADO nesta sessão ('supabase status' reporta 'Stopped services') e optou por não subi-lo/mutar estado local para não interferir em outra sessão paralela do dono. A evidência de código (coluna exercise_id é real, migration 0001; 03-REVIEW.md confirmou linha a linha) é forte, mas a execução real contra Postgres não foi reproduzida de forma independente por este relatório."
  - truth: "Aplicada a um banco vivo, uma chamada direta a swap_session_exercise para um planned_exercise_id que já tem set_logs gravados é recusada com errcode P0005 — must_have verification:backstop do plano 03-08"
    test: "Rodar o runbook de 03-08-SUMMARY.md (scripts/supabase-preflight.sh hml && supabase db push, depois prod) e então repetir o teste 5 do 03-UAT.md (registrar um set_log e chamar swap_session_exercise diretamente) contra cada ambiente"
    expected: "A chamada é recusada com errcode P0005 em vez de inserir em cardio_exercise_swaps, em staging e em produção"
    why_human: "Confirmado por leitura direta do arquivo e por AGENTS.md (linhas 48-49) que só 0000→0035 estão aplicadas em staging/produção (conferido em 10/08/2026) — a migration 0036 NÃO foi aplicada a nenhum banco. Aplicar é ação exclusiva do dono (supabase db push); nenhum agente está autorizado a rodá-la."
---

# Phase 3: Intercâmbio de modalidade de cardio Verification Report

**Phase Goal:** Na sessão, o usuário troca um momento de cardio por outra modalidade aceita
(escada, bike, remo…) preservando a dose por tempo (`target_duration_seconds`); evolui o
fluxo de recusa declarada (motivo `sem_equipamento`) para substituição.

**Verified:** 2026-08-10T18:40:00Z
**Status:** human_needed
**Re-verification:** Yes — após a onda de gap closure (planos 03-07/03-08/03-09) executada em
cima do 03-UAT.md (UAT contra Postgres real que apontou G-03-3 blocker e G-03-5-servidor
major). Esta verificação SUBSTITUI a `03-VERIFICATION.md` anterior, que datava de ANTES do UAT
e por isso não conhecia esses dois gaps.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1 — Um exercício de cardio da sessão oferece "trocar modalidade" listando só as modalidades aceitas do usuário | ✓ VERIFIED | `SessionQueue.tsx:117-121`, `SwapModalitySheet.tsx`. Código intocado por esta onda (`git diff 628f050..HEAD --stat` não lista nenhum destes arquivos fora das 2 linhas de guarda de UX descritas na truth 8); herda a verificação anterior. |
| 2 | ROADMAP SC2 — A troca preserva a duração-alvo; a distância prescrita da original NÃO é exibida como meta da nova | ✓ VERIFIED | `applyCardioSwapToDraft` (`sessionModel.ts:635-656`) confirmado por leitura direta nesta sessão: preserva `targetDurationSeconds`, zera `targetDistanceM` só em sets pendentes. Intocado por esta onda. |
| 3 | ROADMAP SC3 — O realizado na modalidade trocada conta normalmente no realizado do Progresso | ✓ VERIFIED | Inalterado desde a verificação anterior; testes de `cardioGoals`/`cardioPrescrito` continuam na suíte padrão. Confirmado adicionalmente pelo 03-UAT.md teste 4 (execução assistida contra Postgres real: "4 de 5 km" somando a modalidade trocada, prescrito intacto em 5 km). |
| 4 | G-03-3 (blocker) fechado no código: `getSessionLogDetail` lê `planned_sets.exercise_id` (coluna real), não mais `planned_exercise_id` (inexistente); histórico volta a abrir sem 42703 | ✓ VERIFIED | Leitura direta de `src/services/sessionExecutionRepository.ts:891` e `:924` nesta sessão: `exercise_id` presente nas duas ocorrências; `grep -rn "planned_sets(set_order, planned_exercise_id" src/` retorna vazio. `npx jest __tests__/sessionExecutionRepository.test.ts` — 47/47 (rodado nesta verificação). `03-REVIEW.md` (revisão independente do executor) confirmou linha a linha contra `0001_modelo_treino.sql:91` que `exercise_id` é a coluna real. |
| 5 | G-03-3 backstop: a correção acima RODADA contra um Postgres/PostgREST real (não mock) devolve o detalhe sem 42703 | ? UNCERTAIN — não reproduzido por este verificador | `03-07-SUMMARY.md` relata RED (42703 confirmado) → GREEN, rodado pelo executor. Este verificador NÃO reproduziu: `supabase status` reportou o stack local PARADO nesta sessão; subir o stack, semear e rodar `npm run test:integration:pg` mutaria estado local fora do escopo de uma verificação read-only e poderia colidir com outra sessão paralela do dono (regra de sessões paralelas). Ver Human Verification item 1. |
| 6 | G-03-5-servidor (major) — arquivo de migração 0036 correto: `create or replace` sobre `swap_session_exercise`, guarda nova (`errcode P0005`) quando já existe `set_log` para o `planned_exercise_id` alvo, guarda de métrica de 0035 preservada, revoke/grant corretos, asserção runtime estendida | ✓ VERIFIED | Arquivo lido integralmente nesta sessão (`supabase/migrations/0036_guarda_set_log_troca_cardio.sql`): guarda nova inserida no ponto certo (após guarda de métrica, antes do `insert`), join via `planned_sets.exercise_id` (consistente com a truth 4), `revoke ... from public, anon` + `grant ... to authenticated` presentes, asserção `do $$...$$` estendida sem remover a checagem herdada de 0035. `npx jest __tests__/cardioSwapGuardaSerieConcluida.test.ts` — 8/8 (rodado nesta verificação). `03-REVIEW.md` item 2 confirma comparação byte a byte contra 0035. |
| 7 | G-03-5-servidor backstop: a guarda acima, APLICADA a um banco vivo, recusa de fato uma chamada direta a `swap_session_exercise` com `set_log` já gravado | ✗ NÃO ATINGIDO — pendente, não é falha de código | `AGENTS.md` linhas 48-49 (conferido nesta sessão): só **0000→0035** estão aplicadas em staging (`mjdjtiujhwklchalquhc`) e produção (`zanqygwsgxkyjiuhrzju`), datado de 10/08/2026 — a migration 0036 não aparece. `03-08-SUMMARY.md` confirma: dono escolheu "option-a" (aplicar agora, staging primeiro) mas os comandos NÃO foram executados — "migration 0036 NÃO está aplicada em nenhum banco". O comportamento que o `03-UAT.md` teste 5 comprovou explorável (troca aceita pela RPC real mesmo com série já concluída) **continua vivo hoje** em staging e produção. Este verificador não pode aplicar a migration (fora de escopo/permissão) — ver Human Verification item 2. |
| 8 | UX dead-end (03-UAT.md teste 5, caveat) fechado: os dois entry points da troca somem assim que há série `done`; "Não vou fazer" continua disponível | ✓ VERIFIED | `SessionQueue.tsx:117-120` (`!ex.sets.some((s) => s.status === 'done')`) e `ActiveSessionScreen.tsx:364-367` (`!recusaExercicio.sets.some((s) => s.status === 'done')`) confirmados por leitura direta — mesmo predicado do guard de CR-01 em `activeSessionStore.ts:1518`, sem duplicar a lógica. `npx jest __tests__/activeSessionScreen.test.tsx` — 67/67 nesta rodada (12/12 do arquivo, incluindo os 2 testes novos `entry point 1/2: ... quando a série já está concluída`), rodado nesta verificação. Botão "Não vou fazer" (`SessionQueue.tsx:106`) e `SkipReasonSheet.ofereceTroca` não tocados, confirmado por diff. |

**Score:** 6/8 truths verified (2 pendentes de confirmação/ação humana — nenhuma é falha de código).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/sessionExecutionRepository.ts` | `getSessionLogDetail` lê `exercise_id`, não `planned_exercise_id`, no select e na leitura de `set_logs` | ✓ VERIFIED | Linhas 891 e 924 confirmadas; comentário novo documenta por que `erroDeColunaAusente` não se aplica aqui (topologia de migrations 0014 < 0020/0034). |
| `__tests__/integration/getSessionLogDetail.postgrest.test.ts` (novo) | Harness que importa a função REAL, sem mock do cliente Supabase, fora da suíte padrão | ✓ VERIFIED (estático) / ? UNCERTAIN (execução contra Postgres) | Arquivo lido integralmente (171 linhas): trava de loopback antes de qualquer chamada de rede, `jest.mock` só do módulo de config do cliente RN, seed via sessão autenticada real. `npx jest --listTests` confirma 0 ocorrências de `integration/` na suíte padrão. Execução real: ver truth 5. |
| `jest.integration.config.js` (novo) | Config Jest separada, roda só `__tests__/integration/**` | ✓ VERIFIED | Conteúdo lido: `preset: ts-jest`, `testEnvironment: node`, `testMatch` restrito. |
| `package.json` | Script `test:integration:pg` + `testPathIgnorePatterns` estendido | ✓ VERIFIED | Ambas as chaves confirmadas por leitura direta. |
| `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` (novo) | `create or replace` com guarda nova de `set_logs`/P0005, sem tocar 0034/0035 | ✓ VERIFIED (arquivo) / ✗ NÃO APLICADO (banco) | Arquivo lido integralmente; `git diff` confirma 0034/0035 byte a byte intocadas. Aplicação: ver truth 7. |
| `__tests__/cardioSwapGuardaSerieConcluida.test.ts` (novo) | Harness textual (sem banco) provando o conteúdo da 0036 | ✓ VERIFIED | 8/8 passando, rodado nesta verificação. |
| `src/components/session/SessionQueue.tsx` | Botão "Trocar modalidade" some com série `done` | ✓ VERIFIED | Linha 117-120 confirmada. |
| `src/screens/ActiveSessionScreen.tsx` | `recusaEhCardio` ganha o mesmo predicado | ✓ VERIFIED | Linha 364-367 confirmada. |
| `__tests__/activeSessionScreen.test.tsx` | 2 testes novos para os dois entry points | ✓ VERIFIED | `entry point 1/2: ... quando a série já está concluída` presentes e passando (linhas 566, 607). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `getSessionLogDetail` (select `set_logs`) | `planned_sets.exercise_id` (coluna real, migration 0001) | nome de coluna no `select`/leitura | ✓ WIRED | Confirmado nas 2 ocorrências; regressão grep vazia. |
| `sessionExecutionRepository.test.ts` (9 suítes `getSessionLogDetail`) | mocks de `planned_sets` | nome de propriedade nos objetos mock | ✓ WIRED | 3 mocks corrigidos para `exercise_id`; `cardio_exercise_swaps.planned_exercise_id` (coluna real de outra tabela) preservado intocado. |
| `swap_session_exercise` (migration 0036) | `set_logs` → `planned_sets.exercise_id` | `join` na guarda nova, `errcode P0005` | ✓ WIRED (código) / ✗ NÃO VIVO (nenhum banco) | Join confirmado no arquivo; não existe em nenhuma função instalada hoje (0000→0035 é o teto aplicado). |
| `SessionQueue` (botão "Trocar modalidade") | `ex.sets` (status das séries) | `!ex.sets.some((s) => s.status === 'done')` | ✓ WIRED | Mesmo predicado do guard de `activeSessionStore.swapExercise:1518`, confirmado por leitura lado a lado. |
| `ActiveSessionScreen` (`recusaEhCardio`) | `SkipReasonSheet.ofereceTroca` | prop `ehCardio` | ✓ WIRED | `ofereceTroca` (linha 82-86 de `SkipReasonSheet.tsx`) deriva inteiramente do prop recebido — nenhuma edição necessária naquele arquivo, confirmado por leitura. |
| `activeSessionStore.swapExercise` (guard CR-01, client) | bloqueio antes da RPC | `alvo.sets.some(s => s.status === 'done')` | ✓ WIRED | Inalterado por esta onda; primeira linha de defesa continua ativa independente do estado da 0036. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Regressão dos 3 arquivos tocados por esta onda (execução isolada, não a suíte inteira) | `npx jest __tests__/cardioSwapGuardaSerieConcluida.test.ts __tests__/activeSessionScreen.test.tsx __tests__/sessionExecutionRepository.test.ts --ci` | `Test Suites: 3 passed, 3 total` / `Tests: 67 passed, 67 total` | ✓ PASS (rodado nesta verificação) |
| Verificação de tipos | `npx tsc --noEmit` | sem erros (exit 0) | ✓ PASS (rodado nesta verificação) |
| Regressão do nome de coluna incorreto | `grep -rn "planned_sets(set_order, planned_exercise_id" src/` | vazio | ✓ PASS |
| Harness de integração excluído da suíte padrão | `npx jest --listTests \| grep -c integration` | `0` | ✓ PASS |
| Migrations 0034/0035 não editadas por esta onda | `git diff 628f050..HEAD --stat` | não lista `0034`/`0035` entre os arquivos alterados | ✓ PASS |
| Migration 0036 aplicada a algum banco vivo | leitura de `AGENTS.md:48-49` | "Aplicadas ... 0000 → 0035" (staging e produção) — 0036 ausente | ✗ NÃO APLICADA (esperado nesta etapa, não é falha de teste) |
| `npm run test:integration:pg` contra Postgres real | — | NÃO EXECUTADO nesta verificação (stack local parado; ver truth 5) | ? SKIP |

### Probe Execution

Não aplicável — esta fase não declara nem usa `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| REQ-06 | 03-01 a 03-09 (todos) | Um momento de cardio da sessão pode ser trocado por outra modalidade aceita, preservando a dose por tempo; a distância da original não vira meta da nova; evolui o fluxo de recusa declarada para substituição | ✓ SATISFEITO no código e testado contra Postgres real via UAT assistido (4/5 testes pass), com **1 item major ainda pendente de aplicação em banco vivo** (G-03-5-servidor) | As 3 Success Criteria do ROADMAP e os dois entry points funcionam ponta a ponta contra Postgres real (`03-UAT.md`, testes 1/2/4 pass). O blocker G-03-3 está fechado no código e testado (49/49 relacionados). O major G-03-5-servidor tem o código pronto e testado localmente, mas a guarda ainda não protege nenhum banco vivo — decisão e runbook do dono já registrados em `03-08-SUMMARY.md`, execução pendente. |

Não há requisito órfão: este projeto não mantém `.planning/REQUIREMENTS.md` — o rastreamento é feito via `ROADMAP.md` (`grep` confirmou a ausência do arquivo em todo o repositório). REQ-06 é o único requisito mapeado à Fase 3, presente no frontmatter das 9 plans e no bloco "Requirements" do ROADMAP.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Nenhum marcador de débito (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) nos 8 arquivos tocados por esta onda (grep direto, confirmado nesta verificação) | — | — |
| `__tests__/integration/getSessionLogDetail.postgrest.test.ts:164-170` | — | WR-01 (`03-REVIEW.md`): o único teste do harness nunca insere `planned_exercises`/`planned_sets`/`set_logs` — prova que o `select` não lança mais 42703, mas não exercita o mapeamento de linhas (`mapaTrocas`, agrupamento por `chave`) contra uma resposta real do PostgREST com dado populado | ⚠️ Warning | Cobertura de teste incompleta, não um bug observado — o mock antigo já mostrou que esse tipo de lógica de mapeamento é onde erros silenciosos se escondem. |
| `__tests__/integration/getSessionLogDetail.postgrest.test.ts:106-115` | — | WR-02 (`03-REVIEW.md`): `beforeAll` sem `try/finally` explícito — se uma chamada após `createUser` suceder falhar por exceção de rede síncrona, o usuário de teste pode ficar órfão no stack local | ⚠️ Warning | Risco de acúmulo de usuários de teste órfãos em execuções com falha parcial; não afeta staging/produção (harness trava em loopback). |
| `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` | — | IN-01 (`03-REVIEW.md`, reafirmado aqui): migration correta e testada textualmente, mas não aplicada a nenhum banco — dependência externa que nenhum agente pode fechar | ℹ️ Info | Ver truth 7 / Human Verification item 2. |

### Human Verification Required

### 1. Confirmar a correção de G-03-3 rodando o harness de integração contra Postgres real

**Test:** Com o stack Supabase local de pé (`supabase start`), rodar `npm run test:integration:pg` e observar o resultado.
**Expected:** 1/1 teste passa; `getSessionLogDetail` devolve o detalhe da sessão sem lançar erro `.code === '42703'`.
**Why human:** O `03-07-SUMMARY.md` relata ter feito exatamente isso (RED confirmado com `42703`, depois GREEN), mas o stack local estava PARADO no momento desta verificação (`supabase status` → "Stopped services"), e subir/semear o stack está fora do escopo de uma verificação read-only, além de risco de colidir com outra sessão paralela do dono no mesmo clone. A evidência de código é forte (coluna real confirmada contra a migration 0001; revisão independente em `03-REVIEW.md`), mas a execução real não foi reproduzida por este relatório.

### 2. Aplicar a migration 0036 em staging e produção, depois confirmar o comportamento contra a RPC real

**Test:** Rodar o runbook já registrado em `03-08-SUMMARY.md` (`scripts/supabase-preflight.sh hml && supabase db push`, depois `prod`), e então repetir o teste 5 do `03-UAT.md` (registrar um `set_log` para um exercício de cardio e chamar `swap_session_exercise` diretamente para o mesmo `planned_exercise_id`) contra cada ambiente.
**Expected:** A chamada é recusada com `errcode = 'P0005'` em vez de gravar em `cardio_exercise_swaps`, tanto em staging quanto em produção.
**Why human:** `AGENTS.md` confirma que só 0000→0035 estão aplicadas (10/08/2026); aplicar uma migration a staging/produção é ação exclusiva do dono (`supabase db push`), fora do escopo/permissão de qualquer agente deste fluxo. Até essa ação e essa confirmação, o comportamento que o `03-UAT.md` teste 5 comprovou explorável continua vivo nos dois ambientes.

### 3. Itens já registrados como caveat no 03-UAT.md, ainda não exercitados manualmente

**Test:** (a) confirmar que "Recusar mesmo assim" se comporta identicamente ao antigo "Não vou fazer" quando o aluno NÃO escolhe trocar; (b) confirmar que o km realizado da semana soma corretamente quando há MÚLTIPLAS modalidades diferentes na mesma semana (o UAT só teve uma); (c) repetir o teste 1 do UAT ("fechar e reabrir o app") num build nativo iOS/Android real, não só reload de página web.
**Expected:** Mesmo comportamento previsto pelos testes automatizados (`recusaDeclarada*.test.ts`, `cardioGoals.test.ts:316`, `cardioPrescrito.test.ts:117`) se confirma na interação real.
**Why human:** Depende de interação de UI real (build nativo, múltiplos cenários de dados) que nem teste de componente isolado nem a execução assistida de hoje (limitada a um único exercício de cardio, plataforma web) cobrem — já eram caveats explícitos do próprio `03-UAT.md`, não gaps novos desta rodada.

### Gaps Summary

**Nenhum gap de código novo nesta rodada.** Os dois gaps que a UAT contra Postgres real
apontou foram tratados como se propôs no fechamento (03-07/03-08/03-09):

1. **G-03-3 (blocker) — fechado no código, confirmado por leitura + testes + revisão
   independente.** `getSessionLogDetail` agora lê a coluna real (`exercise_id`); a classe de
   erro (nome de coluna inexistente invisível a um mock) ganhou um harness de integração
   dedicado, fora da suíte padrão. Resta apenas a confirmação de que ESSE harness, rodado
   contra Postgres de verdade, de fato passa — o executor relata que sim, este verificador não
   reproduziu de forma independente (item de Human Verification 1). Este verificador considera
   o risco residual **baixo**: a coluna `exercise_id` é parte da migration 0001 (a mais antiga
   do domínio de treino), aplicada em todo ambiente que tenha qualquer uma das migrations de
   cardio/troca — não há cenário de drift plausível que o teste RED/GREEN relatado não teria
   pego.

2. **G-03-5-servidor (major) — o código está pronto, mas o gap PERMANECE ABERTO em produção e
   staging hoje.** A migration 0036 (arquivo) está correta e testada textualmente, mas
   `AGENTS.md` confirma que nenhum banco vivo tem além da 0035 aplicada. Isso significa que o
   comportamento que o `03-UAT.md` teste 5 comprovou (uma chamada direta à RPC `swap_session_exercise`
   é ACEITA mesmo com uma série já concluída, sobrescrevendo o rótulo do histórico) **continua
   reproduzível hoje** em staging e produção — o guard client-side (`activeSessionStore.ts:1518`)
   continua protegendo o fluxo NORMAL do app (mesma proteção que já existia antes desta rodada),
   mas não protege chamada direta à API, build sem o guard, nem corrida entre dois dispositivos.
   O dono já decidiu (option-a, "aplicar agora, staging primeiro") e o runbook está documentado
   em `03-08-SUMMARY.md`; falta apenas a execução manual. **Este item não é reportado como
   "resolvido" nem arredondado para cima — fica registrado como pendência ativa até a aplicação
   e a confirmação (Human Verification item 2).**

3. **UX dead-end (03-UAT.md teste 5, caveat) — fechado e confirmado por código + testes.** Os
   dois entry points da troca somem assim que há série concluída; "Não vou fazer" continua
   disponível. Sem pendência.

**Por que o status é `human_needed`, não `gaps_found`:** nenhum artefato está ausente, stub ou
desconectado, e nenhum teste automatizado falhou. As duas pendências (truths 5 e 7) são,
respectivamente, uma confirmação de execução que este verificador não pôde reproduzir de forma
independente sem mutar estado local, e uma ação de deploy explicitamente reservada ao dono. Um
`status: gaps_found` implicaria um defeito de implementação a corrigir; não é o caso aqui — o
que falta é ação/confirmação humana, não código novo.

---

_Verified: 2026-08-10T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
