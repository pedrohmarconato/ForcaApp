---
phase: 03-interc-mbio-de-modalidade-de-cardio
verified: 2026-08-13T18:10:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/8
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  resolved_since_previous:
    - "Truth 5 (G-03-3 backstop, harness contra Postgres real): estava '? UNCERTAIN' porque a verificação de 2026-08-10 achou o stack local parado e não reproduziu. 03-UAT.md teste 6 (rodada 2, 2026-08-10) reproduziu de forma independente — `npm run test:integration:pg` 1/1 PASS, sem 42703. gap_id G-03-3 no 03-UAT.md tem `backstop_confirmado` preenchido. Agora VERIFIED."
    - "Truth 7 (G-03-5-servidor backstop, migration 0036 viva em banco real): estava '✗ NÃO ATINGIDO' porque nenhum ambiente tinha a 0036 aplicada. 03-UAT.md teste 7 (rodada 2, 2026-08-10) confirma 0036 aplicada e a guarda P0005 viva em homologação (prova comportamental: recusa P0005, 0 linhas em cardio_exercise_swaps, resíduo 0) E em produção (verificação de leitura: guarda_p0005_viva=true, join_set_logs_presente=true, anon_executa=false + md5(pg_get_functiondef(...))=71e4354975114d06ea0010086d5045bc idêntico ao de homologação). gap_id G-03-5-servidor no 03-UAT.md: `pendencia: NENHUMA`. Agora VERIFIED."
human_verification_deferred:
  - item: "Item (c) do teste 8 do 03-UAT.md — reconfirmar o teste 1 ('fechar e reabrir o app mantém a troca') num build nativo iOS/Android real, não apenas reload de página web"
    status: pending — ambiente sem toolchain nativa (sem Xcode com simulador, sem Android SDK)
    blocks_success_criteria: false
    rationale: "A persistência da troca já foi comprovada pela via mais forte disponível: leitura direta no banco (cardio_exercise_swaps com to_modality e planned_exercise_id corretos, set_logs=0 provando que a fila pós-reload veio do servidor, não de cache local) — teste 1 do 03-UAT.md, resultado pass. O reload de página web já exercitou o mesmo caminho de busca de estado que um cold-start nativo (getSessionDetail contra o servidor); o que falta é só a plataforma de UI, não o dado nem a lógica. Nenhuma das 3 Success Criteria do ROADMAP (listar modalidades aceitas / preservar duração-alvo sem inventar distância / contar o realizado no Progresso) depende de comportamento de app nativo. Owner: rodar em máquina com Xcode+simulador ou Android SDK quando disponível."
---

# Phase 3: Intercâmbio de modalidade de cardio Verification Report

**Phase Goal:** Na sessão, o usuário troca um momento de cardio por outra modalidade aceita
(escada, bike, remo…) preservando a dose por tempo (`target_duration_seconds`); evolui o
fluxo de recusa declarada (motivo `sem_equipamento`) para substituição.

**Verified:** 2026-08-13T18:10:00Z
**Status:** passed
**Re-verification:** Yes — 3ª rodada. A `03-VERIFICATION.md` de 2026-08-10 (esta que ela
substitui) devolveu `human_needed` com 6/8 truths e 2 itens de verificação humana: (1) rodar o
harness de integração do G-03-3 contra Postgres real, (2) aplicar a migration 0036 em staging e
produção e confirmar a recusa P0005 contra a RPC real. Os dois foram fechados em 2026-08-10
(03-UAT.md, testes 6 e 7, rodada 2) e reconfirmados nesta sessão por leitura direta das fontes
(nenhum dado novo produzido aqui — nem stack Supabase local subido, nem staging/produção
tocados, conforme restrição do pedido).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1 — Um exercício de cardio da sessão oferece "trocar modalidade" listando só as modalidades aceitas do usuário | ✓ VERIFIED | `SessionQueue.tsx:117-129` (botão só some se `!ex.sets.some(s => s.status === 'done')`, presente sempre que `onSolicitarTroca` existe); `SwapModalitySheet.tsx:1-24` (comentário de cabeçalho + código: lista filtrada por `opcoes`, "a lista SÓ mostra as modalidades aceitas do usuário (D-02) — nunca o catálogo inteiro"). 03-UAT.md teste 1 (pass): sheet mostrou só "Caminhada" e "Bicicleta Ergométrica", "Corrida" (atual) ausente. Nenhum destes arquivos mudou desde 10/08 (`git log` só lista o próprio 0036/testes tocando este diretório). |
| 2 | ROADMAP SC2 — A troca preserva a duração-alvo; a distância prescrita da original NÃO é exibida como meta da nova (sem dado inventado) | ✓ VERIFIED | `applyCardioSwapToDraft` (`sessionModel.ts:635-656`, lida integralmente nesta sessão): não toca `targetDurationSeconds`; zera `targetDistanceM` só em sets `!== 'done'` (linha 651-653). 03-UAT.md teste 1: "S1 alvo 30:00" preservado após a troca. Confirmado por `npx jest __tests__/cardioSwap.test.ts` — passou nesta sessão (ver Spot-Checks). |
| 3 | ROADMAP SC3 — O realizado na modalidade trocada conta normalmente no realizado do Progresso | ✓ VERIFIED | `cardioGoalRepository.ts:22-40` (`getCardioLogs`, lida integralmente): filtra por `muscle_group = 'Cardio'` e `metric in (tempo, tempo_distancia)` — não filtra por modalidade específica, então qualquer troca é contada. 03-UAT.md teste 4 (pass, 2026-08-10): "4 de 5 km" — os 4 km vieram da modalidade TROCADA (Caminhada), prescrito intacto em 5 km. 03-UAT.md teste 8(b) (pass, 2026-08-13, rodada 3): soma de DUAS modalidades DIFERENTES na mesma semana ("45 de 90 min / 7 de 15 km / 2 de 2 dias com cardio" = 4 km Caminhada via swap de 10/08 + 3 km Corrida de 13/08) — fecha o caveat que o teste 4 tinha deixado aberto (só uma modalidade exercitada). |
| 4 | G-03-3 (blocker) fechado no código: `getSessionLogDetail` lê `planned_sets.exercise_id` (coluna real), não `planned_exercise_id` (inexistente) | ✓ VERIFIED | `sessionExecutionRepository.ts:931` (select) e `:956` (leitura) confirmados por leitura direta nesta sessão — ambos usam `exercise_id`. `grep -rn "planned_sets(set_order, planned_exercise_id" src/` vazio. Regressão confirmada: o commit `385eab5` (12/08, Fase 4) tocou este mesmo arquivo (`getSessionLogFinishedStatus`, CR-03) sem alterar as linhas 931/956 — a correção da Fase 3 sobreviveu intacta ao trabalho da Fase 4. |
| 5 | G-03-3 backstop: a correção acima RODADA contra um Postgres/PostgREST real (não mock) devolve o detalhe sem 42703 | ✓ VERIFIED (antes: `? UNCERTAIN`) | 03-UAT.md teste 6 / gap G-03-3 `backstop_confirmado`: reproduzido de forma independente em 2026-08-10 — `npm run test:integration:pg` contra `http://127.0.0.1:54321`, saída literal `Test Suites: 1 passed, 1 total` / `Tests: 1 passed, 1 total`, "sem nenhuma ocorrência de 42703". `correcao_de_registro` no mesmo teste explica o engano da verificação de 10/08: o `supabase status` "Stopped services" se referia a `imgproxy`/`pooler`, não ao núcleo (`supabase_db_ForcaApp`, `supabase_rest_ForcaApp`), que estava `Up` havia 3h. Esta sessão NÃO subiu o stack local nem re-executou o teste (restrição do pedido) — a evidência vem da reprodução independente já registrada em 03-UAT.md. |
| 6 | G-03-5-servidor (major) — arquivo de migração 0036 correto | ✓ VERIFIED | Inalterado desde 2026-08-10; `npx jest __tests__/cardioSwapGuardaSerieConcluida.test.ts` — 8/8 (rodado nesta verificação). |
| 7 | G-03-5-servidor backstop: a guarda acima, APLICADA a um banco vivo, recusa de fato uma chamada direta a `swap_session_exercise` com `set_log` já gravado | ✓ VERIFIED (antes: `✗ NÃO ATINGIDO`) | 03-UAT.md teste 7 / gap G-03-5-servidor (`pendencia: NENHUMA`, `resolvido_em: 2026-08-10`): homologação com prova COMPORTAMENTAL (script `uat-0036-p0005-v3.sql`: "(a) exercicio COM serie: RECUSADA \| sqlstate=P0005 \| 0 linha(s) \| veredicto=PASS-GREEN", "(b) exercicio SEM serie: ACEITA \| 1 linha(s)" — não-regressão confirmada); produção com verificação de leitura (Management API: `guarda_p0005_viva=true, join_set_logs_presente=true, anon_executa=false, authenticated_executa=true`) mais `md5(pg_get_functiondef(...))=71e4354975114d06ea0010086d5045bc` (3918 bytes) IDÊNTICO entre `zanqygwsgxkyjiuhrzju` (prod) e `mjdjtiujhwklchalquhc` (homologação) — a prova comportamental de homologação transfere por igualdade de definição de função. `AGENTS.md:48-58` confirma "0000 → 0036" nos dois ambientes. Esta sessão NÃO tocou staging/produção (proibido pelo pedido) — evidência vem de leitura das fontes já registradas. |
| 8 | UX dead-end (03-UAT.md teste 5, caveat) fechado: os dois entry points da troca somem assim que há série `done` | ✓ VERIFIED | Inalterado desde 2026-08-10; `npx jest __tests__/activeSessionScreen.test.tsx` — passou nesta sessão como parte da suíte agrupada (ver Spot-Checks). |

**Score:** 8/8 truths verified (as duas pendências da verificação anterior — truths 5 e 7 — foram
fechadas por evidência já registrada em 03-UAT.md/AGENTS.md/03-SECURITY.md em 2026-08-10, e
reconfirmadas por leitura das fontes nesta sessão).

### Deferred (não bloqueia nenhuma Success Criteria)

| # | Item | Status | Por que não bloqueia |
|---|------|--------|----------------------|
| 1 | 03-UAT.md teste 8(c) — reconfirmar "fechar e reabrir o app" (teste 1) num build nativo iOS/Android real | pending — ambiente sem Xcode/Android SDK | A persistência da troca já foi provada pela via mais forte (leitura direta no banco, teste 1); o que falta é só a plataforma de UI de um teste que já passou. Nenhuma das 3 SC do ROADMAP menciona ciclo de vida de app nativo. Ver `human_verification_deferred` no frontmatter para o critério completo. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/sessionExecutionRepository.ts` | `getSessionLogDetail` lê `exercise_id` no select (linha ~891→931 após merge da Fase 4) e na leitura (linha ~916→956) | ✓ VERIFIED | Confirmado nas novas posições de linha; sobreviveu ao commit `385eab5` da Fase 4 que tocou o mesmo arquivo. |
| `__tests__/integration/getSessionLogDetail.postgrest.test.ts` | Harness que importa a função real, sem mock do cliente Supabase | ✓ VERIFIED (estático) / ✓ VERIFIED (execução, via 03-UAT.md teste 6, reproduzida independentemente em 10/08) | Não re-executado nesta sessão (stack local não subido, por restrição do pedido); evidência de execução vem do registro já independente do teste 6. |
| `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` | `create or replace` com guarda P0005, sem tocar 0034/0035 | ✓ VERIFIED (arquivo) / ✓ APLICADO (banco, staging + produção) | Arquivo inalterado desde 10/08; aplicação confirmada em `AGENTS.md:48-58` e `03-SECURITY.md` T-03-11/T-03-12 (closed). |
| `src/components/session/SessionQueue.tsx` | Botão "Trocar modalidade" some com série `done` | ✓ VERIFIED | Linha 117-129 confirmada nesta sessão. |
| `src/screens/ActiveSessionScreen.tsx` | `recusaEhCardio` ganha o mesmo predicado | ✓ VERIFIED | `onSolicitarTroca`/`onSolicitarRecusa` wiring confirmado (linhas 373, 588, 612, 652, 656). |
| `src/services/cardioGoalRepository.ts` | `getCardioLogs` não filtra por modalidade específica — soma qualquer cardio trocado | ✓ VERIFIED | Linhas 22-40 lidas integralmente; filtro é por `muscle_group`/`metric`, não por nome de modalidade. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `getSessionLogDetail` (select `set_logs`) | `planned_sets.exercise_id` (coluna real, migration 0001) | nome de coluna no select/leitura | ✓ WIRED | Confirmado nas 2 ocorrências pós-merge da Fase 4 (linhas 931, 956). |
| `swap_session_exercise` (migration 0036, VIVA em staging+produção) | `set_logs` → `planned_sets.exercise_id` | `join` na guarda, `errcode P0005` | ✓ WIRED e VIVO | Antes "código, não vivo"; agora confirmado vivo nos dois ambientes por `AGENTS.md`/`03-SECURITY.md`/`03-UAT.md` teste 7. |
| `SessionQueue`/`SwapModalitySheet` | `getModalidadesAceitas` (RLS "own") | prop `opcoes` filtrada | ✓ WIRED | Confirmado por leitura do cabeçalho de `SwapModalitySheet.tsx` e 03-UAT.md teste 1. |
| `cardioGoalRepository.getCardioLogs` | Progresso (aba, soma semanal) | query sem filtro de modalidade | ✓ WIRED | Confirmado por leitura + 03-UAT.md testes 4 e 8(b) (múltiplas modalidades somando). |
| `activeSessionStore.swapExercise` (guard CR-01, client) | bloqueio antes da RPC | `alvo.sets.some(s => s.status === 'done')` | ✓ WIRED | Segunda camada, mantida; primeira linha de defesa client-side. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Regressão dos arquivos-chave da fase (6 suítes, execução isolada) | `npx jest __tests__/cardioSwapGuardaSerieConcluida.test.ts __tests__/activeSessionScreen.test.tsx __tests__/sessionExecutionRepository.test.ts __tests__/cardioSwap.test.ts __tests__/cardioGoals.test.ts __tests__/cardioPrescrito.test.ts --ci` | `Test Suites: 6 passed, 6 total` / `Tests: 113 passed, 113 total` | ✓ PASS (rodado nesta verificação) |
| Verificação de tipos | `npx tsc --noEmit` | exit 0, sem erros | ✓ PASS (rodado nesta verificação) |
| Regressão do nome de coluna incorreto | `grep -rn "planned_sets(set_order, planned_exercise_id" src/` | vazio | ✓ PASS |
| Harness de integração excluído da suíte padrão | `npx jest --listTests \| grep -c integration` | `0` | ✓ PASS (rodado nesta verificação) |
| Ausência de marcador de débito nos arquivos-chave | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER" sessionExecutionRepository.ts sessionModel.ts SessionQueue.tsx ActiveSessionScreen.tsx 0036*.sql` | vazio | ✓ PASS (rodado nesta verificação) |
| `npm run test:integration:pg` contra Postgres real | — | NÃO EXECUTADO nesta verificação, por restrição explícita do pedido (não subir/derrubar stack) — evidência vem da reprodução independente já registrada em 03-UAT.md teste 6 (10/08/2026) | ? SKIP (deliberado, coberto por evidência de fonte) |

### Probe Execution

Não aplicável — esta fase não declara nem usa `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| REQ-06 | 03-01 a 03-09 (todos) | Um momento de cardio da sessão pode ser trocado por outra modalidade aceita, preservando a dose por tempo; a distância da original não vira meta da nova; evolui o fluxo de recusa declarada para substituição | ✓ SATISFEITO — código, testes e comportamento em banco vivo (staging + produção) | As 3 Success Criteria do ROADMAP confirmadas ponta a ponta contra Postgres real (03-UAT.md testes 1, 2, 4, 5, 8) e a guarda de servidor (0036) está viva nos dois ambientes com prova comportamental (homologação) e verificação transitiva por igualdade de definição de função (produção). Nenhum gap de código aberto. |

Não há requisito órfão — projeto não mantém `.planning/REQUIREMENTS.md`; rastreamento via
ROADMAP.md. REQ-06 é o único requisito mapeado à Fase 3.

### Segurança (03-SECURITY.md)

Re-verificado em 2026-08-13: `status: verified`, `threats_open: 0`, **SECURED 15/15**. Guarda de
posse (T-03-01), revoke/grant anon (T-03-02, T-03-12), vocabulário fechado (T-03-03), guarda de
métrica cardio (T-03-04) e guarda P0005/set_logs (T-03-11) confirmados byte a byte preservados
mesmo após `0037_swap_guard_codigo_oficial.sql` (follow-up da Fase 4, que só troca o literal do
errcode `P0005`→`23505`, aplicado SOMENTE no stack local — staging/produção seguem na 0036, per
`AGENTS.md:48-58`). Isso é pendência operacional da Fase 4 (alinhar staging/produção quando a
0037 for promovida), não uma regressão desta fase — a guarda em si (posse, cardio-only,
set_logs já gravado) está viva e idêntica nos dois errcodes.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Nenhum marcador de débito (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) nos arquivos-chave da fase (grep direto, confirmado nesta verificação) | — | — |
| `__tests__/integration/getSessionLogDetail.postgrest.test.ts:164-170` | — | WR-01 (`03-REVIEW.md`, ainda aberto): o harness nunca insere `planned_exercises`/`planned_sets`/`set_logs` — prova que o select não lança mais 42703, mas não exercita o mapeamento de linhas contra dado populado real | ⚠️ Warning | Cobertura de teste incompleta, não bug observado; não impede o goal da fase. |
| `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` | — | IN-01 (`03-REVIEW.md`): reafirmado como resolvido — migration aplicada em staging E produção, não mais dependência externa aberta | ℹ️ Info (fechado) | — |

### Human Verification Required

Nenhum item de verificação humana bloqueia o `status: passed`. Um único item permanece como
caveat deferido, sem impacto nas 3 Success Criteria (ver seção "Deferred" acima e
`human_verification_deferred` no frontmatter):

### 1. Teste 1 do 03-UAT.md, reconfirmado em build nativo real (item 8c)

**Test:** Repetir "trocar modalidade → fechar e reabrir o app" num build nativo iOS ou Android
real (não reload de página web).
**Expected:** A troca persiste após o app ser encerrado e reaberto, mesmo comportamento já
comprovado por leitura direta no banco (`cardio_exercise_swaps`) no teste 1.
**Why human/deferred, não blocker:** A máquina do ciclo de auditoria não tem Xcode com simulador
nem Android SDK. O teste 1 já passou (2026-08-10) com este exato caveat documentado, e a
persistência foi comprovada pela via mais forte disponível — leitura direta no servidor, que é
platform-agnostic. Nenhuma das 3 Success Criteria do ROADMAP depende de ciclo de vida de app
nativo. Ação do dono: rodar num ambiente com toolchain nativa quando disponível; não é um gap de
implementação.

### Gaps Summary

**Nenhum gap aberto.** As duas pendências da verificação de 2026-08-10 (`human_needed`, 6/8) —
truth 5 (harness de integração do G-03-3 rodado contra Postgres real) e truth 7 (migration 0036
viva em banco real) — foram fechadas em 2026-08-10 por evidência já registrada em `03-UAT.md`
(testes 6 e 7, gaps `G-03-3` e `G-03-5-servidor`, ambos `status: resolved`/`pendencia: NENHUMA`)
e em `AGENTS.md`/`03-SECURITY.md`. Esta sessão reconfirmou as duas por leitura direta das fontes,
sem subir o stack Supabase local nem tocar staging/produção (restrição explícita do pedido).

O único item que restou de verificação humana — item (c) do teste 8 do UAT (reconfirmar a
persistência da troca num build nativo real) — foi julgado explicitamente contra as 3 Success
Criteria do ROADMAP e não bloqueia nenhuma delas: a persistência já está provada pela via mais
forte (leitura direta no servidor), e o item pendente é só a reconfirmação numa plataforma de UI
diferente da já exercitada. Fica registrado como caveat deferido, dono: rodar em ambiente com
toolchain nativa.

Nota de escopo: a migration 0037 (Fase 4) trocou o literal do errcode P0005→23505 e está
aplicada SOMENTE no stack local — staging e produção seguem na 0036. Isso é pendência
operacional da Fase 4, explicitamente fora do escopo desta re-verificação da Fase 3.

---

_Verified: 2026-08-13T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
