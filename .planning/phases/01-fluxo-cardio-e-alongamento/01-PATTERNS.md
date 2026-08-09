# Phase 1: Fluxo cardio e alongamento - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 7 (3 REQ-01/02 diretos + 1 remoção + 2 novos de engine/UI + 1 catálogo)
**Analogs found:** 6 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/components/session/ManualExerciseRow.tsx` (EDITAR — bug fix pontual) | component | transform (formatação de exibição) | `src/engine/sessionModel.ts` (`formatDistance`) + `SessionPlayer.tsx` (uso de `formatDistance`) | exact (é reaproveitar, não copiar molde) |
| `src/engine/cardioPrescrito.ts` (NOVO) | utility/service (motor puro) | transform / CRUD-read agregado | `src/engine/cardioGoals.ts` | exact — mesmo domínio (cardio), mesma disciplina "sem amostra = —" |
| `src/services/cardioPrescritoRepository.ts` (NOVO, nome sugerido) | service (repository) | request-response (leitura Supabase) | `src/services/cardioGoalRepository.ts` (`getCardioLogs`) + `src/services/trainingRepository.ts` (`getActivePlanId`, `getPlanSessions`) | exact |
| `src/components/progress/CardioPrescritoSection.tsx` (NOVO, substitui `CardioGoalsSection`) | component | request-response (leitura + render) | `src/components/progress/CardioGoalsSection.tsx` | role-match (mesmo slot na tela, dado de origem diferente) |
| `src/screens/ProgressScreen.tsx` (EDITAR — trocar import/uso) | screen/container | request-response | próprio arquivo (linhas 40, 266) | exact (edição in-place) |
| `backend/data/catalogo_exercicios.json` (EDITAR — expansão aditiva) | config/data (catálogo estático) | batch (dado versionado, sem I/O em runtime) | próprio arquivo, bloco `grupo_muscular: "Mobilidade"` (linhas 108-111) | exact |
| `backend/app.py` prompt de geração do molde (EDITAR — reforço de instrução sobre `preferencias`) | service (montagem de prompt) | request-response | próprio arquivo, uso existente de `diretrizes_str` (linhas ~1590, ~1767) | exact |
| `__tests__/manualExerciseRow.test.tsx` (NOVO) | test | — | testes existentes de componentes de sessão (ex. `__tests__/sessionPlayerTransitions.test.tsx`) | role-match |
| `__tests__/cardioPrescrito.test.ts` (NOVO) | test | — | `__tests__/cardioGoals.test.ts` | exact |

## Pattern Assignments

### `src/components/session/ManualExerciseRow.tsx` (component, transform)

**Analog:** `src/engine/sessionModel.ts` (função `formatDistance`) — NÃO reescrever a função, importar e usar.

**Gap exato** (linha 13 hoje):
```typescript
const distance = exercise.distancia_km != null ? ` · ${exercise.distancia_km} km` : '';
```
`exercise.distancia_km` é `number` cru (ex.: `2.4`) interpolado direto — sai "2.4 km" (ponto) em vez de "2,4 km".

**Padrão a copiar** (`src/engine/sessionModel.ts:311-314`):
```typescript
/** Distância legível em km, sem zeros à toa: 5000 → "5 km", 3200 → "3,2 km". */
export const formatDistance = (meters: number | null | undefined): string => {
  if (meters == null || meters <= 0) return '—';
  return `${(meters / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} km`;
};
```
**Atenção de unidade:** `formatDistance` espera METROS; `exercise.distancia_km` já está em KM (schema do editor manual, `ManualExerciseDraft`). Não chamar `formatDistance` direto sobre `distancia_km` sem converter (`distancia_km * 1000`) — criar uma formatação local em KM (reaproveitando a MESMA lógica de "sem zero à toa, vírgula pt-BR") ou converter antes de chamar. Confirmar o tipo exato de `distancia_km` em `src/types/manualPlan.ts` antes de decidir.

**Import pattern** (linhas 1-6, já no arquivo):
```typescript
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';
import { formatWorkDuration, type ManualExerciseDraft } from '../../types/manualPlan';
```

---

### `src/engine/cardioPrescrito.ts` (utility, motor puro)

**Analog:** `src/engine/cardioGoals.ts` (arquivo inteiro, especialmente `progressoConsistencia`)

**Imports pattern** (linhas 15-16):
```typescript
import { normalizeName } from './sessionModel';
import { inicioDaSemana } from '../utils/weekSummary';
```

**Disciplina "sem amostra = null, zero é fato"** (comentário de topo, linhas 1-13) — copiar literalmente esse raciocínio para o novo arquivo, adaptando para "prescrito × realizado":
```typescript
// Mesma disciplina do progressStats/cardioGoals: nada aqui inventa número.
// "sem amostra" é null; zero real (aluno não fez nada na semana) é fato e
// deve aparecer como 0, não como "—".
```

**Corte de semana corrente** (padrão a reaplicar, `cardioGoals.ts:185-206`):
```typescript
export const progressoConsistencia = (
  logs: readonly CardioLog[],
  meta: MetaConsistencia,
  referencia: Date = new Date(),
): ProgressoConsistencia => {
  const inicio = inicioDaSemana(referencia);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  // ... soma só quando quando >= inicio && quando < fim
};
```
Reaproveitar EXATAMENTE `inicioDaSemana` de `src/utils/weekSummary.ts` (segunda-feira como início) — é o mesmo corte usado por `progressStats.ts`. Não reimplementar corte de semana.

**Números "não-inventados"** (`cardioGoals.ts:64-67`):
```typescript
const numeroPositivo = (v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return v;
};
```

**Assinatura de saída sugerida** (espelhando `ProgressoConsistencia`, linhas 153-164): expor `prescritoKm`/`prescritoMinutos`/`prescritoSessoes` (todos `number | null`, deriváveis de `planned_sets.target_distance_m`/`target_duration_seconds` da semana corrente) ao lado de `realizadoMinutos`/`realizadoSessoes` (reaproveitando `progressoConsistencia` já existente, com `logs` vindos de `getCardioLogs`).

---

### `src/services/cardioPrescritoRepository.ts` (service, request-response)

**Analogs combinados:** `src/services/trainingRepository.ts` (`getActivePlanId`, `getPlanSessions`) + `src/services/cardioGoalRepository.ts` (`getCardioLogs`, filtro `muscle_group = 'Cardio'`)

**Padrão de plano ativo** (`trainingRepository.ts:90-100`):
```typescript
export const getActivePlanId = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
};
```

**Padrão de leitura de sessões do plano** (`trainingRepository.ts:133-146`):
```typescript
export const getPlanSessions = async (userId: string): Promise<PlannedSession[]> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return [];
  const { data, error } = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .order('week_number', { ascending: true })
    .order('order_in_week', { ascending: true });
  if (error) throw error;
  return data ?? [];
};
```
Para "prescrito da semana corrente", filtrar adicionalmente por `scheduled_date` dentro do intervalo de `inicioDaSemana`/`fim` (MESMO corte do engine acima), não por `week_number` (comentário explícito em RESEARCH.md — evita a aba Progresso discordar de si mesma).

**Padrão de join + filtro `muscle_group = 'Cardio'`** (`cardioGoalRepository.ts:66-87`, adaptar de `set_logs` para `planned_sets`/`planned_exercises`):
```typescript
const { data, error } = await supabase
  .from('set_logs')
  .select(
    'actual_duration_seconds, actual_distance_m, completed_at, session_logs!inner(user_id, finished_at), planned_sets!inner(planned_exercises!inner(name, exercise_key, metric, muscle_group))',
  )
  .eq('session_logs.user_id', userId)
  .not('session_logs.finished_at', 'is', null)
  .in('planned_sets.planned_exercises.metric', ['tempo', 'tempo_distancia'])
  .eq('planned_sets.planned_exercises.muscle_group', 'Cardio')
  .not('actual_duration_seconds', 'is', null)
  .order('completed_at', { ascending: false })
  .range(inicio, inicio + PAGINA - 1);
if (error) throw error;
```

**Error handling:** `if (error) throw error;` sempre — o repository nunca engole erro do Supabase, a tela decide o que mostrar (comentário de topo de `cardioGoalRepository.ts:4-7`).

**Coerção numérica do PostgREST** (`cardioGoalRepository.ts:32-44`, usar `toNum` de `src/engine/sessionModel.ts`):
```typescript
targetDistanceM: toNum(linha.target_distance_m),
```
`numeric` do Postgres chega como string via PostgREST — nunca somar sem `toNum`.

---

### `src/components/progress/CardioPrescritoSection.tsx` (component, request-response)

**Analog:** `src/components/progress/CardioGoalsSection.tsx` (estrutura de card, chamada ao hook/serviço, tratamento de loading/erro/vazio) — ler o arquivo completo antes de implementar; não incluído aqui por já ser o par 1:1 óbvio (mesmo slot da tela, troca só a fonte do dado: `cardio_goals` → `planned_sets`).

### `src/screens/ProgressScreen.tsx` (edição in-place)

**Padrão atual a substituir:**
```typescript
// linha 40
import CardioGoalsSection from '../components/progress/CardioGoalsSection';
// linha 266
<CardioGoalsSection ... />
```
Trocar por `CardioPrescritoSection`, mantendo a mesma posição na árvore de componentes da tela.

---

### `backend/data/catalogo_exercicios.json` (config, batch)

**Analog:** bloco existente de `Mobilidade` (linhas 108-111):
```json
{"chave": "aquecimento_articular", "nome": "Aquecimento Articular", "grupo_muscular": "Mobilidade", "equipamento": "Peso corporal", "peso_corporal": true, "incremento_kg": 0, "aliases": ["mobilidade articular", "aquecimento", "warm up", "aquecimento geral"], "metrica": "tempo"},
{"chave": "alongamento_dinamico", "nome": "Alongamento Dinâmico", "grupo_muscular": "Mobilidade", "equipamento": "Peso corporal", "peso_corporal": true, "incremento_kg": 0, "aliases": ["dynamic stretching", "alongamento ativo", "alongamento"], "metrica": "tempo"},
{"chave": "mobilidade_quadril", ...},
{"chave": "mobilidade_ombro", ...}
```
Expansão aditiva: novas entradas seguem o MESMO shape de campos (`chave`, `nome`, `grupo_muscular: "Mobilidade"`, `equipamento`, `peso_corporal`, `incremento_kg`, `aliases`, `metrica`), nomeadas por grupo muscular alvo (ex.: "Alongamento de Posterior de Coxa", "Alongamento de Peitoral", "Alongamento Lombar"). Não mudar o schema do objeto — só adicionar itens ao array.

### Shared Patterns

### Formatação/parsing decimal pt-BR
**Source:** `src/engine/sessionModel.ts:311-314` (`formatDistance`, metros→"X,Y km") e `src/components/session/SessionPlayer.tsx:65-70` (`parseFloatOrNull`, vírgula→ponto)
**Apply to:** qualquer exibição/entrada nova de distância em REQ-01/REQ-02. Não recriar — já existem dois padrões válidos (ver também `src/components/ui/NumericField.tsx:43-69` para o caso "texto é fonte da verdade").

### "Sem amostra é null/—, nunca 0 inventado"
**Source:** `src/engine/cardioGoals.ts` (comentário de topo + `numeroPositivo`)
**Apply to:** `cardioPrescrito.ts` (REQ-02) inteiro — é a regra de produto mais citada em CONTEXT.md/PROJECT.md ("nada de dado inventado na UI").

### Corte de "semana corrente" único no app
**Source:** `src/utils/weekSummary.ts` (`inicioDaSemana`, segunda-feira)
**Apply to:** `cardioPrescrito.ts` e `cardioPrescritoRepository.ts` — usar a MESMA função, nunca reimplementar corte de semana (evita divergência entre seções da aba Progresso).

### Error handling em repositórios Supabase
**Source:** `src/services/cardioGoalRepository.ts` e `src/services/trainingRepository.ts` — `if (error) throw error;` sempre, sem try/catch silencioso; a camada de UI decide o fallback.
**Apply to:** `cardioPrescritoRepository.ts` (REQ-02).

### RPC nova (se necessária) precisa revoke explícito
**Source:** `supabase/migrations/0022_metas_de_cardio.sql:283-291` (padrão `revoke all ... grant execute ... to authenticated` + `assert has_function_privilege('anon', ...) = false`)
**Apply to:** só se REQ-02/03 precisar de alguma migration nova (RESEARCH.md indica que não deveria ser necessário para REQ-02; REQ-03 não precisa de migration).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/app.py` — trecho de instrução explícita ao prompt para usar `preferencias` na seleção de exercícios de `Mobilidade` | service (prompt engineering) | request-response | Não há precedente de "instrução condicional por conteúdo de `preferencias`" no prompt atual — hoje `preferencias` só é serializada e injetada (linhas ~1590/1767), sem instrução dedicada de uso. Planner deve tratar como texto novo no prompt, seguindo o estilo de instrução já usado nas seções vizinhas do mesmo prompt (ler `backend/app.py` em torno de 1590-1780 no momento do plano). |

## Metadata

**Analog search scope:** `src/components/session/`, `src/engine/`, `src/services/`, `src/components/progress/`, `src/screens/ProgressScreen.tsx`, `src/utils/weekSummary.ts`, `backend/data/catalogo_exercicios.json`, `backend/app.py` (leitura indicada por RESEARCH.md, não relida linha a linha aqui — já citada com números de linha na pesquisa).
**Files scanned:** 7 arquivos lidos integral ou parcialmente nesta sessão de mapeamento (`ManualExerciseRow.tsx`, `cardioGoalRepository.ts`, `cardioGoals.ts`, trecho de `trainingRepository.ts`, trecho de `weekSummary.ts`, trecho de `catalogo_exercicios.json`, mais grep em `ProgressScreen.tsx`).
**Pattern extraction date:** 2026-08-08
