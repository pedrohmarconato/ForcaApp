# Phase 1: Fluxo cardio e alongamento - Research

**Researched:** 2026-08-08
**Domain:** React Native (Expo) frontend + Supabase Postgres + Flask backend proxy de IA (Claude) — fluxo de cardio (registro de distância) e alongamento (condução guiada) dentro do modelo de treino existente
**Confidence:** HIGH para REQ-01 e REQ-02 (código lido linha a linha nos pontos exatos); MEDIUM para REQ-03 (mecanismo de "foco no chat" é dedutível da arquitetura existente, mas não há precedente direto no código para replicar 1:1)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Input decimal do cardio (REQ-01)**
- O campo de distância aceita vírgula como separador decimal (pt-BR): usuário digita `2,4`, persiste `2.4`, exibe `2,4 km`. Hoje só aceita inteiro.
- **Locked:** o comportamento acima.
- **Claude's Discretion:** máscara/teclado numérico, validação de faixa, precisão (sugestão: 2 casas), tipo de coluna no banco se precisar mudar.

**Meta de cardio no Progresso (REQ-02) — DECISÃO DO DONO (travada 2026-08-08)**
- **Derivar do treino.** A meta deixa de ser configurável à parte; passa a ser lida da prescrição do plano ativo. A tela Progresso mostra prescrito × realizado.
- A UI de definição manual de meta de cardio sai.
- **Claude's Discretion:** qual agregação usar (km/semana, min/semana, sessões/semana) — depende do que a prescrição do plano realmente contém; a pesquisa deve responder isso antes do plano.

**Alongamento guiado (REQ-03)**
- A parte de alongamento da sessão mostra exercícios nomeados e, para cada um, duração (segundos) ou número de movimentos.
- Pedido de foco feito no chat da IA (ex.: "foco em posterior de coxa") reflete na condução de alongamento das sessões correspondentes.
- **Claude's Discretion:** fonte dos exercícios (gerados pela IA no plano vs catálogo local versionado) — **ATENÇÃO:** se o caminho exigir mudança no schema do JSON do plano gerado (`TreinadorEspecialista`), isso é porta de mão única: o plano deve marcar `checkpoint:decision` antes da tarefa que implementa.

### Claude's Discretion (geral)
- Copy, componentes, nomes de arquivos/funções — seguindo CONVENTIONS.md.

### Deferred Ideas (OUT OF SCOPE)
- Nenhuma. Ideia extra descoberta durante a fase vira todo (`/gsd-capture`), não código.

### Phase Boundary
**IN:** os três requisitos acima, e só eles.
**OUT:** treino de força, replanejamento semanal, PWA, quota, qualquer refactor ou "melhoria" não pedida.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-01 | Campo de distância do cardio aceita decimal com vírgula, persiste e exibe o valor exato | Achado crítico: o caminho principal (`SessionPlayer.tsx`) **já está corrigido** (commit `925ba42`). O gap real está em `ManualExerciseRow.tsx:13`, que interpola o número cru sem formatação pt-BR. Ver seção "Common Pitfalls" e "Assumptions Log". |
| REQ-02 | Meta de cardio da Progresso deixa de ser definição paralela; deriva da prescrição do plano ativo (prescrito × realizado) | Schema já suporta: `planned_sets.target_distance_m`/`target_duration_seconds` (migration 0014) + `planned_exercises.muscle_group = 'Cardio'` (mapper). Nenhuma migration nem mudança de schema do JSON do molde é necessária. Ver "Architecture Patterns" e "Code Examples". |
| REQ-03 | Alongamento com condução (exercícios nomeados, duração ou nº de movimentos); pedido de foco no chat reflete na condução | O único chat existente é o de ONBOARDING (`PostQuestionnaireChat.tsx` → `/api/consolidate-chat` → `diretrizes.preferencias` → prompt do molde) — não há chat "durante" o plano. O campo `preferencias` (string livre) já flui até o prompt SEM mudança de schema. O gap real é o catálogo: só 4 entradas genéricas de `Mobilidade`, nenhuma nomeada por grupo muscular. Ver "Open Questions" e "Common Pitfalls". |

</phase_requirements>

## Summary

O código já resolveu boa parte do que o dono descreveu como pendente. **REQ-01** — o campo de distância no player de sessão (`src/components/session/SessionPlayer.tsx:65-70`, `525-554`) já aceita vírgula, já persiste corretamente em metros (`Math.round(km*1000)`) e já exibe com vírgula pt-BR (`formatDistance` em `src/engine/sessionModel.ts:311-314`) — corrigido pelo commit `925ba42 fix(player): campo decimal engolia o separador (3,2 km virava 32)`, já na história do branch atual. O gap real e verificado é menor e específico: `src/components/session/ManualExerciseRow.tsx:13` interpola `exercise.distancia_km` cru (`` `${exercise.distancia_km} km` ``) sem passar por `formatDistance`, então um valor como `2.4` aparece como "2.4 km" (ponto) em vez de "2,4 km" na lista do editor manual de treino avulso.

**REQ-02** é o mais simples dos três de implementar tecnicamente: a tabela `cardio_goals` (migration `0022_metas_de_cardio.sql`) mais o componente `CardioGoalsSection.tsx`/`CardioGoalSheet.tsx` são exatamente a "definição paralela" que sai. O que entra no lugar — prescrito × realizado — é derivável 100% do schema já existente: `planned_sets.target_distance_m numeric` e `target_duration_seconds integer` (migration `0014_cardio_tempo_distancia.sql:47-48`) já carregam o alvo por série, e `planned_exercises.muscle_group = 'Cardio'` (setado pelo mapper, `backend/services/plan_mapper.py:82`) já identifica quais exercícios são cardio. Não é necessária nenhuma migration nem mudança de schema do JSON do molde — só uma nova leitura no repositório (`trainingRepository.ts` já tem o padrão de `getPlanSessions`) e um novo cálculo puro no engine, no mesmo espírito de `cardioGoals.ts`/`progressStats.ts` (nunca inventar número; "sem amostra" é "—").

**REQ-03** é o mais aberto dos três. Hoje não existe "condução de alongamento" como conceito — para o fluxo de plano gerado por IA (o caminho principal do produto), alongamento é só um exercício comum do catálogo com `muscle_group = 'Mobilidade'` e `metric = 'tempo'`, escolhido livremente pela IA entre **4 entradas genéricas** (`aquecimento_articular`, `alongamento_dinamico`, `mobilidade_quadril`, `mobilidade_ombro`) — nenhuma nomeada por grupo muscular específico ("posterior de coxa" não existe no catálogo). A injeção determinística de aquecimento/alongamento fixos (`backend/services/manual_plan_builder.py:24-44`) só existe no editor MANUAL, não no fluxo de IA. Sobre o "pedido de foco no chat": o único chat que existe hoje é o de onboarding, e o campo `diretrizes.preferencias` (string livre, `backend/schemas/diretrizes_schema.py:26-31`) já é serializado inteiro dentro do prompt pago do molde (`backend/app.py:1590,1767`) — ou seja, capturar "foco em posterior de coxa" como uma preferência e fazer a IA respeitá-la ao escolher exercícios de `Mobilidade` **não exige mudar o schema do JSON do plano**, desde que o catálogo tenha exercícios nomeados o suficiente para a IA escolher. A porta de mão única citada em CONTEXT.md só se abre se a "condução" precisar de um campo estruturado novo (ex.: `numero_movimentos`) dentro do objeto de exercício do molde — o que os dados atuais sugerem ser evitável (ver "Open Questions").

**Primary recommendation:** Trate REQ-01 como uma correção pontual e verificada em `ManualExerciseRow.tsx` (não uma reescrita do player). Trate REQ-02 como leitura nova + engine novo, sem migration. Trate REQ-03 como expansão de catálogo (JSON versionado, aditivo) + reforço de prompt usando o campo `preferencias` já existente — e force uma decisão explícita do dono (`checkpoint:decision`) só se a representação de "número de movimentos" exigir um campo novo no schema do molde em vez de reaproveitar `metric: 'carga_reps'` com `reps_raw` textual (que já existe e já é livre).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Input/parse de distância decimal | Browser/Client (`src/components/session/SessionPlayer.tsx`) | — | Parsing e máscara são puramente client-side; `parseFloatOrNull` já normaliza vírgula→ponto antes de qualquer I/O |
| Persistência da distância real | Database (Supabase `set_logs.actual_distance_m numeric`) | API/Backend (RPC `save_set_log`) | Coluna já é `numeric` (não `integer`); RPC já aceita `p_actual_distance_m numeric` — nenhuma mudança de schema necessária |
| Exibição formatada pt-BR | Browser/Client (`src/engine/sessionModel.ts` `formatDistance`) | — | Função pura já existe e já está correta; o gap é um componente que não a usa |
| Meta de cardio (prescrito) | API/Backend indireto (dado nasce no molde) | Database (`planned_sets.target_distance_m/target_duration_seconds`) | A IA prescreve; o banco persiste via `save_training_plan`; o app só LÊ |
| Cálculo prescrito × realizado | Browser/Client (novo módulo em `src/engine/`, espelhando `cardioGoals.ts`) | Database (leitura via `trainingRepository`-like) | Cálculo é puro (sem I/O), consumindo dado já persistido nas duas pontas (plan vs set_logs) |
| Remoção da meta manual | Browser/Client (remover `CardioGoalsSection`/`CardioGoalSheet` da tela) | Database (dado legado em `cardio_goals` permanece, mas fica órfão de UI) | Nenhuma tabela precisa ser dropada nesta fase — só a UI de escrita sai |
| Catálogo de exercícios de alongamento | API/Backend (`backend/data/catalogo_exercicios.json`, arquivo versionado) | — | Dado estático consumido pelo backend na montagem do prompt; expansão é aditiva, sem migration |
| "Foco" do chat → condução | API/Backend (`diretrizes.preferencias` → prompt do molde) | Browser/Client (captura no `PostQuestionnaireChat.tsx`) | O texto do pedido nasce no client (chat), mas quem decide o que fazer com ele é o prompt da IA no backend |
| Renderização da condução em sessão | Browser/Client (`SessionPlayer.tsx`/`SessionQueue.tsx`) | — | Mesma trilha de UI que já renderiza exercícios `tempo`/`tempo_distancia` — reaproveitável, não é tier novo |

## Standard Stack

Esta fase não introduz nenhuma biblioteca nova. Todo o trabalho é sobre o stack já fixado no projeto (React Native/Expo + Zustand + Supabase JS + Flask + Anthropic SDK), documentado em `.planning/codebase/STACK.md`. Não há `npm install`/`pip install` previsto.

### Alternativas descartadas (não aplicável aqui)
Nenhuma — não há decisão de biblioteca nesta fase.

## Package Legitimacy Audit

**Não aplicável.** Nenhum pacote novo é instalado nesta fase (frontend, backend ou banco). Gate de legitimidade de pacote dispensado — confirmado por leitura de `package.json`/`requirements.txt` sem necessidade de nova dependência para os três requisitos.

## Architecture Patterns

### REQ-01 — trilha do dado (distância)

```
TextInput (SessionPlayer.tsx:528, keyboardType="numeric")
   │  usuário digita "2,4"
   ▼
parseFloatOrNull(t)  [SessionPlayer.tsx:65-70]
   │  t.replace(',', '.') → "2.4" → parseFloat → 2.4
   ▼
setDistance(exerciseId, setOrder, Math.round(2.4 * 1000))  [SessionPlayer.tsx:541-545]
   │  → activeSessionStore.setDistance [activeSessionStore.ts:1134]
   ▼
draft.actualDistanceM = 2400 (rascunho em memória + AsyncStorage)
   │  ao concluir a série →
   ▼
sessionExecutionRepository → RPC save_set_log(p_actual_distance_m: numeric)  [0014_cardio_tempo_distancia.sql:166-177]
   │
   ▼
set_logs.actual_distance_m numeric  [0014_cardio_tempo_distancia.sql:93]  (aceita decimal — 2400 ou 2400.5, sem perda)
   │  releitura →
   ▼
formatDistance(meters)  [sessionModel.ts:311-314]  → "2,4 km" (pt-BR, sem zero à toa)
```

**Gap real:** `ManualExerciseRow.tsx:13` NÃO passa pelo `formatDistance` — interpola `exercise.distancia_km` (um `number`) direto no template string. Este componente é usado na lista de exercícios do editor manual de treino avulso (`ManualWorkoutEditorScreen.tsx`), não no player de sessão.

### REQ-02 — de onde vem "prescrito" (nova leitura, sem migration)

```
Plano ativo do usuário (training_plans.status = 'active')
   │
   ▼
getActivePlanId(userId)  [trainingRepository.ts:90-100]  ← já existe
   │
   ▼
planned_sessions WHERE plan_id = X  (filtra por semana corrente — ver Open Questions)
   │  join
   ▼
planned_exercises WHERE muscle_group = 'Cardio'  [plan_mapper.py:82 seta este valor]
   │  join
   ▼
planned_sets.target_distance_m / target_duration_seconds  [0014_cardio_tempo_distancia.sql:46-48]
   │
   ▼
Soma pura (novo módulo engine, ex. src/engine/cardioPrescrito.ts, espelhando cardioGoals.ts)
   │
   ▼
"Prescrito: X km / Y min / Z sessões esta semana"  ← comparado com getCardioLogs() já existente
                                                        [cardioGoalRepository.ts:66-107, JÁ FILTRA muscle_group='Cardio']
```

**Precedente de "semana corrente" a reaproveitar:** `progressStats.ts` usa `inicioDaSemana(hoje)` (semana começa segunda) para volume e constância — `volumePorSemana` em `src/engine/progressStats.ts:109-114`, importado de `src/utils/weekSummary.ts`. REQ-02 deve seguir o MESMO corte de semana (por `scheduled_date`, não por `week_number`), para a aba Progresso não discordar de si mesma entre a seção de cardio e o resto (mesma preocupação já documentada no comentário de `cardioGoals.ts:178-183`).

**O que remove:** `CardioGoalsSection.tsx` (import em `ProgressScreen.tsx:40`) e `CardioGoalSheet.tsx` saem da tela. `cardioGoalRepository.ts` — as funções `definirMeta`/`arquivarMeta`/`registrarMetaBatida` deixam de ser chamadas pela UI (mas `getCardioLogs` continua necessária, é a fonte do "realizado"). A tabela `cardio_goals` e suas RPCs (`upsert_cardio_goal`, `archive_cardio_goal`, `achieve_cardio_goal`) **não precisam ser dropadas** nesta fase — ficam órfãs de UI, sem risco imediato (RLS já as protege por `user_id`).

### REQ-03 — trilha do "foco" (sem mudança de schema do molde, se a representação for reps-baseada)

```
PostQuestionnaireChat.tsx (ÚNICO chat existente — roda ANTES da geração)
   │  usuário: "foco em alongamento de posterior de coxa"
   ▼
POST /api/consolidate-chat  [backend/app.py:1190]
   │  IA extrai diretrizes estruturadas
   ▼
diretrizes.preferencias: ["foco em alongamento de posterior de coxa"]
   │  [backend/schemas/diretrizes_schema.py:26-31 — array de string, maxLength 500, JÁ existe]
   ▼
POST /api/generate-plan { diretrizes }  [backend/app.py:1014]
   │
   ▼
_executar_geracao_molde(...)  [backend/app.py:1724]
   │  diretrizes_str = json.dumps(diretrizes, ...)  [app.py:1767]
   │  injetado no prompt junto do questionário  [app.py:1590,1773]
   ▼
IA escolhe exercícios do catálogo (catalogo_para_prompt, incluir_mobilidade)
   │  [exercise_catalog.py:413-437] — SÓ 4 entradas de Mobilidade hoje, nenhuma
   │  nomeada por grupo muscular específico
   ▼
molde → plan_expander → plan_mapper → save_training_plan
   │  metric='tempo' (ou 'carga_reps' se representar por nº de movimentos)
   ▼
planned_exercises com muscle_group='Mobilidade', renderizado pelo MESMO
SessionPlayer.tsx que já trata `metric='tempo'` (bloco de isometria/cardio,
linhas 456-524) — nenhuma UI nova estritamente necessária, só dado melhor.
```

**Ponto de decisão real:** hoje o catálogo não tem granularidade por grupo muscular para alongamento (só 4 entradas genéricas, `backend/data/catalogo_exercicios.json:108-111`). Expandir o catálogo é uma mudança **aditiva** (arquivo JSON versionado, sem migration, sem schema do molde) e resolve a maior parte do gap. O prompt (`app.py`) também precisa ser instruído a de fato USAR `diretrizes.preferencias` para selecionar exercícios de `Mobilidade` — isso é mudança de PROMPT, não de schema.

### Recommended Project Structure (novos arquivos previstos)
```
src/engine/
├── cardioPrescrito.ts       # NOVO — prescrito × realizado (REQ-02), puro, espelha cardioGoals.ts
src/components/progress/
├── CardioPrescritoSection.tsx  # NOVO (substitui CardioGoalsSection na tela) — nome sugerido
backend/data/
├── catalogo_exercicios.json  # EDITADO — novas entradas de Mobilidade nomeadas por grupo muscular
```

### Anti-Patterns to Avoid
- **Reescrever `SessionPlayer.tsx` para "corrigir" REQ-01:** o parsing já está correto (commit `925ba42`); reescrever arrisca reintroduzir a regressão que o commit já corrigiu. Corrija o ponto específico (`ManualExerciseRow.tsx`).
- **Adicionar coluna/migration para "meta derivada" (REQ-02):** o dado prescrito já existe em `planned_sets`; criar uma tabela ou coluna nova para "meta calculada" duplicaria a fonte de verdade que a própria decisão do dono queria eliminar.
- **Mudar `molde_schema.py` para adicionar campo estruturado de alongamento sem necessidade:** o CONTEXT.md já marca isso como porta de mão única — só abrir essa porta se a representação por `reps_raw`/catálogo aditivo se mostrar insuficiente no discuss/plan.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Formatação de distância pt-BR | Nova função de formatação em `ManualExerciseRow.tsx` | `formatDistance` já exportado de `src/engine/sessionModel.ts:311-314` | Já testado (`__tests__/cardioTempoDistancia.test.ts:175-177`), já usado em 2 outros lugares (`SessionPlayer.tsx`, `trainingRepository.ts:formatExerciseTarget`) |
| Parsing de decimal com vírgula | Novo parser | `parseFloatOrNull` (`SessionPlayer.tsx:65-70`) ou `numericTextToNumber`/`sanitizeNumericText` (`src/components/ui/NumericField.tsx:43-69`, já cobre "texto é a fonte da verdade, número é derivado") | Dois padrões já existem e resolvem exatamente esse problema em dois contextos diferentes (série em execução vs. edição de prescrição) |
| Corte de "semana corrente" | Nova lógica de data | `inicioDaSemana` de `src/utils/weekSummary.ts`, já usado por `progressStats.ts` e `cardioGoals.ts` | Duas convenções de semana no mesmo app fariam a aba Progresso discordar de si mesma (comentário explícito em `cardioGoals.ts:178-181`) |
| "Sem amostra" vs "zero real" | Ad-hoc `?? 0` | Padrão de `cardioGoals.ts:64-67` (`numeroPositivo`) e comentário de topo do arquivo — distinção deliberada entre meta de desempenho (`null` = sem amostra) e consistência (zero é fato) | Regra de produto documentada e testada (`__tests__/cardioGoals.test.ts`); reaplica-se a "prescrito × realizado" |

**Key insight:** este projeto já tem, para cardio, os TRÊS padrões que REQ-01/02/03 precisam (parsing decimal, formatação pt-BR, cálculo "sem inventar número"). O risco maior não é técnico — é duplicar lógica que já existe em vez de localizá-la.

## Common Pitfalls

### Pitfall 1: assumir que REQ-01 está "quebrado" no player de sessão
**What goes wrong:** implementar de novo o parsing de decimal no `SessionPlayer.tsx`, arriscando reintroduzir o bug que `925ba42` já corrigiu, ou gastar esforço de plano num lugar que já está correto.
**Why it happens:** o CONTEXT.md (ditado pelo dono no chat) registra "Hoje só aceita inteiro" — mas essa afirmação não bate com o código lido nesta pesquisa. É possível que o dono tenha testado ANTES do fix `925ba42`, ou tenha testado um caminho diferente (ex.: editor manual).
**How to avoid:** o plano deve verificar em runtime (harness ou app real) qual tela o dono realmente testou antes de "consertar" o que já funciona. Ver "Assumptions Log" — este é o achado mais importante da pesquisa para não desperdiçar uma tarefa inteira.
**Warning signs:** se a tarefa de REQ-01 vier descrita como "corrigir o parsing no player", pare e confirme contra `git log -- src/components/session/SessionPlayer.tsx` antes de tocar.

### Pitfall 2: privilégios default expondo RPC/tabela nova (precedente 0031/0032)
**What goes wrong:** se REQ-02 precisar de alguma RPC nova (por ex., para arquivar metas legadas), os privilégios default do Postgres concedem `EXECUTE` a `anon` em toda função nova — a própria migration `0022_metas_de_cardio.sql:283-291` documenta esse aprendizado ("aprendizado da 0019") e faz um `revoke all ... from public, anon` explícito seguido de assert.
**Why it happens:** comportamento default do Postgres, não do Supabase — toda função criada herda `EXECUTE` para roles amplas a menos que revogado explicitamente.
**How to avoid:** se qualquer migration nova for necessária nesta fase (não deveria ser, para REQ-02 como pesquisado), copiar o padrão de `revoke all ... grant execute ... to authenticated` + asserção de `has_function_privilege('anon', ...)` da própria `0022`.
**Warning signs:** ausência de bloco `do $$ ... assert ... $$` no fim de qualquer migration nova.

### Pitfall 3: catálogo de alongamento raso demais para "foco" funcionar
**What goes wrong:** implementar o encanamento do "foco no chat → prompt" (que já existe via `preferencias`) mas a IA não ter exercícios nomeados o suficiente no catálogo para atender ao pedido — o pedido "vira" texto no prompt mas não influencia a seleção porque só há 4 opções genéricas.
**Why it happens:** `backend/data/catalogo_exercicios.json` tem só `aquecimento_articular`, `alongamento_dinamico`, `mobilidade_quadril`, `mobilidade_ombro` sob `grupo_muscular: "Mobilidade"` (linhas 108-111) — nenhum "posterior de coxa", "peitoral", "lombar", etc.
**How to avoid:** o plano deve incluir uma tarefa de expansão do catálogo (aditiva, sem migration) ANTES ou junto da tarefa de prompt, com nomes específicos por grupo muscular alvo.
**Warning signs:** teste manual pedindo "foco em posterior de coxa" e o plano gerado continuar mostrando só "Alongamento Dinâmico" genérico.

### Pitfall 4: schema do molde tem poda ativa de campos "inertes" (`aquecimento`/`desaquecimento`)
**What goes wrong:** tentar reintroduzir um campo estruturado de aquecimento/alongamento no schema do molde sem saber que ele já existiu e foi DELIBERADAMENTE removido por custo de gramática da API (`400 — compiled grammar too large`).
**Why it happens:** `backend/schemas/molde_schema.py:539-558` (`_podar_campos_inertes`) documenta que `aquecimento`/`desaquecimento` existiam desde o gerador legado, nunca eram usados pelo prompt, e foram cortados por limite real e medido da API de structured outputs.
**How to avoid:** qualquer campo novo proposto para o schema do molde deve ser justificado contra esse histórico — a API JÁ rejeitou complexidade extra uma vez; um campo novo de "número de movimentos" precisa entrar pela ordem certa (ver Pitfall 5) e competir por espaço na gramática.
**Warning signs:** proposta de adicionar mais de 1-2 campos novos ao objeto de exercício do molde.

### Pitfall 5: ordem de propriedades no schema estruturado importa (não é cosmético)
**What goes wrong:** adicionar um campo novo (ex.: `numero_movimentos`) no fim do objeto de exercício, do jeito "natural", e a IA gerar cardio/mobilidade sem preenchê-lo — mesmo bug que já aconteceu com `duracao_minutos`.
**Why it happens:** a API de structured output percorre `properties` NA ORDEM declarada e o modelo se compromete campo a campo sem poder voltar; `_priorizar_alvos_de_prescricao` (`molde_schema.py:564-589`) documenta que, com `duracao_minutos` fora de ordem, 100% das gerações testadas (6/6) saíam sem alvo de cardio.
**How to avoid:** SE um campo estruturado novo for mesmo necessário (decisão do dono via `checkpoint:decision`), ele precisa ser posicionado a ordem certa e testado contra a API real, não só contra o schema local.
**Warning signs:** qualquer PR que adicione campo ao schema do molde sem também tocar `_priorizar_alvos_de_prescricao` ou equivalente.

## Code Examples

### Formatação pt-BR de distância (já existe, reaplicar em ManualExerciseRow.tsx)
```typescript
// Source: src/engine/sessionModel.ts:311-314 (verificado nesta sessão)
/** Distância legível em km, sem zeros à toa: 5000 → "5 km", 3200 → "3,2 km". */
export const formatDistance = (meters: number | null | undefined): string => {
  if (meters == null || meters <= 0) return '—';
  return `${(meters / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} km`;
};
```

### Parsing de decimal com vírgula (já existe, dois padrões válidos)
```typescript
// Source: src/components/session/SessionPlayer.tsx:65-70 (verificado nesta sessão)
const parseFloatOrNull = (t: string): number | null => {
  const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
  if (norm === '' || norm === '.') return null;
  const v = parseFloat(norm);
  return Number.isFinite(v) ? v : null;
};
```

```typescript
// Source: src/components/ui/NumericField.tsx:43-69 (verificado nesta sessão)
// Padrão alternativo: mantém o TEXTO digitado como fonte da verdade (evita que
// "0," seja reescrito no meio da digitação).
export const sanitizeNumericText = (raw: string, integer = false): string => { /* ... */ };
export const numericTextToNumber = (text: string): number | null => {
  const normalizado = text.replace(',', '.');
  if (!normalizado || normalizado === '.') return null;
  const parsed = Number(normalizado);
  return Number.isFinite(parsed) ? parsed : null;
};
```

### Schema já persistido para prescrição de cardio (nenhuma migration necessária)
```sql
-- Source: supabase/migrations/0014_cardio_tempo_distancia.sql:46-48 (verificado nesta sessão)
alter table public.planned_sets
  add column if not exists target_duration_seconds integer,
  add column if not exists target_distance_m numeric;
```

### Leitura de "realizado" já filtrada por muscle_group='Cardio' (reaproveitar padrão para "prescrito")
```typescript
// Source: src/services/cardioGoalRepository.ts:66-87 (verificado nesta sessão)
export const getCardioLogs = async (userId: string): Promise<CardioLog[]> => {
  // ...
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
    // ...
};
```

### Campo já existente para carregar "foco" até o prompt da IA (sem mudança de schema)
```python
# Source: backend/schemas/diretrizes_schema.py:26-31 (verificado nesta sessão)
"preferencias": {
    "type": "array",
    "description": "Preferências e ajustes gerais solicitados pelo aluno.",
    "maxItems": MAX_ITENS_POR_LISTA,
    "items": {"type": "string", "maxLength": 500}
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Distância no cardio "engolindo" separador decimal | `parseFloatOrNull` + `formatDistance` com vírgula pt-BR no `SessionPlayer.tsx` | commit `925ba42` (já no histórico do branch, antes desta fase) | REQ-01 já resolvido no caminho principal; escopo real é menor que o CONTEXT.md sugere |
| Cardio "reps=20" sem significado | `metric` (`carga_reps`\|`tempo`\|`tempo_distancia`) em `planned_exercises`/`planned_sets` | migration `0014` | Base de dados já modela cardio corretamente; REQ-02/03 constroem sobre isso, não recriam |

**Deprecado/obsoleto:**
- `aquecimento`/`desaquecimento` como campos estruturados do molde: existiam no contrato do `TreinadorEspecialista` (gerador legado), nunca usados pelo prompt, removidos por custo de gramática da API (`molde_schema.py:539-558`). Não trazer de volta sem necessidade forte.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | O relato do dono ("Hoje só aceita inteiro") refere-se a um estado ANTERIOR ao commit `925ba42`, ou a uma tela diferente do player de sessão (ex.: editor manual) — não ao caminho principal hoje. | Summary, Pitfall 1 | Se o dono na verdade testou o player de sessão HOJE e viu o bug, a leitura estática desta pesquisa está incompleta e o plano precisa reabrir a investigação com um teste manual real antes de fechar REQ-01 como "correção pontual". |
| A2 | "km/semana", "min/semana" e "sessões/semana" são todos deriváveis SEM mudança de schema, a partir de `planned_sets`/`planned_exercises` da semana corrente do plano ativo. | Architecture Patterns (REQ-02) | Confirmado por leitura direta do schema (0014) — risco baixo, mas a escolha de QUAL agregação mostrar na UI continua em aberto (ver Open Questions), é decisão de produto, não técnica. |
| A3 | O "chat da IA" mencionado em REQ-03 é o chat de ONBOARDING (`PostQuestionnaireChat.tsx`), não um chat contínuo durante o plano — não existe outro consumidor de `/api/chat` no código. | Architecture Patterns (REQ-03), Open Questions | Se o dono quis dizer um chat DURANTE o plano (que não existe hoje), REQ-03 vira uma feature muito maior (nova tela, novo endpoint, novo mecanismo de aplicar mudança a um plano já persistido) — precisa confirmação explícita antes do plano. |
| A4 | Representar "número de movimentos" por alongamento pode reaproveitar `metric: 'carga_reps'` com `reps_raw` textual (ex.: "10 rotações") em vez de um campo estruturado novo. | Architecture Patterns (REQ-03), Pitfall 4/5 | Se essa reutilização não for aceitável (ex.: o dono quer contagem numérica validável, não texto livre), a fase precisa de um campo novo no molde — abre a porta de mão única que o CONTEXT.md já sinalizou, com `checkpoint:decision` obrigatório. |
| A5 | Expandir `backend/data/catalogo_exercicios.json` com entradas nomeadas por grupo muscular de alongamento é suficiente para a IA respeitar um pedido de foco, dado que `preferencias` já chega ao prompt. | Common Pitfalls (Pitfall 3) | Se a IA ignorar `preferencias` na prática (falta de instrução explícita no prompt para usá-la ao escolher `Mobilidade`), a fase também precisa de um ajuste de prompt, não só de catálogo — deve ser testado com geração real antes de fechar a tarefa. |

## Open Questions

1. **Qual agregação de "prescrito" mostrar na Progresso (REQ-02)?**
   - What we know: o schema suporta km/semana (`target_distance_m`), min/semana (`target_duration_seconds`) e sessões/semana (contagem de dias distintos com exercício `muscle_group='Cardio'`) — os três são deriváveis sem mudança de schema.
   - What's unclear: qual(is) o dono quer ver simultaneamente. A tela atual já tem DOIS tipos de meta (desempenho: distância×tempo por modalidade; consistência: minutos/sessões semanais) — a versão "derivada" pode simplificar para um único cartão ou manter os dois eixos.
   - Recommendation: levar ao discuss-phase (ou perguntar direto ao dono, como já feito para a decisão-mãe de REQ-02) antes do plano — é decisão de produto, não risco técnico.

2. **O chat de REQ-03 é o de onboarding ou precisa ser um novo canal contínuo?**
   - What we know: hoje só existe `PostQuestionnaireChat.tsx`, que roda ANTES da primeira geração (ou de uma regeneração completa via "Refazer treino", `RefazerTreinoSheet.tsx`).
   - What's unclear: se o dono espera pedir foco DEPOIS que o plano já está ativo e ver isso refletido nas próximas sessões sem regenerar o plano inteiro — isso seria uma feature nova de dimensão maior (fora do escopo aparente de "3 requisitos pontuais").
   - Recommendation: confirmar com o dono ANTES do plano se "o chat da IA" = onboarding/regeneração (mais barato, já suportado) ou um novo mecanismo (mais caro, precisa desenho novo).

3. **Vale a pena arquivar as `cardio_goals` ativas existentes em produção quando a UI sair?**
   - What we know: a tabela `cardio_goals` tem RLS e índice único "uma ativa por tipo"; usuários que já definiram uma meta (via `CardioGoalSheet`) terão linhas `status='active'` órfãs de UI depois que REQ-02 remover as telas de definição.
   - What's unclear: se isso importa para o produto (a tabela simplesmente para de ser lida, sem erro) ou se há valor em rodar uma migration leve arquivando as metas ativas restantes por higiene de dado.
   - Recommendation: baixo risco — registrar como nota no plano, sem bloquear a fase; não é um requisito declarado.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | frontend build/test | ✓ | v24.17.0 | — |
| npm | dependências frontend | ✓ | 11.13.0 | — |
| Python | backend/testes | ✓ | 3.9.6 (local) / 3.11 (Docker) | — |
| tsc | portão de tipo | ✓ | 5.9.3 | — |
| pytest | testes backend | ✓ | 8.4.2 | — |
| jest | testes frontend | ✓ (via npx, `package.json`) | ^29.7.0 | — |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (`jest-expo` preset) no frontend; pytest 8 no backend |
| Config file | `package.json` (bloco `jest`); `backend/tests/conftest.py` |
| Quick run command | `npx jest __tests__/cardioTempoDistancia.test.ts` / `python3 -m pytest backend/tests/test_cardio_prescricao.py -q` |
| Full suite command | `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q` (não use o exit code do jest como portão — ver `AGENTS.md`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| REQ-01 | `ManualExerciseRow` exibe distância com vírgula pt-BR (não ponto) | unit/component | `npx jest __tests__/manualExerciseRow.test.tsx` | ❌ Wave 0 (arquivo não existe hoje — não há teste de `ManualExerciseRow` em `__tests__/`) |
| REQ-01 | `SessionPlayer` digitação "2,4" → `actualDistanceM = 2400` (regressão do fix já existente) | component | `npx jest __tests__/sessionPlayerTransitions.test.tsx` | ✅ arquivo existe, mas sem teste específico de digitação decimal — adicionar caso |
| REQ-02 | Cálculo prescrito × realizado não inventa número sem amostra | unit | `npx jest __tests__/cardioPrescrito.test.ts` (novo) | ❌ Wave 0 — módulo `src/engine/cardioPrescrito.ts` ainda não existe |
| REQ-02 | Leitura de plano ativo filtra corretamente semana corrente + `muscle_group='Cardio'` | integration (mock supabase) | `npx jest __tests__/cardioPrescritoRepository.test.ts` (novo) | ❌ Wave 0 |
| REQ-03 | Catálogo expandido tem entradas nomeadas por grupo muscular de alongamento | unit | `python3 -m pytest backend/tests/test_exercise_catalog.py -q` | ✅ arquivo existe — adicionar casos para as novas entradas |
| REQ-03 | `preferencias` de foco chega ao prompt do molde | unit | `python3 -m pytest backend/tests/test_prompt_molde_estrutura.py -q` | ✅ arquivo existe — verificar/adicionar asserção de que `preferencias` aparece no prompt final |

### Sampling Rate
- **Per task commit:** rodar o teste específico da área tocada (ex.: `npx jest cardioTempoDistancia`)
- **Per wave merge:** `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q`
- **Phase gate:** suíte completa verde + `npx tsc --noEmit` antes de `/gsd-verify-work` (sem CI no repo — `AGENTS.md`)

### Wave 0 Gaps
- [ ] `__tests__/manualExerciseRow.test.tsx` — cobre REQ-01 (formatação pt-BR na lista do editor manual)
- [ ] `src/engine/cardioPrescrito.ts` + `__tests__/cardioPrescrito.test.ts` — cobre REQ-02 (cálculo puro)
- [ ] Caso de teste novo em `backend/tests/test_exercise_catalog.py` para as entradas de alongamento nomeadas — cobre REQ-03

## Security Domain

`security_enforcement` não está configurado em `.planning/config.json` (arquivo ausente/vazio nesta pesquisa) → tratado como habilitado por padrão.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não | Fase não toca autenticação |
| V3 Session Management | não | Fase não toca sessão de auth |
| V4 Access Control | sim (indireto) | Nenhuma RPC/tabela nova prevista; se REQ-02 precisar de alguma escrita nova, seguir o padrão RLS `auth.uid() = user_id` + `revoke all ... grant execute ... to authenticated` já usado em `0022_metas_de_cardio.sql` |
| V5 Input Validation | sim | Distância decimal: já validada por `CHECK (actual_distance_m > 0)` no banco (`0014_cardio_tempo_distancia.sql:113-115`) e por `parseFloatOrNull`/`sanitizeNumericText` no cliente; qualquer campo novo de "movimentos" deve seguir o mesmo padrão (CHECK no banco + sanitização no cliente, nunca confiar só no client) |
| V6 Cryptography | não | Não aplicável |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Payload de `diretrizes.preferencias` usado para inflar o prompt pago (custo) | Denial of Service (custo) | Já mitigado: `MAX_ITENS_POR_LISTA=30`, `maxLength: 500` por item, e o teto global de 256 KiB de `MAX_CONTENT_LENGTH` (`backend/app.py`) — nenhuma mudança necessária, só não afrouxar esses limites ao adicionar mais campos |
| RPC nova sem `revoke` explícito expondo escrita a `anon` | Elevation of Privilege | Seguir o padrão de asserção da própria `0022_metas_de_cardio.sql:283-291` se alguma RPC nova for criada |

## Sources

### Primary (HIGH confidence)
- Leitura direta do código-fonte nesta sessão (`Read`/`grep`/`git log`), sem consulta a documentação externa — fase é 100% interna ao repo, sem biblioteca nova.
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md`, `STACK.md` (mapas do codebase, atualizados 2026-08-08, lidos integralmente)
- `AGENTS.md` (raiz do repo) — regras de ambiente Supabase e convenções de teste
- `git log --oneline -5 -- src/components/session/SessionPlayer.tsx` — confirma o commit `925ba42` já no histórico do branch

### Secondary (MEDIUM confidence)
- Nenhuma — não houve consulta a fontes externas (WebSearch/Context7) nesta pesquisa; todo o domínio é interno ao repositório.

### Tertiary (LOW confidence)
- Nenhuma.

## Metadata

**Confidence breakdown:**
- REQ-01: HIGH — código-fonte lido linha a linha no caminho de execução completo (input → parse → store → RPC → coluna → formatação de exibição), gap identificado com precisão de linha.
- REQ-02: HIGH — schema já existe e foi lido integralmente (migration 0014 e 0022); padrão de cálculo puro já estabelecido em `cardioGoals.ts`/`progressStats.ts` para reaproveitar.
- REQ-03: MEDIUM — mecanismo de fluxo (chat→diretrizes→prompt) é verificado e real, mas a suficiência do catálogo expandido e a disposição do prompt em de fato usar `preferencias` para condução de alongamento não foram testadas em runtime (exigem geração real de plano para confirmar).

**Research date:** 2026-08-08
**Valid until:** 30 dias (domínio interno estável, sem dependência de API externa versionada) — exceto se o modelo de IA do molde (`PLAN_MODEL_NAME`) mudar antes disso, o que alteraria o comportamento do prompt.
