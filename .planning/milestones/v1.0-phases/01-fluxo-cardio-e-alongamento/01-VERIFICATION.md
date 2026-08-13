---
phase: 01-fluxo-cardio-e-alongamento
verified: 2026-08-13T17:03:23Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
verification_mode: retroactive
verified_against: "código vivo em HEAD (main, commit 8cfd8bc); merge original PR #77 / commit 5b0fa8c em 2026-08-09"
---

# Phase 1: Fluxo cardio e alongamento — Verification Report

**Phase Goal:** Cardio registra distância decimal com vírgula; a meta de cardio do Progresso
não existe mais como definição paralela ao treino; o alongamento tem condução (exercícios,
tempo/movimentos) que responde a pedidos de foco feitos no chat da IA.

**Verified:** 2026-08-13T17:03:23Z (retroativa — fase mesclada em 2026-08-09, PR #77, sem VERIFICATION.md original)
**Status:** passed
**Re-verification:** No — initial verification (retroactive, against today's live code)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Usuário digita "2,4" na distância do cardio, persiste e volta como 2,4 km (não 2) — REQ-01 | ✓ VERIFIED | `src/components/session/ManualExerciseRow.tsx:15` chama `formatDistance(exercise.distancia_km * 1000)`; `formatDistance` (`src/engine/sessionModel.ts:319-322`) formata `3200 → "3,2 km"` (vírgula pt-BR). Teste `__tests__/manualExerciseRow.test.tsx` roda de verdade (não só existe) e passa: `getByText(/2,4 km/)` truthy, `queryByText(/2\.4 km/)` null. Persistência confirmada por `__tests__/sessionPlayerTransitions.test.tsx:264` (`"2,4" no campo de distância vira actualDistanceM=2400`). Ambos rodados nesta verificação: **PASS**. |
| 2 | Progresso não exibe meta de cardio desconectada — deriva da prescrição do plano (CardioPrescritoSection substituiu CardioGoalsSection) — REQ-02 | ✓ VERIFIED | `src/screens/ProgressScreen.tsx:36-38,265-270` importa e renderiza `CardioPrescritoSection` alimentado por `getPrescricaoSemanaCorrente` (não há import de `CardioGoalsSection`/`getMetasAtivas` em nenhum arquivo de `src/`, confirmado por grep). `src/services/cardioPrescritoRepository.ts:53-62` faz query real ao Supabase (`planned_sessions`→`planned_exercises`→`planned_sets`, filtrada por `user_id`+`plan_id`+`muscle_group='Cardio'`+janela da semana corrente), com `if (error) throw error`. `CardioPrescritoSection.tsx` (lido integralmente) não tem nenhum botão/ação de escrita de meta — só leitura + `onRecarregar`. `CardioGoalsSection.tsx`/`CardioGoalSheet.tsx` não existem mais em `src/components/progress/` (confirmado por `ls` e grep — só sobram 2 referências em comentário, sem import ativo). |
| 3 | Na parte de alongamento da sessão, o usuário vê quais exercícios e quanto tempo/movimentos — REQ-03 | ✓ VERIFIED | Catálogo `backend/data/catalogo_exercicios.json` tem 10 entradas do grupo `Mobilidade`, todas com `"metrica": "tempo"` (4 originais + 6 novas nomeadas por grupo muscular: posterior de coxa, peito, lombar, panturrilha, glúteos, quadríceps — linhas 108-117). No app, `SessionPlayer.tsx:489,642` renderiza `exercise.name` (nome do exercício vindo do plano) e `alvoDaSerie()` (`SessionPlayer.tsx:87-93`) mostra `formatDuration(set.targetDurationSeconds)` para exercícios `isTimeBased` — exatamente a classe à qual `metrica=tempo` pertence (`isTimeBased`/`metricOf`, `sessionModel.ts:277-281`). Ou seja: nome do exercício + tempo aparecem juntos na condução da sessão. |
| 4 | Pedido de foco de alongamento no chat da IA muda a condução apresentada — REQ-03 | ✓ VERIFIED (evidência humana) | Não automatizável por natureza (chamada real e paga à API de geração — `01-VALIDATION.md`, seção "Manual-Only Verifications", linha 70). Evidência de código: item 8 de `_INSTRUCOES_MOLDE` (`backend/app.py:1491-1496`) instrui a IA a priorizar nomes do catálogo de Mobilidade citados em `DIRETRIZES DO ALUNO` quando há pedido de foco; esse bloco convive no MESMO prompt que injeta `diretrizes_str` (`backend/app.py:1710-1711`, confirmado por `test_instrui_priorizar_foco_de_alongamento_junto_das_diretrizes`, que roda GREEN nesta verificação). O checkpoint humano bloqueante da Task 3 do plano 01-04 (geração real no HML) foi **aprovado pelo dono em 2026-08-09**, registrado no `ROADMAP.md` (linha 45: "checkpoint humano aprovado 2026-08-09 em geração real no HML"; linha 178: "Complete (gate verde + checkpoint HML + review PR #77 corrigido)") e **reconfirmado pelo dono em 2026-08-13** durante a auditoria do milestone v1.0 (nota datada em `01-04-SUMMARY.md`, frontmatter `requirements-completed`). Tratado como evidência humana válida, conforme instrução explícita desta verificação — não reaberto como pendência. |

**Score:** 4/4 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/session/ManualExerciseRow.tsx` | Exibe distância via `formatDistance` (vírgula pt-BR) | ✓ VERIFIED | Linha 5 import, linha 15 uso; sem interpolação crua remanescente |
| `src/engine/cardioPrescrito.ts` | Motor puro `somarPrescricaoSemana` + `progressoPrescrito` | ✓ VERIFIED | Existe, consumido por repositório e por `CardioPrescritoSection` |
| `src/services/cardioPrescritoRepository.ts` | `getPrescricaoSemanaCorrente` lendo `planned_sets` do plano ativo | ✓ VERIFIED | Query real ao Supabase confirmada linha a linha (não stub, não retorno estático) |
| `src/components/progress/CardioPrescritoSection.tsx` | Seção de leitura prescrito×realizado, sem escrita de meta | ✓ VERIFIED | Lido integralmente; nenhum botão/handler de escrita de meta |
| `src/screens/ProgressScreen.tsx` | Religado a `CardioPrescritoSection`/`getPrescricaoSemanaCorrente`, sem `CardioGoalsSection` | ✓ VERIFIED | Import/uso confirmados; grep negativo para `CardioGoalsSection`/`getMetasAtivas` |
| `src/components/progress/CardioGoalsSection.tsx`, `CardioGoalSheet.tsx` | Devem ter sido removidos | ✓ VERIFIED (ausência confirmada) | Não existem em `src/components/progress/` (`ls` confirmado) |
| `backend/data/catalogo_exercicios.json` | Catálogo Mobilidade com 6 exercícios novos, `metrica=tempo` | ✓ VERIFIED | 10 entradas Mobilidade confirmadas (grep literal do JSON) |
| `backend/app.py` (`_INSTRUCOES_MOLDE`) | Item de prompt instruindo foco de alongamento | ✓ VERIFIED | Item 8, linhas 1491-1496, no mesmo bloco que `diretrizes_str` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `ManualExerciseRow.tsx` | `sessionModel.ts` (`formatDistance`) | import + chamada direta | ✓ WIRED | Linha 5 (import), linha 15 (chamada) |
| `ProgressScreen.tsx` | `CardioPrescritoSection.tsx` | import + render com props `logs/prescricao/erro/onRecarregar` | ✓ WIRED | Linhas 38, 265-270 |
| `ProgressScreen.tsx` | `cardioPrescritoRepository.ts` (`getPrescricaoSemanaCorrente`) | `Promise.all([...])` no `carregar()` | ✓ WIRED | Linhas 36, 99-111 |
| `cardioPrescritoRepository.ts` | Supabase (`planned_sessions`/`planned_exercises`/`planned_sets`) | query real com filtros + `throw error` | ✓ WIRED | Linhas 53-63 |
| `cardioPrescritoRepository.ts` | `cardioPrescrito.ts` (`somarPrescricaoSemana`) | import + chamada no retorno | ✓ WIRED | Linhas 17-21, 83 |
| `SessionPlayer.tsx` | `sessionModel.ts` (`isTimeBased`, `formatDuration`, `formatDistance`) | import + `alvoDaSerie()` | ✓ WIRED | Linhas 25-38, 87-93 |
| `backend/app.py` (`_INSTRUCOES_MOLDE` item 8) | `diretrizes_str` (preferências do aluno) | mesmo bloco de prompt (`DIRETRIZES DO ALUNO`) | ✓ WIRED | Linhas 1491-1496 + 1710-1711; confirmado por teste que roda GREEN |
| `backend/data/catalogo_exercicios.json` (Mobilidade) | Geração de plano (via `exercise_catalog.py`) | catálogo é fonte única de nomes oferecidos à IA | ✓ WIRED | `resolver_exercicio()`/`catalogo_para_prompt()` no grafo do projeto consomem o mesmo arquivo |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `CardioPrescritoSection.tsx` | `prescricao` (prop) | `getPrescricaoSemanaCorrente` → Supabase `.from('planned_sessions').select(...)` com `.eq/.gte/.lt` reais | Sim — query real contra `planned_sets` do plano ativo, sem retorno estático | ✓ FLOWING |
| `CardioPrescritoSection.tsx` | `logs` (prop) | `getCardioLogs(user.id)` (repositório pré-existente, não tocado nesta fase) | Sim | ✓ FLOWING |
| `ManualExerciseRow.tsx` | `exercise.distancia_km` | Prop vinda de `ManualExerciseDraft` (estado do editor manual) | Sim — não hardcoded | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ManualExerciseRow exibe "2,4 km" | `npx jest __tests__/manualExerciseRow.test.tsx --silent` | PASS (3/3) | ✓ PASS |
| SessionPlayer persiste decimal digitado | `npx jest __tests__/sessionPlayerTransitions.test.tsx --silent` | PASS | ✓ PASS |
| Motor cardioPrescrito agrega corretamente | `npx jest __tests__/cardioPrescrito.test.ts --silent` | PASS (9/9) | ✓ PASS |
| Repositório lê prescrição do plano ativo | `npx jest __tests__/cardioPrescritoRepository.test.ts --silent` | PASS (4/4) | ✓ PASS |
| CardioPrescritoSection sem UI de escrita | `npx jest __tests__/cardioPrescritoSecao.test.tsx --silent` | PASS (8/8) | ✓ PASS |
| ProgressScreen religado, regressão de origem conjunta | `npx jest __tests__/progressScreenOrigemJoint.test.tsx --silent` | PASS (4/4) | ✓ PASS |
| Catálogo + prompt do molde (backend) | `python3 -m pytest backend/tests/test_exercise_catalog.py backend/tests/test_prompt_molde_estrutura.py -q` | **79 passed** | ✓ PASS |
| Typecheck do projeto | `npx tsc --noEmit` | sem erro, exit 0 | ✓ PASS |

Total: 6 suites Jest (40 testes) + 2 suites pytest (79 testes) rodadas de verdade nesta sessão de verificação — nenhum resultado copiado de SUMMARY.md.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-01 | 01-01 | Distância decimal pt-BR na exibição e persistência do cardio | ✓ SATISFIED | Truth 1 acima |
| REQ-02 | 01-02, 01-03 | Meta de cardio do Progresso deriva da prescrição do plano ativo | ✓ SATISFIED | Truth 2 acima |
| REQ-03 | 01-04 | Alongamento com condução (exercícios/tempo) e foco pilotável pelo chat | ✓ SATISFIED | Truths 3 e 4 acima |

Nenhum requisito órfão encontrado (REQ-01/02/03 são os únicos mapeados à Fase 1 no ROADMAP.md).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/screens/ProgressScreen.tsx` | 290 | `// TODO (dono): seção própria "Dupla" para recordes da dupla.` | ℹ️ Info | Fora do escopo da Fase 1 (seção "Recordes", não "Cardio"/"Alongamento"); referencia decisão pendente do dono, não um gap de implementação desta fase. Não bloqueia. |

Nenhum `FIXME`/`XXX`/`TBD` sem referência de issue encontrado nos arquivos tocados pela Fase 1. Os dois outros matches de "TODO" em `backend/app.py` são falsos-positivos do grep (palavra "todo"/"TODO" em português significa "every", não marcador de débito — confirmado por leitura de contexto).

### Human Verification Required

Nenhum item pendente. O único ponto da fase que exige julgamento humano (Truth 4 — REQ-03, geração real de plano) já tem evidência humana documentada e datada (aprovação do dono em 2026-08-09, reconfirmada em 2026-08-13), com proveniência rastreável em `ROADMAP.md` (PR #77) e no frontmatter de `01-04-SUMMARY.md`. Não há necessidade de reabrir esta verificação para um novo checkpoint humano.

### Gaps Summary

Nenhum gap encontrado. Os 4 Success Criteria do ROADMAP.md para a Fase 1 têm evidência viva no código de hoje (2026-08-13), não apenas nas SUMMARYs dos planos: comportamento de exibição/persistência decimal confirmado por teste executado agora; ausência total de `CardioGoalsSection`/`getMetasAtivas` no código confirmada por grep; `CardioPrescritoSection` fazendo query real (não stub) contra `planned_sets`; catálogo de Mobilidade com 6 exercícios novos e prompt do molde com a instrução de foco no mesmo bloco de `diretrizes_str`; suítes de teste relevantes (frontend e backend) executadas nesta sessão com 100% de aprovação (40 testes Jest + 79 testes pytest); `npx tsc --noEmit` sem erro. Nenhuma regressão em relação ao que as 4 SUMMARYs da fase descreveram.

---

_Verified: 2026-08-13T17:03:23Z_
_Verifier: Claude (gsd-verifier) — verificação retroativa, goal-backward contra código vivo_
