---
phase: 18-neon-configuravel
plan: 03
subsystem: testing
tags: [node, supabase, rls, uat, secrets, staging]

# Dependency graph
requires:
  - phase: 18-neon-configuravel / 18-02
    provides: "Migration local e contrato da coluna profiles.neon_color para o smoke posterior."
provides:
  - "Smoke RLS injetável para contas A/B e cliente anônimo, com service role limitado a create/delete."
  - "Helper local de UAT com validação fechada de ambiente, provisionamento, cleanup, build web, resign e clipboard."
affects: ["18-14 smoke após staging", "18-15 ciclo UAT", "gates de segurança de credenciais"]

# Não há execução atribuível a commits deste plano no histórico disponível.
actuals:
  tokens: unknown
  tasks: unknown
  commits: 0

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adapters injetáveis para Supabase, filesystem, subprocessos, clock, logger e aleatoriedade."
    - "Allowlist de staging canônico, env filho sanitizado, logs saneados e cleanup idempotente."

key-files:
  created:
    - "scripts/neon-rls-smoke.mjs"
    - "scripts/neon-rls-smoke.test.mjs"
    - "scripts/neon-uat-accounts.mjs"
    - "scripts/neon-uat-accounts.test.mjs"
  modified: []

key-decisions:
  - "Aceitar somente https://mjdjtiujhwklchalquhc.supabase.co para o smoke e o helper."
  - "Usar service role somente em auth.admin.createUser/deleteUser; profiles passa por clientes com anon key e sessão própria."
  - "Manter credenciais de UAT em state local mode 600, ignorado pelo Git, e nunca em argv, logs ou bundle."
  - "Deixar a execução remota bloqueada para os Plans 18-14/18-15; os testes deste plano usam apenas doubles locais."

patterns-established:
  - "finally obrigatório no smoke, com falha de cleanup agregada e ids truncados."
  - "Subprocessos sem shell, com variáveis públicas de staging explicitamente adicionadas e material privilegiado filtrado."

requirements-completed: [PREF-01, PREF-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Smoke local de RLS own-row para A/B/anônimo, com falhas intermediárias e cleanup obrigatório."
    requirement: "PREF-01"
    verification:
      - kind: integration
        ref: "node --test scripts/neon-rls-smoke.test.mjs scripts/neon-uat-accounts.test.mjs — casos do smoke incluídos"
        status: pass
    human_judgment: true
    rationale: "Os 6 testes do smoke usam clientes falsos e não acessam staging; a prova comportamental real de RLS e default amarelo continua unknown/não verificada até o gate remoto posterior."
  - id: D2
    description: "Helper offline de UAT para validar env, provisionar exatamente A/B, limpar, construir web, resign e copiar campos sem vazamento."
    requirement: "PREF-02"
    verification:
      - kind: unit
        ref: "node --test scripts/neon-rls-smoke.test.mjs scripts/neon-uat-accounts.test.mjs"
        status: pass
    human_judgment: true
    rationale: "A suíte prova adapters, allowlists, sanitização e falhas locais; não prova reload/login, build real, instalação assinada ou lifecycle remoto de contas."

# Métricas não atribuíveis sem log de execução ou diff commitado do plano.
metrics:
  duration: unknown
  completed: 2026-08-18
  status: complete
---

# Phase 18: Neon configurável — Plan 03 Summary

**Harnesses offline para RLS e UAT seguro, com validação canônica de staging e proteção contra vazamento de credenciais.**

## Performance

- **Duration:** unknown — não existe log de início/fim desta execução.
- **Started:** unknown.
- **Completed:** 2026-08-18 — data desta documentação, não duração da implementação.
- **Tasks:** unknown como execução histórica; o PLAN define 2 tasks e os 4 artefatos correspondentes existem.
- **Files modified:** 4 arquivos criados pelo escopo do PLAN no working tree.

## Accomplishments

- `neon-rls-smoke.mjs` exporta `runNeonRlsSmoke`, valida o host HTTPS canônico, cria exatamente A/B via admin, autentica com anon key, testa own-row/cross-row/anônimo e sempre tenta cleanup.
- `neon-rls-smoke.test.mjs` cobre caminho feliz, isolamento cross-account, anonimato, falha intermediária, cleanup falho, ausência de credenciais nos logs e matriz de URLs inválidas.
- `neon-uat-accounts.mjs` oferece `validate`, `provision`, `copy-field`, `web-build`, `signed-install` e `cleanup`, com env estrito, state local atômico mode 600, clipboard por stdin, subprocesso sem shell e bundle staging-only.
- `neon-uat-accounts.test.mjs` cobre permissões, symlink, owner, Git ignore, URL de produção/localhost, rollback parcial, cleanup idempotente, env/argv/logs e bundles contaminados.

## Testes executados literalmente

- `node --test scripts/neon-rls-smoke.test.mjs scripts/neon-uat-accounts.test.mjs` — **PASS**, 20 testes, 0 falhas.

Os testes usam filesystem, clientes Supabase e processos falsos por injeção. Não foi executado o CLI com URL, anon key ou service role reais; não foram criadas contas de staging.

## Task Commits

Não há commit identificável de `18-03` no histórico (`git log --all` sem resultado para `18-01..03`); os quatro scripts permanecem não commitados. Não foi criado commit por solicitação do usuário.

## Files Created/Modified

- `scripts/neon-rls-smoke.mjs` — runner local/remoto futuro de RLS com cliente admin restrito e cleanup.
- `scripts/neon-rls-smoke.test.mjs` — doubles e casos de segurança do runner.
- `scripts/neon-uat-accounts.mjs` — ciclo de vida local de contas UAT e comandos web/iOS.
- `scripts/neon-uat-accounts.test.mjs` — matrizes de recusa, provisionamento, cleanup e não vazamento.

## Decisions Made

- O ref de staging é uma allowlist exata (`mjdjtiujhwklchalquhc`); produção, localhost, userinfo, porta, path, query e fragmento são recusados antes de side effect.
- O service role não participa das operações em `profiles`; os testes fazem o admin `.from()` falhar para detectar uso indevido.
- O state contém ids, emails e senhas apenas localmente, com mode 600 e path sob `.tmp/`; logs reportam apenas metadados e ids truncados.
- O helper preserva estado de remediação quando cleanup não consegue provar ausência de uma conta.

## Deviations from Plan

### Limitações observadas, sem correção

1. O PLAN exige prova remota posterior, mas também proíbe acesso remoto neste plano. A implementação e a suíte local estão presentes; nenhuma conta, migration, build web real ou instalação assinada foi verificada.
2. A cobertura de `PREF-01/PREF-02` no frontmatter repete os IDs obrigatórios do PLAN, mas não significa que a requirement esteja provada em staging. O próprio coverage marca julgamento humano para impedir auto-pass indevido.

**Total de limitações observadas:** 2. **Impacto:** os harnesses estão prontos para os gates 18-14/18-15, mas o próximo plano precisa fornecer evidência literal da execução real e do cleanup.

## Issues Encountered

- O worktree já continha alterações e arquivos não rastreados de outros planos da fase 18. Sem commits de `18-03`, não é possível separar temporalmente a autoria dos scripts.
- O teste estrutural local não substitui a validação de policies no ref de staging; nenhum resultado remoto foi inferido.

## User Setup Required

O helper prevê `.env.staging-uat.local` e state sob `.tmp/`, mas nenhum arquivo de segredo foi criado ou necessário para esta verificação. A configuração real deve seguir o gate do Plan 18-15.

## Next Phase Readiness

- O Plan 18-14 pode usar `runNeonRlsSmoke` somente depois de confirmar migration final, preflight e ref de staging.
- O Plan 18-15 pode usar os comandos do helper para o ciclo de UAT, sem colocar service role ou credenciais A/B em argv, logs ou bundle.
- O smoke remoto, a persistência após reload/login e a remoção efetiva das contas permanecem unknown/não verificados.
- Este resumo não altera código, migrations, PLANs, ROADMAP ou STATE.

---
*Phase: 18-neon-configuravel*
*Plan: 18-03*
*Completed: 2026-08-18*
