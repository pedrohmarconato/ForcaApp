# Phase 17: Tela bloqueada — registrar e antecipar - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

O registro de uma série de musculação deixa de depender do teclado. Reps e carga
nascem **pré-preenchidos** — do histórico do exercício, com queda para o alvo do
plano —, são ajustados só por botões `−/+` com o passo de anilha do próprio
exercício e confirmados em **1 toque**, tanto na tela do app quanto na Live
Activity da tela bloqueada. Em paralelo, o card da tela bloqueada passa a
**antecipar a próxima ação** durante todo o descanso, e não só quando ele zera.

Requisitos: REG-01, REG-02, PRED-01.

**Herança que não se re-litiga:** a Live Activity continua **espelho, nunca
fonte de verdade** (Fases 15/16); todo toque da tela bloqueada entra pelo caminho
`LiveActivityIntent` → `IntentActionQueue` → `liveActivityIntentBridge.ts` → ação
já existente da store, com peek não-destrutivo e ack condicionado ao resultado
real (16-07) e dedup por id estável (16-05). O descanso **nunca auto-avança**
(D-09/D-10 da Fase 15). `TextField` na Live Activity é impossível na plataforma —
o stepper é o caminho, não um fallback (REQUIREMENTS §Out of Scope).

**Fora desta fase:** som/vibração no fim do descanso e modo mãos-livres
(deferidos para pós-v1.3 por decisão do dono em 15/08); Dynamic Island
compact/minimal/expanded (deferida em 17/08 por ausência de hardware); widget de
tela de início (WidgetKit); qualquer mudança de schema no banco.

</domain>

<decisions>
## Implementation Decisions

### Pré-preenchimento: de onde vem o número

- **D-01:** A fonte das reps é **híbrida**: últimas reps reais do exercício
  quando existem, alvo do plano (`targetRepsMin`) na estreia. Cumpre o critério 1
  do ROADMAP sem deixar buraco na primeira vez que o exercício aparece.
  Exige criar um mapa `lastRepsByExercise` — hoje **não existe nada de histórico
  de reps** no repositório (zero ocorrências de `lastReps`); só carga tem
  (`lastLoadByExercise`, `sessionModel.ts:148`).
  — **Reversibility:** costly — o mapa entra em `SessionDraft`, que é serializado
  em `sessionDraftStorage.ts` e persistido no aparelho; rascunhos já gravados
  precisam tolerar o campo ausente na leitura, e desfazer exige o mesmo cuidado
  na direção contrária.

- **D-02:** O histórico guarda **um número por exercício** — o mais recente por
  `completed_at` —, espelhando exatamente o formato e a chave (`exerciseIdentity`)
  que `lastLoadByExercise` já usa (`activeSessionStore.ts:427-502`). Reps e carga
  passam a vir do mesmo lugar, com a mesma semeadura e o mesmo envelhecimento.
  Descartado: mapa por ordem de série (formato divergente do de carga e buraco
  quando o número de séries muda entre semanas).

- **D-03:** O valor herdado nasce **marcado visualmente** (tratamento distinto do
  valor digitado, no espírito da linha "Última carga" que já existe em
  `SessionPlayer.tsx:642`) e **vira firme no primeiro `+/−`**. A marca é só
  apresentação: nada muda no banco, nenhuma coluna nova, nenhuma migration.
  Existe para não deixar 1 toque virar registro por inércia — a restrição
  "nada de dado inventado na UI" do `PROJECT.md` vale aqui.

- **D-04:** Na **estreia de um exercício com carga** — sem histórico e sem
  `target_load_kg`, caso em que `suggestLoad()` devolve `null`
  (`sessionModel.ts:222`) — o campo fica vazio e o **teclado numérico abre por
  conta própria**. Honra "nada inventado", evita os 24 toques de stepper para
  chegar a 60 kg com passo 2,5, e mantém o teclado fora do fluxo padrão, que é o
  que REG-01 exige.

### O teclado no app

- **D-05:** No fluxo padrão o número **deixa de ser editável**: vira texto entre
  os botões `−/+`. O teclado só aparece por gesto deliberado e no caso da D-04.
  Vale igualmente no PWA web, que herda o componente RN.
  — **Reversibility:** costly — `SessionPlayer.tsx` é o mesmo componente nos dois
  canais, e `sessionPlayerLayout.ts:10` documenta que `TextInput` vira `<input>`
  no web com regra de largura própria; trocar o elemento mexe no layout do PWA de
  produção, não só do nativo.

- **D-06:** Em exercício `carga_reps`, o botão **"Iniciar série" some quando o
  pré-preenchimento já passa em `canCompleteSet()`** — o card nasce com os campos
  revelados e o único toque é "Concluir série". Quando falta informar (estreia da
  D-04), o caminho de dois toques volta. Exercício por tempo/distância **não
  muda**: ali "Iniciar série" tem semântica real (carimba `activatedAt`, inicia a
  medição).
  — **Reversibility:** costly — inverte o ciclo `activateSet` no caminho quente e
  a Fase 15 já registrou que `active` é estado de UI puramente local que não
  sobrevive à retomada (`liveActivityContentState.ts:80`); desfazer exige remexer
  na mesma transição de série e revalidar o UAT no aparelho.

- **D-07:** O **RIR opcional** ("Quantas ainda aguentaria?", 5 chips,
  `SessionPlayer.tsx:745`) **fica onde está**. É desvio voluntário: 1 toque
  continua sendo 1 toque. Consequência aceita: o card da série ativa fica mais
  alto com dois steppers.

- **D-08:** Dentro da mesma sessão, a série seguinte **reusa `suggestLoad()`**
  para carga — precedência inalterada: adaptação intra-sessão > alvo do plano >
  histórico. Reps seguem o **mesmo desenho**: alvo da série (que a adaptação pode
  ter reescrito) antes do histórico. A Fase 17 **não cria regra concorrente** com
  o motor de adaptação, que já reescreve `targetLoadKg`/reps da próxima série
  (`intraSessionAdaptation.ts:426`).

### Registro pela tela bloqueada (REG-02)

- **D-09:** A tela bloqueada ajusta **reps e carga**, dois pares de `−/+` mais o
  botão de concluir — fiel à letra de REG-02. Consequência aceita: o card do Lock
  Screen fica denso e os alvos de toque encolhem; a legibilidade de longe e o
  tamanho dos botões são critério de aprovação no UAT físico, não detalhe.

- **D-10:** **A store acumula, por delta.** Cada toque manda um incremento
  (`+1 passo`) e a store aplica sobre o valor corrente — o molde do
  `AdjustRestIntent(deltaSeconds:)` já validado no aparelho na Fase 16. O widget
  nunca guarda valor nem manda absoluto: a Live Activity segue espelho puro, e o
  ack condicionado (16-07) mais a dedup por id estável (16-05) já cobrem replay e
  cold-launch.

- **D-11:** O card mostra **o valor em edição, com a mesma marca de herdado da
  D-03** — leitura idêntica no app e na tela bloqueada. O que você confirma pela
  tela bloqueada é exatamente o que veria no app.
  — **Reversibility:** costly — o `ContentState` ganha campos de valor em edição
  e o sinalizador de origem, e `SessionActivityAttributes.swift` é **duplicado**
  entre `targets/session-widget/` e `modules/live-activity/ios/`: as duas cópias
  precisam continuar idênticas, e mexer no contrato depois exige encerrar e
  recriar Activities vivas.

- **D-12:** Valor fora do passo (37,5 kg com passo 5): um **botão explícito
  "abrir para ajustar"** no card (`openAppWhenRun`), **sempre disponível** — não
  só no caso atípico. Os `−/+` continuam **preservando o offset**, que é o que
  `stepLoad()` já faz hoje (`sessionModel.ts:247`: 37,5 + 5 = 42,5).
  **Nota de divergência levantada na discussão:** o critério 3 do ROADMAP fala em
  "abre o app em vez de travar ou truncar", mas o stepper do app **nunca travou
  nem truncou**. Esta decisão cumpre o critério sem introduzir na tela bloqueada
  uma restrição que o app não tem. Não implementar snapping a múltiplos do passo.

### Antecipação da próxima ação (PRED-01)

- **D-13:** A linha "A seguir" aparece **durante o descanso inteiro**, publicada
  no mesmo `Activity.update()` que já acontece ao concluir a série. Não depende
  de update agendado nem do app acordar no meio do descanso — restrição real: o
  widget não re-renderiza sozinho no meio do intervalo, e trocar layout num
  instante específico exigiria um update com o app possivelmente suspenso.

- **D-14:** O conteúdo é **exercício, série X/Y e o valor que vai nascer
  pré-preenchido** (mesmo `suggestLoad()` da D-08) — o número que será confirmado
  em 1 toque, não o do papel. Quando diverge da prescrição é porque histórico ou
  adaptação entraram, e é justamente aí que o valor real importa.

- **D-15:** **Rótulo único** ("A SEGUIR") em todos os casos, com **destaque na
  virada de exercício** — a única transição que muda o que o dono faz fisicamente
  (levantar, trocar de aparelho, montar a carga). Sem ramos condicionais por
  "última série" ou "fim do treino".

- **D-16:** Dentro de bloco de cardio/alongamento o card **segue reduzido**, como
  a D-03 da Fase 15 mandou — sem linha "A seguir". Mas a **virada de musculação
  para o bloco é anunciada** ("A seguir: Alongamento"). A D-03 da Fase 15 fala do
  conteúdo DENTRO do bloco; anunciar a entrada nele não a contradiz.

### Claude's Discretion

- Layout exato do card da tela bloqueada com os dois pares de `−/+` — dentro do
  que a Fase 15 já estabeleceu (D-01: descansando, o timer é o elemento grande).
- Gesto exato do escape para o teclado da D-05 (long-press no número × botão
  visível "digitar"). **Ressalva:** long-press é frágil no PWA web — se o gesto
  não for confiável nos dois canais, o botão visível é o caminho.
- Passo do stepper de reps. `REQUIREMENTS.md` sugere ±1; carga já tem
  `load_increment_kg` por exercício (default 2,5, `sessionModel.ts:441`) e não
  precisa de nada novo.
- Como a marca de "herdado" da D-03/D-11 é renderizada (opacidade, ícone, cor) no
  app e no widget — desde que a mesma leitura sirva nos dois.
- Estrutura dos arquivos Swift novos (`AdjustRepsIntent` / `AdjustLoadIntent`)
  seguindo o molde já existente do `AdjustRestIntent(deltaSeconds:)`, com o par
  stub-na-extensão + implementação-no-app que a Fase 16 estabeleceu.
- Comportamento em exercício de peso corporal (`isBodyweight`): não há carga a
  ajustar; o caminho natural é só o stepper de reps, como a tela já faz hoje ao
  mostrar "Peso corporal" no lugar do campo.
- O que o card mostra entre o toque e a store responder. **Restrição:** Live
  Activity é render sem estado local — feedback otimista dentro do widget não é
  opção real; o número só muda quando a store publicar.
- Formato e número das sessões físicas com o iPhone. Herda a **D-13 da Fase 15**:
  roteiro auto-contido (comandos copiáveis + "o que você deve ver" + critério
  PASS/FAIL) e **parada da execução em checkpoint** até o dono reportar.
  "Compilou" nunca é critério de conclusão (D-14 da Fase 15, D-10 da Fase 14).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato do milestone
- `.planning/REQUIREMENTS.md` — REG-01, REG-02 e PRED-01 no texto integral, e a
  seção **Out of Scope**, que veta `TextField` na Live Activity, push/APNs,
  atualização remota da Activity e ações pesadas nos botões da tela bloqueada
  (`perform()` grava intenção local; processamento pesado é do app).
- `.planning/ROADMAP.md` §"Phase 17: Tela bloqueada — registrar e antecipar" —
  goal e os 4 success criteria; **3 dos 4 são UAT físico do dono**.
- `.planning/PROJECT.md` — restrição "nada de dado inventado na UI: sem amostra é
  '—', nunca '0'", que a D-03 e a D-04 atendem.

### Arquitetura herdada (não re-litigar)
- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` — App Group
  **funciona** em time Apple pessoal gratuito, PASS no iPhone 13 físico.
  `group.com.pmarconato.forcaapp.shared` está congelado. Não desenhar fallback.
- `.planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-CONTEXT.md` — D-01
  (layout troca com o estado; descansando o timer é o elemento grande), D-03 (card
  reduzido em cardio/alongamento — base da D-16 desta fase), D-04 (estado "Pronto"
  com overtime), D-09/D-10 (descanso nunca auto-avança), D-12 (aviso discreto uma
  única vez quando a Activity não sobe), D-13/D-14 (formato das sessões físicas).
  Registra também a restrição que originou esta fase: *"a Fase 17 (REG-02) precisa
  de reps e carga como números, não como texto renderizado"*.
- `.planning/phases/16-tela-bloqueada-comandar/16-RESEARCH.md` — Pattern 1:
  `perform()` de `LiveActivityIntent` sempre roteia para o processo do app quando
  o intent existe nos dois targets (fonte Apple DTS).
- `.planning/phases/16-tela-bloqueada-comandar/16-VERIFICATION.md` e
  `16-11-SUMMARY.md` — gaps, defeitos D1/D2/D3 e as causas-raiz; por que o ack é
  condicionado ao resultado real de `completeSet()` e o peek da fila é
  não-destrutivo.
- `.planning/phases/16-tela-bloqueada-comandar/16-UAT.md` — o que o UAT físico da
  Fase 16 cobriu e o que **não** cobriu (o caminho de exercício `tempo`/
  `tempo_distancia` não tem UAT físico; a confirmação individual de UI foi só do
  stepper de carga).

### Pesquisa v1.3 (decisões já arbitradas)
- `.planning/research/ARCHITECTURE.md` — `src/native/liveActivitySync.ts` como
  **único escritor** para ActivityKit; nenhum componente React fala com
  ActivityKit direto.
- `.planning/research/PITFALLS.md` — pitfall 1 (`prebuild --clean` apaga target
  editado à mão em `ios/`) e pitfall 4 (`aps-environment` vazando quebra a
  assinatura em time gratuito) continuam valendo.
- `.planning/research/STACK.md` — versões pinadas para SDK 54.

### Código que esta fase toca
- `src/engine/sessionModel.ts` — `suggestLoad()` (:222), `stepLoad()` (:244),
  `canCompleteSet()` (:257), `SessionDraft.lastLoadByExercise` (:148),
  `loadIncrementKg` (:122, :441).
- `src/engine/intraSessionAdaptation.ts:426` — `applyAdjustmentToNextSet()`
  reescreve `targetLoadKg`/reps da próxima série. **A D-08 depende disto.**
- `src/engine/liveActivityContentState.ts` — o builder do `ContentState`; é aqui
  que os campos da D-11 entram.
- `targets/session-widget/SessionActivityAttributes.swift` **e**
  `modules/live-activity/ios/SessionActivityAttributes.swift` — as **duas cópias**
  do contrato, que precisam continuar idênticas.
- `.planning/codebase/STACK.md` — Expo SDK 54 / RN 0.81.5, `EXPO_PUBLIC_*`
  inlined no bundle, patch-package no postinstall.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **O stepper de carga já existe e funciona.** `stepLoad()`
  (`sessionModel.ts:244`) parte do valor atual (ou da sugestão, ou 0), soma o
  incremento do exercício e nunca desce abaixo de 0, arredondando a 2 casas. A
  ação da store (`activeSessionStore.ts:1258`) já persiste a cada toque via
  `saveDraft` fire-and-forget. **Nada disto precisa ser reescrito** — a fase
  estende, não substitui.
- **O passo de anilha por exercício já existe:** `load_increment_kg` no banco →
  `loadIncrementKg` no draft, default 2,5 (`sessionModel.ts:441` e `:522`).
- **O histórico de carga já existe:** `lastLoadByExercise`, semeado por
  `completed_at DESC` e completado pelo log aberto sem sobrescrever o seed
  (`activeSessionStore.ts:427-502`). É o molde exato para o `lastRepsByExercise`
  da D-01.
- **`AdjustRestIntent(deltaSeconds:)`** — intent com `@Parameter`, com o par
  stub-na-extensão (`targets/session-widget/`) + implementação-no-app
  (`modules/live-activity/ios/`). É o molde direto para os intents de reps/carga.
- **`liveActivityIntentBridge.ts`** — despacho único evento→ação, sem lógica de
  domínio: cada `case` resolve a série alvo e chama a ação já existente da store.
  Os casos novos entram aqui, no mesmo formato.

### Established Patterns
- **A Live Activity é espelho, nunca fonte de verdade.** Todo caminho de escrita
  passa pelo mesmo `completeSet()`/`setReps()`/`setLoad()`/`stepLoad()` da store.
  Nenhuma ação nova deve gravar direto no widget nem inventar caminho paralelo.
- **`ios/` é gerado (CNG).** Todo artefato nativo persistente vive em `targets/`,
  `modules/` e config plugins. Editar `ios/` à mão é perda garantida no próximo
  `prebuild`; `scripts/verify-native-skeleton.sh` guarda isso.
- **Toda mutação de série persiste o rascunho.** Desde a 16-10, nenhuma das sete
  ações que mudam `draft.exercises[].sets[]` fica só em memória — o force-quit não
  pode descartar reps/carga e reprovar `canCompleteSet()` na retomada. Qualquer
  ação nova desta fase segue a mesma regra.
- **`active` é estado de UI puramente local** e não é restaurado ao reconstruir o
  rascunho do servidor (`liveActivityContentState.ts:80`). A D-06 mexe exatamente
  nessa transição — cuidado com a retomada.
- **Verificação é local** (`tsc` + `jest` + `pytest`). Live Activity e App Intents
  **não são testáveis em simulador**: a prova é UAT do dono no aparelho físico.

### Integration Points
- `src/engine/sessionModel.ts` — `lastRepsByExercise` no `SessionDraft` (D-01) e a
  função de sugestão de reps espelhando `suggestLoad()` (D-08).
- `src/store/activeSessionStore.ts` — semeadura do histórico de reps no mesmo
  ponto do de carga; ação `stepReps()` espelhando `stepLoad()`; atualização do
  mapa em `completeSet()` (:1474-1492).
- `src/components/session/SessionPlayer.tsx` — campo não editável + steppers
  (D-05), botão "Iniciar série" condicional (D-06), marca visual do herdado
  (D-03), abertura do teclado na estreia (D-04). **É o mesmo componente do PWA
  web** — toda mudança aqui vale nos dois canais.
- `src/engine/liveActivityContentState.ts` + as duas cópias de
  `SessionActivityAttributes.swift` — campos de valor em edição, sinalizador de
  origem (D-11) e o bloco de antecipação (D-13 a D-16).
- `targets/session-widget/WidgetLiveActivity.swift` — os dois pares de `−/+`, o
  botão "abrir para ajustar" (D-12) e a linha "A seguir".
- `src/native/liveActivityIntentBridge.ts` — os casos novos de ajuste por delta.
- PWA de produção e backend no VPS **não são tocados** por código novo, mas o PWA
  **herda** as mudanças de `SessionPlayer.tsx` — isso é raio de alcance, não
  escopo novo, e precisa de conferência antes do fechamento.

</code_context>

<specifics>
## Specific Ideas

- A marca do valor herdado deve ser reconhecível **de relance, com o aparelho
  apoiado no banco** — a mesma situação de uso que já motivou a linha "Última
  carga" no card (`SessionPlayer.tsx:642`).
- Na tela bloqueada, o destaque da **virada de exercício** existe porque é a única
  antecipação que muda o que o dono faz fisicamente. "Próxima série do mesmo
  exercício" é confirmação; "próximo exercício" é ação.
- Os botões da tela bloqueada são operados com **dedo suado, sem olhar direito**.
  Tamanho de alvo de toque é critério de aprovação no UAT, não polimento.

</specifics>

<deferred>
## Deferred Ideas

- **Carimbar no banco a origem do valor (herdado × ajustado)** — seria o registro
  mais fiel de todos e serviria ao replanejamento, mas exige migration e o
  `STATE.md` registra que o v1.3 não deveria mexer em schema. Cabe numa fase
  posterior, se a distinção provar valor no uso real.
- **Migrar o RIR para o card de descanso** — liberaria altura no card da série
  ativa justo onde os steppers crescem, e o descanso é tempo ocioso. Descartado
  aqui pelo raio de alcance; volta se o card ficar apertado no uso real.
- **Antecipação completa dentro do bloco de cardio/alongamento** (próximo
  alongamento e tempo previsto) — seria útil para a condução do alongamento, que é
  o próprio REQ-03 do v1.0, mas reverteria em parte a D-03 da Fase 15 e mudaria o
  contrato do `ContentState` no caso `blockOnly`.
- **Rótulos distintos por caso** na antecipação ("PRÓXIMA SÉRIE", "PRÓXIMO
  EXERCÍCIO", "ÚLTIMA SÉRIE", "FIM DO TREINO") — mais informativo, mas quatro
  ramos a provar no aparelho.
- **Prescrição do cardio na tela bloqueada** — segue excluída pela D-03 da Fase 15.
- **Som/vibração no fim do descanso** e **modo mãos-livres** — deferidos para
  pós-v1.3 por decisão do dono em 15/08.
- **Dynamic Island compact/minimal/expanded** — implementação preservada, UAT
  física deferida por ausência de hardware compatível (17/08).

### Reviewed Todos (not folded)
Os 4 todos que o matcher apontou casaram por palavra genérica (score 0.6, área
`general`). Nenhum foi dobrado — decisão do dono nesta discussão:

- `backend-objetivos-string-500` — 500 na geração de plano pelo caminho legacy;
  é backend de geração, outro domínio.
- `backend-supabase-producao-no-aparelho` — já foi dobrado na Fase 15.
- `dynamic-island-future-device` — feature futura explícita, sem hardware.
- `force-quit-reconciliacao-pass-b` — investigação aberta na 16-03; passou na
  re-execução física após o fix `54de3ef`. Toca o mesmo caminho de intents que
  esta fase estende, mas não é trabalho da Fase 17.

</deferred>

---

*Phase: 17-Tela bloqueada — registrar e antecipar*
*Context gathered: 2026-08-18*
