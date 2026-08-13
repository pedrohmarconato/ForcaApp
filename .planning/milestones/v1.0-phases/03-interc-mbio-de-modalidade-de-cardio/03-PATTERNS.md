# Phase 3: Intercâmbio de modalidade de cardio - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 11 (criados/modificados, extraídos de CONTEXT.md + RESEARCH.md)
**Analogs found:** 10 / 11 (1 sem analog direto — motor de agregação, ver seção final)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/engine/sessionModel.ts` (+`applyCardioSwapToDraft`, tipo `CardioSwap`) | utility (engine puro) | transform | `applyExerciseSkipToDraft`/`removeExerciseSkipFromDraft` no mesmo arquivo (linhas 505-537) | exact |
| `src/services/cardioModalidadesAceitasRepository.ts` (NOVO) | service | request-response (read) | `src/services/sessionExecutionRepository.ts` — leitura com RLS "own" + defesa de shape | role-match |
| `src/services/sessionExecutionRepository.ts` (+`swapSessionExercise`, estender `getSessionLogDetail`) | service | CRUD / request-response | `skipSessionExercise`/`unskipSessionExercise` no mesmo arquivo (linhas 239-300) | exact |
| `supabase/migrations/0034_troca_modalidade_cardio.sql` (NOVO) | migration | CRUD (tabela + RPC) | `supabase/migrations/0020_recusa_declarada.sql` (tabela `exercise_skips` + RPC `skip_session_exercise`) | exact |
| `src/components/session/SessionQueue.tsx` (+botão "Trocar modalidade") | component | event-driven (UI) | Mesmo arquivo — botão "Não vou fazer" (linhas 100-122) | exact |
| `src/components/session/SwapModalitySheet.tsx` (NOVO) | component | event-driven (UI) | `src/components/session/SkipReasonSheet.tsx` (bottom sheet completo, 239 linhas) | exact |
| `src/components/session/SkipReasonSheet.tsx` (+ramo `sem_equipamento` oferece troca) | component | event-driven (UI) | Mesmo arquivo — bloco de opções + CTA (linhas 91-140) | exact |
| `src/screens/SessionHistoryDetailScreen.tsx` (+`descreveSerie` cardio, rótulo "trocado de X") | component | request-response (read) | Mesmo arquivo — `descreveSerie` (linhas 26-30) + `SessionQueue.doneLine` (linhas 42-62) como fonte da lógica de formatação cardio | role-match |
| `src/engine/cardioGoals.ts` (+`distanciaRealizadaSemanaM`) | utility (engine puro) | batch/transform | Mesmo arquivo — `progressoConsistencia` (linhas 185-233) | exact |
| `src/store/activeSessionStore.ts` (+`swapExercise` orquestrando repo→draft) | store | event-driven | Mesmo arquivo — `skipExercise` (linhas ~1400-1450, comentário "servidor primeiro" em 1416-1420) | exact |
| `__tests__/cardioSwapMigration.test.ts` (NOVO) | test | file I/O (lê .sql bruto) | `__tests__/recusaDeclarada.test.ts` (linhas ~101-112, `expect(sql).toMatch(...)`) | exact |

## Pattern Assignments

### `src/engine/sessionModel.ts` — `applyCardioSwapToDraft` (utility, transform)

**Analog:** mesmo arquivo, `applyExerciseSkipToDraft`/`removeExerciseSkipFromDraft` (linhas 505-537, confirmado por leitura direta nesta sessão).

**Core pattern** (linhas 498-537):
```typescript
export const applyExerciseSkipToDraft = (
  draft: SessionDraft,
  exerciseId: string,
  reason: SkipReason,
  note?: string | null,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) =>
    ex.exerciseId !== exerciseId
      ? ex
      : {
          ...ex,
          skippedByUser: true,
          skipReason: reason,
          skipNote: note?.trim() ? note.trim() : null,
          sets: ex.sets.map((s) =>
            s.status === 'active' ? { ...s, status: 'pending', activatedAt: null } : s,
          ),
        },
  ),
});

export const removeExerciseSkipFromDraft = (
  draft: SessionDraft,
  exerciseId: string,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) =>
    ex.exerciseId !== exerciseId
      ? ex
      : { ...ex, skippedByUser: false, skipReason: null, skipNote: null },
  ),
});
```

**Regra de imutabilidade:** cada transform devolve um novo `SessionDraft`/`DraftExercise`/`DraftSet` via spread — nunca muta o array `exercises`/`sets` in place. `applyCardioSwapToDraft` DEVE seguir o mesmo shape (ver exemplo já validado em RESEARCH.md, Pattern 3): zerar `targetDistanceM` em cada série do exercício trocado, preservar `targetDurationSeconds`, registrar `swappedFrom`.

**Doc comment style:** cada função pública tem um comentário de bloco explicando o "porquê" (não o "o quê") — replicar esse estilo em `applyCardioSwapToDraft`.

---

### `src/services/cardioModalidadesAceitasRepository.ts` (NOVO — service, request-response)

**Analog mais próximo:** não existe leitura de `cardio_modalidades` fora do onboarding hoje (confirmado — gap real, não analog fraco). O padrão de estilo a seguir é o resto de `sessionExecutionRepository.ts`: RLS "own", `.maybeSingle()`, `toNum`/defesa de shape.

**Padrão de leitura RLS "own"** (referência de estilo, `getSessionLogDetail`, linhas 776-825):
```typescript
export const getSessionLogDetail = async (
  ...
): Promise<SessionLogDetail> => {
  const { data, error } = await supabase
    .from('set_logs')
    .select(
      'actual_reps, actual_load_kg, actual_rir, outcome, completed_at, planned_sets(set_order, planned_exercises(name, exercise_order))',
    )
    ...
  if (error) throw error;
  ...
};
```

**Implementação recomendada** (já validada em RESEARCH.md Code Examples — copiar tal como está):
```typescript
export const getModalidadesAceitas = async (
  userId: string,
): Promise<readonly CardioModalidade[] | null> => {
  const { data, error } = await supabase
    .from('questionario_usuario')
    .select('cardio_modalidades')
    .eq('usuario_id', userId)
    .maybeSingle();
  if (error) throw error;
  const lista = data?.cardio_modalidades;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const validas = new Set<string>(CARDIO_MODALIDADES);
  return lista.filter((m): m is CardioModalidade => validas.has(m));
};
```

**Nota crítica (Pitfall 4 / Open Question 1):** o fallback de lista vazia (`null` retornado) NÃO tem decisão do dono para o contexto de TROCA — só para geração de plano. O planner deve decidir explicitamente (documentar no plano) se `null` vira "mostrar todas as 9" ou "estado vazio/CTA", e cobrir com teste (`__tests__/cardioModalidadesAceitas.test.ts`, ainda não existe).

---

### `src/services/sessionExecutionRepository.ts` — `swapSessionExercise` (service, CRUD)

**Analog:** `skipSessionExercise`/`unskipSessionExercise` no mesmo arquivo (linhas 239-300).

**Imports pattern** (topo do arquivo, já em uso):
```typescript
import { supabase } from '../config/supabaseClient';
```

**Core CRUD pattern** (linhas 239-266, `skipSessionExercise`):
```typescript
export const skipSessionExercise = async (params: {
  sessionLogId: string;
  plannedExerciseId: string;
  reason: SkipReason;
  note?: string | null;
}): Promise<ExerciseSkip> => {
  let response;
  try {
    response = await supabase.rpc('skip_session_exercise', {
      p_session_log_id: params.sessionLogId,
      p_planned_exercise_id: params.plannedExerciseId,
      p_reason: params.reason,
      p_note: params.note ?? null,
    });
  } catch (err) {
    throw err;
  }
  const { data, error } = response;
  if (error) throw error;
  if (!data) throw new Error('skip_session_exercise não retornou a recusa.');
  return mapRow(data);
};
```

**Extensão de `getSessionLogDetail`** (linhas 776-845, gap confirmado): o `select` atual em `set_logs` (linha 803) NÃO inclui `actual_duration_seconds`/`actual_distance_m` nem join com a tabela nova de swap. A extensão deve seguir o MESMO padrão de select aninhado já usado na linha 170 (`set_logs(id, planned_set_id, actual_reps, actual_load_kg, actual_rir, outcome, adaptation, completed_at, actual_duration_seconds, actual_distance_m, perceived_effort), exercise_skips(planned_exercise_id, reason, note)`), adicionando `cardio_exercise_swaps` como LEFT JOIN equivalente.

**Error handling pattern:** sempre `if (error) throw error;` logo após desestruturar a resposta do Supabase — nunca engolir erro silenciosamente. Replicar em `swapSessionExercise`.

---

### `supabase/migrations/0034_troca_modalidade_cardio.sql` (NOVO — migration)

**Analog:** `supabase/migrations/0020_recusa_declarada.sql` — tabela `exercise_skips` (linhas 122-183) + RPC `skip_session_exercise` (linhas 327-400) + revoke/grant (linhas 588-604).

**Vocabulário fechado** (molde, adaptar para `_forca_modalidade_cardio_valida`):
```sql
create or replace function public._forca_motivo_recusa_valido(p_motivo text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select p_motivo in (...) $$;
```

**Tabela satélite + unique + RLS "own"** (linhas 122-183, copiar estrutura):
```sql
create table if not exists public.exercise_skips (
  id uuid primary key default gen_random_uuid(),
  session_log_id      uuid not null references public.session_logs (id) on delete cascade,
  planned_exercise_id uuid not null references public.planned_exercises (id) on delete cascade,
  reason text not null,
  note   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_log_id, planned_exercise_id)
);

alter table public.exercise_skips enable row level security;

drop policy if exists "own exercise skips" on public.exercise_skips;
create policy "own exercise skips" on public.exercise_skips
  for all using (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.session_logs l
      join public.planned_exercises pe
        on pe.id = planned_exercise_id
       and pe.session_id = l.planned_session_id
      where l.id = session_log_id
        and l.user_id = auth.uid()
        and l.finished_at is null
    )
  );
```

**RPC com validação de posse + vocabulário + upsert** (linhas 327-400, molde completo para `swap_session_exercise`):
```sql
create or replace function public.skip_session_exercise(
  p_session_log_id uuid, p_planned_exercise_id uuid, p_reason text, p_note text default null
)
returns public.exercise_skips
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
  v_row public.exercise_skips;
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_reason is null or not public._forca_motivo_recusa_valido(p_reason) then
    raise exception 'motivo de recusa inválido: %', coalesce(p_reason, '<null>')
      using errcode = '22023';
  end if;

  select * into v_log from public.session_logs
   where id = p_session_log_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'P0002';
  end if;

  -- Guarda crítica de posse — sem isto, planned_exercise_id de OUTRA sessão passaria.
  if not exists (
    select 1 from public.planned_exercises pe
     where pe.id = p_planned_exercise_id and pe.session_id = v_log.planned_session_id
  ) then
    raise exception 'exercício % não pertence à sessão do log %',
      p_planned_exercise_id, p_session_log_id using errcode = '42501';
  end if;

  insert into public.exercise_skips (session_log_id, planned_exercise_id, reason, note)
  values (p_session_log_id, p_planned_exercise_id, p_reason, v_note)
  on conflict (session_log_id, planned_exercise_id)
  do update set reason = excluded.reason, note = excluded.note, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
```

**Grants — obrigatório em toda RPC nova** (linhas 588-604):
```sql
revoke all on function public.skip_session_exercise(uuid, uuid, text, text) from public, anon;
grant execute on function public.skip_session_exercise(uuid, uuid, text, text) to authenticated;
```

**Diferença chave da fase 3:** a RPC nova (`swap_session_exercise`) NÃO retorna nem toca `exercise_skips` — é tabela e função paralelas. Nenhum `UPDATE` em `planned_exercises`/`planned_sets` (anti-pattern confirmado, disparar `checkpoint:decision` se cogitado).

---

### `src/components/session/SessionQueue.tsx` (+botão "Trocar modalidade")

**Analog:** mesmo arquivo — botão "Não vou fazer" (linhas 100-122, confirmado por leitura direta).

**Core pattern** (linhas 100-122):
```tsx
) : onSolicitarRecusa && !foraDeJogo ? (
  <TouchableOpacity
    style={styles.acao}
    onPress={() => onSolicitarRecusa(ex)}
    testID={`skip-${ex.exerciseId}`}
    accessibilityRole="button"
    accessibilityLabel={`Não vou fazer ${ex.name}`}
  >
    <Text style={styles.acaoLabel}>Não vou fazer</Text>
  </TouchableOpacity>
) : null}
```

**Imports pattern** (linhas 9-14):
```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  metricOf,
  isTimeBased,
  ...
} from '../../engine/sessionModel';
```

**Condição de exibição:** `isTimeBased(metricOf(exercise))` (linha 44) já é usado no arquivo para decidir comportamento condicionado a cardio — reaproveitar exatamente essa checagem para condicionar o botão "Trocar modalidade" (só séries por tempo/cardio).

---

### `src/components/session/SwapModalitySheet.tsx` (NOVO — component)

**Analog:** `src/components/session/SkipReasonSheet.tsx` (239 linhas, lido integralmente).

**Imports pattern** (linhas 11-23):
```tsx
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import theme from '../../theme/theme';
import { Button, TextField } from '../ui';
import { SKIP_REASONS, SKIP_REASON_LABELS, type SkipReason } from '../../engine/sessionModel';
```

**Core pattern — lista fechada + seleção + CTA** (linhas 91-136):
```tsx
<ScrollView style={styles.lista} keyboardShouldPersistTaps="handled">
  {SKIP_REASONS.map((r) => {
    const selecionado = reason === r;
    return (
      <TouchableOpacity
        key={r}
        style={[styles.option, selecionado && styles.optionSelected]}
        onPress={() => setReason(r)}
        disabled={busy}
        testID={`skip-reason-${r}`}
        accessibilityRole="radio"
        accessibilityState={{ selected: selecionado, disabled: busy }}
        accessibilityLabel={SKIP_REASON_LABELS[r]}
      >
        <Text style={[styles.optionLabel, selecionado && styles.optionLabelSelected]}>
          {SKIP_REASON_LABELS[r]}
        </Text>
      </TouchableOpacity>
    );
  })}
</ScrollView>

<Button
  label={ehSessao ? 'Recusar o treino' : 'Não vou fazer'}
  onPress={() => {
    if (busy || reason == null) return;
    onConfirm(reason, note.trim() ? note.trim() : null);
  }}
  disabled={busy || reason == null}
  testID="skip-reason-confirm"
/>
```

**Padrão a replicar em `SwapModalitySheet`:** lista fechada = `CARDIO_MODALIDADES` filtrada por `getModalidadesAceitas`, radio-select, botão de confirmação desabilitado até seleção, `busy` guard contra toque duplo, `testID` por item (`swap-modality-${modalidade}`). Campo de distância REALIZADA opcional (D-04) condicionado a `CARDIO_MODALIDADES_COM_DISTANCIA.includes(modalidadeEscolhida)` — usar `TextField` como o campo de nota já usa (linhas 114-124).

---

### `src/components/session/SkipReasonSheet.tsx` (+ramo `sem_equipamento`)

**Analog:** mesmo arquivo — bloco de render entre lista e CTA (linhas 91-140).

**Ponto de inserção:** após o `ScrollView` de opções (linha 126) e antes do `Button` principal (linha 128) — condicionar a `reason === 'sem_equipamento' && ehCardio`:
```tsx
{reason === 'sem_equipamento' && ehCardio ? (
  <Button
    label="Trocar modalidade em vez de recusar"
    variant="outline"
    onPress={() => onSolicitarTroca?.()}
    testID="skip-reason-oferecer-troca"
  />
) : null}
```

**Compatibilidade com testes existentes:** `onConfirm(reason, note)` continua intocado — "recusar mesmo assim" é o caminho antigo (`__tests__/recusaDeclarada.test.ts`, `__tests__/recusaDeclaradaFluxo.test.ts:249-277`, ambos cobrindo `reason: 'sem_equipamento'`). O caminho de troca é aditivo, nunca chama `skip_session_exercise`.

---

### `src/screens/SessionHistoryDetailScreen.tsx` (+cardio em `descreveSerie`, rótulo D-08)

**Analog primário (bug/gap a corrigir):** mesmo arquivo — `descreveSerie` (linhas 26-30, confirmado):
```typescript
const descreveSerie = (s: HistorySetLog): string => {
  const carga = s.actualLoadKg != null ? `${s.actualLoadKg} kg` : 'peso corporal';
  const rir = s.actualRir != null ? ` · RIR ${s.actualRir}` : '';
  return `${s.actualReps} reps × ${carga}${rir}`;
};
```
Esta função hoje assume força (reps × carga) incondicionalmente — não ramifica por cardio. Precisa de branch para `actualDurationSeconds`/`actualDistanceM`.

**Analog de estilo para a lógica cardio (a portar):** `SessionQueue.doneLine` (linhas 42-62) — já resolve formatação de tempo/distância/pace/esforço corretamente para a sessão ATIVA. Extrair função pura compartilhada (Pitfall 5 do RESEARCH.md) em vez de duplicar.

**Rótulo D-08 "trocado de X":** requer que `SessionLogDetail`/`HistorySetLog` (tipo em `sessionExecutionRepository.ts`) carreguem o par `toModality`/`fromName` vindo do LEFT JOIN com `cardio_exercise_swaps` (ver extensão de `getSessionLogDetail` acima). Sem esse dado no repositório, a tela não tem o que exibir — dependência de ordem: migration → repositório → tela.

---

### `src/engine/cardioGoals.ts` — `distanciaRealizadaSemanaM` (utility, batch/transform)

**Analog:** mesmo arquivo, `progressoConsistencia` (linhas 185-233) e o padrão de `numeroPositivo` (linha 64).

**Já validado em RESEARCH.md** (copiar tal como está):
```typescript
export const distanciaRealizadaSemanaM = (
  logs: readonly CardioLog[],
  referencia: Date = new Date(),
): number | null => {
  const inicio = inicioDaSemana(referencia);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);

  let metros: number | null = null;
  for (const l of logs) {
    const quando = new Date(l.completedAt);
    if (Number.isNaN(quando.getTime()) || quando < inicio || quando >= fim) continue;
    const d = numeroPositivo(l.distanceM);
    if (d != null) metros = (metros ?? 0) + d;
  }
  return metros; // null = nenhuma amostra, nunca "0 km" inventado.
};
```

**Regra "sem amostra é '—'":** retornar `null` (não `0`) quando não há distância — mesmo padrão usado em toda a engine (`progressoDesempenho`, `progressoConsistencia`). Não tocar `progressoConsistencia`/contagem de dias distintos (Pitfall 6) — D-05 é aditivo.

**IMPORTANTE — não tocar `cardioPrescrito.ts`** (Pitfall 7): nenhuma menção a swap/troca deve entrar em `cardioPrescrito.ts`/`cardioPrescritoRepository.ts`. D-06 já está correto por construção porque essas camadas leem `planned_sets`, que a troca nunca modifica.

## Shared Patterns

### Servidor primeiro, depois draft local
**Source:** `src/store/activeSessionStore.ts`, `skipExercise` (comentário nas linhas 1416-1420) + `sessionExecutionRepository.ts:1-6`
**Apply to:** `swapExercise` no store — chamar `swapSessionExercise` (RPC) ANTES de aplicar `applyCardioSwapToDraft` ao estado local. Nunca o inverso (evita drift entre draft otimista e servidor).

### Vocabulário fechado espelhando o banco
**Source:** `supabase/migrations/0020_recusa_declarada.sql` (`_forca_motivo_recusa_valido`) + `__tests__/cardioModalidadesSincronizadas.test.ts`
**Apply to:** `_forca_modalidade_cardio_valida` na migration 0034 — a lista embutida DEVE nascer sincronizada com `CARDIO_MODALIDADES` (`src/constants/cardioModalidades.ts:23-33`); cobrir com teste simétrico no mesmo espírito de `cardioModalidadesSincronizadas.test.ts`.

### Revoke/grant obrigatório em toda RPC nova
**Source:** `supabase/migrations/0020_recusa_declarada.sql:588-604`
**Apply to:** `swap_session_exercise` na migration 0034 — `revoke all ... from public, anon;` seguido de `grant execute ... to authenticated;`, e teste com `has_function_privilege('anon', ...)` (padrão de asserção `do $$ ... raise exception ...`).

### Guarda de posse dentro da RPC (não confiar só em RLS)
**Source:** `skip_session_exercise`, linhas 373-382 (`exists (select 1 from planned_exercises pe where pe.id = ... and pe.session_id = v_log.planned_session_id)`)
**Apply to:** `swap_session_exercise` precisa da MESMA checagem — sem ela, `planned_exercise_id` de outra sessão passaria pela RLS "own" do `session_log`.

### Teste de migration lendo SQL bruto
**Source:** `__tests__/recusaDeclarada.test.ts` (linhas ~101-112, `expect(sql).toMatch(...)`)
**Apply to:** `__tests__/cardioSwapMigration.test.ts` (novo) — mesma técnica: ler o arquivo `.sql` como texto e usar `toMatch` para confirmar vocabulário fechado, RLS, revoke/grant, sem precisar de banco real.

### "Sem amostra é '—', nunca 0"
**Source:** toda a engine (`sessionModel.ts`, `cardioGoals.ts`)
**Apply to:** qualquer nova agregação de distância (`distanciaRealizadaSemanaM`) e qualquer novo campo exibido na UI de troca/histórico — retornar `null`/omitir em vez de inventar zero.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Função de formatação compartilhada entre `SessionQueue.doneLine` e `descreveSerie` (extração sugerida pelo Pitfall 5) | utility | transform | Não existe hoje um shape comum entre `DraftSet` (sessão ativa) e `HistorySetLog` (histórico) — é uma extração nova, não cópia de um analog existente. O planner deve decidir a assinatura mínima comum (`durationSeconds`, `distanceM`, `perceivedEffort`) antes de codar; ambos os pontos de chamada devem convergir para ela. |

## Cobertura de teste existente — resposta ao item em aberto do RESEARCH.md

Confirmado por `ls __tests__/`: **`cardioGoals.test.ts` e `cardioPrescrito.test.ts` JÁ EXISTEM.** O planner deve **estender** esses arquivos (adicionar casos para `distanciaRealizadaSemanaM` e para confirmar que `cardioPrescrito` permanece alheio à troca), não criar arquivos novos para essas duas funções. Também já existem `cardioGoalRepository.test.ts`, `cardioPrescritoRepository.test.ts`, `cardioPrescritoSecao.test.tsx`, `cardioTempoDistancia.test.ts`, `cardioModalidadesSincronizadas.test.ts` e `doseCardioQuestionario.test.tsx` — nenhum cobre swap/troca ainda, todos são candidatos de extensão ou referência de padrão conforme o arquivo de produção que tocam.

Arquivos de teste genuinamente novos (sem analog de arquivo, mas com padrão de teste já estabelecido no repo):
- `__tests__/cardioSwap.test.ts` — molde: teste de função pura de `sessionModel.ts` (ver testes existentes de `applyExerciseSkipToDraft`)
- `__tests__/cardioModalidadesAceitas.test.ts` — molde: `__tests__/doseCardioQuestionario.test.tsx` (leitura de `cardio_modalidades`)
- `__tests__/sessionHistoryDetailCardio.test.ts` — molde: padrão de teste de tela/repositório já usado no histórico
- `__tests__/cardioSwapMigration.test.ts` — molde: `__tests__/recusaDeclarada.test.ts` (leitura de SQL bruto)
- `__tests__/cardioSwapFluxo.test.ts` — molde: `__tests__/recusaDeclaradaFluxo.test.ts` (store ↔ repositório mockado)

## Metadata

**Analog search scope:** `src/engine/`, `src/services/`, `src/components/session/`, `src/screens/`, `src/store/`, `supabase/migrations/`, `__tests__/`
**Files scanned:** 11 alvos + 8 analogs lidos diretamente nesta sessão (`sessionModel.ts` trecho 480-545, `SkipReasonSheet.tsx` completo em partes, `SessionQueue.tsx` grep+trechos, `sessionExecutionRepository.ts` grep dirigido, `SessionHistoryDetailScreen.tsx` trechos, `0020_recusa_declarada.sql` trechos 122-183 e 327-402 e 588-604, `cardioGoals.ts`/`cardioPrescrito.ts` grep de exports, `__tests__/` listagem)
**Pattern extraction date:** 2026-08-09
