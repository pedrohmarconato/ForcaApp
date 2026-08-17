---
status: resolved
trigger: "nao tem nada mas o treino desapareceu e eu nao posso ativar o treino"
created: 2026-08-17
updated: 2026-08-17T17:30:00-03:00
---

# Live Activity ausente e sessão desaparecida

## Symptoms

- expected: Ao iniciar ou retomar uma sessão ativa, o card deve aparecer na tela bloqueada; a sessão deve permanecer ativa ou permitir nova ativação.
- actual: A sessão foi retomada no app após relançamento, mas nenhum card apareceu. Em seguida, o treino desapareceu e não pode ser ativado novamente.
- errors: Nenhum banner D-12 e nenhum erro de ActivityKit no console capturado por `devicectl`.
- timeline: Primeiro UAT físico do Plano 15-05, após conclusão dos Planos 15-01 a 15-04.
- reproduction: Abrir `UAT Sessão 1`, iniciar a sessão, registrar uma série, bloquear o iPhone; depois relançar o app com a sessão ainda ativa.

## Current Focus

- hypothesis: CONFIRMADA e aplicada — Home pending-only restaurado; aba Plano usa `getResumableSessionForActivePlan()` (consulta única, escopada por plano ativo/usuário) para retomar in_progress.
- test: RED→GREEN completo em `__tests__/trainingRepository.test.ts` (Home pending-only, visibilidade Plan-only, in_progress antiga/stale vence sobre pending mais recente, propagação de erro, resolução em consulta única) + testes de tela atualizados.
- expecting: `getTodaySession()` nunca devolve in_progress (contrato Home); `getResumableSessionForActivePlan()` prioriza in_progress sobre pending numa única consulta; `TrainingSessionScreen` preserva fluxo/rótulos.
- next_action: NENHUMA — UAT física confirmou os dois sintomas corrigidos (checkpoint human-verify de 2026-08-17T17:30:00-03:00); sessão encerrada como resolved. Achados de descanso/overtime, Alongamento sem prescrição, input de reps na Lock Screen e Dynamic Island são fora de escopo (respectivamente: subsistema não investigado aqui; Fase 17/16; bloqueio de hardware do Plano 15-05/Fase 15) e NÃO reabrem esta sessão.
- reasoning_checkpoint_symptomA: |
    hypothesis: "buildLiveActivityContentState() retorna null sempre que não há série com status 'active' localmente E não há descanso em curso — porque o fallback final é `return active ? contentStateFor(...) : null`, exigindo status 'active' local em vez de usar `current` (active ?? next). O status 'active' é um estado de UI puramente local (setado só por activateSet()); NUNCA é restaurado ao reconstruir o rascunho a partir do servidor (applyServerSetLogs só promove sets com setLog do servidor para 'done'; séries sem log ficam como buildDraftFromDetail as criou, ou seja 'pending'). Logo: (1) numa sessão NOVA a série 1 nasce 'pending' → publishStart no confirmCheckIn já cai em null; (2) em qualquer RETOMADA (reconstrução do servidor em startOrResume) a série em andamento perde o status 'active' e volta a 'pending' → publishStart cai em null de novo. Como publishStart faz `if (!contentState) return;` SEM chamar recordStartFailure, nenhum banner D-12 aparece (bate com a evidência 'nenhum erro/banner capturado'). E como toda mudança de draft SEGUINTE (com status já 'active') dispara publishUpdate → updateActivity, que no Swift faz `guard let activity = currentActivity else { return false }' e NUNCA cria uma Activity nova, o card fica ausente para o resto da sessão — bate com 'em seguida o treino [card] desapareceu e não pode ser ativado novamente'."
    confirming_evidence:
      - "liveActivityContentState.ts linhas 76-83: fallback final é `return active ? contentStateFor('measuring', active.exercise, active.set, null) : null;` — usa `active`, não `current`."
      - "activeSessionStore.ts applyServerSetLogs (linhas 329-442): para uma série SEM setLog do servidor, `return s` (linha 354) — nunca reatribui 'active'; a série fica como veio de buildDraftFromDetail (sempre 'pending' para série não iniciada)."
      - "__tests__/liveActivityContentState.test.ts linha 65-67 já documentava esse retorno null como comportamento ATUAL para um draft com só uma série 'pending' — exatamente o shape de uma sessão nova ou de uma retomada sem série marcada active."
      - "LiveActivityModule.swift updateActivity (linha 69-73): `guard let activity = currentActivity else { return false }` — não há fallback para criar a Activity que o publishStart perdeu; publishUpdate nunca chama startActivity."
      - "publishStart em liveActivitySync.ts linha 53-56: `if (!contentState) return;` antes de qualquer chamada a startLiveActivity/recordStartFailure — confirma por que não há banner nem erro no console (evidência do usuário)."
    falsification_test: "Se o card aparecesse normalmente ao criar uma sessão nova (primeira série 'pending', sem activateSet ainda) OU se publishUpdate conseguisse iniciar uma Activity quando currentActivity é nil no nativo, a hipótese estaria errada. Nenhum dos dois é o caso pelo código lido."
    fix_rationale: "Trocar o fallback para usar `current` (= active ?? next) em vez de exigir `active` resolve a causa raiz: o widget 'measuring' já exibe apenas exerciseName/setIndex/setTotal/targetReps/targetLoad (WidgetLiveActivity.swift linhas 76-83, 118-125) — nenhum desses campos depende de o set estar revelado para digitação; é seguro reaproveitar a mesma fase para 'próxima série, ainda não tocada'. Isso NÃO é tratar sintoma: elimina a condição estrutural (active-vs-pending é estado de UI, não deveria gatear se o card existe)."
    blind_spots: "Não testei em dispositivo físico (sem simulador ActivityKit disponível neste ambiente) — a verificação é por teste unitário/typecheck, não por card real na tela bloqueada. Não investiguei se há today um caminho separado onde o usuário realmente via o card ANTES da Fase 15 (ex.: regressão introduzida recentemente) — não há evidência de quando o bug foi introduzido, só que está presente no código atual."
    candidate_causes:
      - "code: buildLiveActivityContentState() usa `active` em vez de `current` no fallback (categoria: código)"
      - "code: publishUpdate/updateActivity não tem fallback para criar Activity quando currentActivity é nil (categoria: código, agravante que impede recuperação — mas não é a causa raiz isolada)"
    and_gate: "PARCIAL — a causa acima explica somente o sintoma A (card/Live Activity ausente). Não existe evidência de que explique o sintoma B (o treino real deixou de aparecer no app e não aceita nova ativação). A sessão não pode ser resolvida enquanto o sintoma B não tiver causa própria ou evidência que o elimine."
- tdd_checkpoint: red_green_complete_for_symptom_A_only
- reasoning_checkpoint_symptomB: |
    hypothesis: "getTodaySession() (src/services/trainingRepository.ts) filtra .eq('status','pending') sem ramo para 'in_progress'. HomeScreen.tsx (card 'Treino de hoje') e TrainingSessionScreen.tsx (aba Plano, 'sessão da vez') chamam a MESMA getTodaySession. Assim que start_session RPC marca planned_sessions.status='in_progress' (migration 0011, linha ~68), a sessão para de bater em QUALQUER das duas consultas — ela literalmente some de todo o app. Não há persistência de estado de navegação (grep não encontrou linking/persistNavigationState/getInitialState) nem deep link automático para ActiveSessionScreen, então relançar o app (ou só sair e voltar à Home/Plano) não tem NENHUM caminho de volta para a sessão iniciada — o card vira 'Nenhum treino pendente' e não há botão para reativar. Isso é uma REGRESSÃO, não design: commit ed261f5 (17/07) implementava getTodaySession com prioridade explícita a in_progress (comentário original: 'treino de hoje (in_progress → próxima pendente)'); commit 8cfe861 (01/08, mensagem 'Home ignora in_progress/completed/skipped') removeu esse ramo, com o comentário dizendo que a retomada seguiria 'explícita (via Plano ou URL tipada)' — mas TrainingSessionScreen.tsx NÃO foi tocado nesse commit e continua chamando getTodaySession sem alternativa, então a promessa do próprio commit nunca foi cumprida: nenhuma tela shipped ficou com caminho de retomada."
    confirming_evidence:
      - "src/services/trainingRepository.ts linhas 109-126 (getTodaySession): único filtro é .eq('status','pending'); sem ramo para 'in_progress'."
      - "src/screens/HomeScreen.tsx linha 98: `getTodaySession(user.id)` alimenta o card 'Treino de hoje'; linha 256-334: sem sessão retornada, mostra EmptyState 'Nenhum treino pendente' sem CTA."
      - "src/screens/TrainingSessionScreen.tsx linha 153: `const proxima = await getTodaySession(user.id);` — a MESMA função alimenta a 'sessão da vez' da aba Plano; linhas 87-88 e 312 já tratam status 'in_progress' ('Em andamento') mas esse ramo fica morto porque getTodaySession nunca devolve uma linha in_progress."
      - "supabase/migrations/0011_checkin_pre_treino.sql linhas 67-70: `update planned_sessions set status = 'in_progress' where id = p_planned_session_id` dentro de start_session — confirma que o status muda de fato no servidor ao iniciar."
      - "git show ed261f5 -- src/services/trainingRepository.ts: getTodaySession original consultava .eq('status','in_progress').limit(1) PRIMEIRO, com fallback para 'pending' — comportamento que resolveria o sintoma."
      - "git show 8cfe861 -- src/services/trainingRepository.ts: remove o ramo in_progress; comentário novo diz explicitamente que a retomada seria 'via Plano ou URL tipada, nunca um redirecionamento global' — mas TrainingSessionScreen.tsx não está entre os arquivos alterados nesse commit (`git show 8cfe861 --stat`), logo o caminho 'via Plano' prometido nunca existiu de fato."
      - "grep em src/navigation/*.tsx e App.tsx: nenhum linking/persistNavigationState/getInitialState — confirma que não há restauração automática de rota nem deep link implícito para ActiveSessionScreen no relançamento."
      - "__tests__/trainingRepository.test.ts linha 109-110: comentário 'in_progress/completed/skipped ficam FORA da seleção automática da Home' documenta o estado ATUAL (quebrado) como se fosse intencional — sem mencionar que a mesma função também é usada pela aba Plano, onde a retomada deveria continuar possível."
    falsification_test: "Se TrainingSessionScreen (aba Plano) usasse uma consulta DIFERENTE de getTodaySession para achar sua 'sessão da vez' — uma que incluísse in_progress — a hipótese estaria errada (o caminho de retomada explícito prometido pelo commit 8cfe861 existiria de fato). Não é o caso: grep confirma que ambas as telas chamam literalmente a mesma função exportada."
    fix_rationale: "Restaurar em getTodaySession a prioridade a status='in_progress' (fallback para 'pending'), escopada pelo plano ativo — essencialmente reverter a regressão do commit 8cfe861 — resolve a causa raiz para AMBAS as telas com uma única mudança em um único ponto de leitura compartilhado, em vez de tratar sintoma por sintoma (ex.: só arrumar a Home, ou só a aba Plano). Não introduz redirecionamento automático de tela nem navegação — apenas garante que a sessão em andamento volte a ser ENCONTRADA pela consulta que já alimenta o card/CTA existente em cada tela; a decisão de UI (mostrar 'Começar' vs 'Continuar') já existe no código consumidor (TrainingSessionScreen linha 88, 312) e ficará finalmente alcançável."
    blind_spots: "Não testei em dispositivo físico — a verificação nesta sessão é por teste unitário (mock do supabase-js). Não investiguei se HomeScreen deveria continuar oferecendo 'Começar' (que já cai em startOrResume, capaz de retomar) mesmo para uma sessão in_progress, ou se precisaria de rótulo/CTA distinto ('Continuar') — o fix restaura a VISIBILIDADE da sessão; ajuste fino de copy/CTA na Home não foi escopo desta investigação e não bloqueia a correção do sintoma relatado (o treino reaparece e é reativável)."
    candidate_causes:
      - "code: getTodaySession() sem ramo para status='in_progress' (categoria: código, regressão introduzida no commit 8cfe861)"
    and_gate: "NÃO — causa única e suficiente: uma consulta compartilhada por duas telas, sem ramo para in_progress, explica sozinha por que a sessão desaparece de todo o app assim que é iniciada e por que não há caminho de reativação. Não depende de nenhuma outra condição simultânea (diferente do sintoma A, que tinha um agravante em Swift). Sintoma A e sintoma B têm causas raiz INDEPENDENTES em subsistemas diferentes (gate de estado de UI no motor de Live Activity vs. filtro de consulta SQL no repositório de treino) — confirma o achado PARCIAL anterior: eram dois bugs, não um."

## Evidence

- timestamp: 2026-08-17T14:40:00-03:00
  observation: O bundle Release contém `LiveActivityModule`, as URLs LAN e `session-widget.appex`.
- timestamp: 2026-08-17T14:43:00-03:00
  observation: O relançamento retomou a sessão ativa no app, mas não criou card na tela bloqueada.
- timestamp: 2026-08-17T14:44:00-03:00
  observation: Não houve banner de indisponibilidade nem erro relevante no stdout/stderr capturado.
- timestamp: 2026-08-17T15:00:00-03:00
  observation: O CLI informou que `gsd-debugger` é subagente e não pode ser selecionado como agente primário; a tentativa não iniciou a investigação.
- timestamp: 2026-08-17T15:02:00-03:00
  observation: Um agente primário de despacho com `--model sonnet` também falhou antes de executar ferramentas, indicando possível incompatibilidade do alias no CLI externo.
- timestamp: 2026-08-17T15:05:00-03:00
  observation: `github-copilot/claude-sonnet-5` foi reconhecido, mas a autenticação falhou com “Personal Access Tokens are not supported for this endpoint”.
- timestamp: 2026-08-17T15:32:00-03:00
  observation: O primeiro ciclo corrigiu e testou o gate `active`→`current` da Live Activity, mas não demonstrou por que o treino real desapareceu ou ficou impossível de ativar; a investigação segue aberta para o segundo sintoma.
- timestamp: 2026-08-17T15:35:00-03:00
  observation: A continuação por OpenRouter não iniciou: o provedor aceitou no máximo 31.363 tokens de saída frente aos 32.000 solicitados; o arquivo de debug permaneceu inalterado.
- timestamp: 2026-08-17T15:38:00-03:00
  observation: A tentativa OpenRouter com limite efêmero de 30.000 tokens também não iniciou por saldo insuficiente; é necessário outro transporte autenticado para Sonnet 5.
- timestamp: 2026-08-17T15:45:00-03:00
  observation: Sessão retomada em Claude Code (Sonnet). `git status`/`git diff` confirmam que o fix descrito em Resolution já está aplicado no working tree (src/engine/liveActivityContentState.ts + 2 arquivos de teste, ainda não commitados) e o diff bate literalmente com a descrição da causa raiz e da correção. Re-execução da suíte de testes foi bloqueada por gate de aprovação do ambiente (Bash requer aprovação manual para `npx jest`), então a verificação por execução de teste NESTA sessão não foi refeita — reaproveitada a evidência RED→GREEN já registrada em Resolution.verification da sessão anterior.
- timestamp: 2026-08-17T16:20:00-03:00
  observation: Investigação independente do sintoma B. Rastreado `startOrResume`/`activeSessionStore.ts` (nenhum problema encontrado no store nem na persistência local — AsyncStorage/sessionDraftStorage corretos) e `sessionExecutionRepository.ts` (RPCs corretas). O console do iPhone físico (`/private/tmp/forcaapp-device-console.log`) mostra `App terminated due to signal 9` ~3min após o lançamento — confirma que o app foi morto pelo iOS durante a reprodução, mas isso por si só é comportamento normal de app em segundo plano/bloqueado e não é a causa (a persistência via AsyncStorage é síncrona por chave e o rascunho é reconciliado com o servidor no relançamento). A causa real foi encontrada em `HomeScreen.tsx`: `getTodaySession(user.id)` alimenta o card "Treino de hoje", e a MESMA função alimenta a "sessão da vez" de `TrainingSessionScreen.tsx` (aba Plano). `getTodaySession()` só filtrava `status='pending'`. `git log -p -S"emAndamento"` revelou que o commit `ed261f5` (17/07) tinha a função consultando `in_progress` PRIMEIRO, e o commit `8cfe861` (01/08, "Home ignora in_progress/completed/skipped") removeu esse ramo — mas `TrainingSessionScreen.tsx` não foi alterado nesse commit e continuou dependendo da mesma função, então a retomada "via Plano" prometida pelo commit nunca existiu de fato. Sem persistência de estado de navegação (`grep` não encontrou linking/getInitialState), o app sempre relança na Home — e a sessão iniciada, agora `in_progress`, deixa de bater em qualquer consulta usada por qualquer tela. Fix aplicado: `getTodaySession()` volta a priorizar `in_progress` com fallback para `pending`, restaurando o comportamento original. Testes atualizados/adicionados em `__tests__/trainingRepository.test.ts` (16 testes) e suíte completa (165 suites / 1854 testes) + `tsc --noEmit` verificados, todos PASS.
- timestamp: 2026-08-17T17:15:00-03:00
  observation: Verificação literal adicional `git diff --check` concluída com exit 0 e sem saída; nenhuma falha de whitespace no diff.
- timestamp: 2026-08-17T17:30:00-03:00
  observation: |
    UAT FÍSICA CONFIRMADA pelo dono (checkpoint human-verify), no iPhone 13
    (iPhone14,5) após instalar o build Release corrigido:
    - Sintoma B (treino desaparecido/sem reativação): Home escondeu a sessão
      in_progress (contrato pending-only preservado); a aba Plano mostrou a
      MESMA sessão in_progress e seu CTA retomou-a com sucesso. CONFIRMA fix.
    - Sintoma A (Live Activity ausente): o card na tela bloqueada apareceu
      após a retomada. CONFIRMA fix.
    - Achados FORA do escopo desta sessão de debug (não são falha dos fixes
      aplicados aqui, não geram novo trabalho nesta sessão):
      - Sem apertar "Skip Rest", o card de descanso chegou a zero, mudou para
        "Pronto", contou overtime crescente e não avançou automaticamente —
        comportamento do timer de descanso, subsistema diferente do que foi
        investigado (Sintomas A e B), sem evidência de relação com
        `buildLiveActivityContentState()` nem com `getTodaySession()` /
        `getResumableSessionForActivePlan()`.
      - O aparente auto-avanço observado antes era, na verdade, "Skip Rest"
        manual — não mutação automática. Esclarecimento, não um bug novo.
      - Alongamento mostrou nome/posição do bloco sem prescrição — tela e
        dado diferentes dos que os fixes desta sessão tocaram.
      - Input de reps/carga na Lock Screen está fora do escopo do Plano
        15-05/Fase 15 (é trabalho de Fase 17 — input; Fase 16 — botões).
      - Dynamic Island (compact/expanded/minimal) NÃO PODE ser testada: o
        iPhone 13 (iPhone14,5) não tem hardware de Dynamic Island e não há
        dispositivo compatível disponível. Este é um BLOQUEIO DE HARDWARE do
        Plano 15-05/Fase 15, documentado como item separado — NÃO é falha
        dos fixes de debug desta sessão (Sintomas A e B), que não dependem
        de Dynamic Island para reproduzir ou verificar.
    Owner instruiu explicitamente: não alterar source, testes, phase
    summaries, environment nem o arquivo untracked pré-existente da Fase 14;
    encerrar esta sessão de debug como resolvida.

## Eliminated

## Operational Constraints

- Investigar de forma estreita a partir deste checkpoint; não há `graphify-out/graph.json`.
- Antes de qualquer comando de banco, ler `AGENTS.md`; usar somente Supabase local e nunca tocar produção (`zanqygwsgxkyjiuhrzju`).
- Preservar `.env` local ignorado pelo git e nunca imprimir segredos.
- Não modificar nem remover `.planning/phases/14-funda-o-nativa/14-PATTERNS.md`.
- Não commitar, publicar, trocar de branch nem restaurar ambiente de produção durante a investigação.
- Separar explicitamente (1) Live Activity ausente e (2) treino real desaparecido/ativação bloqueada.
- Evidência de console do iPhone físico: `/private/tmp/forcaapp-device-console.log`; UDID: `4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7`.
- Antes de nova correção, reproduzir o modo de falha em teste de regressão quando viável; manter o diff mínimo.

## Owner Decision — 2026-08-17

DATA_START
`in_progress` deve reaparecer somente na aba Plano, nunca na Home. Home mantém contrato pending-only. A aba Plano deve resolver deterministicamente uma sessão retomável do usuário no plano ativo, preservar seu fluxo e rótulos existentes e evitar a corrida de transição entre duas consultas. A correção da Live Activity baseada em `current` permanece válida.
DATA_END

## Partial Finding — Symptom A (Live Activity)

- root_cause: `buildLiveActivityContentState()` exigia uma série com estado de UI local `active`; sessões novas ou retomadas têm a série corrente `pending`, então `publishStart()` retornava antes de chamar ActivityKit e sem banner.
- fix: fallback alterado para `current` (`active ?? next`) e coberto por testes RED→GREEN.
- status: correção automática verificada; validação no iPhone ainda pendente, mas não bloqueia a investigação autônoma do sintoma B.

## Owner Decision — Revisão do fix do sintoma B (2026-08-17, checkpoint 2)

DATA_START
`in_progress` deve reaparecer SOMENTE na aba Plano, nunca na Home. Restaurar
`getTodaySession` (Home) pending-only; criar o menor caminho de repositório
dedicado, escopado por plano-ativo/usuário, para retomar `in_progress`;
`TrainingSessionScreen` passa a usar esse caminho preservando fluxo e
rótulos; resolver in_progress-ou-pending numa ÚNICA consulta (nunca duas
sequenciais, para não abrir corrida de transição); cobertura RED→GREEN para
in_progress antiga/stale vs. pendente válida, visibilidade exclusiva da aba
Plano, e erros de consulta; comentários obsoletos atualizados; fix da Live
Activity preservado intacto.
DATA_END

- resolution: Aplicada. `getTodaySession()` voltou a ser estritamente
  pending-only (contrato original da Home). Nova função dedicada
  `getResumableSessionForActivePlan()` (src/services/trainingRepository.ts)
  resolve in_progress-OU-pending do plano ativo do usuário numa ÚNICA
  consulta (`status IN ('in_progress','pending')`, um round-trip, prioridade
  resolvida no cliente) — elimina a corrida de transição de duas consultas
  sequenciais. `TrainingSessionScreen.tsx` (aba Plano) passou a chamar essa
  função em vez de `getTodaySession`; fluxo, rótulos ("Em andamento"/"A
  seguir"/"Começar"/"Continuar") e navegação ficaram intactos — só a fonte de
  dados mudou. `HomeScreen.tsx` não foi tocado: já consumia `getTodaySession`
  e já tinha toda a UI condicionada a `status === 'pending'`, então herda o
  contrato pending-only automaticamente.

## Resolution

- root_cause:
  - "Sintoma A (Live Activity ausente): `buildLiveActivityContentState()` exigia status de UI local `active` no fallback final; sessões novas/retomadas têm a série corrente `pending` (o servidor nunca reconstrói `active`), então `publishStart()` retornava `null` sem chamar ActivityKit e sem banner de erro."
  - "Sintoma B (treino desaparece / não reativa): `getTodaySession()` (src/services/trainingRepository.ts) só consultava `status='pending'`. Assim que `start_session` marca `planned_sessions.status='in_progress'`, a sessão some de HomeScreen E de TrainingSessionScreen (aba Plano) — as duas telas chamavam a MESMA função — e, sem persistência de navegação nem deep link automático, nenhuma tela conseguia mais encontrar/reabrir a sessão. Regressão do commit `8cfe861` (01/08), que removeu o ramo `in_progress` prometendo retomada 'via Plano', mas `TrainingSessionScreen.tsx` nunca ganhou caminho alternativo."
  - and_gate: "Causas independentes em subsistemas diferentes (gate de estado de UI no motor de Live Activity nativo vs. filtro de consulta SQL no repositório de treino React Native) — confirmado no reasoning_checkpoint de cada sintoma. Não é uma condição AND: cada uma sozinha já explica seu sintoma."
- fix:
  - "Sintoma A: fallback de `buildLiveActivityContentState()` trocado de `active` para `current` (`active ?? next`) em `src/engine/liveActivityContentState.ts`. INTACTO nesta revisão."
  - "Sintoma B (revisado por decisão do dono): `getTodaySession()` restaurada a pending-only (contrato original da Home, sem ramo `in_progress`). Nova função `getResumableSessionForActivePlan()` criada especificamente para a aba Plano — resolve in_progress-ou-pending do plano ativo em UMA única consulta (`.in('status', ['in_progress','pending'])`, sem dois awaits sequenciais). `TrainingSessionScreen.tsx` migrada para essa função; `HomeScreen.tsx` não precisou de nenhuma mudança (já era pending-gated em toda a UI)."
- verification:
  - "Sintoma A: RED→GREEN em `__tests__/liveActivityContentState.test.ts` e `__tests__/liveActivitySync.test.ts` (23 testes, PASS) — suíte re-executada nesta sessão sem alteração de conteúdo."
  - "Sintoma B (revisado): `__tests__/trainingRepository.test.ts` — describe `getTodaySession (Home — pending-only...)` cobre: sem plano ativo → null sem consultar sessões; consulta SOMENTE `status='pending'`; visibilidade Plan-only (in_progress nunca é sequer pedido ao banco pela Home, com asserção `not.toHaveBeenCalledWith('status','in_progress')` e `in` nunca chamado); sem pendente → null; erro do banco (plano ativo) propaga; erro na consulta de pendentes propaga. Novo describe `getResumableSessionForActivePlan (aba Plano...)` cobre: sem plano ativo → null; prioridade a in_progress sobre pending numa ÚNICA ida ao banco de sessões (2 chamadas totais a `from`, nunca 3); in_progress antiga/stale (scheduled_date muito anterior) ainda vence sobre pendente mais recente — prova que a prioridade é por status, não por data; fallback para pending na ausência de in_progress; sem nenhuma das duas → null; erro do banco (plano ativo) propaga; erro na consulta combinada propaga. Describe de desempate (`scheduled_date`/`order_in_week`) atualizado para as duas funções."
  - "`__tests__/trainingSessionReanchoragem.test.tsx` e `__tests__/trainingSessionReorder.test.tsx`: mock de `trainingRepository` renomeado de `getTodaySession` para `getResumableSessionForActivePlan` (a tela real agora chama essa função) — todas as asserções de chamada/contagem preservadas, PASS."
  - "`__tests__/fase3-telas-erro.test.tsx`: mock de erro de banco renomeado para `getResumableSessionForActivePlan` — continua provando que erro de banco na aba Plano não vira estado vazio."
  - "`__tests__/consolidacao-screens.test.tsx`: builder mock de `planned_sessions` (`mockFluent`) ganhou o método `.in()` (faltava, causava `TypeError: ...in is not a function` → tela caía em estado de erro) — PASS após o ajuste."
  - "Suíte completa: `npx jest` → 165 suites / 1862 testes, todos PASS (nenhuma regressão em HomeScreen, TrainingSessionScreen, WorkoutDetailScreen nem em nenhum outro consumidor de `trainingRepository`)."
  - "`npx tsc --noEmit -p .` → sem erros."
  - "`git diff --check` → exit 0, sem saída."
  - "Diff check: `git diff --stat` confirma escopo mínimo — só `trainingRepository.ts`, `TrainingSessionScreen.tsx` e os testes diretamente afetados foram tocados nesta revisão; `liveActivityContentState.ts` e seus testes permanecem exatamente como estavam (fix do sintoma A intacto); `.planning/phases/14-funda-o-nativa/14-PATTERNS.md` continua untracked e não tocado; nenhuma mudança de branch, commit ou deploy foi feita."
  - "Verificação nativa: NÃO aplicável a esta revisão — nenhum arquivo Swift/nativo foi alterado (a mudança é 100% TS: uma query de repositório e o import que a consome). O gate nativo já coberto é o do sintoma A (Live Activity), inalterado."
  - "UAT FÍSICA CONFIRMADA (checkpoint human-verify, 2026-08-17T17:30:00-03:00), iPhone 13 (iPhone14,5), build Release corrigido: (a) Live Activity apareceu na tela bloqueada após retomar a sessão — CONFIRMA fix do Sintoma A; (b) Home escondeu a sessão in_progress (contrato pending-only intacto) e a aba Plano mostrou a MESMA sessão in_progress com CTA de retomada funcional — CONFIRMA fix do Sintoma B. Gate de fechamento da sessão CUMPRIDO."
  - "Achados reportados na mesma UAT que NÃO pertencem a esta sessão de debug (nenhuma evidência de relação com `buildLiveActivityContentState()`/`current` nem com `getTodaySession()`/`getResumableSessionForActivePlan()`): comportamento de overtime do timer de descanso sem auto-avanço ao chegar a zero (subsistema separado, não investigado aqui); esclarecimento de que o auto-avanço aparente era 'Skip Rest' manual; Alongamento exibindo nome/posição do bloco sem prescrição; input de reps/carga na Lock Screen (fora do escopo do Plano 15-05 — pertence às Fases 16/17)."
  - "BLOQUEIO DE HARDWARE, separado desta sessão de debug: Dynamic Island (compact/expanded/minimal) não pôde ser testada — o iPhone 13 (iPhone14,5) do UAT não possui Dynamic Island e não há dispositivo compatível disponível. Este é um gate pendente do Plano 15-05/Fase 15 em si, não uma falha dos fixes desta sessão (Sintomas A e B não dependem de Dynamic Island para reproduzir nem verificar)."
- files_changed:
  - src/engine/liveActivityContentState.ts (intacto nesta revisão — herdado do checkpoint 1)
  - __tests__/liveActivityContentState.test.ts (intacto nesta revisão — herdado do checkpoint 1)
  - __tests__/liveActivitySync.test.ts (intacto nesta revisão — herdado do checkpoint 1)
  - src/services/trainingRepository.ts
  - src/screens/TrainingSessionScreen.tsx
  - __tests__/trainingRepository.test.ts
  - __tests__/trainingSessionReanchoragem.test.tsx
  - __tests__/trainingSessionReorder.test.tsx
  - __tests__/fase3-telas-erro.test.tsx
  - __tests__/consolidacao-screens.test.tsx
