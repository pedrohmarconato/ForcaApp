---
phase: 11-service-worker-e-atualiza-o-segura
plan: 02
subsystem: ui
tags: [zustand, react-native-web, service-worker, pwa, jest, jsdom]

# Dependency graph
requires:
  - phase: 11-service-worker-e-atualiza-o-segura (Plano 11-01)
    provides: public/register-sw.js despachando os CustomEvents sw-update-available/sw-apply-update na window; guarda jest __tests__/serviceWorkerConfig.test.ts travando o contrato de eventos
provides:
  - src/store/updateStore.ts — estado Zustand do banner de atualização (waiting/dismissed/setWaiting/dismiss/applyUpdate), mesmo molde de alertStore.ts
  - src/components/UpdateBanner.tsx — banner não-bloqueante web-only montado em App.tsx, escutando sw-update-available e despachando sw-apply-update ao toque em Atualizar
  - __tests__/UpdateBanner.test.tsx — guarda RTL permanente (6 testes) cobrindo mostrar/esconder, Atualizar/Depois, gate web-only e ausência de auto-reload
affects: [11-03-plano-verificacao-producao]

# Actuals (#2632)
actuals:
  tokens: 2900
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Componente host global read-only de um store Zustand dedicado, seguindo o molde já estabelecido por alertStore.ts + AlertHost.tsx — ponte com script externo (register-sw.js) via window CustomEvent, nunca import direto"
    - "@jest-environment jsdom por arquivo de teste (docblock precisa ser o PRIMEIRO token do arquivo, antes de qualquer comentário `//`, ou jest-docblock ignora o pragma silenciosamente): a config jest padrão deste repo roda em ambiente Node puro (react-native/jest-preset.js expõe window=global sem EventTarget real) — necessário para testar componentes que falam com window CustomEvent de verdade"

key-files:
  created:
    - src/store/updateStore.ts
    - src/components/UpdateBanner.tsx
    - __tests__/UpdateBanner.test.tsx
  modified:
    - App.tsx

key-decisions:
  - "setWaiting(value) segue literalmente a assinatura do plano (só seta `waiting`, não mexe em `dismissed`) — decisão de manter fidelidade estrita ao <action> do plano em vez de inferir um reset automático de dismissed em cada novo evento, que não é coberto por nenhum truth/behavior testado."
  - "UpdateBanner NÃO lê nenhuma 'flag síncrona' de register-sw.js — a referência do plano a essa flag (citando 11-01-SUMMARY.md) não corresponde ao register-sw.js real committado no Plano 11-01, que não expõe nenhuma flag global (só a RESEARCH.md especulativa menciona window.__swUpdateAvailable, nunca implementada). Decisão: não modificar o arquivo já testado/travado do Plano 11-01 (fora do files_modified desta plan), documentar o risco residual em WINDOWS.md em vez de expandir escopo em silêncio."
  - "Copy pt-BR travada por 11-CONTEXT.md usada literalmente: 'Nova versão disponível' / 'Atualizar' / 'Depois'."
  - "Superfície do banner usa theme.colors.surface.card (GRAFITE #171A1D, âncora exata do brandbook citada em 11-CONTEXT.md) — nenhum valor de cor/espaçamento/tipografia fora de theme.ts."

patterns-established:
  - "Pattern: quando um teste precisa de window.addEventListener/dispatchEvent/CustomEvent reais (ponte de script externo -> React), sobrepor testEnvironment para jsdom só naquele arquivo via docblock `/** @jest-environment jsdom */` como a primeiríssima linha — preserva @testing-library/react-native (react-test-renderer não depende de DOM) sem mudar o ambiente padrão Node do restante da suíte."

requirements-completed: [OFF-02]

coverage:
  - id: D1
    description: "UpdateBanner não renderiza nada até receber o CustomEvent sw-update-available na window; depois do evento, mostra 'Nova versão disponível' com os botões 'Atualizar' e 'Depois'"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "__tests__/UpdateBanner.test.tsx#sem nenhum evento sw-update-available disparado, não renderiza nada (retorna null)"
        status: pass
      - kind: unit
        ref: "__tests__/UpdateBanner.test.tsx#depois do CustomEvent sw-update-available, mostra \"Nova versão disponível\" e os botões Atualizar/Depois"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tocar em 'Atualizar' despacha sw-apply-update exatamente uma vez e o componente nunca chama reload diretamente; tocar em 'Depois' esconde o banner sem despachar nada"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "__tests__/UpdateBanner.test.tsx#tocar em Atualizar despacha sw-apply-update exatamente uma vez e nunca chama reload diretamente"
        status: pass
      - kind: unit
        ref: "__tests__/UpdateBanner.test.tsx#tocar em Depois esconde o banner e NÃO despacha sw-apply-update"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gate web-only: fora de Platform.OS === 'web' o componente retorna null e nunca registra listener na window"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "__tests__/UpdateBanner.test.tsx#Platform.OS !== \"web\" (ex.: ios): retorna null mesmo depois do evento, nunca escuta a window"
        status: pass
    human_judgment: false
  - id: D4
    description: "Múltiplas montagens/desmontagens e disparos repetidos do evento nunca produzem chamada a reload — nenhum caminho do componente/estado auto-recarrega a página, mesmo com atualização chegando durante sessão ativa"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "__tests__/UpdateBanner.test.tsx#múltiplas montagens/desmontagens e disparos repetidos do evento nunca produzem chamada a reload (guarda contra auto-reload)"
        status: pass
    human_judgment: false
  - id: D5
    description: "UpdateBanner montado em App.tsx dentro de AuthProvider, ao lado de AlertHost — o app web renderiza o banner quando o SW sinaliza atualização disponível"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "grep -q UpdateBanner App.tsx"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false

# Metrics
duration: ~12min (commit a commit)
completed: 2026-08-15
status: complete
---

# Phase 11 Plan 02: Banner de atualização não-bloqueante (UpdateBanner) Summary

**Banner web-only "Nova versão disponível" com botões Atualizar/Depois, escutando o CustomEvent `sw-update-available` de `register-sw.js` (Plano 11-01) e nunca disparando reload diretamente — verificado por 6 testes RTL sob `@jest-environment jsdom`.**

## Performance

- **Duration:** ~12min de commit a commit (RED -> GREEN -> montagem em App.tsx), sem checkpoint humano (plano fully autonomous).
- **Tasks:** 2/2
- **Files modified:** 4 (`src/store/updateStore.ts`, `src/components/UpdateBanner.tsx`, `__tests__/UpdateBanner.test.tsx`, `App.tsx`)

## Accomplishments
- `src/store/updateStore.ts` — store Zustand com `waiting`/`dismissed`, `setWaiting`, `dismiss` e `applyUpdate` (só despacha `sw-apply-update`, nunca chama reload), no mesmo molde de `alertStore.ts`.
- `src/components/UpdateBanner.tsx` — componente host global, web-only (`Platform.OS !== 'web'` retorna `null` sem registrar nenhum listener), escutando `sw-update-available` em `useEffect` de montagem única, renderizando o banner fixo na base da tela (superfície `#171A1D` do brandbook) com "Nova versão disponível" / "Atualizar" / "Depois" em pt-BR travado por `11-CONTEXT.md`.
- `__tests__/UpdateBanner.test.tsx` — 6 testes RTL cobrindo o `<behavior>` inteiro do plano: banner oculto por padrão, aparece após o evento, Atualizar despacha `sw-apply-update` uma vez sem reload, Depois esconde sem despachar nada, gate web-only, e ausência de reload em múltiplas montagens/disparos.
- `App.tsx` — `<UpdateBanner />` montado dentro de `<AuthProvider>`, antes de `<AlertHost />`.
- Descoberto e resolvido um problema de ambiente de teste (ver Issues Encountered): a config jest padrão do repo roda em Node puro, sem `window.addEventListener`/`dispatchEvent` funcionais — necessário `@jest-environment jsdom` por arquivo, como primeiro token literal do arquivo.

## Task Commits

Cada task foi commitada atomicamente (Task 1 seguiu TDD RED->GREEN):

1. **Task 1 (RED): guarda falhando para UpdateBanner** — `ad6ad79` (test)
2. **Task 1 (GREEN): updateStore + UpdateBanner implementados** — `6874528` (feat)
3. **Task 2: UpdateBanner montado em App.tsx** — `6fd85e9` (feat)

**Plan metadata:** commit deste SUMMARY (a seguir, docs: complete plan)

## Files Created/Modified
- `src/store/updateStore.ts` — novo. Estado Zustand do banner (`waiting`, `dismissed`, `setWaiting`, `dismiss`, `applyUpdate`).
- `src/components/UpdateBanner.tsx` — novo. Banner web-only, escuta `sw-update-available`, botões Atualizar/Depois.
- `__tests__/UpdateBanner.test.tsx` — novo. Guarda RTL permanente (6 testes), `@jest-environment jsdom`.
- `App.tsx` — modificado. Import e montagem de `<UpdateBanner />` ao lado de `<AlertHost />`.

## Decisions Made
- `setWaiting(value)` segue literalmente a assinatura descrita no `<action>` do plano (só seta `waiting`) — nenhuma lógica extra de "resetar dismissed em todo novo evento" foi inferida, já que nenhum truth/behavior testado exige isso.
- **UpdateBanner não lê nenhuma flag síncrona de `register-sw.js`.** O plano (`read_first`/`action`) cita "a flag síncrona exposta por register-sw.js (a mesma documentada em 11-01-SUMMARY.md)" — essa flag não existe: `11-01-SUMMARY.md` não menciona nenhuma flag, e o `public/register-sw.js` real (committado no Plano 11-01, guardado por `__tests__/serviceWorkerConfig.test.ts`) não expõe `window.__swUpdateAvailable` nem equivalente — essa variável aparece só no exemplo especulativo de `11-RESEARCH.md` Pattern 4, nunca implementada. Como `public/register-sw.js` está fora do `files_modified` desta plan (11-02) e já está travado por testes do Plano 11-01, a decisão foi **não modificar esse arquivo em silêncio** para adicionar a flag; em vez disso, documentei o risco residual (ver Deviations) e registrei no `WINDOWS.md` para reavaliação no UAT de produção do Plano 11-03.
- Copy pt-BR usada literalmente conforme `11-CONTEXT.md`: "Nova versão disponível" / "Atualizar" / "Depois".
- Superfície do banner: `theme.colors.surface.card` (`#171A1D`, GRAFITE — âncora exata citada em `11-CONTEXT.md`), sem nenhum valor de cor/espaçamento/tipografia fora de `theme.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ambiente jsdom por arquivo necessário para testar a ponte window CustomEvent**
- **Encontrado durante:** Task 1 (RED — primeira tentativa de rodar os testes)
- **Problema:** O `<action>` do plano pedia "um espião/mock sobre o reload de página do ambiente jsdom do preset jest-expo", mas a config jest deste repo (`"preset": "jest-expo"` sem override) resolve para `react-native/jest-preset.js`, que roda em ambiente **Node puro** (`react-native-env.js` extends `jest-environment-node`), não jsdom. `react-native/jest/setup.js` define `global.window = global`, mas `global` não é um `EventTarget` — `window.addEventListener`/`window.dispatchEvent` não existem nesse ambiente (confirmado por sonda: `typeof window.addEventListener === 'undefined'`). Sem correção, `UpdateBanner.tsx` (que precisa de `window.addEventListener`/`dispatchEvent` reais para a ponte com `register-sw.js`) travaria com `TypeError: window.addEventListener is not a function` em qualquer teste que disparasse o evento.
- **Correção:** Adicionado o docblock `/** @jest-environment jsdom */` como o **primeiro token literal** de `__tests__/UpdateBanner.test.tsx` (jest-docblock só reconhece o pragma se `^\s*(\/\*\*?...)` casar a partir do início absoluto do arquivo — comentários `//` antes dele fazem o override ser silenciosamente ignorado, confirmado por reprodução: mover o docblock para depois de um cabeçalho `//` fez os 6 testes falharem com o mesmo `TypeError`). O pacote `jest-environment-jsdom` já estava presente em `node_modules` (dependência transitiva), nenhuma instalação nova necessária. Verificado que `@testing-library/react-native`'s `render`/`fireEvent` continuam funcionando normalmente sob jsdom (react-test-renderer não depende de DOM).
- **Arquivos modificados:** `__tests__/UpdateBanner.test.tsx` (só este arquivo — o ambiente padrão Node do resto da suíte não foi alterado).
- **Verificação:** `npx jest __tests__/UpdateBanner.test.tsx` — 6/6 passam; suíte completa (`npx jest`) — 153 suítes / 1733 testes passam, nenhuma regressão.
- **Commitado em:** `ad6ad79` (Task 1 RED)

**2. [Observação — sem fix, sem modificação de código] Discrepância entre o plano e o `register-sw.js` real quanto à "flag síncrona"**
- **Encontrado durante:** Task 1 (`read_first`)
- **Issue:** O plano instrui checar "a flag síncrona exposta por register-sw.js (a mesma documentada em 11-01-SUMMARY.md)" para cobrir o caso do evento `sw-update-available` já ter disparado antes do `useEffect` montar. Essa flag não existe em nenhum lugar: nem em `11-01-SUMMARY.md`, nem no `public/register-sw.js` real (só no exemplo especulativo, nunca implementado, de `11-RESEARCH.md` Pattern 4 — `window.__swUpdateAvailable`).
- **Decisão:** Não modifiquei `public/register-sw.js` (fora do `files_modified` desta plan, já travado por `__tests__/serviceWorkerConfig.test.ts` do Plano 11-01) para adicionar essa flag. Nenhum `must_haves.truth`/`<behavior>` testado desta plan exige esse comportamento — os 6 testes escritos cobrem 100% do `<behavior>` declarado sem precisar dela.
- **Risco residual:** Em teoria, se `navigator.serviceWorker.register('/sw.js').then(...)` resolver ANTES do React montar `UpdateBanner` (plausível em visita repetida rápida, já que `register-sw.js` roda como `<script defer>` no `<head>`), o evento `sw-update-available` despachado nessa checagem síncrona seria perdido para aquela carga de página específica — o banner só apareceria na atualização seguinte (`updatefound`) ou na próxima abertura natural do app, nunca preso indefinidamente.
- **Registrado em:** `WINDOWS.md` (`kind: deviation`, `file: public/register-sw.js`) para reavaliação durante o UAT de produção real do Plano 11-03, onde timing real de browser pode ser observado (não reproduzível em jsdom/Node).

---

**Total de desvios:** 1 auto-fixado (Rule 3 — ambiente de teste), 1 observação documentada sem alteração de código (ver `WINDOWS.md`).
**Impacto no plano:** Nenhum no comportamento entregue — todos os 5 `must_haves.truths` e as 4 `acceptance_criteria` de ambas as tasks estão cobertos e verdes. O item registrado em `WINDOWS.md` é um risco residual de timing de browser real, fora do que este plano exigia testar, sinalizado explicitamente em vez de ignorado em silêncio.

## Issues Encountered
- Erro de sintaxe introduzido momentaneamente em `App.tsx` durante a Task 2 (edit removeu `</AuthProvider>` ao trocar `<AlertHost />` por `<UpdateBanner />` + `<AlertHost />`) — capturado imediatamente pelo hook de validação de sintaxe do harness, corrigido inline antes do commit. Sem impacto no resultado final (nenhum commit quebrado).
- Ver Deviations #1 acima para o problema de ambiente jsdom, já coberto em detalhe.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- OFF-02 completo: metade de infraestrutura (Plano 11-01: headers, pipeline, ponte de eventos) + metade de UX (este plano: banner não-bloqueante, nunca auto-reload) fechadas.
- Critério de sucesso 3 do ROADMAP (Fase 11) fechado.
- Plano 11-03 (verificação de produção) pode validar o fluxo completo em um browser real: instalar o SW, forçar uma atualização (`SKIP_WAITING` via toque em "Atualizar"), confirmar reload único, e — se tempo permitir — observar se o caso de "evento perdido antes da montagem do React" (registrado em `WINDOWS.md`) realmente ocorre em produção; se sim, adicionar a flag síncrona em `register-sw.js` como fix pontual.

---
*Phase: 11-service-worker-e-atualiza-o-segura*
*Completed: 2026-08-15*

## Self-Check: PASSED

Todos os arquivos declarados (`src/store/updateStore.ts`, `src/components/UpdateBanner.tsx`, `__tests__/UpdateBanner.test.tsx`, `App.tsx`, este SUMMARY.md) e os três commits de task (`ad6ad79`, `6874528`, `6fd85e9`) foram confirmados existentes no disco e no `git log` antes de prosseguir.
