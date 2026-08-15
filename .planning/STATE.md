---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: App de iPhone instalável via site (PWA)
current_phase: 11
current_phase_name: Service worker e atualização segura
status: executing
stopped_at: Phase 12 UI-SPEC approved
last_updated: "2026-08-15T13:11:49.194Z"
last_activity: 2026-08-15
last_activity_desc: Phase 11 execution started
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 10
  completed_plans: 7
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-14)

**Core value:** O PWA da Vercel vira app instalável de primeira classe no iPhone —
sem App Store, sem conta Apple — para os ~20 usuários (família/alunos).
**Current focus:** Phase 11 — Service worker e atualização segura

## Current Position

Phase: 11 (Service worker e atualização segura) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-08-15 — Phase 11 execution started

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.2)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 05 P01 | 3 tasks | 4min | 4min |
| Phase 05 P02 | 1 tasks | 9min | 9min |

**Recent Trend:**

- v1.2 ainda não iniciou execução — sem amostra.

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 11 P01 | 5min | 2 tasks | 7 files |
| Phase 11 P02 | 12min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- v1.2 segue o caminho PWA sem Apple Developer pago (2026-08-14) — pesquisa
  confirmou que a única alternativa (marketplace do TCC CADE) também exige conta
  paga; dono optou por não pagar.

- Ordem das fases 9-13 segue a dependência técnica real da pesquisa: Alert.alert +
  Wake Lock primeiro (ortogonal, desbloqueia UAT limpo), depois identidade
  (manifest/splash), depois service worker, depois página de instalação, push por
  último (depende de SW registrado e do alertShim para o opt-in).

- Push (PUSH-01) exige spike técnico prévio de expiração/HTTP 410 do `pywebpush`
  antes da implementação principal — confiança MEDIUM-BAIXA nas fontes.

- Service worker nunca intercepta chamadas Supabase/API — outbox offline-first do
  v1.0 segue como única camada de retry de dados (pitfall confirmado na pesquisa).

- [Phase ?]: sw.js/register-sw.js/manifest.json servidos com Cache-Control: no-cache, must-revalidate; carve-out do rewrite de SPA e do header catch-all (mesma técnica da Fase 10 para /splash/*.png)
- [Phase ?]: workbox-config.cjs nunca ativa runtimeCaching — SW só precacheia app shell estático, outbox offline-first do v1.0 segue como única camada de retry de dados
- [Phase ?]: UpdateBanner nao le nenhuma flag sincrona de register-sw.js (a que o plano citava nao existe no arquivo real do Plano 11-01) - risco residual registrado em WINDOWS.md em vez de modificar o arquivo travado do Wave 1
- [Phase ?]: Testes que precisam de window.addEventListener/dispatchEvent reais usam @jest-environment jsdom por arquivo (docblock deve ser o primeiro token literal) - a config jest padrao do repo roda em ambiente Node puro sem EventTarget

### Pending Todos

Nenhum novo desde o início do v1.2. Ver Deferred Items abaixo para dívidas herdadas
do v1.0/v1.1.

### Blockers/Concerns

- Máquina de dev sem toolchain nativa (sem Xcode) — cada fase relevante deste
  milestone termina com item de UAT explícito do dono no iPhone real (nunca
  "passou no Lighthouse" como critério de conclusão).

- Repo sem CI de testes local — verificação sempre local (tsc + jest + pytest).
- Dois projetos Supabase (staging `mjdjtiujhwklchalquhc`, produção `zanqygwsgxkyjiuhrzju`)
  — conferir `supabase/.temp/project-ref` antes de qualquer comando linkado
  (relevante para a migration de `push_subscriptions` na Fase 13).

## Deferred Items

Items acknowledged and deferred from previous milestone close (v1.1, 2026-08-14):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| debug | typeerror-envio-series-treino | resolved_partial — fix commitado e verificado; falta o texto literal do erro de produção (só o dono tem) e a ressalva do errMsg sem nome de classe | v1.0 close (2026-08-13) |
| tech-debt | Migrations sem GRANT DML para `authenticated` (projeto Supabase novo sobe quebrado) | Deferred — Future Requirements do v1.2 | v1.0 close (2026-08-13) |
| tech-debt | Tabela `cardio_goals` órfã (sem drop/arquivamento) | Deferred — Future Requirements do v1.2 | v1.0 close (2026-08-13) |
| tech-debt | Nyquist not-validated nas fases do v1.0 | Deferred | v1.0 close (2026-08-13) |
| scope | `Alert.alert` no-op no react-native-web | **Endereçado nesta milestone — Phase 9 (WEB-01)** | v1.0 close (2026-08-13) |

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 9 | verification_deferred_human | /gsd-verify-work 9 |
| 10 | verification_deferred_human (Task 3 do plano 10-01) | /gsd-verify-work 10 |
| 11 | verification_deferred_human (Task 3 do plano 11-03 — modo avião) | /gsd-verify-work 11 |

## Session Continuity

Last session: 2026-08-15T12:43:52.590Z
Stopped at: Phase 12 UI-SPEC approved
Identidade do app instalável, Service worker e atualização segura, Página de
instalação guiada, Push notification ponta a ponta). Cobertura 11/11 requisitos
mapeados, sem órfãos. Próximo passo: /gsd-plan-phase 9.
Resume file: .planning/phases/12-p-gina-de-instala-o-guiada/12-UI-SPEC.md

Nota sobre este arquivo: `gsd-tools state json` lê os pares `Chave: valor` DESTE
CORPO, não o frontmatter — verificado em 10/08/2026. Ao atualizar o estado,
atualize os dois.

## Operator Next Steps

- Próximo comando: `/gsd-plan-phase 9`
