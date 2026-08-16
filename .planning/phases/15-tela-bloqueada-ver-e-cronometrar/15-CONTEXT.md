# Phase 15: Tela bloqueada — ver e cronometrar - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

A Live Activity **somente de leitura** (sem botões, sem App Intents) espelha a
sessão de treino ativa na tela bloqueada e nas 4 apresentações do Dynamic Island
(Lock Screen, compact, minimal, expanded), mostrando exercício atual, série X/Y e
prescrição. O timer de descanso conta de forma nativa (`Text(timerInterval:)`) a
partir de um timestamp absoluto — o estado de descanso sai de `SessionPlayer.tsx`
e vira `restEndsAt` no `activeSessionStore`. O ciclo de vida é fechado: o card
sobe ao iniciar a sessão, se encerra sozinho ao terminar/cancelar, e qualquer card
órfão é reconciliado na reabertura do app após force-quit.

Requisitos: LOCK-01, LOCK-02, LOCK-03.

**Fora desta fase:** botões na tela bloqueada / App Intents (Fase 16), registro de
reps/carga sem teclado (Fase 17), antecipação da próxima ação (PRED-01, Fase 17),
som/vibração no fim do descanso (deferido para pós-v1.3 — o fim do descanso é
apenas visual).

</domain>

<decisions>
## Implementation Decisions

### Conteúdo e hierarquia do card

- **D-01:** O card **troca de layout com o estado**, espelhando os dois cartões que
  o `SessionPlayer.tsx` já alterna hoje. Descansando: o timer é o elemento grande
  e o exercício vira linha secundária. Executando a série: a prescrição
  (reps × carga) é o elemento grande.

- **D-02:** Nas apresentações espremidas do Dynamic Island (**compact** e
  **minimal**) a prioridade é o **tempo**: mm:ss do descanso correndo. Fora do
  descanso, essas apresentações caem para série X/Y.

- **D-03:** **Só blocos de musculação têm card detalhado.** Durante cardio e
  alongamento, a Live Activity permanece viva (D-05) mas mostra apenas nome do
  bloco e progresso (ex.: "Alongamento 2/6") — sem linha de prescrição.
  Consequência aceita e explícita: a dose do cardio (tempo/distância) não aparece
  na tela bloqueada nesta fase.

- **D-04:** Quando o descanso zera e o dono não age, o card mostra
  **"Pronto · Série 3/4" em destaque + contagem crescente discreta** do tempo
  excedido desde o zero (ex.: `+2:30`).

### Ciclo de vida da Live Activity

- **D-05:** A Activity **sobe ao iniciar a sessão** de treino (não no primeiro
  descanso) e vive até o fim — inclusive durante blocos de cardio/alongamento
  (com o conteúdo reduzido de D-03).

- **D-06:** Ao **terminar** o treino, o card vira **resumo curto e desaparece
  sozinho** em ~2–5 min (`dismissalPolicy` por data, não `.default`). Ao
  **cancelar** a sessão, encerra imediatamente. Nenhum caminho deixa card preso.

- **D-07:** Com o app em **foreground** a Activity **continua viva** — um único
  ciclo de vida por sessão (start → update → end), sem start/end repetidos ao
  alternar foreground/background.

- **D-08:** **Timeout de inatividade:** sem nenhuma série registrada por um
  período, a Live Activity se encerra sozinha (a sessão no store permanece
  intacta para retomada — só o card sai da tela bloqueada). Padrão sugerido: 3h
  (ajustável — ver Claude's Discretion).

### Semântica do descanso com `restEndsAt`

- **D-09:** **O descanso nunca auto-avança.** Ao chegar a zero, o estado vira
  "Pronto" e o avanço para a próxima série só acontece por ação do dono.
  — **Reversibility:** costly — inverte o comportamento vigente de
  `SessionPlayer.tsx:298` (`if (rest && restRemaining === 0) endRest(true)`), que
  hoje auto-avança; desfazer exige remexer no mesmo caminho de transição de série
  e revalidar o UAT em aparelho.

- **D-10:** **Regra única, sem depender do estado do app.** "Nunca auto-avança"
  vale igualmente com o app aberto na frente do dono e com o iPhone bloqueado —
  uma semântica só para o timer, no app e na tela bloqueada. Mudança perceptível
  no fluxo atual do app, assumida de propósito (não é efeito colateral).

### Reconciliação e falhas

- **D-11:** Ao reabrir o app após force-quit: **encerra toda Live Activity
  existente e, se a sessão ainda estiver viva no store, sobe um card novo** já com
  o estado corrente. Um caminho só — não tenta decidir se o card órfão ainda
  servia.

- **D-12:** Se a Live Activity **não conseguir subir** (Live Activities desativada
  em Ajustes, recusa do iOS, limite do sistema): **aviso discreto uma única vez**
  no app, sem bloquear o treino. Nunca silêncio total, nunca aviso repetido a cada
  tentativa.

### Logística dos momentos com iPhone

- **D-13:** **Duas sessões físicas** com roteiro auto-contido, no formato que a
  Fase 14 estabeleceu (comandos copiáveis + "o que você deve ver" + critério
  PASS/FAIL), com a execução da fase **parando** no checkpoint até o dono reportar:
  - **Sessão 1 (cedo, ~20 min)** — o card sobe, aparece nas 4 apresentações e o
    timer conta com o iPhone bloqueado. Com sessão de mentira, contra o stack
    local. Existe porque nada disso é testável em simulador (registrado em
    STATE.md) e porque errar o layout no fim da fase custa caro.
  - **Sessão 2 (fim)** — UAT com treino real e conta real do dono, cobrindo os 4
    critérios do ROADMAP. Depende do Supabase de produção já apontado (todo
    dobrado abaixo).

- **D-14:** "Compilou" nunca é critério de conclusão — herdado da D-10 da Fase 14.

### Claude's Discretion

- Formato interno do `ContentState`/`ActivityAttributes` (string pré-formatada vs
  campos estruturados). **Restrição registrada:** a Fase 17 (REG-02) precisa de
  reps e carga como **números**, não como texto renderizado — escolher o formato
  que não force refatoração lá na frente.
- Valor exato do timeout de inatividade da D-08 (3h é o padrão sugerido).
- Onde e como o aviso da D-12 aparece na UI do app (banner, toast, linha na tela
  de sessão) — desde que discreto e não bloqueante, no espírito do banner de
  validade de reassinatura (D-03 da Fase 14).
- Mecânica do `±30s` existente (`ajustarDescanso`) depois do refactor para
  `restEndsAt` — ajustar o timestamp é a tradução direta; ajuste pela tela
  bloqueada é CMD-02 (Fase 16).
- Estrutura de arquivos dentro de `targets/session-widget/` e
  `modules/live-activity/`, e o mecanismo de sincronia do `ActivityAttributes`
  duplicado entre app e extensão.
- Estilo visual do card (cores, tipografia, uso da identidade Força) — a fase está
  marcada como **UI hint: yes** no ROADMAP; `/gsd-ui-phase 15` pode produzir o
  contrato de design antes do planejamento, se o dono quiser.

### Folded Todos

- **`backend-supabase-producao-no-aparelho`** (criado 2026-08-16, severidade
  `blocking-usage`, origem 14-06) — **dobrado nesta fase**.
  Problema: `EXPO_PUBLIC_SUPABASE_URL` aponta para `127.0.0.1:54321`; dentro do
  iPhone isso é o próprio aparelho, o login não completa e o Supabase local sequer
  estava em execução. Pendência conhecida junto: a CLI do Supabase está
  autenticada na conta errada.
  Por que entra aqui: a Sessão 2 (D-13) exige **treino real** no aparelho — sem
  login em produção, o UAT da Fase 15 não roda. Cumpre a D-07 da Fase 14 (bundle
  embarcado aponta para produção), que a Fase 14 não chegou a exercitar.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato do milestone
- `.planning/REQUIREMENTS.md` — LOCK-01, LOCK-02, LOCK-03 (texto integral); e a
  seção **Out of Scope**, que veta `TextField` na Live Activity, push/APNs e
  atualização remota (updates são locais via `Activity.update()`).
- `.planning/ROADMAP.md` §"Phase 15: Tela bloqueada — ver e cronometrar" — goal e
  os 4 success criteria (2 deles são UAT físico do dono).

### Decisão de arquitetura herdada da Fase 14 (não re-litigar)
- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` — **App Group
  funciona em time Apple pessoal gratuito**, PASS nas duas direções no iPhone 13
  físico. `group.com.pmarconato.forcaapp.shared` está congelado em `app.json` e em
  `targets/session-widget/expo-target.config.js`. **Não desenhar fallback "sem App
  Group".** O módulo descartável `modules/app-group-spike/` foi removido — o
  código real de estado compartilhado é desta fase.
- `.planning/phases/14-funda-o-nativa/14-CONTEXT.md` — decisões vigentes:
  identidade "Força" (D-04), dev-client no dia a dia (D-05), bundle ids e App
  Group congelados (D-06), bundle embarcado → produção (D-07), UAT com conta real
  (D-08), formato de roteiro físico e parada em checkpoint (D-09/D-10).

### Pesquisa v1.3 (decisões já arbitradas — não re-pesquisar do zero)
- `.planning/research/ARCHITECTURE.md` — layout alvo: `targets/session-widget/`
  (SwiftUI, sem JS), `modules/live-activity/` (Expo Module em Swift),
  `src/native/liveActivitySync.ts` como **único escritor** para ActivityKit,
  assinando o `activeSessionStore`; e o `restEndsAt` já previsto no store.
- `.planning/research/PITFALLS.md` — pitfall 1 (`prebuild --clean` apaga target
  manual: nunca editar `ios/` à mão) e pitfall 4 (`aps-environment` vazando para
  entitlements quebra a assinatura em time gratuito) continuam valendo nesta fase.
- `.planning/research/STACK.md` — versões pinadas para SDK 54; por que nenhum
  wrapper OSS de ActivityKit serve.
- `.planning/research/SUMMARY.md` — síntese decisória e ordem dependency-locked
  das fases 14→17.

### Estado atual do código
- `.planning/codebase/STACK.md` — Expo SDK 54 / RN 0.81.5, `EXPO_PUBLIC_*`
  inlined no bundle, patch-package no postinstall.
- `.planning/todos/pending/backend-supabase-producao-no-aparelho.md` — diagnóstico
  completo do login quebrado no aparelho, com a evidência de máquina da sessão
  14-06 (todo dobrado nesta fase).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `targets/session-widget/` — target de extensão de widget **já existe e sobrevive
  a `expo prebuild --clean`** (`scripts/verify-native-skeleton.sh` guarda isso).
  Contém `WidgetLiveActivity.swift`, `widgets.swift`, `AppIntent.swift`,
  `expo-target.config.js` com a entitlement do App Group. É onde a UI da Live
  Activity é construída — não criar target novo.
- `modules/native-info/` — módulo Expo local em Swift já linkado; serve de molde
  para `modules/live-activity/`.
- `src/components/session/SessionPlayer.tsx` (1136 linhas) — dono atual do estado
  de descanso e da UI dos dois cartões (série ativa × descanso, com anel neon
  drenando). É a origem do refactor de LOCK-02 e a referência visual da D-01.
- `src/engine/sessionSummary.ts` → `ajustarDescanso(remaining, total, delta)` —
  lógica do ±30s já isolada; precisa de tradução para timestamp, não de reescrita.
- `scripts/resign.sh` / `npm run resign` — rotina validada na Fase 14 (Release,
  8/8 passos); é como o build vai parar no aparelho para as duas sessões físicas.

### Established Patterns
- `ios/` é **gerado** (Continuous Native Generation): todo artefato nativo
  persistente vive em `targets/`, `modules/` e config plugins. Editar `ios/` à mão
  é perda garantida no próximo `prebuild`.
- `activeSessionStore.ts` (1833 linhas, Zustand) usa **guarda de CAS** em toda
  mutação de sessão ativa e já tem caminho de retomada/reconciliação (padrão da
  outbox offline-first do v1.0) — `restEndsAt` e a reconciliação de card órfão
  devem seguir esse mesmo padrão, não inventar outro.
- `EXPO_PUBLIC_*` são inlined no bundle (babel-preset-expo) — é por isso que
  apontar para produção (todo dobrado) é mudança de `.env` + rebuild, não código
  de runtime.
- Verificação é local (`tsc` + `jest` + `pytest`); build nativo e Live Activity
  **não entram no CI** — a prova é UAT do dono no aparelho.

### Integration Points
- `src/store/activeSessionStore.ts` — recebe `restEndsAt` (LOCK-02) e a
  reconciliação de Activity órfã (LOCK-03, D-11).
- `src/components/session/SessionPlayer.tsx` — deixa de ser dono do timer; passa a
  ler do store. É onde D-09/D-10 mudam comportamento visível hoje.
- `src/native/liveActivitySync.ts` (novo) — único ponto que chama
  start/update/end da Activity, assinando o store. Nenhum componente React deve
  falar com ActivityKit direto.
- App Group `group.com.pmarconato.forcaapp.shared` — canal legítimo app ⇄
  extensão, já provado (spike 14-06).
- PWA de produção e backend no VPS **não são tocados**; o nativo é mais um cliente
  dos mesmos endpoints.

</code_context>

<specifics>
## Specific Ideas

- O card de descanso do app tem um **anel neon que drena** conforme o tempo passa
  (`SessionPlayer.tsx` ~linha 54: "descanso se esgota, não se acumula") e um pulso
  discreto nos 5 segundos finais. A Live Activity deve **evocar** essa linguagem —
  a fidelidade exata fica para `/gsd-ui-phase 15`, se o dono quiser o contrato de
  design antes do plano.
- Estado "Pronto" com tempo excedido discreto (`+2:30`) existe para flagrar "parei
  tempo demais entre séries" sem transformar o card em cronômetro.
- Roteiros das sessões físicas no formato já executado pelo dono no v1.2/v1.3:
  blocos de comandos copiáveis + "o que você deve ver" + critério PASS/FAIL.

</specifics>

<deferred>
## Deferred Ideas

- **Prescrição do cardio na tela bloqueada** (tempo/distância prescritos durante
  blocos de cardio) — excluída pela D-03. Se incomodar no uso real, cabe numa fase
  posterior ou num ajuste do v1.3.x.
- **Antecipação da próxima ação** durante o descanso — já é PRED-01, Fase 17. O
  card desta fase não mostra "o que vem a seguir", mesmo que o app mostre.
- **Ajustar/pular descanso pela tela bloqueada** — CMD-02, Fase 16.
- **Som/vibração no fim do descanso** — deferido para pós-v1.3 por decisão do dono
  (15/08). Consequência aceita: com o app suspenso, o fim do descanso é apenas
  visual.

</deferred>

---

*Phase: 15-Tela bloqueada — ver e cronometrar*
*Context gathered: 2026-08-16*
</content>
