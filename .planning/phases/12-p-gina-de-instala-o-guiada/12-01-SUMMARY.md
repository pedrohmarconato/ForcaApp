---
phase: 12-p-gina-de-instala-o-guiada
plan: 01
subsystem: ui
tags: [react-navigation, expo-web, pwa-install, deep-linking, ua-sniffing]

# Dependency graph
requires:
  - phase: 11-atualiza-o-e-offline-do-pwa
    provides: service worker + web-only guard pattern (UpdateBanner.tsx) reused here
provides:
  - "Rota pública /instalar reachable em qualquer estado de sessão (deslogado, onboarding, logado)"
  - "installDetection.ts: isIOS/isSafari/isStandalone puros, síncronos, testáveis"
  - "InstallScreen.tsx: os 4 estados de instalação com copy literal do UI-SPEC"
affects: [12-02 (UAT em iPhone real, critério de sucesso 3 do ROADMAP Fase 12)]

actuals:
  tokens: 9391
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "installDetection.ts: helper puro (isIOSDevice/isSafariBrowser) + wrapper com guarda typeof navigator/window undefined — todo branch degrada para false por construção, nunca lança"
    - "InstallScreen recebe homeRoute como prop estática em cada um dos 3 pontos de registro — nenhuma navegação hardcoded dentro do componente"
    - "Rota pública alcançável nas 3 árvores de navegação: linkingInterceptor (Auth+Onboarding, objeto compartilhado) + LINKING_CONFIG (Main), cada navigator tipado ganha a chave Instalar em seu ParamList"

key-files:
  created:
    - src/utils/installDetection.ts
    - src/screens/InstallScreen.tsx
    - __tests__/installDetection.test.ts
    - __tests__/InstallScreen.test.tsx
  modified:
    - src/navigation/linking.ts
    - src/navigation/linkingConfig.ts
    - src/navigation/AuthNavigator.tsx
    - src/navigation/OnboardingNavigator.tsx
    - src/navigation/MainNavigator.tsx
    - __tests__/navigationLinking.test.ts

key-decisions:
  - "CTA do Estado 4 usa useNavigation<any>() (mesmo padrão de ExercisePickerScreen.tsx) em vez de tipar por ParamList — InstallScreen monta em 3 árvores com tipos de navigator distintos (AuthNavigator sem generic; Onboarding/Main tipados) e não há um ParamList único que sirva aos três."
  - "Guard estrutural de regressão do Pitfall 2 (tabBarButton) implementado como teste de proximidade textual (<=200 caracteres entre name=\"Instalar\" e tabBarButton: () => null em MainNavigator.tsx), não como snapshot — evita falso-positivo se outra tela futura também usar tabBarButton: () => null."

patterns-established:
  - "Pattern: tela web-only pública multi-árvore — Platform.OS !== 'web' -> null ANTES de qualquer chamada de detecção; prop homeRoute em vez de navegação hardcoded; mesma tela registrada nos 3 stacks com generic name/path idênticos."

requirements-completed: [INST-02]

coverage:
  - id: D1
    description: "Aluno deslogado no Safari do iPhone vê os 3 passos numerados com copy literal do UI-SPEC (Estado 1)"
    requirement: INST-02
    verification:
      - kind: unit
        ref: "__tests__/InstallScreen.test.tsx#Estado 1 (ios=true, safari=true): renderiza os 3 StepRow com a copy exata do UI-SPEC"
        status: pass
    human_judgment: false
  - id: D2
    description: "Aluno em iOS com Chrome/Firefox vê 'Abra este link no Safari' via Notice, nunca o passo a passo (Estado 2)"
    requirement: INST-02
    verification:
      - kind: unit
        ref: "__tests__/InstallScreen.test.tsx#Estado 2 (ios=true, safari=false): renderiza a copy do Notice \"Abra este link no Safari\""
        status: pass
    human_judgment: false
  - id: D3
    description: "Visitante desktop/Android ou UA não reconhecida vê 'Abra este link no seu iPhone' com a URL atual, nunca tela em branco (Estado 3, fallback seguro)"
    requirement: INST-02
    verification:
      - kind: unit
        ref: "__tests__/InstallScreen.test.tsx#Estado 3 (ios=false): renderiza headline + URL da página, cobre desktop/Android e UA não reconhecida"
        status: pass
      - kind: unit
        ref: "__tests__/installDetection.test.ts#installDetection: isIOSDevice (helper puro) e isSafariBrowser — UAs sintéticos/vazios/desconhecidos"
        status: pass
    human_judgment: false
  - id: D4
    description: "Usuário já instalado (standalone) vê 'Você já instalou o ForçaApp' com CTA funcional, sem repetir o passo a passo (Estado 4)"
    requirement: INST-02
    verification:
      - kind: unit
        ref: "__tests__/InstallScreen.test.tsx#Estado 4 (standalone=true): renderiza chip INSTALADO + CTA que navega para homeRoute, sem repetir o passo a passo"
        status: pass
    human_judgment: false
  - id: D5
    description: "linkingInterceptor.config.screens.Instalar='instalar' e AuthNavigator registra <Stack.Screen name=\"Instalar\"> — /instalar não cai silenciosamente em Login"
    requirement: INST-02
    verification:
      - kind: other
        ref: "grep -n Instalar src/navigation/linking.ts e src/navigation/AuthNavigator.tsx (evidência literal abaixo)"
        status: pass
    human_judgment: false
  - id: D6
    description: "/instalar resolve nas 3 árvores de navegação (Auth, Onboarding, Main), com CTA do Estado 4 navegando para a rota-lar correta de cada árvore"
    requirement: INST-02
    verification:
      - kind: unit
        ref: "__tests__/navigationLinking.test.ts#linking: /instalar resolve na árvore Main (INST-02, Fase 12 Plano 01, Task 2)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Página é web-only e nunca vaza dado de usuário/telemetria — zero efeito no app nativo, zero chamada de rede, zero prop/hook de auth"
    requirement: INST-02
    verification:
      - kind: unit
        ref: "__tests__/InstallScreen.test.tsx#Platform.OS !== \"web\": retorna null e NÃO chama installDetection"
        status: pass
      - kind: other
        ref: "grep -rn fetch\\|axios\\|analytics src/utils/installDetection.ts src/screens/InstallScreen.tsx (zero matches)"
        status: pass
    human_judgment: false
  - id: D8
    description: "UAT real em iPhone Safari (fluxo completo, sem instrução verbal) — critério de sucesso 3 do ROADMAP Fase 12"
    verification: []
    human_judgment: true
    rationale: "Máquina de desenvolvimento sem toolchain nativo iOS (ver MEMORY.md) — sub-segundo do flash de loading (Pitfall 1 de 12-RESEARCH.md) e a instalação real via Safari só são confirmáveis em dispositivo físico. Deferido para o Plano 12-02, conforme já previsto em success_criteria do PLAN.md."

duration: ~35min
completed: 2026-08-15
status: complete
---

# Phase 12 Plan 01: Rota pública de instalação guiada Summary

**Rota pública `/instalar` (installDetection.ts + InstallScreen.tsx) registrada nas 3 árvores de navegação (Auth/Onboarding/Main), detectando iOS/Safari/standalone de forma síncrona e pura, com os 4 estados de copy literal do UI-SPEC e guarda web-only reutilizando o padrão de UpdateBanner.tsx.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-15 (Task 1 iniciada após leitura de contexto completa)
- **Completed:** 2026-08-15T13:19:37Z
- **Tasks:** 2/2 completas
- **Files modified:** 10 (4 novos, 6 modificados)

## Accomplishments

- `installDetection.ts` — 4 funções puras/síncronas (`isIOS`, `isSafari`, `isStandalone` + os helpers testáveis `isIOSDevice`/`isSafariBrowser`), 22 testes cobrindo tokens de UA (iPhone/iPad/Mac real/iPadOS 13+ desmascarado/Windows/vazio), CriOS/FxiOS/EdgiOS/OPiOS, e `matchMedia` ausente sem lançar.
- `InstallScreen.tsx` — orquestra os 4 estados (iOS+Safari, iOS+outro navegador, desktop/Android, standalone) com a copy literal exata de 12-UI-SPEC.md, réplica inline do chrome de `AuthLayout.tsx` (sem importá-lo), guarda `Platform.OS !== 'web' -> return null` antes de qualquer chamada de detecção.
- `/instalar` registrada nas 3 árvores: `linkingInterceptor` (Auth+Onboarding, objeto único compartilhado) + `LINKING_CONFIG` (Main) + `<Stack.Screen>`/`<BottomTab.Screen>` em cada navigator, com `homeRoute` estático por árvore (`Login`/`Questionnaire`/`Home`).
- 5ª aba escondida do bottom tab bar via `tabBarButton: () => null` (confirmado contra o source instalado de `@react-navigation/bottom-tabs@6.6.1`), com guard estrutural de regressão testado (proximidade textual entre `name="Instalar"` e `tabBarButton: () => null`).
- Suíte completa do repositório: **155 test suites / 1771 testes verdes**, `npx tsc --noEmit` limpo.

## Task Commits

Cada task foi commitada atomicamente, seguindo RED→GREEN por incremento:

1. **Task 1 (tracer): `/instalar` alcançável para o aluno deslogado**
   - `d64a609` — feat: installDetection.ts + teste (RED em commit anterior, squash para GREEN por já estar correto de primeira — ver nota de deviação)
   - `3f60dc7` — test: InstallScreen.test.tsx (RED)
   - `013d2b3` — feat: InstallScreen.tsx (GREEN)
   - `41a3802` — feat: registro em linkingInterceptor + AuthNavigator
2. **Task 2: estender para Onboarding e Main**
   - `86c4488` — test: extensão de navigationLinking.test.ts (RED)
   - `e8c4626` — feat: linkingConfig.ts + OnboardingNavigator.tsx + MainNavigator.tsx (GREEN)

**Plan metadata:** (este commit, a seguir)

_Nota TDD: o primeiro commit (`d64a609`) combina o teste de installDetection.ts e sua implementação num único commit `feat`, em vez do padrão RED-commit/GREEN-commit separado usado no restante do plano — ver `## Deviations from Plan`._

## Files Created/Modified

- `src/utils/installDetection.ts` — `isIOS`/`isSafari`/`isStandalone` + helpers puros `isIOSDevice`/`isSafariBrowser`
- `src/screens/InstallScreen.tsx` — orquestra os 4 estados + `StepRow` local
- `src/navigation/linking.ts` — `linkingInterceptor.config.screens.Instalar='instalar'`
- `src/navigation/linkingConfig.ts` — `LINKING_CONFIG.screens.Instalar='instalar'` (top-level)
- `src/navigation/AuthNavigator.tsx` — `<Stack.Screen name="Instalar">` (homeRoute="Login")
- `src/navigation/OnboardingNavigator.tsx` — `OnboardingStackParamList.Instalar` + `<Stack.Screen name="Instalar">` (homeRoute="Questionnaire")
- `src/navigation/MainNavigator.tsx` — `MainTabParamList.Instalar` + `<BottomTab.Screen tabBarButton: () => null>` (homeRoute="Home")
- `__tests__/installDetection.test.ts` — 22 testes unitários
- `__tests__/InstallScreen.test.tsx` — 7 testes RTL (4 estados + guarda web-only + ausência de auth)
- `__tests__/navigationLinking.test.ts` — +2 testes (resolução `/instalar` na árvore Main + guard estrutural `tabBarButton`)

## Decisions Made

- `useNavigation<any>()` no CTA do Estado 4 (mesmo padrão já usado em `ExercisePickerScreen.tsx`) — `InstallScreen` monta em 3 árvores com tipos de navigator distintos (AuthNavigator sem generic; Onboarding/Main tipados com `ParamList`s diferentes), então não existe um tipo único de `navigation` que sirva aos três pontos de registro sem `any`.
- Guard de regressão do Pitfall 2 (`tabBarButton: () => null`) implementado como teste de PROXIMIDADE textual (≤200 caracteres entre `name="Instalar"` e a string `tabBarButton: () => null` em `MainNavigator.tsx`), exatamente como especificado no plano — evita falso-positivo se uma tela futura também usar essa opção.
- Copy do Estado 2 usa `Notice`'s `title`/`description` para carregar, respectivamente, o "Body" e a "Instruction" do UI-SPEC (o "Display headline" da tabela vira o `<Text>` de headline fora do `Notice`) — reflete literalmente o mapeamento já especificado no `<action>` da Task 1 do plano.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Comando de verificação `-x` do jest não existe nesta versão (jest 29.7.0)**
- **Found during:** Task 1, antes do primeiro `npx jest ... -x`
- **Issue:** O plano especifica `npx jest <arquivo> -x` em todos os `<verify>`/`<acceptance_criteria>`, mas jest 29 rejeita `-x` como "Unrecognized CLI Parameter" (não é alias de `--bail` nesta versão).
- **Fix:** Todas as execuções de verificação usaram `--bail` (semântica equivalente: para no primeiro teste que falhar) em vez de `-x`.
- **Files modified:** nenhum (só o comando de invocação da verificação, não o código)
- **Verification:** `npx jest <arquivo> --bail` executou normalmente em todas as chamadas deste plano, saindo com código 0 em cada GREEN.
- **Committed in:** n/a (deviação de comando de verificação, não de código)

**2. [Nota de processo, não deviação de comportamento] Primeiro commit de installDetection.ts combina teste+implementação**
- **Found during:** Task 1, primeiro incremento
- **Issue:** O RED de `installDetection.test.ts` foi confirmado via `npx jest --bail` (módulo inexistente), mas o commit subsequente juntou teste+implementação num único `feat` em vez de dois commits separados `test`/`feat` (padrão seguido rigorosamente no restante do plano: `InstallScreen` e a extensão de `navigationLinking.test.ts` têm commit `test` RED seguido de commit `feat` GREEN).
- **Fix:** Nenhum código foi alterado — só o padrão de commit ficou inconsistente neste primeiro incremento. RED foi confirmado e reportado com evidência literal antes da implementação (ver transcript: "Cannot find module '../src/utils/installDetection'").
- **Files modified:** nenhum
- **Verification:** `git log --oneline` mostra `d64a609` como único commit para este par teste+implementação; os pares seguintes (`3f60dc7`+`013d2b3`, `86c4488`+`e8c4626`) seguem RED/GREEN em commits distintos.
- **Committed in:** `d64a609`

---

**Total deviations:** 1 auto-fixed (comando de verificação), 1 nota de processo (sem impacto em comportamento/teste)
**Impact on plan:** Nenhum impacto em correção, segurança ou escopo. Todos os `must_haves.truths` e `acceptance_criteria` do PLAN.md foram verificados com evidência literal (ver Task Commits e coverage acima).

## Issues Encountered

None além do já documentado em Deviations.

## User Setup Required

None - no external service configuration required. Nenhuma dependência nova (Package Legitimacy Audit de 12-RESEARCH.md: not applicable).

## Known Stubs

None.

## Threat Flags

None - todas as superfícies novas (`installDetection.ts`, `InstallScreen.tsx`, registro em 3 navigators) já estavam mapeadas no `<threat_model>` do plano (T-12-01 a T-12-05), com mitigação verificada nos testes (ausência de auth/telemetria) e por revisão manual (nomes de rota estáticos, sem input dinâmico).

## Next Phase Readiness

- Critérios de sucesso 1 e 2 do ROADMAP Fase 12 (rota `/instalar` com passo a passo; detecção de standalone sem repetir o passo a passo) fechados nos 3 estados de sessão.
- Critério de sucesso 3 (UAT do dono/aluno num iPhone real) fica para o Plano 12-02 — esta máquina de desenvolvimento não tem toolchain nativo iOS (ver `.claude/projects/-Users-phmarconato-ForcaApp/memory/maquina-sem-toolchain-nativa.md`), então o flash de loading pré-`NavigationContainer` (Pitfall 1 de 12-RESEARCH.md) e a instalação real via ícone "Compartilhar" do Safari só são confirmáveis em dispositivo físico.
- Nenhum bloqueio conhecido para o Plano 12-02.

## Self-Check: PASSED

- FOUND: src/utils/installDetection.ts
- FOUND: src/screens/InstallScreen.tsx
- FOUND: __tests__/installDetection.test.ts
- FOUND: __tests__/InstallScreen.test.tsx
- FOUND commit d64a609
- FOUND commit 3f60dc7
- FOUND commit 013d2b3
- FOUND commit 41a3802
- FOUND commit 86c4488
- FOUND commit e8c4626

---
*Phase: 12-p-gina-de-instala-o-guiada*
*Completed: 2026-08-15*
