---
phase: 3
slug: interc-mbio-de-modalidade-de-cardio
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derivado de `03-RESEARCH.md` → `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 com preset `jest-expo` (`package.json:88,107-121`) |
| **Config file** | embutido em `package.json` (`"jest": {...}`, linhas 107-121) — não há `jest.config.js` separado |
| **Quick run command** | `npx jest __tests__/<arquivo>.test.ts` |
| **Full suite command** | `npx tsc --noEmit && npx jest` |
| **Estimated runtime** | ~60–120 s (suíte completa); < 10 s por arquivo isolado |

> **Portão de leitura obrigatório (`AGENTS.md:70`):** a suíte completa pode sair com
> exit code 1 mesmo com todos os testes verdes (handle aberto do Jest). **Nunca** usar o
> exit code isolado como critério de aceite — ler o resumo `Tests: X passed`. Este
> projeto não tem CI; toda verificação é local (`tsc` + `jest` + `pytest`).

---

## Sampling Rate

- **After every task commit:** `npx jest __tests__/<arquivo tocado>.test.ts`
- **After every plan wave:** `npx tsc --noEmit && npx jest` (conferir `Tests: X passed`)
- **Before `/gsd-verify-work`:** suíte completa verde
- **Phase gate:** suíte verde + (se a migration nova for aplicada) preflight
  staging → prod via `scripts/supabase-preflight.sh`, registrado como
  `checkpoint:decision` — mesmo precedente da migration 0033 na Fase 2
  (`.planning/phases/02-anamnese-e-calibra-o-do-cardio/02-02-PLAN.md:149`)
- **Max feedback latency:** 120 s

---

## Phase Requirements → Test Map

*Nomes de arquivo alinhados aos 6 PLAN.md após o plan-checker (2026-08-09). A versão semeada
antes do planejamento previa um `__tests__/sessionHistoryDetailCardio.test.ts` que os plans
substituíram por extensão de dois arquivos já existentes.*

| Req / Decisão | Behavior | Plan | Test Type | Automated Command | File Exists |
|---|---|---|---|---|---|
| REQ-06 / D-01 | Troca preserva `targetDurationSeconds` e zera `targetDistanceM` da série | 03-02 | unit (motor puro) | `npx jest __tests__/cardioSwap.test.ts` | ❌ W0 |
| REQ-06 / D-02 | Lista de troca oferece só as modalidades aceitas do usuário | 03-02 | unit (repositório) | `npx jest __tests__/cardioModalidadesAceitas.test.ts` | ❌ W0 |
| REQ-06 / D-03, D-05 | Realizado na trocada soma no km total único do Progresso | 03-06 | unit (motor puro `cardioGoals.ts`) | `npx jest __tests__/cardioGoals.test.ts` | ✅ estender |
| REQ-06 / D-04 | Campo de distância realizada só aparece em modalidade do subset com distância | 03-02, 03-03 | unit + componente | `npx jest __tests__/cardioSwap.test.ts __tests__/cardioTempoDistancia.test.ts` | ❌ W0 + ✅ estender |
| REQ-06 / D-06 | Prescrito km/tempo da semana NÃO desconta sessão trocada | 03-06 | unit (motor puro `cardioPrescrito.ts`) | `npx jest __tests__/cardioPrescrito.test.ts __tests__/cardioPrescritoSecao.test.tsx` | ✅ estender |
| REQ-06 / D-07 | Outcome under/on_target/over por TEMPO, independente da modalidade | 03-02 | regressão (prova por `computeCardioOutcome` intocada) | `npx jest __tests__/sessionModel.test.ts` | ✅ existente |
| REQ-06 / D-08 | Histórico exibe "Remo Ergômetro · 20 min — trocado de Corrida" | 03-05 | unit (repositório) + componente | `npx jest __tests__/sessionExecutionRepository.test.ts __tests__/sessionHistory.test.tsx` | ✅ estender |
| REQ-06 / entry point 1 | Fila da sessão abre o `SwapModalitySheet` | 03-03 | componente + integração | `npx jest __tests__/swapModalitySheet.test.tsx __tests__/activeSessionScreen.test.tsx` | ❌ W0 + ✅ estender |
| REQ-06 / entry point 2 | Ramo `sem_equipamento` do `SkipReasonSheet` oferece substituição | 03-04 | componente | `npx jest __tests__/skipReasonSheetTroca.test.tsx` | ❌ W0 |
| REQ-06 / fluxo | Servidor primeiro: falha da RPC não aplica a troca ao draft local | 03-02 | integração (store ↔ repositório mockado) | `npx jest __tests__/cardioSwapFluxo.test.ts` | ❌ W0 |
| REQ-06 / migration | RPC nova respeita vocabulário fechado, RLS "own", revoke de `anon`, idempotência | 03-01 | unit SQL (lê o `.sql` bruto e asserta, molde `recusaDeclarada.test.ts:101-112`) | `npx jest __tests__/cardioSwapMigration.test.ts` | ❌ W0 |

*As colunas Task ID / Wave / Threat Ref são preenchidas por `/gsd-execute-phase` conforme
os PLAN.md desta fase. O documento permanece em `status: draft`: a promoção para
`validated` / `nyquist_compliant: true` pertence a `/gsd-validate-phase` §6, não ao plan-phase.*

---

## Wave 0 Requirements

**Arquivos novos (6):**

- [ ] `__tests__/cardioSwap.test.ts` — D-01 / D-04 (função pura de troca no motor) · plan 03-02
- [ ] `__tests__/cardioModalidadesAceitas.test.ts` — D-02 (repositório de modalidades aceitas) · plan 03-02
- [ ] `__tests__/cardioSwapFluxo.test.ts` — servidor-primeiro (falha da RPC não aplica ao draft) · plan 03-02
- [ ] `__tests__/cardioSwapMigration.test.ts` — migration nova (vocabulário fechado, RLS, revoke `anon`) · plan 03-01
- [ ] `__tests__/swapModalitySheet.test.tsx` — seletor de modalidade compartilhado · plan 03-03
- [ ] `__tests__/skipReasonSheetTroca.test.tsx` — ramo `sem_equipamento` oferecendo substituição · plan 03-04

**Arquivos existentes a estender (6):**

- [ ] `__tests__/sessionExecutionRepository.test.ts` + `__tests__/sessionHistory.test.tsx` — D-08 **e**
      o gap pré-existente (`getSessionLogDetail` / `descreveSerie` nunca leem
      `actual_duration_seconds` / `actual_distance_m`, `src/services/sessionExecutionRepository.ts:776-845`) · plan 03-05
- [ ] `__tests__/cardioGoals.test.ts` — D-03 / D-05 (soma única de km) · plan 03-06
- [ ] `__tests__/cardioPrescrito.test.ts` + `__tests__/cardioPrescritoSecao.test.tsx` — D-06 (prescrito cheio) · plan 03-06
- [ ] `__tests__/activeSessionScreen.test.tsx` + `__tests__/cardioTempoDistancia.test.ts` — pontos de entrada e campo de distância · plans 03-03 / 03-04

*Item em aberto da pesquisa resolvido pelo pattern-mapper: `cardioGoals.test.ts` e
`cardioPrescrito.test.ts` **já existem** — estender, não criar.*

*Framework já instalado — Wave 0 é só criação/extensão de arquivos de teste, sem setup de infra.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Aplicação da migration em staging e produção | REQ-06 | Toca banco real; exige credenciais e janela de aplicação | `scripts/supabase-preflight.sh` contra staging `mjdjtiujhwklchalquhc`, conferir `supabase/.temp/project-ref`, só então prod `zanqygwsgxkyjiuhrzju` (`AGENTS.md`) |
| Aparência do seletor de modalidade nos dois pontos de entrada | REQ-06 | Layout e toque em dispositivo; Jest cobre a lógica, não o render final | Abrir sessão com cardio → "Trocar modalidade" na fila; repetir pelo ramo `sem_equipamento` do `SkipReasonSheet` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
