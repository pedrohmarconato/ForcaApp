---
phase: 14-funda-o-nativa
verified: 2026-08-16T22:30:00Z
status: passed
score: 3/4 must-haves verified
behavior_unverified: 1
overrides_applied: 1
overrides:
  - truth: "ROADMAP Success Criterion 1 — fluxo de sessão de treino sem diferença percebida em relação ao PWA"
    type: override_closeout
    decided_by: owner
    decided_on: 2026-08-16
    owner_words: "Deixar em aberto e fechar o resto"
    rationale: >
      O critério continua SEM evidência de UAT e NÃO está sendo declarado
      satisfeito — o override fecha a fase, não a lacuna. O dono optou
      explicitamente, com a causa já diagnosticada em sessão, por encerrar a
      Fase 14 e exercitar este item junto com a migração para o Supabase de
      produção, trabalho já rastreado como pendência. Mesmo padrão
      override_closeout registrado para as fases 6-8 em v1.2-ROADMAP.md.
    reopens_when: "EXPO_PUBLIC_SUPABASE_URL apontar para o Supabase de produção; repetir a Sessão 2 UAT apenas para o item fluxo_de_treino"
    tracked_in: ".planning/todos/pending/backend-supabase-producao-no-aparelho.md"
gaps:
  - truth: "O dono abre o app nativo instalado no iPhone (fora do Expo Go), assinado com Apple ID pessoal, e usa o fluxo normal de sessão de treino sem diferença percebida em relação ao PWA. (ROADMAP Success Criterion 1)"
    status: deferred-by-owner-override
    reason: >
      O dono NÃO conseguiu exercitar o fluxo de treino real no aparelho: o
      login não completa porque EXPO_PUBLIC_SUPABASE_URL aponta para
      127.0.0.1:54321, que dentro do iPhone resolve para o próprio aparelho
      (não o Mac), e o Supabase local sequer estava em execução. Na UAT da
      Sessão 2 física (Plano 14-09), o dono respondeu literalmente "em aberto
      — Deixar em aberto e fechar o resto" para este item — não PASS, não
      FAIL forçado, uma decisão explícita e documentada de adiar. Isto não é
      uma omissão descoberta pelo verificador: o executor já diagnosticou a
      causa, registrou a decisão do dono e rastreou a pendência. Mas,
      objetivamente, o Success Criterion 1 do ROADMAP ("usa o fluxo normal de
      sessão de treino sem diferença percebida em relação ao PWA") continua
      sem evidência de UAT — só os outros 3 dos 4 itens da Sessão 2
      (reassinatura, identidade visual, banner) receberam PASS/N-A do dono.
    artifacts:
      - path: ".planning/todos/pending/backend-supabase-producao-no-aparelho.md"
        issue: "Pendência rastreada, não corrigida — dono decidiu migrar para Supabase de produção depois da Fase 14, não durante ela"
      - path: ".planning/phases/14-funda-o-nativa/14-09-SUMMARY.md"
        issue: "Item 'fluxo_de_treino' registrado como 'em aberto', não PASS — coverage D4 do frontmatter tem verification: [] e human_judgment: true, com rationale explícito de bloqueio"
    missing:
      - "Apontar EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY para o Supabase de produção (ou reautenticar a CLI na conta certa) e repetir a Sessão 2 UAT só para o item 'fluxo_de_treino', OU o dono aceitar formalmente fechar a Fase 14 com este item em aberto via override (mesmo padrão override_closeout já usado nas Fases 9-13 do v1.2)"
---

# Phase 14: Fundação nativa Verification Report

**Phase Goal:** O dono instala e roda o ForçaApp nativo assinado no próprio iPhone, com a arquitetura de estado (com ou sem App Group) decidida por evidência do aparelho físico, e a extensão de widget + módulo Swift sobrevivendo a um `expo prebuild --clean`.
**Verified:** 2026-08-16T22:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dono abre o app nativo instalado (fora do Expo Go), assinado com Apple ID pessoal, e usa o fluxo normal de sessão de treino sem diferença percebida do PWA | ✗ FAILED | 14-09-SUMMARY.md: item "fluxo_de_treino" = "em aberto" (não PASS). Login não completa no aparelho (`EXPO_PUBLIC_SUPABASE_URL=127.0.0.1:54321`, inacessível a partir do iPhone). Decisão explícita do dono de adiar, rastreada em `.planning/todos/pending/backend-supabase-producao-no-aparelho.md`. App abre e mantém identidade visual (item "identidade" = PASS), mas o fluxo de treino em si nunca foi exercitado de ponta a ponta com dados reais. |
| 2 | Dono roda o comando único de reassinatura semanal documentado e o app volta a abrir sem erro de confiança/certificado | ✓ VERIFIED | `scripts/resign.sh` existe, 8 passos numerados, `npm run resign` mapeado em `package.json`. Executado fisicamente na Sessão 2 (14-09): "npm run resign → 8/8 passos, exit 0, App installed bundleID com.pmarconato.forcaapp". Resposta literal do dono: reassinatura = **PASS**. |
| 3 | Depois de `expo prebuild --clean`, o target da extensão de widget e o módulo nativo Swift continuam presentes no projeto Xcode gerado | ✓ VERIFIED | Reproduzido de forma independente nesta verificação: `bash scripts/verify-native-skeleton.sh` → exit 0, "Rodada 1: (a)-(f) OK." / "Rodada 2: (a)-(f) OK." — 2 execuções consecutivas de `expo prebuild --clean`, `session-widget` presente em `project.pbxproj`, `NativeInfoModule` linkado em `ios/Podfile.lock` (não só "descoberto" — checagem (e) prova compilação real, corrigindo um bug real de autolinking-sem-podspec encontrado durante a fase). |
| 4 | O spike de App Groups no aparelho físico está registrado por escrito, com a decisão de arquitetura documentada para orientar as Fases 15-17 | ✓ VERIFIED | `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` existe: decisão explícita "COM App Group", com respostas literais do dono (a=PASS, b=PASS) e duas evidências de máquina independentes (escrita via container puxado do device + leitura via console nativo, timestamps distintos confirmando processos separados). |

**Score:** 3/4 truths verified (0 present-but-behavior-unverified)

### Nota sobre o gap (transparência, não veredito escondido)

Este gap não foi descoberto por esta verificação — o executor da Plano 14-09 já o
diagnosticou, documentou a causa técnica exata, registrou a resposta literal do
dono ("em aberto") e criou uma pendência rastreada
(`.planning/todos/pending/backend-supabase-producao-no-aparelho.md`). O padrão é
idêntico ao `override_closeout` já usado nas Fases 9-13 (v1.2), onde UAT física
foi deliberadamente deferida com registro explícito no ROADMAP. A diferença aqui
é que esse fechamento formal (override em `ROADMAP.md` ou nesta VERIFICATION.md)
ainda não existe — por isso o item permanece como gap, não como "deferred" ou
"passed com nota".

**Isto looks intentional** (decisão do dono já registrada, não uma falha de
execução). Se o dono optar por fechar a Fase 14 agora, aceitando este item como
pendência pós-fase (mesmo padrão do v1.2), o mecanismo é adicionar ao frontmatter
desta VERIFICATION.md:

```yaml
overrides:
  - must_have: "O dono usa o fluxo normal de sessão de treino sem diferença percebida em relação ao PWA"
    reason: "Login bloqueado por backend Supabase local (127.0.0.1) inacessível do aparelho; dono decidiu migrar para Supabase de produção separadamente e testar o fluxo depois, sem bloquear o fechamento técnico da Fase 14 (NAT-01/NAT-02 entregues)"
    accepted_by: "<nome do dono>"
    accepted_at: "<timestamp ISO>"
```

Sem esse override explícito, o status permanece `gaps_found` — a alternativa é
resolver o backend e repetir só o item "fluxo_de_treino" da UAT.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app.json` | bundleIdentifier congelado (D-06) + plugins + entitlement App Group | ✓ VERIFIED | `ios.bundleIdentifier=com.pmarconato.forcaapp`, `appleTeamId=9WD49Z5TV7`, plugins `@bacons/apple-targets` + `expo-build-properties` (deploymentTarget 17.0), entitlement `com.apple.security.application-groups=[group.com.pmarconato.forcaapp.shared]` |
| `targets/session-widget/expo-target.config.js` | target widget com bundleId + entitlement idêntica | ✓ VERIFIED | `type: widget`, `bundleIdentifier: .session-widget`, mesma entitlement de App Group, idêntica a `app.json` |
| `modules/native-info/index.ts` + `ios/NativeInfoModule.swift` | módulo Swift local, expõe só a data de expiração | ✓ VERIFIED | `getProvisioningProfileExpiry()` presente nos dois lados; Swift usa `Bundle.main.path` → `Scanner` → `PropertyListDecoder` restrito a `ExpirationDate`; nunca expõe o plist bruto |
| `scripts/verify-native-skeleton.sh` | gate de regressão idempotente, 2 rodadas iguais | ✓ VERIFIED | Executado nesta verificação, exit 0, checagens (a)-(f), incluindo (f) que trava contra regressão do bug Debug/Release de `resign.sh` |
| `scripts/resign.sh` | comando único de reassinatura, 8 passos, aborta com mensagem acionável | ✓ VERIFIED | Existe, `npm run resign` mapeado, `-configuration Release` (não Debug — bug real corrigido em commit `0fd3376`, protegido por checagem (f) do gate) |
| `src/components/ProvisioningBanner.tsx` + `__tests__/ProvisioningBanner.test.tsx` | banner de expiração, montado em App.tsx | ✓ VERIFIED | Montado em `App.tsx` logo após `<UpdateBanner />`; 10/10 testes passam nesta verificação |
| `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` | decisão do spike registrada por escrito | ✓ VERIFIED | Existe, decisão COM App Group, evidência de máquina dupla |
| `modules/app-group-spike/` (removido) | scaffolding descartável deve estar ausente após a decisão | ✓ VERIFIED | Diretório ausente; nenhuma referência a `AppGroupSpike`/`app-group-spike` em `App.tsx`, `targets/session-widget/`, `package.json` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `App.tsx` | `src/components/ProvisioningBanner.tsx` | `<ProvisioningBanner />` montado após `<UpdateBanner />` | ✓ WIRED | Confirmado por `grep` em `App.tsx` |
| `ProvisioningBanner.tsx` | `modules/native-info/index.ts` | `getProvisioningProfileExpiry()` chamado no `useEffect` | ✓ WIRED | Import direto, chamada no mount, resultado no state |
| `modules/native-info/index.ts` | `NativeInfoModule.swift` | `requireNativeModule('NativeInfoModule')` | ✓ WIRED | Nome do módulo idêntico nos dois lados; **confirmado por compilação real** — `NativeInfoModule` aparece em `ios/Podfile.lock` (não só descoberto por autolinking, que já foi um bug real corrigido pela checagem (e) do gate) |
| `app.json` (`expo.plugins`) | `targets/session-widget/expo-target.config.js` | `@bacons/apple-targets` consumido no prebuild | ✓ WIRED | `session-widget` presente 28x em `ios/*.xcodeproj/project.pbxproj` após `expo prebuild --clean` reproduzido nesta verificação |
| `scripts/resign.sh` (etapa 8/8) | `scripts/verify-native-skeleton.sh` | gate final antes de considerar a reassinatura concluída | ✓ WIRED | `bash "${REPO_ROOT}/scripts/verify-native-skeleton.sh"` chamado dentro de `resign.sh`, confirmado no código-fonte |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Esqueleto nativo sobrevive a `expo prebuild --clean` (2x) | `bash scripts/verify-native-skeleton.sh` | "Rodada 1: (a)-(f) OK." / "Rodada 2: (a)-(f) OK.", exit 0 | ✓ PASS |
| `resign.sh` não regrediu para `-configuration Debug` | checagem (f) dentro do comando acima | Passou nas duas rodadas | ✓ PASS |
| Type-check completo sem regressão | `npx tsc --noEmit` | exit 0, sem erros | ✓ PASS |
| Suíte completa de testes sem regressão | `npm test` | 161 suítes / 1818 testes passaram (bate com o baseline de 14-08-SUMMARY.md) | ✓ PASS |
| Instalação física via `npm run resign` (device físico, cabo) | não executável neste ambiente (sem iPhone conectado) | — | ? SKIP — já validado fisicamente pelo dono na Sessão 2 (14-09-SUMMARY.md), com output literal colado no SUMMARY |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| NAT-01 | 14-01, 14-02, 14-03, 14-04, 14-08, 14-09 | Instalação nativa + rotina de reassinatura semanal em 1 comando | ✓ SATISFIED | `npm run resign` funciona ponta a ponta (verificado fisicamente, 14-09); app instala e mantém identidade visual (dono: PASS). A leitura estrita do texto de NAT-01 (instalação + reassinatura) está satisfeita; a cláusula mais ampla do ROADMAP SC1 ("sem diferença percebida do PWA", que exige um fluxo de treino real) NÃO está satisfeita — ver gap acima. |
| NAT-02 | 14-01, 14-02, 14-05, 14-06, 14-07 | Target de widget + módulo nativo sobrevivem a `expo prebuild --clean`; spike de App Groups documenta a arquitetura de estado | ✓ SATISFIED | Ambas as cláusulas verificadas: sobrevivência ao `--clean` reproduzida nesta verificação; spike documentado por escrito em `14-SPIKE-APP-GROUPS.md` com decisão explícita e evidência de máquina. |

Nenhum requisito órfão: `.planning/REQUIREMENTS.md` mapeia só NAT-01 e NAT-02 para a Fase 14 (linhas 99-100), e ambos aparecem no campo `requirements:` de pelo menos um plano da fase.

### Anti-Patterns Found

Nenhum. Varredura em `App.tsx`, `src/components/ProvisioningBanner.tsx`, `modules/native-info/`, `scripts/resign.sh`, `scripts/verify-native-skeleton.sh` e `targets/session-widget/expo-target.config.js` não encontrou `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` nem retornos vazios suspeitos.

### Human Verification Required

Nenhum item novo — os itens que exigiam o aparelho físico já foram exercitados e documentados literalmente pelo dono nas Planos 14-06 e 14-09 (checkpoints `human-verify`/`decision` já executados). O único ponto em aberto (fluxo de treino real) não é uma pergunta nova para o dono responder por observação — é uma decisão de fechamento de fase que só ele pode tomar: resolver o backend e repetir a UAT, ou aceitar formalmente o adiamento via override (ver seção "Nota sobre o gap" acima).

### Gaps Summary

3 dos 4 Success Criteria do ROADMAP para a Fase 14 estão comprovados por evidência
direta — 2 automatizados de forma independente nesta verificação (esqueleto
nativo sobrevive ao `--clean`; nenhuma regressão de tsc/testes) e 2 confirmados
por resposta literal do dono em sessão física com evidência de máquina anexada
(rotina de reassinatura; spike de App Groups). O componente técnico da fundação
nativa (NAT-01 na leitura estrita, NAT-02 por completo) está sólido e sem sinal
de stub, placeholder ou desvio silencioso — inclusive dois bugs reais
encontrados durante a própria execução da fase (autolinking sem compilação real
em `ios/Podfile.lock`; `resign.sh` buildando Debug em vez de Release) foram
corrigidos e ficaram protegidos por checagens automatizadas que esta verificação
confirmou estarem vivas no HEAD atual.

O único gap é o Success Criterion 1 (uso real do fluxo de treino, sem diferença
percebida do PWA): não foi exercitado porque o login não completa no aparelho
(backend apontando para `127.0.0.1`, inacessível fora do Mac). Esta é uma
decisão já tomada e documentada pelo dono ("deixar em aberto"), não uma omissão
da execução — mas, tecnicamente, o critério do ROADMAP continua sem evidência.
Fica para o dono decidir: (a) apontar o app para o Supabase de produção e
repetir só este item da UAT, ou (b) aceitar formalmente o fechamento da Fase 14
com este item pendente, via override nesta VERIFICATION.md (mesmo padrão já
usado nas Fases 9-13 do v1.2).

---

_Verified: 2026-08-16T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
