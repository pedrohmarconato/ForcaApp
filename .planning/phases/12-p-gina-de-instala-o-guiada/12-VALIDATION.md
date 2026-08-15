---
phase: 12
slug: p-gina-de-instala-o-guiada
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 12 — Validation Strategy

> Populado do ## Validation Architecture de 12-RESEARCH.md; sign-off no verify:post.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ^29.7.0 + jest-expo preset, @testing-library/react-native ^13.3.3 |
| **Config file** | `package.json` campo "jest" |
| **Quick run command** | `npx jest __tests__/InstallScreen.test.tsx __tests__/installDetection.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (suíte completa) |

---

## Sampling Rate

- **After every task commit:** `npx jest __tests__/InstallScreen.test.tsx __tests__/installDetection.test.ts`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | INST-02 | T-12-01 | rota pública sem dado de usuário; UA parse seguro | unit (RTL+puro) | `npx jest __tests__/InstallScreen.test.tsx __tests__/installDetection.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | INST-02 | — | rota nas 3 árvores; tab invisível (guard v6) | unit | `npx jest __tests__/navigationLinking.test.ts` + guard estrutural | ✅ (estender) | ⬜ pending |
| 12-02-01 | 02 | 2 | INST-02 | — | UAT humano — instalação sem ajuda | manual-only | — | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/InstallScreen.test.tsx` — 4 estados RTL + web-only guard (mock do installDetection)
- [ ] `__tests__/installDetection.test.ts` — UA bundles (CriOS/FxiOS/EdgiOS), iPadOS maxTouchPoints, matchMedia/navigator.standalone, fallback de UA desconhecido
- [ ] Estender `__tests__/navigationLinking.test.ts` — `/instalar` → `Instalar`
- Framework já instalado.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Aluno leigo instala sem ajuda via /instalar no Safari | INST-02 | Requer iPhone real + pessoa | 12-02 checkpoint / UAT |
| Sem flash de "Carregando"/perda de rota na visita fria deslogada | INST-02 | Branch loadingSession sem container — só observável em device | 12-02 checkpoint (instrução explícita) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity ok
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` (validate-phase, pós-execução)

**Approval:** pending
