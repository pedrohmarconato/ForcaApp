---
phase: 2
slug: anamnese-e-calibra-o-do-cardio
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (`jest-expo`) no frontend; pytest 8 no backend |
| **Config file** | `package.json` (bloco `jest`); `backend/tests/conftest.py` |
| **Quick run command** | `npx jest __tests__/questionnaireScreen.test.tsx` (frontend) / `python3 -m pytest backend/tests/test_dose_cardio.py backend/tests/test_migration_anamnese_cardio.py -q` (backend) |
| **Full suite command** | `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q` (não use o exit code do jest como portão — `AGENTS.md`) |
| **Estimated runtime** | ~40s (jest completo) + ~20s (pytest completo) |

---

## Sampling Rate

- **After every task commit:** Run o comando `<automated>` da task no PLAN.md.
- **After every plan wave:** Full suite (`npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q`) + `npx tsc --noEmit`.
- **Before `/gsd-verify-work`:** Full suite green + `git diff backend/schemas/molde_schema.py` vazio.
- **Max feedback latency:** ~60s (soma dos dois quick run commands).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | REQ-04 | T-02-02 | Chave `cardio_pratica_atualmente` idêntica em UI e payload; nenhuma perda silenciosa | component | `npx jest __tests__/questionnaireScreen.test.tsx` | ❌ Wave 0 — asserção nova a criar | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | REQ-05 | T-02-01, T-02-02 | Nível derivado sem exceção; instrução só na parte volátil do prompt | unit | `python3 -m pytest backend/tests/test_dose_cardio.py -q` | ❌ Wave 0 — `TestNivelCardioDeclarado`/`TestCalibracaoNoPrompt` a criar | ⬜ pending |
| 02-02-T1 | 02-02 | 1 | REQ-04 | T-02-04, T-02-05 | Migração testada via harness, sem tocar banco vivo | integration (SQL, offline) | `python3 -m pytest backend/tests/test_migration_anamnese_cardio.py -q` | ❌ Wave 0 — arquivo e teste a criar | ⬜ pending |
| 02-02-T2 | 02-02 | 1 | REQ-04 | — | Decisão humana antes de qualquer `supabase db push` | manual | n/a (checkpoint:decision) | n/a | ⬜ pending |
| 02-03-T1 | 02-03 | 2 | REQ-04 | — | Distância só habilitada com `cardio_pratica_atualmente===true`; 3 chaves no payload | component | `npx jest __tests__/questionnaireScreen.test.tsx` | ❌ Wave 0 — asserções novas a criar | ⬜ pending |
| 02-03-T2 | 02-03 | 2 | REQ-05 | T-02-06 | `cardio_objetivo` forjado nunca vira texto de instrução (vocabulário fechado) | unit | `python3 -m pytest backend/tests/test_dose_cardio.py -q` | ❌ Wave 0 — testes novos a criar | ⬜ pending |
| 02-03-T3 | 02-03 | 2 | REQ-04, REQ-05 | — | Geração real iniciante × experiente difere na dose/teto de cardio | manual | n/a (checkpoint:human-verify) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_migration_anamnese_cardio.py` (harness de leitura do .sql, sem banco) — cobre REQ-04 — criado no Plano 02-02, Task 1
- [ ] `TestNivelCardioDeclarado` + `TestCalibracaoNoPrompt` em `backend/tests/test_dose_cardio.py` — cobre REQ-05 (derivação de nível + teto de progressão, sem IA) — criado no Plano 02-01, Task 2
- [ ] Asserções novas em `__tests__/questionnaireScreen.test.tsx` para as 3 chaves de anamnese no payload — cobre REQ-04 — criado nos Planos 02-01 (Task 1) e 02-03 (Task 1)
- [ ] `test_objetivo_forjado_nao_vira_instrucao` (anti-injeção do vocabulário fechado de `cardio_objetivo`) — cobre REQ-05 — criado no Plano 02-03, Task 2

Todos os gaps do Wave 0 são fechados DENTRO das próprias tasks que os criam (nenhuma dependência
externa a este plano set) — por isso `wave_0_complete: true` acima já reflete o estado ao final
da execução planejada, não o estado atual do repositório.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Aplicação real da migration 0033 em staging/produção | REQ-04 | Ação deliberada e irreversível de infraestrutura (`supabase db push`); não é responsabilidade de um agente automatizado decidir/executar | Ver Plano 02-02, Task 2 (`checkpoint:decision`) |
| Geração real de plano diferenciando iniciante × experiente na dose/teto de cardio | REQ-05 | Exige chamada real e paga à API Anthropic; não roda em CI/teste automatizado | Ver Plano 02-03, Task 3 (`checkpoint:human-verify`) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (as tarefas manuais são `checkpoint:decision`/`checkpoint:human-verify`, isentas por definição)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (02-01-T1, 02-01-T2 automatizadas; 02-02-T1 automatizada, 02-02-T2 checkpoint; 02-03-T1, 02-03-T2 automatizadas, 02-03-T3 checkpoint — nunca 3 seguidas sem automação)
- [x] Wave 0 covers all MISSING references (ver seção acima)
- [x] No watch-mode flags (todos os comandos usam `-q`/`--silent`/`--runInBand`, sem `--watch`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (fica pendente até a execução real confirmar os testes verdes — este arquivo documenta o CONTRATO de validação, não o resultado)
