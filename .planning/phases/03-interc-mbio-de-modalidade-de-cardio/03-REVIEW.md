---
phase: 03-interc-mbio-de-modalidade-de-cardio
reviewed: 2026-08-10T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/components/progress/CardioPrescritoSection.tsx
  - src/components/session/SessionQueue.tsx
  - src/components/session/SkipReasonSheet.tsx
  - src/components/session/SwapModalitySheet.tsx
  - src/constants/cardioModalidades.ts
  - src/engine/cardioGoals.ts
  - src/engine/cardioPrescrito.ts
  - src/engine/sessionModel.ts
  - src/screens/ActiveSessionScreen.tsx
  - src/screens/SessionHistoryDetailScreen.tsx
  - src/services/cardioModalidadesAceitasRepository.ts
  - src/services/sessionExecutionRepository.ts
  - src/store/activeSessionStore.ts
  - supabase/migrations/0034_troca_modalidade_cardio.sql
  - __tests__/activeSessionScreen.test.tsx
  - __tests__/cardioGoals.test.ts
  - __tests__/cardioModalidadesAceitas.test.ts
  - __tests__/cardioPrescrito.test.ts
  - __tests__/cardioPrescritoSecao.test.tsx
  - __tests__/cardioSwap.test.ts
  - __tests__/cardioSwapFluxo.test.ts
  - __tests__/cardioSwapMigration.test.ts
  - __tests__/cardioTempoDistancia.test.ts
  - __tests__/replanScreenFlow.test.tsx
  - __tests__/sessionExecutionRepository.test.ts
  - __tests__/sessionHistory.test.tsx
  - __tests__/skipReasonSheetTroca.test.tsx
  - __tests__/swapModalitySheet.test.tsx
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-08-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

The migration (0034), RPC, RLS/grants, TS engine functions and store wiring for
REQ-06 are careful and mostly self-consistent — the six "load-bearing" risks
called out in the phase context were checked individually:

- Migration never touches `planned_exercises`/`planned_sets` (confirmed by
  grep and by a dedicated migration text test).
- `_forca_modalidade_cardio_valida` and `CARDIO_MODALIDADES` are byte-for-byte
  identical (9 items, same order), and a text-based test pins this.
- `revoke ... from public, anon` then `grant execute ... to authenticated` is
  present for both new functions, plus a runtime assertion block
  (`has_function_privilege`) at the end of the migration — the 0019 lesson was
  applied correctly here.
- `swapExercise` in the store is server-first and CAS-guarded exactly like the
  established `skipExercise` pattern; no partial-failure path leaves the
  screen out of sync with the server on the happy/error paths tested.

Two real defects were found, however: (1) `applyCardioSwapToDraft` rewrites the
`name` of **every** set of the exercise, including sets already marked `done`
— this silently relabels a completed set's actual result under a modality the
aluno never performed it in, contradicting the codebase's own stated
invariant ("séries já concluídas não são tocadas — histórico não se
reescreve", stated for the analogous skip function two lines above it) and
nothing in the UI or the RPC guards against triggering a swap after partial
completion. (2) `SwapModalitySheet` can render a functionally dead scrollable
list (zero selectable options, but the "Trocar modalidade" button still
visible and permanently disabled) with no explanatory empty state, when the
user's only accepted modality happens to equal the exercise's current
modality — this is exactly the "empty list traps the user" scenario the phase
context asked to verify against D-02, and it is not covered by the empty-state
branch or by any test.

The claimed "anti-drift" test tying `formatCardioSetResult` to
`SessionQueue.doneLine` (point 5 of the phase context) does not actually
import or exercise the real `doneLine` — it compares against a hand-copied
inline replica, so a future edit to the real `doneLine` would not be caught by
this test despite the comment's claim.

## Critical Issues

### CR-01: Swapping a cardio exercise silently relabels already-completed sets under the new modality

**File:** `src/engine/sessionModel.ts:604-623` (also exercised via `src/store/activeSessionStore.ts:1503-1553` and `src/components/session/SessionQueue.tsx:138-148`)

**Issue:** `applyCardioSwapToDraft` sets `name: toModality` at the *exercise*
level and maps `targetDistanceM: null` over **all** `ex.sets`, without
distinguishing sets whose `status === 'done'` from pending ones:

```ts
export const applyCardioSwapToDraft = (
  draft: SessionDraft,
  exerciseId: string,
  toModality: CardioModalidade,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) =>
    ex.exerciseId !== exerciseId
      ? ex
      : {
          ...ex,
          name: toModality,
          swappedFrom: ex.swappedFrom ?? ex.name,
          metric: CARDIO_MODALIDADES_COM_DISTANCIA.includes(toModality) ? 'tempo_distancia' : 'tempo',
          sets: ex.sets.map((s) => ({ ...s, targetDistanceM: null })), // touches DONE sets too
        },
  ),
});
```

`name` is stored once per `DraftExercise`, not per `DraftSet`, and
`SessionQueue`'s "Trocar modalidade" button is enabled whenever
`onSolicitarTroca && !foraDeJogo && isTimeBased(metricOf(ex))` — it does **not**
check whether any set of the exercise is already `done`. Concretely: a
multi-set cardio exercise (e.g. HIIT intervals with `sets_planned > 1`) where
set 1 is completed as "Corrida" (distância/pace really run on foot), then the
aluno swaps the exercise to "Remo Ergômetro" before doing set 2 — set 1's
already-recorded result is now displayed (in the active session queue,
`SessionQueue.doneLine`, and later in `SessionHistoryDetailScreen` via
`getSessionLogDetail`, which groups by `planned_exercise_id` and applies the
single `to_modality` row to the whole group) as if it were a Remo Ergômetro
result, with the section note "Trocado de Corrida" providing only exercise-
level context, not per-set attribution. This directly contradicts the
invariant the codebase enforces one function above for the analogous case
(`applyExerciseSkipToDraft`, `sessionModel.ts:534-539`): *"nada que o aluno
digitou é apagado ... Séries já concluídas não são tocadas — histórico não se
reescreve."* Server-side, the same limitation exists: `cardio_exercise_swaps`
is keyed `unique (session_log_id, planned_exercise_id)` with a single
`to_modality`, so there is no way to reconstruct which modality a given
`set_log` was actually performed under once a mid-exercise swap has happened.

Not covered by any test: neither `__tests__/cardioSwap.test.ts` nor
`__tests__/cardioSwapFluxo.test.ts` nor `__tests__/activeSessionScreen.test.tsx`
exercises a swap where a set of the target exercise already has
`status: 'done'`.

**Fix:** Either (a) block the swap action once any set of the exercise is
`done` — guard it both client-side (`SessionQueue`/`ActiveSessionScreen`
button visibility, mirroring how `onSolicitarRecusa` is gated) and
server-side in `swap_session_exercise` (reject if a `set_logs` row already
exists for a `planned_set_id` under this `planned_exercise_id`), or (b) make
the modality identity per-set (or snapshot the modality onto each
`set_logs`/`DraftSet` row at completion time) so completed sets keep the
modality they were actually performed under regardless of later swaps. Add a
regression test asserting a `done` set's `name`/label is unaffected by a
subsequent swap of the same exercise.

### CR-02: `SwapModalitySheet` can present a permanently-empty, unexplained list when the only accepted modality equals the current exercise's modality

**File:** `src/components/session/SwapModalitySheet.tsx:72, 119-149, 151-164`

**Issue:** The options list is computed unconditionally by filtering out the
current modality:

```ts
const opcoes = (modalidades ?? []).filter((m) => m !== exercicioAtualNome);
...
) : modalidades.length === 0 ? (
  <EmptyState icon="activity" title="Nenhuma modalidade cadastrada" ... />
) : (
  <ScrollView ...>{opcoes.map((m) => ...)}</ScrollView>
)}

{modalidades !== null && modalidades.length > 0 && !erro ? (
  <Button label="Trocar modalidade" ... disabled={busy || toModality == null} .../>
) : null}
```

The empty-state branch only fires on `modalidades.length === 0`. If the
aluno's accepted-modalities list has exactly one entry and that entry is the
exercise's *current* modality (a realistic case: the prescribed exercise is
usually drawn from the accepted list, so a single-modality user opening the
swap sheet on their only accepted exercise hits this every time), `modalidades`
is non-empty, so the code falls into the `ScrollView` branch with `opcoes`
being `[]` — an empty, blank scrollable area — while the confirm button is
still rendered (condition only checks `modalidades.length > 0`) and stays
permanently `disabled` because `toModality` can never be set. The user sees a
sheet with a title, description, an empty white area, and a greyed-out button,
with no text explaining why there is nothing to pick and no path forward
except "Voltar". This is exactly the scenario phase-context item 7 asked to be
verified against (D-02's strict empty fallback) — here the *effective*
rendered list is empty even though the underlying `modalidades` array is not,
so the guard that was written for the `[]` case does not fire.

Not covered by `__tests__/swapModalitySheet.test.tsx` (which only tests
`modalidades={[]}` for the empty state, and `modalidades={['Corrida', 'Caminhada']}`
for the exclusion behavior, never the case where the filtered `opcoes` is
empty while `modalidades.length > 0`).

**Fix:** Compute the empty condition from `opcoes.length === 0` (post-filter),
not from `modalidades.length === 0`, and message it distinctly from "nenhuma
modalidade cadastrada" (e.g. "Você só tem esta modalidade cadastrada — nada
para trocar"). Example:

```ts
) : opcoes.length === 0 ? (
  <EmptyState
    icon="activity"
    title="Nenhuma outra modalidade disponível"
    description="A única modalidade que você aceita é esta. Complete a anamnese para adicionar outras."
  />
) : (
  <ScrollView ...>{opcoes.map((m) => ...)}</ScrollView>
)}

{modalidades !== null && opcoes.length > 0 && !erro ? (
  <Button label="Trocar modalidade" ... />
) : null}
```

Add a test with `modalidades={['Caminhada']}` and `exercicioAtualNome="Caminhada"`
asserting the empty state renders and the confirm button is absent.

## Warnings

### WR-01: "Anti-drift" test does not exercise the real `SessionQueue.doneLine` — the paridade guarantee is false as documented

**File:** `__tests__/sessionExecutionRepository.test.ts:61-107`

**Issue:** The suite's comment claims: *"Se um dos dois divergir no futuro,
este teste pega o drift (Pitfall 5)."* But `doneLineReplica` is a hand-copied
inline function, not an import of the real `doneLine` from
`src/components/session/SessionQueue.tsx`:

```ts
// Réplica local do corpo de SessionQueue.doneLine ... usada SÓ como fixture
// de comparação — mede paridade contra formatCardioSetResult, não substitui
// o algoritmo real.
const doneLineReplica = (params: {...}): string => { /* copy of doneLine's cardio branch */ };
...
it('paridade byte a byte com doneLine em 4 combinações (anti-drift, Pitfall 5)', () => {
  for (const caso of casos) {
    expect(formatCardioSetResult(caso)).toBe(doneLineReplica(caso));
  }
});
```

If a future change edits the real `doneLine` (e.g. separator character,
rounding, order of parts) without updating this hand-copied replica in
lock-step, this test provides **zero** protection — it will keep passing
while `formatCardioSetResult` (used in history) and the real `doneLine` (used
in the live session queue) silently diverge, which is precisely the drift
scenario phase-context item 5 asked to be checked for. `doneLine` is already
exported from `SessionQueue.tsx` (`export const doneLine = ...`), so importing
it here is possible without introducing a `components/` dependency into
`engine/` — the import belongs in the *test* file, not in `sessionModel.ts`.

**Fix:** Import the real `doneLine` in this test and drop the inline replica:

```ts
import { doneLine } from '../src/components/session/SessionQueue';
...
expect(formatCardioSetResult(caso)).toBe(
  doneLine(
    { metric: 'tempo_distancia' } as any, // or a proper DraftExercise fixture
    { actualDurationSeconds: caso.durationSeconds, actualDistanceM: caso.distanceM, perceivedEffort: caso.perceivedEffort } as any,
  ),
);
```

### WR-02: Standalone (non-inline) `SwapModalitySheet` in `ActiveSessionScreen` is unreachable dead code

**File:** `src/screens/ActiveSessionScreen.tsx:577-586`

**Issue:**

```tsx
<SwapModalitySheet
  visible={troca != null && modalContent !== 'swap_modality'}
  ...
/>
```

`troca` is only ever set together with `modalContent` being switched to
`'swap_modality'` in the same state update — both call sites
(`SessionQueue`'s `onSolicitarTroca` at line 651-659, and
`onSolicitarTrocaAPartirDaRecusa` at line 366-377) set `troca` and
`modalContent: 'swap_modality'` atomically. Because React batches these
`setState` calls, there is no committed render where `troca != null` and
`modalContent !== 'swap_modality'` simultaneously hold, so this standalone
sheet's visibility condition is always `false` — it can never render. This
mirrors the equivalent `SkipReasonSheet` block right above it
(`visible={recusa != null && modalContent !== 'skip_reason'}`), which *is*
reachable because `recusa` for `escopo: 'sessao'` is set from two buttons
outside the "Ver andamento" modal (lines 513, 532) without ever touching
`modalContent`. No such outside-the-modal entry point exists for swap (by
design — REQ-06 states troca is always per-exercise), so the parallel
structure for `SwapModalitySheet` is vestigial. Confirmed unreachable: no test
in `__tests__/activeSessionScreen.test.tsx` exercises this branch (both
"entry point 1" and "entry point 2" tests open it via "Ver andamento" first).

**Fix:** Remove the standalone `<SwapModalitySheet>` block (lines 577-586) —
only the `inline` variant inside the `<Modal>` (lines 611-622) is ever
reachable. If a future requirement needs a swap entry point outside "Ver
andamento" (e.g., a button directly on the active `SessionPlayer` card),
re-add it then with a real trigger that sets `troca` without also setting
`modalContent`.

### WR-03: `swap_session_exercise`'s cardio guard is looser than the client-side gate, allowing metric/muscle_group inconsistency to bypass the intended defense-in-depth

**File:** `supabase/migrations/0034_troca_modalidade_cardio.sql:205-217`

**Issue:** The migration comment states the guard exists as defense-in-depth
because "a UI já só oferece o botão em exercício isTimeBased", implying the
RPC should enforce the same `isTimeBased` condition
(`metric in ('tempo', 'tempo_distancia')`). The actual guard is an `OR`:

```sql
if not exists (
  select 1
    from public.planned_exercises pe
   where pe.id = p_planned_exercise_id
     and (pe.metric in ('tempo', 'tempo_distancia') or pe.muscle_group = 'Cardio')
) then
  raise exception '...' using errcode = '22023';
end if;
```

This means a `planned_exercise` with `muscle_group = 'Cardio'` but
`metric = 'carga_reps'` (a data-consistency edge case, e.g. a legacy row from
before metric was backfilled, or a future authoring bug) would pass this
guard and allow the swap RPC to succeed even though the client's `isTimeBased`
check would never have offered the button — weakening the stated
defense-in-depth purpose of this check to be looser than the invariant it
claims to protect.

**Fix:** Tighten to match the client's `isTimeBased` semantics exactly (drop
the `muscle_group` alternative, or require both):

```sql
and pe.metric in ('tempo', 'tempo_distancia')
```

If `muscle_group = 'Cardio'` rows with `metric = 'carga_reps'` are expected to
exist and should still be swappable, document why explicitly; otherwise this
is silently more permissive than intended.

## Info

### IN-01: `formatarMinutos` in `CardioPrescritoSection.tsx` is also used to format kilometers

**File:** `src/components/progress/CardioPrescritoSection.tsx:35-42, 107`

**Issue:** The function is named `formatarMinutos` but is reused verbatim to
format `progresso.realizadoKm`/`progresso.prescritoKm` (line 107):
`` `${formatarMinutos(progresso.realizadoKm ?? 0)} de ${formatarMinutos(progresso.prescritoKm)} km` ``.
The formatting logic is generic (rounds to 1 decimal, handles `<1`), so this
is not a functional bug, but the name misleads a future reader into thinking
it's minute-specific.

**Fix:** Rename to something unit-agnostic, e.g. `formatarNumeroCompacto`, or
extract a `formatarKm` alias for clarity at call sites.

### IN-02: `sessionModel.ts` mixes an `equipment`/`muscle_group`-based cardio detection with a `metric`-based one across the codebase

**File:** `supabase/migrations/0034_troca_modalidade_cardio.sql:212` vs. `src/engine/sessionModel.ts:277-278` (`isTimeBased`)

**Issue:** Client code consistently gates cardio behavior on `metric` via
`isTimeBased`. The migration's guard additionally accepts `muscle_group =
'Cardio'` as an alternate cardio signal (see WR-03), which is a second,
independent notion of "is this exercise cardio" that isn't reflected anywhere
in the TypeScript layer. Two parallel definitions of "cardio" (metric-based
client-side, muscle_group-based server-side) is a drift risk of the same
family the phase's `CARDIO_MODALIDADES` sync test was built to prevent,
just for a different pair of concepts.

**Fix:** Pick one canonical signal (recommend `metric`, since it's the one the
client already treats as authoritative for `isTimeBased`/`canCompleteSet`)
and use it consistently in both layers, or explicitly document why
`muscle_group` is treated as an independent, valid alternate signal.

---

_Reviewed: 2026-08-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
