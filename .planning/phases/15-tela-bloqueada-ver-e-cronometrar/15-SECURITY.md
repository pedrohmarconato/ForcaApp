---
phase: 15
slug: tela-bloqueada-ver-e-cronometrar
audited: 2026-08-19T21:10:14Z
status: open_threats
threats_total: 19
threats_mitigated: 18
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate); block_on default = high (no override em .planning/config.json)
threats_open: 1
risks_accepted: 5
asvs_level: 1
block_on: high
created: 2026-08-19
---

# Fase 15 — Security

> Contrato de segurança por fase: registro de ameaças, riscos aceitos e trilha de auditoria.
> Auditoria retroativa (`gsd-secure-phase`), estado auditado = HEAD do branch `main` no momento
> da auditoria (commit `9baeed4` como último a tocar `.planning/phases/15-tela-bloqueada-ver-e-cronometrar/`,
> mais os fixes de código `d2fadfb`, `1503fe4`, `1328aaa`, `f88b7c3`). Registro construído a partir
> dos blocos `<threat_model>` das 9 PLAN.md (15-01 a 15-09), todas com STRIDE Threat Register.
>
> Aviso de leitura: `src/store/activeSessionStore.ts` e
> `modules/live-activity/ios/IntentActionQueue.swift` são superfície da Fase 16 (outro agente
> corrige achados num worktree separado). Esta auditoria os leu apenas como contexto de fronteira
> (App Group), no estado atual do `main`; nenhuma ameaça desta fase depende do conteúdo exato
> desses dois arquivos.

**Veredicto: OPEN_THREATS — 1 ameaça bloqueante.** Depende de UMA ação do dono: responder o
checkpoint físico do Plano 15-09 (Task 2) no iPhone.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| App principal (processo RN) -> Widget Extension (processo separado) | `Activity<SessionActivityAttributes>.update(content:)` cruza para um processo com sandbox próprio, fora do controle de runtime do app principal | `LiveActivityContentState` (exercício, série, prescrição, `restEndsAt`, campos de edição em curso) |
| Tela bloqueada / Dynamic Island | Superfície de UI do sistema, visível a qualquer pessoa que veja o aparelho fisicamente bloqueado — não só o dono | Nome de exercício, carga-alvo, reps-alvo, série X/Y, timer de descanso |
| `.env` local (gitignored) -> bundle nativo embutido | `EXPO_PUBLIC_SUPABASE_ANON_KEY`/`EXPO_PUBLIC_SUPABASE_URL` de produção passam a estar embutidos no `main.jsbundle` instalado no device | Project ref/URL e anon key (pública por design, protegida por RLS) de produção |
| ActivityKit -> WidgetKit (`TimelineView`) | O `ContentState` recebido pelo widget contém `restEndsAt` e precisa permanecer temporalmente coerente enquanto o processo JS está suspenso | `restEndsAt`, fase recebida (`resting`/`readyOvertime`) |
| Bootstrap multiplataforma (Android/web) -> módulo nativo Apple-only | `modules/live-activity`/`modules/native-info` só existem no ramo iOS; a importação em Android/web precisa resolver para um valor neutro, nunca lançar | Nenhum dado cruza — o risco é disponibilidade (crash de bootstrap), não confidencialidade |
| iPhone físico do dono | Único aparelho usado nas sessões de UAT (Sessão 1, Sessão 2, checkpoint 15-09); nenhum trust boundary novo além do já auditado na Fase 14 | Conta real de produção, treino real |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Evidência | Status |
|-----------|----------|-----------|----------|-------------|-----------|--------|
| T-15-01-01 | Information Disclosure | `LiveActivityContentState` cruzando para o processo da extensão | medium | mitigate | `src/engine/liveActivityContentState.ts:23-68` — tipo carrega só campos de exibição/edição da sessão em curso (nome, série, prescrição, carga/reps em edição, `restEndsAt`, antecipação "a seguir"); nenhum campo de token, credencial, plano completo da semana ou dado de outro usuário em nenhum dos 9 planos da fase | closed |
| T-15-01-02 | Tampering | Entitlement `aps-environment` vazando para `app.json`/módulo novo | high | mitigate | `app.json:24-31` só declara `com.apple.security.application-groups` e `NSSupportsLiveActivities` — sem `aps-environment`; `scripts/verify-native-skeleton.sh:93-104` (checagem c) varre todo `.entitlements` gerado por `expo prebuild --clean` e aborta se `aps-environment` aparecer; roda 2x por chamada de `npm run verify:native` | closed |
| T-15-01-03 | Information Disclosure | Exercício/série/carga visíveis no Lock Screen a qualquer pessoa que olhe o aparelho, sem autenticação | low | accept | Decisão registrada em `15-01-PLAN.md` linha 398 (STRIDE Threat Register): "Intenção explícita do produto (LOCK-01) — app pessoal single-user, sem dado financeiro/PII além do próprio treino, mesmo padrão de apps de música mostrando faixa tocando na tela bloqueada". Reforçado por `15-CONTEXT.md` (D-01, escopo do card) e pelo enquadramento de produto em `.planning/PROJECT.md` (app nativo pessoal, sideload, single-tenant) | closed (accepted) |
| T-15-02-01 | Information Disclosure | `blockLabel`/`blockIndex`/`blockTotal` revelando estrutura do plano (ex. "Alongamento 2/6") | low | accept | Decisão registrada em `15-02-PLAN.md` linha 227: "Metadado de treino, não dado sensível — app pessoal single-user, mesma categoria de informação que a série X/Y já exibida (T-15-01-03 aceito na Plano 15-01)" | closed (accepted) |
| T-15-03-01 | Denial of Service | Live Activity presa (nunca encerra) por falha silenciosa em end/reconcile | medium | mitigate | `src/native/liveActivitySync.ts:196-222` (`reconcileOrphanActivities`) roda no boot do app (`App.tsx:50`) e encerra toda Activity órfã via `modules/live-activity/ios/LiveActivityModule.swift:147-154` (`reconcileOrphans`, itera `Activity<SessionActivityAttributes>.activities`), independente de qualquer `end`/`update` isolado ter falhado antes. Confirmado fisicamente: `15-06-SUMMARY.md` — `reconciliacao_force_quit=PASS` | closed |
| T-15-03-02 | Repudiation | Reconciliação roda mas o dono nunca sabe se funcionou | medium | mitigate | `src/components/LiveActivityUnavailableBanner.tsx` (todo o arquivo) + `__tests__/LiveActivityUnavailableBanner.test.tsx` tornam falha de start observável; reconciliação em si confirmada por evidência física explícita e literal em `15-06-SUMMARY.md` ("Evidência literal do dono": `reconciliacao_force_quit=PASS`), não por inferência de build | closed |
| T-15-04-01 | Information Disclosure | `.env` commitado por engano com credencial de produção | medium | mitigate | `.gitignore:4-6` (`\.env`, `\.env.*`, `!\.env.example`) já cobre o arquivo; `15-04-SUMMARY.md` confirma que a anon key de produção nunca apareceu em commit, log ou chat durante a troca de `.env` para produção | closed |
| T-15-05-01 | Repudiation | Resultado da sessão física reportado de forma imprecisa/inferida | high | mitigate | `15-05-SUMMARY.md` seção "Resposta física literal" — resposta PASS/FAIL/N-A item a item (`card_sobe`, `timer_nunca_auto_avanca`, `dynamic_island_*`, `blockonly_cardio`), com override explícito do dono citado literalmente para os itens N-A | closed |
| T-15-06-01 | Information Disclosure / Tampering | UAT contra dados reais de produção | medium | accept | Decisão D-13 registrada em `15-CONTEXT.md:103` ("Duas sessões físicas... roteiro auto-contido"); `15-04-SUMMARY.md`/`15-06-SUMMARY.md` confirmam o uso deliberado de conta e treino reais como o próprio propósito da UAT | closed (accepted) |
| T-15-06-02 | Repudiation | Fase reportada como concluída sem confirmação de todos os itens | high | mitigate | `15-06-SUMMARY.md` seção "Evidência literal do dono" — 5 itens (`card_ao_vivo`, `termina_sozinho`, `cancela_imediato`, `reconciliacao_force_quit`, `aviso_indisponivel`) todos com resposta explícita do dono, formato PASS/FAIL/N-A | closed |
| T-15-07-01 | Denial of Service | Expiração de descanso não observada com o processo JS suspenso | high | mitigate | `targets/session-widget/RestPhaseResolver.swift` (`effectivePhase`) + `targets/session-widget/WidgetLiveActivity.swift:255-266,306-308` (`effectiveState` dentro de `TimelineView(.periodic(from: .now, by: 1))`) resolvem a fase efetiva a cada tick do WidgetKit a partir de `timeline.date`, nunca de update JS; provado sem simulador por `scripts/verify-live-activity-overtime.sh`, conectado ao gate em `scripts/verify-native-skeleton.sh` (checagem j, linha 235) | closed |
| T-15-07-02 | Tampering | Fase e formatter de overtime incorretos nas bordas do prazo | medium | mitigate | `targets/session-widget/OvertimeFormatter.swift` (`format`, clamp `[0, 3599]`) + `RestPhaseResolver.swift` (`overtimeSeconds`); `scripts/verify-live-activity-overtime.sh` prova as 3 fronteiras (antes/no instante/depois de `restEndsAt`) e as bordas do formatter (0, 3599, acima do teto, negativo) | closed |
| T-15-07-03 | Information Disclosure | `ContentState` ganhando campo novo nesta correção | low | accept | Decisão registrada em `15-07-PLAN.md`: "Esta correção não acrescenta campos; preserva o contrato mínimo já aceito para LOCK-01" — confirmado: `RestPhaseResolver`/`OvertimeFormatter` operam sobre `restEndsAt`/`phase` já existentes, nenhum `@Field` novo em `LiveActivityContentStateRecord` (`modules/live-activity/ios/LiveActivityModule.swift:4-30`) | closed (accepted) |
| T-15-08-01 | Denial of Service | Timeout de inatividade adiado indefinidamente por edição cosmética | medium | mitigate | `src/native/liveActivitySync.ts:60-74` (`hasNewlyDoneSet`, compara por `plannedSetId`) + `:244-247` (só essa transição chama `resetInactivityTimeout`) — edição de reps/carga/RIR/descanso publica update mas não adia o prazo original | closed |
| T-15-08-02 | Tampering | Fallback update→start ressuscitando Activity de sessão terminada/trocada | high | mitigate | `src/native/liveActivitySync.ts:102-119` (`recoverAfterFailedUpdate`) — guarda pós-await por `status === 'active'`, `draft` existente e `sessionLogId` idêntico ao que originou o update antes de qualquer `startLiveActivity` | closed |
| T-15-08-03 | Information Disclosure | Exercício recusado (`skippedByUser`) ainda selecionável para o card | medium | mitigate | `src/engine/sessionModel.ts:376-396` (`findActiveSet`/`findNextPendingSet`) delegam a `exercicioForaDeJogo` (`:707-709`, `cutByReplan === true \|\| skippedByUser === true`) em vez do filtro parcial anterior | closed |
| T-15-09-01 | Denial of Service | Módulo Apple-only carregado incondicionalmente derrubando bootstrap Android/web | high | mitigate | `modules/live-activity/index.ts:65-68` — `requireOptionalNativeModule` só avaliado quando `Platform.OS === 'ios'`, `null` fora dele; `App.tsx:39` (`if (Platform.OS !== 'ios') return undefined;`) antes de assinar qualquer listener; `__tests__/liveActivityPlatformImport.test.ts` (9 casos, import real sem mock) + irmão `modules/native-info/index.ts` corrigido em 15-09b; verificado em navegador real (`PROGRESS-15-16.md` linha 100-103: tela de Login renderizada, zero erro de módulo nativo) | closed |
| T-15-09-02 | Repudiation | Resultado da UAT física dos gap-closures (CR-01/CR-02/CR-04) reportado sem confirmação do dono | high | mitigate | **NÃO EXECUTADO.** `15-09-SUMMARY.md` frontmatter `status: checkpoint-pending` (linha 82) e corpo (linhas 93-94, 110): "Task 2 (checkpoint físico) permanece pendente... NÃO respondida nesta execução". `15-REVIEW.md` frontmatter (linhas 68-71): "RESSALVA: o Escalation Gate... exige também a UAT física... ainda NÃO respondido pelo dono. Review resolvido não significa fase fechada." `.planning/PROGRESS-15-16.md` linhas 93,104-106: "Checkpoint físico pendente... PENDENTE (bloqueante, humano)... NÃO auto-aprovar." `.planning/REQUIREMENTS.md` linha 35 (`[ ] LOCK-03`) e linha 113 (`LOCK-03 \| Phase 15 \| Pending`) | **open — blocking** |
| T-15-09-03 | Information Disclosure | Mensagem do banner de indisponibilidade revelando algo além do necessário | low | accept | Decisão registrada em `15-09-PLAN.md`: "A mensagem já aprovada informa apenas indisponibilidade de Live Activities e continua invisível fora de iOS" — confirmado em `src/components/LiveActivityUnavailableBanner.tsx:10-11,21,39` (texto fixo, guard `Platform.OS !== 'ios'` duplo) | closed (accepted) |

*Status: closed · open — blocking (severidade ≥ `block_on`) · open — below threshold (non-blocking)*
*Severity: critical > high > medium > low — só ameaças abertas em severidade ≥ `block_on` (default: high, sem override em `.planning/config.json`) contam para `threats_open`*
*Disposition: mitigate (implementação exigida) · accept (risco documentado) · transfer (terceiro — nenhuma nesta fase)*

---

## Unregistered Flags (SUMMARY.md `## Threat Flags`)

Nenhuma das 9 SUMMARY.md (15-01 a 15-09) contém uma seção `## Threat Flags` — nenhuma nova
superfície de ataque foi sinalizada pelo executor durante a implementação. Nenhum flag para
mapear.

Observação separada (não é threat flag, não bloqueia): `findPendingSetAfter`
(`src/engine/sessionModel.ts:406-409`, introduzida na Fase 17 para PRED-01) ainda filtra só
`ex.cutByReplan`, não `exercicioForaDeJogo` — a linha "A SEGUIR" pode citar um exercício
`skippedByUser`. Isto é superfície da Fase 17 (a mesma classe de dado que T-17-12 já cobre),
não um artefato desta fase — `findActiveSet`/`findNextPendingSet`, os dois seletores que T-15-08-03
declara mitigar, seguem corretos. Registrado aqui só para rastreabilidade cruzada.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-15-01 | T-15-01-03 | Exercício/série/carga na tela bloqueada sem autenticação é a intenção explícita do produto (LOCK-01) — app pessoal single-user, sideload, sem dado financeiro; mesmo padrão de apps de música mostrando a faixa tocando | Pedro Marconato (decisão de planejamento registrada em 15-01-PLAN.md, reforçada em 15-CONTEXT.md D-01) | 2026-08-16 |
| R-15-02 | T-15-02-01 | `blockLabel`/`blockIndex`/`blockTotal` ("Alongamento 2/6") é metadado de treino, mesma categoria de informação que a série X/Y já aceita em R-15-01 | Pedro Marconato (15-02-PLAN.md) | 2026-08-17 |
| R-15-03 | T-15-06-01 | UAT com conta e treino reais de produção é decisão deliberada (D-13) — é o próprio propósito de validar/treinar de verdade, mesmo padrão D-08 da Fase 14 | Pedro Marconato (15-CONTEXT.md D-13) | 2026-08-16 |
| R-15-04 | T-15-07-03 | Correção temporal (resting→readyOvertime) não introduz campo novo no ContentState — preserva o contrato mínimo já aceito em R-15-01/R-15-02 | Pedro Marconato (15-07-PLAN.md) | 2026-08-19 |
| R-15-05 | T-15-09-03 | Mensagem do banner de indisponibilidade informa só a ausência de Live Activities, sem detalhe de causa; invisível fora de iOS | Pedro Marconato (15-09-PLAN.md) | 2026-08-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open (blocking) | Run By |
|------------|---------------|--------|------------------|--------|
| 2026-08-19 | 19 | 18 | 1 (T-15-09-02, high) | gsd-secure-phase (L1, asvs 1, register extraído dos 9 PLAN.md — verificado contra código vivo em `main`) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (5/5)
- [ ] `threats_open: 0` — **NÃO confirmado: threats_open = 1** (T-15-09-02, Repudiation, high, mitigate declarado mas checklist físico do 15-09 Task 2 nunca foi respondido pelo dono)
- [ ] `status: verified` — não definido; `status: open_threats` até o checkpoint físico do 15-09 ser respondido

**Próxima ação:** rodar a Task 2 do Plano 15-09 no iPhone físico do dono (rebuild com
`npm run resign`, roteiro: `rest_to_ready_overtime`, `inactivity_timeout_recovery` — espera de
3h —, `no_resurrection_after_finish_cancel`) e registrar as 3 respostas PASS/FAIL literais em
`15-09-SUMMARY.md`. Depois disso, re-rodar esta auditoria para fechar T-15-09-02 e permitir
`status: verified`.

**Approval:** pending — auditoria de código completa; UAT física do dono ainda em aberto.
