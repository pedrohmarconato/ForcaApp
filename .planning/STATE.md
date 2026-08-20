---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Personalização do neon
current_phase: 18
current_phase_name: neon-configuravel
status: blocked-human
stopped_at: "Fase 18 (v1.4, neon-configuravel) ganhou em 2026-08-20 os cinco artefatos formais de portao, todos commitados: 18-REVIEW.md (9795722, 0 criticos / 3 warnings — WR-01 race de writers na Live Activity, WR-02 mutacao in-place de SaveToken, WR-03 resync de foco no Settings — / 2 infos); 18-SECURITY.md (a5ba043, status verified, threats_open 0, 6/6 ameacas mitigadas — IDOR-01, DISC-01, INJ-01, SECRET-01, CMDI-01, ENV-01); 18-VERIFICATION.md (51a0bb6, status human_needed, score 1/5 must-haves — implementacao verificada em codigo e teste, os 4 criterios fisicos do ROADMAP seguem sem device ou navegador real); 18-VALIDATION.md (2cb5390, status validated, nyquist_compliant false — fisicos permanecem Manual-Only); 18-UAT.md (95a7e47, roteiro fisico com 5 itens — item 5 automatizado PASS, tsc limpo, Jest 179/179 suites e 2152/2152 testes, 4 harnesses nativos exit 0, npm run build:web exit 0 com verify-web-bundle OK, e itens 1-4 fisicos pending). Janela #7 do ledger (indentacao cosmetica em WidgetLiveActivity.swift:156) foi fechada nos commits 0a336d5+24c116e — ledger em 0 open / 7 fixed. A migration 0040 foi aplicada em 2026-08-20 ao banco LOCAL (supabase migration up, junto com 0038/0039) e a PRODUCAO (supabase db push pela outra IA do dono, com preflight, validacoes e historico coerente — 0038/0039 ja estavam em producao desde 15/08); a prova comportamental de RLS (smoke) segue pendente, staging-only por desenho, decisao do dono. O app do iPhone do dono aponta desde 2026-08-20 para PRODUCAO (.env trocado, bundle provado com URLs de producao, instalado) — voltar ao substrato local exige reverter o .env e refazer o build. Oito pendencias restam, TODAS decisao/acao do dono, NENHUMA resolvida: (1) UAT fisica do v1.4 — 4 itens de 18-UAT.md; (2) UAT fisica do v1.3 — roteiro de 6 itens em .planning/UAT-FISICO-15-16-17.md, head_alvo 42f1e58; (3) decisao staging/RLS comportamental (PREF-02/IDOR-01) — rodar o smoke contra staging ou aceitar waive formal; (4) PREF-03 — divergencia aberta do duplo toque em saving (serializa uma segunda chamada em vez de uma unica); (5) WR-02 da Fase 14 — icone do widget aponta para https://github.com/expo.png, baixado a cada prebuild; (6) IN-01 da Fase 16 — adjustRest sem deltaSeconds e acked silenciosamente na fila, contrato assimetrico com adjustReps/adjustLoad, src/store/activeSessionStore.ts:1913-1916; (7) decisao sobre os 3 warnings do 18-REVIEW.md (WR-01 race de writers na Live Activity, WR-02 mutacao in-place de SaveToken, WR-03 resync de foco no Settings) — corrigir ou aceitar; (8) arquivamento do milestone apos tudo resolvido (gsd-audit-milestone -> gsd-complete-milestone). NAO auto-aprovar nenhum destes itens."
last_updated: "2026-08-20T01:43:43.000Z"
last_activity: 2026-08-19
last_activity_desc: "Merge 42f1e58 traz a Fase 18 (v1.4) para o main; reorganizacao do planejamento para layout plano (SUMMARYs relocados, REQUIREMENTS/ROADMAP/STATE/UAT atualizados) — nenhuma pendencia fisica resolvida por esta reorganizacao"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 15
  completed_plans: 10
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15)

**Core value:** O dono faz a sessão de treino INTEIRA com o iPhone bloqueado — vê,
comanda e registra o treino pela tela bloqueada, como o Spotify
opera música — via app nativo pessoal por sideload gratuito (sem Apple Developer
pago, sem distribuição a terceiros). A partir do v1.4, a personalização do
acento neon (amarelo/azul/verde/vermelho por conta, propagado à Live
Activity) se soma a esse núcleo.
**Current focus:** Phase 18 — neon-configuravel (v1.4); Fases 15 e 16 do v1.3
seguem bloqueadas no mesmo portão humano (UAT física)

## Current Position

Milestone: v1.4 — Personalização do neon (Phase 18), mesclada ao main em
`42f1e58` (2026-08-19) por cima da Fase 17 do v1.3
Phase: 18 — implementação mesclada e verificada em CI local; planos 18-11 a
18-15 (integração, staging, gate agregado de UAT) NÃO executados. Fases 15 e
16 do v1.3 continuam BLOQUEADAS no portão humano anterior (UAT física).
Plan: 10 of 15 na Fase 18 (v1.4); os 36 planos do v1.3 permanecem no mesmo
estado registrado antes do merge — não reauditados por esta reorganização
Status: aguarda `.planning/UAT-FISICO-15-16-17.md` (head_alvo agora `42f1e58`)
e as três decisões do dono: PREF-01 (migration 0040 nunca aplicada a banco
real), WR-02 (ícone do widget via rede) e IN-01 (ack de `adjustRest` sem
`deltaSeconds`)
Last activity: 2026-08-19 — merge 42f1e58 (Fase 18 do v1.4) seguido da
reorganização do planejamento para layout plano

Progress: [██████░░░░] 67% dos planos da Fase 18 (10/15) — nenhum Success
Criteria da Fase 18 fisicamente validado; Fases 15/16 do v1.3 seguem retidas
no portão humano anterior

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
- [Phase 18, merge 2026-08-19]: Milestone v1.4 (Personalização do neon) foi desenvolvido em branch paralela (`feature/v1.4-neon-theme`) enquanto o v1.3 seguia seu próprio caminho, e mesclado ao main no commit `42f1e58` por cima da Fase 17. O dono decidiu layout PLANO para o planejamento (sem diretório de workstream dedicado): os 10 SUMMARYs da Fase 18 foram relocados para `.planning/phases/18-neon-configuravel/` e `.planning/workstreams/` foi removido inteiro; REQUIREMENTS.md e ROADMAP.md ganharam as seções do v1.4 sem alterar nenhum conteúdo do v1.0-v1.3.

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

- **v1.4/Fase 18 — cinco artefatos formais de portão criados em 2026-08-20,
  oito pendências restam, TODAS decisão/ação do dono, NENHUMA resolvida:**
  `18-REVIEW.md` (`9795722`, 0 críticos / 3 warnings / 2 infos),
  `18-SECURITY.md` (`a5ba043`, SECURED 6/6, `threats_open: 0`),
  `18-VERIFICATION.md` (`51a0bb6`, `human_needed`, score 1/5 must-haves),
  `18-VALIDATION.md` (`2cb5390`, `validated`, `nyquist_compliant: false`) e
  `18-UAT.md` (`95a7e47`, item 5 automatizado PASS, itens 1-4 físicos
  `pending`). Pendências:
  (1) UAT física do v1.4 — 4 itens de `18-UAT.md`;
  (2) UAT física do v1.3 — roteiro de 6 itens em
  `.planning/UAT-FISICO-15-16-17.md`, `head_alvo` `42f1e58` (Fases 15 e 16
  continuam bloqueadas nesse portão humano; nada deste item foi
  auto-aprovado);
  (3) decisão staging/RLS comportamental (PREF-02/IDOR-01) — rodar
  `scripts/neon-rls-smoke.mjs` contra staging ou aceitar waive formal;
  (4) PREF-03 — divergência aberta do duplo toque em `saving` (a
  implementação serializa uma segunda chamada em vez de uma única);
  (5) WR-02 da Fase 14 (ícone do widget ainda aponta para
  `https://github.com/expo.png`, baixado a cada `prebuild`);
  (6) IN-01 do `16-REVIEW.md` (`adjustRest` sem `deltaSeconds` é acked
  silenciosamente na fila, tratamento assimétrico com `adjustReps`/
  `adjustLoad` — `src/store/activeSessionStore.ts:1913-1916`);
  (7) decisão sobre os 3 warnings do `18-REVIEW.md` (WR-01 race de writers
  na Live Activity, WR-02 mutação in-place de `SaveToken`, WR-03 resync de
  foco no Settings) — corrigir ou aceitar;
  (8) arquivamento do milestone após tudo resolvido
  (`gsd-audit-milestone` → `gsd-complete-milestone`).

- **Substrato de UAT mudou em 2026-08-20:** o app instalado no iPhone do
  dono aponta hoje para PRODUÇÃO (`.env` trocado, bundle provado com URLs de
  produção, instalado). Voltar ao substrato local exige reverter o `.env` e
  refazer o build.

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
