---
phase: 01-fluxo-cardio-e-alongamento
reviewed: 2026-08-09T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - __tests__/cardioGoalsSecao.test.tsx (removido)
  - __tests__/cardioPrescrito.test.ts
  - __tests__/cardioPrescritoRepository.test.ts
  - __tests__/cardioPrescritoSecao.test.tsx
  - __tests__/manualExerciseRow.test.tsx
  - __tests__/progressScreenOrigemJoint.test.tsx
  - __tests__/sessionPlayerTransitions.test.tsx
  - backend/app.py
  - backend/data/catalogo_exercicios.json
  - backend/tests/test_exercise_catalog.py
  - backend/tests/test_prompt_molde_estrutura.py
  - src/components/progress/CardioGoalSheet.tsx (removido)
  - src/components/progress/CardioGoalsSection.tsx (removido)
  - src/components/progress/CardioPrescritoSection.tsx
  - src/components/session/ManualExerciseRow.tsx
  - src/engine/cardioPrescrito.ts
  - src/screens/ProgressScreen.tsx
  - src/services/cardioPrescritoRepository.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 01: Code Review Report — PR #77 (feat/fluxo-cardio-alongamento → main)

**Reviewed:** 2026-08-09
**Depth:** standard
**Files Reviewed:** 18 (arquivos do diff `main...HEAD` em `src/`, `backend/`, `__tests__/`)
**Status:** issues_found

## Summary

Branch confirmada (`feat/fluxo-cardio-alongamento`). Projeto sem grafo consultável (`graphify-out/` inexistente) — review feito por leitura direta do diff. `npx jest` nos 6 arquivos de teste do escopo (33 testes) e `python3 -m pytest backend/tests/test_exercise_catalog.py backend/tests/test_prompt_molde_estrutura.py` (78 testes) passam integralmente; `tsc --noEmit` não acusa erro nos arquivos tocados.

Nenhum achado CRITICAL. O item 5 de `_INSTRUCOES_MOLDE` (usado por `.replace()`) está intacto — confirmado por diff e por leitura do texto completo. A remoção de `CardioGoalsSection`/`CardioGoalSheet` não deixou import quebrado nem chamador órfão na tela; porém deixou as funções de escrita do repositório de metas (`definirMeta`, `arquivarMeta`, `registrarMetaBatida`, `getMetasAtivas`) sem nenhum chamador — ver WR-01. O ponto mais concreto do review é uma regressão de casamento de nome no catálogo (WR-02): uma consulta que antes não casava com nada agora casa silenciosamente com a entrada errada. Também há um formatador reaproveitado fora do contexto para o qual foi desenhado (WR-03), que produz texto sem sentido ("120:00") para totais semanais.

## Warnings

### WR-01: Funções de escrita de `cardio_goals` ficaram órfãs após remover CardioGoalsSection/CardioGoalSheet

**Status: fixed** — commit `0c55252`. `getMetasAtivas`, `definirMeta`, `arquivarMeta`, `registrarMetaBatida` e o tipo `CardioGoal` removidos de `cardioGoalRepository.ts`. `getCardioLogs` (leitura, ainda usada por `ProgressScreen.tsx`) e a tabela `cardio_goals` no banco ficaram intactas — confirmado por grep global antes e depois da remoção.

**File:** `src/services/cardioGoalRepository.ts:47,114,139,151`
**Issue:** A remoção de `CardioGoalsSection.tsx` e `CardioGoalSheet.tsx` eliminou os únicos chamadores de `getMetasAtivas`, `definirMeta`, `arquivarMeta` e `registrarMetaBatida` (e do tipo `CardioGoal`). Confirmado por grep: essas quatro funções não aparecem em nenhum arquivo de `src/` fora da própria definição.
```
grep -rn "CardioGoalsSection\|CardioGoalSheet\|CardioGoal\b\|getMetasAtivas" src/ __tests__/ backend/
# só ocorrências em cardioGoalRepository.ts e em comentários residuais
```
Ainda existem RPCs (`upsert_cardio_goal`, `archive_cardio_goal`, `achieve_cardio_goal`) e a tabela `cardio_goals` no banco, mas nenhum caminho de UI as aciona mais. Código morto que sobrevive ao lado do caminho ativo tende a apodrecer (schema muda, ninguém percebe) e confunde quem for procurar "quem grava meta de cardio".
**Fix:** Ou (a) remover `definirMeta`/`arquivarMeta`/`registrarMetaBatida`/`getMetasAtivas`/`CardioGoal` de `cardioGoalRepository.ts` junto com a migration de deprecação da tabela `cardio_goals`, ou (b) se a escrita for reaproveitada em outra tela no roadmap, deixar isso explícito num comentário `// mantido para <fase X>` para não ser lido como órfão esquecido.

### WR-02: Nova entrada do catálogo faz "Alongamento de Coxa" (ambíguo) casar silenciosamente com "Posterior de Coxa" — regressão de matching

**Status: fixed** — commit `83cf694`. `_melhor_por_tokens` passou a rastrear os tokens que a forma vencedora tem A MAIS em relação à consulta (`extras`) e veta o casamento quando esses extras incluem um qualificador direcional (anterior/posterior/interno/externo/medial/lateral/direito/esquerdo/superior/inferior) que a consulta nunca pediu — simétrico ao veto anatômico já existente. `resolver_exercicio("Alongamento de Coxa").casou` volta a ser `False`, como em `main`. Suíte completa `test_exercise_catalog.py` + `test_prompt_molde_estrutura.py`: 79 passed (78 pré-existentes + 1 novo), sem regressão.

**File:** `backend/data/catalogo_exercicios.json:112` (entrada `alongamento_posterior_coxa`) / `backend/services/exercise_catalog.py:228-278` (`_melhor_por_tokens`)
**Issue:** Antes deste PR, `resolver_exercicio("alongamento de coxa")` não casava com nada (`casou=False`) — confirmado rodando a versão do catálogo/serviço de `main` isolada em diretório temporário:
```
BEFORE PR: False None alongamento de coxa
```
Depois deste PR, a mesma consulta casa com `alongamento_posterior_coxa` ("Alongamento de Posterior de Coxa" — isquiotibiais):
```python
>>> resolver_exercicio("alongamento de coxa", None)
casou=True chave=alongamento_posterior_coxa nome=Alongamento de Posterior de Coxa
```
Motivo: em `_melhor_por_tokens`, quando `consulta ⊆ tokens_forma` (branch `elif`), o código NÃO aplica o limiar `_COBERTURA_MINIMA`/`_COBERTURA_MINIMA_FORMA_LONGA` que o branch irmão aplica — só o branch `tokens_forma ⊆ consulta` tem esse piso. A forma "alongamento posterior de coxa" (3 tokens) contém a consulta de 2 tokens {alongamento, coxa}, é aceita com score 2/3 sem checagem de mínimo, e o veto anatômico (`_sem_veto_anatomico`) não dispara porque "coxa" (o único token anatômico da consulta) FOI coberto pela forma vencedora — mesmo a forma trazendo "posterior" (não pedido) junto.
Cenário de falha concreto: a IA do molde escreve o nome genérico "Alongamento de Coxa" para um alongamento de quadríceps (anterior) — não é incomum um modelo menor abreviar assim, já que a instrução nova (item 8 de `_INSTRUCOES_MOLDE`) só orienta citar o grupo quando o aluno pediu foco, sem exigir "anterior"/"posterior" explícito. O catálogo agora reescreve esse nome, silenciosamente, para "Alongamento de Posterior de Coxa" (isquiotibiais) — o grupo muscular errado é gravado, e a entrada nova simétrica `alongamento_quadriceps` fica invisível para essa consulta porque nenhuma das suas formas contém o token "coxa".
Nenhum teste do PR cobre esse caso: `test_alongamento_tem_entradas_nomeadas_por_grupo_muscular` só verifica presença de nomes no catálogo, nunca resolução de nomes ambíguos.
**Fix:** Adicionar "coxa"/"quadriceps"/"perna" como alias explícito nas DUAS entradas concorrentes só quando o termo isolado não decide (ou seja, não incluir "coxa" sozinho como alias de nenhuma das duas — forçar exigência do qualificador "posterior"/"anterior"/"quadríceps"/"isquiotibiais" para casar); alternativamente, aplicar o mesmo limiar de cobertura mínima no branch `elif consulta <= tokens_forma` de `_melhor_por_tokens` (ex.: também exigir `score >= _COBERTURA_MINIMA_FORMA_LONGA` ali) para que uma consulta de 2 tokens não vença sozinha contra uma forma de 3 tokens que carrega um qualificador extra e específico. Cobrir com teste: `resolver_exercicio("Alongamento de Coxa").casou is False` (ou aponta para uma entrada genérica dedicada).

### WR-03: `formatDuration` (mm:ss de série) reaproveitado para o total semanal prescrito produz texto sem sentido

**Status: fixed** — commit `458331a`. `CardioPrescritoSection.tsx` passou a usar `formatarDuracao` (`src/utils/weekSummary.ts`), já usada alhures na mesma tela. 7200s → "Prescrito: 2h no total"; 5400s (caso não-redondo) → "Prescrito: 1h 30min no total". Teste vermelho→verde adicionado em `cardioPrescritoSecao.test.tsx`.

**File:** `src/components/progress/CardioPrescritoSection.tsx:87`
**Issue:** `formatDuration` (de `src/engine/sessionModel.ts:303-308`) formata segundos como `min:seg` (ex.: `5:03`), desenhado para a duração de UMA série/sessão. Este componente o usa para o **total semanal prescrito** (`prescricao.duracaoSegundos`, soma de todas as sessões de cardio da semana):
```
{`Prescrito: ${formatDuration(prescricao.duracaoSegundos)} no total`}
```
Para 7200 s (2 h — valor usado no próprio `prescricaoRotina()` de `__tests__/cardioPrescritoSecao.test.tsx:39`), o resultado é `"Prescrito: 120:00 no total"` — "120 minutos e 00 segundos" no formato de cronômetro, não "2h" nem "2h00". Nenhum teste do PR verifica o texto desta linha (`getByText` nunca busca "Prescrito:"), então o formato quebrado passa despercebido pela suíte. O próprio código-base já tem `formatarDuracao` (`src/utils/weekSummary.ts:119-126`, usado alhures nesta mesma tela) que produz "1h 20min"/"2h" — o formatador correto para totais semanais já existe e não foi usado aqui.
**Fix:**
```tsx
import { formatarDuracao } from '../../utils/weekSummary';
...
{prescricao.duracaoSegundos != null ? (
  <Text style={styles.detalheSecundario}>
    {`Prescrito: ${formatarDuracao(Math.round(prescricao.duracaoSegundos / 60))} no total`}
  </Text>
) : null}
```
E adicionar um `getByText(/Prescrito: 2h/)` (ou equivalente) ao teste existente para travar o formato.

## Info

### IN-01: `formatDistance(0)` some com o segmento de distância em vez de mostrar "0 km" — comportamento silenciosamente mudou

**Status: registrado, sem ação** — fora do escopo desta rodada de fix (só CRITICAL/WARNING). Requer confirmar antes se o estado transitório `distancia_km === 0` é de fato alcançável na lista via `ExercisePickerScreen.tsx`, o que o achado original já sinaliza como pendente de verificação.

**File:** `src/components/session/ManualExerciseRow.tsx:15`
**Issue:** Antes: `` ` · ${exercise.distancia_km} km` `` (sempre mostrava o número cru, inclusive "0 km"). Depois: `formatDistance(exercise.distancia_km * 1000)`, e `formatDistance` (`src/engine/sessionModel.ts:311-314`) retorna `'—'` para `meters <= 0`. Como `isValidExerciseDistance` (`src/types/manualPlan.ts:204-208`) exige `distancia_km >= 0.01` para o exercício ser salvo, `distancia_km === 0` não deveria sobreviver a um plano salvo — mas pode aparecer transitoriamente na lista durante a edição, antes do gate de validação bloquear o "Salvar". Nesse instante a linha mostraria "· —" em vez de omitir o segmento (como faz para `distancia_km == null`) ou mostrar o valor bruto.
**Fix:** Se o estado transitório com `0` for alcançável na lista (verificar em `ExercisePickerScreen.tsx`), tratar explicitamente: `exercise.distancia_km > 0 ? ... : ''` em vez de `!= null`, para não misturar "sem distância" com "distância zerada temporária" atrás do mesmo "—".

## Sem achado

Nenhum achado CRITICAL. Especificamente verificado e OK:
- Item 5 de `_INSTRUCOES_MOLDE` (usado por `.replace()` em `backend/app.py:1626`) não foi tocado pelo diff — texto idêntico a `_INSTRUCAO_EXCECOES_COM_AVULSAS`.
- As 6 novas entradas de Mobilidade em `catalogo_exercicios.json` não colidem por nome exato/alias entre si nem com entradas pré-existentes (índice `_indice()` explode em `ValueError` no load se houvesse duplicata — carregamento passou).
- `somarPrescricaoSemana`/`progressoPrescrito` (`src/engine/cardioPrescrito.ts`) não têm divisão por zero: as únicas divisões (`/60`, `/1000`) só executam quando o dividendo não é `null`, e o divisor é sempre a constante correta.
- `CardioPrescritoSection` nunca inventa número: sem prescrição mostra `EmptyState` explícito, nunca "0" fabricado; com prescrição e sem log, "0" é mostrado como fato (não "—"), coerente com a disciplina documentada em `cardioGoals.ts`.
- Nenhum import quebrado, nenhuma referência órfã a `CardioGoalsSection`/`CardioGoalSheet` sobrando em `ProgressScreen.tsx` ou em testes ativos.
- `ProgressScreen.tsx`: a troca de seção não vazou para nenhuma outra parte da tela (recordes, histórico, resumo semanal) — diff isolado ao bloco de import + estado + render da seção de cardio.
- Suítes de teste do escopo (frontend e backend) passam integralmente; `tsc --noEmit` limpo nos arquivos tocados.

---

_Reviewed: 2026-08-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
