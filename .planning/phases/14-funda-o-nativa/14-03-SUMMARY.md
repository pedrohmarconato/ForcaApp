---
phase: 14-funda-o-nativa
plan: 03
subsystem: client
tags: [ios, expo-modules, provisioning-profile, banner, tdd]

# Dependency graph
requires:
  - phase: 14-funda-o-nativa (plano 02)
    provides: "modules/native-info scaffolded e sobrevivendo a expo prebuild --clean"
provides:
  - "getProvisioningProfileExpiry() (index.ts + NativeInfoModule.swift): única lógica Swift genuinamente necessária nesta fase (D-03), lê embedded.mobileprovision e expõe SÓ a data de expiração ISO-8601"
  - "shouldShowProvisioningBanner(expiryDate, now): função pura testável isoladamente, limite <=2 dias inclusivo"
  - "ProvisioningBanner montado em App.tsx: único sinal visível no app de que a rotina de reassinatura semanal (D-01, Plano 14-04) precisa rodar"
affects: [14-04, 14-06, 14-09]

actuals:
  tokens: 3580
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns: ["Módulo Expo local expõe só o dado derivado necessário, nunca a estrutura bruta lida (aplica o mesmo princípio de minimização de superfície do App Group, RESEARCH.md Security Domain)"]

key-files:
  created:
    - src/components/ProvisioningBanner.tsx
    - __tests__/ProvisioningBanner.test.tsx
  modified:
    - modules/native-info/ios/NativeInfoModule.swift
    - modules/native-info/index.ts
    - App.tsx

key-decisions:
  - "Componente só grava expiryDate no state quando a leitura nativa resolve com valor não-nulo (evita new Date(null) -> Invalid Date quando o profile não existe, ex.: Simulator)"
  - "formatWeekday usa Intl.DateTimeFormat('pt-BR', { weekday: 'long' }) com primeira letra maiúscula — sem dependência nova, sem hardcode de nomes de dia"

patterns-established:
  - "TDD completo (RED->GREEN) para componente de UI com módulo nativo mockado via jest.mock — módulo nativo real fica manual-only (device físico), lógica de decisão e wiring do componente ficam 100% testáveis"

requirements-completed: [NAT-01]

coverage:
  - id: D1
    description: "getProvisioningProfileExpiry() expõe só a data, nunca o plist bruto (T-14-03-01)"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "NativeInfoModule.swift AsyncFunction retorna ISO8601DateFormatter().string(from:) ou nil — nenhum outro campo do plist é mapeado nem exposto; index.ts.getProvisioningProfileExpiry() só repassa a string/null"
        status: pass
    human_judgment: false
  - id: D2
    description: "shouldShowProvisioningBanner cobre o caso-limite de adjacência (exatamente 2 dias) e o caso expirado"
    requirement: "NAT-01"
    verification:
      - kind: automated_test
        ref: "npx jest __tests__/ProvisioningBanner.test.tsx — 10/10 passed, incluindo os 3 casos de shouldShowProvisioningBanner e os 6 casos de comportamento do componente (Platform.OS web/android/ios, leitura pendente, >2 dias, caso-limite, expirado, texto+testID)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ProvisioningBanner montado em App.tsx imediatamente depois de UpdateBanner"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "App.tsx linha com <ProvisioningBanner /> logo após <UpdateBanner />, antes de <AlertHost />, dentro de <AuthProvider>"
        status: pass
    human_judgment: false
  - id: D4
    description: "Type-check e suíte completa sem regressão"
    requirement: "NAT-01"
    verification:
      - kind: automated_test
        ref: "npx tsc --noEmit exit 0; npx jest --silent (suíte completa) 161/161 suites, 1818/1818 testes, sem falha"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-16
status: complete
---

# Fase 14 Plano 03: Banner de validade do provisioning profile (D-03) — Summary

**A única lógica Swift genuinamente necessária nesta fase — ler `embedded.mobileprovision` e expor só a data de expiração — está implementada, testada via TDD completo, e o banner resultante já está montado em `App.tsx`, expondo só o dia da semana quando faltam <=2 dias para o provisioning profile expirar.**

## Performance

- **Duration:** ~25min
- **Tasks:** 2/2 completas
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments

- `modules/native-info/ios/NativeInfoModule.swift`: função `readProvisioningProfileExpiry() -> Date?` substitui a função de exemplo default do scaffold (Plano 14-02), seguindo literalmente RESEARCH.md Pattern 3 — `Bundle.main.path` → `NSString` Latin-1 → `Scanner` isola `<plist>...</plist>` → `PropertyListDecoder` decodifica `MobileProvision { let expirationDate }` via `CodingKeys.expirationDate = "ExpirationDate"`. Exposta como `AsyncFunction("getProvisioningProfileExpiry")` retornando `ISO8601DateFormatter().string(from:)` ou `nil`.
- `modules/native-info/index.ts`: `export async function getProvisioningProfileExpiry(): Promise<string | null>` chamando o binding nativo — nunca retorna o plist inteiro (T-14-03-01 mitigado).
- `src/components/ProvisioningBanner.tsx`: `shouldShowProvisioningBanner(expiryDate, now)` pura exportada + componente que só chama o módulo nativo em iOS, uma vez no mount, com dois early-returns (`Platform.OS !== 'ios'`, depois `!expiryDate || !shouldShowProvisioningBanner`). JSX reusa a estrutura fixa de `UpdateBanner.tsx` (posição, `zIndex.toast`, `elevation.floating`, `surface.card`), com um único `Text` — sem botões de ação (D-03: aviso, não sistema de notificação).
- `__tests__/ProvisioningBanner.test.tsx`: 10 testes cobrindo os 3 casos da lógica pura + os 6 casos de comportamento do bloco `behavior` do plano (Platform.OS web/android → null sem chamar o módulo nativo; leitura pendente → null; >2 dias → null; caso-limite de exatamente 2 dias → visível; expirado → visível; texto com dia da semana em pt-BR + `testID="provisioning-banner"`).
- `App.tsx`: `<ProvisioningBanner />` montado imediatamente depois de `<UpdateBanner />`, dentro de `<AuthProvider>`, antes de `<AlertHost />`.

## Task Commits

1. **Task 1 (NativeInfoModule.swift + index.ts)** - `5b8b63f` (feat)
2. **Task 2 RED (teste falhando)** - `b833afe` (test)
3. **Task 2 GREEN (componente + montagem em App.tsx)** - `df79197` (feat)

## Files Created/Modified

- `modules/native-info/ios/NativeInfoModule.swift` — função de exemplo default substituída por `readProvisioningProfileExpiry()` + `AsyncFunction("getProvisioningProfileExpiry")`
- `modules/native-info/index.ts` — export `getProvisioningProfileExpiry(): Promise<string | null>`
- `src/components/ProvisioningBanner.tsx` — novo, `shouldShowProvisioningBanner` + componente default export
- `__tests__/ProvisioningBanner.test.tsx` — novo, 10 casos
- `App.tsx` — import + montagem de `<ProvisioningBanner />`

## Decisions Made

- **`new Date(iso)` só é gravado no state quando `iso` é truthy.** Se o módulo nativo resolver com `null` (esperado no Simulator — arquivo `embedded.mobileprovision` ausente), `expiryDate` permanece `null` em vez de virar `Invalid Date` — evita que `shouldShowProvisioningBanner` receba uma data inválida silenciosamente.
- **Dia da semana via `Intl.DateTimeFormat('pt-BR', { weekday: 'long' })`**, sem nova dependência e sem tabela de nomes hardcoded — primeira letra capitalizada manualmente (a API retorna minúsculo em pt-BR).

## Deviations from Plan

Nenhuma. Plano executado como escrito: `<action>` de ambas as tasks seguido literalmente, incluindo a estrutura RED→GREEN da Task 2 (`tdd="true"`).

## TDD Gate Compliance

- RED: `b833afe` (`test(14-03): add failing test for ProvisioningBanner`) — confirmado falhando (`Cannot find module '../src/components/ProvisioningBanner'`) antes de qualquer implementação.
- GREEN: `df79197` (`feat(14-03): implement ProvisioningBanner and mount in App.tsx`) — `npx jest __tests__/ProvisioningBanner.test.tsx` 10/10 passed depois da implementação.
- REFACTOR: não aplicável — nenhuma limpeza necessária depois do GREEN.

Gate sequence OK: test(...) antes de feat(...).

## Issues Encountered

Nenhum. `npm install --no-audit --no-fund` (node_modules ausente no worktree fresco) rodou sem erro (1579 pacotes, patch-package aplicado). Nenhum bloqueio de ambiente nesta plano — CocoaPods/Xcode não são exigidos aqui (nenhum build nativo real, só `tsc`/`jest`).

## User Setup Required

None. Comportamento real do módulo Swift em device físico (leitura de `embedded.mobileprovision` de verdade, banner aparecendo <=2 dias antes da expiração real) é manual-only (RESEARCH.md Validation Architecture) — validado fisicamente nas Planos 14-06/14-09, não nesta plano.

## Next Phase Readiness

- Pronto para a Plano 14-04 (script de reassinatura, D-01) — o banner já existe como sinal visível de quando a rotina precisa rodar.
- `getProvisioningProfileExpiry()` está disponível para qualquer plano futuro que precise ler a expiração do provisioning profile, com a mesma garantia de minimização de dado (só a data, nunca o plist bruto).

## Threat Flags

Nenhum novo — os dois threats do `<threat_model>` do plano (T-14-03-01 mitigate, T-14-03-02 accept) já estavam mapeados e ambos verificados como cumpridos nesta implementação (ver `coverage` acima).

## Self-Check: PASSED

- `src/components/ProvisioningBanner.tsx` existe: PASS
- `__tests__/ProvisioningBanner.test.tsx` existe: PASS
- `modules/native-info/ios/NativeInfoModule.swift` contém `func readProvisioningProfileExpiry` e `case expirationDate = "ExpirationDate"`: PASS
- `modules/native-info/index.ts` exporta `getProvisioningProfileExpiry`: PASS
- Commits `5b8b63f`, `b833afe`, `df79197` existem em `git log`: PASS
- `npx tsc --noEmit` exit 0: PASS
- `npx jest __tests__/ProvisioningBanner.test.tsx` 10/10 passed: PASS
- Suíte completa `npx jest --silent` 161/161 suites, 1818/1818 testes, sem regressão: PASS

---
*Phase: 14-funda-o-nativa*
*Completed: 2026-08-16*
