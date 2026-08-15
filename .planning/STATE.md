---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: App de iPhone instalável via site (PWA)
current_phase: 13
current_phase_name: Push notification ponta a ponta
status: executing
stopped_at: Completed 13-02-PLAN.md
last_updated: "2026-08-15T15:41:56.702Z"
last_activity: 2026-08-15
last_activity_desc: Phase 13 execution started
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 15
  completed_plans: 10
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-14)

**Core value:** O PWA da Vercel vira app instalável de primeira classe no iPhone —
sem App Store, sem conta Apple — para os ~20 usuários (família/alunos).
**Current focus:** Phase 13 — Push notification ponta a ponta

## Current Position

Phase: 13 (Push notification ponta a ponta) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-08-15 — Phase 13 execution started

Progress: [███████░░░] 67%

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
| Phase 12-p-gina-de-instala-o-guiada P01 | 35min | 2 tasks | 10 files |
| Phase 13 P01 | 25min | 3 tasks | 16 files |
| Phase 13 P02 | 30min | 3 tasks | 21 files |

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
- [Phase ?]: useNavigation<any>() no CTA do Estado 4 de InstallScreen (mesmo padrao de ExercisePickerScreen.tsx) - a tela monta em 3 arvores com tipos de navigator distintos
- [Phase ?]: Guard de regressao do Pitfall 2 (tabBarButton) implementado como teste de proximidade textual (<=200 chars) em MainNavigator.tsx, nao snapshot
- [Phase ?]: Migration 0038 criada+testada mas aplicação em staging BLOQUEADA por credencial (SUPABASE_ACCESS_TOKEN sem acesso ao org ForçaApp) — dono precisa supabase login+relink+db push antes do UAT 13-04
- [Phase ?]: notificationclick usa client.navigate() direto em vez de postMessage — reusa a rota recuperável por URL de linkingConfig.ts, menos código
- [Phase ?]: push_reminder_scheduler.py reusa push_sender.delete_subscription passando SUPABASE_SERVICE_ROLE_KEY como access_token (Authorization Bearer decide o role no PostgREST, não o apikey) — evita duplicar a lógica de DELETE 410/404.
- [Phase ?]: iniciar_scheduler() chamado no IMPORT de backend/app.py (não em if __name__ == '__main__'), porque o gunicorn de produção sobe via backend.app:app e nunca executa esse bloco — sem isto PUSH-02 nunca rodaria em produção.

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

- Migration 0038 (push_subscriptions) não aplicada em staging — dono precisa relogar supabase CLI com a conta correta do ForçaApp e rodar supabase db push antes do Plano 13-04

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
| 12 | verification_deferred_human (plano 12-02 — UAT aluno leigo) | /gsd-verify-work 12 |

## Session Continuity

Last session: 2026-08-15T15:41:56.696Z
Stopped at: Completed 13-02-PLAN.md
Identidade do app instalável, Service worker e atualização segura, Página de
instalação guiada, Push notification ponta a ponta). Cobertura 11/11 requisitos
mapeados, sem órfãos. Próximo passo: /gsd-plan-phase 9.
Resume file: None

Nota sobre este arquivo: `gsd-tools state json` lê os pares `Chave: valor` DESTE
CORPO, não o frontmatter — verificado em 10/08/2026. Ao atualizar o estado,
atualize os dois.

## Operator Next Steps

- Próximo comando: `/gsd-plan-phase 9`
