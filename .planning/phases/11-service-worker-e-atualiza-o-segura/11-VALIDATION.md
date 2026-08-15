---
phase: 11
slug: service-worker-e-atualiza-o-segura
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-14
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populado a partir do ## Validation Architecture de 11-RESEARCH.md; sign-off
> (status: validated) ocorre no hook verify:post (gsd-validate-phase).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 + jest-expo 54.0.17, @testing-library/react-native 13.3.3 |
| **Config file** | `package.json` campo "jest" (sem jest.config.js separado) |
| **Quick run command** | `npx jest __tests__/serviceWorkerConfig.test.ts __tests__/UpdateBanner.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (suíte completa) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest __tests__/serviceWorkerConfig.test.ts __tests__/UpdateBanner.test.tsx`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | OFF-01 | T-11-01 | sw.js sem runtimeCaching; cross-origin passa direto | unit/guard + build real | `npm run build:web` + grep em dist/sw.js | ✅ (build) | ⬜ pending |
| 11-01-02 | 01 | 1 | OFF-02 | T-11-02 | headers no-cache must-revalidate; rewrite exclui sw | unit/guard | `npx jest __tests__/serviceWorkerConfig.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | OFF-02 | T-11-03 | banner nunca auto-reload; SKIP_WAITING só ao toque | component (RTL) | `npx jest __tests__/UpdateBanner.test.tsx` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | OFF-02 | — | montagem web-only, sem efeito no nativo | component (RTL) + tsc | `npx jest && npx tsc --noEmit` | ✅ | ⬜ pending |
| 11-03-01..03 | 03 | 3 | OFF-01/OFF-02 | — | checkpoints humanos (Node Vercel, deploy+curl, modo avião) | manual-only | — | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/serviceWorkerConfig.test.ts` — guard permanente: sem runtimeCaching, globIgnores [], maximumFileSizeToCacheInBytes >= bundle medido, rewrite/headers de sw.js/register-sw.js, manifest com must-revalidate (padrão splashAssets.test.ts)
- [ ] `__tests__/UpdateBanner.test.tsx` — RTL: nunca reload sem toque; "Atualizar" dispara o efeito esperado; "Depois" dispensa
- Framework já instalado — sem instalação nova.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modo avião + abrir pelo ícone → casca aparece | OFF-01 | Requer iPhone real com PWA instalado (sem toolchain iOS nesta máquina) | 11-03 Task 3 / UAT do dono |
| `curl -I` de sw.js e manifest.json em produção | OFF-02 | Requer deploy vivo (`vercel deploy --prod` manual) | 11-03 Task 2 |
| Node.js Version ≥ 20 no projeto Vercel | OFF-01 | Configuração no dashboard da Vercel | 11-03 Task 1 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (ocorre no validate-phase, pós-execução)

**Approval:** pending
