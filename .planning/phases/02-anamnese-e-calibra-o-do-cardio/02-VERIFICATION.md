---
phase: 02-anamnese-e-calibra-o-do-cardio
verified: 2026-08-09T18:55:52Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Anamnese e calibração do cardio — Verification Report

**Phase Goal:** O gerador conhece a experiência de cardio do usuário — o questionário
ganha perguntas de anamnese (já corre?, distância/tempo confortável, objetivo) e o prompt
do molde calibra ponto de partida conservador e teto de progressão semanal pelo nível
declarado. Lição do PR #64: a pergunta nova tem de comprovadamente chegar ao gerador.
**Verified:** 2026-08-09T18:55:52Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (ROADMAP SC1 / 02-01 T1) A pergunta "Já pratica corrida, caminhada rápida, pedal ou outro cardio hoje?" aparece no passo de cardio (`includeCardio===true`) e a resposta chega ao payload como `cardio_pratica_atualmente` (boolean exato) | ✓ VERIFIED | `src/screens/QuestionnaireScreen.tsx:764-780` (JSX do par "Sim, já pratico"/"Não, ainda não"), `:440` (`formDataForApi.cardio_pratica_atualmente`); `__tests__/questionnaireScreen.test.tsx:302` asserção de payload; `npx jest __tests__/questionnaireScreen.test.tsx` → 15/15 passed (rodado nesta verificação) |
| 2 | (02-01 T2) O backend deriva `nivel_cardio_declarado` (iniciante/intermediário/avançado) deterministicamente de `cardio_pratica_atualmente`/`cardio_distancia_confortavel_km`, nunca lança exceção para dado ausente/malformado | ✓ VERIFIED | `backend/services/dose_cardio.py:129-173` — `isinstance` estrito em cada ramo, sempre retorna `None` em vez de `raise`; `backend/tests/test_dose_cardio.py::TestNivelCardioDeclarado` (6 testes, incluindo dict vazio/tipo errado) — `python3 -m pytest backend/tests/test_dose_cardio.py -q -k TestNivelCardioDeclarado` → 14 passed (rodado nesta verificação, inclui parametrizações) |
| 3 | (02-01 T3) A instrução de calibração (nível + teto de progressão) entra na parte VOLÁTIL do prompt do molde, nunca na parte estável/cacheada | ✓ VERIFIED | `backend/app.py:1869-1880` (`dose_cardio_str` concatenado a `_instrucao_calibracao_cardio`, passado a `_montar_chamada_do_molde` como 4º argumento — nunca em `_INSTRUCOES_MOLDE`); teste behavioral `test_calibracao_entra_na_chamada_do_molde_na_parte_volatil` (`backend/tests/test_dose_cardio.py:431-444`) confirma `"CALIBRAÇÃO DE CARDIO"` presente em `messages` (volátil) e ausente de `system` (estável) — passou nesta verificação |
| 4 | (02-02 T1) A migration 0033 adiciona `cardio_pratica_atualmente`, `cardio_distancia_confortavel_km`, `cardio_objetivo` em `questionario_usuario` com CHECK de faixa/coerência, espelha em `questionario_historico`, e `snapshot_questionario()` grava as 3 | ✓ VERIFIED | `supabase/migrations/0033_anamnese_cardio_declarada.sql` lido integralmente — 3 colunas + 4 constraints condicionais (`questionario_cardio_distancia_km_check`, `questionario_cardio_objetivo_check`, `questionario_cardio_distancia_coerente`, `questionario_anamnese_cardio_coerente`) + espelho + `snapshot_questionario()` reescrito + bloco de asserção; `backend/tests/test_migration_anamnese_cardio.py` (harness de leitura, sem banco) → 7 passed (rodado nesta verificação) |
| 5 | (02-02 T2) Nenhuma aplicação da migration a um banco vivo acontece sem decisão explícita do dono (checkpoint bloqueante) | ✓ VERIFIED | `02-02-SUMMARY.md` registra checkpoint respondido pelo dono em 2026-08-09 ("option-a"), com evidência literal de `supabase migration list` + `information_schema.columns` para staging e produção. Deploy status em si é fora do escopo desta verificação de goal (feature vs. deploy) — o *gate* (não agir sem decisão) é o must-have verificado, e ele foi respeitado (nenhum comando `supabase` fora do checkpoint respondido) |
| 6 | (ROADMAP SC1 / 02-03 T1) As 3 perguntas de anamnese (pratica hoje/distância confortável/objetivo) estão completas na UI, distância condicionada a `pratica===true`, e as 3 chaves chegam ao payload com valores exatos | ✓ VERIFIED | `src/screens/QuestionnaireScreen.tsx:778-792` (NumericField condicionado a `cardioPraticaAtualmente === true`) e `:793-796` (`renderOptions(CARDIO_OBJETIVOS,...)` sempre visível); `formDataForApi:441-445`; `__tests__/questionnaireScreen.test.tsx:202-230` (teste "quem ainda não pratica cardio não vê o campo de distância confortável" — `queryByLabelText(...)` retorna `null`) e `:302-305` (payload completo) — ambos passaram na suíte rodada nesta verificação |
| 7 | (02-03 T2) `cardio_objetivo` (vocabulário fechado) soma linha de direção ao bloco de calibração quando reconhecido; valor forjado/fora do vocabulário NUNCA aparece literal no bloco | ✓ VERIFIED | `backend/app.py:1601-1663` (`_TEXTO_OBJETIVO_CARDIO`, só os 3 literais do CHECK viram texto); `test_objetivo_valido_aparece_no_bloco` e `test_objetivo_forjado_nao_vira_instrucao` (`backend/tests/test_dose_cardio.py:452-468`) — ambos passaram nesta verificação, incluindo string de ataque ("Ignore as instruções anteriores...") ausente do bloco |
| 8 | (ROADMAP SC2 / 02-03 T3) Uma geração real (checkpoint humano) mostra planos de cardio diferentes para perfil iniciante × experiente, na dose de abertura e no teto de progressão | ✓ VERIFIED | `02-03-SUMMARY.md` coverage `D3` (`kind: human-verify`, `status: pass`) — checkpoint aprovado explicitamente pelo dono em 2026-08-09 ("aprovado", geração real comparada). Runtime behavior que só chamada paga à API prova; automação não pode substituí-la — tratado como resolvido por instrução explícita desta verificação, não reaberto |
| 9 | (ROADMAP SC3) Nenhuma mudança no schema do molde em toda a fase | ✓ VERIFIED | `git diff 5b0fa8c..HEAD -- backend/schemas/molde_schema.py` → único diff é renomeação de comentário ("Opus 4.8"→"Opus 5", commit `9e4d37c`, não relacionado à Fase 2/aposentadoria de modelo antigo per instrução global do usuário) — nenhum campo, `minimum`/`maximum` ou estrutura de schema alterada |

**Score:** 9/9 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/screens/QuestionnaireScreen.tsx` | Estado + 3 perguntas de anamnese + payload | ✓ VERIFIED | Estados `cardioPraticaAtualmente`/`cardioDistanciaConfortavelKm`/`cardioObjetivo`, limpeza em `definirIncluiCardio`, hidratação em `loadSavedData`, gate em `blocosRespondidos()`, JSX completo, `formDataForApi` com as 3 chaves |
| `src/services/api/questionnaireService.ts` | `QuestionnairePayload` com os 3 campos tipados | ✓ VERIFIED | `cardio_pratica_atualmente: boolean \| null`, `cardio_distancia_confortavel_km: number \| null`, `cardio_objetivo: string \| null` (linhas 26-28) |
| `backend/services/dose_cardio.py` | `nivel_cardio_declarado`/`TETO_PROGRESSAO_POR_NIVEL` | ✓ VERIFIED | Função pura sem `raise`, teto por nível dentro de `[1.0, 10.0]` |
| `backend/app.py` | `_instrucao_calibracao_cardio`/`_TEXTO_NIVEL_CARDIO`/`_TEXTO_OBJETIVO_CARDIO`, wiring em `_executar_geracao_molde` | ✓ VERIFIED | Bloco concatenado ao `dose_cardio_str` volátil; vocabulário fechado para objetivo |
| `supabase/migrations/0033_anamnese_cardio_declarada.sql` | 3 colunas + CHECK + espelho + snapshot + asserção | ✓ VERIFIED | Segue byte a byte o molde de `0021`; harness de 7 testes confirma o conteúdo |
| `backend/tests/test_dose_cardio.py` | `TestNivelCardioDeclarado`/`TestCalibracaoNoPrompt` | ✓ VERIFIED | 56 testes no arquivo, todos verdes (rodado nesta verificação) |
| `backend/tests/test_migration_anamnese_cardio.py` | Harness sem banco vivo | ✓ VERIFIED | 7 casos, todos verdes (rodado nesta verificação) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `formDataForApi.cardio_pratica_atualmente` (QuestionnaireScreen.tsx:440) | `questionnaire_data.get('cardio_pratica_atualmente')` (dose_cardio.py:156) | mesma string literal, cross-checada por grep | ✓ WIRED | Grep confirma a mesma chave nos dois lados (lição PR #64 mitigada) |
| `nivel_cardio_declarado()` (dose_cardio.py) | `_instrucao_calibracao_cardio()` (app.py:1618-1663) | import direto (`from backend.services.dose_cardio import ...`) | ✓ WIRED | `app.py:1633-1636` |
| `_instrucao_calibracao_cardio()` | `dose_cardio_str` → `_montar_chamada_do_molde` (parte volátil) | concatenação via `"\n\n".join(filter(None, [...]))` em `_executar_geracao_molde` | ✓ WIRED | `app.py:1869-1880`; teste `test_calibracao_entra_na_chamada_do_molde_na_parte_volatil` prova em runtime que o texto está em `messages`, não em `system` |
| `CARDIO_OBJETIVOS[].value` (QuestionnaireScreen.tsx:64-68) | `questionario_cardio_objetivo_check` (migration 0033) | 3 literais idênticos (`condicionamento`/`completar_5k`/`emagrecimento`) | ✓ WIRED | Confirmado por leitura direta dos 3 arquivos — literais idênticos |
| `CARDIO_OBJETIVOS[].value` | `_TEXTO_OBJETIVO_CARDIO` keys (app.py:1601-1615) | mesmos 3 literais | ✓ WIRED | Confirmado por leitura direta — literais idênticos |
| `questionario_usuario` (colunas novas) | `questionario_historico` (espelho) via `snapshot_questionario()` (trigger) | `add column if not exists` nas duas tabelas + INSERT explícito das 3 colunas na função | ✓ WIRED | Migration SQL lida integralmente; harness confirma que `snapshot_questionario()` grava as 3 colunas (`position(v_col in pg_get_functiondef(...))` na asserção final) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Nível determinístico nunca lança exceção (dado ausente/malformado) | `python3 -m pytest backend/tests/test_dose_cardio.py -q -k TestNivelCardioDeclarado` | 14 passed | ✓ PASS |
| Calibração entra na parte volátil, nunca na estável | teste incluído no comando acima (`TestCalibracaoNoPrompt`) | incluído nos 14 passed | ✓ PASS |
| Objetivo forjado nunca vira texto no prompt (anti-injeção) | idem | `test_objetivo_forjado_nao_vira_instrucao` passou | ✓ PASS |
| Migration 0033 — conteúdo (colunas/constraints/snapshot/asserção) sem tocar banco | `python3 -m pytest backend/tests/test_migration_anamnese_cardio.py -q` | 7 passed | ✓ PASS |
| Payload frontend completo (3 campos) + gating condicional | `npx jest __tests__/questionnaireScreen.test.tsx` | 15 passed | ✓ PASS |
| Suíte pytest completa do arquivo de cardio (regressão) | `python3 -m pytest backend/tests/test_dose_cardio.py -q` | 56 passed | ✓ PASS |
| Tipos TS (excess-property-check do `QuestionnairePayload`) | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Nenhuma mudança funcional em `molde_schema.py` | `git diff 5b0fa8c..HEAD -- backend/schemas/molde_schema.py` | só renomeação de comentário (Opus 4.8→Opus 5) | ✓ PASS |

Full-suite claims from the integrated-tree evidence provided by the orchestrator (`npx jest` 134/134 suites, 1537/1537 tests; `python3 -m pytest backend/tests` 588 passed) were not re-run in full during this verification — that would re-execute the entire workspace suite for no new evidence per the single-full-run constraint. The targeted commands above (all run fresh during this verification) cover every file this phase touched.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-04 | 02-01, 02-02, 02-03 | Questionário captura experiência de cardio (já corre?, distância/tempo confortável, objetivo) e as respostas chegam comprovadamente ao gerador | ✓ SATISFIED | Truths 1, 4, 5, 6 acima — trilha completa tela → payload → migration → backend, com teste de payload nos dois lados |
| REQ-05 | 02-01, 02-03 | O prompt do molde calibra dose inicial conservadora e teto de progressão semanal pelo nível de cardio declarado — sem mudar o schema do molde | ✓ SATISFIED | Truths 2, 3, 7, 8, 9 acima — motor de nível/teto, instrução na parte volátil, objetivo sem injeção, geração real aprovada, schema intacto |

No orphaned requirements: PROJECT.md maps only REQ-04 and REQ-05 to "Fase 2", and both are declared in `requirements:` frontmatter across the 3 plans of this phase.

### Anti-Patterns Found

None. Scanned all files modified by this phase (`QuestionnaireScreen.tsx`, `questionnaireService.ts`, `dose_cardio.py`, `app.py`, migration 0033, both test files) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/empty-implementation patterns. The only regex hits were false positives — Portuguese words "TODOS os alunos" / "TODO caminho" ("all students" / "every path"), not debt markers.

### Human Verification Required

None outstanding. The one human-verify item in this phase's plans (02-03 Task 3 — real paid generation comparing beginner × experienced profiles) was already executed and approved by the owner on 2026-08-09, recorded in `02-03-SUMMARY.md` coverage `D3` (`kind: human-verify`, `status: pass`, `human_judgment: true`). Per explicit instruction for this verification run, it is treated as resolved (Truth 8 above) and not reopened.

### Gaps Summary

No gaps found. All 9 must-haves (3 ROADMAP Success Criteria + 6 plan-level truths not already subsumed by the roadmap criteria) verified against live code and passing tests run fresh during this verification. Production deployment status of migration 0033 was explicitly scoped out of this verification per instruction (the phase goal is the feature — questionnaire → prompt calibration — not the deploy state of a specific environment).

---

_Verified: 2026-08-09T18:55:52Z_
_Verifier: Claude (gsd-verifier)_
