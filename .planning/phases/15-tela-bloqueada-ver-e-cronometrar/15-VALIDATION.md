---
phase: 15
slug: tela-bloqueada-ver-e-cronometrar
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-16
updated: 2026-08-19
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

*Preenchido nesta revisão (2026-08-16) a partir dos 6 PLAN.md existentes.
Checkpoints físicos (15-05-T1, 15-06-T1) não têm `<automated>` — cobertos em
"Manual-Only Verifications" abaixo, não nesta tabela.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-T1 | 01 | 1 | LOCK-01 / LOCK-02 | T-15-01-01 / T-15-01-02 / T-15-01-03 | ContentState só carrega campos mínimos de exibição (nunca token/dado de outro usuário); `aps-environment` não vaza para entitlements (reconfirmado, sem mudança de código) | tsc + jest (4 suites) + native-build | `npx tsc --noEmit && npx jest __tests__/activeSessionStore.test.ts __tests__/sessionSummary.test.ts __tests__/liveActivityContentState.test.ts __tests__/liveActivitySync.test.ts __tests__/sessionFlow.test.ts && npm run verify:native` | parcial — `activeSessionStore.test.ts`/`sessionFlow.test.ts` existentes (estendidos); `sessionSummary.test.ts`/`liveActivityContentState.test.ts`/`liveActivitySync.test.ts` novos, criados pela própria task (Wave 0 absorvida na Wave 1) | ✅ green |
| 15-02-T1 | 02 | 2 | LOCK-01 | — | N/A (derivação pura, sem I/O) | tsc + jest | `npx tsc --noEmit && npx jest __tests__/liveActivityContentState.test.ts __tests__/sessionFlow.test.ts` | ✅ (ambos criados/existentes desde a 15-01; estendidos aqui) | ✅ green |
| 15-02-T2 | 02 | 2 | LOCK-01 | T-15-02-01 | `blockLabel`/`blockIndex`/`blockTotal` expõem só metadado de treino (aceito — não sensível, mesma categoria da série X/Y já exibida) | native-build | `npm run verify:native` | ✅ (script existente desde a Fase 14, estendido na 15-01) | ✅ green |
| 15-03-T1 | 03 | 2 | LOCK-03 | T-15-03-01 | Falha nativa em `endActivity`/`updateActivity` nunca propaga exceção (`try/catch`/`.catch()`) | jest | `npx jest __tests__/liveActivitySync.test.ts` | ✅ (criado na 15-01, estendido aqui) | ✅ green |
| 15-03-T2 | 03 | 2 | LOCK-03 | T-15-03-01 / T-15-03-02 | Reconciliação de boot é a rede de segurança mesmo se um encerramento isolado falhar; card órfão nunca fica preso indefinidamente | jest | `npx jest __tests__/liveActivitySync.test.ts` | ✅ (mesmo arquivo, estendido) | ✅ green |
| 15-03-T3 | 03 | 2 | LOCK-03 | — | N/A | jest | `npx jest __tests__/liveActivitySync.test.ts __tests__/LiveActivityUnavailableBanner.test.tsx` | `liveActivitySync.test.ts` ✅ (existente, estendido); `LiveActivityUnavailableBanner.test.tsx` novo, criado pela própria task | ✅ green |
| 15-04-T1 | 04 | 1 | LOCK-01 / LOCK-02 / LOCK-03 | T-15-04-01 | `.env` permanece fora do git (já gitignored); nenhuma mudança de `.gitignore` nesta task | shell/grep | `grep -v '^#' .env \| grep -c "zanqygwsgxkyjiuhrzju" && ! grep -v '^#' .env \| grep -q "127.0.0.1:54321"` | N/A (checagem de conteúdo de config, sem arquivo de teste dedicado) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Nota (revisão 2026-08-16): esta fase não tem uma wave 0 dedicada — os 5 itens
abaixo são absorvidos dentro da Plano 15-01 (wave 1, task `tracer`/`tdd`), que
cria/estende os arquivos de teste correspondentes como parte do próprio ciclo
RED→GREEN.*

*Confirmado nesta auditoria (2026-08-19): os 6 arquivos executam hoje no main
(`liveActivitySync.test.ts`, `liveActivityContentState.test.ts`,
`liveActivityPlatformImport.test.ts`, `nativeModulePlatformImport.test.ts`,
`sessionModel.test.ts`, `sessionFlow.test.ts` — 6 suítes, 121 testes, todos
verdes) e `scripts/verify-native-skeleton.sh` roda com exit 0. `wave_0_complete`
promovido para `true`.*

- [x] `__tests__/activeSessionStore.test.ts` — casos novos cobrindo `restEndsAt`,
      D-09 (descanso nunca auto-avança) e D-08 (timeout de inatividade) —
      mapeado: `restEndsAt`/D-09 na Plano 15-01-T1 (`activeSessionStore.test.ts`);
      D-08 (timeout de 3h) na Plano 15-03-T3 (`liveActivitySync.test.ts`, fake
      timers — o timeout vive em `liveActivitySync.ts`, não no store)
- [x] Teste para a tradução de `ajustarDescanso` (`src/engine/sessionSummary.ts`)
      operando sobre timestamp absoluto em vez de segundos restantes —
      mapeado: Plano 15-01-T1 (`sessionSummary.test.ts`, `ajustarRestEndsAt`)
- [x] Teste da lógica JS de reconciliação de Activity órfã (D-11), com mock de
      `modules/live-activity` — o que decide "encerra + sobe nova" vs "encerra só"
      — mapeado: Plano 15-03-T2 (`liveActivitySync.test.ts`, `reconcileOrphanActivities`)
- [x] Teste da função pura que decide a fase do card
      (`measuring` / `resting` / `readyOvertime` / `blockOnly`) e monta o
      `ContentState` a partir do `DraftExercise`/`DraftSet` ativo — mesmo padrão
      sem I/O de `src/engine/sessionModel.ts` — mapeado: Plano 15-01-T1
      (measuring/resting, `liveActivityContentState.test.ts`) + Plano 15-02-T1
      (blockOnly/readyOvertime completos, mesmo arquivo)
- [x] `scripts/verify-native-skeleton.sh` — estender para conhecer
      `modules/live-activity/` (Pitfall 5 da pesquisa) — mapeado: Plano
      15-01-T1 (Parte B), verificado via `npm run verify:native` (exit 0
      confirmado em 2026-08-19, incluindo `verify-live-activity-overtime.sh`)

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 7 tasks
      auto/tdd/tracer, todas com `<automated>`; 2 checkpoints físicos
      (15-05-T1, 15-06-T1) cobertos em Manual-Only Verifications
- [x] Sampling continuity: no 3 consecutive tasks without automated verify —
      maior sequência sem automated é 2 (15-05-T1, 15-06-T1), em waves
      separadas (3 e 4)
- [x] Wave 0 covers all MISSING references — os 5 itens acima mapeados para
      tasks concretas dentro da Wave 1 (15-01-T1)
- [x] No watch-mode flags — nenhum comando `<automated>` usa `--watch`
- [ ] Feedback latency < 60s — orçamento declarado (Sampling Rate acima), não
      medido; back-filled durante a execução com o tempo real de
      `npx jest`/`npm run verify:native`
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — dimensões estruturais (8a-8d) confirmadas por
revisão de checker em 2026-08-16 contra o conteúdo dos 6 PLAN.md; aprovação
final da fase continua condicionada às Sessões 1 e 2 físicas (D-13,
Planos 15-05/15-06).

---

## Validation Audit 2026-08-19

Auditoria retroativa Nyquist (gsd-validate-phase, adversarial). Estado real do
código no `main` (HEAD `a46bea8`), não o planejamento de 2026-08-16.

| Metric | Count |
|--------|-------|
| Requisitos auditados | 3 (LOCK-01, LOCK-02, LOCK-03) |
| Suítes-alvo verificadas verdes | 6/6 (121 testes) |
| Gaps encontrados | 1 |
| Resolvidos (teste novo, verde) | 1 |
| Escalados | 0 |

**Gap encontrado e fechado:** `src/native/liveActivitySync.ts` só publica o
encerramento da Live Activity (`publishFinished`) quando o store transiciona
para `status: 'finished'`. A rota `reset()` (chamada em
`src/screens/ActiveSessionScreen.tsx:270`, ao entrar numa nova sessão) leva o
store direto para `status: 'idle'`, `draft: null` — sem passar por
`'finished'`. Nenhum teste existente provava o comportamento dessa transição.
Teste novo adicionado a `__tests__/liveActivitySync.test.ts`
(`'LOCK-03 gap: reset() para idle (troca de sessão) durante active NÃO
encerra a Activity imediatamente...'`) prova que `endLiveActivity` NÃO é
chamado nessa transição — a Activity da sessão anterior fica órfã até a
próxima reconciliação de boot (`reconcileOrphanActivities`), não até o
próximo encerramento local. Teste passa (comportamento real do código, não
bug de implementação) — registrado como **WARNING**, não BLOCKER: não há
evidência de que troca de sessão com Activity ainda ativa seja um fluxo
alcançável hoje pela UI (não há botão de "trocar de sessão" com uma sessão
anterior ainda ativa, e a Fase 15 não cobre esse cenário no UAT físico), mas
o código não impede essa sequência e a rede de segurança (reconciliação) só
roda no próximo boot do app — não imediatamente. Fica registrado para
decisão do dono se algum fluxo futuro puder disparar `reset()` com sessão
ativa.

**Comandos executados nesta auditoria:**
- `npx jest __tests__/liveActivitySync.test.ts __tests__/liveActivityContentState.test.ts __tests__/liveActivityPlatformImport.test.ts __tests__/nativeModulePlatformImport.test.ts __tests__/sessionModel.test.ts __tests__/sessionFlow.test.ts` — 6 suítes, 121 testes, todos verdes (120 pré-existentes + 1 novo)
- `bash scripts/verify-live-activity-overtime.sh` — exit 0
- `bash scripts/verify-native-skeleton.sh` — exit 0
- `npx jest` (suíte completa) — 169 suítes, 2025 testes, todos verdes (baseline era 169/2024 — nenhuma suíte perdida, 1 teste novo)
- `npx tsc --noEmit` — sem erros

**`nyquist_compliant: true`** reflete cobertura automatizada completa dos
comportamentos testáveis sem hardware — inclui o gap fechado acima. **Isso
NÃO significa que a Fase 15 está pronta para fechar.** Por registro explícito
em `.planning/REQUIREMENTS.md` (correção de 2026-08-19) e em
`15-VERIFICATION.md` (status `human_needed`, 4/8) e `15-SECURITY.md`
(ameaça aberta T-15-09-02):

- **LOCK-01** segue **pendente de UAT física** — a exibição real na tela
  bloqueada e a recriação real da Activity nunca foram exercitadas no
  aparelho depois dos planos de gap closure 15-07/15-08/15-09.
- **LOCK-03** segue **pendente de UAT física** — o encerramento automático
  e a reconciliação pós force-quit só são observáveis no ciclo real do
  sistema (Sessão 2 física, D-13, Planos 15-05/15-06).
- **LOCK-02** permanece `Complete` — validado fisicamente antes das mudanças
  de gap closure, mecanismo não tocado por elas.

Teste automatizado não substitui essa evidência. A Fase 15 não deve ser
declarada pronta/fechada só por este documento — falta a Task 2 do Plano
15-09 no iPhone físico (checkpoints `rest_to_ready_overtime`,
`inactivity_timeout_recovery`, `no_resurrection_after_finish_cancel`).
