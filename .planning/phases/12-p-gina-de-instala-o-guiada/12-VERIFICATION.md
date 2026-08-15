---
phase: 12-p-gina-de-instala-o-guiada
verified: 2026-08-15T15:00:00Z
status: human_needed
score: 8/10 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Aluno leigo instala sozinho via /instalar no Safari do iPhone real, sem ajuda verbal (12-UAT.md, item 1) — inclui observar se aparece flash de \"Carregando...\" ou perda de rota (cai em Login) na visita fria deslogada, antes do NavigationContainer montar (Pitfall 1 de 12-RESEARCH.md; must_haves.truths item 9 do 12-01-PLAN.md, verification: backstop)."
    expected: "Página mostra os 3 passos no Safari iOS; a pessoa instala sem ajuda; sem flash perceptível/perda de rota na visita fria deslogada; ícone do ForçaApp aparece na Tela de Início e o app abre standalone."
    why_human: "Requer iPhone físico real — máquina de dev sem toolchain nativa iOS (Xcode/simulador), supabase-js getSession() e o timing pré-NavigationContainer só são observáveis em rede/dispositivo real, não em jsdom/CI."
  - test: "Estado \"já instalado\" adapta a mensagem (12-UAT.md, item 2)."
    expected: "Abrir /instalar DENTRO do PWA instalado (standalone) mostra \"Você já instalou o ForçaApp\" com o CTA \"Abrir o ForçaApp\", sem repetir o passo a passo."
    why_human: "Requer PWA de fato instalado num iPhone real para exercitar matchMedia('(display-mode: standalone)')/navigator.standalone reais; a versão jsdom (Estado 4) já está coberta por teste automatizado, mas o comportamento em standalone real do Safari/iOS ainda não foi observado num dispositivo."
  - test: "Outro navegador redireciona ao Safari (12-UAT.md, item 3, opcional)."
    expected: "Abrir o link em Chrome iOS (CriOS) mostra \"Abra este link no Safari\" com instrução; desktop/Android mostra a URL de fallback."
    why_human: "Reforço opcional de cobertura em dispositivo/navegador real, listado no próprio 12-UAT.md como item 3."
  - test: "Prohibition (judgment-tier, 12-01-PLAN.md must_haves.prohibitions #3): nenhum asset de screenshot/imagem pesada nova foi adicionado à página /instalar."
    expected: "Confirmação humana de que a página usa só ícones Feather já presentes no design system, sem novo asset de imagem — decisão do dono em 12-CONTEXT.md."
    why_human: "Item de verificação judgment-tier (não test-tier): a leitura de código deste verificador não encontrou nenhum import de imagem/screenshot em InstallScreen.tsx (só Feather + componentes UI existentes), mas por protocolo um item judgment-tier não é dado como resolvido silenciosamente — fica marcado para confirmação explícita no checkpoint humano de fim de fase (mesmo checkpoint do 12-02 UAT)."
---

# Phase 12: Página de instalação guiada Verification Report

**Phase Goal:** Qualquer aluno leigo consegue instalar o ForçaApp sozinho a partir do site, sem instrução verbal do dono.
**Verified:** 2026-08-15T15:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Aluno deslogado no Safari do iPhone vê os 3 passos numerados com copy literal do UI-SPEC (Estado 1) | ✓ VERIFIED | `InstallScreen.tsx:100-137` (`InstallScreenIOSSafari`); `__tests__/InstallScreen.test.tsx:51-83` asserts exact headline/step strings via `getByText`; test suite passes (confirmed independently, see below). |
| 2 | Aluno em iOS Chrome/Firefox vê "Abra este link no Safari" via Notice, nunca o passo a passo (Estado 2) | ✓ VERIFIED | `InstallScreen.tsx:141-153`; `__tests__/InstallScreen.test.tsx:85-105` asserts Notice copy AND `queryByText('Toque em Compartilhar')` is null. |
| 3 | Desktop/Android ou UA não reconhecida vê "Abra este link no seu iPhone" + URL atual, nunca tela em branco (Estado 3, fallback seguro por construção) | ✓ VERIFIED | `InstallScreen.tsx:157-176`; `installDetection.ts:15-18,30-33` — every branch returns a concrete `boolean`, no `throw`/`undefined`; `__tests__/installDetection.test.ts` covers synthetic/empty/unknown UAs (23 tests); `__tests__/InstallScreen.test.tsx:107-121`. |
| 4 | Usuário já instalado (standalone) vê "Você já instalou o ForçaApp" + CTA, sem repetir o passo a passo (Estado 4, ROADMAP critério 2) | ✓ VERIFIED | `InstallScreen.tsx:180-208`; `__tests__/InstallScreen.test.tsx:123-143` asserts chip/headline/CTA + `queryByText('Toque em Compartilhar')` is null + `fireEvent.press` navigates to `homeRoute`. |
| 5 | `linkingInterceptor.config.screens.Instalar === 'instalar'` e `AuthNavigator` registra `<Stack.Screen name="Instalar">` — aluno deslogado nunca cai silenciosamente em Login | ✓ VERIFIED | `linking.ts:117` (`config: { screens: { Instalar: CAMINHO_INSTALAR } }`); `AuthNavigator.tsx:23`; `RootNavigator.js:113` mounts `linkingInterceptor` for the no-session tree. |
| 6 | `installDetection.ts` nunca lança nem retorna `undefined` para UA/ambiente não reconhecido — todo branch degrada para `false` | ✓ VERIFIED | Read `installDetection.ts` in full: every exported function returns a `boolean` expression, guarded by `typeof navigator/window === 'undefined'` checks; no `try/catch`, no code path that can return non-boolean. |
| 7 | Página não tem efeito no app nativo: `Platform.OS !== 'web'` retorna `null` sem chamar `isIOS/isSafari/isStandalone` | ✓ VERIFIED | `InstallScreen.tsx:71` early return; `__tests__/InstallScreen.test.tsx:154-163` asserts `toJSON()` is null AND the 3 mocked detection functions are never called. |
| 8 | `InstallScreen` nunca renderiza spinner/placeholder — detecção síncrona, estado final calculado no primeiro render | ✓ VERIFIED | `InstallScreen.tsx:75-77` computes `standalone`/`ios`/`safari` synchronously (no `useEffect`, no `await`); no loading state variable exists in the component. |
| 9 | Aluno deslogado num iPhone real não vê flash perceptível de "Carregando..." antes do passo a passo (branch `loadingSession` de `RootNavigator.js` sem `NavigationContainer`) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `verification: backstop` truth. Confirmed structurally: `RootNavigator.js:92-100` returns a bare `<View>`/`ActivityIndicator` (no `NavigationContainer`) while `loadingSession \|\| isLoadingPreference` is true — matches the claimed mechanism. But whether this is *perceptible* to a real user depends on `supabase-js getSession()` timing on real network/storage, which cannot be observed in jsdom/CI. Routed to human verification (12-UAT.md item 1, explicit Pitfall-1 instruction). |
| 10 | UAT do dono/aluno real no iPhone: acessa `/instalar` pelo Safari, segue os passos sem ajuda, instala o app (ROADMAP critério de sucesso 3) | ? UNCERTAIN (human_judgment) | `12-UAT.md` exists with the 3-item checklist but is `status: testing`, `awaiting user response`, **all 3 items still `[pending]`** — not yet executed by the dono/aluno. This is the phase's own designed human checkpoint (12-02-PLAN.md, `checkpoint:human-verify`, `gate="blocking"`). |

**Score:** 8/10 truths verified (1 present + wired but behavior-unverified on this machine; 1 pending human execution)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/utils/installDetection.ts` | Pure sync UA/standalone detection, never throws | ✓ VERIFIED | Exists, substantive (60 lines, 4 exported functions + 2 pure helpers), wired into `InstallScreen.tsx`. |
| `src/screens/InstallScreen.tsx` | 4-state screen with literal UI-SPEC copy | ✓ VERIFIED | Exists, substantive (351 lines), wired into all 3 navigators. |
| `__tests__/installDetection.test.ts` | UA/standalone coverage incl. GSA fix | ✓ VERIFIED | 23 tests, all passing (independently re-run). |
| `__tests__/InstallScreen.test.tsx` | 4 states + web-only + no-auth-provider | ✓ VERIFIED | 7 tests, all passing (independently re-run). |
| `src/navigation/linking.ts` (modified) | `linkingInterceptor.config.screens.Instalar` via shared constant | ✓ VERIFIED | Line 117, imports `CAMINHO_INSTALAR` from `linkingConfig.ts` (WR-03 fix applied). |
| `src/navigation/linkingConfig.ts` (modified) | `LINKING_CONFIG.screens.Instalar` top-level, `CAMINHO_INSTALAR` constant | ✓ VERIFIED | Lines 24, 119 — sibling of Home/Training/Progress/Profile, not nested. |
| `src/navigation/AuthNavigator.tsx` (modified) | `<Stack.Screen name="Instalar">` homeRoute="Login" | ✓ VERIFIED | Line 23. |
| `src/navigation/OnboardingNavigator.tsx` (modified) | `Instalar: undefined` in `OnboardingStackParamList` + Screen homeRoute="Questionnaire" | ✓ VERIFIED | Lines 31, 90-91. |
| `src/navigation/MainNavigator.tsx` (modified) | `Instalar: undefined` in `MainTabParamList` + `tabBarButton: () => null` homeRoute="Home" | ✓ VERIFIED | Lines 92, 221-222. |
| `__tests__/navigationLinking.test.ts` (modified) | `/instalar` resolution + tabBarButton regression guard | ✓ VERIFIED | 10 tests, all passing (independently re-run). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `linkingInterceptor.config.screens.Instalar` | `AuthNavigator`'s `<Stack.Screen name="Instalar">` + `OnboardingNavigator`'s `<Stack.Screen name="Instalar">` | Same shared `linkingInterceptor` object, mounted by both trees | ✓ WIRED | `RootNavigator.js:113` (Auth) and `:168` (`ehMain ? linkingMain : linkingInterceptor`, Onboarding branch) both pass the same object; route name matches in both navigators. |
| `LINKING_CONFIG.screens.Instalar` | `MainNavigator`'s `<BottomTab.Screen name="Instalar" tabBarButton={() => null}>` | Top-level sibling key, consumed by `linkingMain` | ✓ WIRED | `linkingConfig.ts:119`; `MainNavigator.tsx:221`. |
| `InstallScreen` | `installDetection.ts` (`isIOS`/`isSafari`/`isStandalone`) | Direct import, called synchronously in render body | ✓ WIRED | `InstallScreen.tsx:32,75-77`. |
| `InstallScreen`'s Estado-4 CTA | `homeRoute` prop | 3 registration points pass static per-tree values (`Login`/`Questionnaire`/`Home`) | ✓ WIRED | `AuthNavigator.tsx:23`, `OnboardingNavigator.tsx:91`, `MainNavigator.tsx:222`; `useNavigation<any>().navigate(homeRoute)` at `InstallScreen.tsx:204`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted suite (installDetection + InstallScreen + navigationLinking) | `npx jest __tests__/installDetection.test.ts __tests__/InstallScreen.test.tsx __tests__/navigationLinking.test.ts` | 3 suites / 40 tests passed | ✓ PASS |
| Type-check | `npx tsc --noEmit -p tsconfig.json` | Exit 0, no errors | ✓ PASS |
| Full workspace suite (run once, per user's explicit request to confirm SUMMARY's claim) | `npx jest` | **155/155 suites, 1774/1774 tests passed** | ✓ PASS |
| Zero telemetry/network in the two new files | `grep -rn "fetch(\|axios\|analytics" src/utils/installDetection.ts src/screens/InstallScreen.tsx` | No matches (exit 1) | ✓ PASS |
| Zero new entry-point button in other screens | `grep -rln "'Instalar'" src/screens/` (excludes InstallScreen.tsx itself, which never references the literal route name) | No matches | ✓ PASS |
| `tabBarButton` regression guard proximity | `grep -n "tabBarButton: () => null\|name=\"Instalar\"" src/navigation/MainNavigator.tsx` | Both on line 221, same JSX attribute | ✓ PASS |
| Production route responds (deploy claim from context) | `curl -s -o /dev/null -w "%{http_code}" https://forca-app-six.vercel.app/instalar` | `200`; page shell includes PWA manifest/apple-touch tags | ✓ PASS (confirms deploy is live; client-rendered content itself not curl-verifiable, requires the human UAT below) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| INST-02 | 12-01-PLAN.md, 12-02-PLAN.md | "Usuário leigo instala sozinho pela página `/instalar` do app: passo a passo com detecção de iOS/Safari e de 'já instalado'." | ? NEEDS HUMAN | Code-side mechanism (detection, copy, 3-tree routing) fully implemented and test-verified (truths 1-8 above). The requirement's actual subject — a leigo user succeeding unaided — is only provable by the 12-02 UAT checkpoint, which exists but has not been run (`12-UAT.md`, all items `[pending]`). REQUIREMENTS.md currently marks INST-02 `[x]`/"Complete" in its traceability table — this verifier does not confirm that status as final; it is contingent on the pending UAT closing. |

No orphaned requirements: only INST-02 maps to Phase 12 in REQUIREMENTS.md's traceability table, and both plans declare it in frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/screens/InstallScreen.tsx` | 85-93 (IN-01, 12-REVIEW.md) | Redundant boolean recheck (`ios && !safari` where `!safari` is implied) | ℹ️ Info | Cosmetic only, explicitly out of `critical_warning` fix scope, confirmed still present and correctly left unfixed. |
| `src/screens/InstallScreen.tsx` | 158 (IN-02, 12-REVIEW.md) | Dead defensive branch (`window` guard unreachable given parent's `Platform.OS` guard) | ℹ️ Info | Cosmetic only, same as above. |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any of the 10 files this phase modified. All 3 Warning-level findings from the iteration-1 code review (WR-01 Rules-of-Hooks violation, WR-02 GSA misclassification, WR-03 duplicated route literal) were fixed in commits `66bdd2e`, `9ef56d5`, `268dc5c` and independently re-confirmed against the live code in this verification (not just re-stated from `12-REVIEW-FIX.iter2.md`'s claims) — see truths 1-8 evidence above, which reads the current file state, not the review report.

### Human Verification Required

1. **UAT completo do dono/aluno real no iPhone (12-UAT.md, blocking checkpoint of 12-02-PLAN.md)**
   **Test:** Acessar `https://forca-app-six.vercel.app/instalar` no Safari do iPhone, deslogado, seguir os 3 passos sem ajuda verbal, confirmar instalação na Tela de Início; reabrir `/instalar` já instalado e confirmar a mensagem "já instalado" sem repetir o passo a passo; observar se há flash de "Carregando..." ou perda de rota na visita fria.
   **Expected:** Instalação concluída sem ajuda; estado 4 mostrado corretamente na segunda visita; sem flash perceptível/perda de rota.
   **Why human:** Requer iPhone físico real (esta máquina de dev não tem toolchain nativo iOS — ver MEMORY.md); o timing de `getSession()` e o comportamento real de standalone do Safari não são observáveis em jsdom/CI.

2. **Prohibition judgment-tier: zero screenshot/asset pesado novo (12-01-PLAN.md must_haves.prohibitions #3)**
   **Test:** Confirmar visualmente que `/instalar` usa só ícones Feather do design system existente, sem nenhum novo asset de imagem.
   **Expected:** Nenhuma imagem/screenshot nova carregada pela página.
   **Why human:** Item `verification: judgment` — a leitura de código deste verificador não encontrou nenhum import de imagem em `InstallScreen.tsx`, mas por protocolo um item judgment-tier não é dado como resolvido silenciosamente; fica para confirmação explícita no mesmo checkpoint humano do item 1.

### Gaps Summary

Not applicable — no `gaps_found`. Nothing FAILED, no artifact MISSING/STUB, no key link NOT_WIRED, no blocking anti-pattern. The two automated success criteria of ROADMAP Phase 12 (rota `/instalar` com passo a passo; detecção standalone sem repetir o passo a passo) are fully code-verified and independently re-confirmed (targeted suite, full suite, tsc, grep checks, and direct code reading — not trusting SUMMARY.md's claims). The phase's third success criterion is, by the phase's own design (12-02-PLAN.md is a `checkpoint:human-verify` plan), a human-only checkpoint that has not yet been executed: `12-UAT.md` is `status: testing`, 3/3 items `[pending]`. The route is live in production (`200` on `/instalar`) and ready for that checkpoint to run.

---

_Verified: 2026-08-15T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
