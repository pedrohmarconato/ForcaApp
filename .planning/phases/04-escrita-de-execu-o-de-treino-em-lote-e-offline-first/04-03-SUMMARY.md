---
phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first
plan: 03
subsystem: testing
tags: [supabase, postgrest, jest-integration, postgres, sqlstate, uat, offline-first]

# Dependency graph
requires:
  - phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first (04-01/04-02)
    provides: sessionOutboxDrain (enqueueItem/drainAll/enqueueAndDrain), sessionOutboxPolicy (DEFINITIVE_CODES), as 6 operações na fila
  - phase: 03-interc-mbio-de-modalidade-de-cardio (03-07)
    provides: molde do harness de integração (trava de loopback, dois clientes, seed/teardown via service_role, jest.integration.config.js, test:integration:pg)
provides:
  - Harness de integração D-16 nível 2 (__tests__/integration/sessionOutboxDrain.postgrest.test.ts) — prova contra Postgres/PostgREST reais que retry não duplica (guarda 0005 first-write-wins) e que recusa definitiva vira quarentena sem travar a drenagem
  - Migration 0037 (supersede da 0036) — errcode da guarda de troca sai de P0005 (não oficial, mascarado pelo PostgREST) para 23505 (oficial, propagável)
  - UAT modo avião (D-16 nível 3) executado e aprovado pelo dono — o sintoma original da fase não reproduz mais
affects: [deploy de migrations (0037 pendente em staging/produção), verify-work, milestone-audit]

# Actuals (#2632)
actuals:
  tokens: 13251
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Harness de integração com DOIS clientes Supabase: admin (service_role, só seed/teardown) e usuário autenticado via signInWithPassword (é o client que exercita a RPC, porque auth.uid() é verificado dentro da função)"
    - "Guarda de RPC com errcode custom precisa de SQLSTATE oficial: PostgREST mascara códigos inventados (P0005 → 500 genérico sem code); usar códigos oficiais (23505, precedente das 0010/0015)"

key-files:
  created:
    - __tests__/integration/sessionOutboxDrain.postgrest.test.ts
    - supabase/migrations/0037_swap_guard_codigo_oficial.sql
  modified:
    - src/engine/sessionOutboxPolicy.ts
    - __tests__/sessionOutboxPolicy.test.ts
    - __tests__/sessionOutboxDrain.test.ts
    - __tests__/sessionOutboxStorage.test.ts

key-decisions:
  - "Decisão do dono (checkpoint blocking-human, 2026-08-12): substituir errcode P0005 da 0036 por 23505 via migration 0037 (create or replace, mesmo padrão 0034→0035→0036) — P0005 não é SQLSTATE oficial e o PostgREST o mascara (500 genérico sem code), então a quarentena imediata prometida pela 0036 nunca acontecia no cliente"
  - "23505 segue o precedente da casa (0010 e 0015 já usam errcode 23505 explícito); um 23505 genuíno de constraint única na mesma RPC também seria recusa definitiva — comportamento correto, documentado no header da 0037"
  - "RPC exercitada como usuário autenticado real (não service_role), preservando a semântica de auth.uid() de produção"

patterns-established:
  - "D-16 barra de prova em três níveis: unitário (04-01) → mock de store (04-01/04-02) → Postgres real + UAT no aparelho (04-03); o nível 2 pegou um defeito que nenhum mock capturaria"

requirements-completed: [REQ-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Reenviar o mesmo save_set_log (mesma sessionLogId+plannedSetId) duas vezes via sessionOutboxDrain produz UMA linha em set_logs, preservando a primeira gravação (guarda 0005 first-write-wins viva, não reimplementada no cliente)"
    requirement: "REQ-07"
    verification:
      - kind: integration
        ref: "__tests__/integration/sessionOutboxDrain.postgrest.test.ts#Teste A (npm run test:integration:pg)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Troca de modalidade que dispara a guarda da 0036/0037 (23505) move o item para a quarentena local em vez de retentar indefinidamente, e a drenagem de outros itens pendentes da mesma sessão continua normalmente"
    requirement: "REQ-07"
    verification:
      - kind: integration
        ref: "__tests__/integration/sessionOutboxDrain.postgrest.test.ts#Teste B (npm run test:integration:pg)"
        status: pass
    human_judgment: false
  - id: D3
    description: "UAT modo avião no aparelho (7 passos): concluir série offline marca feita na hora sem erro e com selo de pendência; reativar rede drena sozinho; finalizar offline funciona; fechar/reabrir o app drena o restante; histórico sem duplicação"
    requirement: "REQ-07"
    verification:
      - kind: manual_procedural
        ref: "checkpoint human-verify do 04-03 (resume-signal: 'aprovado', 2026-08-12)"
        status: pass
    human_judgment: true
    rationale: "Único nível que reproduz o sintoma real (rádio do aparelho); sem alternativa automatizável — T-04-08 aceito no plano"

# Metrics
duration: ~26min (executor + continuation) + UAT humano
completed: 2026-08-12
status: complete
---

# Fase 04 / Plano 03: Barra de prova em três níveis (D-16) — Summary

**A prova contra Postgres real pegou um defeito que três camadas de mock nunca viram — a 0036 gritava P0005 e o cliente ouvia silêncio — e o UAT de modo avião confirmou no aparelho que o sintoma que originou a fase não existe mais.**

## Accomplishments

- **Teste A (integração, verde):** dois envios do mesmo `save_set_log` via `enqueueItem`+`drainAll` contra o stack Supabase local → exatamente 1 linha em `set_logs`, com os valores da PRIMEIRA gravação. A garantia exatamente-uma-vez continua sendo da guarda 0005 do servidor; o cliente só respeita (D-02, D-13).
- **Achado bloqueante (o valor real deste plano):** a guarda da 0036 usa `errcode = 'P0005'`, que não é SQLSTATE oficial. O PostgREST mascara o código e devolve `500 {"message":"Something went wrong"}` sem `code` — comprovado por comparação direta na mesma função (o branch `P0002`, oficial, propaga normalmente). Efeito: `DEFINITIVE_CODES` nunca casava, e a recusa definitiva retentava por até 7 dias antes de quarentenar por idade, em vez de quarentena imediata.
- **Correção (decisão do dono):** migration `0037_swap_guard_codigo_oficial.sql` (create or replace, padrão de supersede da série) troca `P0005` → `23505`; `DEFINITIVE_CODES` e os testes unitários acompanham. Teste B verde após a correção: o item de swap recusado vai para a quarentena do documento local e o `save_set_log` independente da mesma sessão drena normalmente.
- **UAT modo avião (D-16 nível 3) aprovado pelo dono em 2026-08-12:** os 7 passos do roteiro se comportaram como descrito — série conclui offline sem erro e com selo de pendência, fila drena sozinha na reconexão e na reabertura do app, finalização offline funciona, histórico sem duplicação.

## Deviations

- **Checkpoint de decisão não previsto no plano:** a Task 1 não podia satisfazer o próprio critério de aceite (dois testes verdes) sem tocar `supabase/migrations/` e `src/engine/sessionOutboxPolicy.ts` — ambos fora do `files_modified` declarado. Executor parou em checkpoint blocking-human; o dono escolheu "0037 com 23505"; continuation aplicou. Nenhuma decisão tomada em silêncio.
- **Flake pré-existente observada (fora de escopo):** `trainingSessionReanchoragem.test.tsx` falhou uma única vez numa rodada completa e passou em isolamento e no rerun completo limpo — dependência de ordem pré-existente, não relacionada aos arquivos deste plano.

## Pendências fora do repositório

- A migration **0037 está aplicada apenas no stack local**. Staging e produção recebem pelo fluxo normal de deploy de migrations do projeto — decisão e timing são do dono.

## Commits

- `7f5ffbd` test(04-03): harness de integração real (D-16 nível 2) — Teste A verde, Teste B expõe achado bloqueante em 0036
- `6f6a220` fix(04-03): migration 0037 troca errcode P0005 (mascarado pelo PostgREST) por 23505 oficial

## Verification

- `npm run test:integration:pg` → 2 suítes / 3 testes verdes contra Postgres local real (inclui o harness do 03-07).
- `npx jest` (suíte padrão) → 145/145 suítes, 1661/1661 testes.
- `npx tsc --noEmit` → exit 0.
- `supabase migration list --local` inclui 0037; `pg_get_functiondef` confirma `errcode = '23505'` na função viva.
- UAT nível 3: aprovado pelo dono (resume-signal "aprovado", 2026-08-12).
