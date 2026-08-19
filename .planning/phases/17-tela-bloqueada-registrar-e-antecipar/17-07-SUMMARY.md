---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 07
subsystem: infra
tags: [ios, activitykit, live-activity, uat, lock-screen]

# Dependency graph
requires:
  - phase: 17-tela-bloqueada-registrar-e-antecipar (planos 17-01..17-06)
    provides: >
      Steppers de reps/carga na Live Activity (AdjustRepsIntent/AdjustLoadIntent),
      widgetURL corrigido (D-12), linha "A SEGUIR" (Plano 17-05), e o binário
      Release compilado e assinado com os 11 campos novos de ContentState
      propagados na bridge Swift (Plano 17-06, `5080d87`).
provides:
  - "Confirmação do dono, no iPhone 13 físico, dos Critérios 2, 3 e 4 do ROADMAP (PASS nos três)"
  - "Migração de ContentState (Pitfall 4) sem erro de decode em sessão nova pós-instalação"
  - "Resultado registrado dos dois riscos de plataforma sem fonte oficial da Apple (toque rápido, orçamento de Activity.update()) — ambos PASS"
  - "Achado de design registrado: card do Lock Screen pequeno para a densidade de informação atual — consequência observável da D-09, escopo novo para decisão futura do dono"
affects: [milestone-v1.3-fechamento]

# Actuals (#2632)
actuals:
  tokens: 0
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Item 6 (alvo de toque/legibilidade) foi lido como PASS funcional porque o critério literal do plano (acertar o botão pretendido 5/5 por par e ler os números de relance) foi satisfeito — mas o dono relatou espontaneamente que o card está pequeno para a quantidade de informação e precisa ser remodelado. Registrado como ACHADO DE QUALIDADE, não como FAIL: não bloqueia o fechamento da fase, mas gera escopo novo de design que o dono ainda vai decidir onde encaixar."
  - "REG-01 permanece com a ressalva da janela #5 (unrun-verify) aberta em WINDOWS.md — este UAT físico cobriu REG-02 e PRED-01 (os itens com a marcação '(UAT do dono no aparelho físico)' no ROADMAP mais os riscos de plataforma), não a checagem de PWA (viewport 390x844) que substitui REG-01. São verificações estruturalmente distintas e este plano não tinha escopo para cobrir a segunda."

patterns-established: []

requirements-completed: [REG-02, PRED-01]

coverage:
  - id: D1
    description: "Migração de ContentState (Pitfall 4): sessão nova pós-instalação do binário 17-06 não apresenta campo em branco/zerado nem erro de decode"
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Live Activity não é testável em simulador; só o dono no aparelho físico observa o resultado do decode."
  - id: D2
    description: "Critério 2 do ROADMAP: ajuste de reps/carga na tela bloqueada com valor preservado entre toques (REG-02)"
    requirement: REG-02
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Live Activity e App Intents não são testáveis em simulador — única fonte é o relato do dono no aparelho."
  - id: D3
    description: "Toque rápido (Pitfall 1, sem fonte oficial da Apple): rajada de toques não abre o app sozinho e não perde incrementos"
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Risco de plataforma sem documentação oficial da Apple; só observável no hardware físico."
  - id: D4
    description: "Orçamento de Activity.update() sob rajada (Pitfall 2, sem número oficial): card acompanha os toques sem atraso perceptível"
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Risco de plataforma sem documentação oficial da Apple; só observável no hardware físico."
  - id: D5
    description: "Critério 3 do ROADMAP: valor de carga fora do passo do stepper abre o app direto na sessão/série correta (D-12)"
    requirement: REG-02
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Deep link e App Intents não são testáveis em simulador."
  - id: D6
    description: "Critério 4 do ROADMAP: linha 'A SEGUIR' visível desde o primeiro segundo do descanso (PRED-01)"
    requirement: PRED-01
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Live Activity não é testável em simulador."
  - id: D7
    description: "Alvo de toque e legibilidade dos steppers (D-09): acerta o botão pretendido 5/5 por par e lê os números de relance — PASS funcional, com achado de densidade de card registrado à parte"
    verification:
      - kind: manual_procedural
        ref: "Relato do dono, sessão física no iPhone 13, 2026-08-19"
        status: pass
    human_judgment: true
    rationale: "Ergonomia de toque só observável no aparelho físico; achado qualitativo adicional documentado na seção 'Achado de Design' abaixo."
  - id: D8
    description: "Paridade das duas cópias de SessionActivityAttributes.swift (diff-parity check)"
    verification:
      - kind: other
        ref: "bash scripts/verify-native-skeleton.sh — exit 0, duas rodadas (09:28 avulsa e gate 8/8 do resign), '(a)-(h) OK' em ambas"
        status: pass
    human_judgment: false

# Metrics
duration: N/A (sessão física conduzida pelo dono; registro pelo orquestrador)
completed: 2026-08-19
status: complete
---

# Phase 17 Plan 07: UAT Físico — Steppers, Antecipação e Migração de ContentState Summary

**Sessão física do dono no iPhone 13 confirma PASS nos 7/7 itens do roteiro (Critérios 2/3/4 do ROADMAP, os dois riscos de plataforma sem fonte oficial da Apple, a migração de ContentState e a paridade de arquivos nativos) — fecha REG-02 e PRED-01 com evidência de aparelho físico, e registra um achado de densidade de card para escopo futuro.**

## Performance

- **Duration:** N/A — este plano tem uma única tarefa `checkpoint:human-verify`, respondida pelo dono fora desta sessão de execução. O registro (este SUMMARY + atualização de REQUIREMENTS.md) foi feito pelo orquestrador em 2026-08-19.
- **Tasks:** 1/1
- **Files modified:** 1 (`.planning/REQUIREMENTS.md`) + este SUMMARY.md

## Resultado item a item

Fonte: relato literal do dono em 2026-08-19 — *"Todos os itens passaram de forma tranquila, um ponto é que o box na tela bloqueada esta pequeno para tanta informacao, precisamos remodelar o design"*.

**Ressalva estrutural, válida para os itens Passo 0 e 1–7 abaixo que dependem do aparelho:** Live Activity e App Intents não são testáveis em simulador (restrição reafirmada pela pesquisa das Fases 14/15/16/17). A única fonte possível de verificação para esses itens é o relato do dono operando o iPhone 13 físico — não há caminho automatizado alternativo. Os itens marcados com evidência de máquina (Passo 0 parcialmente, e o Item 7) são a exceção onde este ambiente conseguiu confirmar algo por conta própria.

- **Passo 0 — Migração de ContentState (Pitfall 4): PASS.**
  Evidência de máquina: `npm run resign` terminou com exit 0; build assinado a partir do HEAD `d249730` instalado no aparelho às 10:12:33 de 2026-08-19 (bundleID `com.pmarconato.forcaapp`, log com `** BUILD SUCCEEDED **` e `App installed`); o gate final 8/8 do próprio `resign` rodou `verify-native-skeleton.sh` e passou. Combinado com o relato do dono de que "todos os itens passaram de forma tranquila" (sem menção a card em branco/zerado ou erro de decode), a migração do contrato `ContentState` (mudado três vezes nesta fase: Planos 17-01, 17-03, 17-05) não quebrou a sessão nova pós-instalação.

- **Item 1 — Critério 2 do ROADMAP (ajuste de reps/carga na tela bloqueada, valor preservado entre toques): PASS.**
  Evidência: relato do dono. Nenhum FAIL reportado.

- **Item 2 — Toque rápido (Pitfall 1 do RESEARCH.md, sem fonte oficial da Apple): PASS.**
  Evidência: relato do dono. Nenhum FAIL reportado — o app não abriu sozinho durante a rajada e os incrementos bateram com os toques.

- **Item 3 — Orçamento de `Activity.update()` sob rajada (Pitfall 2, sem número oficial): PASS.**
  Evidência: relato do dono. Card acompanhou os toques sem atraso perceptível reportado.

- **Item 4 — Critério 3 do ROADMAP (valor fora do passo abre o app na sessão certa, D-12): PASS.**
  Evidência: relato do dono. Nenhum FAIL reportado.

- **Item 5 — Critério 4 do ROADMAP (linha "A SEGUIR" visível desde o primeiro segundo do descanso): PASS.**
  Evidência: relato do dono. Nenhum FAIL reportado — este é o item que fecha PRED-01.

- **Item 6 — Alvo de toque e legibilidade (D-09): PASS funcional, COM ACHADO.**
  O critério literal do item (acertar o botão pretendido 5/5 por par e ler os números de relance) foi satisfeito — o dono não reportou erro de alvo nem corte/truncamento de conteúdo, condições que o plano define como FAIL. Isso classifica o item como PASS. Porém o dono registrou explicitamente, por conta própria, que **o card está pequeno para a quantidade de informação e o design precisa ser remodelado**. Ver seção "Achado de Design" abaixo — este achado NÃO é um FAIL do item 6 (o critério PASS/FAIL do plano foi cumprido), é um achado de qualidade adicional.

- **Item 7 — Paridade das duas cópias de `SessionActivityAttributes.swift`: PASS.**
  Evidência de máquina: `bash scripts/verify-native-skeleton.sh` rodou duas vezes nesta máquina no HEAD atual (09:28 avulso e no gate 8/8 do `resign`), exit 0 em ambas, com "(a)-(h) OK" nas duas rodadas do `--clean` de cada execução. Este item não depende do hardware, por isso não foi repetido manualmente no aparelho, conforme o próprio plano instrui.

**Nenhum item foi reportado como FAIL.** O dono não precisou acionar a cláusula de aceite de risco dos Itens 2/3/6 (prevista no `resume-signal` do plano para o caso de FAIL registrado sem bloquear a fase), porque nenhum deles falhou.

## Achado de Design (Item 6 — não bloqueia o fechamento da fase)

O dono relatou, ao final da sessão: **"um ponto é que o box na tela bloqueada esta pequeno para tanta informacao, precisamos remodelar o design"**.

Isso é a materialização observável da consequência que a decisão D-09 já havia aceito por escrito (card denso, com múltiplos steppers e a linha "A SEGUIR" competindo por espaço no Lock Screen). O item 6 do roteiro passou no critério PASS/FAIL definido (acerto de alvo 5/5, leitura de relance), então este achado não reabre REG-02 nem PRED-01 como gap. É registrado aqui como **escopo novo de design**, ainda sem plano de correção, sem fase alocada e sem alteração de UI feita — o dono decidirá para onde este trabalho vai. Nenhum arquivo de UI foi tocado por este plano.

## Task Commits

1. **Task 1 (checkpoint:human-verify): Sessão física — REG-02 + PRED-01 + migração de ContentState** — sem commit próprio (tarefa de verificação humana; não produz código, `files_modified: []` no frontmatter do plano).

**Plan metadata:** (este commit, feito logo em seguida) — `17-07-SUMMARY.md` + `.planning/REQUIREMENTS.md`.

## Files Created/Modified

- `.planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-07-SUMMARY.md` — este arquivo.
- `.planning/REQUIREMENTS.md` — PRED-01 marcado Complete (Item 5 confirmado no aparelho); ressalva de REG-02 removida (confirmação de aparelho físico obtida); ressalva de REG-01 preservada, com nota atualizada explicando por que ela sobrevive a este UAT.

## Decisions Made

- Item 6 foi lido como PASS funcional + achado de qualidade separado, não como FAIL — ver `key-decisions` no frontmatter e a seção "Achado de Design" acima.
- REG-01 não foi fechado por este UAT: o Critério 1 do ROADMAP (que corresponde a REG-01 no app) não carrega a marcação "(UAT do dono no aparelho físico)" — o próprio `17-07-PLAN.md` declara isso no objective ("o critério 1, REG-01 no app, não exige UAT físico"). A pendência real de REG-01 é a janela aberta #5 em `WINDOWS.md` (checagem de PWA em viewport 390x844, substituída por réplica de box-model em Chromium neste worktree sandboxed) — não relacionada ao que este plano testou.

## Deviations from Plan

None - plano executado exatamente como escrito. A única leitura interpretativa (Item 6 como PASS + achado, em vez de FAIL) está documentada acima e é consistente com o critério PASS/FAIL literal definido no `17-07-PLAN.md`.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- REG-02 e PRED-01 fecham com evidência de aparelho físico — os três Critérios do ROADMAP com UAT físico obrigatório (2, 3, 4) estão PASS.
- REG-01 permanece com a janela #5 aberta em `WINDOWS.md` (checagem de PWA não executável neste worktree sandboxed) — não bloqueada por este plano, mas não fechada por ele.
- Achado de design (card denso no Lock Screen) registrado como escopo novo, sem plano de correção ainda — decisão do dono sobre onde alocar.
- Nenhum stub, nenhum teste pulado, nenhum `<verify>` que não rodou dentro do escopo deste plano (Item 7 é o único `<verify>` automatizável e rodou 2x, PASS).

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-19*
