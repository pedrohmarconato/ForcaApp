---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 7
total_count: 7
last_updated: 2026-08-20T17:50:30.227Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 11 | deviation | public/register-sw.js |  | UpdateBanner (11-02) nao le nenhuma flag sincrona de register-sw.js (11-01) para o caso do evento sw-update-available ja ter disparado antes do useEffect montar (register() resolvendo antes do React montar). Nenhum truth/behavior testado exige isso e o arquivo esta fora do files_modified de 11-02; risco residual: em visita repetida rapida, o banner pode nao aparecer nessa carga de pagina especifica (a proxima carga natural ainda funciona). Considerar window.__swUpdateAvailable em register-sw.js se o UAT de producao (11-03) confirmar o caso. | fixed |  | 2026-08-15T03:38:11.325Z | 2026-08-15T11:58:01.555Z |
| 2 | 13 | deviation | supabase/migrations/0038_push_subscriptions.sql |  | Migration 0038 criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: SUPABASE_ACCESS_TOKEN do ambiente pertence a outra conta/org sem acesso ao ForcaApp. Dono precisa supabase login + relink + db push antes do UAT do Plano 13-04. | fixed |  | 2026-08-15T15:23:22.926Z | 2026-08-15T19:19:28.797Z |
| 3 | 13 | deviation | supabase/migrations/0039_push_reminder_idempotencia.sql |  | Migration 0039 (reminder_sent_at + índice parcial) criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: mesma credencial documentada na entrada #2 (SUPABASE_ACCESS_TOKEN do ambiente sem acesso ao org do ForçaApp). Dono precisa aplicar 0038 e 0039 juntas antes do UAT do Plano 13-04. | fixed |  | 2026-08-15T15:38:28.515Z | 2026-08-15T19:19:28.896Z |
| 4 | 15 | stub | src/engine/liveActivityContentState.ts | 44 | blockLabel/blockIndex/blockTotal permanecem null nesta tracer; o Plano 15-02 emitirá blockOnly. | fixed | Obsoleta: o stub foi preenchido pelo proprio Plano 15-02, como a janela previa. Verificado no codigo vivo em 2026-08-19 (HEAD 9d9e04b): src/engine/liveActivityContentState.ts:168-170 populam blockLabel, blockIndex e blockTotal quando phase e blockOnly, a partir de exercise.name e blockPosition; fora dessa fase permanecem null por contrato, nao por omissao. Coberto por 4 asserts em __tests__/liveActivityContentState.test.ts. A janela ficou aberta por falta de fechamento, nao por defeito remanescente. | 2026-08-17T02:53:42.318Z | 2026-08-19T22:45:00.000Z |
| 5 | 17 | unrun-verify | src/components/session/SessionPlayer.tsx |  | 17-04 Task 2: a verificacao original previa checagem manual do PWA (npx expo start --web, 390x844). Ao executar o web de verdade em 2026-08-19 descobriu-se que a aplicacao crashava no mount, root vazio e tela preta, por DOIS modulos nativos requeridos sem guarda de plataforma: LiveActivityModule (modules/live-activity/index.ts, quebrado desde a Fase 16, commit 3dabb0e) e NativeInfoModule (modules/native-info/index.ts, alcancado pelo grafo App.tsx -> ProvisioningBanner.tsx). Nao era decisao de projeto nem consequencia aceita: eram dois defeitos, e o primeiro ja estava agendado no roadmap como CR-03 desta fase. Ambos corrigidos em 2026-08-19: plano 15-09 (CR-03) e fechamento 15-09b, ambos com requireOptionalNativeModule avaliado so no ramo iOS. Verificado em navegador real na mesma data: o app sobe, renderiza a tela de Login com 8041 caracteres no root, zero erro de modulo nativo e zero excecao em 90s. O teste __tests__/nativeModulePlatformImport.test.ts passou a cobrir o grafo de import a partir de App.tsx, entao qualquer requireNativeModule desguardado futuro quebra a suite. Por decisao do dono em 2026-08-19, o web volta a ser superficie suportada na v1.3. | fixed | Fechada em 2026-08-19: REG-01 foi verificado pelo dono na tela de sessao ativa do APP DO IPHONE, com build assinado do HEAD instalado as 10:12:33 do mesmo dia; ele confirmou pre-preenchimento vindo do historico, ajuste so por +/-, marca de valor herdado e ausencia de teclado ou overflow. Essa verificacao vale por si e nao depende do web. Nota de correcao: esta janela chegou a ser fechada com a justificativa de que o PWA era inexequivel e o web deixara de ser superficie suportada; isso estava errado. O web estava quebrado por dois bugs consertaveis, ambos ja corrigidos, e voltou a operar na mesma data. O caminho de verificacao por PWA (expo start --web, 390x844) esta novamente disponivel. | 2026-08-19T02:07:27.217Z | 2026-08-19T15:37:59.000Z |
| 6 | 15 | deviation | src/native/liveActivitySync.ts | 237 | reset() em src/store/activeSessionStore.ts:2286 leva o store de active para idle com draft null, mas o subscriber de src/native/liveActivitySync.ts:237 faz early-return nesse caso e endLiveActivity nunca e chamado (unico call site e publishFinished, alcancavel so por status finished). A transicao para fora de active ainda executa clearInactivityTimeout, o que remove o unico outro mecanismo capaz de encerrar. E reset() roda dentro de iniciar() em src/screens/ActiveSessionScreen.tsx:270, ou seja, a cada abertura de sessao. REPRODUCAO: sessao A ativa com card na tela bloqueada; abrir uma sessao; getSessionDetail falha por falta de rede ou devolve null; startOrResume nunca roda; o card de A fica preso mostrando treino velho ate o app reiniciar, porque so reconcileOrphanActivities no boot limpa. Viola LOCK-03 na letra (nunca fica presa mostrando treino velho). O agente de validacao nyquist classificou como WARNING sob a alegacao de que nenhum fluxo de UI alcancavel dispara reset() com Activity ativa; classificacao incorreta, alcancabilidade confirmada em 2026-08-19. CORRECAO NAO APLICADA por decisao pendente do dono: encerrar no subscriber produz um ciclo end+start a cada abertura de sessao, e o orcamento de start/update da ActivityKit e risco de plataforma ja registrado neste projeto, sem fonte oficial da Apple. Opcoes: (a) encerrar no subscriber e aceitar o ciclo extra; (b) encerrar so no caminho de erro de iniciar(); (c) aceitar a janela como risco conhecido. | fixed | Corrigida em 2026-08-19 pelo merge 9d9e04b. Escolhida a correcao no caminho de ERRO de iniciar() em vez do subscriber: iniciar() roda tambem ao reabrir a MESMA sessao ativa, entao encerrar no subscriber produziria ciclo end+start no caminho feliz, e o orcamento de start/update da ActivityKit e risco de plataforma registrado neste projeto sem fonte oficial da Apple. Nova funcao endLiveActivityForAbandonedSession() em liveActivitySync.ts, chamada nos dois ramos de falha de iniciar() depois da guarda isCurrent(); ela nao encerra nada se outra sessao ja assumiu o card. reset() ganhou comentario registrando que a correcao depende de ele ter um unico chamador. TDD com RED provado: 3 testes unitarios mais 1 teste de tela do cenario real. O comportamento do subscriber NAO mudou e o teste que o documenta foi mantido, renomeado para 'deliberado' — deixou de ser defeito em aberto e passou a ser escolha registrada. | 2026-08-19T21:30:00.000Z | 2026-08-19T22:40:00.000Z |
| 7 | 18 | lint-warning | targets/session-widget/WidgetLiveActivity.swift | 156 | Indentacao anomala em .foregroundColor(neonAccent(for: state)) dentro do case .readyOvertime: 4 espacos a mais que as linhas irmas (.font, .fontWeight, .lineLimit), que usam 12 espacos. Pre-existente do diff da branch feature/v1.4-neon-theme, trazido pelo merge 42f1e58. Sem efeito de compilacao (Swift ignora espacos em branco fora de string/regex literals); achado puramente cosmetico, fora do escopo da reorganizacao de .planning/ deste commit. | fixed | Corrigida em 2026-08-20 pelo commit 0a336d5: indentacao da linha .foregroundColor(neonAccent(for: state)) em WidgetLiveActivity.swift:156 alinhada as irmas .font/.fontWeight/.lineLimit (12 espacos). Mudanca whitespace-only, 1 linha, sem efeito de compilacao. Validado por scripts/verify-live-activity-overtime.sh (exit 0), que inspeciona o fonte desse arquivo. | 2026-08-20T01:45:12.822Z | 2026-08-20T17:50:20.712Z |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "11",
    "file": "public/register-sw.js",
    "line": null,
    "description": "UpdateBanner (11-02) nao le nenhuma flag sincrona de register-sw.js (11-01) para o caso do evento sw-update-available ja ter disparado antes do useEffect montar (register() resolvendo antes do React montar). Nenhum truth/behavior testado exige isso e o arquivo esta fora do files_modified de 11-02; risco residual: em visita repetida rapida, o banner pode nao aparecer nessa carga de pagina especifica (a proxima carga natural ainda funciona). Considerar window.__swUpdateAvailable em register-sw.js se o UAT de producao (11-03) confirmar o caso.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-15T03:38:11.325Z",
    "resolved_at": "2026-08-15T11:58:01.555Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "13",
    "file": "supabase/migrations/0038_push_subscriptions.sql",
    "line": null,
    "description": "Migration 0038 criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: SUPABASE_ACCESS_TOKEN do ambiente pertence a outra conta/org sem acesso ao ForcaApp. Dono precisa supabase login + relink + db push antes do UAT do Plano 13-04.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-15T15:23:22.926Z",
    "resolved_at": "2026-08-15T19:19:28.797Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "13",
    "file": "supabase/migrations/0039_push_reminder_idempotencia.sql",
    "line": null,
    "description": "Migration 0039 (reminder_sent_at + índice parcial) criada e testada (DO-block de asserção) mas aplicação em staging (mjdjtiujhwklchalquhc) BLOQUEADA: mesma credencial documentada na entrada #2 (SUPABASE_ACCESS_TOKEN do ambiente sem acesso ao org do ForçaApp). Dono precisa aplicar 0038 e 0039 juntas antes do UAT do Plano 13-04.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-15T15:38:28.515Z",
    "resolved_at": "2026-08-15T19:19:28.896Z"
  },
  {
    "id": 4,
    "kind": "stub",
    "phase": "15",
    "file": "src/engine/liveActivityContentState.ts",
    "line": 44,
    "description": "blockLabel/blockIndex/blockTotal permanecem null nesta tracer; o Plano 15-02 emitirá blockOnly.",
    "status": "fixed",
    "reason": "Obsoleta: o stub foi preenchido pelo proprio Plano 15-02, como a janela previa. Verificado no codigo vivo em 2026-08-19 (HEAD 9d9e04b): src/engine/liveActivityContentState.ts:168-170 populam blockLabel, blockIndex e blockTotal quando phase e blockOnly, a partir de exercise.name e blockPosition; fora dessa fase permanecem null por contrato, nao por omissao. Coberto por 4 asserts em __tests__/liveActivityContentState.test.ts. A janela ficou aberta por falta de fechamento, nao por defeito remanescente.",
    "recorded_at": "2026-08-17T02:53:42.318Z",
    "resolved_at": "2026-08-19T22:45:00.000Z"
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "src/components/session/SessionPlayer.tsx",
    "line": null,
    "description": "17-04 Task 2: a verificacao original previa checagem manual do PWA (npx expo start --web, 390x844). Ao executar o web de verdade em 2026-08-19 descobriu-se que a aplicacao crashava no mount, root vazio e tela preta, por DOIS modulos nativos requeridos sem guarda de plataforma: LiveActivityModule (modules/live-activity/index.ts, quebrado desde a Fase 16, commit 3dabb0e) e NativeInfoModule (modules/native-info/index.ts, alcancado pelo grafo App.tsx -> ProvisioningBanner.tsx). Nao era decisao de projeto nem consequencia aceita: eram dois defeitos, e o primeiro ja estava agendado no roadmap como CR-03 desta fase. Ambos corrigidos em 2026-08-19: plano 15-09 (CR-03) e fechamento 15-09b, ambos com requireOptionalNativeModule avaliado so no ramo iOS. Verificado em navegador real na mesma data: o app sobe, renderiza a tela de Login com 8041 caracteres no root, zero erro de modulo nativo e zero excecao em 90s. O teste __tests__/nativeModulePlatformImport.test.ts passou a cobrir o grafo de import a partir de App.tsx, entao qualquer requireNativeModule desguardado futuro quebra a suite. Por decisao do dono em 2026-08-19, o web volta a ser superficie suportada na v1.3.",
    "status": "fixed",
    "reason": "Fechada em 2026-08-19: REG-01 foi verificado pelo dono na tela de sessao ativa do APP DO IPHONE, com build assinado do HEAD instalado as 10:12:33 do mesmo dia; ele confirmou pre-preenchimento vindo do historico, ajuste so por +/-, marca de valor herdado e ausencia de teclado ou overflow. Essa verificacao vale por si e nao depende do web. Nota de correcao: esta janela chegou a ser fechada com a justificativa de que o PWA era inexequivel e o web deixara de ser superficie suportada; isso estava errado. O web estava quebrado por dois bugs consertaveis, ambos ja corrigidos, e voltou a operar na mesma data. O caminho de verificacao por PWA (expo start --web, 390x844) esta novamente disponivel.",
    "recorded_at": "2026-08-19T02:07:27.217Z",
    "resolved_at": "2026-08-19T15:37:59.000Z"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "15",
    "file": "src/native/liveActivitySync.ts",
    "line": 237,
    "description": "reset() em src/store/activeSessionStore.ts:2286 leva o store de active para idle com draft null, mas o subscriber de src/native/liveActivitySync.ts:237 faz early-return nesse caso e endLiveActivity nunca e chamado (unico call site e publishFinished, alcancavel so por status finished). A transicao para fora de active ainda executa clearInactivityTimeout, o que remove o unico outro mecanismo capaz de encerrar. E reset() roda dentro de iniciar() em src/screens/ActiveSessionScreen.tsx:270, ou seja, a cada abertura de sessao. REPRODUCAO: sessao A ativa com card na tela bloqueada; abrir uma sessao; getSessionDetail falha por falta de rede ou devolve null; startOrResume nunca roda; o card de A fica preso mostrando treino velho ate o app reiniciar, porque so reconcileOrphanActivities no boot limpa. Viola LOCK-03 na letra (nunca fica presa mostrando treino velho). O agente de validacao nyquist classificou como WARNING sob a alegacao de que nenhum fluxo de UI alcancavel dispara reset() com Activity ativa; classificacao incorreta, alcancabilidade confirmada em 2026-08-19. CORRECAO NAO APLICADA por decisao pendente do dono: encerrar no subscriber produz um ciclo end+start a cada abertura de sessao, e o orcamento de start/update da ActivityKit e risco de plataforma ja registrado neste projeto, sem fonte oficial da Apple. Opcoes: (a) encerrar no subscriber e aceitar o ciclo extra; (b) encerrar so no caminho de erro de iniciar(); (c) aceitar a janela como risco conhecido.",
    "status": "fixed",
    "reason": "Corrigida em 2026-08-19 pelo merge 9d9e04b. Escolhida a correcao no caminho de ERRO de iniciar() em vez do subscriber: iniciar() roda tambem ao reabrir a MESMA sessao ativa, entao encerrar no subscriber produziria ciclo end+start no caminho feliz, e o orcamento de start/update da ActivityKit e risco de plataforma registrado neste projeto sem fonte oficial da Apple. Nova funcao endLiveActivityForAbandonedSession() em liveActivitySync.ts, chamada nos dois ramos de falha de iniciar() depois da guarda isCurrent(); ela nao encerra nada se outra sessao ja assumiu o card. reset() ganhou comentario registrando que a correcao depende de ele ter um unico chamador. TDD com RED provado: 3 testes unitarios mais 1 teste de tela do cenario real. O comportamento do subscriber NAO mudou e o teste que o documenta foi mantido, renomeado para 'deliberado' — deixou de ser defeito em aberto e passou a ser escolha registrada.",
    "recorded_at": "2026-08-19T21:30:00.000Z",
    "resolved_at": "2026-08-19T22:40:00.000Z"
  },
  {
    "id": 7,
    "kind": "lint-warning",
    "phase": "18",
    "file": "targets/session-widget/WidgetLiveActivity.swift",
    "line": 156,
    "description": "Indentacao anomala em .foregroundColor(neonAccent(for: state)) dentro do case .readyOvertime: 4 espacos a mais que as linhas irmas (.font, .fontWeight, .lineLimit), que usam 12 espacos. Pre-existente do diff da branch feature/v1.4-neon-theme, trazido pelo merge 42f1e58. Sem efeito de compilacao (Swift ignora espacos em branco fora de string/regex literals); achado puramente cosmetico, fora do escopo da reorganizacao de .planning/ deste commit.",
    "status": "fixed",
    "reason": "Corrigida em 2026-08-20 pelo commit 0a336d5: indentacao da linha .foregroundColor(neonAccent(for: state)) em WidgetLiveActivity.swift:156 alinhada as irmas .font/.fontWeight/.lineLimit (12 espacos). Mudanca whitespace-only, 1 linha, sem efeito de compilacao. Validado por scripts/verify-live-activity-overtime.sh (exit 0), que inspeciona o fonte desse arquivo.",
    "recorded_at": "2026-08-20T01:45:12.822Z",
    "resolved_at": "2026-08-20T17:50:20.712Z"
  }
]
````
