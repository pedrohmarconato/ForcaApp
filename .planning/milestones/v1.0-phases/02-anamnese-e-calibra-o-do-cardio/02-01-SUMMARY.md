---
phase: 02-anamnese-e-calibra-o-do-cardio
plan: 01
subsystem: api
tags: [react-native, expo, flask, questionnaire, prompt-engineering, anthropic]

# Dependency graph
requires:
  - phase: 01-fluxo-cardio-e-alongamento
    provides: "_INSTRUCOES_MOLDE com 9 itens numerados (plano 01-04), dose_cardio.py e dose_cardio_str já existentes em _executar_geracao_molde/_montar_chamada_do_molde"
provides:
  - "Campo cardio_pratica_atualmente (boolean) ponta a ponta: tela → formDataForApi → QuestionnairePayload → payload de submissão, com teste de payload nos dois lados"
  - "nivel_cardio_declarado + TETO_PROGRESSAO_POR_NIVEL (backend/services/dose_cardio.py) — motor completo de derivação de nível, pronto para os 2 sinais que o Plano 02-03 ainda vai adicionar (cardio_distancia_confortavel_km já suportado)"
  - "_instrucao_calibracao_cardio (backend/app.py) — bloco de calibração concatenado ao dose_cardio_str existente, entra na parte volátil do prompt do molde"
affects: [02-02-migracao-questionario-usuario, 02-03-anamnese-completa-e-wiring-ui]

# Actuals (#2632)
actuals:
  tokens: 4137
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nível de cardio derivado deterministicamente no backend (função pura, testável sem IA) — mesma filosofia de dose_declarada()"
    - "Instrução de calibração por aluno concatenada ao parâmetro dose_cardio_str já existente em _montar_chamada_do_molde, nunca em _INSTRUCOES_MOLDE (bloco estável/cacheado)"

key-files:
  created: []
  modified:
    - src/screens/QuestionnaireScreen.tsx
    - src/services/api/questionnaireService.ts
    - __tests__/questionnaireScreen.test.tsx
    - __tests__/questionnaireService.test.ts
    - backend/services/dose_cardio.py
    - backend/app.py
    - backend/tests/test_dose_cardio.py

key-decisions:
  - "Rótulos do par novo são 'Sim, já pratico'/'Não, ainda não' (não 'Sim'/'Não') porque OptionButton usa label como accessibilityLabel sem outro identificador — colidiria com o par de includeCardio já visível no mesmo passo."
  - "Sem distância válida mas com prática confirmada → nível 'intermediario' (meio-termo, dado incompleto), não 'iniciante' nem 'avancado'."
  - "cardio_pratica_atualmente=False → sempre 'iniciante', independente de qualquer distância declarada (dado incoerente não vira nível mais alto)."

patterns-established:
  - "Anamnese de cardio como campo de ESTADO SEPARADO da dose declarada (cardioPraticaAtualmente vs cardioDias/cardioMinutos) — mesmo padrão de limpeza ao desligar includeCardio."

requirements-completed: [REQ-04, REQ-05]

coverage:
  - id: D1
    description: "Pergunta 'Já pratica corrida, caminhada rápida, pedal ou outro cardio hoje?' aparece no passo de cardio e a resposta chega ao payload como cardio_pratica_atualmente (boolean exato)"
    requirement: "REQ-04"
    verification:
      - kind: unit
        ref: "__tests__/questionnaireScreen.test.tsx#QuestionnaireScreen — submissão > envia o payload esperado e navega para os ajustes finais"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backend deriva um nível de cardio (iniciante/intermediario/avancado) deterministicamente de cardio_pratica_atualmente/cardio_distancia_confortavel_km, sem lançar exceção para dado ausente ou malformado"
    requirement: "REQ-05"
    verification:
      - kind: unit
        ref: "backend/tests/test_dose_cardio.py#TestNivelCardioDeclarado"
        status: pass
    human_judgment: false
  - id: D3
    description: "Instrução de calibração (nível + teto de progressão) entra na parte VOLÁTIL do prompt do molde, nunca na parte estável/cacheada"
    requirement: "REQ-05"
    verification:
      - kind: unit
        ref: "backend/tests/test_dose_cardio.py#TestCalibracaoNoPrompt#test_calibracao_entra_na_chamada_do_molde_na_parte_volatil"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-09
status: complete
---

# Phase 2 Plan 1: Anamnese de cardio (tracer) e motor de calibração no prompt Summary

**Um campo de anamnese ("já pratica cardio hoje?") atravessando tela → payload → backend, mais o motor completo de derivação de nível e calibração de dose/teto de progressão no prompt do molde, sem tocar `_INSTRUCOES_MOLDE` nem `molde_schema.py`.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-09T14:50:38-03:00 (base commit)
- **Completed:** 2026-08-09T15:05:20-03:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `cardio_pratica_atualmente` (boolean) capturado no passo de cardio do questionário, com o mesmo padrão de estado/limpeza/hidratação/gate de `cardioDias`/`cardioMinutos`, e chegando comprovadamente ao `formDataForApi`/`QuestionnairePayload` — provado em teste de payload nos dois arquivos de teste (`questionnaireScreen.test.tsx` e `questionnaireService.test.ts`).
- `nivel_cardio_declarado()` deriva iniciante/intermediário/avançado dos dois sinais de anamnese (`cardio_pratica_atualmente`/`cardio_distancia_confortavel_km`), nunca lança exceção, e `TETO_PROGRESSAO_POR_NIVEL` fixa os tetos (3.0/6.0/10.0) dentro do limite `[1.0, 10.0]` que `molde_schema.py::delta_cardio_percentual` já aceita para todos os alunos.
- `_instrucao_calibracao_cardio()` compõe o bloco "CALIBRAÇÃO DE CARDIO" e é concatenada ao `dose_cardio_str` já existente em `_executar_geracao_molde` — entra na parte VOLÁTIL do prompt (por aluno), nunca em `_INSTRUCOES_MOLDE` (bloco estável/cacheado que o plano 01-04 da Fase 1 já edita), eliminando qualquer risco de colisão de diff.
- 14 testes jest (`questionnaireScreen`) + 5 testes jest (`questionnaireService`) + 54 testes pytest (`test_dose_cardio.py`, incluindo as 2 classes novas `TestNivelCardioDeclarado`/`TestCalibracaoNoPrompt`) verdes; `npx tsc --noEmit` verde; `git diff backend/schemas/molde_schema.py` vazio.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Uma pergunta de anamnese ponta a ponta — "já pratica cardio hoje?" até o payload** - `df5ba84` (feat)
2. **Task 2: Nível de cardio declarado → instrução de calibração no prompt** - `acd3df2` (feat)

**Plan metadata:** SUMMARY.md commit (this file)

_Note: Task 1 is `type="tracer"` — its `<verify>` (`npx jest __tests__/questionnaireScreen.test.tsx`) was re-run end-to-end after commit, per the tracer feedback gate, before starting Task 2 (expansion). It passed (14/14) — logged "⚡ Tracer verified end-to-end — expanding"._

## Files Created/Modified
- `src/screens/QuestionnaireScreen.tsx` - estado `cardioPraticaAtualmente`, limpeza em `definirIncluiCardio`, hidratação em `loadSavedData`, gate em `blocosRespondidos()`, par de `OptionButton` novo ("Sim, já pratico"/"Não, ainda não") entre "Prefere alguma modalidade?" e `botaoContinuar`, chave nova em `formDataForApi`
- `src/services/api/questionnaireService.ts` - `QuestionnairePayload.cardio_pratica_atualmente: boolean | null`
- `__tests__/questionnaireScreen.test.tsx` - press do campo novo em `preencherTudo`, asserção `cardio_pratica_atualmente: true` no `objectContaining` do payload
- `__tests__/questionnaireService.test.ts` - literal `QuestionnairePayload` estendido com `cardio_pratica_atualmente: true` (bloqueado por `tsc` sem isto — excess-property-check)
- `backend/services/dose_cardio.py` - `TETO_PROGRESSAO_POR_NIVEL`, `nivel_cardio_declarado()`
- `backend/app.py` - `_TEXTO_NIVEL_CARDIO`, `_instrucao_calibracao_cardio()`, `_executar_geracao_molde` agora soma `_instrucao_dose_cardio` + `_instrucao_calibracao_cardio` via `dose_cardio_str = "\n\n".join(filter(None, [...]))`
- `backend/tests/test_dose_cardio.py` - `TestNivelCardioDeclarado` (6 testes), `TestCalibracaoNoPrompt` (4 testes, incluindo parametrizado do teto por nível)

## Decisions Made
- Rótulos "Sim, já pratico"/"Não, ainda não" (não "Sim"/"Não") — `OptionButton` usa `label` como `accessibilityLabel` sem outro identificador; os dois pares (`includeCardio` e o novo) ficam visíveis ao mesmo tempo no mesmo passo, e rótulos iguais colidiriam em teste/acessibilidade.
- Sem distância válida mas com prática confirmada (`cardio_pratica_atualmente=True` sem `cardio_distancia_confortavel_km` válido) → nível "intermediario", meio-termo intencional para dado incompleto.
- `cardio_pratica_atualmente=False` → sempre "iniciante", independentemente de qualquer distância declarada — evita que um dado incoerente (não pratica, mas declara distância alta) produza um nível mais agressivo do que o aluno demonstrou merecer.
- Teto de progressão por nível (3.0/6.0/10.0) escolhido dentro do range `[1.0, 10.0]` do schema, com o nível "avancado" no teto máximo do schema (não pode pedir mais que isso).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `__tests__/questionnaireService.test.ts` reprovava `tsc --noEmit` após estender `QuestionnairePayload`**
- **Found during:** Task 1 (verificação `npx tsc --noEmit`)
- **Issue:** o literal `QuestionnairePayload` de `questionnaireService.test.ts` (arquivo não listado em `files_modified` do plano) não tinha `cardio_pratica_atualmente`, e o TypeScript reprova por excess-property-check em tipos de objeto literal contra interface com campo obrigatório ausente.
- **Fix:** adicionada a chave `cardio_pratica_atualmente: true` ao literal `payload` do teste.
- **Files modified:** `__tests__/questionnaireService.test.ts`
- **Verification:** `npx tsc --noEmit` limpo; `npx jest __tests__/questionnaireService.test.ts` verde (5/5).
- **Committed in:** `df5ba84` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessário para o portão de tipo (`tsc`) explicitamente exigido na `acceptance_criteria` da Task 1. Sem escopo adicional além do arquivo de teste que o próprio tipo tocado já obrigava a atualizar.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None. Nenhum dado hardcoded/mock chegando à UI de produção; a anamnese entra no fluxo real de submissão do questionário.

## Threat Flags
None. O threat model do plano (T-02-01/02/03) foi seguido exatamente — campo booleano estrito, teste de payload cross-checado, mesma RLS existente.

## Next Phase Readiness
- Plano 02-02 (migração `questionario_usuario`) pode prosseguir: o campo `cardio_pratica_atualmente` já tem nome estável reutilizável na coluna nova.
- Plano 02-03 herda `nivel_cardio_declarado()` já pronto para `cardio_distancia_confortavel_km` (só falta a UI desse campo e do terceiro sinal de anamnese, objetivo).
- REQ-04/REQ-05 estão PARCIALMENTE completos por este plano (1 de 3 campos de anamnese ponta a ponta; motor de nível/calibração completo mas ainda alimentado por só 1 dos 2 sinais previstos) — Plano 02-03 fecha o restante do escopo declarado no ROADMAP da Fase 2.

---
*Phase: 02-anamnese-e-calibra-o-do-cardio*
*Completed: 2026-08-09*
