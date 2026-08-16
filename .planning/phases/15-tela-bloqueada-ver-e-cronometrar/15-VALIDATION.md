---
phase: 15
slug: tela-bloqueada-ver-e-cronometrar
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-16
---

# Phase 15 — Validation Strategy

> Contrato de validação por fase para amostragem de feedback durante a execução.
> Derivado de `15-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `^29.7.0` com preset `jest-expo` |
| **Config file** | `package.json` (chave `jest`) |
| **Quick run command** | `npx jest <arquivo relevante>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 segundos (suíte completa) |

**Fora do CI, por decisão de projeto:** build Swift, ActivityKit e Dynamic Island
não rodam em CI nem em Simulator com fidelidade. A prova dessas superfícies é
`npm run verify:native` (esqueleto nativo) + UAT físico do dono (D-13).

---

## Sampling Rate

- **After every task commit:** Run `npx jest <arquivo relevante>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** suíte completa verde + `npm run verify:native` OK
  + Sessão 1 e Sessão 2 físicas (D-13) reportadas PASS pelo dono
- **Max feedback latency:** 60 segundos

---

## Per-Task Verification Map

*Seeded by plan-phase — preenchido após os PLAN.md existirem. Cada task com
`<automated>` verify entra aqui com seu comando.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pendente_ | — | — | LOCK-01 / LOCK-02 / LOCK-03 | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/activeSessionStore.test.ts` — casos novos cobrindo `restEndsAt`,
      D-09 (descanso nunca auto-avança) e D-08 (timeout de inatividade)
- [ ] Teste para a tradução de `ajustarDescanso` (`src/engine/sessionSummary.ts`)
      operando sobre timestamp absoluto em vez de segundos restantes
- [ ] Teste da lógica JS de reconciliação de Activity órfã (D-11), com mock de
      `modules/live-activity` — o que decide "encerra + sobe nova" vs "encerra só"
- [ ] Teste da função pura que decide a fase do card
      (`measuring` / `resting` / `readyOvertime` / `blockOnly`) e monta o
      `ContentState` a partir do `DraftExercise`/`DraftSet` ativo — mesmo padrão
      sem I/O de `src/engine/sessionModel.ts`
- [ ] `scripts/verify-native-skeleton.sh` — estender para conhecer
      `modules/live-activity/` (Pitfall 5 da pesquisa)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card aparece no Lock Screen e nas 4 apresentações do Dynamic Island (compact / minimal / expanded) com exercício, série X/Y e prescrição | LOCK-01 | ActivityKit e Dynamic Island não rodam em Simulator com fidelidade; exigem iPhone físico com Dynamic Island | Sessão 1 física (D-13), roteiro auto-contido: comandos copiáveis + "o que você deve ver" + PASS/FAIL |
| Timer de descanso conta regressivamente com o iPhone bloqueado e o app suspenso | LOCK-02 | `Text(timerInterval:)` só é observável no compositor do sistema, com o app fora de execução | Sessão 1 física (D-13) — bloquear o aparelho e observar a contagem sem tocar no app |
| Live Activity desaparece sozinha ao terminar ou cancelar a sessão, sem card preso | LOCK-03 | `dismissalPolicy` por data só é observável no ciclo real do sistema | Sessão 2 física (D-13) — UAT com treino real e conta real |
| Reconciliação após force-quit encerra Activity órfã e sobe card novo com o estado corrente | LOCK-03 | Force-quit + ciclo de vida de Activity não é reproduzível fora do aparelho | Sessão 2 física (D-13) — force-quit no meio de uma sessão ativa e reabrir o app |

**Pré-requisito bloqueante da Sessão 2:** o todo dobrado
`backend-supabase-producao-no-aparelho` — sem `EXPO_PUBLIC_SUPABASE_URL`
apontando para produção, o login não completa no aparelho e o UAT com treino
real não roda.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
