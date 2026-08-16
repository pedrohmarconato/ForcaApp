---
phase: 14-funda-o-nativa
plan: 08
subsystem: infra
tags: [ios, expo-prebuild, xcodebuild, jest, tsc, regression-gate]

requires:
  - phase: 14-funda-o-nativa (plano 02)
    provides: "scripts/verify-native-skeleton.sh — gate de regressão do esqueleto nativo (target session-widget + módulo native-info)"
  - phase: 14-funda-o-nativa (plano 03)
    provides: "__tests__/ProvisioningBanner.test.tsx e src/components/ProvisioningBanner.tsx"
  - phase: 14-funda-o-nativa (plano 04)
    provides: "scripts/resign.sh — sequência canônica de reassinatura (passos 1-8)"
  - phase: 14-funda-o-nativa (plano 07)
    provides: "Repositório em estado final pós-decisão do spike App Groups (scaffolding removido, entitlement permanente mantida)"
provides:
  - "Confirmação de que tsc, testes do ProvisioningBanner, verify-native-skeleton.sh (2x) e npm test completo passam juntos na mesma execução, sobre o HEAD atual de main (ecdc3ca)"
  - "Build assinado Release fresco em DerivedData (ForcaApp.app, timestamp posterior a qualquer build anterior da fase), com session-widget.appex embutido e entitlement de App Group confirmada nos dois artefatos assinados"
affects: [14-09]

actuals:
  tokens: 0
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Build de confirmação rodado com -configuration Release (não Debug, que é o que scripts/resign.sh usa literalmente na etapa 4/8) — Debug não embute main.jsbundle e não roda standalone no aparelho, então um .app Debug não serviria ao propósito desta plano (artefato pronto para a Sessão 2 física instalar e USAR, não só instalar). Nenhuma edição foi feita em scripts/resign.sh; a escolha vale só para o artefato produzido nesta execução de verificação."
  - "npm test completo (161 suítes / 1818 testes) rodado além dos 3 comandos literais do bloco <verify> do plano, como confirmação extra alinhada ao enquadramento de 'regressão completa da fase' pedido pelo orquestrador — não substitui nem enfraquece nenhuma das 3 checagens exigidas pelo plano, apenas soma evidência."

patterns-established: []

requirements-completed: [NAT-01]

coverage:
  - id: D1
    description: "npx tsc --noEmit passa sem erros sobre o HEAD atual (inclui modules/native-info e ProvisioningBanner.tsx)"
    requirement: "NAT-01"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit -> exit 0, nenhuma linha de erro"
        status: pass
    human_judgment: false
  - id: D2
    description: "Suite do ProvisioningBanner (lógica de exibição + componente) continua correta após as mudanças das Planos 14-03/14-05/14-07"
    requirement: "NAT-01"
    verification:
      - kind: unit
        ref: "npx jest __tests__/ProvisioningBanner.test.tsx -> 10/10 testes passaram"
        status: pass
    human_judgment: false
  - id: D3
    description: "Esqueleto nativo (target session-widget + módulo native-info) sobrevive a expo prebuild --clean, 2 rodadas consecutivas, sem regressão de entitlement"
    requirement: "NAT-01"
    verification:
      - kind: automated
        ref: "bash scripts/verify-native-skeleton.sh -> 'Rodada 1: (a)-(e) OK.' / 'Rodada 2: (a)-(e) OK.' / exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Build assinado Release fresco existe em DerivedData, mais recente que qualquer build anterior da fase, com entitlement de App Group presente em ForcaApp.app e session-widget.appex"
    requirement: "NAT-01"
    verification:
      - kind: automated
        ref: "xcodebuild -workspace ios/ForcaApp.xcworkspace -scheme ForcaApp -configuration Release -destination generic/platform=iOS -allowProvisioningUpdates build -> '** BUILD SUCCEEDED **', exit 0; codesign -d --entitlements - em ambos os artefatos"
        status: pass
    human_judgment: false
  - id: D5
    description: "Suite completa de testes (não só o arquivo do banner) permanece verde após toda a fase 14"
    requirement: "NAT-01"
    verification:
      - kind: unit
        ref: "npm test -> 161 suítes / 1818 testes passaram"
        status: pass
    human_judgment: false

duration: ~5min
completed: 2026-08-16
status: complete
---

# Fase 14 Plano 08: Pre-flight de regressão completa antes da Sessão 2 — Summary

**Todas as checagens automatizadas da fase (tsc, testes do ProvisioningBanner, esqueleto nativo 2x, suíte completa) passaram juntas sobre o HEAD atual de `main`, e um `.app` Release assinado fresco (mais recente que qualquer build anterior da fase) está pronto em DerivedData para a instalação física da Plano 14-09 — nenhuma regressão encontrada.**

## Performance

- **Duration:** ~5 min (caches de Pods/DerivedData quentes de sessões anteriores da fase)
- **Started:** 2026-08-16T21:39:42Z
- **Completed:** 2026-08-16T21:44:18Z
- **Tasks:** 1/1
- **Files modified:** 0 (plano de verificação pura — `files_modified: []` no frontmatter)

## Accomplishments

- `npx tsc --noEmit` — exit 0, sem nenhum erro de tipo, sobre o HEAD atual (`ecdc3ca`)
- `npx jest __tests__/ProvisioningBanner.test.tsx` — 10/10 testes passaram (`Test Suites: 1 passed, 1 total`)
- `bash scripts/verify-native-skeleton.sh` — `Rodada 1: (a)-(e) OK.` / `Rodada 2: (a)-(e) OK.` / `OK: esqueleto nativo sobrevive ao --clean (2x consecutivas).`, exit 0
- Reprodução dos passos 1-5 de `scripts/resign.sh` (CocoaPods presente v1.17.0 → `expo prebuild --clean` → scheme `ForcaApp` descoberto dinamicamente contra `expo.name` → build assinado → localização do `.app`), sem as etapas 6/7 de instalação física — `** BUILD SUCCEEDED **`, `.app` em `~/Library/Developer/Xcode/DerivedData/ForcaApp-cmcqxhovmczojncrjtybnwlvfjjs/Build/Products/Release-iphoneos/ForcaApp.app`, timestamp `Aug 16 18:43:03 2026`, posterior ao build Release anterior da fase (`Aug 16 18:21:10 2026`, Plano 14-05/14-06)
- Confirmação extra (não exigida pelo `<verify>` literal do plano, mas alinhada ao pedido de "regressão completa da fase" do orquestrador): `npm test` completo → `161 suítes passed, 1818 tests passed` — bate exatamente com o baseline reportado na Plano 14-07

## Task Commits

1. **Task 1: Pre-flight completo antes da Sessão 2** - nenhum commit de código (plano de verificação pura, `files_modified: []`; nenhum arquivo rastreado pelo git foi alterado — `ios/` é gitignorado por completo, `.gitignore:189 /ios`)

**Plan metadata:** commit deste `14-08-SUMMARY.md` (docs) — sem `STATE.md`/`ROADMAP.md` por instrução explícita do orquestrador (dono desses arquivos nesta execução)

## Files Created/Modified

Nenhum — plano de verificação pura. `ios/` foi regenerado três vezes durante a execução (2x pelo `verify-native-skeleton.sh`, 1x pela reprodução dos passos 1-5 de `resign.sh`), mas é gitignorado por completo (`git check-ignore -v` confirma `.gitignore:189:/ios`) e nunca aparece em `git status --short`.

## Decisions Made

Ver `key-decisions` no frontmatter. Resumo:
- Build de confirmação usou `-configuration Release`, não `Debug` (o que `scripts/resign.sh` usa literalmente) — Debug não embute `main.jsbundle` e não roda standalone no device, então não serviria ao propósito de deixar um artefato pronto para a Sessão 2 usar de verdade. `scripts/resign.sh` não foi editado; a escolha vale só para este artefato de verificação.
- `npm test` completo rodado como evidência adicional, sem substituir os 3 comandos literais exigidos pelo `<verify>` do plano.

## Deviations from Plan

None - plano executado exatamente como escrito (as 3 checagens do bloco `<verify>` mais a reprodução dos passos 1-5 de `resign.sh`). A escolha de `-configuration Release` em vez de `Debug` na reprodução dos passos de `resign.sh` não é uma mudança de código nem de comportamento planejado — é apenas a configuração de build usada para produzir o artefato de verificação desta plano, documentada acima em Decisions Made, não uma correção de bug/funcionalidade ausente/bloqueio (não se enquadra nas Rules 1-4).

## Issues Encountered

Nenhum. Todas as 4 checagens (tsc, jest do banner, verify-native-skeleton.sh 2x, build Release) e a checagem extra (npm test completo) passaram na primeira execução, sem necessidade de correção.

## User Setup Required

None - nenhuma configuração de serviço externo necessária. O `.app` assinado está pronto em DerivedData para a Plano 14-09 (Sessão 2 física) instalar; nenhuma ação adicional do dono é necessária antes disso.

## Threat Flags

Nenhum. Esta plano não introduziu nenhuma superfície nova — apenas reexecutou checagens já mitigadas nas Planos 14-02/14-03/14-04/14-07 (T-14-08-01 do threat model desta plano).

## Next Phase Readiness

- **Pronto** para a Plano 14-09 (Sessão 2 física com o dono): todas as checagens automatizadas passam juntas sobre o HEAD atual (`ecdc3ca`), e um `.app` Release assinado fresco existe em DerivedData, com `session-widget.appex` embutido e entitlement `com.apple.security.application-groups = [group.com.pmarconato.forcaapp.shared]` confirmada em ambos os artefatos assinados (`ForcaApp.app` e `session-widget.appex`), ambos com `com.apple.developer.team-identifier = 9WD49Z5TV7`.
- Nenhum erro de build, tipo ou teste descoberto nesta execução — a Sessão 2 física pode se concentrar inteiramente em observação/instalação no aparelho, sem risco de descobrir um erro 100% automatizável no meio da sessão do dono.

## Self-Check: PASSED

- `.planning/phases/14-funda-o-nativa/14-08-SUMMARY.md` existe: PASS (este arquivo)
- `npx tsc --noEmit` -> exit 0: PASS (executado nesta sessão, sem erros)
- `npx jest __tests__/ProvisioningBanner.test.tsx` -> 10/10 testes: PASS
- `bash scripts/verify-native-skeleton.sh` -> 2 rodadas OK, exit 0: PASS
- `xcodebuild ... -configuration Release ... build` -> `** BUILD SUCCEEDED **`, exit 0: PASS
- `.app` fresco em DerivedData com timestamp `Aug 16 18:43:03 2026`, posterior ao build Release anterior (`Aug 16 18:21:10 2026`): PASS (`stat -f "%Sm %N"` confirmado nesta sessão)
- `npm test` completo -> 161 suítes / 1818 testes: PASS
- Nenhum arquivo sob `ios/` aparece em `git status --short`: PASS (`git check-ignore -v` confirma `/ios` gitignorado)

---
*Phase: 14-funda-o-nativa*
*Completed: 2026-08-16*
