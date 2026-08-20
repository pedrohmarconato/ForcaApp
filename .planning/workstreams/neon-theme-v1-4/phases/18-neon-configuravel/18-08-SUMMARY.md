---
phase: 18-neon-configuravel
plan: 08
subsystem: integration
tags: [react-native, typescript, activitykit, live-activity, jest]

# Dependency graph
requires:
  - phase: 18-neon-configuravel
    provides: "ThemeProvider.onThemeChange, NeonColorKey e parser com fallback yellow do Plano 18-01."
provides:
  - "LiveActivityContentState com neonColor validado nas quatro fases e fallback yellow."
  - "Propagação de troca de tema para Activity ativa, com deduplicação e fila de ordem."
  - "App.tsx ligado ao único writer JS da Live Activity por onThemeChange."
affects: [18-09, 18-15, LIVE-01, LIVE-02, PREF-03]

# Actuals — não há log de execução nem diff commitado atribuível a este plano.
actuals:
  tokens: unknown
  tasks: 1
  commits: 0

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ContentState recebe chave fechada pela fronteira JS e resolve entradas ausentes ou inválidas para yellow."
    - "Atualizações de tema passam por uma fila serial no liveActivitySync e não criam um segundo writer nativo."

key-files:
  created: []
  modified:
    - App.tsx
    - src/engine/liveActivityContentState.ts
    - src/native/liveActivitySync.ts
    - __tests__/liveActivityContentState.test.ts
    - __tests__/liveActivitySync.test.ts

key-decisions:
  - "O campo neonColor usa NeonColorKey no contrato TypeScript; parseNeonColor mantém yellow como fallback de fronteira."
  - "setLiveActivityNeonColor publica update quando a Activity está ativa mesmo com a mesma referência de draft."
  - "App.tsx passa ThemeProvider.onThemeChange diretamente a setLiveActivityNeonColor; o provider não importa ActivityKit."

patterns-established:
  - "Start, update, reconcile e resumo finished usam a chave corrente do sync."
  - "Preview e rollback de tema preservam ordem e descartam repetição da mesma chave."

requirements-completed: [PREF-03, LIVE-01, LIVE-02]

# Coverage metadata
coverage:
  - id: D1
    description: "O builder inclui neonColor em measuring, resting, readyOvertime e blockOnly e resolve ausência ou chave inválida para yellow."
    requirement: "LIVE-02"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#inclui a chave neon validada em measuring, resting, readyOvertime e blockOnly"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#usa yellow quando a chave neon está ausente ou é inválida"
        status: pass
    human_judgment: false
  - id: D2
    description: "Uma Activity ativa recebe a troca de tema sem mudança de draft; repetição não duplica update e preview/rollback preservam a ordem."
    requirement: "LIVE-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#atualiza a Activity ativa ao trocar tema mesmo com o mesmo draft"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#serializa preview e rollback na ordem green -> yellow"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#não duplica update quando a mesma chave neon é repetida"
        status: pass
    human_judgment: false
  - id: D3
    description: "A árvore real liga ThemeProvider ao único writer JS da Live Activity."
    requirement: "LIVE-01"
    verification:
      - kind: other
        ref: "App.tsx:62-74 — inspeção do vínculo onThemeChange={setLiveActivityNeonColor}; não há teste dedicado de montagem da árvore real."
        status: unknown
    human_judgment: true
    rationale: "As suítes de ContentState e sync cobrem o writer, mas não montam App.tsx com a árvore real; a ligação foi confirmada por inspeção do código atual."

duration: unknown
completed: 2026-08-18
status: complete
---

# Phase 18: Neon configurável, Plan 08 Summary

**A chave neon sai do ThemeProvider, atravessa o ContentState e atualiza uma Live Activity ativa sem alterar o draft.**

## Performance

- **Duration:** unknown — não há log de início e fim; nenhuma duração foi inferida.
- **Started:** unknown.
- **Completed:** 2026-08-18 — data desta documentação, não duração da implementação.
- **Tasks:** 1 task definida no PLAN e coberta pelos artefatos atuais.
- **Files modified:** 5 arquivos do escopo do PLAN.

## Accomplishments

- `LiveActivityContentState` passou a declarar `neonColor: NeonColorKey`; `buildLiveActivityContentState` valida a entrada e inclui a chave em `measuring`, `resting`, `readyOvertime` e `blockOnly`, com `yellow` para ausência ou valor inválido.
- `liveActivitySync` mantém a chave corrente, usa a mesma chave em start, update, reconciliação de órfãos e resumo final, e expõe `setLiveActivityNeonColor` para publicar uma Activity ativa sem exigir mudança de draft.
- A fila serial evita inversão entre preview e rollback; uma chave repetida não produz update e uma sessão sem Activity apenas guarda a chave para o próximo start.
- `App.tsx` conecta `ThemeProvider.onThemeChange` diretamente ao sync, sem importar o módulo nativo no provider e sem criar writer paralelo.

## Testes executados literalmente

- `npx jest __tests__/liveActivityContentState.test.ts __tests__/liveActivitySync.test.ts --runInBand --silent && npx tsc --noEmit` — **PASS**; 2 suites, 31 testes, 0 snapshots; `tsc` terminou com exit code 0 e sem saída.

Os testes são locais e cobrem a fronteira JS. O decode/render do contrato Swift fica no Plano 18-09; não houve `xcodebuild`, instalação em device, UAT física, staging ou produção nesta verificação.

## Task Commits

Nenhum commit foi criado. O histórico consultado não possui commit identificável de `18-08`; os arquivos do plano permanecem no working tree e a solicitação proibiu commit.

## Files Created/Modified

- `App.tsx` — conecta a callback de troca do `ThemeProvider` ao sync da Live Activity.
- `src/engine/liveActivityContentState.ts` — valida e inclui `neonColor` em todos os estados publicados.
- `src/native/liveActivitySync.ts` — mantém a chave corrente, serializa updates temáticos e conserva o writer único.
- `__tests__/liveActivityContentState.test.ts` — cobre quatro fases, fallback yellow e ausência de séries.
- `__tests__/liveActivitySync.test.ts` — cobre start, update, finished, reconciliação, troca sem mudança de draft, deduplicação e rollback ordenado.

## Decisions Made

- A chave atravessa a fronteira TS como `NeonColorKey`, não como string livre; o parser continua responsável pelo fallback de segurança.
- A troca estética de tema é um evento próprio do sync: não depende de uma nova referência de `SessionDraft`.
- O único caminho JS → ActivityKit continua em `src/native/liveActivitySync.ts`; a integração do provider usa apenas a callback pública.

## Deviations from Plan

Nenhuma divergência funcional foi encontrada no confronto entre o PLAN 18-08, o código atual e as suítes executadas.

### Limitações de atribuição e verificação

1. Não há commit ou log de execução que permita atribuir autoria temporal dos cinco arquivos do plano; o working tree já continha alterações de vários planos.
2. A ligação da árvore real em `App.tsx` não tem teste dedicado de montagem; por isso D3 permanece com `human_judgment: true` e verificação `unknown`.
3. A compatibilidade de decode e render nativo não foi afirmada aqui; ela depende do teste estrutural do Plano 18-09 e dos gates posteriores.

**Total de desvios de implementação:** 0. **Impacto:** a implementação JS passa a fronteira prevista; as limitações não autorizam conclusão de release nativo.

## Issues Encountered

- O histórico Git contém a fundação anterior da Live Activity (`228c913`) e alterações de ciclo de vida dos Planos 15–17, mas nenhum commit de `18-08`; a documentação registra o estado observável do worktree, não uma autoria de commit inexistente.

## User Setup Required

Nenhuma configuração externa é necessária para os testes locais deste plano. O binário compatível e a validação física permanecem sob os gates do Plano 18-15.

## Next Phase Readiness

- O shape JS e o fluxo de atualização temática estão prontos para o par Swift/widget do Plano 18-09.
- O Plano 18-09 deve confirmar decode legado, fallback nativo e render por estado; `xcodebuild`, device, UAT e staging continuam sem evidência nesta etapa.

---
*Phase: 18-neon-configuravel*
*Plan: 18-08*
*Completed: 2026-08-18*
