---
phase: 03-interc-mbio-de-modalidade-de-cardio
verified: 2026-08-10T13:16:09Z
status: gaps_found
score: 3/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Trocar modalidade não corrompe séries de cardio já concluídas (invariante que o próprio codebase declara para a função irmã applyExerciseSkipToDraft, duas linhas acima: 'séries já concluídas não são tocadas — histórico não se reescreve')."
    status: failed
    reason: "applyCardioSwapToDraft (src/engine/sessionModel.ts:604-623) reescreve `name` no nível do EXERCÍCIO (não da série) e mapeia `targetDistanceM: null` sobre TODAS as séries de ex.sets, sem filtrar por status === 'done'. O botão 'Trocar modalidade' na fila (SessionQueue.tsx:138-149) só é gated por `!foraDeJogo && isTimeBased(metricOf(ex))` — nada verifica se alguma série já foi concluída. Num exercício de cardio com mais de uma série (ex.: intervalos de HIIT), completar a série 1 como 'Corrida' e depois trocar para 'Remo Ergômetro' antes da série 2 relabela silenciosamente o resultado já gravado da série 1 como se fosse Remo Ergômetro — tanto na fila ativa (doneLine usa ex.name) quanto no histórico (getSessionLogDetail agrupa por planned_exercise_id e aplica o único to_modality da linha ao grupo inteiro). Servidor: cardio_exercise_swaps é `unique (session_log_id, planned_exercise_id)` com um único to_modality — não há como reconstruir sob qual modalidade uma série específica foi de fato realizada depois de uma troca no meio do exercício. Nem client nem RPC (swap_session_exercise) guardam contra troca pós-conclusão parcial. Achado independentemente confirmado por leitura direta do código (03-REVIEW.md CR-01)."
    artifacts:
      - path: "src/engine/sessionModel.ts"
        issue: "applyCardioSwapToDraft:604-623 não distingue sets já 'done' dos pendentes ao zerar targetDistanceM e ao renomear o exercício"
      - path: "src/components/session/SessionQueue.tsx"
        issue: "Botão 'Trocar modalidade' (linha ~138) não é desabilitado quando alguma série do exercício já está status: 'done'"
      - path: "supabase/migrations/0034_troca_modalidade_cardio.sql"
        issue: "RPC swap_session_exercise não rejeita troca quando já existe set_logs gravado para o planned_exercise_id (nenhuma guarda de 'já iniciado')"
    missing:
      - "Guardar client-side: desabilitar 'Trocar modalidade' quando qualquer série do exercício já está 'done' (ou implementar atribuição de modalidade por série em vez de por exercício)."
      - "Guardar server-side em swap_session_exercise: rejeitar (ou registrar sem afetar séries já gravadas) quando já existir set_logs para o planned_exercise_id."
      - "Teste de regressão: uma série 'done' antes da troca mantém seu name/rótulo original após a troca do exercício (nenhum teste em cardioSwap.test.ts, cardioSwapFluxo.test.ts ou activeSessionScreen.test.tsx cobre esse cenário — confirmado por leitura direta dos 3 arquivos)."
  - truth: "SwapModalitySheet nunca apresenta uma lista vazia/travada sem explicação quando D-02 filtra a única modalidade aceita do usuário para fora da oferta (a modalidade aceita é igual à modalidade atual do exercício)."
    status: failed
    reason: "O estado vazio (EmptyState 'Nenhuma modalidade cadastrada') só dispara em `modalidades.length === 0` (SwapModalitySheet.tsx:119), mas a lista de fato renderizada é `opcoes` (linha 72: `modalidades.filter((m) => m !== exercicioAtualNome)`, linha 127). Quando o usuário tem exatamente 1 modalidade aceita e ela é igual à modalidade atual do exercício (cenário plausível: o exercício prescrito costuma vir da própria lista aceita), `modalidades.length === 1 > 0`, então o código cai no ramo ScrollView com `opcoes = []` — área rolável vazia, sem texto explicativo. O botão 'Trocar modalidade' (linha 151: `modalidades !== null && modalidades.length > 0`) permanece renderizado e permanentemente `disabled` (toModality nunca pode ser setado), sem caminho adiante além de 'Voltar'. Achado independentemente confirmado por leitura direta do código (03-REVIEW.md CR-02); não coberto por __tests__/swapModalitySheet.test.tsx, que só testa modalidades=[] e modalidades com 2+ itens distintos do exercício atual."
    artifacts:
      - path: "src/components/session/SwapModalitySheet.tsx"
        issue: "Condição do EmptyState (linha 119) usa modalidades.length === 0 (pré-filtro); condição do botão de confirmação (linha 151) usa modalidades.length > 0 — nenhuma das duas usa opcoes.length (pós-filtro), a lista efetivamente renderizada"
    missing:
      - "Trocar a condição do EmptyState (e a do botão de confirmação) para basear-se em opcoes.length === 0 em vez de modalidades.length === 0."
      - "Mensagem distinta para esse caso ('Você só tem esta modalidade cadastrada — nada para trocar') vs. o caso de lista global vazia."
      - "Teste com modalidades=['Caminhada'] e exercicioAtualNome='Caminhada' cobrindo o estado vazio pós-filtro e a ausência do botão de confirmação."
  - truth: "A troca de modalidade funciona ponta a ponta contra um banco vivo — RPC swap_session_exercise e tabela cardio_exercise_swaps existem em pelo menos um ambiente (staging)."
    status: failed
    reason: "supabase/migrations/0034_troca_modalidade_cardio.sql existe só como ARQUIVO — não foi aplicada a staging (forcaapp-staging, mjdjtiujhwklchalquhc) nem a produção (forcaapp-prod, zanqygwsgxkyjiuhrzju). Confirmado por leitura direta de 03-01-SUMMARY.md ('Decisão do Checkpoint'): dono escolheu option-a (aplicar agora, staging primeiro), execução foi DELEGADA a outra sessão e o próprio SUMMARY declara 'a migration NÃO está aplicada em nenhum banco'. AGENTS.md (linhas 48-49) só confirma 0000→0032 aplicadas nos dois ambientes; nada confirma 0033 nem 0034. Toda a evidência de comportamento desta fase (testes verdes: 140/140 suítes, 1605/1605 testes, reconfirmado nesta verificação) exercita swap_session_exercise/cardio_exercise_swaps só contra MOCKS de supabase-js — nunca contra Postgres real. Até a migration ser aplicada, qualquer usuário que tentar confirmar uma troca em staging ou produção recebe erro 'function does not exist' (PostgREST 42883) — a funcionalidade central da Fase 3 (Success Criteria 1-3 do ROADMAP) é inoperante em qualquer ambiente compartilhado hoje, mesmo com todo o código e testes corretos."
    artifacts:
      - path: "supabase/migrations/0034_troca_modalidade_cardio.sql"
        issue: "Arquivo pronto e testado localmente (harness sem banco), mas nunca aplicado via supabase db push a staging ou produção"
    missing:
      - "Rodar scripts/supabase-preflight.sh hml && supabase db push em staging, confirmar via information_schema/migration list."
      - "Rodar scripts/supabase-preflight.sh prod && supabase db push em produção (com a confirmação PRODUCAO), confirmar aplicação."
      - "Confirmar também o status de 0033_anamnese_cardio_declarada.sql antes do push (Known Open Risk registrado em 03-01-SUMMARY.md — não confirmada como aplicada em nenhum dos dois ambientes)."
human_verification:
  - test: "Confirmar visualmente, numa sessão real em staging (após a migration 0034 ser aplicada), que trocar a modalidade de um exercício de cardio na fila e via SkipReasonSheet (sem_equipamento) funciona ponta a ponta contra o servidor real, e que o rótulo 'Trocado de X' aparece na sessão ativa e no histórico."
    expected: "Troca é persistida no servidor (não só no mock), a sessão ativa e o histórico mostram 'Trocado de X', e o realizado soma corretamente no Progresso."
    why_human: "Depende de a migration 0034 estar aplicada a um banco vivo — impossível de verificar programaticamente nesta sessão (nenhum comando supabase deve ser executado pelo verificador) e a interação de UI real (toques, animações, navegação) não é coberta por teste automatizado de componente isolado."
---

# Phase 3: Intercâmbio de modalidade de cardio Verification Report

**Phase Goal:** Na sessão, o usuário troca um momento de cardio por outra modalidade aceita
(escada, bike, remo…) preservando a dose por tempo (`target_duration_seconds`); evolui o
fluxo de recusa declarada (motivo `sem_equipamento`) para substituição.

**Verified:** 2026-08-10T13:16:09Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1 — Um exercício de cardio da sessão oferece "trocar modalidade" listando só as modalidades aceitas do usuário | ✓ VERIFIED (com ressalva) | `SessionQueue.tsx:138-149` (botão gated por `isTimeBased`/`!foraDeJogo`), `SwapModalitySheet.tsx` consome `getModalidadesAceitas` (D-02 estrito, nunca oferece as 9 do catálogo quando vazio — `cardioModalidadesAceitasRepository.ts:38-45`). Ressalva: ver Gap #2 (CR-02) — lista pode ficar vazia sem explicação num caso de borda plausível. |
| 2 | ROADMAP SC2 — A troca preserva a duração-alvo; a distância prescrita da original NÃO é exibida como meta da nova (sem dado inventado) | ✓ VERIFIED | `applyCardioSwapToDraft` (`sessionModel.ts:604-623`) preserva `targetDurationSeconds` (nunca tocado, sobrevive pelo spread) e zera `targetDistanceM` em toda série do exercício alvo — `__tests__/cardioSwap.test.ts` cobre D-01/D-04/D-08 (7+ casos, incluindo imutabilidade e troca dupla). |
| 3 | ROADMAP SC3 — O realizado na modalidade trocada conta normalmente no realizado do Progresso | ✓ VERIFIED | `distanciaRealizadaSemanaM` (`cardioGoals.ts:246`) soma distância de QUALQUER modalidade; `progressoPrescrito.realizadoKm/fracaoKm` (`cardioPrescrito.ts:89-124`) consome essa soma; `CardioPrescritoSection.tsx` renderiza "X de Y km" com barra; `__tests__/cardioGoals.test.ts`/`cardioPrescrito.test.ts`/`cardioPrescritoSecao.test.tsx` verdes. Lado prescrito (D-06) confirmadamente intocado (`git diff` de `cardioPrescritoRepository.ts` vazio, per acceptance criteria de 03-06). |
| 4 | Trocar modalidade nunca corrompe/relabela silenciosamente uma série de cardio já concluída (invariante que o próprio `sessionModel.ts` declara duas linhas acima, para `applyExerciseSkipToDraft`) | ✗ FAILED | Ver Gap #1 (CR-01) — `applyCardioSwapToDraft` reescreve `name` no nível do exercício e zera `targetDistanceM` de TODAS as séries, incluindo `status: 'done'`; nenhuma guarda client ou server-side; nenhum teste cobre o cenário. |
| 5 | A lista de troca (D-02) nunca apresenta um estado travado/vazio sem explicação ao usuário | ✗ FAILED | Ver Gap #2 (CR-02) — `SwapModalitySheet` confunde `modalidades.length` (pré-filtro) com `opcoes.length` (pós-filtro, o que é de fato renderizado). |
| 6 | A troca funciona ponta a ponta contra um banco vivo (não só contra mocks de teste) | ✗ FAILED | Ver Gap #3 — migration 0034 existe só como arquivo; não aplicada em staging nem produção (confirmado em `03-01-SUMMARY.md` e `AGENTS.md`). |

**Score:** 3/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0034_troca_modalidade_cardio.sql` | Tabela satélite + RPC + vocabulário fechado, testados | ⚠️ EXISTS mas NÃO APLICADO | Harness `cardioSwapMigration.test.ts` (12 testes) verde; arquivo nunca rodou contra Postgres real (nem staging nem produção) — ver Gap #3 |
| `src/engine/sessionModel.ts` (applyCardioSwapToDraft, formatCardioSetResult) | D-01/D-04/D-08 no motor puro | ⚠️ VERIFIED com defeito (CR-01) | Existe, testado, wired — mas com o defeito do Gap #1 |
| `src/services/sessionExecutionRepository.ts` (swapSessionExercise, OpenSessionLog.exerciseSwaps, getSessionLogDetail estendido) | Persistência servidor-primeiro + leitura de histórico | ✓ VERIFIED | Testado (`sessionExecutionRepository.test.ts`), wired ao store e ao histórico |
| `src/store/activeSessionStore.ts` (swapExercise) | Servidor primeiro, reconciliação na retomada | ✓ VERIFIED | `swapExercise` implementado espelhando `skipExercise`; `applyServerSetLogs` reaplica `exerciseSwaps` via `comTrocas` |
| `src/services/cardioModalidadesAceitasRepository.ts` | Leitura de `cardio_modalidades`, fallback estrito D-02 | ✓ VERIFIED | `getModalidadesAceitas` nunca devolve as 9 quando vazio; filtra nomes fora do catálogo |
| `src/components/session/SwapModalitySheet.tsx` | Sheet de escolha, 3 estados (erro/carregando/vazio) + lista | ⚠️ VERIFIED com defeito (CR-02) | Existe, testado (7 testes), wired em 2 entry points — mas com o defeito do Gap #2 |
| `src/components/session/SessionQueue.tsx` (botão + "Trocado de X") | Entry point 1 | ✓ VERIFIED | `testID="swap-<id>"`, rótulo `ex.swappedFrom` renderizado |
| `src/components/session/SkipReasonSheet.tsx` (ramo sem_equipamento) | Entry point 2 | ✓ VERIFIED | `ofereceTroca` gated por `escopo/reason/ehCardio`; "Recusar mesmo assim" preserva o caminho antigo; `onSolicitarTroca` nunca chama `onConfirm` (testado) |
| `src/screens/ActiveSessionScreen.tsx` (fiação dos 2 entry points) | Estado troca/trocaBusy + roteamento | ⚠️ VERIFIED com código morto (WR-02) | Ambos entry points funcionam via o `SwapModalitySheet` INLINE (dentro do Modal "Ver andamento"); o bloco standalone (linhas 577-586, `visible={troca != null && modalContent !== 'swap_modality'}`) é logicamente inalcançável porque `troca` e `modalContent` sempre mudam juntos — não afeta o usuário, é dead code |
| `src/screens/SessionHistoryDetailScreen.tsx` (D-08 histórico + Pitfall 2) | Cardio legível + "Trocado de X" | ✓ VERIFIED | `descreveSerie`/`formatCardioSetResult` cobrem cardio; `section.swappedFrom` renderizado |
| `src/engine/cardioGoals.ts`/`cardioPrescrito.ts`/`CardioPrescritoSection.tsx` | D-05/D-06 | ✓ VERIFIED | Ver truth 3 acima |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `SessionQueue` (botão) | `ActiveSessionScreen` (estado troca) | `onSolicitarTroca` callback | ✓ WIRED | Código confirmado |
| `ActiveSessionScreen` | `SwapModalitySheet` | props `modalidades`/`onConfirm` | ✓ WIRED | Duas renderizações (inline funcional + standalone morto, WR-02) |
| `SwapModalitySheet.onConfirm` | `activeSessionStore.swapExercise` | `onConfirmarTroca` | ✓ WIRED | Confirmado em `activeSessionScreen.test.tsx` |
| `activeSessionStore.swapExercise` | `sessionExecutionRepository.swapSessionExercise` | chamada servidor-primeiro | ✓ WIRED (código) / ✗ NOT_WIRED (deploy) | Código correto; RPC não existe em nenhum banco vivo (Gap #3) |
| `sessionExecutionRepository.swapSessionExercise` | RPC `swap_session_exercise` (migration 0034) | `supabase.rpc(...)` | ✓ WIRED (código) / ✗ NOT_WIRED (deploy) | Idem — RPC não aplicada |
| `SkipReasonSheet` (sem_equipamento + ehCardio) | `SwapModalitySheet` (mesmo componente) | `onSolicitarTrocaAPartirDaRecusa` | ✓ WIRED | Confirmado: `skipSessionExercise` nunca chamado nesse caminho (testado) |
| `getSessionLogDetail` | `cardio_exercise_swaps` (embed) | `.select('...cardio_exercise_swaps(planned_exercise_id, to_modality)')` | ✓ WIRED (código) / ✗ NOT_WIRED (deploy) | Query correta; tabela não existe em nenhum banco vivo (Gap #3) |
| `cardioGoalRepository.getCardioLogs` | `cardioGoals.distanciaRealizadaSemanaM` | `progressoPrescrito` | ✓ WIRED | Confirmado por teste |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suíte completa (única execução, per regra de "rodar 1x") | `npx jest` | `Test Suites: 140 passed, 140 total` / `Tests: 1605 passed, 1605 total` | ✓ PASS |
| Verificação de tipos | `npx tsc --noEmit` | sem erros | ✓ PASS |
| Regressão cross-fase (Fases 1+2) | incluída na execução acima (`recusaDeclarada*.test.ts`, `cardioPrescrito*.test.ts` etc.) | verde | ✓ PASS |

Nota: toda a evidência acima exercita o comportamento contra **mocks** de `sessionExecutionRepository`/`supabase-js`, nunca contra Postgres real — ver Gap #3.

### Probe Execution

Não aplicável — esta fase não declara nem usa `scripts/*/tests/probe-*.sh`; a evidência de comportamento vem de `npx jest`/`npx tsc --noEmit` (Behavioral Spot-Checks acima).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-06 | 03-01..03-06 (todos) | Um momento de cardio da sessão pode ser trocado por outra modalidade aceita, preservando a dose por tempo; a distância da original não vira meta da nova (per `PROJECT.md`, único requisito declarado para a Fase 3 — não existe `.planning/REQUIREMENTS.md` separado neste projeto, `PROJECT.md` é a fonte canônica de requisitos) | ⚠️ PARCIALMENTE SATISFEITO | Código completo e testado (mocks) para as 3 Success Criteria do ROADMAP; SATISFEITO no nível de código, mas BLOQUEADO no nível operacional (Gap #3 — RPC/tabela não existem em nenhum ambiente vivo) e com 2 defeitos confirmados (Gaps #1/#2) que a Success Criteria 1/2 não previa explicitamente mas que violam invariantes do próprio codebase |

Nenhum requisito órfão: REQ-06 é o único requisito mapeado à Fase 3 em `PROJECT.md`/`ROADMAP.md`, e todos os 6 plans o declaram em `requirements:` no frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/engine/sessionModel.ts` | 604-623 | Mutação de dado histórico via troca não-guardada (CR-01) | 🛑 Blocker | Ver Gap #1 |
| `src/components/session/SwapModalitySheet.tsx` | 72, 119, 151 | Condição de estado vazio usa a lista errada (pré-filtro em vez de pós-filtro) (CR-02) | 🛑 Blocker | Ver Gap #2 |
| `supabase/migrations/0034_troca_modalidade_cardio.sql` | — (arquivo inteiro) | Artefato não aplicado a nenhum ambiente vivo | 🛑 Blocker | Ver Gap #3 |
| `supabase/migrations/0034_troca_modalidade_cardio.sql` | 212 | Guarda de "exercício é cardio" na RPC usa `OR muscle_group = 'Cardio'`, mais permissiva que o `isTimeBased` do cliente (WR-03 do 03-REVIEW.md) | ⚠️ Warning | Defesa em profundidade mais fraca que o documentado; não bloqueia o goal da fase, mas é uma inconsistência real entre client e servidor |
| `src/screens/ActiveSessionScreen.tsx` | 577-586 | `SwapModalitySheet` standalone logicamente inalcançável (WR-02 do 03-REVIEW.md) | ⚠️ Warning | Código morto, sem impacto funcional (o caminho INLINE funciona) |
| `__tests__/sessionExecutionRepository.test.ts` | 61-107 | Teste "anti-drift" compara contra uma réplica manual de `doneLine`, não a função real (WR-01 do 03-REVIEW.md) | ⚠️ Warning | A garantia de paridade alegada no comentário do teste é falsa — drift futuro entre `doneLine` e `formatCardioSetResult` não seria pego |

Nenhum marcador de débito (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) encontrado nos 14 arquivos tocados pela fase (verificado por grep direto).

### Human Verification Required

### 1. Confirmação end-to-end contra banco vivo

**Test:** Depois que a migration 0034 for de fato aplicada em staging (e o status de 0033 confirmado), abrir uma sessão real com um exercício de cardio, trocar a modalidade pelos dois entry points (fila e "sem_equipamento"), confirmar que a troca persiste, que "Trocado de X" aparece na sessão ativa e no histórico, e que o km realizado soma no Progresso.
**Expected:** Comportamento idêntico ao que os testes com mock preveem, mas contra Postgres real.
**Why human:** Depende de uma ação operacional (aplicar a migration) que este verificador está proibido de executar, e de interação de UI real que teste de componente isolado não cobre plenamente.

### Gaps Summary

A Fase 3 tem código completo, bem estruturado e amplamente testado (140/140 suítes, 1605/1605 testes, `tsc` limpo — reconfirmado nesta verificação, não apenas herdado do SUMMARY) para as 3 Success Criteria do ROADMAP. Três gaps genuínos impedem "gols alcançado" no sentido estrito:

1. **CR-01 (crítico, confirmado por leitura direta do código):** a troca de modalidade pode relabelar silenciosamente o resultado de uma série de cardio JÁ CONCLUÍDA sob a nova modalidade, sem nenhuma guarda client ou server-side e sem cobertura de teste — contradiz uma invariante que o próprio arquivo declara para a função irmã de recusa duas linhas acima.
2. **CR-02 (crítico, confirmado por leitura direta do código):** `SwapModalitySheet` pode apresentar uma lista vazia e travada, sem nenhuma explicação, quando a única modalidade aceita do usuário coincide com a modalidade atual do exercício — um cenário plausível dado que o exercício prescrito normalmente vem da própria lista aceita.
3. **Migration 0034 não aplicada em nenhum ambiente vivo:** a funcionalidade central da fase (RPC `swap_session_exercise`, tabela `cardio_exercise_swaps`) simplesmente não existe hoje em staging nem em produção. Toda a evidência verde desta fase é contra mocks. O dono já decidiu aplicar (option-a, staging primeiro) e delegou a execução, mas ela permanece pendente — sem isso, nenhum usuário real consegue trocar modalidade hoje.

Os 3 gaps acima são objetivamente verificáveis e cabem tanto num plano de correção de código (gaps 1 e 2) quanto numa ação operacional já decidida e só pendente de execução (gap 3). Nenhum deles foi inventado por este verificador — os dois primeiros já estavam documentados com precisão cirúrgica em `03-REVIEW.md` (CR-01/CR-02) e o terceiro está registrado pelo próprio executor em `03-01-SUMMARY.md`.

Achados de menor severidade (WR-01, WR-02, WR-03 do `03-REVIEW.md`) não bloqueiam o goal da fase e estão listados em Anti-Patterns Found como warnings, não como gaps.

---

_Verified: 2026-08-10T13:16:09Z_
_Verifier: Claude (gsd-verifier)_
