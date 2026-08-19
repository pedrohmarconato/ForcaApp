---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Treino de tela bloqueada (app nativo pessoal)
current_phase: 16
current_phase_name: tela-bloqueada-comandar
status: blocked-human
stopped_at: "36/36 planos executados no milestone. Fase 14 agora com o gauntlet COMPLETO (VERIFICATION passed, REVIEW 0 critical/4 warning/2 info, SECURITY verified com 17 ameacas e 0 abertas, VALIDATION validated) — os 3 warnings reais foram corrigidos com RED provado. Fase 17 completa. Fases 15 e 16 com todos os portoes automatizaveis fechados e bloqueadas num unico portao humano: a UAT fisica no iPhone, roteiro de 6 itens em .planning/UAT-FISICO-15-16-17.md contra o HEAD 9d9e04b. NAO auto-aprovar. Ledger de janelas ZERADO (open_count 0). Bloqueio operacional: o iPhone esta unavailable no devicectl — npm run resign compila mas nao instala ate o aparelho ser conectado, desbloqueado e confiado. Pendencia de decisao do dono: WR-02 da Fase 14 (icone do widget ainda aponta para https://github.com/expo.png, baixado a cada prebuild) e IN-01 do 16-REVIEW (contrato de ack da fila)."
last_updated: "2026-08-19T23:00:00.000Z"
last_activity: 2026-08-19
last_activity_desc: "Fase 14 re-auditada e fechada; janela #6 corrigida; ledger zerado; bloqueio unico e a UAT fisica"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 36
  completed_plans: 36
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15)

**Core value:** O dono faz a sessão de treino INTEIRA com o iPhone bloqueado — vê,
comanda e registra o treino pela tela bloqueada, como o Spotify
opera música — via app nativo pessoal por sideload gratuito (sem Apple Developer
pago, sem distribuição a terceiros).
**Current focus:** Phase 16 — tela-bloqueada-comandar

## Current Position

Phase: 15 e 16 — BLOQUEADAS em portao humano (UAT fisica)
Plan: 36 of 36 (execucao completa no milestone)
Status: aguarda .planning/UAT-FISICO-15-16-17.md ser respondido pelo dono
Last activity: 2026-08-19 — gauntlet de fechamento das Fases 15 e 16

Progress: [██████████] 100% dos planos — fechamento retido no portao humano

## Performance Metrics

**Velocity:**

- Total plans completed: 16 (v1.3)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 05 P01 | 3 tasks | 4min | 4min |
| Phase 05 P02 | 1 tasks | 9min | 9min |
| 14 | 9 | - | - |
| 17 | 7 | - | - |

**Recent Trend:**

- v1.3 execution started; Phase 15 Plans 01–05 are complete in this milestone.

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
| Phase 15 P02 | 10min | 2 tasks | 5 files |
| Phase 15 P03 | 12 min | 3 tasks | 5 files |
| Phase 16 P09 | ~20min | 2 tasks | 0 files |

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
- [Phase ?]: Alongamento/Cardio usa posição dentro do conjunto de exercícios em jogo com a mesma métrica efetiva; carga_reps fica fora do denominador.
- [Phase ?]: Overtime da Live Activity é texto manual +m:ss clampado em +59:59 para preservar a largura da região Micro.
- [Phase ?]: Exercícios medidos por tempo roteiam diretamente para blockOnly antes da seleção de descanso/medição.
- [Phase ?]: O caminho existente skipWholeSession permanece o sinal de cancelamento: draft null e status finished na mesma atualização produzem dismissal immediate, sem nova API.
- [Phase ?]: O timeout de inatividade usa 3 horas e a conclusão usa dismissal afterDate em 180 segundos; o timeout remove apenas a Activity e preserva o draft.
- [Phase ?]: A falha de start fica observável por getLastStartFailed e subscription; o banner usa guard de uma ocorrência por processo e sobrevive a remount.
- [Phase 15]: Dynamic Island compact/minimal/expanded foi deferida para feature futura; implementação permanece, mas não bloqueia v1.3 porque o aparelho do dono é um iPhone 13 sem esse hardware.
- [Phase 15]: A UAT física completa do Plano 15-06 passou no iPhone 13, mas a verificação independente encontrou cinco gaps de implementação; LOCK-03 permanece pendente até o fechamento desses gaps.
- [Phase ?]: 16-09: resposta agregada do dono ('todas foram pass agora') interpretada, com ressalva explícita, como sem_duplicacao=PASS, force_quit_toque=PASS-A, regressao_geral=PASS — os dois FAILs de 16-06 revertem; CMD-01/CMD-02 permanecem Gaps Found até a próxima /gsd-verify-work

### Pending Todos

- `dynamic-island-future-device`: validar e ajustar compact/minimal/expanded em
  aparelho compatível quando houver hardware disponível.

- `phase-15-verification-gaps`: corrigir os cinco gaps do `15-VERIFICATION.md`
  antes de concluir a Fase 15 e iniciar a Fase 16.

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

- O iPhone 13 disponível valida o Lock Screen, mas não possui Dynamic Island;
  compact/minimal/expanded foram retirados do acceptance gate e deferidos.

- A UAT física do Plano 15-06 passou, mas `15-VERIFICATION.md` confirmou cinco
  gaps de implementação; a Fase 15 não pode ser concluída até a correção.

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
| scope | Dynamic Island compact/minimal/expanded — implementação sem UAT física | Deferido para feature futura; exige iPhone compatível, indisponível ao dono | Phase 15 Plan 05 (2026-08-17) |

## Session Continuity

Last session: 2026-08-18T22:52:52.477Z
Stopped at: Phase 17 context gathered
Lock Screen, timer e blockOnly passaram no iPhone 13; Dynamic Island permanece
deferida por ausência de hardware compatível. A UAT física do Plano 15-06 também
passou, mas `15-VERIFICATION.md` confirmou cinco gaps no código. LOCK-03 continua
pendente até a correção e a verificação final.
Resume file: .planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-CONTEXT.md

Nota sobre este arquivo: `gsd-tools state json` lê os pares `Chave: valor` DESTE
CORPO, não o frontmatter — verificado em 10/08/2026. Ao atualizar o estado,
atualize os dois.

## Operator Next Steps

- Criar planos de correção com `/gsd-plan-phase 15 --gaps`.
