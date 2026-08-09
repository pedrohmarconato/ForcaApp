---
phase: 1
slug: fluxo-cardio-e-alongamento
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (`jest-expo` preset) no frontend; pytest 8 no backend |
| **Config file** | `package.json` (bloco `jest`); `backend/tests/conftest.py` |
| **Quick run command** | `npx jest <arquivo>.test.ts[x] --silent` / `python3 -m pytest backend/tests/test_<modulo>.py -q` |
| **Full suite command** | `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q` (não usar o exit code do `--runInBand` como portão — `AGENTS.md`) |
| **Estimated runtime** | ~90s (jest full) + ~40s (pytest full) |

---

## Sampling Rate

- **After every task commit:** Run o comando `<automated>` específico do PLAN.md da task.
- **After every plan wave:** Run `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q` + `npx tsc --noEmit`.
- **Before `/gsd-verify-work`:** Full suite must be green (jest + pytest + tsc).
- **Max feedback latency:** ~130s (full suite, sem CI — verificação sempre local per AGENTS.md).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|------------------|-----------|--------------------|-------------|--------|
| 01-01-1 | 01-01 | 1 | REQ-01 | T-01-01 | Confirma runtime real antes de "consertar" (Assumption A1) | regression | `npx jest __tests__/sessionPlayerTransitions.test.tsx __tests__/manualExerciseRow.test.tsx --silent` | ❌ W0 (manualExerciseRow.test.tsx novo) | ⬜ pending |
| 01-01-2 | 01-01 | 1 | REQ-01 | T-01-01 | Distância exibida em pt-BR, nunca "NaN km"/valor cru | unit | `npx jest __tests__/manualExerciseRow.test.tsx --silent` | ❌ W0 (novo, criado na 1) | ⬜ pending |
| 01-02-1 | 01-02 | 1 | REQ-02 | T-02-02 | "Sem amostra" nunca vira 0 inventado | unit | `npx jest __tests__/cardioPrescrito.test.ts --silent` | ❌ W0 (módulo novo) | ⬜ pending |
| 01-02-2 | 01-02 | 1 | REQ-02 | T-02-01 | Query sempre escopada por `user_id`/plano ativo/`muscle_group='Cardio'` | integration (mock supabase) | `npx jest __tests__/cardioPrescritoRepository.test.ts --silent` | ❌ W0 (módulo novo) | ⬜ pending |
| 01-03-1 | 01-03 | 2 | REQ-02 | — | Nenhuma UI de escrita de meta na árvore renderizada | component | `npx jest __tests__/cardioPrescritoSecao.test.tsx --silent` | ❌ W0 (novo) | ⬜ pending |
| 01-03-2 | 01-03 | 2 | REQ-02 | — | ProgressScreen não toca Supabase real fora de mock | integration (mock supabase) | `npx jest __tests__/progressScreenOrigemJoint.test.tsx --silent` | ✅ (existente, editado) | ⬜ pending |
| 01-04-1 | 01-04 | 1 | REQ-03 | — | Catálogo aditivo, sem colisão de chave/alias | unit | `python3 -m pytest backend/tests/test_exercise_catalog.py -q` | ✅ (existente, editado) | ⬜ pending |
| 01-04-2 | 01-04 | 1 | REQ-03 | T-04-02 | Prompt instrui uso de `preferencias`, sem quebrar layout v2/cache | unit | `python3 -m pytest backend/tests/test_prompt_molde_estrutura.py -q` | ✅ (existente, editado) | ⬜ pending |
| 01-04-3 | 01-04 | 1 | REQ-03 | — | Geração real respeita foco de alongamento (não automatizável) | manual | ver "Manual-Only Verifications" abaixo | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/manualExerciseRow.test.tsx` — stub/casos novos para REQ-01 (criado na Task 1 do plano 01-01)
- [ ] `src/engine/cardioPrescrito.ts` + `__tests__/cardioPrescrito.test.ts` — REQ-02 (plano 01-02, Task 1)
- [ ] `src/services/cardioPrescritoRepository.ts` + `__tests__/cardioPrescritoRepository.test.ts` — REQ-02 (plano 01-02, Task 2)
- [ ] `src/components/progress/CardioPrescritoSection.tsx` + `__tests__/cardioPrescritoSecao.test.tsx` — REQ-02 (plano 01-03, Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| IA respeita pedido de foco de alongamento numa geração real de plano | REQ-03 | Exige chamada real e paga à API Anthropic — não é apropriado como teste automatizado de CI (custo, latência, não-determinismo do modelo) | Ver plano `01-04-PLAN.md`, Task 3 (`checkpoint:human-verify`): pedir foco no chat de onboarding, gerar plano, confirmar que o catálogo expandido aparece na sessão de Mobilidade. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (exceto 01-04-3, manual por natureza)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 130s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — preencher após a primeira execução (`/gsd-execute-phase 1`).
