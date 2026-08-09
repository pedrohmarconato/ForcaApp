---
phase: 01-fluxo-cardio-e-alongamento
plan: 04
subsystem: api
tags: [flask, catalogo-exercicios, prompt-engineering, claude, mobilidade]

# Dependency graph
requires:
  - phase: 01-fluxo-cardio-e-alongamento
    provides: "diretrizes.preferencias já chega ao prompt do molde via _dados_do_aluno_no_prompt (pesquisa 01-RESEARCH.md); nenhum encanamento novo foi necessário"
provides:
  - "Catálogo de Mobilidade com 6 exercícios de alongamento nomeados por grupo muscular alvo (112 itens no total, antes 106)"
  - "_INSTRUCOES_MOLDE (backend/app.py) com item 8 instruindo a IA a priorizar esses nomes quando diretrizes.preferencias pedir foco de alongamento"
affects: [fluxo-cardio-e-alongamento, geracao-de-plano, prompt-do-molde]

# Actuals (#2632)
actuals:
  tokens: 9500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expansão aditiva de catálogo de dado versionado (JSON) sem mudança de schema estruturado"
    - "Instrução dedicada no prompt para forçar uso de um dado que já chegava sem efeito (RESEARCH.md, Pitfall 3: texto solto sem instrução não muda comportamento)"

key-files:
  created: []
  modified:
    - backend/data/catalogo_exercicios.json
    - backend/tests/test_exercise_catalog.py
    - backend/app.py
    - backend/tests/test_prompt_molde_estrutura.py

key-decisions:
  - "6 exercícios novos de Mobilidade (posterior de coxa, peito, lombar, panturrilha, glúteos, quadríceps), todos com o mesmo shape das 4 entradas existentes e metrica=tempo — sem mudança de schema do molde"
  - "Novo item 8 em _INSTRUCOES_MOLDE inserido ANTES do antigo item 8 (agora 9, 'Retorne SOMENTE o JSON...'); item 5 (usado por .replace()) e o layout legado/v2 permaneceram intocados"

patterns-established:
  - "Catálogo é a fonte única de nomes oferecidos à IA (backend/services/exercise_catalog.py) — expansão de grupo muscular existente é sempre aditiva, sem migration"

requirements-completed: []  # REQ-03 fica pendente até a Task 3 (checkpoint humano) ser aprovada — ver seção Checkpoint Pendente

coverage:
  - id: D1
    description: "Catálogo de Mobilidade tem 6 exercícios novos nomeados por grupo muscular, sem colisão de chave/alias com as 106 entradas existentes"
    requirement: "REQ-03"
    verification:
      - kind: unit
        ref: "backend/tests/test_exercise_catalog.py#test_alongamento_tem_entradas_nomeadas_por_grupo_muscular"
        status: pass
      - kind: unit
        ref: "backend/tests/test_exercise_catalog.py#TestIntegridadeDoCatalogo::test_nenhum_alias_aponta_para_dois_exercicios"
        status: pass
    human_judgment: false
  - id: D2
    description: "_INSTRUCOES_MOLDE instrui a IA a priorizar nomes de Mobilidade citados em diretrizes.preferencias quando houver pedido de foco de alongamento"
    requirement: "REQ-03"
    verification:
      - kind: unit
        ref: "backend/tests/test_prompt_molde_estrutura.py#test_instrui_priorizar_foco_de_alongamento_junto_das_diretrizes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Uma geração REAL de plano (chamada paga à API) respeita um pedido de foco de alongamento feito no chat de onboarding"
    requirement: "REQ-03"
    verification: []
    human_judgment: true
    rationale: "Testes automatizados provam que o prompt CONTÉM a instrução e o dado, mas não que o modelo de IA real OBEDECE a ela — isso exige uma chamada real e paga à API (RESEARCH.md, Assumption A5), que é exatamente o objeto da Task 3 (checkpoint:human-verify, ainda não executada)."

duration: 20min
completed: 2026-08-09
status: complete
---

# Phase 1 Plan 4: Alongamento nomeado por grupo muscular + prompt com foco Summary

**Catálogo de Mobilidade expandido de 4 para 10 exercícios (6 novos nomeados por grupo muscular alvo) e novo item 8 em `_INSTRUCOES_MOLDE` instruindo a IA a priorizar esses nomes quando `diretrizes.preferencias` pedir foco de alongamento — Tasks 1 e 2 completas e verdes; Task 3 (checkpoint humano com geração real) aguarda execução do dono.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-09T00:40:00-03:00 (aprox.)
- **Completed:** 2026-08-09T00:45:00-03:00 (Tasks 1-2); Task 3 pendente
- **Tasks:** 2/3 completas (Task 3 é checkpoint humano bloqueante)
- **Files modified:** 4

## Accomplishments
- Catálogo de Mobilidade (`backend/data/catalogo_exercicios.json`) ganhou 6 entradas nomeadas por grupo muscular: Alongamento de Posterior de Coxa, de Peito, Lombar, de Panturrilha, de Glúteos e de Quadríceps (106 → 112 itens no total)
- `_INSTRUCOES_MOLDE` (`backend/app.py`) ganhou o item 8, instruindo a IA a checar `DIRETRIZES DO ALUNO` por um pedido de foco de alongamento e priorizar o nome específico do catálogo em vez dos genéricos ("Alongamento Dinâmico", "Aquecimento Articular")
- 2 testes novos cobrindo estrutura (nomes agrupados por `nomes_por_grupo()['Mobilidade']`) e prompt (instrução no mesmo bloco que `diretrizes_str`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Expandir o catálogo de Mobilidade com entradas nomeadas por grupo muscular** - `2225739` (feat)
2. **Task 2: Instruir o prompt do molde a usar preferencias na escolha de Mobilidade** - `2d505cd` (feat)
3. **Task 3: Confirmar em geração real que o foco de alongamento é respeitado** - PENDENTE (checkpoint:human-verify, gate="blocking") — ver seção abaixo

**Plan metadata:** este SUMMARY (commit a seguir)

## Files Created/Modified
- `backend/data/catalogo_exercicios.json` - 6 entradas novas de Mobilidade nomeadas por grupo muscular (106 → 112 itens)
- `backend/tests/test_exercise_catalog.py` - 3 asserções de contagem exata atualizadas (106 → 112) + `test_alongamento_tem_entradas_nomeadas_por_grupo_muscular`
- `backend/app.py` - novo item 8 em `_INSTRUCOES_MOLDE` (item antigo 8 renumerado para 9); item 5 e layout legado/v2 intocados
- `backend/tests/test_prompt_molde_estrutura.py` - `test_instrui_priorizar_foco_de_alongamento_junto_das_diretrizes`

## Decisions Made
- Aliases dos 6 exercícios novos seguem o padrão pt-BR/inglês das 4 entradas existentes de Mobilidade (ex.: "hamstring stretch" para posterior de coxa)
- Nenhum campo novo entrou em `molde_schema.py` (confirmado: `git diff backend/schemas/molde_schema.py` vazio) — decisão travada em CONTEXT.md, representação por `duracao_minutos` já suportada e já renderizada pelo `SessionPlayer`

## Deviations from Plan

None - plan executado exatamente como escrito nas Tasks 1 e 2.

## Issues Encountered

Nenhum bloqueio técnico. `grep -c "^[0-9]\."` restrito ao range de linhas fixo `1444-1470` subestimou a contagem de itens numerados (cortou o item 9 no meio da leitura) — confirmado corretamente com `awk` delimitando pelo início e fim reais do bloco `_INSTRUCOES_MOLDE`: **9 itens**, como esperado.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Checkpoint Pendente — Task 3 (gate="blocking", checkpoint:human-verify)

**Esta Task NÃO foi executada pelo executor** — envolve uma chamada real e paga à API de IA (geração de plano), fora do escopo automatizável desta sessão, e o próprio plano proíbe chamá-la aqui.

**O que já está pronto para o dono verificar:**
1. Catálogo de Mobilidade expandido (Task 1, commit `2225739`) e prompt reforçado (Task 2, commit `2d505cd`), ambos com testes automatizados verdes.
2. `python3 -m pytest backend/tests/test_exercise_catalog.py backend/tests/test_prompt_molde_estrutura.py -q` → **78 passed**.
3. `git diff backend/schemas/molde_schema.py` vazio e `git status supabase/migrations/` vazio — nenhuma porta de mão única foi aberta.

**O que o dono precisa fazer (roteiro da Task 3, do PLAN):**
1. No app (ambiente de desenvolvimento/HML), rodar o onboarding até `PostQuestionnaireChat` e escrever um pedido de foco de alongamento, ex.: "quero foco em alongamento de posterior de coxa".
2. Confirmar em `/api/consolidate-chat` (ou nos logs do backend) que `diretrizes.preferencias` recebeu esse texto.
3. Gerar o plano (`/api/generate-plan`) e inspecionar o plano gerado: a sessão com Mobilidade deve conter "Alongamento de Posterior de Coxa" (ou nome equivalente do catálogo expandido) em vez de só os 4 genéricos anteriores.
4. Se a IA ignorar o pedido em 2 gerações seguidas, o reforço de prompt da Task 2 é insuficiente — reportar antes de seguir, sem ajuste unilateral do executor.

**Resume signal esperado:** "aprovado" (se o plano gerado refletiu o foco pedido) ou descrição do que saiu diferente.

**REQ-03 permanece aberto** (não marcado em `requirements-completed`) até a Task 3 ser aprovada pelo dono.

## Next Phase Readiness
- Tasks 1 e 2 prontas para review; REQ-03 fecha assim que a Task 3 for aprovada pelo dono
- Nenhum blocker técnico para as próximas fases (REQ-04/05/06, Fases 2-3)

---
*Phase: 01-fluxo-cardio-e-alongamento*
*Completed: 2026-08-09 (Tasks 1-2; Task 3 pendente)*

## Self-Check: PASSED

Todos os arquivos criados/modificados existem em disco e ambos os commits de task (`2225739`, `2d505cd`) foram confirmados em `git log --oneline --all`.
