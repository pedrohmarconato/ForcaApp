---
phase: 16-tela-bloqueada-comandar
plan: 09
subsystem: testing
tags: [uat, live-activity, app-intents, lock-screen, ios, gap-closure]

requires:
  - phase: 16-tela-bloqueada-comandar (planos 16-07 e 16-08)
    provides: peek não-destrutivo + ack condicionado (D1); setReps/setLoad->saveDraft + invariante de série única em activateSet (D2/D2b/D3)
provides:
  - Build Release reassinado com proveniência confirmada (16-07 + 16-08 mergeadas)
  - Resposta agregada do dono à sessão física de re-execução, com interpretação item-a-item explícita e não literal
  - Confirmação de que os três defeitos de 16-06-SUMMARY.md (D1/D2/D3) estão fechados no aparelho físico
affects: [fase-17-registro, live-activity, reconciliacao, active-session-store, verify-work]

actuals:
  tokens: 3200
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Task 1 não gera commit de código — files_modified: [] no PLAN.md. A entrega é o build reassinado + o registro de proveniência, ambos documentados nesta SUMMARY."
  - "A resposta do dono foi agregada ('todas foram pass agora'), não item-a-item. A interpretação por item (sem_duplicacao=PASS, force_quit_toque=PASS-A, regressao_geral=PASS) é DERIVADA à luz do runbook apresentado a ele — que já declarava PASS-B inaceitável nesta rodada — e não uma transcrição literal de três respostas separadas. Ambas as camadas (frase literal + interpretação) são registradas para que quem ler depois veja a diferença."
  - "requirements-completed deixado VAZIO deliberadamente, MESMO com os três itens em PASS/PASS-A. Marcar CMD-01/CMD-02 como completos é escopo exclusivo da próxima rodada de /gsd-verify-work — repetir a marcação aqui reproduziria o erro revertido no commit 82c23c8, prohibition explícita do 16-09-PLAN.md."
  - "O dono rodou 'npm run resign' uma segunda vez por conta própria, imediatamente antes da sessão física, reinstalando o mesmo commit e145ef4 já verificado pela Task 1 — sem alterar a proveniência estabelecida (mesmo hash de fonte, mesma verificação de bytecode Hermes e recompilação Swift)."
  - "O build usa Supabase LOCAL via LAN (192.168.15.77), não produção (zanqygwsgxkyjiuhrzju). Isso diverge do que 15-04-PLAN.md/STATE.md registram (produção desde a Fase 15), mas confirma a memória do projeto sobre builds de device nesta fase. Registrado como observação factual, não como erro — o orquestrador confirmou o endpoint respondendo HTTP 200 antes da sessão."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "Sequência de toques com o app vivo, seguida de force-quit e reabertura da mesma sessão, continua sem duplicar nem reaplicar nenhuma ação"
    requirement: CMD-02
    verification:
      - kind: manual_procedural
        ref: "sessão física 18/08/2026, iPhone real (UDID 4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7), build Release reassinado a partir de e145ef4 (reinstalado 2x, mesma proveniência) — resposta agregada do dono 'todas foram pass agora', interpretada como sem_duplicacao=PASS"
        status: pass
    human_judgment: true
    rationale: "Só o aparelho físico, com o app genuinamente vivo/backgrounded e depois morto, exercita o caminho de ack in-process contra a fila durável do App Group. Resultado já era PASS em 16-06 e permanece PASS nesta rodada."
  - id: D2
    description: "Force-quit com reps/carga JÁ informados antes do force-quit, seguido de toque em 'Concluir série' na tela bloqueada e reabertura do app, mostra a série já concluída automaticamente (PASS-A, não PASS-B)"
    requirement: CMD-01
    verification:
      - kind: manual_procedural
        ref: "sessão física 18/08/2026 — resposta agregada do dono 'todas foram pass agora', interpretada como force_quit_toque=PASS-A à luz do runbook que declarava PASS-B inaceitável nesta rodada"
        status: pass
    human_judgment: true
    rationale: "O comportamento de cold-launch após force-quit real não é reproduzível fora do aparelho. A interpretação de PASS-A (não PASS-B) depende do runbook apresentado ao dono ter definido PASS-B como FAIL nesta rodada — ver ressalva de honestidade abaixo."
  - id: D3
    description: "Tocar 'Pular' na ÚLTIMA série de um exercício, mesmo depois de uma série travada 'active' por rejeição de completeSet(), ativa corretamente a próxima série do exercício seguinte"
    verification:
      - kind: manual_procedural
        ref: "sessão física 18/08/2026 — resposta agregada do dono 'todas foram pass agora', interpretada como regressao_geral=PASS"
        status: pass
    human_judgment: true
    rationale: "Depende da sequência real de estado no aparelho após um completeSet reprovado deliberadamente. Era FAIL em 16-06 (invariante de série única ainda não existia); D3 do 16-08-PLAN.md corrigiu."

duration: ~20min (Task 1) + resposta do dono em sessão física posterior no mesmo dia
completed: 2026-08-18
status: complete
---

# Fase 16 — Plano 09: Re-execução do UAT físico após D1/D2/D3 (16-07 + 16-08)

**Build reassinado com proveniência confirmada; resposta agregada do dono ("todas foram pass agora") interpretada, com ressalva explícita, como PASS nos três itens — os dois FAILs de 16-06-SUMMARY.md (force_quit_toque, regressao_geral) revertem para PASS/PASS-A.**

## Performance

- **Duração:** Task 1 (build + proveniência) ~20min nesta sessão de continuação; a sessão física do dono ocorreu à parte, e a resposta chegou como texto agregado (sem timestamp granular por item).
- **Tasks:** 2/2 completas (Task 1 auto; Task 2 checkpoint:human-verify resolvido)
- **Files modified:** 0 (plano sem `files_modified`, per frontmatter do 16-09-PLAN.md)

## Task 1 — Build Release reassinado + verificação de proveniência

`npm run resign` saiu 0. Build Release, `xcodebuild ** BUILD SUCCEEDED **`, instalado no iPhone (UDID `4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7`, bundleID `com.pmarconato.forcaapp`). Gate `verify-native-skeleton.sh` passou 2 rodadas consecutivas.

Proveniência verificada, não presumida — mesmo padrão de `16-06-SUMMARY.md`:

- **(a) Commit e git status:** `git status --short` vazio antes e depois do build, no commit `e145ef493494ccda4ea44e32c4473dcd7e32c346` (`e145ef4`, 2026-08-18T11:01:45-03:00) — HEAD já contém 16-07 e 16-08 mergeadas.
- **(b) Símbolos do bundle:** o bytecode Hermes de `main.jsbundle` (mtime 18/08 11:08, dentro da janela do build) contém `peekQueuedLiveActivityIntents`, `peekIntentQueue`, `ackQueuedLiveActivityIntent` (D1, 16-07) e `deactivateOtherActiveSets` (D3, 16-08). `localSetByPlannedSet` (D2) não aparece por ser variável local — Hermes não preserva nomes de escopo local. A proveniência de D2 fica estabelecida indiretamente: mesmo arquivo (`activeSessionStore.ts`) e mesmo plano (16-08) que `deactivateOtherActiveSets`, bundle remontado do zero nesta rodada.
- **(c) Recompilação nativa:** `IntentActionQueue.o` e `LiveActivityModule.o` recompilados em `Release-iphoneos` com timestamp 18/08 11:07 — dentro da janela do build, sem cache stale.
- **(d) Ambiente Supabase:** checado no `.env` ativo sem imprimir a anon key — `EXPO_PUBLIC_SUPABASE_URL` aponta para host `192.168.15.77` = **LOCAL via LAN**, não produção (`zanqygwsgxkyjiuhrzju`). Isto diverge do que `15-04-PLAN.md`/`STATE.md` registram (produção desde a Fase 15), mas confirma a memória do projeto sobre este device. O orquestrador confirmou o endpoint respondendo HTTP 200 antes da sessão. Registrado como observação factual — não é erro do teste, mas divergência documental a reconciliar depois.
- **(e) Reinstalação independente:** o dono rodou `npm run resign` uma segunda vez por conta própria, imediatamente antes da sessão física (exit 0), reinstalando o mesmo commit `e145ef4`. A proveniência acima permanece válida — mesmo hash de fonte, mesmo bytecode.

## Task 2 — Sessão física de re-execução

### Resposta literal do dono

Formato obrigatório do `resume-signal` do plano era um PASS/FAIL por item. O dono respondeu de forma agregada, em pt-BR:

> "todas foram pass agora"

**Ressalva de honestidade, obrigatória pelo protocolo desta continuação:** esta é uma resposta única cobrindo os três itens, não três respostas item-a-item literais. A tabela abaixo é uma **interpretação derivada**, feita à luz do enunciado do runbook (`16-09-PLAN.md`, passo 13) que já declarava explicitamente que `PASS-B` NÃO seria aceitável nesta rodada e contaria como FAIL — não uma transcrição do que o dono escreveu item a item. Nenhuma resposta formatada foi inventada em nome do dono.

### Interpretação item a item (derivada, não literal)

| Item | Resultado interpretado | Base |
|------|------------------------|------|
| `sem_duplicacao` | **PASS** | "todas foram pass agora" — regressão de 16-05/16-06 continua não observada |
| `force_quit_toque` | **PASS-A** | "todas foram pass agora" — interpretado como PASS-A (não PASS-B) porque o runbook apresentado ao dono já redefinia PASS-B como FAIL nesta rodada especificamente; a resposta "pass" sem qualificação, dado esse enquadramento prévio, é lida como o único PASS aceitável |
| `regressao_geral` | **PASS** | "todas foram pass agora" — "Pular" após série travada por rejeição ativou corretamente a próxima série |

## Comparação com 16-06-SUMMARY.md (antes/depois)

| Item | 16-06 (antes dos fixes) | 16-09 (depois de D1/16-07 + D2/D2b/D3/16-08) | Fix que fechou |
|------|--------------------------|-----------------------------------------------|-----------------|
| `sem_duplicacao` | PASS | PASS (mantido) | Já fechado desde 16-05 (ack seletivo); sem regressão |
| `force_quit_toque` | **FAIL** (erro visível "Informe repetições e carga...", toque perdido, série travada em `active`) | **PASS-A** | D1 (16-07: `peekAll`/`peekIntentQueue` não-destrutivo + ack condicionado ao resultado real de `completeSet()`) + D2 (16-08: `setReps`/`setLoad` persistindo via `saveDraft` nos dois ramos de retomada — a causa raiz do erro "Informe repetições e carga..." mesmo com valores informados) |
| `regressao_geral` | **FAIL** ("Pular" na última série retorna à série travada em vez de avançar) | **PASS** | D3 (16-08: `activateSet()` com invariante de série ativa única — `deactivateOtherActiveSets`) |

Os dois itens que reprovaram em 16-06 (`force_quit_toque`, `regressao_geral`) revertem para PASS/PASS-A nesta rodada. `sem_duplicacao` permanece PASS sem regressão.

## Task Commits

Nenhum commit de código nesta plano — `files_modified: []` no frontmatter do `16-09-PLAN.md`. A entrega é o build reassinado (não versionado em git) e o registro de proveniência + resposta do dono, ambos documentados aqui.

**Plan metadata:** ver commit desta SUMMARY abaixo.

## Files Created/Modified

Nenhum. Plano sem alteração de código-fonte — só build, proveniência e sessão física.

## Decisions Made

- `requirements-completed` deixado vazio deliberadamente — ver `key-decisions` no frontmatter e a prohibition explícita do `16-09-PLAN.md`.
- A resposta agregada do dono foi interpretada, não presumida como três respostas literais — a distinção fica registrada explicitamente para auditoria futura.
- Divergência de ambiente Supabase (local LAN vs. produção documentada) registrada como observação, sem correção nesta plano (fora de escopo).

## Deviations from Plan

None - plano executado exatamente como escrito. A única nuance é que a resposta do dono veio agregada em vez de item-a-item — tratada via interpretação explícita, não como desvio do plano em si.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Os três defeitos pré-existentes descobertos em `16-06-SUMMARY.md` (D1/D2/D3) estão, pela resposta agregada do dono, fechados no aparelho físico. **CMD-01 e CMD-02 permanecem formalmente `Gaps Found` em `REQUIREMENTS.md`** — a marcação como completos é escopo exclusivo da próxima rodada de `/gsd-verify-work`, que deve confirmar independentemente antes de fechar a Fase 16.

Divergência de ambiente Supabase (local LAN vs. produção) fica como observação para reconciliação de documentação, sem bloquear o fechamento da fase.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-18*

## Self-Check: PASSED
- FOUND: .planning/phases/16-tela-bloqueada-comandar/16-09-SUMMARY.md
