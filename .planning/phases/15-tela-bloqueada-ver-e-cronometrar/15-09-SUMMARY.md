---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 09
subsystem: infra
tags: [expo, react-native, activitykit, live-activity, platform-safety, tdd]

# Dependency graph
requires:
  - phase: 15-07
    provides: "RestPhaseResolver/OvertimeFormatter e TimelineView do widget nativo (fecha CR-01, CR-02)"
  - phase: 15-08
    provides: "hasNewlyDoneSet()/recoverAfterFailedUpdate() em liveActivitySync.ts e exercicioForaDeJogo() nos finders (fecha CR-04, WR-01, WR-02)"
provides:
  - "modules/live-activity/index.ts com requireOptionalNativeModule gated por Platform.OS === 'ios' — Android/web nunca lançam ao importar o bridge"
  - "App.tsx com o efeito root de Live Activity limitado ao ramo iOS (reconcileOrphanActivities/initLiveActivitySync/registerLiveActivityIntentListener)"
  - "__tests__/liveActivityPlatformImport.test.ts — 9 casos provando import seguro Android/web/iOS sem mock de modules/live-activity"
affects: ["16", "17"]

actuals:
  tokens: 4757
  tasks: 1
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Bridge Expo opcional: const Module = Platform.OS === 'ios' ? requireOptionalNativeModule(...) : null; cada wrapper faz Module ? Module.fn(...) : Promise.resolve(<neutro>)"
    - "Teste de import-time platform safety: bypassa moduleNameMapper com especificador explícito .../index (não casa a regex do mock global) + jest.resetModules() por cenário, já que o guard roda no module scope, não em tempo de chamada"

key-files:
  created:
    - __tests__/liveActivityPlatformImport.test.ts
  modified:
    - modules/live-activity/index.ts
    - App.tsx

key-decisions:
  - "requireOptionalNativeModule (retorna null, nunca lança) substitui requireNativeModule (lança) — só é chamado quando Platform.OS === 'ios', então Android/web nunca tocam sequer a versão opcional"
  - "Cada wrapper do bridge (start/update/end/isRunning/reconcile/peek/ack/subscribe) ganha um branch neutro quando LiveActivityModule é null: false/[]/undefined/no-op, sem lançar e sem mudar o retorno que liveActivitySync.ts já trata como falha não bloqueante (banner D-12)"
  - "App.tsx ganha guard Platform.OS !== 'ios' no topo do useEffect root — evita 'writer sem destino' em Android/web mesmo já sendo seguro importar o bridge lá"
  - "Teste real do bridge usa o especificador '../modules/live-activity/index' (com /index explícito) para escapar do moduleNameMapper de package.json ('modules/live-activity$' -> __mocks__/modules-live-activity.ts), que existiria para blindar OUTROS testes e mascararia o crash que este teste precisa reproduzir no RED"
  - "Teste do efeito root de App.tsx usa import estático + jest.mock hoisted (sem jest.resetModules()) porque o guard de Platform.OS ali é lido em tempo de execução do efeito, não em tempo de import — resetModules() criaria uma segunda instância de react/react-native desacoplada do react-test-renderer já carregado e quebraria os hooks"

patterns-established:
  - "Bridges Expo Apple-only devem checar Platform.OS ANTES de requireOptionalNativeModule/requireNativeModule no module scope, nunca depender só do guard de call-site — imports são avaliados eagerly independente de qualquer if em volta da CHAMADA da função"

requirements-completed: []  # LOCK-01/LOCK-02/LOCK-03 só fecham após o checkpoint físico da Task 2 (UAT no iPhone) — Task 1 (CR-03) está completa e comprovada, mas o plano como um todo permanece pendente

coverage:
  - id: D1
    description: "Bridge modules/live-activity/index.ts não lança ao ser importado em Android/web (bug de produção confirmado 2026-08-19), e wrappers resolvem valores neutros sem tocar módulo nativo"
    requirement: "LOCK-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityPlatformImport.test.ts — describe 'bootstrap seguro fora do iOS (CR-03)' (4 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ramo iOS real preservado: delega ao módulo quando presente, resolve false sem lançar quando ausente (alimenta banner D-12 não bloqueante)"
    requirement: "LOCK-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityPlatformImport.test.ts — describe 'preservação do ramo iOS real (D-12)' (2 casos)"
        status: pass
    human_judgment: false
  - id: D3
    description: "App.tsx só assina reconcileOrphanActivities/initLiveActivitySync/registerLiveActivityIntentListener no ramo iOS; Android/web não iniciam o writer sem destino"
    requirement: "LOCK-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityPlatformImport.test.ts — describe 'App — efeito root da Live Activity limitado a iOS (CR-03/D-12)' (3 casos)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rechecagem física no iPhone do dono: resting -> readyOvertime/overtime crescente, recuperação por timeout de inatividade, e não-ressurreição após finish/cancel (Task 2, checkpoint gate=blocking)"
    verification: []
    human_judgment: true
    rationale: "UAT de Lock Screen/ActivityKit não é reproduzível por Jest (D-13/D-14) — exige o dono no iPhone físico após rebuild com npm run resign. Executor não tem acesso ao aparelho."

duration: 18min
completed: 2026-08-19
status: checkpoint-pending
---

# Phase 15 Plan 09: Bootstrap multi-plataforma seguro (CR-03) Summary

**Bridge ActivityKit agora usa `requireOptionalNativeModule` gated por `Platform.OS === 'ios'` no module scope — Android/web importam `modules/live-activity`, `liveActivitySync.ts` e `App.tsx` sem lançar, reproduzindo e corrigindo o crash de produção confirmado em 2026-08-19 (`npx expo start --web` → "Cannot find native module 'LiveActivityModule'"). Task 2 (UAT física no iPhone) permanece pendente — checkpoint bloqueante para o dono.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-19T18:18:05Z (aprox., base do worktree)
- **Completed:** Task 1 completa (2 commits); Task 2 (checkpoint físico) pendente
- **Tasks:** 1/2 completas (checkpoint:human-verify, gate="blocking", aguardando o dono)
- **Files modified:** 3 (2 modificados, 1 criado)

## Accomplishments
- `modules/live-activity/index.ts` reescrito: `LiveActivityModule` só é resolvido via `requireOptionalNativeModule` quando `Platform.OS === 'ios'`; fora disso é `null`. Todos os 8 wrappers exportados (`startLiveActivity`, `updateLiveActivity`, `endLiveActivity`, `isLiveActivityRunning`, `reconcileLiveActivityOrphans`, `peekQueuedLiveActivityIntents`, `ackQueuedLiveActivityIntent`, `subscribeLiveActivityIntentAction`) ganham um branch neutro (`false`/`[]`/`undefined`/no-op unsubscribe) quando o módulo é `null`, sem lançar.
- `App.tsx`: o `useEffect` root agora retorna cedo (`if (Platform.OS !== 'ios') return undefined;`) antes de assinar `reconcileOrphanActivities`/`initLiveActivitySync`/`registerLiveActivityIntentListener` — Android/web não assinam mais um "writer sem destino".
- `__tests__/liveActivityPlatformImport.test.ts` criado com 9 casos: 4 provam o bootstrap seguro em Android/web importando o bridge REAL (bypassando o `moduleNameMapper` global de `package.json` via especificador explícito `/index`, sem qualquer mock de `modules/live-activity`); 2 provam a preservação do ramo iOS (com módulo presente delega de verdade, sem módulo resolve `false`); 3 provam que `App.tsx` só assina os listeners de Live Activity no iOS e faz cleanup correto no unmount.
- RED confirmado antes do fix: rodar a suíte contra o `index.ts` original reproduziu literalmente `Error: Cannot find native module 'LiveActivityModule'` nos 6 casos que exercitam o bridge real — a mesma mensagem do crash de produção relatado no contexto do plano.
- GREEN confirmado depois do fix: os mesmos 9 casos passam; suíte completa do projeto sobe de 167/1987 (baseline) para 168 suítes / 1996 testes, todos verdes; `npx tsc --noEmit` limpo; `npm run verify:native` 2/2 rodadas OK.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tornar o bridge ActivityKit opcional fora de iOS e provar imports Android/web** — RED: `1503fe4` (test), GREEN: `d2fadfb` (feat)

**Task 2 (checkpoint:human-verify, gate="blocking"):** NÃO respondida nesta execução — este plano roda com `autonomous: false`; o executor rodou toda a verificação automatizada exigida (tsc + jest direcionado + `verify:native`, todos verdes) e para no checkpoint físico, devolvendo o relatório estruturado para o dono decidir no iPhone.

**Plan metadata commit (este SUMMARY):** a ser criado logo em seguida.

## Files Created/Modified
- `modules/live-activity/index.ts` — Bridge Expo opcional: `requireOptionalNativeModule` gated por `Platform.OS === 'ios'`, 8 wrappers com branch neutro quando o módulo é `null`
- `App.tsx` — Guard `Platform.OS !== 'ios'` no topo do `useEffect` root, antes de assinar reconciliação/sync/listener de intents
- `__tests__/liveActivityPlatformImport.test.ts` — 9 casos: bootstrap Android/web (bridge real, sem mock), preservação do ramo iOS, e efeito root de `App.tsx` limitado a iOS

## Decisions Made
- `requireOptionalNativeModule` (retorna `null`) em vez de `requireNativeModule` (lança) — decisão já indicada pelo plano, confirmada como a API pública correta do Expo (`expo-modules-core/build/requireNativeModule.d.ts`).
- Guard de plataforma vive no **module scope** do bridge (`const LiveActivityModule = Platform.OS === 'ios' ? requireOptionalNativeModule(...) : null`), não em cada função — porque `requireNativeModule`/`requireOptionalNativeModule` era avaliado uma única vez no topo do arquivo, e imports ES são avaliados eagerly independente de qualquer guard em volta da CHAMADA da função. Um guard só em `App.tsx` (call-site) não teria evitado o crash, já que o import de `liveActivitySync.ts` (e transitivamente do bridge) já dispara a avaliação do módulo antes de qualquer código rodar.
- Teste do bridge real usa o especificador `'../modules/live-activity/index'` (com `/index` explícito) para escapar do `moduleNameMapper` global (`"modules/live-activity$"` → `__mocks__/modules-live-activity.ts`, criado na Fase 16 para blindar outros testes contra o `requireNativeModule` obrigatório). Sem esse bypass, o teste RED nunca teria reproduzido o crash real — o mock global já retorna valores seguros.
- Teste do efeito root de `App.tsx` usa import estático (`import App from '../App'`) + `jest.mock(...)` hoisted no topo do arquivo, sem `jest.resetModules()` — porque o guard de `Platform.OS` em `App.tsx` é lido dentro do corpo do `useEffect` (tempo de execução do efeito, a cada mount), não em tempo de import; `jest.resetModules()` teria criado uma segunda instância de `react`/`react-native` desacoplada do `react-test-renderer` já carregado, quebrando os hooks (`Cannot read properties of null (reading 'useEffect')` — descoberto e corrigido durante a implementação do teste).

## Deviations from Plan

None - plan executado exatamente como especificado para a Task 1 (tarefa TDD única). A Task 2 (checkpoint físico) permanece pendente por design — este plano tem `autonomous: false` e o checkpoint é `gate="blocking"`, exigindo resposta explícita do dono no iPhone antes de qualquer declaração de conclusão.

## Issues Encountered
- Primeira tentativa de testar `App.tsx` usou `jest.resetModules()` + `require()` dinâmico por cenário de plataforma (espelhando a técnica usada para o bridge). Isso quebrou os hooks do React (`Cannot read properties of null (reading 'useEffect')`) porque criou uma segunda instância de `react`/`react-native` desacoplada da usada por `react-test-renderer`. Resolvido trocando para import estático de `App` + mocks hoisted + mutação direta de `Platform.OS` (molde já usado em `alertShim.test.ts`/`direcao03-fase1-fundacoes.test.tsx`), já que o guard de `App.tsx` é lido em tempo de execução do efeito, não em tempo de import.
- Segunda tentativa de mockar `liveActivitySync`/`liveActivityIntentBridge` referenciando `jest.fn()` declarados fora da fábrica de `jest.mock()` (prefixados com `mock`) falhou com `TypeError: reconcileOrphanActivities is not a function` — porque `import App from '../App'` compila para um `require()` hoistado ACIMA dos `const mock... = jest.fn()` declarados textualmente antes dele no arquivo-fonte; a fábrica capturou os `const` ainda não inicializados. Resolvido com o molde de `LiveActivityUnavailableBanner.test.tsx`: a fábrica cria seus próprios `jest.fn()` internamente, e o teste reimporta o módulo (já mockado) para obter as referências.

## User Setup Required
None - nenhuma configuração de serviço externo é necessária para a Task 1. O checkpoint pendente (Task 2) exige apenas que o dono rode `npm run resign` no iPhone físico e execute o roteiro de UAT descrito no plano — nenhuma credencial nova, nenhum ambiente novo.

## Next Phase Readiness
- CR-03 (15-VERIFICATION.md gap 4) está tecnicamente fechada: bootstrap Android/web comprovadamente seguro, ramo iOS preservado sem regressão observável, suíte completa verde (168/168, 1996/1996), `tsc`/`verify:native` limpos.
- **Bloqueio real:** LOCK-01 e LOCK-03 (REQUIREMENTS.md) só podem ser marcados concluídos depois que o dono responder o checkpoint físico da Task 2 — os três cenários (resting→readyOvertime/overtime, recuperação por inatividade, não-ressurreição após finish/cancel) exigem o iPhone físico, não são infertíveis a partir de build ou suíte (D-13/D-14).
- Dynamic Island permanece explicitamente fora de escopo (deferido) — a UAT da Task 2 não deve reabri-lo.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Plan: 09*
*Completed (Task 1 only): 2026-08-19*
*Status: checkpoint-pending — aguardando UAT física do dono no iPhone (Task 2)*
