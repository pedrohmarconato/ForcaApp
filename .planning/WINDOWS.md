---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 4
total_count: 6
last_updated: 2026-08-19T21:30:00.000Z
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
| 4 | 15 | stub | src/engine/liveActivityContentState.ts | 44 | blockLabel/blockIndex/blockTotal permanecem null nesta tracer; o Plano 15-02 emitirá blockOnly. | open |  | 2026-08-17T02:53:42.318Z |  |
| 5 | 17 | unrun-verify | src/components/session/SessionPlayer.tsx |  | 17-04 Task 2: a verificacao original previa checagem manual do PWA (npx expo start --web, 390x844). Ao executar o web de verdade em 2026-08-19 descobriu-se que a aplicacao crashava no mount, root vazio e tela preta, por DOIS modulos nativos requeridos sem guarda de plataforma: LiveActivityModule (modules/live-activity/index.ts, quebrado desde a Fase 16, commit 3dabb0e) e NativeInfoModule (modules/native-info/index.ts, alcancado pelo grafo App.tsx -> ProvisioningBanner.tsx). Nao era decisao de projeto nem consequencia aceita: eram dois defeitos, e o primeiro ja estava agendado no roadmap como CR-03 desta fase. Ambos corrigidos em 2026-08-19: plano 15-09 (CR-03) e fechamento 15-09b, ambos com requireOptionalNativeModule avaliado so no ramo iOS. Verificado em navegador real na mesma data: o app sobe, renderiza a tela de Login com 8041 caracteres no root, zero erro de modulo nativo e zero excecao em 90s. O teste __tests__/nativeModulePlatformImport.test.ts passou a cobrir o grafo de import a partir de App.tsx, entao qualquer requireNativeModule desguardado futuro quebra a suite. Por decisao do dono em 2026-08-19, o web volta a ser superficie suportada na v1.3. | fixed | Fechada em 2026-08-19: REG-01 foi verificado pelo dono na tela de sessao ativa do APP DO IPHONE, com build assinado do HEAD instalado as 10:12:33 do mesmo dia; ele confirmou pre-preenchimento vindo do historico, ajuste so por +/-, marca de valor herdado e ausencia de teclado ou overflow. Essa verificacao vale por si e nao depende do web. Nota de correcao: esta janela chegou a ser fechada com a justificativa de que o PWA era inexequivel e o web deixara de ser superficie suportada; isso estava errado. O web estava quebrado por dois bugs consertaveis, ambos ja corrigidos, e voltou a operar na mesma data. O caminho de verificacao por PWA (expo start --web, 390x844) esta novamente disponivel. | 2026-08-19T02:07:27.217Z | 2026-08-19T15:37:59.000Z |
| 6 | 15 | deviation | src/native/liveActivitySync.ts | 237 | reset() em src/store/activeSessionStore.ts:2286 leva o store de active para idle com draft null, mas o subscriber de src/native/liveActivitySync.ts:237 faz early-return nesse caso e endLiveActivity nunca e chamado (unico call site e publishFinished, alcancavel so por status finished). A transicao para fora de active ainda executa clearInactivityTimeout, o que remove o unico outro mecanismo capaz de encerrar. E reset() roda dentro de iniciar() em src/screens/ActiveSessionScreen.tsx:270, ou seja, a cada abertura de sessao. REPRODUCAO: sessao A ativa com card na tela bloqueada; abrir uma sessao; getSessionDetail falha por falta de rede ou devolve null; startOrResume nunca roda; o card de A fica preso mostrando treino velho ate o app reiniciar, porque so reconcileOrphanActivities no boot limpa. Viola LOCK-03 na letra (nunca fica presa mostrando treino velho). O agente de validacao nyquist classificou como WARNING sob a alegacao de que nenhum fluxo de UI alcancavel dispara reset() com Activity ativa; classificacao incorreta, alcancabilidade confirmada em 2026-08-19. CORRECAO NAO APLICADA por decisao pendente do dono: encerrar no subscriber produz um ciclo end+start a cada abertura de sessao, e o orcamento de start/update da ActivityKit e risco de plataforma ja registrado neste projeto, sem fonte oficial da Apple. Opcoes: (a) encerrar no subscriber e aceitar o ciclo extra; (b) encerrar so no caminho de erro de iniciar(); (c) aceitar a janela como risco conhecido. | open |  | 2026-08-19T21:30:00.000Z |  |

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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T02:53:42.318Z",
    "resolved_at": null
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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T21:30:00.000Z",
    "resolved_at": ""
  }
]
````
