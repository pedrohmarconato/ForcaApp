# Phase 3: Intercâmbio de modalidade de cardio - Research

**Researched:** 2026-08-09
**Domain:** React Native/Expo (execução de sessão) + Supabase/Postgres (RPC/RLS) — troca de modalidade de cardio intra-sessão
**Confidence:** HIGH (todo achado abaixo vem de leitura direta do código/migrations desta sessão — nenhuma dependência externa nova)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Travado pelo ROADMAP (success criteria — não renegociar):**
- **D-01:** A meta da modalidade trocada é SÓ tempo (`target_duration_seconds` preservado). A distância prescrita da original nunca é exibida como meta da nova — sem dado inventado.
- **D-02:** A lista de troca oferece SÓ as modalidades aceitas do usuário.
- **D-03:** O realizado na modalidade trocada conta normalmente no realizado do Progresso.

**Meta e realizado na modalidade trocada (decisões do dono, 2026-08-09):**
- **D-04:** Registro de distância realizada na trocada: SIM, quando fizer sentido — campo de distância opcional aparece se a nova modalidade tem métrica de distância (subset `CARDIO_MODALIDADES_COM_DISTANCIA`); modalidades só-tempo (Pular Corda, HIIT, Escada Ergométrica) não mostram o campo.
- **D-05:** Realizado km da semana no Progresso: km é km — soma a distância realizada de QUALQUER modalidade, trocada ou não, num total único. Sem linha separada por modalidade. (Decisão revisada pelo dono durante a discussão: substituiu a opção "conta separado com anotação".)
- **D-06:** Prescrito km da semana: mantém-se CHEIO, como o plano definiu — nenhuma regra de desconto para sessão trocada. Prescrito tempo idem (a dose por tempo foi preservada na troca). Comparação direta km × km, sem regra especial.
- **D-07:** Avaliação da sessão trocada: mesma régua under/on_target/over por TEMPO de qualquer cardio (fez os minutos → on_target, independente da modalidade).
- **D-08:** Visibilidade da troca: marcada na sessão ativa E no histórico/detalhe — modalidade nova com referência à original (ex.: "Remo Ergômetro · 20 min — trocado de Corrida").

### Claude's Discretion
- **Ponto de entrada da troca:** o roadmap exige DUAS coisas — o exercício de cardio da sessão oferece "trocar modalidade" E o fluxo de recusa `sem_equipamento` evolui para oferecer substituição. Ambos os sinais devem ser atendidos; a forma exata de UI de cada entrada fica a critério do Claude.
- **Fonte das "modalidades aceitas":** a critério. Candidato natural: `cardio_modalidades` do questionário (migrations 0021/0033) — chips OPCIONAIS, podem estar vazios. Fallback quando vazio a critério, respeitando: sem dado inventado, e nomes IDÊNTICOS ao catálogo do backend (drift é erro de teste — `__tests__/cardioModalidadesSincronizadas.test.ts`).
- **Escopo/persistência da troca:** a critério (troca valendo só para a sessão é o caminho contido). — **Reversibility: costly** — registrar a troca provavelmente pede coluna/RPC nova (vocabulário fechado espelha o banco, padrão migration 0020); migration nova segue preflight staging → prod (`scripts/supabase-preflight.sh`). **ATENÇÃO:** se algum caminho exigir mudança no schema do JSON do plano gerado, é porta de mão única → o plano DEVE marcar `checkpoint:decision` antes da tarefa.
- Copy, componentes, nomes de arquivos/funções — seguindo CONVENTIONS.md.

### Deferred Ideas (OUT OF SCOPE)
None — discussão ficou dentro do escopo da fase. (Deferred herdados do ciclo: loop de adaptação de dose de cardio; limpeza de `cardio_goals`; canal contínuo pós-geração.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-06 | Um momento de cardio da sessão pode ser trocado por outra modalidade aceita (escada, bike, remo…), preservando a dose por tempo; a distância da modalidade original não vira meta da nova; o realizado na trocada conta no Progresso. | Ver `## Architecture Patterns` (dois pontos de entrada mapeados), `## Don't Hand-Roll` (persistência via tabela nova, padrão 0020), `## Code Examples` (função pura de troca + query de "modalidades aceitas" + extensão de `getSessionLogDetail`), e `## Common Pitfalls` (7 riscos concretos com file:linha). |
</phase_requirements>

## Summary

REQ-06 evolui um fluxo já maduro (recusa declarada, migration 0020, Fase 4) para um caso
novo: em vez de só recusar um exercício de cardio, o aluno pode trocá-lo por outra
modalidade aceita, mantendo a dose por tempo. O código já separa nitidamente as três
camadas que a troca precisa tocar — motor puro (`src/engine/sessionModel.ts`), store de
sessão ativa (`src/store/activeSessionStore.ts`) e repositório de execução
(`src/services/sessionExecutionRepository.ts`) — e já resolve, por construção, três das
oito decisões travadas: **D-06** (prescrito não muda, pois `cardioPrescritoRepository.ts`
lê `planned_sets` que a troca nunca toca), **D-07** (`computeCardioOutcome` já compara só
tempo, sem olhar identidade do exercício — `src/engine/sessionModel.ts:324-334`) e, uma
vez que a distância realizada já é um campo genérico em `set_logs` desacoplado do nome do
exercício, o "km é km" de **D-05** é uma soma nova sobre dado que já existe, não uma
migração de dado antigo.

O trabalho real desta fase concentra-se em quatro frentes: (1) uma fonte de "modalidades
aceitas" que hoje **não tem nenhum caminho de leitura no cliente** — `cardio_modalidades`
só é lido do cache local do questionário (`QuestionnaireScreen.tsx:257-261`), nunca do
banco fora da tela de onboarding; (2) uma decisão de persistência da troca que o CONTEXT.md
já resolveu na prática ao travar **D-08** (rótulo "trocado de X" precisa sobreviver no
histórico) — troca só-local (draft/AsyncStorage) não alcança `getSessionLogDetail`, então
**a troca TEM de ser persistida no servidor**, não é opção livre de custo zero; (3) uma
tabela nova espelhando o padrão de `exercise_skips` (migration 0020) — closed-vocabulary,
`session_log_id` + `planned_exercise_id`, **sem tocar `planned_exercises`/`planned_sets`**,
o que preserva o schema do plano gerado intacto e portanto **não é** a porta de mão única
que o CONTEXT.md teme (essa só se abre se alguém decidir *reescrever* `planned_exercises`
em vez de *anotar* a troca ao lado); e (4) uma lacuna pré-existente descoberta nesta
pesquisa — `SessionHistoryDetailScreen.tsx`/`getSessionLogDetail` **não leem nem
`actual_duration_seconds` nem `actual_distance_m`** hoje, então cardio no histórico já
está quebrado antes da troca existir, e corrigir isso é pré-requisito de D-08, não
trabalho extra.

**Primary recommendation:** persistir a troca numa tabela nova (`cardio_exercise_swaps`,
mesmo padrão RLS/RPC de `exercise_skips`), nunca mutar `planned_exercises`; ler
"modalidades aceitas" via novo repositório sobre `questionario_usuario.cardio_modalidades`
com fallback documentado para lista vazia; estender `getSessionLogDetail` para cardio
(gap pré-existente) e juntar o swap por LEFT JOIN na mesma query; somar distância
realizada com uma função pura nova em `cardioGoals.ts`/`cardioPrescrito.ts`, testada
antes da UI.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Regra "qual modalidade é válida para troca" (D-02) | API/Backend (motor puro `src/engine/`) | Database (RLS + constraint closed-vocab) | Mesmo padrão de `SKIP_REASONS`/`_forca_motivo_recusa_valido`: o app decide o que oferecer, o banco garante que nada fora do vocabulário grava (defesa em profundidade). |
| Preservar dose por tempo na troca, suprimir meta de distância da original (D-01) | API/Backend (motor puro `sessionModel.ts`) | Frontend Server — N/A (app é client-only, sem SSR) | `alvoDaSerie`/`canCompleteSet` já são puros e cegos a modalidade; a troca é uma transformação de `DraftExercise`, não de UI solta. |
| Persistência da troca (D-08 exige sobrevivência ao fim da sessão) | Database (tabela + RPC, padrão 0020) | API/Backend (repositório de leitura/escrita) | Draft local (AsyncStorage) não alcança `getSessionLogDetail` — só o servidor garante que o histórico veja a troca depois que a sessão fecha. |
| Soma de km realizado "por qualquer modalidade" (D-05) | API/Backend (motor puro `cardioGoals.ts`/`cardioPrescrito.ts`) | Database (query já existente em `cardioGoalRepository.ts`) | A soma é agregação sobre dado que já chega do banco (`actual_distance_m` de `set_logs`); nenhuma coluna nova é necessária para D-05 isoladamente. |
| Exibição do rótulo "trocado de X" (D-08) | Browser/Client (componentes de sessão + histórico) | API/Backend (query precisa expor o par original↔trocado) | Puro trabalho de apresentação uma vez que o dado chega correto do repositório. |
| Fonte de "modalidades aceitas" (D-02, discretion) | Database (`questionario_usuario.cardio_modalidades`) | API/Backend (repositório novo de leitura) | Não existe hoje nenhum caminho de leitura cliente↔banco para este campo fora do form de onboarding — é capability nova, não reuso. |

## Standard Stack

Esta fase **não introduz nenhuma biblioteca nova**. Todo o trabalho usa o stack já
presente no repo: React Native/Expo, Zustand (`activeSessionStore.ts`), Supabase-js
(RPC/PostgREST), Jest (`jest-expo` preset, `package.json:107-121`) e `pytest` para o lado
Python quando aplicável (não é o caso aqui — REQ-06 não toca `backend/`).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (nenhuma nova) | — | — | Todo o trabalho é extensão de módulos já existentes no repo (`sessionModel.ts`, `activeSessionStore.ts`, `sessionExecutionRepository.ts`, `cardioGoals.ts`) [VERIFIED: leitura direta desta sessão]. |

### Package Legitimacy Audit

Não aplicável — nenhum pacote externo novo é instalado nesta fase. Gate de
package-legitimacy dispensado por ausência de instalação.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │   Onboarding (Fase 2, já existe)          │
                    │   questionario_usuario.cardio_modalidades │
                    └───────────────────┬───────────────────────┘
                                        │ (NOVO: repositório de leitura —
                                        │  hoje só existe caminho de escrita)
                                        ▼
┌──────────────┐   1. abre exercício   ┌────────────────────────────┐
│ SessionQueue │ ─── de cardio ───────▶│  activeSessionStore         │
│  ou          │   (skip sem_equip.)   │  (Zustand)                  │
│ SessionPlayer│                       │                              │
│ (entry point)│◀── 4. draft atualiz.──│  applySwapToDraft (NOVO,     │
└──────────────┘   (UI re-renderiza)   │  puro, em sessionModel.ts)   │
                                        └───────────┬──────────────────┘
                                                     │ 2. servidor PRIMEIRO
                                                     │    (mesmo padrão skipExercise)
                                                     ▼
                                        ┌────────────────────────────┐
                                        │ sessionExecutionRepository  │
                                        │  swapSessionExercise (NOVO) │
                                        └───────────┬──────────────────┘
                                                     │ RPC swap_session_exercise (NOVA)
                                                     ▼
                                        ┌────────────────────────────┐
                                        │ Postgres/Supabase           │
                                        │ cardio_exercise_swaps (NOVA)│
                                        │ — session_log_id +          │
                                        │   planned_exercise_id +     │
                                        │   to_modality (closed vocab)│
                                        │ NUNCA toca planned_exercises│
                                        └───────────┬──────────────────┘
                                                     │ 3. set_logs.actual_distance_m
                                                     │    grava normalmente (D-03)
                                                     ▼
                    ┌────────────────────────────────────────────────┐
                    │  getSessionLogDetail (EXTENDER: hoje não lê      │
                    │  cardio nem swap) + getCardioLogs (D-05 soma)   │
                    └───────────────────┬──────────────────────────────┘
                                        ▼
                    ┌────────────────────────────────────────────────┐
                    │  SessionHistoryDetailScreen (D-08: rótulo        │
                    │  "trocado de X") + CardioPrescritoSection        │
                    │  (D-05/D-06: km realizado total, prescrito cheio)│
                    └────────────────────────────────────────────────┘
```

### Recommended Project Structure

Nenhum diretório novo — a troca é adicionada aos módulos existentes por
responsabilidade, seguindo a convenção já em vigor no repo:

```
src/
├── constants/cardioModalidades.ts        # já existe — fonte das modalidades válidas
├── engine/
│   ├── sessionModel.ts                   # + applySwapToDraft, tipo de swap em DraftExercise
│   ├── cardioGoals.ts                    # + soma de distância realizada total (D-05)
│   └── cardioPrescrito.ts                # sem mudança (D-06 já correto por não tocar planned_sets)
├── services/
│   ├── sessionExecutionRepository.ts     # + swapSessionExercise; getSessionLogDetail estendido
│   ├── cardioGoalRepository.ts           # sem mudança estrutural (getCardioLogs já é modality-agnostic p/ soma)
│   └── cardioModalidadesAceitasRepository.ts  # NOVO — leitura de questionario_usuario.cardio_modalidades
├── components/session/
│   ├── SkipReasonSheet.tsx               # evolui: ramo sem_equipamento oferece substituição
│   └── SwapModalitySheet.tsx             # NOVO — sheet de escolha de modalidade (molde de SkipReasonSheet)
└── screens/
    ├── SessionHistoryDetailScreen.tsx     # estende descreveSerie p/ cardio + rótulo "trocado de X"
    └── ActiveSessionScreen.tsx            # fiação dos dois entry points
supabase/migrations/
└── 0034_troca_modalidade_cardio.sql      # NOVA — tabela + RPC, padrão 0020
```

### Pattern 1: Entry point 1 — "trocar modalidade" no exercício de cardio da sessão

**What:** o roadmap exige que "um exercício de cardio da sessão oferece 'trocar
modalidade'". Hoje a AÇÃO equivalente mais próxima ("Não vou fazer") não vive no card de
medição (`SessionPlayer.tsx`) — vive na fila (`SessionQueue.tsx`), como um botão de linha
por exercício, disparado via callback `onSolicitarRecusa` que a tela (`ActiveSessionScreen.tsx`)
resolve abrindo `SkipReasonSheet` [VERIFIED: `src/components/session/SessionQueue.tsx:100-122`,
`src/screens/ActiveSessionScreen.tsx:545-548`]. O card de medição cardio em
`SessionPlayer.tsx:456-618` **não tem** nenhum botão de ação secundária hoje — só o
input de tempo/distância/esforço e "Concluir série".

**When to use:** replicar exatamente o mesmo padrão para "Trocar modalidade": um botão de
linha condicionado a `isTimeBased(metricOf(ex))` na fila (`SessionQueue.tsx`, ao lado de
"Não vou fazer" — mutuamente exclusivos: um exercício em jogo mostra OU "Não vou fazer" OU
"Trocar modalidade", ou ambos lado a lado), disparando um novo sheet
(`SwapModalitySheet.tsx`, molde de `SkipReasonSheet.tsx`) que a tela é dona de abrir/fechar
— não colocar a troca dentro do card de medição do player, que já está carregado de
estado (rest timer, animações de entrada) e não tem precedente de ação secundária.

**Example:**
```tsx
// src/components/session/SessionQueue.tsx — ao lado do botão existente (linha ~112-122)
// Fonte: padrão já em produção nesta mesma linha do arquivo.
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
{/* NOVO: mesmo molde, condicionado a cardio (isTimeBased) e a onSolicitarTroca */}
{onSolicitarTroca && !foraDeJogo && isTimeBased(metricOf(ex)) ? (
  <TouchableOpacity
    style={styles.acao}
    onPress={() => onSolicitarTroca(ex)}
    testID={`swap-${ex.exerciseId}`}
    accessibilityRole="button"
    accessibilityLabel={`Trocar modalidade de ${ex.name}`}
  >
    <Text style={styles.acaoLabel}>Trocar modalidade</Text>
  </TouchableOpacity>
) : null}
```

### Pattern 2: Entry point 2 — evolução do ramo `sem_equipamento` em SkipReasonSheet

**What:** `SkipReasonSheet.tsx` hoje é genérico: lista fechada de `SKIP_REASONS`, nota
opcional, um único botão "Não vou fazer" que sempre chama `onConfirm(reason, note)`
[VERIFIED: `src/components/session/SkipReasonSheet.tsx:91-136`]. Não há bifurcação por
motivo. O CONTEXT.md pede que o motivo `sem_equipamento` "evolua para oferecer
substituição" — ou seja, ao selecionar esse motivo especificamente, a tela deve oferecer
um caminho alternativo ao simples "recusar".

**When to use:** ao selecionar `reason === 'sem_equipamento'`, trocar o rótulo/CTA
principal por duas ações: "Trocar modalidade" (abre `SwapModalitySheet`, fecha este
sheet sem chamar `skipExercise`) e "Recusar mesmo assim" (mantém o fluxo atual,
`onConfirm('sem_equipamento', note)`). Isso preserva 100% dos testes existentes
(`__tests__/recusaDeclarada.test.ts`, `__tests__/recusaDeclaradaFluxo.test.ts:249-277` —
que já cobre `reason: 'sem_equipamento'` chegando a `skipSessionExercise` sem mudança de
contrato) porque "recusar mesmo assim" é o caminho velho, e a troca é um caminho NOVO que
nunca invoca `skip_session_exercise`.

**Example:**
```tsx
// src/components/session/SkipReasonSheet.tsx — dentro do render, após a seleção do motivo
// (não existe hoje; é a extensão proposta, condicionada ao motivo selecionado)
{reason === 'sem_equipamento' && ehCardio ? (
  <Button
    label="Trocar modalidade em vez de recusar"
    variant="outline"
    onPress={() => onSolicitarTroca?.()}
    testID="skip-reason-oferecer-troca"
  />
) : null}
```

### Pattern 3: Função pura de troca no motor (`sessionModel.ts`)

**What:** seguindo o precedente exato de `applyExerciseSkipToDraft`/`removeExerciseSkipFromDraft`
[VERIFIED: `src/engine/sessionModel.ts:505-541`], a troca precisa de uma função pura
simétrica que:
1. troca `name`/identidade de exibição do exercício no draft para a nova modalidade;
2. preserva `targetDurationSeconds` de cada série (D-01);
3. **zera** `targetDistanceM` de cada série (a distância prescrita da original nunca
   deve aparecer como meta da nova — D-01, "sem dado inventado");
4. marca se a nova modalidade tem métrica de distância (consultando
   `CARDIO_MODALIDADES_COM_DISTANCIA`) para a UI decidir se mostra o campo opcional de
   distância REALIZADA (D-04) — que é diferente de mostrar meta de distância;
5. registra a modalidade original para o rótulo "trocado de X" (D-08).

**When to use:** chamada pelo store (`activeSessionStore.ts`), no mesmo padrão de
`skipExercise` — servidor PRIMEIRO, depois aplica ao draft local (nunca o inverso, pelo
mesmo raciocínio documentado em `sessionExecutionRepository.ts:1-6` e reforçado nos
comentários de `skipExercise` em `activeSessionStore.ts:1416-1420`).

**Example:**
```typescript
// src/engine/sessionModel.ts — NOVO, ao lado de applyExerciseSkipToDraft
// Molde: src/engine/sessionModel.ts:505-525 (applyExerciseSkipToDraft), lido nesta sessão.

export type CardioSwap = {
  toModality: CardioModalidade;       // nova modalidade (nome do catálogo)
  fromName: string;                   // nome original do exercício (para o rótulo D-08)
  toHasDistanceMetric: boolean;       // deriva de CARDIO_MODALIDADES_COM_DISTANCIA
};

export const applyCardioSwapToDraft = (
  draft: SessionDraft,
  exerciseId: string,
  swap: CardioSwap,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) =>
    ex.exerciseId !== exerciseId
      ? ex
      : {
          ...ex,
          name: swap.toModality,       // exibição passa a mostrar a nova modalidade
          swappedFrom: swap.fromName,  // novo campo opcional em DraftExercise
          sets: ex.sets.map((s) => ({
            ...s,
            // D-01: duração preservada, distância-ALVO da original NUNCA sobrevive à troca.
            targetDistanceM: null,
          })),
        },
  ),
});
```

### Pattern 4: Persistência da troca — tabela nova espelhando `exercise_skips`

**What:** a Fase 3 herda o mesmo raciocínio de `exercise_skips` (migration 0020,
`supabase/migrations/0020_recusa_declarada.sql:122-133,163-183`): uma tabela satélite do
`session_log`, com RLS "own" herdada, unique `(session_log_id, planned_exercise_id)`,
vocabulário fechado via função `immutable` (mesmo padrão de
`_forca_motivo_recusa_valido`/`_forca_lista_texto_util`). A troca NÃO toca
`planned_exercises`/`planned_sets` — essas tabelas são a materialização direta do JSON
que `save_training_plan` grava (`supabase/migrations/0006_save_training_plan.sql`) e são
lidas por `weeklyReplanRepository.ts:113,161,163` para montar o contexto de
replanejamento semanal (Fase 6) usando `e.name` como o nome canônico do exercício
[VERIFIED: `src/services/weeklyReplanRepository.ts:113,161,163`]. Mutar `planned_exercises.name`
in-place propagaria o nome trocado para o replanejador de semanas futuras e para
qualquer consumidor que assume que `planned_exercises` reflete o que a IA gerou — **esse
é o caminho que deve disparar `checkpoint:decision`**, não a criação de uma tabela nova
ao lado.

**When to use:** RPC `swap_session_exercise(p_session_log_id, p_planned_exercise_id,
p_to_modality, p_note)`, análoga a `skip_session_exercise`
(`supabase/migrations/0020_recusa_declarada.sql:327-400`): valida `p_to_modality` contra
uma função `_forca_modalidade_cardio_valida` (vocabulário fechado, mesmos 9 nomes de
`CARDIO_MODALIDADES`), valida que o exercício pertence à sessão do log, grava com
`on conflict (session_log_id, planned_exercise_id) do update` (repetir a troca corrige a
escolha, não empilha).

**Example:**
```sql
-- supabase/migrations/0034_troca_modalidade_cardio.sql — NOVA
-- Molde: supabase/migrations/0020_recusa_declarada.sql:39-53 (vocabulário fechado)
--        e :122-183 (tabela + RLS) + :327-400 (RPC), lidos nesta sessão.

create or replace function public._forca_modalidade_cardio_valida(p_modalidade text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_modalidade in (
    'Caminhada', 'Corrida', 'Bicicleta Ergométrica', 'Elíptico',
    'Remo Ergômetro', 'Escada Ergométrica', 'Pular Corda',
    'Cardio Contínuo (LISS)', 'Cardio Intervalado (HIIT)'
  );
$$;
-- ATENÇÃO ao planejar: esta lista precisa nascer sincronizada com
-- CARDIO_MODALIDADES (src/constants/cardioModalidades.ts:23-33) e o catálogo
-- backend/data/catalogo_exercicios.json — mesma disciplina do teste
-- __tests__/cardioModalidadesSincronizadas.test.ts. Cobrir com teste simétrico.

create table if not exists public.cardio_exercise_swaps (
  id uuid primary key default gen_random_uuid(),
  session_log_id      uuid not null references public.session_logs (id) on delete cascade,
  planned_exercise_id uuid not null references public.planned_exercises (id) on delete cascade,
  to_modality text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_log_id, planned_exercise_id)
);
-- RLS/policy: mesmo molde de "own exercise skips" (0020:163-183) — posse herdada
-- do session_log, finished_at is null no WITH CHECK.
```

### Anti-Patterns to Avoid
- **Mutar `planned_exercises.name`/`metric`/`equipment` para refletir a troca:** contamina
  `weeklyReplanRepository.ts` (replanejamento de semanas futuras já lê `e.name` do plano
  gerado) e diverge silenciosamente do JSON que a IA de fato produziu. Este é o único
  caminho que exige `checkpoint:decision` segundo o CONTEXT.md.
- **Troca só-local (draft/AsyncStorage), sem RPC:** falha D-08 por construção — o histórico
  (`getSessionLogDetail`) só lê do servidor; uma troca que nunca chega lá não aparece
  depois que a sessão termina, nem sobrevive a reinstalar o app.
- **Mostrar `targetDistanceM` da série após a troca:** viola D-01 diretamente — a UI
  (`alvoDaSerie` em `SessionPlayer.tsx:87-93`) usa `set.targetDistanceM` cegamente; sem
  zerá-lo no draft, o card mostraria a meta de km da modalidade ORIGINAL para a NOVA.
- **Inferir modalidades aceitas do catálogo geral de exercícios em vez de
  `cardio_modalidades` do questionário:** o roadmap e o CONTEXT.md são explícitos — a
  lista é o que o ALUNO aceitou, não "todo cardio existente"; listar tudo violaria D-02.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vocabulário fechado de modalidade válida | Validação ad-hoc em JS/TS só no cliente | Função SQL `immutable` + CHECK constraint, mesmo padrão de `_forca_motivo_recusa_valido` (0020) e `_forca_lista_texto_util` (0021) | Cliente-only permite um valor fora do catálogo entrar via chamada direta à RPC; o padrão do repo já resolve isso com defesa em profundidade. |
| "Quais modalidades este usuário aceita" | Nova lógica de fallback inventada (ex.: mostrar todas as 9 quando vazio) | Reaproveitar a mesma leitura de `questionario_usuario.cardio_modalidades` que a Fase 2 já grava — só falta o REPOSITÓRIO de leitura, que não existe (achado desta pesquisa) | O dado já existe e é gravado desde a migration 0021; construir um caminho paralelo duplicaria a fonte de verdade que a Fase 1/2 já estabeleceram. |
| Registrar recusa vs. troca no mesmo fluxo | Sobrecarregar `SkipReasonSheet`/`skipExercise` para também fazer troca | Sheet novo (`SwapModalitySheet`) + RPC nova (`swap_session_exercise`), chamados a partir do MESMO ponto de decisão do usuário (motivo `sem_equipamento`) | `skip_session_exercise`/`exercise_skips` tem semântica e testes (`recusaDeclarada*.test.ts`) fechados em "recusa = série sai do progresso". Trocar é "série continua, mas por outra modalidade" — semântica distinta, tabela distinta. |
| Cálculo de distância realizada total | Nova consulta SQL direta na tela de Progresso | Estender `cardioGoals.ts`/`cardioPrescrito.ts` (motor puro já testado) com uma soma sobre o `CardioLog[]` que `getCardioLogs` já devolve | `getCardioLogs` (`src/services/cardioGoalRepository.ts:23-64`) já traz `distanceM` por log, modality-agnostic; falta só somar — reimplementar a query duplicaria paginação/filtro de `finished_at`/`muscle_group` já corretos. |

**Key insight:** quase todo o "não reinvente" desta fase é "reaproveite o padrão de
`exercise_skips`/`skip_session_exercise` (migration 0020) — closed-vocabulary, servidor
primeiro, RLS herdada do `session_log`" — e "reaproveite `getCardioLogs`/`cardioGoals.ts`
para a soma de km", nunca escrever agregação nova direto em componente de tela.

## Common Pitfalls

### Pitfall 1: Mostrar a meta de distância da modalidade original após a troca
**What goes wrong:** `alvoDaSerie` (`SessionPlayer.tsx:87-93`) monta o texto do alvo a
partir de `set.targetDurationSeconds`/`set.targetDistanceM` sem saber que o exercício foi
trocado. Se a troca só mudar o `name` exibido sem zerar `targetDistanceM`, a tela mostra
"20:00 · 5 km" para uma sessão que era "Corrida 5 km" mas agora é "Remo Ergômetro" — dado
inventado, viola D-01 e a regra geral "sem amostra é '—', nunca invenção".
**Why it happens:** `targetDistanceM` vem do plano (`planned_sets.target_distance_m`),
que nunca muda com a troca — é fácil esquecer de zerá-lo no draft.
**How to avoid:** a função pura de troca (Pattern 3) DEVE zerar `targetDistanceM` de
toda série do exercício trocado; cobrir com teste antes da UI (convenção do repo:
`src/engine/` carrega a regra, teste primeiro).
**Warning signs:** teste que monta um draft trocado e verifica `alvoDaSerie` (ou o texto
renderizado) não menciona distância nenhuma — se aparecer "km" no alvo pós-troca, achou o bug.

### Pitfall 2: `getSessionLogDetail` não lê cardio hoje — bug pré-existente que bloqueia D-08
**What goes wrong:** `getSessionLogDetail` (`src/services/sessionExecutionRepository.ts:776-845`)
seleciona só `actual_reps, actual_load_kg, actual_rir, outcome, completed_at` — SEM
`actual_duration_seconds` nem `actual_distance_m`. `descreveSerie`
(`src/screens/SessionHistoryDetailScreen.tsx:26-30`) formata TUDO como
`"${reps} reps × ${carga}"`, então uma série de cardio no histórico hoje mostra algo como
"null reps × peso corporal" — sem relação com o que o aluno fez.
**Why it happens:** a leitura de histórico foi construída na Fase 4 (musculação),
antes ou sem acompanhar a extensão de cardio da migration 0014; ninguém revisitou
`getSessionLogDetail` desde então (confirmado: nenhum teste em `__tests__/` referencia
`actual_duration_seconds` no contexto de `SessionLogDetail`).
**How to avoid:** D-08 exige mostrar "Remo Ergômetro · 20 min — trocado de Corrida" no
detalhe do histórico — isso é IMPOSSÍVEL sem primeiro estender a query e
`descreveSerie`/`HistorySetLog` para tratar cardio como tratam
`SessionQueue.doneLine` (`src/components/session/SessionQueue.tsx:42-62`, que já resolve
esse formatting corretamente para a sessão ATIVA). Portar essa lógica (ou uma função
compartilhada) para o histórico é pré-requisito de D-08, não trabalho adicional opcional.
**Warning signs:** abrir o detalhe de uma sessão concluída com cardio hoje (sem esta
fase) e ver reps/carga sem sentido nas linhas de cardio confirma o gap.

### Pitfall 3: Persistir a troca mutando `planned_exercises` em vez de anotar ao lado
**What goes wrong:** parece mais simples fazer `UPDATE planned_exercises SET name = ...`
para "já aparecer trocado em tudo", mas isso reescreve o registro do que a IA gerou.
`weeklyReplanRepository.ts:113,161-163` lê `planned_exercises.name` para montar a proposta
de replanejamento de semanas futuras — o nome trocado vazaria para o motor de
replanejamento (Fase 6), que nada sabe sobre troca de modalidade intra-sessão.
**Why it happens:** parece "menos código" do que criar tabela + RPC nova.
**How to avoid:** seguir o Pattern 4 — tabela satélite, nunca `UPDATE` em
`planned_exercises`/`planned_sets`. Se a fase de planejamento considerar esse caminho
mesmo assim, é OBRIGATÓRIO `checkpoint:decision` antes da tarefa (per CONTEXT.md).
**Warning signs:** qualquer task de plano que inclua `UPDATE public.planned_exercises`
ou `UPDATE public.planned_sets` deve ser tratada como bandeira vermelha nesta fase.

### Pitfall 4: Fonte de "modalidades aceitas" vazia sendo tratada como "aceita tudo"
**What goes wrong:** `cardio_modalidades` é um campo OPCIONAL
(`supabase/migrations/0021_dose_cardio_declarada.sql:52,107-108`: "Vazio/null = qualquer
modalidade" — comentário do BACKEND, sobre como o GERADOR interpreta a ausência). Copiar
essa mesma regra para a TELA de troca sem pensar poderia oferecer as 9 modalidades quando
vazio, mas o dono só travou D-02 como "só as aceitas" — a leitura literal quando vazio
("aceita tudo") é uma interpretação válida MAS não foi confirmada pelo dono para este uso
específico (troca em sessão, não geração de plano).
**Why it happens:** reaproveitar cegamente o comentário do schema (que fala do
GERADOR) para um contexto de UI diferente (a TROCA em sessão).
**How to avoid:** o CONTEXT.md deixa isso a critério do Claude ("Fallback quando vazio a
critério, respeitando: sem dado inventado"), mas recomenda-se que o planejador trate isso
como uma escolha DOCUMENTADA e explícita, não uma herança silenciosa do comportamento do
gerador — ver `## Assumptions Log`.
**Warning signs:** teste que verifica "usuário sem cardio_modalidades preenchido vê lista
vazia (ou todas as 9, dependendo da decisão) ao tentar trocar" deve existir explicitamente,
não como efeito colateral.

### Pitfall 5: `descreveSerie`/`doneLine` duplicados (drift entre sessão ativa e histórico)
**What goes wrong:** `SessionQueue.doneLine` (ativo) e o `descreveSerie` novo do
histórico (Pitfall 2) são a MESMA lógica de formatação (tempo/distância/pace/esforço para
cardio), mas vivem em arquivos diferentes com contratos de tipo diferentes
(`DraftSet` vs `HistorySetLog`). Implementar cada um do zero gera drift — um corrige o
bug do outro fica para trás.
**Why it happens:** os dois tipos (`DraftSet` da sessão ativa, `HistorySetLog` do
histórico) não compartilham shape hoje.
**How to avoid:** extrair uma função de formatação pura que aceite os campos mínimos
comuns (`durationSeconds`, `distanceM`, `perceivedEffort` — já é exatamente o shape de
`doneLine`), e usar essa mesma função nos dois lugares. Testar uma vez, usar duas.
**Warning signs:** dois blocos de código quase idênticos calculando pace/formatando
tempo em arquivos diferentes é o sinal de que a extração não aconteceu.

### Pitfall 6: Contagem de "sessões" distintas quebrando com o rótulo de troca
**What goes wrong:** `progressoConsistencia` (`src/engine/cardioGoals.ts:185-233`) conta
DIAS distintos com cardio (`dias.add(diaLocal(...))`), não nome de exercício — então a
troca de modalidade NÃO deveria, e não deveria PRECISAR, mudar essa contagem. Um erro
comum seria "consertar" a contagem de sessões para levar em conta a troca quando ela já
está correta por não depender de nome.
**Why it happens:** ao adicionar a soma de km (D-05), é tentador re-tocar toda a função
`progressoConsistencia` em vez de só adicionar o campo de distância.
**How to avoid:** D-05 pede uma soma NOVA de distância; D-07 (avaliação por tempo) e a
contagem de sessões (dias distintos) já estão corretas e modality-agnostic — não tocar.
**Warning signs:** um diff que mexe em `dias.add(...)` ou na lógica de `metaSessoes` para
esta fase é escopo além do que D-05 pede.

### Pitfall 7: `getPrescricaoSemanaCorrente` sendo "corrigido" para descontar a troca
**What goes wrong:** D-06 é explícito — "nenhuma regra de desconto para sessão trocada".
`cardioPrescritoRepository.ts:53-63` já soma `target_distance_m`/`target_duration_seconds`
direto de `planned_sets`, que a troca nunca modifica — está automaticamente correto. Um
desenvolvedor lendo D-06 pela primeira vez pode achar que precisa adicionar uma exceção
("se a sessão foi trocada, não conta X km") — isso seria o oposto do que o dono pediu.
**Why it happens:** confundir "a troca preserva o alvo por TEMPO" (D-01, que é sobre a
SESSÃO trocada) com "o prescrito da SEMANA precisa saber quais sessões foram trocadas"
(não precisa — D-06 é claro).
**How to avoid:** não adicionar NENHUMA lógica de troca a `cardioPrescritoRepository.ts`
ou `cardioPrescrito.ts` para o lado PRESCRITO. Só o lado REALIZADO (D-05, soma de km) é
tocado.
**Warning signs:** qualquer menção a "swap"/"troca" dentro de `cardioPrescrito*.ts` é
escopo indevido — essa camada deve permanecer inteiramente alheia à existência de trocas.

## Code Examples

### Leitura de "modalidades aceitas" (capability nova — não existe hoje)
```typescript
// src/services/cardioModalidadesAceitasRepository.ts — NOVO
// Molde de estilo: src/services/agendaRepository.ts (select restrito ao próprio
// usuário, RLS "questionario select own" — supabase/migrations/0008_questionario_usuario.sql:29-31,
// lido nesta sessão) + toNum/defesa contra shape inesperado, mesma disciplina do resto do repo.

import { supabase } from '../config/supabaseClient';
import { CARDIO_MODALIDADES, type CardioModalidade } from '../constants/cardioModalidades';

/**
 * Modalidades de cardio que o aluno ACEITA (declaradas no questionário, migration
 * 0021). Null/vazio no banco = o aluno não restringiu — decisão de fallback para
 * a TELA DE TROCA (distinta da leitura do gerador) documentada em 03-RESEARCH.md
 * Assumptions Log A1: ver planner/discuss-phase antes de implementar o fallback.
 */
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
  // Defesa: só nomes que o catálogo local reconhece (drift = pior caso é
  // esconder uma modalidade do aluno, nunca oferecer uma inexistente).
  const validas = new Set<string>(CARDIO_MODALIDADES);
  return lista.filter((m): m is CardioModalidade => validas.has(m));
};
```

### Soma de distância realizada total (D-05)
```typescript
// src/engine/cardioGoals.ts — NOVO, ao lado de progressoConsistencia
// Fonte: mesmo shape de CardioLog já lido (linha 19-27 deste arquivo).

/** "Km é km": soma a distância realizada da semana, qualquer modalidade (D-05). */
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
  return metros; // null = nenhuma amostra com distância, nunca "0 km" inventado.
};
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Fallback de "modalidades aceitas" quando `cardio_modalidades` está vazio/null ainda não tem decisão do dono para o contexto de TROCA (só para o contexto de GERAÇÃO, onde vazio = "qualquer modalidade" — comentário em `supabase/migrations/0021_dose_cardio_declarada.sql:107-108`). Este research **não assume** qual deve ser o comportamento na troca; recomenda tratá-lo como pergunta explícita no discuss-phase/plan-phase. | Pitfall 4, Code Examples | Se o planner assumir "vazio = todas as 9" sem confirmação, pode violar a leitura estrita de D-02 ("só as aceitas") aos olhos do dono; se assumir "vazio = nenhuma opção de troca", pode frustrar quem nunca preencheu o questionário de anamnese. |
| A2 | Nome da tabela/RPC nova propostos (`cardio_exercise_swaps`, `swap_session_exercise`) são sugestões de nomenclatura seguindo CONVENTIONS.md/o padrão de `exercise_skips`/`skip_session_exercise` — não foram validados contra um documento de nomenclatura formal além da leitura das migrations existentes. | Architecture Patterns (Pattern 4) | Baixo risco — é só rename se o planner preferir outro nome; a estrutura (tabela satélite + RPC) é o que importa e está bem fundamentada. |
| A3 | O ponto de entrada 1 ("trocar modalidade" no exercício de cardio da sessão") foi mapeado para a FILA (`SessionQueue.tsx`, ao lado de "Não vou fazer"), não para o card de medição (`SessionPlayer.tsx`). O CONTEXT.md deixa a forma exata de UI a critério do Claude, então este mapeamento é uma recomendação de pesquisa, não um fato já decidido pelo dono. | Pattern 1 | Baixo risco — CONTEXT.md explicitamente delega isso; se o planner escolher outro local (ex.: botão no próprio card de medição), o REQ-06 continua atendido, só muda o arquivo tocado. |

**Se esta tabela estivesse vazia:** não estaria — há decisões de fallback e nomenclatura
que dependem de escolha do dono/planner, listadas acima.

## Open Questions (RESOLVED)

*Ambas foram decididas no plan-phase de 2026-08-09, dentro do que a CONTEXT.md delegou a
"Claude's Discretion". A Assumption A1 desta pesquisa fica encerrada.*

1. **Fallback de "modalidades aceitas" vazio, no contexto específico de troca em sessão.**
   — **RESOLVIDA: leitura estrita de D-02.**
   - What we know: quando `cardio_modalidades` é null/vazio, o COMENTÁRIO da migration 0021
     diz "= qualquer modalidade" — mas esse comentário descreve o comportamento do GERADOR
     de plano (backend), não da tela de troca em sessão (frontend, Fase 3).
   - **Decisão (plan `03-02`, Task 2 — `getModalidadesAceitas`):** `cardio_modalidades` null,
     ausente ou `[]` devolve **array vazio**, nunca as 9 modalidades do catálogo. Nome fora de
     `CARDIO_MODALIDADES` é filtrado, não propagado. O comentário do gerador vale para o prompt
     da IA, não para o que esta tela oferece.
   - **Consequência de produto, tratada em `03-03`:** quem nunca preencheu a anamnese vê um
     `EmptyState` ("Nenhuma modalidade cadastrada" + orientação a completar a anamnese de
     cardio), não uma lista inventada. Sem navegação a partir daí — fora do escopo da fase.
   - Prohibition registrada em `03-02`: nenhum fallback "mostrar todas" é aceitável para lista
     não vazia, mesmo incompleta ou desatualizada.

2. **Ambos os entry points (fila + `SkipReasonSheet`) precisam levar ao MESMO
   `SwapModalitySheet`, ou cada um pode ter sua própria UI?** — **RESOLVIDA: compartilhar.**
   - What we know: o roadmap exige que os DOIS sinais existam; CONTEXT.md deixa a forma
     exata a critério do Claude.
   - **Decisão (plans `03-03` e `03-04`):** um único `SwapModalitySheet`
     (`src/components/session/SwapModalitySheet.tsx`, criado em `03-03`), aberto pela fila da
     sessão e pelo ramo `sem_equipamento` do `SkipReasonSheet`. Ambos convergem para
     `activeSessionStore.swapExercise`; `03-04` prova por teste que o caminho de troca **não**
     chama `skipSessionExercise`. Alinhado a CONVENTIONS.md/DRY e ao custo demonstrado no
     Pitfall 5.

## Environment Availability

Não aplicável — esta fase não introduz dependência de ferramenta, serviço ou runtime
externo além do stack já em uso (Expo/React Native, Supabase, Jest). O único ambiente
relevante é o par staging/produção do Supabase já documentado em `AGENTS.md`
(`mjdjtiujhwklchalquhc` / `zanqygwsgxkyjiuhrzju`), que qualquer migration nova desta fase
deve atravessar via `scripts/supabase-preflight.sh` — mesmo fluxo usado na migration 0033
(Fase 2).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 com preset `jest-expo` [VERIFIED: `package.json:88,107-121`] |
| Config file | embutido em `package.json` (`"jest": {...}`, linhas 107-121) — não há `jest.config.js` separado |
| Quick run command | `npx jest __tests__/<arquivo>.test.ts` (por arquivo, mais rápido durante o desenvolvimento) |
| Full suite command | `npx tsc --noEmit && npx jest` — nota de `AGENTS.md:70`: a suíte completa com `--runInBand` pode sair com código 1 mesmo com todos os testes verdes (handle aberto); NÃO usar o exit code isolado como portão — checar o resumo "Tests: X passed" |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-06 (D-01) | Troca preserva `targetDurationSeconds`, zera `targetDistanceM` da série | unit (motor puro) | `npx jest __tests__/cardioSwap.test.ts` | ❌ Wave 0 — criar arquivo novo, molde de `recusaDeclarada.test.ts` |
| REQ-06 (D-02) | Lista de troca oferece só modalidades aceitas do usuário | unit (repositório + UI) | `npx jest __tests__/cardioModalidadesAceitas.test.ts` | ❌ Wave 0 |
| REQ-06 (D-03/D-05) | Realizado na trocada soma no km total do Progresso | unit (motor puro `cardioGoals.ts`) | `npx jest __tests__/cardioGoals.test.ts` (estender existente, se houver, ou criar) | ⚠️ conferir se já existe teste de `cardioGoals.ts`; se não, Wave 0 |
| REQ-06 (D-06) | Prescrito km/tempo da semana NÃO desconta sessão trocada | unit (motor puro `cardioPrescrito.ts`) | `npx jest __tests__/cardioPrescrito.test.ts` (se existir; senão criar caso de troca) | ⚠️ conferir cobertura atual |
| REQ-06 (D-07) | Outcome under/on_target/over por tempo, independente de modalidade | unit (já coberto por `computeCardioOutcome` existente — só confirmar que segue passando após a troca) | `npx jest -t "computeCardioOutcome"` (ou nome real do describe) | ✅ (função já testada; troca não deve exigir mudança nela — confirmar) |
| REQ-06 (D-08) | Histórico mostra "Remo Ergômetro · 20 min — trocado de Corrida" | unit (repositório) + integração leve (componente) | `npx jest __tests__/sessionHistoryDetailCardio.test.ts` | ❌ Wave 0 — gap pré-existente (Pitfall 2), este teste também cobre o bug de cardio ausente no histórico hoje |
| REQ-06 (entry points) | Fila e `SkipReasonSheet` oferecem a troca corretamente | integração (store ↔ repositório mockado) | `npx jest __tests__/recusaDeclaradaFluxo.test.ts` (estender) + novo `__tests__/cardioSwapFluxo.test.ts` | ⚠️ estender existente + ❌ novo |
| REQ-06 (migration) | RPC `swap_session_exercise` respeita vocabulário fechado, RLS, idempotência | unit SQL (padrão de `recusaDeclarada.test.ts:101-112`, que lê o `.sql` bruto e faz `expect(sql).toMatch(...)`) | `npx jest __tests__/cardioSwapMigration.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest <arquivo do teste tocado>` (rápido, escopo do task)
- **Per wave merge:** `npx tsc --noEmit && npx jest` (suíte completa — checar "Tests: X passed", não o exit code isolado, per `AGENTS.md:70`)
- **Phase gate:** suíte completa verde + (se a migration 0034 for aplicada) preflight
  staging→prod documentado como `checkpoint:decision`, igual ao precedente da migration
  0033 na Fase 2 (`.planning/phases/02-anamnese-e-calibra-o-do-cardio/02-02-PLAN.md:149`)

### Wave 0 Gaps
- [ ] `__tests__/cardioSwap.test.ts` — cobre D-01 (função pura de troca no motor)
- [ ] `__tests__/cardioModalidadesAceitas.test.ts` — cobre D-02 (repositório + fallback vazio, uma vez decidido — Open Question 1)
- [ ] `__tests__/sessionHistoryDetailCardio.test.ts` — cobre D-08 E corrige o gap pré-existente do Pitfall 2 (cardio ausente em `getSessionLogDetail`/`descreveSerie`)
- [ ] `__tests__/cardioSwapMigration.test.ts` — cobre a migration 0034 (vocabulário fechado, RLS, idempotência), molde de `recusaDeclarada.test.ts:101-112`
- [ ] Conferir se `cardioGoals.ts`/`cardioPrescrito.ts` já têm arquivo de teste próprio antes de assumir "criar novo" vs. "estender existente" (não confirmado nesta pesquisa — checar `__tests__/` na fase de planejamento)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não (herdado — sessão já autenticada via Supabase JWT, sem mudança nesta fase) | `auth.uid()` já exigido em toda RPC nova, mesmo padrão de `skip_session_exercise` |
| V3 Session Management | não (sem mudança) | — |
| V4 Access Control | sim | RLS "own" herdada do `session_log` (mesmo padrão de `exercise_skips`, `supabase/migrations/0020_recusa_declarada.sql:163-183`) — a nova tabela `cardio_exercise_swaps` DEVE ter policy equivalente, testável via o mesmo padrão de asserções `do $$ ... raise exception ...` já usado nas migrations 0020/0021/0033 |
| V5 Input Validation | sim | Vocabulário fechado via função SQL `immutable` (`_forca_modalidade_cardio_valida`), espelhando `_forca_motivo_recusa_valido` — nunca texto livre para `to_modality` |
| V6 Cryptography | não | — |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Exercício de OUTRA sessão/usuário sendo trocado via `planned_exercise_id` alheio | Tampering / Elevation of Privilege | Validar `pe.session_id = v_log.planned_session_id` dentro da RPC, mesmo padrão de `skip_session_exercise` (`0020:373-382`) — sem essa checagem, RLS do log próprio não impede referenciar um `planned_exercise_id` de outra sessão. |
| `anon` executando a RPC nova sem estar autenticado | Elevation of Privilege | `revoke all ... from public, anon; grant execute ... to authenticated;` — padrão obrigatório de TODA RPC nova neste repo (lição da migration 0019, reforçada em 0020/0021/0033, ver asserções finais de cada arquivo). A migration 0034 deve repetir essa asserção `do $$ ... has_function_privilege('anon', ...) ...` no final. |
| Modalidade fora do catálogo persistida (drift silencioso) | Tampering | CHECK constraint via `_forca_modalidade_cardio_valida`, **e** teste JS espelhando `__tests__/cardioModalidadesSincronizadas.test.ts` para a nova lista embutida na migration — sem isso, um nome divergente do catálogo do backend seria aceito pelo banco mas descartado (ou pior, mal interpretado) no prompt/consumo posterior. |

## Sources

### Primary (HIGH confidence — leitura direta de código/migrations nesta sessão)
- `src/engine/sessionModel.ts` (581 linhas, lido integralmente)
- `src/components/session/SkipReasonSheet.tsx` (239 linhas, lido integralmente)
- `src/store/activeSessionStore.ts` (1590 linhas, lido integralmente em 2 partes)
- `src/services/sessionExecutionRepository.ts` (846 linhas, lido integralmente)
- `src/constants/cardioModalidades.ts` (47 linhas, lido integralmente)
- `src/engine/cardioPrescrito.ts` e `src/services/cardioPrescritoRepository.ts` (lidos integralmente)
- `src/engine/cardioGoals.ts` e `src/services/cardioGoalRepository.ts` (lidos integralmente)
- `src/components/progress/CardioPrescritoSection.tsx` (lido integralmente)
- `src/screens/SessionHistoryDetailScreen.tsx` (lido integralmente)
- `src/components/session/SessionPlayer.tsx` (1137 linhas, lido integralmente)
- `src/components/session/SessionQueue.tsx` (lido integralmente)
- `src/screens/ActiveSessionScreen.tsx` (trechos relevantes, linhas 1-170 e 470-563)
- `supabase/migrations/0020_recusa_declarada.sql` (658 linhas, lido integralmente)
- `supabase/migrations/0021_dose_cardio_declarada.sql` (176 linhas, lido integralmente)
- `supabase/migrations/0033_anamnese_cardio_declarada.sql` (trecho relevante)
- `src/services/weeklyReplanRepository.ts` (grep dirigido às linhas 113,161-163,222)
- `src/services/api/questionnaireService.ts` (lido integralmente)
- `src/screens/QuestionnaireScreen.tsx` (trecho de carregamento, linhas 220-289)
- `__tests__/cardioModalidadesSincronizadas.test.ts`, `__tests__/recusaDeclarada.test.ts` (trecho), `__tests__/recusaDeclaradaFluxo.test.ts` (lido integralmente)
- `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `AGENTS.md` (lidos integralmente)
- `package.json` (scripts e config jest)

### Secondary (MEDIUM confidence)
- Nenhuma — esta pesquisa não usou WebSearch/Context7 porque o domínio inteiro (React
  Native/Expo, Zustand, Supabase RPC, Jest) já está resolvido por precedente direto no
  próprio repositório; introduzir fontes externas seria menos confiável que o código já
  em produção que resolve o mesmo problema (recusa declarada, migration 0020) um passo
  atrás.

### Tertiary (LOW confidence)
- Nenhuma.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova; todo o trabalho é extensão de módulos existentes lidos integralmente nesta sessão.
- Architecture: HIGH — os dois entry points, a tabela de persistência e os pontos de leitura foram todos confirmados por leitura direta de arquivo, não inferência.
- Pitfalls: HIGH — os 7 pitfalls vêm de comportamento observado no código (ou ausência dele, como o gap de `getSessionLogDetail`), não de padrões genéricos de mercado.

**Research date:** 2026-08-09
**Valid until:** enquanto `sessionModel.ts`/`activeSessionStore.ts`/`sessionExecutionRepository.ts` não sofrerem refactor estrutural — recomenda-se re-conferir se outra fase tocar esses três arquivos antes desta ser planejada/executada (30 dias como teto razoável para um repo sem CI, onde deriva não é pega automaticamente).
