---
phase: 02-anamnese-e-calibra-o-do-cardio
fixed_at: 2026-08-09T19:19:29Z
review_path: .planning/phases/02-anamnese-e-calibra-o-do-cardio/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 3
skipped: 0
pending_owner_decision: 1
status: partial
verification_location: isolated_worktree_with_main_dependencies
---

# Fase 02: Relatório de correção do code review

**Correção concluída em:** 2026-08-09T19:19:29Z
**Review de origem:** `.planning/phases/02-anamnese-e-calibra-o-do-cardio/02-REVIEW.md`
**Iteração:** 1

**Resumo:**
- Achados no escopo: 4
- Resolvidos: 3
- Pulados: 0
- Aguardando decisão do dono: 1 (`WR-03`)

## Achados resolvidos

### CR-01: objetivo do cardio avançava um passo ainda incompleto

**Status:** resolvido — `fixed: requires human verification`
**Arquivos modificados:** `src/screens/QuestionnaireScreen.tsx`,
`__tests__/questionnaireScreen.test.tsx`
**Commit:** `9b73654`
**Correção aplicada:** o objetivo passou a usar seleção simples, sem
`selecionarEAvancar`. O autoavanço dos passos realmente single-choice foi
preservado.

**RED — comando:**

```bash
NODE_PATH="/Users/phmarconato/ForcaApp/node_modules" \
  "/Users/phmarconato/ForcaApp/node_modules/.bin/jest" \
  __tests__/questionnaireScreen.test.tsx --runInBand \
  -t "escolher o objetivo antes de completar a dose não avança o passo do cardio"
```

**Falha literal:**

```text
FAIL __tests__/questionnaireScreen.test.tsx
Unable to find an element with text: Incluir cardio no plano?
Pergunta 10 de 11
Tests: 1 failed, 15 skipped, 16 total
```

**GREEN — mesmo comando:**

```text
PASS __tests__/questionnaireScreen.test.tsx
✓ escolher o objetivo antes de completar a dose não avança o passo do cardio
Tests: 15 skipped, 1 passed, 16 total
```

**Regressão single-choice — comando:**

```bash
NODE_PATH="/Users/phmarconato/ForcaApp/node_modules" \
  "/Users/phmarconato/ForcaApp/node_modules/.bin/jest" \
  __tests__/questionnaireScreen.test.tsx --runInBand \
  -t "escolha única avança sozinha|escolher o objetivo antes de completar a dose"
```

```text
Tests: 14 skipped, 2 passed, 16 total
```

### WR-01: distância zero divergente da faixa da migration

**Status:** resolvido — `fixed: requires human verification`
**Arquivos modificados:** `backend/services/dose_cardio.py`,
`backend/tests/test_dose_cardio.py`
**Commit:** `ee6c9a7`
**Correção aplicada:** a faixa de distância passou de `(0, 50]` para `[0, 50]`
no código e na docstring. Prática `true` com distância `0` agora deriva nível
`iniciante`.

**RED — comando:**

```bash
python3 -m pytest \
  backend/tests/test_dose_cardio.py::TestNivelCardioDeclarado::test_pratica_e_distancia_zero_e_iniciante \
  -q
```

**Falha literal:**

```text
E       AssertionError: assert 'intermediario' == 'iniciante'
FAILED backend/tests/test_dose_cardio.py::TestNivelCardioDeclarado::test_pratica_e_distancia_zero_e_iniciante
1 failed, 1 warning in 0.10s
```

**GREEN — mesmo comando:**

```text
1 passed, 1 warning in 0.05s
```

**Regressão da classificação — comando:**

```bash
python3 -m pytest backend/tests/test_dose_cardio.py::TestNivelCardioDeclarado -q
```

```text
7 passed, 1 warning in 0.04s
```

### WR-02: distância fora de 0..50 sem validação amigável

**Status:** resolvido — `fixed: requires human verification`
**Arquivos modificados:** `src/screens/QuestionnaireScreen.tsx`,
`__tests__/questionnaireScreen.test.tsx`
**Commit:** `4de4f3e`
**Correção aplicada:** a tela usa uma única regra inclusiva `0..50` no erro do
`NumericField` e no gate de `blocosRespondidos`. Para `51`, mostra “Informe uma
distância entre 0 e 50 km.”, desabilita “Continuar”, mantém a Pergunta 9 e não
chama `mockSaveQuestionnaire`. O teste também prova que `0` permanece válido.

**RED — comando:**

```bash
NODE_PATH="/Users/phmarconato/ForcaApp/node_modules" \
  "/Users/phmarconato/ForcaApp/node_modules/.bin/jest" \
  __tests__/questionnaireScreen.test.tsx --runInBand \
  -t "distância acima de 50 km mostra erro e não alcança o salvamento"
```

**Falha literal:**

```text
FAIL __tests__/questionnaireScreen.test.tsx
Unable to find an element with text: Informe uma distância entre 0 e 50 km.
"disabled": false
Tests: 1 failed, 16 skipped, 17 total
```

**GREEN — mesmo comando:**

```text
PASS __tests__/questionnaireScreen.test.tsx
✓ distância acima de 50 km mostra erro e não alcança o salvamento
Tests: 16 skipped, 1 passed, 17 total
```

**Regressão da tela — comando:**

```bash
NODE_PATH="/Users/phmarconato/ForcaApp/node_modules" \
  "/Users/phmarconato/ForcaApp/node_modules/.bin/jest" \
  __tests__/questionnaireScreen.test.tsx --runInBand
```

```text
Test Suites: 1 passed, 1 total
Tests: 17 passed, 17 total
```

## Achado aguardando decisão do dono

### WR-03: teto de progressão de cardio permanece prompt-only

**Status:** `aguardando_decisao_do_dono`
**Código alterado:** nenhum.
**Arquivos preservados:** `backend/app.py` e
`backend/schemas/molde_schema.py` não foram alterados; nenhuma validação de teto
foi adicionada em `backend/services/dose_cardio.py`.

**Opções documentadas:**

- **A — validar + retry como contrato da dose:** maior robustez e garantia local
  do teto; exige mais código e testes, pode gerar retries/custo e pode rejeitar
  regras hoje aceitas.
- **B — manter prompt-only:** custo zero e nenhum impacto no fluxo; não oferece
  garantia e permite persistir progressão acima do teto se o modelo ignorar o
  prompt.

Nada foi implementado sem aprovação do dono.

## Verificações adicionais

**Parse Python — comando:**

```bash
python3 -c "import ast; [ast.parse(open(p).read()) for p in ['backend/services/dose_cardio.py', 'backend/tests/test_dose_cardio.py']]"
```

**Resultado:** saída vazia, exit code 0.

**Local da verificação:** os testes rodaram no worktree isolado
`/tmp/sv-02-reviewfix-yo0rwk`. Como o worktree não possui `node_modules`, o Jest
usou o binário e as dependências do checkout principal via `NODE_PATH`, sem
criar link ou alterar dependências. O pytest rodou no mesmo worktree.

**Avisos preexistentes observados:** URL do Supabase ausente no ambiente de
teste; key duplicada `90` em `TIME_OPTIONS`; `urllib3` com LibreSSL. Nenhum deles
fez os testes direcionados falharem e nenhum pertence ao escopo dos achados.

**Não executado por pedido do dono:** runbook completo, suíte Jest global,
`npx tsc --noEmit`, merge, ship, push ou deploy.

## Commits e arquivos

1. `9b73654` — `fix(02): impede avanço prematuro do cardio CR-01`
2. `ee6c9a7` — `fix(02): aceita distância zero como iniciante WR-01`
3. `4de4f3e` — `fix(02): valida distância confortável do cardio WR-02`

Arquivos de código/teste alterados:

- `src/screens/QuestionnaireScreen.tsx`
- `__tests__/questionnaireScreen.test.tsx`
- `backend/services/dose_cardio.py`
- `backend/tests/test_dose_cardio.py`

---

_Corrigido em: 2026-08-09T19:19:29Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteração: 1_
