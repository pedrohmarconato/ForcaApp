---
phase: 02-anamnese-e-calibra-o-do-cardio
reviewed: 2026-08-09T00:00:00Z
fixed_at: 2026-08-09T19:19:29Z
fix_iteration: 1
depth: standard
files_reviewed: 30
files_reviewed_list:
  - __tests__/direcao03-fase2-onboarding.test.tsx
  - __tests__/doseCardioQuestionario.test.tsx
  - __tests__/planoOrfaoNaTela.test.tsx
  - __tests__/postQuestionnaireChatInit.test.tsx
  - __tests__/postQuestionnaireChatSkip.test.tsx
  - __tests__/postQuestionnaireChatUnavailable.test.tsx
  - __tests__/questionnaireDiasESessao.test.tsx
  - __tests__/questionnaireScreen.test.tsx
  - __tests__/questionnaireService.test.ts
  - .env.example
  - backend/app.py
  - backend/Dockerfile
  - backend/schemas/molde_schema.py
  - backend/services/ai_quota.py
  - backend/services/dose_cardio.py
  - backend/tests/test_app_security.py
  - backend/tests/test_dose_cardio.py
  - backend/tests/test_hml_smoke_regressoes.py
  - backend/tests/test_migration_anamnese_cardio.py
  - backend/tests/test_molde_garantias_perdidas.py
  - backend/tests/test_prompt_molde_estrutura.py
  - backend/tests/test_quota_ia.py
  - backend/tests/test_treinador_parsing.py
  - backend/utils/config.py
  - backend/wrappers/treinador_especialista.py
  - docker-compose.yml
  - docs/AMBIENTE_HML.md
  - src/screens/QuestionnaireScreen.tsx
  - src/services/api/questionnaireService.ts
  - supabase/migrations/0033_anamnese_cardio_declarada.sql
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
  resolved: 3
  aguardando_decisao_do_dono: 1
status: aguardando_decisao_do_dono
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** aguardando_decisao_do_dono

## Summary

### Estado após a correção — iteração 1

- `CR-01`, `WR-01` e `WR-02`: **resolvidos** com TDD e commits atômicos.
- `WR-03`: **`aguardando_decisao_do_dono`**. Nenhuma validação do teto foi
  implementada sem aprovação; `backend/app.py` permaneceu intacto.
- O runbook completo não foi executado nesta etapa; os testes direcionados e a
  suíte de `questionnaireScreen.test.tsx` ficaram verdes. Evidências completas
  constam em `02-REVIEW-FIX.md`.

Reviewed the cardio anamnesis flow (3 new questionnaire fields flowing
`QuestionnaireScreen.tsx` → `questionnaireService.ts` → migration 0033 →
`dose_cardio.py`/`app.py` calibration prompt) plus the two owner-approved
maintenance changes (`claude-opus-4-8` → `claude-opus-5` swap, `secureStorage`
mock fixes in tests).

The maintenance changes are clean — grepped the whole repo for leftover
`opus-4-8` references and found none; `.env.example`, `docker-compose.yml`,
`Dockerfile`, `AMBIENTE_HML.md`, `ai_quota.py`, `config.py` and
`treinador_especialista.py` all agree on `claude-opus-5`. The `secureStorage`
mock fixes (adding `removeLegacyPlaintextCopy` to 5 test files) are a
legitimate fix for a masked `TypeError` that was being silently swallowed.

The new anamnesis fields (`cardio_pratica_atualmente`,
`cardio_distancia_confortavel_km`, `cardio_objetivo`) are consistent across
the three places that must agree (frontend `CARDIO_OBJETIVOS`, backend
`_TEXTO_OBJETIVO_CARDIO`, migration 0033's `CHECK` vocabulary), and the
migration itself is well-formed (coherence constraints, historical-table
mirroring, snapshot trigger rewrite, self-checking assertion block).

One BLOCKER was found: reusing the shared single-choice `renderOptions`
helper for the new "objetivo do cardio" question re-introduces the exact
auto-advance failure mode that an adjacent comment in the same file
explicitly documents as fixed for the "Sim"/cardio-on toggle — selecting a
cardio objective silently advances the stepper past the still-incomplete
cardio step. Three WARNINGs concern a distance-boundary inconsistency
between the migration and `nivel_cardio_declarado()`, a missing client-side
range check that lets a raw Postgres error reach the user, and an
enforcement asymmetry between the "dose" (hard contract, validated
post-generation) and the new "calibração" ceiling (soft prompt text only,
never checked against what the model actually returns).

## Critical Issues

### CR-01: Selecting the cardio objective auto-advances the stepper past an incomplete cardio step

**Status:** resolvido
**Commit:** `9b73654`
**Nota GSD:** `fixed: requires human verification` por alterar a lógica de
navegação do stepper; o comportamento está coberto por RTL com fake timers.
**Evidência:** RED reproduziu a saída indevida para “Pergunta 10 de 11” após
`jest.advanceTimersByTime(300)`; GREEN manteve “Pergunta 9 de 11”. O teste de
regressão da escolha única também permaneceu verde, preservando o autoavanço
nos passos de campo único.
**Correção aplicada:** o objetivo do cardio agora usa `OptionButton` com setter
simples, como dias/minutos e o toggle de prática, sem passar por
`selecionarEAvancar`.

**File:** `src/screens/QuestionnaireScreen.tsx:801-804`
**Issue:**

The new "Qual seu objetivo com o cardio?" question is rendered with the
shared `renderOptions()` helper:

```tsx
<View style={styles.field}>
  <Text style={styles.label}>Qual seu objetivo com o cardio?</Text>
  {renderOptions(CARDIO_OBJETIVOS, cardioObjetivo, (v) => setCardioObjetivo(v as string))}
</View>

{botaoContinuar(blocos[8])}
```

`renderOptions` wires every option's `onPress` through `selecionarEAvancar`
(`QuestionnaireScreen.tsx:511-519`), which — unconditionally, with no check
against `blocos[8]` — arms a 280 ms timer that calls
`setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))`. That is the exact
"escolha única avança sozinha" behavior used for single-field steps
elsewhere in the file.

But the cardio step is a *multi-field* step, and the author already
identified and defended against this exact risk two lines above the "Sim"
toggle:

```tsx
{/* "Sim" NÃO auto-avança: a dose aparece logo abaixo e o avanço
    automático levaria o aluno embora antes de ele responder. */}
```

The same reasoning applies verbatim to "objetivo": nothing in the UI forces
the aluno to answer dias/minutos/pratica/distância *before* picking an
objective — a user who taps the objective option first (e.g., scrolls to
the bottom, answers the last visible question, then scrolls back up) gets
silently carried to "Incluir alongamentos no plano?" 280 ms later,
regardless of whether `cardioDias`, `cardioMinutos`,
`cardioPraticaAtualmente` or `cardioDistanciaConfortavelKm` are still
`null`. `dias`/`minutos` (`onPress={() => setCardioDias(dias)}`,
`onPress={() => setCardioMinutos(min)}`) and modalidades
(`alternarModalidade`) were correctly kept as plain state setters with no
auto-advance — only `objetivo` was wired through the auto-advancing helper.

This is not caught by any of the phase's own tests because every test that
exercises this step fills `objetivo` *last* and then synchronously calls
`fireEvent.press(getByLabelText('Continuar'))` — which calls `irPara()`,
which cancels the pending 280 ms timer (`clearTimeout(advanceTimer.current)`
in `irPara`) before it ever fires, masking the bug in the test harness's
synchronous, non-fake-timer execution.

The final submit buttons are still gated by `isFormValid()`, so no invalid
payload can reach the API — but the aluno is confusingly ejected from a step
they haven't finished, with no indication that dias/minutos are still
missing, and no "jump to first incomplete step" affordance (only
one-step-at-a-time "Voltar").

**Fix:**
```tsx
// Render the cardio objective inline, matching the plain-setter pattern
// already used for dias/minutos in this same step — no auto-advance.
<View style={styles.field}>
  <Text style={styles.label}>Qual seu objetivo com o cardio?</Text>
  <View style={styles.stack}>
    {CARDIO_OBJETIVOS.map((option) => (
      <OptionButton
        key={option.value}
        label={option.label}
        selected={cardioObjetivo === option.value}
        onPress={() => setCardioObjetivo(option.value)}
      />
    ))}
  </View>
</View>
```

## Warnings

### WR-01: `nivel_cardio_declarado()` treats a DB-valid distance of exactly `0` as "no data", diverging from migration 0033's inclusive bound

**Status:** resolvido
**Commit:** `ee6c9a7`
**Nota GSD:** `fixed: requires human verification` por alterar a condição de
classificação; o limite está coberto por pytest.
**Evidência:** RED retornou `intermediario` para prática `true` e distância `0`;
GREEN retornou `iniciante`, e os 7 testes de `TestNivelCardioDeclarado` passaram.
**Correção aplicada:** a faixa passou de `(0, 50]` para `[0, 50]` no código e na
docstring, alinhada ao `between 0 and 50` da migration 0033.

**File:** `backend/services/dose_cardio.py:129-173` (see also `supabase/migrations/0033_anamnese_cardio_declarada.sql:44-48`)
**Issue:**

Migration 0033 declares:
```sql
check (cardio_distancia_confortavel_km is null
       or cardio_distancia_confortavel_km between 0 and 50)
```
`between 0 and 50` is inclusive — `0` is a legal, DB-accepted value.

`nivel_cardio_declarado()` uses a strictly-greater-than-zero bound:
```python
if not (0 < distancia <= 50):
    return "intermediario"

if distancia < 3.0:
    return "iniciante"
```
A student who declares `cardio_pratica_atualmente = true` and
`cardio_distancia_confortavel_km = 0` is silently routed to the
`"intermediario"` branch (the same branch used for "no distance
supplied"/"malformed data"), even though `0` is logically the *most*
conservative signal possible and should fall through to the `< 3.0` branch
(`"iniciante"`) — which is exactly where any other value below 3.0 lands.
The docstring documents this as intentional ("sem distância válida" ->
intermediário), but it conflates "no data" with "the most extreme valid
data point", producing a counter-intuitive and arguably wrong calibration
for a real, DB-permitted input.

**Fix:**
```python
distancia = questionario.get("cardio_distancia_confortavel_km")
if isinstance(distancia, bool) or not isinstance(distancia, (int, float)):
    return "intermediario"
if not (0 <= distancia <= 50):   # inclusive, matches migration 0033
    return "intermediario"

if distancia < 3.0:              # 0 now correctly falls here
    return "iniciante"
```

### WR-02: No client-side range validation for `cardio_distancia_confortavel_km` — DB check-constraint violation surfaces a raw error to the user

**Status:** resolvido
**Commit:** `4de4f3e`
**Nota GSD:** `fixed: requires human verification` por alterar o gate do
formulário; o fluxo está coberto por RTL.
**Evidência:** RED aceitou `51`, não exibiu mensagem e deixou “Continuar”
habilitado; GREEN exibiu “Informe uma distância entre 0 e 50 km.”, manteve o
botão desabilitado, permaneceu na Pergunta 9 e não chamou
`mockSaveQuestionnaire`. O mesmo teste confirmou que `0` é válido. A suíte
direcionada de `questionnaireScreen.test.tsx` fechou com 17/17 testes verdes.
**Correção aplicada:** validação local inclusiva `0..50`, mensagem no próprio
`NumericField` e uso da mesma regra no gate de `blocosRespondidos`, sem alterar
o componente global.

**File:** `src/screens/QuestionnaireScreen.tsx:349-355` (gate), `src/components/ui/NumericField.tsx:43-57` (input sanitization)
**Issue:**

The cardio block's validity gate only checks presence:
```ts
(cardioPraticaAtualmente !== true || cardioDistanciaConfortavelKm !== null)
```
`NumericField`'s `sanitizeNumericText` only strips non-digit/non-separator
characters — it accepts any magnitude (e.g. `"500"`), and nothing in
`blocosRespondidos()` bounds the value against the `0`–`50` range that
migration 0033 enforces (`questionario_cardio_distancia_km_check`). A user
who types an out-of-range distance passes every client-side gate, the
"Conversar com IA"/"Gerar treino direto" buttons unlock, and
`saveQuestionnaireDataAPI` reaches the DB, which rejects the row with a
`23514` check-constraint violation. `questionnaireService.ts` only special-
cases `PGRST301`, `23505` and `42501`; a `23514` falls through to:
```ts
throw new Error(`Falha ao salvar o questionário. ${message}`);
```
which surfaces raw Postgres text (e.g. `new row for relation
"questionario_usuario" violates check constraint
"questionario_cardio_distancia_km_check"`) to the end user via
`Alert.alert('Erro ao Salvar', ...)`, instead of being caught earlier with a
friendly, actionable message — a regression in the app's otherwise careful
pt-BR UX for this exact class of error (compare `peso`/`altura`, which do
have regex + magnitude checks in `blocosRespondidos()`).

**Fix:**
```ts
!!cardioDistanciaConfortavelKm... // in blocosRespondidos():
(cardioPraticaAtualmente !== true ||
  (cardioDistanciaConfortavelKm !== null &&
    cardioDistanciaConfortavelKm >= 0 &&
    cardioDistanciaConfortavelKm <= 50))
```

### WR-03: The declared cardio-progression ceiling (REQ-05) is prompt-only guidance, never validated against the molde the model returns

**Status:** `aguardando_decisao_do_dono`
**Implementação:** nenhuma. `backend/app.py`, `backend/schemas/molde_schema.py` e
a validação de teto em `backend/services/dose_cardio.py` não foram alterados.

**Opções para decisão do dono:**

- **A — validar + retry como contrato da dose:** maior robustez e garantia local
  de que `delta_cardio_percentual.valor` respeita o teto por nível. Em troca,
  aumenta código e testes, pode disparar retries e custo de IA, e cria risco de
  rejeitar regras que o fluxo aceita hoje.
- **B — manter prompt-only:** custo zero e nenhum impacto no fluxo atual. Em
  troca, não há garantia de cumprimento e permanece o risco de persistir uma
  progressão acima do teto quando o modelo ignora a instrução.

Nada foi implementado sem aprovação. A escolha entre A e B permanece com o
dono.

**File:** `backend/app.py:1618-1663` (`_instrucao_calibracao_cardio`), `backend/services/dose_cardio.py:275-398` (`validar_dose_cardio`/`_validar`)
**Issue:**

The sibling "dose declarada" (dias/minutos/modalidades, migration 0021) is
explicitly framed in this same file's module docstring as "CONTRATO, não
preferência": `validar_dose_cardio()` re-checks the generated molde against
the declared dose and feeds a directed-retry message when it's violated
(`backend/app.py:1987-1999`, `_executar_geracao_molde`).

The new REQ-05 "TETO DE PROGRESSÃO" (per-level ceiling on
`delta_cardio_percentual.valor`, derived by `nivel_cardio_declarado()`) is
only ever emitted as prompt text:
```python
linhas.append(
    f"- TETO DE PROGRESSÃO: o `valor` de qualquer regra "
    f"`delta_cardio_percentual` para este aluno não deve ultrapassar "
    f"{teto:g}% por semana."
)
```
There is no corresponding check anywhere in `dose_cardio.py`'s `_validar()`
(or elsewhere in `_executar_geracao_molde`) that reads
`molde["progressao"]["regras"]`, finds any `delta_cardio_percentual` entries,
and compares `valor` against `TETO_PROGRESSAO_POR_NIVEL[nivel]`. If the
model ignores the instruction — which the codebase's own comments
repeatedly acknowledge happens ("a IA recebia a dose declarada... mas
nenhum sinal de capacidade", and the extensive directed-retry machinery
built specifically because models don't reliably follow soft instructions)
— a plan whose cardio progresses faster than the aluno's declared level
warrants is validated as schema-clean and persisted with no correction
path. This is an asymmetry with the stated design philosophy applied one
paragraph away to the dose fields in the same commit.

**Fix:** Extend `_validar()` in `dose_cardio.py` to accept the derived
`nivel` (or recompute it internally from `questionario`) and, for each
`delta_cardio_percentual` rule found in `molde["progressao"]["regras"]`,
append a violation when `regra["valor"] > TETO_PROGRESSAO_POR_NIVEL[nivel]`,
following the same message format (semana-tipo/regra/valor/teto) already
used for the dias/minutos violations so the directed retry can act on it. If
leaving it as soft guidance is an intentional product decision for this
phase, that tradeoff should be called out explicitly in the module docstring
next to the "duas linhas que este módulo não cruza" section, since the
current wording implies calibration is held to the same contract standard
as the dose.

---

_Reviewed: 2026-08-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
