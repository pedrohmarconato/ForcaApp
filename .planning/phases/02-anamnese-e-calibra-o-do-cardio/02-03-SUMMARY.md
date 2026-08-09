---
phase: 02-anamnese-e-calibra-o-do-cardio
plan: 03
subsystem: api
tags: [react-native, expo, flask, questionnaire, prompt-engineering, anthropic]

# Dependency graph
requires:
  - phase: 02-anamnese-e-calibra-o-do-cardio
    provides: "cardio_pratica_atualmente ponta a ponta (02-01) + nivel_cardio_declarado()/_instrucao_calibracao_cardio (02-01) + migration 0033 aplicada em staging (02-02)"
provides:
  - "Distância confortável hoje (NumericField, condicionada a cardio_pratica_atualmente===true) e objetivo do cardio (vocabulário fechado) completos na UI, chegando a formDataForApi/QuestionnairePayload"
  - "_TEXTO_OBJETIVO_CARDIO (backend/app.py) — objetivo válido soma linha de direção ao bloco CALIBRAÇÃO DE CARDIO; valor fora do vocabulário fechado é ignorado em silêncio (anti-injeção testada)"
affects: []

# Actuals (#2632)
actuals:
  tokens: 5375
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vocabulário fechado de texto do aluno → dicionário de texto FIXO no backend (mesma regra de canonicalizar_modalidades_cardio) — segunda aplicação do padrão nesta fase (o primeiro foi cardio_modalidades)"

key-files:
  created: []
  modified:
    - src/screens/QuestionnaireScreen.tsx
    - src/services/api/questionnaireService.ts
    - __tests__/questionnaireScreen.test.tsx
    - __tests__/questionnaireService.test.ts
    - __tests__/doseCardioQuestionario.test.tsx
    - __tests__/questionnaireDiasESessao.test.tsx
    - backend/app.py
    - backend/tests/test_dose_cardio.py

key-decisions:
  - "Distância confortável só renderiza quando cardio_pratica_atualmente===true (mesma coerência da migration 0033); objetivo sempre renderiza quando includeCardio===true, independente da prática atual."
  - "_instrucao_calibracao_cardio agora soma a linha de objetivo MESMO quando nivel_cardio_declarado() for None — só devolve bloco vazio quando NEM nível NEM objetivo válido existem."
  - "CARDIO_OBJETIVOS usa renderOptions (single-select com auto-avanço de step) — decisão do plano; irPara() já limpa o timer pendente, então o auto-avanço não colide com o clique explícito em Continuar."

patterns-established:
  - "Segunda aplicação do padrão 'vocabulário fechado → dicionário de texto fixo, nunca o valor cru' (o primeiro foi cardio_modalidades/canonicalizar_modalidades_cardio na Fase 1/02-01) — agora replicado para cardio_objetivo."

requirements-completed: []  # REQ-04/REQ-05 ficam pendentes até a Task 3 (checkpoint humano) ser aprovada — ver seção Checkpoint Pendente

coverage:
  - id: D1
    description: "Distância confortável hoje (NumericField) e objetivo do cardio (vocabulário fechado) completos na UI, com distância condicionada a cardio_pratica_atualmente===true, e as 3 chaves de anamnese chegando ao payload com os valores exatos"
    requirement: "REQ-04"
    verification:
      - kind: unit
        ref: "__tests__/questionnaireScreen.test.tsx#QuestionnaireScreen — submissão > envia o payload esperado e navega para os ajustes finais"
        status: pass
      - kind: unit
        ref: "__tests__/questionnaireScreen.test.tsx#QuestionnaireScreen — stepper e validação por passo > quem ainda não pratica cardio não vê o campo de distância confortável"
        status: pass
    human_judgment: false
  - id: D2
    description: "cardio_objetivo (vocabulário fechado) soma uma linha de direção ao bloco de calibração quando reconhecido; um valor forjado/fora do vocabulário nunca aparece literal no bloco"
    requirement: "REQ-05"
    verification:
      - kind: unit
        ref: "backend/tests/test_dose_cardio.py#TestCalibracaoNoPrompt::test_objetivo_valido_aparece_no_bloco"
        status: pass
      - kind: unit
        ref: "backend/tests/test_dose_cardio.py#TestCalibracaoNoPrompt::test_objetivo_forjado_nao_vira_instrucao"
        status: pass
    human_judgment: false
  - id: D3
    description: "Uma geração REAL de plano (chamada paga à API) mostra planos de cardio diferentes para um perfil iniciante e um experiente, tanto na dose de abertura quanto no teto de progressão citado no molde"
    requirement: "REQ-05"
    verification: []
    human_judgment: true
    rationale: "Testes automatizados provam que o prompt CONTÉM a instrução de calibração e que ela varia por nível/objetivo, mas não que o MODELO DE IA real, ao ler essa instrução, de fato gera doses/progressões diferentes — isso exige chamada real e paga à API (mesmo racional do checkpoint humano do plano 01-04 da Fase 1), que é exatamente o objeto da Task 3 (checkpoint:human-verify, gate=\"blocking\", ainda não executada)."

duration: 10min
completed: 2026-08-09
status: complete
---

# Phase 2 Plan 3: Distância confortável + objetivo do cardio na UI, calibração por objetivo no prompt Summary

**As 3 perguntas de anamnese de cardio ficam completas na UI (pratica hoje / distância confortável / objetivo), e `cardio_objetivo` (vocabulário fechado) passa a somar uma linha de direção ao bloco `CALIBRAÇÃO DE CARDIO` do prompt — Tasks 1 e 2 completas e verdes; Task 3 (checkpoint humano com geração real) aguarda execução do dono.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-09T15:18:19-03:00 (base commit)
- **Completed:** 2026-08-09T15:27:57-03:00 (Tasks 1-2); Task 3 pendente
- **Tasks:** 2/3 completas (Task 3 é checkpoint humano bloqueante)
- **Files modified:** 8

## Accomplishments
- `QuestionnaireScreen.tsx`: `NumericField` "Distância confortável hoje (km)" — condicionada a `cardioPraticaAtualmente === true`, mesmo componente/padrão decimal-com-vírgula que REQ-01 já fixou (nunca `TextInput` cru) — e `CARDIO_OBJETIVOS` (vocabulário fechado: `condicionamento`/`completar_5k`/`emagrecimento`, os mesmos 3 literais do CHECK da migration 0033), ambos chegando a `formDataForApi` como `cardio_distancia_confortavel_km` e `cardio_objetivo`; limpeza ao desligar cardio, hidratação do rascunho e gate de `blocosRespondidos()` cobrindo os 2 campos novos.
- `questionnaireService.ts`: `QuestionnairePayload` com os 2 campos novos, tipados.
- `backend/app.py`: `_TEXTO_OBJETIVO_CARDIO` (dicionário de texto FIXO, mesma regra de `canonicalizar_modalidades_cardio`) e `_instrucao_calibracao_cardio` estendida — um `cardio_objetivo` reconhecido soma uma linha de direção ao bloco `CALIBRAÇÃO DE CARDIO` (mesmo quando não há nível derivável); um valor fora do vocabulário fechado é ignorado em silêncio, nunca ecoado literalmente.
- 15 testes jest (`questionnaireScreen`) + 5 testes jest (`questionnaireService`) + 13 testes jest (`doseCardioQuestionario` + `questionnaireDiasESessao`, navegação atualizada para responder as 2 perguntas novas) + 56 testes pytest (`test_dose_cardio.py`, incluindo os 2 novos `test_objetivo_valido_aparece_no_bloco`/`test_objetivo_forjado_nao_vira_instrucao`) verdes; suíte jest completa do repo (134 suites / 1536 testes) verde; `npx tsc --noEmit` verde; `git diff backend/schemas/molde_schema.py` vazio.

## Task Commits

Each task was committed atomically:

1. **Task 1: Distância confortável + objetivo do cardio na UI** - `306793d` (feat)
2. **Task 2: Objetivo do cardio (vocabulário fechado) soma direção ao bloco de calibração** - `cf30d52` (feat)
3. **Task 3: Confirmar em geração real que iniciante × experiente recebem cardio diferente** - PENDENTE (checkpoint:human-verify, gate="blocking") — ver seção abaixo

**Plan metadata:** este SUMMARY (commit a seguir, formato `docs(02-03): ...`)

## Files Created/Modified
- `src/screens/QuestionnaireScreen.tsx` - estados `cardioDistanciaConfortavelKm`/`cardioObjetivo`, constante `CARDIO_OBJETIVOS`, limpeza em `definirIncluiCardio`, hidratação em `loadSavedData`, gate em `blocosRespondidos()` (distância só obrigatória quando `cardioPraticaAtualmente===true`; objetivo sempre obrigatório com `includeCardio===true`), `NumericField` + `renderOptions` no JSX do passo de cardio, chaves novas em `formDataForApi`
- `src/services/api/questionnaireService.ts` - `QuestionnairePayload.cardio_distancia_confortavel_km: number | null` e `cardio_objetivo: string | null`
- `__tests__/questionnaireScreen.test.tsx` - `preencherTudo` preenche distância (`5,5`) e objetivo (`completar_5k`); asserção de payload estendida; teste novo de gating condicional (sem prática → sem campo de distância)
- `__tests__/questionnaireService.test.ts` - literal `QuestionnairePayload` estendido com os 2 campos (bloqueado por `tsc` sem isto — excess-property-check, mesmo padrão do desvio do Plano 02-01)
- `__tests__/doseCardioQuestionario.test.tsx`, `__tests__/questionnaireDiasESessao.test.tsx` - navegação helper atualizada para responder distância + objetivo antes de "Continuar", onde "Sim, já pratico" já era pressionado (mesmo padrão do commit 2eba466 que tratou a primeira pergunta de anamnese)
- `backend/app.py` - `_TEXTO_OBJETIVO_CARDIO` (3 chaves exatas), `_instrucao_calibracao_cardio` reescrita para compor o bloco a partir de nível E/OU objetivo (antes só nível)
- `backend/tests/test_dose_cardio.py` - `test_objetivo_valido_aparece_no_bloco`, `test_objetivo_forjado_nao_vira_instrucao` (anti-injeção, molde de `test_modalidade_forjada_nao_chega_ao_prompt`)

## Decisions Made
- Distância confortável só renderiza/é exigida quando `cardioPraticaAtualmente === true` — replica a regra de coerência da migration 0033 (`questionario_cardio_distancia_coerente`); objetivo é sempre exigido com `includeCardio === true`, independente da prática atual (alguém que ainda não pratica também tem um objetivo).
- `_instrucao_calibracao_cardio` foi reestruturada para montar o bloco a partir de nível E/OU objetivo — antes só devolvia `""` quando `nivel is None`; agora só devolve `""` quando NEM nível NEM objetivo válido existem, permitindo que um objetivo reconhecido some direção ao prompt mesmo sem `cardio_pratica_atualmente` respondido (dado incompleto, mas objetivo ainda é sinal útil).
- `CARDIO_OBJETIVOS` usa `renderOptions` (single-select com auto-avanço via `selecionarEAvancar`), conforme o texto do plano — verificado que `irPara()` (disparado pelo clique explícito em "Continuar") já limpa qualquer timer de auto-avanço pendente, então não há corrida entre o auto-avanço da escolha de objetivo e o "Continuar" explícito do passo.

## Deviations from Plan

None - plano executado exatamente como escrito nas Tasks 1 e 2. A atualização das navegações de `doseCardioQuestionario.test.tsx`/`questionnaireDiasESessao.test.tsx` estava explicitamente antecipada no contexto de execução (wave-1) como consequência esperada de adicionar mais perguntas de gating, não um desvio.

## Issues Encountered

Nenhum bloqueio técnico. `npx jest` completo (134 suites / 1536 testes) já apresentava um warning pré-existente de key duplicada em `TIME_OPTIONS` (`Encountered two children with the same key, '90'`) — fora do escopo desta task (nenhum arquivo tocado por este plano define `TIME_OPTIONS`), não foi corrigido (SCOPE BOUNDARY).

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Checkpoint Pendente — Task 3 (gate="blocking", checkpoint:human-verify)

**Esta Task NÃO foi executada pelo executor** — envolve uma chamada real e paga à API de IA (geração de plano) comparando dois perfis de aluno, fora do escopo automatizável desta sessão (o executor roda isolado em worktree, sem UI interativa nem decisão de gastar API paga sem o dono no controle).

**O que já está pronto para o dono verificar:**
1. As 3 perguntas de anamnese de cardio (pratica hoje / distância confortável / objetivo) completas na UI (Task 1, commit `306793d`) e a instrução de calibração por objetivo no prompt (Task 2, commit `cf30d52`), ambas com testes automatizados verdes.
2. `python3 -m pytest backend/tests/test_dose_cardio.py -q` → **56 passed**.
3. `npx jest` (suíte completa) → **134 suites / 1536 testes passed**; `npx tsc --noEmit` → limpo.
4. `git diff backend/schemas/molde_schema.py` vazio — nenhuma porta de mão única foi aberta.
5. Migration 0033 já aplicada em `forcaapp-staging` (Plano 02-02) — o questionário já pode salvar os 3 campos nesse ambiente. **Produção ainda não recebeu a migration** (decisão explícita do dono, Plano 02-02) — a Task 3 só pode rodar contra staging/dev até essa aplicação acontecer.

**O que o dono precisa fazer (roteiro da Task 3, do PLAN):**
1. Confirmar que a migration 0033 está aplicada no ambiente onde o teste vai rodar (staging, conforme Plano 02-02).
2. No app, rodar o onboarding DUAS vezes com o MESMO perfil de treino (dias, tempo, objetivo geral), variando só a anamnese de cardio: (a) "Não, ainda não" pratica / objetivo "Condicionamento geral"; (b) "Sim, já pratico" / distância "10" km / objetivo "Completar uma corrida de 5km".
3. Gerar os dois planos e comparar a semana 1 de cardio: (a) deve ser mais conservadora que (b).
4. Comparar `delta_cardio_percentual` (se presente) nos dois moldes: (a) não deve exceder ~3%/semana; (b) pode chegar a 10%/semana.
5. Se os dois planos saírem indistinguíveis em 2 gerações seguidas de cada cenário, reportar antes de seguir — sem ajuste unilateral do executor.

**Resume signal esperado:** "aprovado" (se os planos diferiram como esperado) ou descrição do que saiu igual/diferente do previsto.

**REQ-04/REQ-05 permanecem abertos** (não marcados em `requirements-completed`) até a Task 3 ser aprovada pelo dono.

## Next Phase Readiness
- Tasks 1 e 2 prontas para review; REQ-04/REQ-05 fecham (e os 3 Success Criteria da Fase 2 no ROADMAP) assim que a Task 3 for aprovada pelo dono.
- Nenhum blocker técnico remanescente nesta fase.

---
*Phase: 02-anamnese-e-calibra-o-do-cardio*
*Completed: 2026-08-09 (Tasks 1-2; Task 3 pendente)*

## Self-Check: PASSED
- FOUND: src/screens/QuestionnaireScreen.tsx (NumericField, CARDIO_OBJETIVOS)
- FOUND: backend/app.py (_TEXTO_OBJETIVO_CARDIO)
- FOUND: commit 306793d (git log --oneline --all)
- FOUND: commit cf30d52 (git log --oneline --all)
