---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Treino de tela bloqueada (app nativo pessoal)
current_phase: 15
current_phase_name: tela-bloqueada-ver-e-cronometrar
status: executing
stopped_at: Completed 15-04-PLAN.md
last_updated: "2026-08-17T12:32:42.902Z"
last_activity: 2026-08-17
last_activity_desc: Phase 15 Plan 04 complete
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 15
  completed_plans: 11
  percent: 73
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15)

**Core value:** O dono faz a sessão de treino INTEIRA com o iPhone bloqueado — vê,
comanda e registra o treino pela tela bloqueada/Dynamic Island, como o Spotify
opera música — via app nativo pessoal por sideload gratuito (sem Apple Developer
pago, sem distribuição a terceiros).
**Current focus:** Phase 15 — tela-bloqueada-ver-e-cronometrar

## Current Position

Phase: 15 (tela-bloqueada-ver-e-cronometrar) — EXECUTING
Plan: 3 of 6
Status: Ready to execute
Last activity: 2026-08-17 — Phase 15 Plan 04 complete

Progress: [███████░░░] 73%

## Performance Metrics

**Velocity:**

- Total plans completed: 11 (v1.3)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 05 P01 | 3 tasks | 4min | 4min |
| Phase 05 P02 | 1 tasks | 9min | 9min |
| 14 | 9 | - | - |

**Recent Trend:**

- v1.3 execution started; Phase 15 Plans 01 and 04 are complete in this milestone.

**Per-Plan Metrics (histórico v1.2):**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 11 P01 | 5min | 2 tasks | 7 files |
| Phase 11 P02 | 12min | 2 tasks | 4 files |
| Phase 12-p-gina-de-instala-o-guiada P01 | 35min | 2 tasks | 10 files |
| Phase 13 P01 | 25min | 3 tasks | 16 files |
| Phase 13 P02 | 30min | 3 tasks | 21 files |
| Phase 13 P03 | 12min | 2 tasks | 3 files |
| Phase 13 P05 | ~15min | 2 tasks | 3 files |
| Phase 15 P01 | 45min | 1 tasks | 26 files |
| Phase 15 P04 | 20min | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- Roadmap v1.3 (2026-08-15): 4 fases derivadas das 10 requirements na ordem
  dependency-locked da pesquisa — Phase 14 (NAT: skeleton nativo + spike de App
  Groups), Phase 15 (LOCK: Live Activity não-interativa + refactor do timer para
  `restEndsAt`), Phase 16 (CMD: App Intents interativos), Phase 17 (REG+PRED:
  stepper sem teclado no app e na Live Activity + antecipação da próxima ação).
  PRED-01 (1 requisito, "cheap") dobrado dentro da Phase 17 em vez de virar fase
  própria — granularidade "standard" evita fase de requisito único.

- Notificação local de fim de descanso e modo mãos-livres (áudio/voz) ficam FORA
  do v1.3 (decisão do dono em 15/08) — não geraram fase.

- Toda fase que toca o iPhone físico carrega critério de UAT explícito do dono —
  Xcode 26.6 licenciado nesta máquina permite builds on-device daqui, mas só o
  dono tem o aparelho físico para instalar/testar.

- v1.2 segue o caminho PWA sem Apple Developer pago (2026-08-14) — pesquisa
  confirmou que a única alternativa (marketplace do TCC CADE) também exige conta
  paga; dono optou por não pagar.

- Ordem das fases 9-13 segue a dependência técnica real da pesquisa: Alert.alert +
  Wake Lock primeiro (ortogonal, desbloqueia UAT limpo), depois identidade
  (manifest/splash), depois service worker, depois página de instalação, push por
  último (depende de SW registrado e do alertShim para o opt-in).

- [Phase ?]: sw.js/register-sw.js/manifest.json servidos com Cache-Control: no-cache, must-revalidate; carve-out do rewrite de SPA e do header catch-all (mesma técnica da Fase 10 para /splash/*.png)
- [Phase ?]: workbox-config.cjs nunca ativa runtimeCaching — SW só precacheia app shell estático, outbox offline-first do v1.0 segue como única camada de retry de dados
- [Phase ?]: Migration 0038 criada+testada mas aplicação em staging BLOQUEADA por credencial (SUPABASE_ACCESS_TOKEN sem acesso ao org ForçaApp) — dono precisa supabase login+relink+db push antes do UAT 13-04
- [Phase ?]: iniciar_scheduler() chamado no IMPORT de backend/app.py (não em if __name__ == '__main__'), porque o gunicorn de produção sobe via backend.app:app e nunca executa esse bloco — sem isto PUSH-02 nunca rodaria em produção.
- [Phase ?]: PushInviteHost: convite único de opt-in via alertShim, flag push_invite_shown gravada nos dois caminhos (aceitar/recusar), subscribeToPush() como primeira expressão síncrona do onPress do botão do Modal web.
- [Phase ?]: ContentState estruturado e numerico, com restEndsAt ISO-8601 UTC, preserva reps/carga para as Fases 16/17.
- [Phase ?]: Text(timerInterval:) permanece no widget; o intervalo do app só força repaint cosmético e nunca avança a série.
- [Phase ?]: LiveActivityModule declara disponibilidade iOS 16.2 para compilar ActivityContent sem elevar o podspec do molde.
- [Phase ?]: Produção do app nativo usa exclusivamente o ref zanqygwsgxkyjiuhrzju, validado como forcaapp-prod na organização ltmhaqdcvidzsbfkxmii.
- [Phase ?]: Mudanças de .env mantêm o arquivo gitignored e nunca expõem ou versionam a anon public key; .env.example permanece intocado.
- [Phase ?]: O bundle Release é reconstruído por npm run resign antes do UAT físico; login real e Lock Screen UAT continuam nos planos físicos posteriores.

### Pending Todos

Nenhum novo desde o início do v1.3.

### Blockers/Concerns

- Xcode 26.6 licenciado nesta máquina (builds on-device possíveis daqui), mas só o
  dono tem o iPhone físico — cada fase de v1.3 que toca o aparelho carrega
  critério de UAT explícito do dono (nunca "compilou" como critério de conclusão).

- Duas incertezas resolvidas só por spike no aparelho (Fase 14, primeiro passo):
  (1) disponibilidade de App Groups em time pessoal gratuito; (2) processo que
  executa `perform()` de `LiveActivityIntent` no cold-launch. A arquitetura de
  REG-02/CMD depende do resultado — não presumir nenhuma resposta antes do spike.

- Repo sem CI de testes local — verificação sempre local (tsc + jest + pytest);
  comportamento de Live Activity/App Intents não é testável em simulador, exige
  aparelho físico a partir da Fase 15.

- Dois projetos Supabase (staging `mjdjtiujhwklchalquhc`, produção
  `zanqygwsgxkyjiuhrzju`) — conferir `supabase/.temp/project-ref` antes de
  qualquer comando linkado (v1.3 não deve mexer em schema, mas o hábito vale).

## Deferred Items

Items acknowledged and carried forward from previous milestone closes:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| debug | typeerror-envio-series-treino | resolved_partial — fix commitado e verificado; falta o texto literal do erro de produção (só o dono tem) e a ressalva do errMsg sem nome de classe | v1.0 close (2026-08-13) |
| tech-debt | Migrations sem GRANT DML para `authenticated` (projeto Supabase novo sobe quebrado) | Deferred | v1.0 close (2026-08-13) |
| tech-debt | Tabela `cardio_goals` órfã (sem drop/arquivamento) | Deferred | v1.0 close (2026-08-13) |
| tech-debt | Nyquist not-validated nas fases do v1.0 | Deferred | v1.0 close (2026-08-13) |
| scope | UAT físico no iPhone das 5 fases do v1.2 (9-13) | Deferred — roteiros em milestones/v1.2-phases/*/NN-UAT.md | v1.2 close (2026-08-15) |
| scope | Notificação local de fim de descanso (som/vibração) | Deferido para pós-v1.3 (v1.3.x) — decisão do dono 2026-08-15 | v1.3 roadmap (2026-08-15) |
| scope | Modo mãos-livres (cues falados via áudio) | Deferido para pós-v1.3 (v1.3.x) — decisão do dono 2026-08-15 | v1.3 roadmap (2026-08-15) |

## Session Continuity

Last session: 2026-08-17T12:32:42.895Z
Stopped at: Completed 15-04-PLAN.md
sem órfãos. STATE.md atualizado; REQUIREMENTS.md permaneceu sem alteração porque
LOCK-01/LOCK-02 já estavam completos e LOCK-03 continua pendente. Aguardando
aprovação do dono.
Resume file: None

Nota sobre este arquivo: `gsd-tools state json` lê os pares `Chave: valor` DESTE
CORPO, não o frontmatter — verificado em 10/08/2026. Ao atualizar o estado,
atualize os dois.

## Operator Next Steps

- Executar o próximo plano da fase com /gsd-execute-phase 15 (Plan 02).
