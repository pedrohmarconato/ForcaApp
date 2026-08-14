---
phase: 09-fechamento-de-gaps-do-runtime-web
plan: 04
subsystem: web-runtime-gaps
tags: [alert-shim, regression-guard, wake-lock, pwa, uat]

requires:
  - phase: 09-fechamento-de-gaps-do-runtime-web (plan 01)
    provides: src/utils/alertShim.ts (showAlert), src/store/alertStore.ts, src/components/AlertHost.tsx
  - phase: 09-fechamento-de-gaps-do-runtime-web (plan 02)
    provides: QuestionnaireScreen.tsx/SignUpScreen.tsx migrados; alertShim.ts com aridade corrigida
  - phase: 09-fechamento-de-gaps-do-runtime-web (plan 03)
    provides: JointLobbyScreen.tsx confirmarPadrao migrado; PostQuestionnaireChat.tsx import morto removido
provides:
  - __tests__/alertNoAlertRemanescente.test.ts (guarda permanente D-08)
affects: []

actuals:
  tokens: 1060
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Varredura recursiva readdirSync/readFileSync com lista PERMITIDOS de exceção — molde __tests__/loadInputLayoutWeb.test.ts:120-176, reaplicado para proteger uma classe inteira de call sites contra regressão"

key-files:
  created:
    - __tests__/alertNoAlertRemanescente.test.ts
  modified:
    - src/store/alertStore.ts

key-decisions:
  - "[Rule 1 - Bug] src/store/alertStore.ts (criado na Plan 09-01) tinha um comentário literal 'Alert.alert nativo' que o novo teste de varredura capturava como infrator falso-positivo — reescrito para 'diálogo nativo do SO' sem mudar comportamento, necessário para o próprio must_have desta plan (grep -rn 'Alert\\.' src/ restrito a alertShim.ts/AlertHost.tsx) se tornar verdadeiro."

requirements-completed: []

coverage:
  - id: D1
    description: "Guarda permanente de regressão (D-08): varredura recursiva de src/screens, src/components, src/store falha se Alert. aparecer fora de alertShim.ts/AlertHost.tsx; guarda contra a própria varredura silenciosamente parar de varrer (arquivosVarridos > 20)"
    requirement: "WEB-01"
    verification:
      - kind: unit
        ref: "__tests__/alertNoAlertRemanescente.test.ts#grep Alert\\. zerado fora de alertShim.ts/AlertHost.tsx"
        status: pass
      - kind: other
        ref: "grep -rn 'Alert\\.' src/ (restrito a alertShim.ts/AlertHost.tsx)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "npx jest (suíte completa) — 150 suítes, 1702 testes, todos passando"
        status: pass
    human_judgment: false
  - id: D2
    description: "UAT do dono no iPhone real confirmando WEB-01 (diálogo de 'Concluir treino?' visível e funcional no PWA instalado) e SESS-01 (Wake Lock ativo durante a sessão, tela não escurece, libera ao concluir), condicionado à checagem prévia da versão do iOS (bug WebKit 254545, corrigido só no iOS 18.4)"
    requirement: "WEB-01, SESS-01"
    verification: []
    human_judgment: true
    rationale: "Requer teste físico do dono no iPhone real com o PWA instalado pela Tela de Início — não simulável em ambiente de execução sem Xcode/dispositivo iOS. Checkpoint type=checkpoint:human-verify, gate=blocking; plan tem autonomous: false. Aguardando resposta do dono (aprovado ou achados)."

duration: ~25min
completed: 2026-08-14
status: checkpoint-pending
---

# Phase 9 Plan 04: Guarda de regressão D-08 + UAT do dono (SESS-01/WEB-01) Summary

**Guarda jest permanente contra `Alert.alert` cru fora do shim (D-08), fechando a
auditoria dos 12 call sites das Plans 09-01/02/03; UAT do dono no iPhone real
(Task 2) aguardando execução — checkpoint bloqueante, não é possível
auto-aprovar.**

## Performance

- **Duration:** ~25 min (Task 1)
- **Completed:** 2026-08-14
- **Tasks:** 1/2 concluídas (Task 2 é checkpoint humano pendente)
- **Files modified:** 2 (1 criado, 1 corrigido)

## Accomplishments
- `__tests__/alertNoAlertRemanescente.test.ts` criado: varredura recursiva de
  `src/screens/`, `src/components/` (incluindo subpastas `ui`, `progress`,
  `plan`, `profile`, `joint`, `session`) e `src/store/` — 54 arquivos `.tsx?`
  varridos, todos limpos de `Alert.` fora dos 2 arquivos permitidos
  (`alertShim.ts`, `AlertHost.tsx`). Guarda `arquivosVarridos > 20` protege
  contra a própria varredura parar de varrer silenciosamente.
- Bug pré-existente descoberto e corrigido (ver Deviations): comentário de
  `alertStore.ts` (Plan 09-01) continha o texto literal "Alert.alert nativo",
  o que fazia o `grep -rn "Alert\."` do critério de aceite da fase falhar
  contra o próprio `src/store/`. Corrigido sem mudar comportamento.
- `grep -rn "Alert\." src/` confirmado restrito a `alertShim.ts`/`AlertHost.tsx`
  — critério de sucesso 1 do ROADMAP da Fase 9 fechado.
- Suíte completa (`npx jest`, sem filtro) rodada: 150 suítes / 1702 testes,
  todos passando, exit code 0 — nenhuma regressão introduzida em nenhum dos
  arquivos tocados pelas 4 plans desta fase.

## Task Commits

1. **Task 1: Criar a guarda permanente de regressão contra Alert.alert cru (D-08)** - `0cc4b6a` (feat)

_Task 2 (checkpoint:human-verify, gate="blocking") não foi executada — aguarda
o dono. Ver "Checkpoint Pendente" abaixo._

## Files Created/Modified
- `__tests__/alertNoAlertRemanescente.test.ts` - guarda permanente D-08 (novo)
- `src/store/alertStore.ts` - comentário reescrito (correção Rule 1, sem mudança de comportamento)

## Decisions Made

- **[Rule 1 - Bug] Comentário de `alertStore.ts` continha "Alert.alert nativo" literal.**
  Ver Deviations abaixo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comentário pré-existente em `alertStore.ts` disparava falso-positivo na guarda nova**
- **Found during:** Task 1, primeira execução de `npx jest __tests__/alertNoAlertRemanescente.test.ts`
- **Issue:** `src/store/alertStore.ts` (criado na Plan 09-01) documenta a
  garantia de slot único do alerta custom comparando-a ao `Alert.alert`
  nativo — mas o texto literal do comentário ("mesma garantia do Alert.alert
  nativo, que é modal...") batia na regex `/\bAlert\s*[.,]/` da nova guarda,
  já que `src/store/` está entre os diretórios varridos e `alertStore.ts` não
  está (corretamente) na lista `PERMITIDOS` da plan (só `alertShim.ts` e
  `AlertHost.tsx`, conforme especificado na `<action>` da Task 1). Isso
  também violava literalmente o `must_haves.truths` #1 desta plan: "grep -rn
  'Alert\\.' src/ retorna somente ocorrências em src/utils/alertShim.ts e
  src/components/AlertHost.tsx".
- **Fix:** Reescrito o trecho do comentário de "Alert.alert nativo" para
  "diálogo nativo do SO" — mesma explicação semântica (o slot único replica a
  garantia do diálogo bloqueante do sistema operacional), sem tocar em código
  executável, sem mudar comportamento.
- **Files modified:** `src/store/alertStore.ts` (1 linha).
- **Verification:** `npx jest __tests__/alertNoAlertRemanescente.test.ts` —
  passou após o fix; `grep -rn "Alert\." src/` restrito aos 2 arquivos
  esperados; `npx tsc --noEmit` sem erros; suíte completa 150/150 suítes.
- **Committed in:** `0cc4b6a` (Task 1 commit, mesmo commit — a correção era
  pré-requisito do próprio `<verify>` da Task 1 passar).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug pré-existente exposto pela guarda nova)
**Impact on plan:** Correção mínima e necessária para que o `must_have` literal
da própria plan (grep restrito a 2 arquivos) fosse verdadeiro. Nenhuma mudança
de comportamento observável — só texto de comentário. Precedente idêntico ao
fix de aridade documentado em 09-02-SUMMARY.md (bug pré-existente exposto por
um teste novo, corrigido fora do `files_modified` original porque bloqueava o
próprio must_have da plan).

## Issues Encountered

None além do já documentado em Deviations.

## Checkpoint Pendente

**Task 2 (`checkpoint:human-verify`, `gate="blocking"`) NÃO foi aprovada nem
executada.** Esta plan tem `autonomous: false` e o modo automático do
workflow está desligado (`workflow._auto_chain_active: false` em
`.planning/config.json`) — mesmo que estivesse ligado, um checkpoint de
verificação humana com hardware real (iPhone físico) nunca é auto-aprovável.

O que falta, literalmente (do `09-04-PLAN.md`, Task 2):
1. Conferir a versão do iOS do iPhone de teste (Ajustes → Geral →
   Informações → Versão do software) ANTES de testar SESS-01 — bug
   documentado da WebKit (`bugs.webkit.org#254545`) impede a Screen Wake
   Lock API de funcionar em PWA instalado via Tela de Início em iOS entre
   16.4 e 18.3.x; corrigido só no iOS 18.4 (março/2025). Se a versão for
   menor, o passo 4 vai falhar por limitação de plataforma, não bug desta
   fase — o dono deve registrar a versão encontrada.
2. Abrir o ForçaApp pelo PWA instalado (não Safari em aba comum).
3. Iniciar um treino, tocar "Concluir treino" com série pendente — confirmar
   diálogo modal visível (WEB-01), botões "Continuar treino"/"Concluir"
   ambos funcionais.
4. Durante a sessão ativa, deixar o iPhone parado — confirmar que a tela NÃO
   escurece; bloquear manualmente e desbloquear no meio do treino — confirmar
   que a tela segue sem escurecer sozinha depois (SESS-01, readquisição via
   visibilitychange).
5. Concluir o treino — confirmar que o bloqueio automático volta ao normal
   depois (o Wake Lock foi liberado).

Esta plan é a Wave 3 (última) da Fase 9 — o fechamento formal da fase depende
desta aprovação.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Auditoria completa dos 12 call sites de `Alert.alert` fechada e protegida
permanentemente por teste automatizado (D-08). Falta apenas o UAT humano
(Task 2) para fechar formalmente a Fase 9 (WEB-01 + SESS-01, critérios de
sucesso 1/2/3 do ROADMAP). Nenhum bloqueio técnico identificado para as Fases
10-13 (identidade do app instalável, service worker, página de instalação,
push) — todas dependem do runtime web já corrigido nesta fase.

## Self-Check: PASSED

Arquivos confirmados em disco:
- __tests__/alertNoAlertRemanescente.test.ts — FOUND
- src/store/alertStore.ts — FOUND (modificado)

Commits confirmados em `git log --oneline`:
- 0cc4b6a — FOUND

---
*Phase: 09-fechamento-de-gaps-do-runtime-web*
*Completed (Task 1 only; Task 2 checkpoint pending): 2026-08-14*
