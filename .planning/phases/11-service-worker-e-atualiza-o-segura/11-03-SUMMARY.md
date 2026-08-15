---
phase: 11-service-worker-e-atualiza-o-segura
plan: "03"
status: partial
completed: 2026-08-15
tasks_completed: 2
tasks_total: 3
key-files:
  created: []
  modified: []
key_decisions:
  - "Node.js do projeto Vercel confirmado 24.x (>= 20 exigido pelo workbox-cli) via vercel project inspect — checkpoint resolvido com evidência CLI, sem dashboard."
  - "Deploy de produção autorizado pelo dono e executado (forca-29wurx1tj / READY); headers verificados via curl -I com evidência literal."
deviations: []
---

# Plan 11-03 Summary — Checkpoints de produção (parcial)

## O que foi resolvido

- **Task 1 ✓ (evidência CLI):** `npx vercel project inspect forca-app` → `Node.js Version 24.x` (≥ 20 exigido pelo `workbox-cli@7.4.1`).
- **Task 2 ✓ (evidência curl, 2026-08-15):** deploy `vercel deploy --prod` autorizado pelo dono, `readyState: READY`. Verificação em `https://forca-app-six.vercel.app`:
  - `/sw.js` → HTTP 200, `cache-control: no-cache, must-revalidate`, `content-type: application/javascript` — conteúdo é o Workbox real (`workbox:core:7.4.0`), 0 ocorrências de `supabase`.
  - `/register-sw.js` → HTTP 200, `no-cache, must-revalidate`, `application/javascript`.
  - `/manifest.json` → HTTP 200, `no-cache, must-revalidate`, `application/json`.
- **Task 3 ⏭ (diferida pelo dono):** UAT físico no iPhone (modo avião + casca offline) — registrado em `11-UAT.md`; decisão "Deploy agora + adiar UAT" (2026-08-15).

## Next Phase Readiness

O primeiro service worker do app está em produção com headers corretos. O risco
residual anotado pelo 11-02 (evento antes do mount do React) e o comportamento
do banner só são observáveis no PRÓXIMO deploy — ambos estão no 11-UAT.md.

*Completed (Tasks 1-2; Task 3 checkpoint pending): 2026-08-15*
