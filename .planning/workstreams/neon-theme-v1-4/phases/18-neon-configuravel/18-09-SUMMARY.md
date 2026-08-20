---
phase: 18-neon-configuravel
plan: 09
subsystem: native
tags: [swift, activitykit, widgetkit, xcodebuild, node-test, jest]

# Dependency graph
requires:
  - phase: 18-neon-configuravel
    provides: "LiveActivityContentState.neonColor e liveActivitySync do Plano 18-08."
provides:
  - "Ponte Swift e dois ContentState com neonColor opcional e compatibilidade legada."
  - "Resolver WidgetKit fechado para quatro cores e fallback yellow por estado."
  - "Harness determinístico de resign que amarra o install ao DerivedData da própria execução."
affects: [18-15, THEME-01, LIVE-01, LIVE-02]

# Actuals — não há log de execução nem diff commitado atribuível a este plano.
actuals:
  tokens: unknown
  tasks: 2
  commits: 0

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ContentState duplicado entre app e widget permanece byte a byte idêntico e recebe o campo opcional ao fim."
    - "Build assinado usa DerivedData exclusivo, caminho de produto determinístico e validações fail-closed antes de devicectl."

key-files:
  created:
    - __tests__/liveActivitySwiftContract.test.ts
    - scripts/resign.test.mjs
  modified:
    - modules/live-activity/ios/LiveActivityModule.swift
    - modules/live-activity/ios/SessionActivityAttributes.swift
    - targets/session-widget/SessionActivityAttributes.swift
    - targets/session-widget/WidgetLiveActivity.swift
    - scripts/resign.sh

key-decisions:
  - "neonColor é opcional nos dois ContentState e no Record da ponte; nil preserva o decode de payload legado."
  - "O widget usa switch fechado sobre context.state.neonColor; unknown e nil convergem para os canais RGB de yellow."
  - "resign.sh não pesquisa DerivedData global: APP_PATH deriva exclusivamente do diretório temporário criado pela execução atual."

patterns-established:
  - "O contrato duplicado app/widget recebe teste estrutural sem dependência de Xcode para detectar drift."
  - "A rotina de instalação valida app, extensão, mtime, codesign e bundle antes de acessar qualquer device."

requirements-completed: [THEME-01, LIVE-01, LIVE-02]

# Coverage metadata
coverage:
  - id: D1
    description: "A ponte Expo e os dois SessionActivityAttributes encaminham neonColor opcional na mesma ordem estrutural."
    requirement: "LIVE-02"
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySwiftContract.test.ts#são byte a byte idênticos — mudam sempre juntos"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySwiftContract.test.ts#Record espelha a mesma ordem com @Field opcional default nil"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySwiftContract.test.ts#contentState(from:) encaminha neonColor como último argumento"
        status: pass
    human_judgment: false
  - id: D2
    description: "O widget resolve yellow, blue, green e red pelos hexes aprovados e usa yellow para nil ou chave desconhecida, sem constante neon global."
    requirement: "THEME-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySwiftContract.test.ts — resolver de cor do widget e usos derivados do ContentState"
        status: pass
    human_judgment: false
  - id: D3
    description: "resign.sh cria DerivedData exclusivo, seleciona somente o produto Release novo e falha antes do device para widget, stale app, codesign, bundle ou ambiente UAT inválido."
    verification:
      - kind: unit
        ref: "node --test scripts/resign.test.mjs"
        status: pass
      - kind: other
        ref: "bash -n scripts/resign.sh"
        status: pass
    human_judgment: false
  - id: D4
    description: "Build Release real com xcodebuild e instalação em device físico."
    verification: []
    human_judgment: true
    rationale: "O harness usa adaptadores simulados para provar seleção de path e gates; não há evidência de xcodebuild real, assinatura Apple, device ou UAT física nesta etapa."

duration: unknown
completed: 2026-08-18
status: complete
---

# Phase 18: Neon configurável, Plan 09 Summary

**A fronteira ActivityKit/WidgetKit aceita neonColor opcional com fallback amarelo, e o resign instala apenas o Release produzido na execução atual.**

## Performance

- **Duration:** unknown — não há log de início e fim; nenhuma duração foi inferida.
- **Started:** unknown.
- **Completed:** 2026-08-18 — data desta documentação, não duração da implementação.
- **Tasks:** 2 tasks definidas no PLAN e cobertas pelos artefatos atuais.
- **Files modified:** 7 arquivos do escopo do PLAN, dos quais 2 são testes novos.

## Accomplishments

- `LiveActivityContentStateRecord` recebeu `@Field var neonColor: String? = nil`; `contentState(from:)` encaminha o campo ao `SessionActivityAttributes.ContentState`.
- Os dois `SessionActivityAttributes.swift` possuem o mesmo `ContentState`, com `neonColor: String?` ao fim; o teste exige igualdade byte a byte, ordem canônica e paridade do Record.
- `WidgetLiveActivity.swift` substituiu o acento fixo por `neonAccent(for:)`, com RGB exato para yellow `#EBFF00`, blue `#00E5FF`, green `#39FF14` e red `#FF3131`; `default` cobre nil e valores desconhecidos. Primary values, tint dos botões, usos do símbolo minimal dependentes de estado e keyline consultam o estado recebido; valores neutros preservam branco ou `activitySecondary`.
- `scripts/resign.sh` cria DerivedData temporário exclusivo, executa `clean build` Release, deriva `APP_PATH` desse diretório, exige widget, mtime recente, codesign válido e bundle compatível antes de `devicectl`, sem imprimir variáveis de ambiente.
- A validação opcional de UAT rejeita URL ausente, localhost, produção, host não canônico e bundle com marcadores proibidos antes da instalação.

## Testes executados literalmente

- `npx jest __tests__/liveActivitySwiftContract.test.ts --runInBand --silent && node --test scripts/resign.test.mjs && bash -n scripts/resign.sh` — **PASS**; Jest: 1 suite, 12 testes, 0 snapshots; Node: 4 testes, 0 falhas; `bash -n`: exit code 0 sem saída.
- `npm run verify:native` — **PASS**; o script completou duas rodadas, `(a)-(g) OK`, e confirmou que o esqueleto nativo sobrevive ao `expo prebuild -p ios --clean` no gate local.
- `npx tsc --noEmit` — **PASS**; processo terminou com exit code 0 e sem saída, como verificação adicional local.

Essas evidências não equivalem a `xcodebuild` Release real, assinatura Apple, instalação em iPhone, UAT física, migration staging ou produção. Nenhuma dessas operações foi executada nesta verificação.

## Task Commits

Nenhum commit foi criado. O histórico consultado não possui commit identificável de `18-09`; os arquivos do plano permanecem no working tree e a solicitação proibiu commit.

## Files Created/Modified

- `modules/live-activity/ios/LiveActivityModule.swift` — Record opcional e conversão para o ContentState nativo.
- `modules/live-activity/ios/SessionActivityAttributes.swift` — ContentState do app com `neonColor` opcional.
- `targets/session-widget/SessionActivityAttributes.swift` — espelho do ContentState para a extensão.
- `targets/session-widget/WidgetLiveActivity.swift` — resolver por estado, quatro RGB e fallback yellow.
- `__tests__/liveActivitySwiftContract.test.ts` — paridade dos structs, ponte, RGB, usos do state e preservação de layout/intents/timers.
- `scripts/resign.sh` — build/install Release com DerivedData exclusivo e gates de ambiente/produto.
- `scripts/resign.test.mjs` — harness de Node com app antigo, produto novo, falhas de bundle/widget/stale/codesign e URLs UAT inválidas.

## Decisions Made

- `neonColor` fica ao fim do ContentState e é opcional, para que Activities legadas continuem decodificáveis.
- A resolução da cor ocorre no widget a partir do estado; não existe acento neon global independente de `state`.
- O produto instalado sai do mesmo `DERIVED_DATA_PATH` usado pelo `xcodebuild`; a rotina não procura um `.app` antigo em diretórios globais.
- O `verify:native` local permanece um gate de esqueleto/prebuild; não foi tratado como prova de compilação, assinatura ou execução física.

## Deviations from Plan

Nenhuma divergência funcional foi encontrada no confronto entre o PLAN 18-09, o código atual, os testes estruturais e o script de verificação nativa.

### Limitações de atribuição e verificação

1. O harness de `resign` simula `xcodebuild`, `codesign` e `devicectl`; ele prova a seleção determinística e os gates do shell, não uma toolchain Apple real.
2. `npm run verify:native` prova duas rodadas do esqueleto e do prebuild limpo, mas não executa o `xcodebuild` Release nem instala o `.app` em device.
3. Não há commit ou log de execução que permita atribuir autoria temporal dos sete arquivos do plano; o working tree já continha alterações de vários planos.

**Total de desvios de implementação:** 0. **Impacto:** o contrato e o harness local estão verdes; os gates físicos e remotos permanecem explicitamente abertos.

## Issues Encountered

- O histórico anterior confirma a regra de Release no commit `0fd3376` e a fundação ActivityKit no commit `228c913`; não há commit de `18-09` no histórico atual. A ausência de commit impede atribuição temporal, mas não altera a evidência dos testes atuais.

## User Setup Required

Nenhuma configuração externa é necessária para os testes locais. A execução real de resign exige Apple Team, dispositivo e ambiente de assinatura; esses pré-requisitos pertencem ao gate físico posterior e não foram exercitados.

## Next Phase Readiness

- O par JS/Swift/widget e o caminho determinístico do produto estão prontos para o gate integrado do Plano 18-15.
- Antes de afirmar entrega nativa, o Plano 18-15 ainda precisa fornecer evidência separada de `xcodebuild` Release, assinatura, instalação e UAT física; este resumo não antecipa esses resultados.

---
*Phase: 18-neon-configuravel*
*Plan: 18-09*
*Completed: 2026-08-18*
