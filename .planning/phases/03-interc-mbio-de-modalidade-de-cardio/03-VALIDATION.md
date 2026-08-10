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

| Req / Decisão | Behavior | Test Type | Automated Command | File Exists |
|---|---|---|---|---|
| REQ-06 / D-01 | Troca preserva `targetDurationSeconds` e zera `targetDistanceM` da série | unit (motor puro) | `npx jest __tests__/cardioSwap.test.ts` | ❌ W0 |
| REQ-06 / D-02 | Lista de troca oferece só as modalidades aceitas do usuário | unit (repositório + UI) | `npx jest __tests__/cardioModalidadesAceitas.test.ts` | ❌ W0 |
| REQ-06 / D-03, D-05 | Realizado na trocada soma no km total único do Progresso | unit (motor puro) | `npx jest __tests__/cardioGoals.test.ts` | ⚠️ conferir |
| REQ-06 / D-06 | Prescrito km/tempo da semana NÃO desconta sessão trocada | unit (motor puro `cardioPrescrito.ts`) | `npx jest __tests__/cardioPrescrito.test.ts` | ⚠️ conferir |
| REQ-06 / D-07 | Outcome under/on_target/over por TEMPO, independente da modalidade | unit (regressão de `computeCardioOutcome`) | `npx jest -t "computeCardioOutcome"` | ✅ existente |
| REQ-06 / D-08 | Histórico exibe "Remo Ergômetro · 20 min — trocado de Corrida" | unit (repositório) + integração de componente | `npx jest __tests__/sessionHistoryDetailCardio.test.ts` | ❌ W0 |
| REQ-06 / entry points | Fila e `SkipReasonSheet` levam ao mesmo seletor de troca | integração (store ↔ repositório mockado) | `npx jest __tests__/cardioSwapFluxo.test.ts` | ❌ W0 |
| REQ-06 / migration | RPC nova respeita vocabulário fechado, RLS "own", revoke de `anon`, idempotência | unit SQL (lê o `.sql` bruto e asserta, molde `recusaDeclarada.test.ts:101-112`) | `npx jest __tests__/cardioSwapMigration.test.ts` | ❌ W0 |

*As colunas Task ID / Wave / Threat Ref são preenchidas por `/gsd-execute-phase` conforme
os PLAN.md desta fase; este documento nasce em `status: draft`.*

---

## Wave 0 Requirements

- [ ] `__tests__/cardioSwap.test.ts` — D-01 (função pura de troca no motor)
- [ ] `__tests__/cardioModalidadesAceitas.test.ts` — D-02 (repositório + fallback de lista vazia)
- [ ] `__tests__/sessionHistoryDetailCardio.test.ts` — D-08 **e** o gap pré-existente
      (`getSessionLogDetail` / `descreveSerie` nunca leem `actual_duration_seconds` /
      `actual_distance_m`, `src/services/sessionExecutionRepository.ts:776-845`)
- [ ] `__tests__/cardioSwapMigration.test.ts` — migration nova (vocabulário fechado, RLS, revoke `anon`)
- [ ] Conferir se `cardioGoals.ts` / `cardioPrescrito.ts` já têm arquivo de teste próprio
      antes de decidir entre criar novo e estender existente

*Framework já instalado — Wave 0 é só criação de arquivos de teste, sem setup de infra.*

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
