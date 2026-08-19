# Progresso — fechamento das Fases 15 e 16 (v1.3)

Iniciado: 2026-08-19. Sessão longa; este arquivo permite retomar sem perder contexto.

**Decisões do dono nesta rodada:**
- Ordem: Fase 15 antes da 16 (a 15 mexe em código que a 16 e a 17 consomem; fechar a 16
  antes invalidaria a verificação dela).
- Autonomia: corrigir achados sem parar a cada um; relatório consolidado no fim.

## Etapas

- [ ] **E1 — Fase 15, execução.** Waves 5→6→7 em cadeia estrita.
      15-07 (wave 5, autônomo), 15-08 (wave 6, autônomo), 15-09 (wave 7, NÃO autônomo →
      checkpoint humano, UAT no iPhone; vai parar esperando o dono).
- [ ] **E2 — Fase 15, fechamento.** VERIFICATION está `gaps_found` (3/8 must-haves);
      nenhum REVIEW jamais rodou nessa fase; sem SECURITY; VALIDATION `draft`; sem UAT.
      Requisitos: LOCK-01, LOCK-02, LOCK-03 (LOCK-03 `Pending`).
- [ ] **E3 — Fase 16, fechamento.** 11/11 planos já executados — sem execução.
      REVIEW `issues_found`; VERIFICATION `gaps_found` (3/5 must-haves); sem SECURITY;
      VALIDATION `draft`.
- [ ] **E4 — Regressão cruzada.** Suíte completa + `verify-native-skeleton.sh` +
      `verify-intent-action-queue-race.sh`, porque a 15 alterou código consumido pela
      16 e pela 17 (ambas já verificadas antes dessa alteração).

## Estado de referência no início (HEAD 2ec7a3d)

- Fase 17: COMPLETA. 7/7 planos, todos os gates verdes. REG-01/REG-02/PRED-01 Complete.
- Suíte: 167 suítes / 1979 testes, exit 0.
- `verify-native-skeleton.sh` exit 0 `(a)-(i)`; `verify-intent-action-queue-race.sh` exit 0.
- Janela aberta remanescente em WINDOWS.md: #4 (Fase 15, stub em liveActivityContentState.ts).
- Backlog 999.1: remodelar o card da Live Activity (achado do UAT 17-07).

## Log

### 2026-08-19 14:49 — sessão paralela detectada
Outra sessão commitou `fdee6a4 docs(16): add code review report` (reescreveu 16-REVIEW.md)
e deixou `.review-fix-recovery-pending.json` apontando para o worktree
`/private/tmp/sv-16-reviewfix-iHSj7U` (branch `gsd-reviewfix/16-89574`).
Verificado: worktree LIMPO (0 arquivos), branch SEM commits próprios, nenhum processo vivo,
zero atividade em 90min. Operação abandonada, nada preso. O 16-REVIEW.md fresco será
reaproveitado na E3. Worktree deixado intacto — decisão de remoção fica para a E3.

### E1 — Fase 15, Wave 5 (15-07) — despachado
Base: fdee6a4. Executor sonnet, isolamento worktree.

### E1 — 15-07 MESCLADO (0c8d9a7)
Diff contido: só `targets/session-widget/` + `scripts/`. ZERO arquivos em src/engine, src/native,
modules/live-activity ou src/store — nenhum contrato consumido pelas Fases 16/17 foi tocado.
Entregou: RestPhaseResolver.swift, OvertimeFormatter.swift, TimelineView no WidgetLiveActivity,
verify-live-activity-overtime.sh, checagem (j) no gate nativo. Fechou CR-01/CR-02 do 15-VERIFICATION.

Gate pós-merge: VERDE na árvore rastreada — 167 suítes / 1979 testes, tsc 0, skeleton 0 (a)-(j),
overtime 0, race 0.

### ACHADO NOVO (a corrigir depois do merge do 15-08)
`testPathIgnorePatterns` do Jest só exclui `<rootDir>/__tests__/integration/`; NÃO exclui
`.claude/worktrees/`. Consequência: `npm test` rodado na árvore principal enquanto um executor
de worktree está ativo descobre as cópias do worktree e conta tudo em dobro (336 suítes /
3958 testes = 2x baseline), podendo falhar por testes de integração duplicados que pedem env
do Postgres. Toda verificação concorrente fica sem valor. FIX: adicionar `.claude/worktrees/`
a `testPathIgnorePatterns` no jest config. NÃO fazer enquanto houver worktree ativo (conflito
de merge com a cópia dentro do worktree).

### E1 — 15-08 MESCLADO (aa1973e)
Tocou src/engine/sessionModel.ts e src/native/liveActivitySync.ts — consumidos por 16/17.
Mudança é semântica (exercicioForaDeJogo passa a filtrar findActiveSet/findNextPendingSet),
não de assinatura. Fechou CR-04, WR-01, WR-02. +8 testes (1979 -> 1987), TDD com RED.

### FIX DO JEST APLICADO E PROVADO (a496d2a)
`.claude/worktrees/` adicionado a testPathIgnorePatterns. Prova RED->GREEN com arquivo isca:
descoberto 1x antes, 0x depois; descoberta volta a 167 suites. Isca removida.

### Gate pós-merge 15-08: VERDE
167 suites / 1987 testes exit 0; tsc 0; suites das Fases 16/17 isoladas: 5 suites / 143 testes
exit 0 (SEM regressão); skeleton 0, overtime 0, race 0.

### ACHADO IMPORTANTE — decisão do dono tomada com informação incompleta
O plano 15-09 (gap_closure, decisão D-12) JÁ PREVIA o conserto do crash do web:
requireOptionalNativeModule só no ramo iOS + guarda de Platform.OS em App.tsx + teste novo
__tests__/liveActivityPlatformImport.test.ts provando import em Android/web.
Ou seja: quando apresentei o crash do web ao dono como "consequência a aceitar" e ele decidiu
que web não é mais superfície suportada na v1.3, o roadmap já tinha o conserto agendado a uma
wave de distância — eu não havia verificado isso antes de enquadrar a decisão.
PENDÊNCIA: quando o 15-09 mesclar, reabrir a decisão com o dono e corrigir o texto de
WINDOWS.md #5 e da nota do REQUIREMENTS.md, que hoje dizem "consequência aceita, não bug em
aberto" — o que ficará factualmente errado.

### E1 — 15-09 despachado (base a496d2a)
autonomous:false — vai parar em checkpoint de UAT físico no iPhone.

---

## E1 — FECHADA (código). Checkpoint físico pendente.
- 15-09 (d2fadfb/9bc4667) e 15-09b (1328aaa/f88b7c3): duas guardas de módulo nativo.
  `modules/live-activity/index.ts` e `modules/native-info/index.ts` usavam
  `requireNativeModule` no topo do módulo — o segundo só apareceu porque o browser
  foi reexecutado depois do primeiro conserto.
- `__tests__/nativeModulePlatformImport.test.ts`: 8 testes, exercita o grafo de import
  REAL de App.tsx sob web/android sem mock. Guarda a classe inteira, não os dois casos.
- Web reprovado -> reprovado por bug -> consertado -> verificado no browser (tela de
  Login, 8041 chars em #root, zero erro de console). Decisão do dono revertida:
  web VOLTOU a ser superfície suportada na v1.3. WINDOWS.md #5 e REQUIREMENTS.md
  corrigidos em ed500bb.
- PENDENTE (bloqueante, humano): checkpoint do 15-09 no iPhone —
  rest_to_ready_overtime, inactivity_timeout_recovery (espera de 3h),
  no_resurrection_after_finish_cancel. NÃO auto-aprovar.

## E3 — Fase 16 em fechamento
- Review-fix mesclado por OUTRA sessão: branch gsd-reviewfix/16-89574 -> main (49fa980).
  CR-01 + WR-01..WR-04 corrigidos (ec037f8, fe73503, 2217663, 7c61138, 940478a).
  16-REVIEW.md: issues_found -> resolved.
- `16-VERIFICATION.md` estava DESATUALIZADA (18/08 11:47, anterior ao 16-10 e 16-11).
  O gap D2 que ela reportava (sete ações de escrita só em memória) já estava fechado
  pelo 16-10 — confirmado ao vivo: setReps/setLoad/stepLoad/stepReps/setRir/
  setDuration/setDistance/setEffort todas chamam saveDraft. Re-verificação despachada.
- 16-SECURITY.md não existia. Auditoria despachada.
- ACHADO PRÓPRIO: dois dos cinco "informativos" do review não são informativos.
  - IN-05 (activeSessionStore.ts): activateSet/adjustRest não persistem o draft.
    Um completeSet aplicado pela reconciliação de cold-launch manda
    `startedAt: serie.activatedAt` com activatedAt nulo -> set_log com started_at
    NULL no servidor. É o fluxo PRIMÁRIO da fase.
  - IN-03 (IntentActionQueue.swift:78-81): decode atômico do array. Uma entrada em
    formato antigo (build anterior ao campo `id` da 16-05 ou ao `deltaValue` do CR-01
    da Fase 15) zera a fila INTEIRA no upgrade, silenciosamente.
  - IN-04 (verify-native-skeleton.sh): nenhuma checagem prova que a entitlement do
    App Group sobrevive ao `expo prebuild --clean`. Se regredir, UserDefaults(suiteName:)
    vira no-op silencioso e a fila inteira morre sem erro.
  Decisão: corrigir os três; IN-01 e IN-02 ficam registrados, sem correção.

## E4 — regressão cruzada despachada
tsc + suíte completa + skeleton/overtime/race. Resultado pendente.

## E3/E4 — fechados no automatizável (HEAD a46bea8)
- Fase 16: REVIEW resolved, VERIFICATION human_needed (4/5, SEM gap de código),
  SECURITY SECURED (29 ameaças, 0 abertas, 9 riscos aceitos).
- Fase 15: REVIEW resolved (6/6 confirmados no código vivo), VERIFICATION
  human_needed (4/8), SECURITY 1 ameaça aberta (T-15-09-02 = evidência humana
  ausente, não lacuna de código).
- LOCK-01 estava marcado Complete sem lastro físico → corrigido para Pending
  em REQUIREMENTS.md, com a razão registrada no próprio documento (d37193e).
- Cinco fixes mesclados (a46bea8): IN-02, IN-03, IN-04, IN-05, REG-17.
  Suíte 2017 → 2024 testes, 169 suítes, tsc 0, três harnesses exit 0 real.
- REG-17 não estava em review nenhum: dois agentes independentes, em fases
  diferentes, o acharam olhando outra coisa. findPendingSetAfter (Fase 17)
  filtrava só cutByReplan — exercício RECUSADO era anunciado como "A SEGUIR"
  na tela bloqueada. Mesma classe do WR-01 que a Fase 15 corrigiu, por um
  chamador acrescentado depois. O docstring de exercicioForaDeJogo avisa
  literalmente contra isso.
- Worktree do executor removido; branch worktree-agent-* apagada (mesclada).
  NÃO toquei em gsd-reviewfix/16-89574 (é de outra sessão) nem no worktree
  gsd-workspaces/forca-v1-4-neon (feature/v1.4-neon-theme, sessão paralela ativa).

## BLOQUEIO ÚNICO E ATUAL: UAT física
Roteiro consolidado em `.planning/UAT-FISICO-15-16-17.md` — 5 itens, um resign
só, contra o HEAD a46bea8. Destrava LOCK-01, LOCK-03, T-15-09-02 e a
reconfirmação de CMD-01. NÃO auto-aprovar nenhum item.

## Rodada final (HEAD 9d9e04b -> 16555d9): os 3 itens pendentes
1. **UAT fisica** — parte automatizavel feita: build e assinatura passam
   (BUILD SUCCEEDED). Instalacao BLOQUEADA: iPhone `unavailable` no
   `xcrun devicectl list devices`. Roteiro ampliado para 6 itens.
   ATENCAO: a notificacao do harness reportou exit 0 para o `npm run resign`
   porque capturou um `echo` encadeado; o exit real do script era 1. Ler a
   saida, nao o codigo de retorno da notificacao.
2. **Janela #6 (LOCK-03)** — corrigida no caminho de ERRO de `iniciar()`, nao no
   subscriber, porque `reset()` tem chamador unico e o subscriber geraria ciclo
   end+start a cada reabertura de sessao (orcamento da ActivityKit). Achei de
   quebra a janela #4 obsoleta. **Ledger com 0 abertas pela primeira vez.**
3. **Fase 14 re-auditada** — REVIEW (0 CR / 4 WR / 2 IN), SECURITY (17 ameacas,
   0 abertas), VALIDATION validated. Premissa minha estava ERRADA: a fase JA
   tinha threat model STRIDE nos 9 planos; 0 ameacas derivadas retroativamente.
   WR-01, WR-03 e WR-04 corrigidos com RED provado. WR-02 (icone do widget
   apontando para github.com/expo.png, baixado a cada prebuild) fica com o dono.

### Erro de metodo cometido nesta rodada
Despachei um agente instruido a rodar `verify-native-skeleton.sh` e rodei o
mesmo script em paralelo. Os dois fazem `expo prebuild --clean` no MESMO `ios/`,
que apaga o diretorio antes de regenerar — o meu abortou na rodada 2. Nao era
regressao: exit 0 nas duas rodadas quando rodado sozinho. Mesma classe da
duplicacao do Jest mais cedo. Efeito colateral util: a guarda do WR-01, escrita
minutos antes, foi o que detectou a arvore pela metade.
