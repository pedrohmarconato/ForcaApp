---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 04
subsystem: ui
tags: [react-native, react-native-web, zustand, jest, testing-library, SessionPlayer]

# Dependency graph
requires:
  - phase: 17-tela-bloqueada-registrar-e-antecipar (Plano 17-02)
    provides: "suggestReps()/stepReps()/resolveInheritedSet()/isFirstSetOfExerciseInSession() em sessionModel.ts; stepReps action + suggestedRepsFor() em activeSessionStore.ts"
provides:
  - "readyToMeasure em SessionPlayer.tsx: active ?? (next que já passa canCompleteSet() com valores herdados) — card de medição revela direto sem depender de activateSet (D-06)"
  - "Stepper de reps (−/valor/+) substituindo o TextInput no fluxo padrão (D-05)"
  - "Texto estático herdado para carga (com sufixo 'kg' em corpo menor) quando há sugestão ou valor já digitado; TextInput+autoFocus preservado só na estreia sem histórico/alvo (D-04)"
  - "styles.inheritedValue: marca visual (cor discreta) do valor herdado até o primeiro +/− (D-03)"
  - "measureFields/measureField: reps e carga EMPILHADOS no card measuring (não mais lado a lado) — fix de um bug real de largura descoberto ao verificar D-05 no viewport 390×844"
affects: [17-05-antecipar-proxima-acao]

# Actuals (#2632)
actuals:
  tokens: 8321
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Card measuring revela-se via readyToMeasure = active ?? (next que já passa canCompleteSet() com resolveInheritedSet() aplicado), não mais só via activateSet — o mesmo canCompleteSet() sobre o merge herdado também precisa gatear o botão Concluir série (podeConcluir), senão o botão fica preso desabilitado mesmo com o card já revelado."
    - "Campo de texto que alterna entre TextInput e Text estático (D-04→D-05) precisa de um discriminador estável durante a digitação (editandoCarga = textoCarga != null), não só do valor materializado (actualLoadKg == null) — o primeiro dígito já torna actualLoadKg não-nulo, o que trocaria o elemento NO MEIO da digitação sem esse cuidado."
    - "Dois steppers (2 botões de 50pt cada) não cabem lado a lado numa proporção de linha calibrada para quando um dos campos era um TextInput solto sem botões — empilhar verticalmente (measureFields) é o fix, não reduzir botão nem afinar ainda mais o texto."

key-files:
  created: []
  modified:
    - src/components/session/SessionPlayer.tsx
    - src/components/session/sessionPlayerLayout.ts
    - src/screens/ActiveSessionScreen.tsx
    - __tests__/sessionPlayerTransitions.test.tsx
    - __tests__/sessionPlayerCleanup.test.tsx
    - __tests__/activeSessionScreen.test.tsx
    - __tests__/loadInputLayoutWeb.test.ts

key-decisions:
  - "Reps e carga EMPILHADOS no card measuring, não mais lado a lado (inputsRow com flex 1:2.2) — descoberto ao medir a largura real a 390pt: a fatia de reps (1/3.2 da linha, ~92,5pt) é menor que só os 2 botões do próprio stepper (112pt), um overflow real que a checagem manual da Task 2 existe para pegar. D-07 já tinha aceito 'o card fica mais alto com dois steppers' como consequência — o empilhamento cumpre essa troca."
  - "'kg' no sufixo da carga ganha corpo menor (styles.loadUnitSuffix) em vez de herdar o fontSize.display do número — no tamanho grande, o sufixo sozinho apertava a folga de 8,3pt já calibrada em loadInputLayoutWeb.test.ts para negativo."
  - "podeConcluir (botão Concluir série) recalculado com o mesmo merge herdado de readyToMeasure, não com o set cru — sem isso o botão ficaria desabilitado mesmo quando o card já nasce revelado por D-06."
  - "editandoCarga (textoCarga != null) mantém o TextInput da estreia (D-04) montado durante toda a digitação, mesmo depois do primeiro dígito já ter tornado actualLoadKg não-nulo (o que sozinho zeraria precisaCarga e trocaria o campo por texto estático NO MEIO da digitação)."
  - "Botão 'Usar sugestão: X kg' (F10, pré-existente) mantido sem alteração — coexiste com o novo texto herdado por decisão de escopo (não estava no <action> desta plan; ver Deviações)."

patterns-established:
  - "Qualquer novo campo com stepper duplo (2 botões hitTarget.regular) precisa da largura INTEIRA do card, não uma fatia de flex-row compartilhada com outro campo — dois steppers nunca cabem lado a lado num card de smartphone."

requirements-completed: [REG-01]

coverage:
  - id: D1
    description: "Reps deixa de ser TextInput editável no fluxo padrão — vira stepper (−/valor/+) via stepReps(); TextInput só sobrevive na estreia sem histórico/alvo (carga, D-04)"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/sessionPlayerTransitions.test.tsx#Fase 17 (REG-01) — casos (a)-(e)"
        status: pass
      - kind: unit
        ref: "__tests__/activeSessionScreen.test.tsx#executa a sessão de ponta a ponta e conclui o treino / bloqueia edição da medição enquanto a gravação está em voo"
        status: pass
    human_judgment: false
  - id: D2
    description: "Valor herdado (ainda não tocado) marcado visualmente (styles.inheritedValue) até o primeiro +/− para reps e carga (D-03)"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/sessionPlayerTransitions.test.tsx#(a) carga herdada ... / (b) após o primeiro toque em + ..."
        status: pass
    human_judgment: false
  - id: D3
    description: "Card measuring revela-se direto (sem 'Iniciar série') quando o pré-preenchimento já passa em canCompleteSet(); continua exigindo 'Iniciar série' quando não passa (D-06, sem regressão)"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/sessionPlayerTransitions.test.tsx#(d) série next com pré-preenchimento válido ... / (e) série next sem pré-preenchimento válido ..."
        status: pass
    human_judgment: false
  - id: D4
    description: "PWA web (mesmo componente) não regride: stepper de reps (e o de carga, empilhado) não estoura a largura em viewport 390×844"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/loadInputLayoutWeb.test.ts#campos empilhados do SessionPlayer (reps e carga) — largura no web"
        status: pass
      - kind: other
        ref: "Chromium real (Playwright) renderizando uma réplica exata do CSS/box-model (tokens de theme.ts + fonte Inter-Variable.ttf reais) do card measuring a 390×844 — 0 overflow medido (scrollWidth==clientWidth==390, ambos os '+' terminam em x=349/350); screenshot em .planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-04-pwa-check.png"
        status: pass
    human_judgment: true
    rationale: "A checagem que o plano pede é `npx expo start --web` + o app REAL num navegador (DevTools 390×844 ou claude-in-chrome). Não pôde ser executada neste worktree sandboxed: sem acesso a .env/Supabase (permissão negada ao ler .env.example), sem ferramentas MCP de browser disponíveis a este executor, e sem rede para o Supabase local do dono (192.168.15.77, per MEMORY.md). A evidência acima (Chromium real via Playwright, tokens de tema e fonte reais, não é um mock aproximado) é uma compensação forte mas não é o app rodando de verdade — falta a passagem final do dono, consistente com o próprio ROADMAP da Fase 17 já tratar 3 dos 4 critérios de sucesso como UAT físico. Registrado em WINDOWS.md (entrada #5, kind=unrun-verify)."

# Metrics
duration: ~35min
completed: 2026-08-19
status: complete
---

# Phase 17 Plan 04: Steppers sem teclado, marca de herdado, revelação direta (REG-01) Summary

**`SessionPlayer.tsx` troca o TextInput de reps por um stepper (−/valor/+), marca visualmente o valor herdado até o primeiro toque, revela o card de medição sem depender de "Iniciar série" quando o pré-preenchimento já é válido, e empilha reps/carga (em vez de dividi-los lado a lado) depois que a checagem de largura no web mostrou que o antigo layout não cabia mais dois steppers de 50pt na mesma linha a 390pt.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-19
- **Tasks:** 2/2
- **Files modified:** 7 (2 produção principais + 1 wiring + 1 layout + 4 arquivos de teste)

## Accomplishments
- `readyToMeasure = active ?? (next que já passa canCompleteSet() com valores herdados via resolveInheritedSet())` decide a revelação direta do card de medição sem depender de `activateSet` (D-06)
- Reps vira stepper (−/valor/+) via `stepReps()`; carga vira texto estático entre steppers quando há sugestão ou valor já digitado, preservando `TextInput` + `autoFocus` só na estreia sem histórico/alvo (D-04/D-05)
- `styles.inheritedValue` marca reps e carga herdados (ainda não tocados) até o primeiro `+/−` (D-03)
- Bug real de largura descoberto ao medir o layout a 390pt: o antigo split lado a lado (reps 1/3.2, carga 2.2/3.2 da linha) não sobrava espaço nem para os 2 botões do próprio stepper de reps — corrigido empilhando os dois campos (`measureFields`/`measureField`) e encolhendo o sufixo "kg" da carga
- `podeConcluir` recalculado com o mesmo merge herdado que gate `readyToMeasure`, para o botão "Concluir série" não ficar preso desabilitado quando o card já nasce revelado

## Task Commits

Each task was committed atomically:

1. **Task 1: Steppers sem teclado, marca de herdado, revelação direta (D-03/D-04/D-05/D-06)** - `e2aade1` (feat)
2. **Task 2: Testes de transição + checagem manual de regressão do PWA web (D-05)** - `20e2307` (test)

**Plan metadata:** committed together with worktree wave metadata by the orchestrator (SUMMARY.md + STATE.md are excluded from per-plan commits in worktree isolation mode; see `<parallel_execution>`).

_Note: Task 1 is `type="tracer" tdd="true"` — `<verify>` (`npx tsc --noEmit`) re-run clean before Task 2 began, satisfying the tracer feedback gate in a non-interactive worktree run._

## Files Created/Modified
- `src/components/session/SessionPlayer.tsx` - `readyToMeasure`, stepper de reps, texto estático herdado de carga (com sufixo "kg" menor), `styles.inheritedValue`/`measureFields`/`measureField`, `podeConcluir`/`editandoCarga` recalculados sobre valores herdados, `Props.suggestedRepsFor`
- `src/components/session/sessionPlayerLayout.ts` - `REPS_INPUT_STYLE` (nova constante, espelha `LOAD_INPUT_STYLE`)
- `src/screens/ActiveSessionScreen.tsx` - wiring de `suggestedRepsFor={(ex,s) => suggestedRepsFor(draft, ex, s)}`
- `__tests__/sessionPlayerTransitions.test.tsx` - 5 casos novos (D-03/D-04/D-06) + `PlayerComStoreCustom` + `temMarcaDeHerdado`
- `__tests__/sessionPlayerCleanup.test.tsx` - fallout de tsc (`suggestedRepsFor` virou prop obrigatória)
- `__tests__/activeSessionScreen.test.tsx` - fallout de 2 testes e2e (reps deixou de ser TextInput; `disabled` de TouchableOpacity vira `accessibilityState.disabled` no host node)
- `__tests__/loadInputLayoutWeb.test.ts` - reescrito para medir o layout empilhado real (novo describe, nova fórmula), com casos para reps e para o próprio stepper de 2 botões

## Decisions Made
- Reps e carga EMPILHADOS no card measuring — ver `key-decisions` no frontmatter para o raciocínio completo (a largura medida não fechava lado a lado).
- `podeConcluir` e `editandoCarga` — dois ajustes de correção necessários para D-06/D-04 funcionarem de verdade (ver Deviações).
- Botão "Usar sugestão: X kg" (F10, pré-existente) mantido sem alteração — ver Deviações.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `podeConcluir` não enxergava os valores herdados que `readyToMeasure` já usava para revelar o card**
- **Found during:** Task 1, ao implementar o card measiring
- **Issue:** `podeConcluir` chamava `canCompleteSet(set, ...)` sobre o `set` CRU — com `readyToMeasure` revelando o card via valores herdados (não gravados em `actualReps`/`actualLoadKg`), o botão "Concluir série" ficaria desabilitado mesmo com o card já revelado, quebrando o "1 toque" que D-06 promete.
- **Fix:** `podeConcluir` recalculado com o mesmo merge (`actualReps ?? suggestedReps`, `actualLoadKg ?? suggestedLoad`) que `readyToMeasure` usa para gatear a revelação.
- **Files modified:** `src/components/session/SessionPlayer.tsx`
- **Verificação:** `__tests__/sessionPlayerTransitions.test.tsx#(d)` pressiona "Concluir série" direto no card revelado e confirma que a série sai de `pending`.
- **Committed in:** `e2aade1` (Task 1 commit)

**2. [Rule 1 - Bug] `precisaCarga` derrubava o TextInput da estreia (D-04) NO MEIO da digitação**
- **Found during:** Task 1
- **Issue:** `precisaCarga` (`suggestedLoad == null && actualLoadKg == null`) recalcula a cada render; o primeiro dígito digitado já torna `actualLoadKg` não-nulo, o que zeraria `precisaCarga` e trocaria o `TextInput` por texto estático antes do aluno terminar de digitar — quebrando exatamente o comportamento que D-04 exige preservar ("igual ao comportamento atual").
- **Fix:** `editandoCarga = textoCarga != null` (estado local já existente para o texto cru em edição) mantém o `TextInput` montado durante toda a sessão de digitação; só reseta ao trocar de série ou usar o stepper.
- **Files modified:** `src/components/session/SessionPlayer.tsx`
- **Verificação:** `__tests__/sessionPlayerTransitions.test.tsx#(c)` confirma `TextInput` + `autoFocus`; suíte completa (1953 testes) verde.
- **Committed in:** `e2aade1` (Task 1 commit)

**3. [Rule 1 - Bug] `serieAtivaId` (reset de texto em edição) só reagia a `active`, não a `readyToMeasure`**
- **Found during:** Task 1
- **Issue:** O `useEffect` que zera `textoCarga`/`textoDistancia` ao trocar de série usava `active?.set.plannedSetId` — com D-06 revelando séries `pending` sem nunca chamar `activateSet`, texto digitado numa série revelada direto vazaria para a próxima.
- **Fix:** Trocado para `readyToMeasure?.set.plannedSetId`.
- **Files modified:** `src/components/session/SessionPlayer.tsx`
- **Verificação:** suíte completa verde; comportamento coberto indiretamente pelos testes de transição existentes (nenhuma regressão nos 4 testes de troca de série/exercício).
- **Committed in:** `e2aade1` (Task 1 commit)

**4. [Rule 3 - Blocking] `suggestedRepsFor` virou prop obrigatória — 2 arquivos de teste fora do escopo declarado quebraram o `tsc --noEmit`**
- **Found during:** Task 1 (`npx tsc --noEmit`)
- **Issue:** `__tests__/sessionPlayerCleanup.test.tsx` e (o próprio) `__tests__/sessionPlayerTransitions.test.tsx` renderizavam `<SessionPlayer>` sem a nova prop obrigatória.
- **Fix:** Adicionado `suggestedRepsFor={() => 8}` ao `PlayerComStore` dos dois arquivos.
- **Files modified:** `__tests__/sessionPlayerCleanup.test.tsx`, `__tests__/sessionPlayerTransitions.test.tsx`
- **Verificação:** `npx tsc --noEmit` limpo.
- **Committed in:** `e2aade1` (Task 1 commit)

**5. [Rule 3 - Blocking] `__tests__/activeSessionScreen.test.tsx` (fora do escopo declarado) quebrava por presumir TextInput de reps**
- **Found during:** Task 2 (varredura de fallout antes de fechar a plan)
- **Issue:** 2 testes e2e (`executa a sessão de ponta a ponta...`, `bloqueia edição da medição...`) usavam `fireEvent.changeText` em "Repetições da série N" (agora um `Text` estático) e checavam `.props.editable`/`.props.disabled` diretamente na `TouchableOpacity` do stepper de reps.
- **Fix:** Trocado `changeText` por `fireEvent.press` nos steppers de reps; `disabled` de `TouchableOpacity` vira `accessibilityState.disabled` no host node que `getByLabelText` resolve no react-test-renderer — corrigido para `.props.accessibilityState?.disabled`.
- **Files modified:** `__tests__/activeSessionScreen.test.tsx`
- **Verificação:** Os 20 testes do arquivo voltaram a passar; suíte completa (1953 testes, 167 arquivos) verde.
- **Committed in:** `20e2307` (Task 2 commit)

**6. [Rule 1 - Bug] Layout lado a lado (inputsRow) não cabia mais dois steppers de 50pt a 390pt — descoberto na checagem manual de PWA da própria Task 2**
- **Found during:** Task 2, ao calcular a largura real do card measuring para a checagem de PWA
- **Issue:** Medido: `interiorDoCard(390pt) = 308pt`; `linha = 296pt`; fatia de reps (`FIELD_FLEX/(FIELD_FLEX+FIELD_WIDE_FLEX) = 1/3.2`) = `92,5pt` — MENOR que só os 2 botões (50pt cada) + 2 gaps do próprio stepper de reps (`112pt`). Overflow real, negativo antes até de considerar o valor. O sufixo "kg" acrescentado à carga (no mesmo fontSize.display do número) também apertava a folga já calibrada (8,3pt) de `loadInputLayoutWeb.test.ts` para negativo.
- **Fix:** Reps e carga passam a EMPILHAR (`measureFields`/`measureField`, coluna) em vez de dividir uma linha — cada campo ganha a largura inteira do card (308pt, folga de 196pt para o valor depois dos 2 botões). "kg" ganha corpo menor (`styles.loadUnitSuffix`). `fieldWide`/`FIELD_WIDE_FLEX` removidos de `SessionPlayer.tsx` (dead code — nenhum consumidor de produção restante; export preservado em `sessionPlayerLayout.ts`).
- **Files modified:** `src/components/session/SessionPlayer.tsx`, `__tests__/loadInputLayoutWeb.test.ts`
- **Verificação:** Matemática refeita e testada em `loadInputLayoutWeb.test.ts` (6 casos, incluindo o próprio stepper de 2 botões cabendo a 390pt); confirmado com Chromium REAL via Playwright (tokens de `theme.ts` + fonte `Inter-Variable.ttf` reais) — `document.scrollWidth === document.clientWidth === 390`, ambos os "+" terminam em x≤350, texto "127,5 kg" mede 69,9pt dentro de uma caixa de 180pt úteis. Screenshot salvo em `17-04-pwa-check.png`.
- **Committed in:** `20e2307` (Task 2 commit)

---

**Total deviations:** 6 auto-fixed (3 Rule 1 — bugs de correção que D-06/D-04/D-05 exigiam para funcionar de verdade; 2 Rule 3 — fallout de tsc/teste diretamente causado pelas mudanças desta plan; 1 Rule 1 — bug real de largura descoberto pela própria checagem que a Task 2 mandava fazer).
**Impact on plan:** Nenhum scope creep fora do necessário para D-03/D-04/D-05/D-06 funcionarem sem regressão e sem quebrar a suíte existente. O empilhamento de reps/carga é uma mudança de layout maior do que o `<action>` da Task 1 descreveu literalmente (que presumia manter `inputsRow`), mas está dentro da autorização explícita da própria Task 2 ("se FAIL, corrija REPS_INPUT_STYLE/o layout do stepper antes de prosseguir") e consistente com D-07 já ter aceito "o card fica mais alto com dois steppers".

## Issues Encountered
- A checagem manual de PWA pedida pela Task 2 (`npx expo start --web` + DevTools/claude-in-chrome) não pôde ser executada literalmente neste worktree sandboxed: leitura de `.env.example` foi negada por permissão, não há ferramentas MCP de browser disponíveis a este executor, e não há rede para o Supabase local do dono. Substituída por uma verificação em Chromium real (Playwright, já disponível em cache local) de uma réplica exata do CSS/box-model do card (tokens de `theme.ts` e fonte `Inter-Variable.ttf` reais, não aproximados) — confirmou 0 overflow a 390×844 e a 360px. Ver `coverage.D4` e `WINDOWS.md` (entrada #5, kind=unrun-verify) para o registro completo e a recomendação de o dono repetir o check no app real antes de fechar REG-01.

## User Setup Required
None - no external service configuration required. Recomendado (não bloqueante): o dono rodar `npx expo start --web` e abrir a sessão ativa em 390×844 antes de considerar REG-01 100% fechado no PWA — ver Issues Encountered acima.

## Next Phase Readiness
- `SessionPlayer.tsx` está pronto para o Plano 17-05 (PRED-01, antecipação da próxima ação): o mesmo `suggestedRepsFor`/`resolveInheritedSet` que este plano consome para o card measuring são a fonte que a linha "A seguir" da Live Activity vai precisar.
- Nenhum bloqueio para o app nativo. Único item pendente é o UAT físico/PWA do dono (item deferido, não bloqueante — ver Issues Encountered).

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: src/components/session/SessionPlayer.tsx
- FOUND: src/components/session/sessionPlayerLayout.ts
- FOUND: src/screens/ActiveSessionScreen.tsx
- FOUND: __tests__/sessionPlayerTransitions.test.tsx
- FOUND: .planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-04-pwa-check.png
- FOUND: e2aade1
- FOUND: 20e2307
