---
phase: 18-neon-configuravel
plan: 02
subsystem: database
tags: [postgres, supabase, migration, rls, pytest]

# Dependency graph
requires: []
provides:
  - "Migration local aditiva para profiles.neon_color como text NOT NULL DEFAULT yellow com CHECK fechado."
  - "Harness Python estrutural que localiza a migration pelo sufixo e verifica SQL, RLS e policy sem banco remoto."
affects: ["18-12 redetecção/renumeração", "18-14 aplicação controlada em staging", "18-15 UAT"]

# Não há execução atribuível a commits deste plano no histórico disponível.
actuals:
  tokens: unknown
  tasks: unknown
  commits: 0

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Teste estrutural local encontra exatamente um arquivo *_profiles_neon_color.sql, independente do prefixo numérico."
    - "DO-block de asserção consulta catálogos PostgreSQL e preserva policies/grants existentes."

key-files:
  created:
    - "supabase/migrations/0040_profiles_neon_color.sql"
    - "backend/tests/test_migration_neon_color.py"
  modified: []

key-decisions:
  - "Usar text + CHECK nomeado, não enum PostgreSQL."
  - "Manter a migration local e sem chamada remota; a versão deve ser redetectada antes do push posterior."
  - "Não recriar policies, não conceder privilégios e não alterar outras colunas de profiles."

patterns-established:
  - "Default amarelo como backfill implícito da coluna quando a migration for aplicada."
  - "Asserção estrutural independente da formatação textual específica do PostgreSQL por comparação de constraint canônica."

requirements-completed: [PREF-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Migration aditiva local com coluna, default, NOT NULL, CHECK das quatro chaves e asserções de RLS/policy/privileges."
    requirement: "PREF-01"
    verification:
      - kind: unit
        ref: "python3 -m pytest backend/tests/test_migration_neon_color.py -q"
        status: pass
    human_judgment: true
    rationale: "O teste prova o contrato SQL no arquivo local, mas a migration não foi aplicada a staging ou produção neste plano; o efeito real no catálogo e no RLS remoto permanece unknown/não verificado."
  - id: D2
    description: "Harness Python local resiliente à futura renumeração pelo sufixo profiles_neon_color."
    verification:
      - kind: unit
        ref: "backend/tests/test_migration_neon_color.py — 7 testes passados"
        status: pass
    human_judgment: false

# Métricas não atribuíveis sem log de execução ou diff commitado do plano.
metrics:
  duration: unknown
  completed: 2026-08-18
  status: complete
---

# Phase 18: Neon configurável — Plan 02 Summary

**Contrato local de `profiles.neon_color` com domínio fechado, default amarelo e verificação estrutural de RLS.**

## Performance

- **Duration:** unknown — não existe log de início/fim desta execução.
- **Started:** unknown.
- **Completed:** 2026-08-18 — data desta documentação, não duração da implementação.
- **Tasks:** unknown como execução histórica; o PLAN define 1 task e os 2 artefatos correspondentes existem.
- **Files modified:** 2 arquivos criados pelo escopo do PLAN no working tree.

## Accomplishments

- `0040_profiles_neon_color.sql` declara `profiles.neon_color` como `text NOT NULL DEFAULT 'yellow'` e limita o valor a `yellow`, `blue`, `green` e `red` por `profiles_neon_color_check`.
- O `DO $$` verifica tipo, nullability, default, constraint, RLS ativo, policy `profiles update own` e privilégios efetivos de `authenticated`, sem recriar policy ou emitir `GRANT`/`REVOKE`.
- `test_migration_neon_color.py` remove comentários antes da análise, exige exatamente um arquivo pelo sufixo e cobre o contrato estrutural e as operações proibidas.

## Testes executados literalmente

- `python3 -m pytest backend/tests/test_migration_neon_color.py -q` — **PASS**, 7 testes. Houve 1 warning `urllib3 NotOpenSSLWarning` do ambiente Python/LibreSSL; não houve falha.

O teste é estrutural e offline. Não houve `supabase db push`, `supabase db query`, `supabase_apply_migration` ou outra chamada a banco remoto.

## Task Commits

Não há commit identificável de `18-02` no histórico (`git log --all` sem resultado para `18-01..03`); migration e harness permanecem não commitados. Não foi criado commit por solicitação do usuário.

## Files Created/Modified

- `supabase/migrations/0040_profiles_neon_color.sql` — DDL aditivo, comentário de intenção e asserções de metadados.
- `backend/tests/test_migration_neon_color.py` — verificação local por sufixo, SQL normalizado e invariantes de segurança.

## Decisions Made

- A coluna usa `text + CHECK`, conforme D-02, e não cria tipo enum.
- A migration preserva a camada de autorização existente; o SQL não contém criação/alteração de policy, `GRANT`, `REVOKE`, `DROP` ou update explícito de dados.
- A numeração `0040` fica sujeita à redetecção/renumeração prevista no Plan 18-12 antes de qualquer aplicação.

## Deviations from Plan

### Limitações de precondição e atribuição

1. O PLAN exigia confirmar que `0039` era a maior migration local antes da criação. O estado atual contém `0040`, mas o histórico não registra o momento da criação; a precondição histórica não pode ser reconstituída.
2. O acceptance criterion sobre backfill de linhas existentes e preservação de inserts é consequência do DDL, mas não foi exercitado contra um PostgreSQL. O teste atual valida o texto e as asserções do SQL, não a execução da migration.

**Total de limitações observadas:** 2. **Impacto:** o artefato está pronto para o gate que deve redetectar o número e aplicar primeiro em staging; nenhuma conclusão remota é permitida por este resumo.

## Issues Encountered

- O pytest emitiu `NotOpenSSLWarning` porque o Python local usa LibreSSL; a suíte terminou com exit code 0.
- O worktree já continha arquivos de outros planos e nenhuma fronteira de commit de `18-02`; a autoria temporal dos arquivos não pode ser comprovada pelo Git.

## User Setup Required

None — este plano não exige configuração externa para o harness estrutural.

## Next Phase Readiness

- O Plan 18-12 deve redetectar a maior migration e renumerar pelo sufixo se houver colisão antes de integrar.
- O Plan 18-14 deve aplicar a versão final somente após preflight de staging e registrar prova de execução; até lá, `PREF-01` remoto permanece unknown/não verificado.
- Este resumo não altera migration, REQUIREMENTS, PLANs, ROADMAP ou STATE.

---
*Phase: 18-neon-configuravel*
*Plan: 18-02*
*Completed: 2026-08-18*
