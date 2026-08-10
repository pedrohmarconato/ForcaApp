# Phase 3: Intercâmbio de modalidade de cardio - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning
**Source:** Discuss-phase com o dono (área "Meta e realizado na nova modalidade"
discutida a fundo; demais áreas delegadas ao Claude dentro dos sinais do roadmap).

<domain>
## Phase Boundary

**IN:** REQ-06 apenas — na sessão, um momento de cardio pode ser trocado por outra
modalidade aceita (escada, bike, remo…), preservando a dose por tempo
(`target_duration_seconds`); a distância prescrita da modalidade original NÃO vira meta
da nova; o realizado na trocada conta no Progresso. Evolui o fluxo de recusa declarada
(motivo `sem_equipamento`) para substituição.

**OUT:** loop de adaptação de dose de cardio pelo realizado; qualquer mudança no schema
do molde/plano gerado sem decisão explícita do dono (porta de mão única); limpeza da
tabela `cardio_goals` (órfã por decisão da Fase 1); canal contínuo de ajuste
pós-geração; treino de força. Escopo não se estreita nem se alarga em silêncio.

</domain>

<decisions>
## Implementation Decisions

### Travado pelo ROADMAP (success criteria — não renegociar)

- **D-01:** A meta da modalidade trocada é SÓ tempo (`target_duration_seconds`
  preservado). A distância prescrita da original nunca é exibida como meta da nova —
  sem dado inventado.
- **D-02:** A lista de troca oferece SÓ as modalidades aceitas do usuário.
- **D-03:** O realizado na modalidade trocada conta normalmente no realizado do
  Progresso.

### Meta e realizado na modalidade trocada (decisões do dono, 2026-08-09)

- **D-04:** Registro de distância realizada na trocada: SIM, quando fizer sentido —
  campo de distância opcional aparece se a nova modalidade tem métrica de distância
  (subset `CARDIO_MODALIDADES_COM_DISTANCIA`); modalidades só-tempo (Pular Corda,
  HIIT, Escada Ergométrica) não mostram o campo.
- **D-05:** Realizado km da semana no Progresso: km é km — soma a distância realizada
  de QUALQUER modalidade, trocada ou não, num total único. Sem linha separada por
  modalidade. (Decisão revisada pelo dono durante a discussão: substituiu a opção
  "conta separado com anotação".)
- **D-06:** Prescrito km da semana: mantém-se CHEIO, como o plano definiu — nenhuma
  regra de desconto para sessão trocada. Prescrito tempo idem (a dose por tempo foi
  preservada na troca). Comparação direta km × km, sem regra especial.
- **D-07:** Avaliação da sessão trocada: mesma régua under/on_target/over por TEMPO de
  qualquer cardio (fez os minutos → on_target, independente da modalidade).
- **D-08:** Visibilidade da troca: marcada na sessão ativa E no histórico/detalhe —
  modalidade nova com referência à original (ex.: "Remo Ergômetro · 20 min — trocado
  de Corrida").

### Claude's Discretion

- **Ponto de entrada da troca:** o roadmap exige DUAS coisas — o exercício de cardio
  da sessão oferece "trocar modalidade" E o fluxo de recusa `sem_equipamento` evolui
  para oferecer substituição. Ambos os sinais devem ser atendidos; a forma exata de
  UI de cada entrada fica a critério do Claude.
- **Fonte das "modalidades aceitas":** a critério. Candidato natural:
  `cardio_modalidades` do questionário (migrations 0021/0033) — chips OPCIONAIS,
  podem estar vazios. Fallback quando vazio a critério, respeitando: sem dado
  inventado, e nomes IDÊNTICOS ao catálogo do backend (drift é erro de teste —
  `__tests__/cardioModalidadesSincronizadas.test.ts`).
- **Escopo/persistência da troca:** a critério (troca valendo só para a sessão é o
  caminho contido). — **Reversibility:** costly — registrar a troca provavelmente pede
  coluna/RPC nova (vocabulário fechado espelha o banco, padrão migration 0020);
  migration nova segue preflight staging → prod (`scripts/supabase-preflight.sh`).
  **ATENÇÃO:** se algum caminho exigir mudança no schema do JSON do plano gerado, é
  porta de mão única → o plano DEVE marcar `checkpoint:decision` antes da tarefa.
- Copy, componentes, nomes de arquivos/funções — seguindo CONVENTIONS.md.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fluxo de sessão e recusa (o que a fase evolui)
- `src/engine/sessionModel.ts` — `SkipReason` (`sem_equipamento`), série timed
  (`targetDurationSeconds`/`targetDistanceM`), outcome por tempo, `formatDistance`
- `src/components/session/SkipReasonSheet.tsx` — fluxo de recusa atual (vocabulário
  fechado, migration 0020)
- `src/store/activeSessionStore.ts` — orquestração da sessão ativa
- `src/services/sessionExecutionRepository.ts` — RPCs de execução
  (`skip_session_exercise`, `save_set_log`)
- `__tests__/recusaDeclarada.test.ts` + `__tests__/recusaDeclaradaFluxo.test.ts` —
  comportamento atual protegido por teste

### Modalidades e prescrito × realizado
- `src/constants/cardioModalidades.ts` — `CARDIO_MODALIDADES` (9) +
  `CARDIO_MODALIDADES_COM_DISTANCIA` (6); nomes espelham o catálogo do backend
- `src/engine/cardioPrescrito.ts` + `src/services/cardioPrescritoRepository.ts` —
  motor e leitura do prescrito × realizado semanal (Fase 1)
- `src/components/progress/CardioPrescritoSection.tsx` — seção Cardio do Progresso

### Banco
- `supabase/migrations/0020_recusa_declarada.sql` — vocabulário de motivos
  (`_forca_motivo_recusa_valido`)
- `supabase/migrations/0021_dose_cardio_declarada.sql` — `cardio_modalidades`
- `supabase/migrations/0033_anamnese_cardio_declarada.sql` — anamnese (Fase 2)

### Projeto
- `.planning/phases/01-fluxo-cardio-e-alongamento/01-RESEARCH.md` — mapa do fluxo de
  cardio/geração
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`
- `.planning/PROJECT.md` — restrições (sem CI: `tsc`+`jest`+`pytest` locais; sem dado
  inventado na UI; schema do plano = porta de mão única)
- `AGENTS.md` — regras de ambiente Supabase (staging `mjdjtiujhwklchalquhc` × prod
  `zanqygwsgxkyjiuhrzju`; conferir `supabase/.temp/project-ref`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SkipReasonSheet.tsx`: padrão de bottom sheet com lista fechada + confirmação — molde
  natural para o seletor de modalidade.
- `formatDistance` (`sessionModel.ts`): exibição pt-BR de distância — obrigatório em
  qualquer km novo na UI (lição da Fase 1).
- `cardioPrescrito.ts`: motor puro prescrito × realizado — D-05/D-06 são mudanças de
  regra AQUI (teste primeiro).
- `CARDIO_MODALIDADES` + subset com distância: fonte única das modalidades no app.

### Established Patterns
- Engine puro sem I/O (`src/engine/`) — regra nova de troca nasce como função pura +
  teste antes da UI.
- Vocabulário fechado espelhando o banco — modalidade/motivo fora da lista vira erro
  de gravação; qualquer valor novo persiste via migration + RPC.
- Adaptação só aplicada após confirmação do usuário (bottom sheets) — a troca deve
  seguir o mesmo padrão de confirmação explícita.
- Sem amostra é "—", nunca "0".

### Integration Points
- `ActiveSessionScreen.tsx` / `SessionPlayer.tsx` — onde o exercício de cardio oferece
  a troca.
- `SkipReasonSheet` → ramo `sem_equipamento` — segunda porta de entrada da troca.
- `SessionHistoryScreen.tsx` / `SessionHistoryDetailScreen.tsx` — exibição da troca no
  histórico (D-08).
- `CardioPrescritoSection.tsx` — Progresso (D-05/D-06).

</code_context>

<specifics>
## Specific Ideas

- Rótulo de referência à original no formato "Remo Ergômetro · 20 min — trocado de
  Corrida" (exemplo aprovado pelo dono para sessão e histórico).
- O dono corrigiu explicitamente durante a discussão: km realizado em outra modalidade
  CONTA nos km da semana (modelo "km é km") — não criar separação por modalidade no
  Progresso.

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase. (Deferred herdados do ciclo: loop de
adaptação de dose de cardio; limpeza de `cardio_goals`; canal contínuo pós-geração.)

</deferred>

---

*Phase: 03-interc-mbio-de-modalidade-de-cardio*
*Context gathered: 2026-08-09*
