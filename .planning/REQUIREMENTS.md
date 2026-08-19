# Requirements — Milestone v1.3 "Treino de tela bloqueada (app nativo pessoal)"

Escopo: o dono faz a sessão de treino INTEIRA com o iPhone bloqueado — vê,
comanda e registra pela tela bloqueada, como o Spotify opera
música. App NATIVO pessoal por sideload gratuito (Apple ID, validade 7 dias,
sem distribuição a terceiros). iPhone do dono em iOS 26.x; Xcode 26.6
licenciado. Pesquisa completa em `.planning/research/` (SUMMARY.md, commit
143c5d2) — dois pontos decididos por spike no aparelho: App Groups em time
gratuito e processo do `perform()` de `LiveActivityIntent` no cold-launch.

## v1.3 Requirements

### Fundação nativa (NAT)

- [x] **NAT-01**: O dono instala o ForcaApp como app nativo no próprio iPhone a
  partir desta máquina (`expo prebuild` + assinatura com Apple ID gratuito), com
  rotina de reassinatura semanal documentada e repetível em 1 comando.

- [x] **NAT-02**: O target da extensão de widget e o módulo nativo sobrevivem a
  `expo prebuild --clean` (targets via `@bacons/apple-targets` + módulo Expo em
  Swift local — nada criado à mão no Xcode), e o spike de App Groups no aparelho
  registra por escrito qual arquitetura de estado vale (com ou sem App Group).

### Tela bloqueada — ver (LOCK)

- [x] **LOCK-01**: Durante a sessão ativa, a tela bloqueada mostra o exercício
  atual, a série X/Y e a prescrição (reps × carga) num card de Live Activity,
  sem desbloquear nem abrir o app.

- [x] **LOCK-02**: O timer de descanso conta regressivamente na tela bloqueada
  de forma nativa (`Text(timerInterval:)`, sem depender do app acordado) — o
  estado do timer sai de `SessionPlayer.tsx` e vira timestamp absoluto
  (`restEndsAt`) no `activeSessionStore` (fundação compartilhada).

- [ ] **LOCK-03**: A Live Activity encerra sozinha quando a sessão termina ou é
  cancelada (nunca fica "presa" mostrando treino velho), inclusive no caso de
  force-quit do app (reconciliação na reabertura).

### Tela bloqueada — comandar (CMD)

- [x] **CMD-01**: O dono conclui a série atual com 1 toque no botão da tela
  bloqueada (App Intent), sem abrir o app — o registro segue o MESMO caminho
  `completeSet()` → outbox → servidor que já existe (a Live Activity é espelho,
  nunca fonte de verdade).

- [x] **CMD-02**: O dono pula ou ajusta o descanso direto na tela bloqueada; o
  timer nativo reflete o ajuste imediatamente.

### Tela bloqueada — registrar (REG)

- [ ] **REG-01**: Ao registrar uma série no app, reps e carga vêm pré-preenchidos
  do histórico do exercício (última sessão), ajustáveis só por botões +/− (passo
  de anilha por exercício; ex.: ±1 rep, ±2,5 kg) e confirmação em 1 toque —
  teclado deixa de ser necessário no fluxo padrão.

- [x] **REG-02**: O mesmo registro sem teclado funciona na Live Activity: ajustar
  reps/carga por +/− e confirmar a série pela tela bloqueada, com o valor
  acumulado entre toques preservado (arquitetura conforme o spike de NAT-02).
  Valor atípico fora do passo (ex.: 37,5 kg com passo 5) abre o app — exceção
  aceita, `TextField` é impossível na plataforma.

### Antecipação (PRED)

- [x] **PRED-01**: Antes do descanso acabar, a Live Activity já mostra a próxima
  ação prevista (próxima série/exercício e prescrição) — o dado já existe no
  `activeSessionStore`, é composição de UI.

## Future Requirements (deferidos — decisão do dono em 15/08/2026)

- **Dynamic Island (compact/minimal/expanded)** — implementação preservada no
  widget, mas validação física e aceitação do produto foram deferidas em
  17/08/2026 porque o aparelho do dono é um iPhone 13, sem Dynamic Island, e não
  há aparelho compatível disponível. Não bloqueia o v1.3; volta como feature
  futura quando houver hardware para UAT.

- **Notificação local de fim de descanso** (som/vibração com app suspenso) —
  NÃO selecionada para o v1.3. Consequência aceita: com o app suspenso, o fim
  do descanso é apenas visual na tela bloqueada (timer chega a zero sem som).
  Barato de adicionar depois (infra `expo-notifications` local, sem APNs).

- **Modo mãos-livres** (cues falados via `AVSpeechSynthesizer` + sessão de áudio
  `.duckOthers` convivendo com Spotify) — NÃO selecionado; a pesquisa já o
  recomendava como pós-núcleo (v1.3.x) por risco empírico de fala com tela
  bloqueada.

- Reassinatura automática (AltStore/automação) — só se a rotina manual semanal
  incomodar de verdade.

## Out of Scope

- **Widget de tela de início (WidgetKit)** — decisão do dono no escopo v3.
- **Push nativo/APNs** — impossível no regime gratuito; notificação local cobre
  o que for preciso no futuro. Porta reaberta só pagando US$ 99/ano.

- **Atualização remota da Live Activity via push** — mesma razão; updates são
  locais (`Activity.update()`).

- **Campo de texto na Live Activity** — impossível na plataforma (ActivityKit
  não tem `TextField`); o stepper é o caminho, não um fallback.

- **Distribuição a terceiros** (TestFlight/App Store/alunos) — app pessoal.
- **Ações pesadas nos botões da tela bloqueada** (ex.: replanejamento via
  backend) — `perform()` grava intenção local; processamento pesado é do app.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAT-01 | Phase 14 | Complete |
| NAT-02 | Phase 14 | Complete |
| LOCK-01 | Phase 15 | Complete |
| LOCK-02 | Phase 15 | Complete |
| LOCK-03 | Phase 15 | Pending |
| CMD-01 | Phase 16 | Complete |
| CMD-02 | Phase 16 | Complete |
| REG-01 | Phase 17 | Pending (falta ver no app do iPhone) |
| REG-02 | Phase 17 | Complete |
| PRED-01 | Phase 17 | Complete |

Coverage: 10/10 v1.3 requirements mapped. No orphans.

**Nota sobre REG-01/REG-02/PRED-01 (Fase 17, atualizada em 2026-08-19 apos o UAT
fisico do `17-07-PLAN.md`):**
- **REG-02** e **PRED-01** tem agora confirmacao de aparelho fisico: sessao do dono
  no iPhone 13 em 2026-08-19, 7/7 itens do roteiro PASS (ver `17-07-SUMMARY.md`).
  Os Criterios 2, 3 e 4 do ROADMAP (os tres com a marcacao "(UAT do dono no aparelho
  fisico)") passaram, junto com a migracao de `ContentState` e os dois riscos de
  plataforma sem fonte oficial da Apple (toque rapido, orcamento de
  `Activity.update()`). Um achado de design foi registrado (card do Lock Screen
  pequeno para a densidade de informacao) — nao bloqueia REG-02, e escopo novo,
  ver `17-07-SUMMARY.md`.
- **REG-01** continua `Pending`, com a janela #5 de `WINDOWS.md` (`unrun-verify`) ABERTA.
  O UAT fisico do 17-07 nao cobriu este requisito: o Criterio 1 do ROADMAP nao carrega a
  marcacao "(UAT do dono no aparelho fisico)", e o proprio `17-07-PLAN.md` declara no
  objective que "o criterio 1, REG-01 no app, nao exige UAT fisico" — o roteiro da sessao
  fisica nunca o incluiu.
  O plano original era fechar REG-01 pelo PWA (`expo start --web`, 390x844). Esse caminho
  esta INEXEQUIVEL: em 2026-08-19 o web foi executado de verdade e a aplicacao crasha no
  mount com 'Cannot find native module LiveActivityModule' — `modules/live-activity/index.ts:49`
  chama `requireNativeModule` no topo do modulo, sem guarda de `Platform.OS` (idem
  `liveActivitySync.ts` e `liveActivityIntentBridge.ts`). Quebrado desde a Fase 16
  (`3dabb0e`), nao e regressao da Fase 17. Por decisao do dono em 2026-08-19, o web/PWA
  deixou de ser superficie suportada na v1.3 (o milestone virou app nativo pessoal), entao
  esse crash e consequencia aceita e nao bug em aberto.
  **O que fecha REG-01:** o dono abrir a tela de sessao ativa no APP DO IPHONE (nao a tela
  bloqueada), num exercicio com historico, e confirmar pre-preenchimento vindo do historico,
  ajuste apenas por +/-, marca de valor herdado, e ausencia de teclado ou overflow. A
  evidencia atual (replica de CSS/box-model em Chromium via Playwright, 0 overflow em
  390x844 e 360px) prova o layout, mas nao e o app rodando.
Dois bugs que so o build Xcode completo revelou (ponte Expo sem os 11 campos novos do
ContentState; lockfile sem o workspace `modules/live-activity`) foram corrigidos no
Plano 17-06 — ver `17-06-SUMMARY.md`.

**Nota sobre CMD-01/CMD-02 (Fase 16, marcados Complete em 2026-08-18):** os três
Success Criteria da Fase 16 no `ROADMAP.md` têm UAT físico do dono — ver
`.planning/phases/16-tela-bloqueada-comandar/16-UAT.md`. O critério 3 (force-quit

+ toque na tela bloqueada) reprovou na primeira rodada, teve a causa diagnosticada

(descarte silencioso de intent órfã) e passou na segunda, após o fix `54de3ef`,
com o caminho de UI confirmado individualmente (só o stepper de carga).

Gap residual conhecido e deliberadamente aceito: o caminho de exercício de
métrica `tempo`/`tempo_distancia` NÃO tem UAT físico — o dono declinou por não
ter esse tipo de exercício no programa. Cobertura só automatizada (`91ec4b4`),
cujo limite está declarado no `16-UAT.md`. Não é Success Criteria do ROADMAP.
Outros resíduos abertos (causa raiz do `nil` em `CompleteSetIntent.swift:12`,
`reconcileOrphans`, WR-01..WR-04) estão listados no `16-UAT.md`.
