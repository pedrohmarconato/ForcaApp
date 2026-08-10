---
phase: 03-interc-mbio-de-modalidade-de-cardio
verified: 2026-08-10T13:59:02Z
status: human_needed
score: 5/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/6
  gaps_closed:
    - "Trocar modalidade não corrompe séries de cardio já concluídas (CR-01) — agora bloqueado antes da RPC, com teste de regressão."
    - "SwapModalitySheet nunca apresenta uma lista vazia/travada sem explicação (CR-02) — estado vazio agora usa `opcoes.length`, com mensagem distinta e teste de regressão."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Confirmar visualmente, numa sessão real em staging/produção, que trocar a modalidade de um exercício de cardio na fila e via SkipReasonSheet (sem_equipamento) funciona ponta a ponta contra o servidor real (RPC swap_session_exercise / tabela cardio_exercise_swaps aplicadas pela migration 0034+0035), e que o rótulo 'Trocado de X' aparece na sessão ativa e no histórico."
    expected: "Troca é persistida no servidor (não só no mock), a sessão ativa e o histórico mostram 'Trocado de X', e o realizado soma corretamente no Progresso — comportamento idêntico ao que os testes com mock preveem."
    why_human: "AGENTS.md e o commit f69f45f registram a aplicação de 0033/0034/0035 em staging (mjdjtiujhwklchalquhc, 10/08/2026) e de 0034/0035 em produção (zanqygwsgxkyjiuhrzju, 10/08/2026), mas este verificador está proibido de rodar qualquer comando `supabase` e não pode confirmar independentemente o estado do banco vivo. A reivindicação é tratada como reportada-e-registrada, não como provada por este relatório. Também depende de interação de UI real (toques, animações, navegação) que teste de componente isolado não cobre plenamente."
---

# Phase 3: Intercâmbio de modalidade de cardio Verification Report

**Phase Goal:** Na sessão, o usuário troca um momento de cardio por outra modalidade aceita
(escada, bike, remo…) preservando a dose por tempo (`target_duration_seconds`); evolui o
fluxo de recusa declarada (motivo `sem_equipamento`) para substituição.

**Verified:** 2026-08-10T13:59:02Z
**Status:** human_needed
**Re-verification:** Yes — após fechamento de gaps (6 commits fora do fluxo GSD: f227129, 5a86d88, 4333d9b, 853ba26, 6a38c34, f69f45f)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1 — Um exercício de cardio da sessão oferece "trocar modalidade" listando só as modalidades aceitas do usuário | ✓ VERIFIED | `SessionQueue.tsx:117-121` (botão gated por `isTimeBased`/`!foraDeJogo`), `SwapModalitySheet.tsx` consome `getModalidadesAceitas` (D-02 estrito). Ressalva anterior (CR-02) resolvida — ver truth 5. |
| 2 | ROADMAP SC2 — A troca preserva a duração-alvo; a distância prescrita da original NÃO é exibida como meta da nova | ✓ VERIFIED | `applyCardioSwapToDraft` (`sessionModel.ts:635-656`) preserva `targetDurationSeconds` e zera `targetDistanceM` só nas séries pendentes (`s.status === 'done' ? s : {...}`); `__tests__/cardioSwap.test.ts` cobre D-01/D-04/D-08 + CR-01. |
| 3 | ROADMAP SC3 — O realizado na modalidade trocada conta normalmente no realizado do Progresso | ✓ VERIFIED | `distanciaRealizadaSemanaM`/`progressoPrescrito` somam qualquer modalidade; inalterado desde a verificação anterior; testes verdes. |
| 4 | Trocar modalidade nunca corrompe/relabela silenciosamente uma série de cardio já concluída (CR-01) | ✓ VERIFIED (fechado) | `activeSessionStore.swapExercise` (linhas 1518-1521) recusa a troca **antes** de chamar a RPC quando `alvo.sets.some(s => s.status === 'done')`, gravando `saveError`. `applyCardioSwapToDraft` (engine) também preserva sets `done` como defesa em profundidade. Teste de regressão dedicado: `cardioSwap.test.ts:150` ("CR-01 (decisão a): série já CONCLUÍDA não tem o alvo reescrito pela troca") e `cardioSwapFluxo.test.ts:224` ("CR-01 (decisão a): troca bloqueada com série concluída") — ambos passam (rodados isoladamente nesta verificação: 22/22 nos 3 arquivos de teste do swap). Sequenciamento arquitetural fecha o caso de reconciliação (`applyServerSetLogs`/`comTrocas`): como o guard client-side impede qualquer troca enquanto existir set `done`, todo evento de troca vindo do servidor, por construção, ocorreu com 0 séries concluídas — logo qualquer série `done` associada a esse exercício foi necessariamente concluída DEPOIS da troca, sob a modalidade nova, e o rótulo de nível de exercício aplicado por `comTrocas` na retomada é coerente com a realidade. |
| 5 | A lista de troca (D-02) nunca apresenta um estado travado/vazio sem explicação ao usuário (CR-02) | ✓ VERIFIED (fechado) | `SwapModalitySheet.tsx:132-137` agora usa `opcoes.length === 0` (pós-filtro) para um segundo `EmptyState` distinto ("Nenhuma outra modalidade disponível" vs. "Nenhuma modalidade cadastrada"), e o botão de confirmação (linha 164) gateia em `opcoes.length > 0`. Teste de regressão: `swapModalitySheet.test.tsx:113` (`modalidades=['Caminhada']`, `exercicioAtualNome='Caminhada'`) confirma o texto e a ausência do botão — passa. |
| 6 | A troca funciona ponta a ponta contra um banco vivo (não só contra mocks de teste) | ? UNCERTAIN — rotado para verificação humana | `AGENTS.md` (linhas 48-49) e o commit `f69f45f` registram aplicação de 0033/0034/0035 em staging e 0034/0035 em produção, ambos em 10/08/2026. Este verificador NÃO pode rodar comandos `supabase` e não confirma o estado do banco de forma independente — a reivindicação é registrada, não provada por este relatório. Ver Human Verification abaixo. |

**Score:** 5/6 truths verified (0 present, behavior-unverified) — a truth 6 permanece pendente de confirmação humana, não como falha.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0034_troca_modalidade_cardio.sql` | Tabela satélite + RPC + vocabulário fechado, testados | ✓ VERIFIED (código) / ? UNCERTAIN (deploy) | Arquivo confirmado byte-idêntico ao commit original (`git diff 08862b6 HEAD` vazio para este arquivo) — não foi editado; migration 0035 sobrepõe (create or replace) sem tocar 0034, conforme comentário na própria 0035. Aplicação em banco vivo: reportada, não confirmada por este verificador. |
| `supabase/migrations/0035_guarda_metric_troca_cardio.sql` (NOVO) | Estreita a guarda de cardio da RPC para só `metric` (WR-03/IN-02) | ✓ VERIFIED | Arquivo lido integralmente: `create or replace function public.swap_session_exercise` troca só o predicado da guarda (`pe.metric in ('tempo','tempo_distancia')`, remove `or pe.muscle_group = 'Cardio'`), preserva grants (`revoke ... from public, anon` + `grant ... to authenticated`) e adiciona asserção runtime que falha se a guarda antiga reaparecer. |
| `src/engine/sessionModel.ts` (`applyCardioSwapToDraft`, `doneLine`, `formatCardioSetResult`) | D-01/D-04/D-08 + CR-01 no motor puro | ✓ VERIFIED | `applyCardioSwapToDraft` agora preserva sets `done`; `doneLine` foi MOVIDO para o motor (antes vivia só em `SessionQueue.tsx`) e reexportado de lá para compatibilidade — single source of truth (WR-01). |
| `src/store/activeSessionStore.ts` (`swapExercise`) | Servidor primeiro, reconciliação na retomada, bloqueio CR-01 | ✓ VERIFIED | Guard `alvo.sets.some(s.status === 'done')` confirmado nas linhas 1518-1521, antes de qualquer chamada de rede. |
| `src/components/session/SwapModalitySheet.tsx` | Sheet de escolha, estados de erro/carregando/vazio×2/lista + CR-02 | ✓ VERIFIED | Segundo `EmptyState` (`opcoes.length === 0`) e condição do botão corrigida; testado. |
| `src/components/session/SessionQueue.tsx` | Entry point 1 + reexporta `doneLine` | ✓ VERIFIED | `export { doneLine }` na linha 47 para não quebrar imports existentes. |
| `src/screens/ActiveSessionScreen.tsx` | Fiação dos 2 entry points, sem código morto (WR-02) | ✓ VERIFIED | Bloco standalone `<SwapModalitySheet visible={troca != null && modalContent !== 'swap_modality'}>` removido; só resta o ramo `modalContent === 'swap_modality' && troca != null ? (<SwapModalitySheet ...` dentro do switch de conteúdo do modal (linha 600) — confirmado por grep, nenhuma segunda ocorrência de `<SwapModalitySheet` no arquivo. |
| `src/components/progress/CardioPrescritoSection.tsx` | D-05/D-06 + IN-01 renomeação | ✓ VERIFIED | `formatarMinutos` renomeada para `formatarNumeroCompacto` (linha 35), sem ocorrências residuais do nome antigo. |
| `__tests__/sessionExecutionRepository.test.ts` | Paridade histórico↔fila via a função REAL (WR-01) | ✓ VERIFIED | Importa `doneLine` de `src/engine/sessionModel` (linha 27) e chama a função real no teste de paridade (linha 109) — a réplica manual (`doneLineReplica`) foi removida. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `SessionQueue` (botão) | `ActiveSessionScreen` (estado troca) | `onSolicitarTroca` callback | ✓ WIRED | Inalterado, confirmado. |
| `ActiveSessionScreen` | `SwapModalitySheet` | props `modalidades`/`onConfirm` | ✓ WIRED | Uma única renderização agora (dead code do WR-02 removido). |
| `SwapModalitySheet.onConfirm` | `activeSessionStore.swapExercise` | `onConfirmarTroca` | ✓ WIRED | Inalterado. |
| `activeSessionStore.swapExercise` (guard CR-01) | bloqueio antes da RPC | `alvo.sets.some(s.status === 'done')` | ✓ WIRED | Confirmado por leitura direta + testes de regressão (22/22). |
| `activeSessionStore.swapExercise` | `sessionExecutionRepository.swapSessionExercise` | chamada servidor-primeiro | ✓ WIRED (código) / ? UNCERTAIN (deploy) | Código correto; existência da RPC em banco vivo não confirmada por este verificador. |
| `sessionExecutionRepository.swapSessionExercise` | RPC `swap_session_exercise` (migration 0034 + 0035) | `supabase.rpc(...)` | ✓ WIRED (código) / ? UNCERTAIN (deploy) | Idem. |
| `SkipReasonSheet` (sem_equipamento + ehCardio) | `SwapModalitySheet` (mesmo componente) | `onSolicitarTrocaAPartirDaRecusa` | ✓ WIRED | Inalterado. |
| `getSessionLogDetail` | `cardio_exercise_swaps` (embed) | `.select('...cardio_exercise_swaps(...)')` | ✓ WIRED (código) / ? UNCERTAIN (deploy) | Idem. |
| `applyServerSetLogs` (reconciliação de retomada) | `applyCardioSwapToDraft` via `comTrocas` | `(aberta.exerciseSwaps ?? []).reduce(...)` | ✓ WIRED | Set logs (`exercises`) são aplicados ANTES de `comTrocas` na função; ordem confirmada por leitura direta (linhas 372-461) — consistente com a invariante descrita na truth 4 acima. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Testes de regressão dos 2 gaps fechados (execução isolada, não a suíte inteira) | `npx jest __tests__/cardioSwap.test.ts __tests__/cardioSwapFluxo.test.ts __tests__/swapModalitySheet.test.tsx --ci` | `Test Suites: 3 passed, 3 total` / `Tests: 22 passed, 22 total` | ✓ PASS |
| Suíte completa (reconfirmada pelo orquestrador nesta sessão, não re-executada por este verificador para não duplicar) | `npx jest --ci` | `140 suítes / 1609 testes passaram` (piso anterior era 140/1605 — 4 testes novos, todos de regressão dos gaps) | ✓ PASS (evidência do orquestrador, consistente com a subamostra rodada acima) |
| Verificação de tipos (reconfirmada pelo orquestrador) | `npx tsc --noEmit` | sem erros | ✓ PASS |
| Migration 0034 não editada desde o commit original | `git diff 08862b6 HEAD -- supabase/migrations/0034_troca_modalidade_cardio.sql` | diff vazio | ✓ PASS |
| Migration 0035 contém asserção runtime anti-regressão da guarda antiga | leitura direta do arquivo | bloco `do $$ ... raise exception 'asserção falhou...' $$` presente | ✓ PASS |

### Probe Execution

Não aplicável — esta fase não declara nem usa `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-06 | 03-01..03-06 (todos) | Um momento de cardio da sessão pode ser trocado por outra modalidade aceita, preservando a dose por tempo; a distância da original não vira meta da nova | ✓ SATISFEITO no código, com verificação operacional pendente | As 3 Success Criteria do ROADMAP estão implementadas e testadas; os 2 defeitos críticos (CR-01/CR-02) que bloqueavam a verificação anterior estão fechados com teste de regressão dedicado. Resta apenas a confirmação humana de que a migration está de fato viva em staging/produção (truth 6) — reportada em `AGENTS.md`, não provada por este verificador. |

Nenhum requisito órfão: REQ-06 é o único requisito mapeado à Fase 3.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Nenhum marcador de débito (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) nos 6 arquivos de código + 1 migration tocados pelos 6 commits desta rodada (grep direto, confirmado nesta verificação) | — | — |
| `src/store/activeSessionStore.ts` | 1513-1521 | Guard CR-01 vive só no client (store); a RPC (0034/0035) continua aceitando uma troca mesmo com `set_logs` já gravado para o `planned_exercise_id` — decisão de escopo explícita do dono (defesa em profundidade server-side ficaria para uma futura 0036, não pedida) | ℹ️ Info (limitação de escopo aceita, não gap) | Ver julgamento abaixo em "Gaps Summary" — considero seguro dado o invariante de sequenciamento confirmado na truth 4, mas é um risco residual real contra race multi-dispositivo ou chamada direta à API fora do client. |

Os warnings WR-01 (paridade falsa), WR-02 (código morto) e WR-03/IN-02 (guarda de cardio mais frouxa no servidor) do `03-REVIEW.md`, e o info IN-01 (nome enganoso), estão TODOS fechados nesta rodada — confirmados por leitura direta do código, não apenas pela mensagem dos commits.

### Human Verification Required

### 1. Confirmação end-to-end contra banco vivo

**Test:** Numa sessão real em staging (ref `mjdjtiujhwklchalquhc`) ou produção (ref `zanqygwsgxkyjiuhrzju`), abrir um exercício de cardio, trocar a modalidade pelos dois entry points (fila e "sem_equipamento"), confirmar que a troca persiste no servidor, que "Trocado de X" aparece na sessão ativa e no histórico, e que o km realizado soma no Progresso.
**Expected:** Comportamento idêntico ao que os testes com mock preveem, agora contra Postgres real (RPC `swap_session_exercise` e tabela `cardio_exercise_swaps` das migrations 0034+0035).
**Why human:** `AGENTS.md`/commit `f69f45f` registram a aplicação das migrations em ambos os ambientes em 10/08/2026, mas este verificador está proibido de rodar qualquer comando `supabase` e não pode confirmar o estado do banco de forma independente. Depende também de interação de UI real (toques, animações, navegação) não coberta por teste de componente isolado.

### Gaps Summary

Os 2 gaps de código que bloqueavam a fase na verificação anterior (CR-01 e CR-02) estão **fechados**, confirmados por leitura direta do código-fonte em HEAD — não apenas pela narrativa dos commits:

1. **CR-01 fechado:** `activeSessionStore.swapExercise` agora recusa a troca ANTES de tocar o servidor quando qualquer série do exercício já está `done`, com mensagem de erro pelo mesmo canal de `skipExercise`. O motor (`applyCardioSwapToDraft`) preserva sets `done` como segunda camada de defesa. Dois testes de regressão dedicados passam. **Limitação de escopo aceita, não um gap:** o bloqueio é só client-side — a RPC `swap_session_exercise` continua aceitando a troca mesmo com `set_logs` gravado. Julgamento deste verificador: **seguro para o fluxo suportado hoje**, porque o guard client-side, combinado com a semântica "uma troca só, e só antes de qualquer conclusão" (confirmada em `swappedFrom: ex.swappedFrom ?? ex.name`, que nunca permite uma segunda troca real), fecha o invariante na retomada via `applyServerSetLogs`/`comTrocas` — qualquer swap replicado do servidor, por construção, ocorreu com 0 séries concluídas, então toda série `done` associada é necessariamente posterior à troca. O risco residual é um bypass fora do client (chamada direta à RPC, ou dois dispositivos escrevendo na mesma sessão em paralelo) — cenário fora do escopo atual do app e não coberto pelo REQ-06. Registrar como risco conhecido, não como bloqueio.
2. **CR-02 fechado:** `SwapModalitySheet` agora distingue `modalidades.length === 0` (nada cadastrado) de `opcoes.length === 0` (só a modalidade atual cadastrada), com mensagem e teste dedicados para o segundo caso.

O terceiro item da verificação anterior (migration 0034 não aplicada a nenhum ambiente vivo) mudou de natureza: não é mais um gap de código, e a evidência disponível (AGENTS.md + commit `f69f45f`, datados de hoje) É consistente com a aplicação ter ocorrido — mas este verificador está contratualmente proibido de rodar `supabase` para confirmar, e por isso o item foi reclassificado de "gap" (falha) para "verificação humana pendente" (incerteza), não descartado. Nenhum requisito da fase, no nível de código, está bloqueado; o que resta é a confirmação operacional de um fato que só um comando de banco (fora do escopo deste verificador) ou um teste manual em staging/produção pode fechar.

Os warnings/infos de menor severidade do `03-REVIEW.md` (WR-01, WR-02, WR-03, IN-01, IN-02) também foram todos fechados nesta rodada, confirmados por leitura direta: `doneLine` foi movido para o motor e o teste de paridade agora importa a função real (WR-01); o `SwapModalitySheet` standalone morto foi removido de `ActiveSessionScreen.tsx` (WR-02); a migration 0035 estreita a guarda de cardio da RPC para só `metric`, com asserção runtime anti-regressão (WR-03/IN-02); `formatarMinutos` foi renomeada para `formatarNumeroCompacto` (IN-01).

---

_Verified: 2026-08-10T13:59:02Z_
_Verifier: Claude (gsd-verifier)_
