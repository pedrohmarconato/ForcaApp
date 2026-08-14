---
phase: 05-integra-o-e-review-do-gr-fico-de-cardio
plan: 01
subsystem: ui
tags: [react-native, react-native-chart-kit, jest, git-hygiene, gitignore]

# Dependency graph
requires:
  - phase: 04-execu-o-de-treino-offline-first
    provides: sessão de execução de treino estável em cima da qual o gráfico de cardio lê CardioLog
provides:
  - Gráfico de evolução de pace/km por modalidade de cardio, integrado na tela Progresso
  - .claude/ gitignorado (higiene de segredo/metadado de sessão local)
  - .planning/reviews/REVIEW.md versionado como documentação
affects: [05-02-review-adversarial, 06-publicacao]

actuals:
  tokens: 7344
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Motor puro separado do componente RN (cardioEvolucao.ts sem dependência de UI, CardioEvolucaoChart.tsx consome o motor)"
    - "Adds de git sempre nomeados por caminho explícito, nunca git add -A/. — reforçado nesta fase"

key-files:
  created:
    - src/engine/cardioEvolucao.ts
    - src/components/progress/CardioEvolucaoChart.tsx
    - __tests__/cardioEvolucao.test.ts
  modified:
    - src/screens/ProgressScreen.tsx
    - .gitignore

key-decisions:
  - "D-01/D-07 (locked, 05-CONTEXT.md): commit de feature restrito aos 4 arquivos do gráfico, escopo fechado — nenhum refactor ou dependência nova."
  - "D-02 (locked): .claude/ gitignorado antes de qualquer outro commit da fase; .planning/reviews/ commitado como documentação sem editar conteúdo."
  - "D-05 (locked): branch e git status --porcelain reconferidos imediatamente antes de cada um dos 3 commits, por causa de sessões paralelas no mesmo tipo de clone."
  - "D-06 (locked): nenhum git push nesta fase — publicação é Fase 6."

patterns-established:
  - "Granularidade de commit sugerida no 05-CONTEXT.md (chore/docs/feat separados) seguida à risca."

requirements-completed: [INT-01]

coverage:
  - id: D1
    description: "Motor puro cardioEvolucao.ts deriva pace/km por modalidade sem inventar amostra"
    requirement: INT-01
    verification:
      - kind: unit
        ref: "__tests__/cardioEvolucao.test.ts (20 testes: ordem eixo X, pace inventado, lista vazia, dedupe de modalidade, formatação pt-BR)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gráfico integrado e visível na aba Progresso entre prescrição de cardio e Recordes"
    requirement: INT-01
    verification: []
    human_judgment: true
    rationale: "Renderização visual real (react-native-chart-kit) não é exercitada por jest/tsc nesta máquina sem toolchain nativa — requer UAT visual, coberto pelo painel adversarial do 05-02-PLAN.md ou verificação humana posterior."
  - id: D3
    description: "Higiene de git: .claude/ gitignorado e .planning/reviews/ versionado, sem alteração de conteúdo"
    requirement: INT-01
    verification:
      - kind: other
        ref: "git check-ignore .claude (exit 0); git log --name-only dos commits 4a747a1 e 762943c"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-14
status: complete
---

# Phase 5 Plan 1: Integração e higiene de git do gráfico de cardio Summary

**3 commits locais (chore/docs/feat) integram o gráfico de evolução de cardio (motor + componente + 20 testes + wiring de 4 linhas) já pronto no working tree, com `.claude/` gitignorado antes de qualquer commit e `.planning/reviews/` versionado sem edição — nenhum push, verificação local 100% verde na primeira rodada (tsc 0 erros, 147/147 suites jest, 617 testes pytest).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-14T14:17:26Z (bookkeeping do orquestrador — início da execução da Fase 5)
- **Completed:** 2026-08-14T14:20:42Z
- **Tasks:** 3/3
- **Files modified:** 6 (`.gitignore`, `.planning/reviews/REVIEW.md`, `src/engine/cardioEvolucao.ts`, `src/components/progress/CardioEvolucaoChart.tsx`, `__tests__/cardioEvolucao.test.ts`, `src/screens/ProgressScreen.tsx`)

## Accomplishments
- Portão de verificação local completo e verde na 1ª rodada, sem retry: `npx tsc --noEmit` (0 erros), `npm test` (147/147 suites, 1687/1687 testes), `python3 -m pytest backend/tests -q` (617 passed) — todos ANTES de qualquer commit (D-04).
- `.claude/` entrou no `.gitignore` (nova seção "🤖 Claude Code") e foi verificado via `git check-ignore .claude` (exit 0) antes do commit de higiene seguinte, mitigando T-05-02 (vazamento de metadado de sessão local).
- Gráfico de evolução de cardio commitado com exatamente os 4 arquivos do D-01 — nenhum arquivo a mais, nenhum add em lote (T-05-01 mitigado).

## Task Commits

Cada task foi verificada/commitada individualmente:

1. **Task 1: portão de verificação local (tsc + jest + pytest) e reconferência de branch/tree** — sem commit (task somente de leitura/verificação, conforme a plan; nenhum arquivo criado ou modificado).
2. **Task 2: commits de higiene** — `4a747a1` (chore: `.gitignore`), `762943c` (docs: `.planning/reviews/REVIEW.md`)
3. **Task 3: commit de feature** — `f61a45a` (feat: gráfico de evolução de cardio, 4 arquivos)

**Plan metadata:** commit de docs pendente (STATE.md/SUMMARY.md/ROADMAP.md), ver final_commit abaixo.

_Nota: nenhuma task teve TDD (`tdd="true"`) — os 20 testes de `cardioEvolucao.test.ts` já existiam prontos e verdes no working tree antes desta fase, não foram escritos nesta execução._

## Files Created/Modified
- `.gitignore` - nova seção "🤖 Claude Code" com a entrada `.claude/` e comentário justificando (config local de sessão)
- `.planning/reviews/REVIEW.md` - versionado como está, sem alteração de conteúdo (review de PR de ciclo anterior)
- `src/engine/cardioEvolucao.ts` - motor puro: deriva pace/km por modalidade de `CardioLog` via `paceSecondsPerKm`; sem amostra retorna `"—"`, nunca 0 inventado
- `src/components/progress/CardioEvolucaoChart.tsx` - componente RN (react-native-chart-kit) com loading/erro próprios
- `__tests__/cardioEvolucao.test.ts` - 20 testes: ordem do eixo X, pace inventado, lista vazia, dedupe de modalidade, formatação pt-BR
- `src/screens/ProgressScreen.tsx` - diff de 4 linhas: import de `CardioEvolucaoChart` + `<CardioEvolucaoChart />` renderizado entre a prescrição de cardio e "Recordes"

## Decisions Made
- Seguiu a granularidade de commit sugerida em "Claude's Discretion" do 05-CONTEXT.md: `chore` (gitignore) separado do `docs` (`.planning/reviews`) separado do `feat` (gráfico) — 3 commits atômicos.
- `.planning/STATE.md`, modificado pelo orquestrador ao iniciar a Fase 5 (bookkeeping de posição, não faz parte do escopo D-07), foi deliberadamente deixado fora dos 3 commits de feature/higiene desta plan — será incluído no commit final de metadados de execução (`state_updates`/`final_commit`), fora do escopo do gráfico.

## Deviations from Plan

None - plan executado exatamente como escrito. Os 3 commits (chore/docs/feat) saíram com exatamente os arquivos especificados em cada acceptance_criteria; nenhuma correção Rule 1-4 foi necessária.

## Issues Encountered
None - verificação local (tsc/jest/pytest) passou de primeira, sem timeout de carga ou necessidade de retry (diferente do que o 05-CONTEXT.md registrava como aceitável, mas não precisou ser usado).

## Known Stubs
None.

## Threat Flags
Nenhuma superfície nova de segurança introduzida (auth, endpoint de rede, schema) — os 3 commits desta plan são git hygiene + integração de UI já implementada e testada, cobertos pelo `<threat_model>` do plan (T-05-01 a T-05-04, todos com disposição `mitigate`/`accept` já endereçada nos próprios commits).

## User Setup Required
None - nenhuma configuração de serviço externo requerida.

## Next Phase Readiness
- `origin/main..HEAD` agora inclui os 3 commits novos desta plan, pronto para o painel adversarial do `05-02-PLAN.md` avaliar o diff completo que vai a produção.
- Nenhum push executado (D-06) — `git status -sb` confirma `main...origin/main [ahead 54]`, sem sincronização remota.
- Verificação visual do gráfico renderizado (react-native-chart-kit) na tela Progresso real não foi exercitada nesta máquina sem toolchain nativo — fica como item de UAT/checkpoint humano, potencialmente coberto pelo painel do 05-02 ou por verificação humana em build real.

---
*Phase: 05-integra-o-e-review-do-gr-fico-de-cardio*
*Completed: 2026-08-14*

## Self-Check: PASSED

Todos os 7 arquivos citados (4 do gráfico + `.gitignore` + `.planning/reviews/REVIEW.md` + este SUMMARY.md) existem no disco. Os 3 hashes de commit (`4a747a1`, `762943c`, `f61a45a`) foram confirmados em `git log --oneline --all`.
