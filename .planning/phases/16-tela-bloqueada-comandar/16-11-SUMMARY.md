---
phase: 16-tela-bloqueada-comandar
plan: 11
subsystem: testing
tags: [uat, live-activity, app-intents, lock-screen, ios, gap-closure, falha-silenciosa]

requires:
  - phase: 16-tela-bloqueada-comandar (plano 16-10)
    provides: stepLoad/setDuration/setDistance/setRir/setEffort persistindo via saveDraft
provides:
  - Build Release reassinado com proveniência confirmada (16-10 mergeada)
  - Resultado FAIL do Teste 1 no aparelho físico, com caminho de UI confirmado individualmente
  - Diagnóstico de causa-raiz que REFUTA a premissa desta plano
  - Evidência automatizada substitutiva para o Teste 2 (declinado pelo dono)
  - Correção do descarte silencioso (commit 54de3ef), fora do escopo original
affects: [fase-17-registro, live-activity, reconciliacao, active-session-store, verify-work]

actuals:
  tokens: 4100
  tasks: 2
  commits: 3

status: incomplete-com-achado
---

# Fase 16 — Plano 11: Re-execução do UAT físico (stepper de carga / duração de cardio)

**Esta plano NÃO fecha como sucesso.** O Teste 1 reprovou no aparelho, o Teste 2
não foi executado (declinado pelo dono), e a investigação subsequente **refutou a
premissa que originou esta plano**. `CMD-01`/`CMD-02` permanecem `Gaps Found`.

## Task 1 — Build Release reassinado + verificação de proveniência

`npm run resign` saiu 0, todas as 8 etapas, `** BUILD SUCCEEDED **`, instalado no
aparelho às 15:07 (bundleID `com.pmarconato.forcaapp`, iPhone 13, UDID
`4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7`), gate final `verify-native-skeleton.sh`
passou 2 rodadas consecutivas.

Os três fatos de proveniência, verificados de forma independente pelo
orquestrador (não aceitos do relatório do executor):

| Fato | Achado |
|---|---|
| (a) Build ↔ commit | HEAD `b05e4b2` (12:29), build 15:06–15:08 — consistente. Árvore **não** limpa: `M .planning/STATE.md`, doc-tracking do orquestrador, não código do app |
| (b) Fix da 16-10 no bundle | **FOUND** — `carga (stepper) não persistida (não-fatal):` e `duração não persistida (não-fatal):`, 1 ocorrência cada, em **UTF-16LE**. Busca UTF-8 dá 0 e produziu um falso negativo inicial: o Hermes guarda string acentuada como UTF-16 |
| (c) Supabase | **local-via-LAN `192.168.15.77:54321`**. Ref de produção `zanqygwsgxkyjiuhrzju` tem 0 ocorrências no bundle |

**Ressalva de proveniência sobre (c):** a evidência veio das strings do bundle,
**não do `.env`** — a leitura de `.env` foi negada por sandbox tanto para o
executor quanto para o orquestrador. É mais fraca que a de `16-09-SUMMARY.md`,
que leu o `.env` diretamente. O resultado é conclusivo o suficiente (produção
ausente, LAN presente) mas não é o mesmo tipo de prova.

## Task 2 — Sessão física

### Resposta literal do dono

> "part 1 nao aconteceu, simlesmente ficoou como estava, na parte 2 nao temos
> esse tipo de treinamento, quando há nos digitamos o tempo mas se quiser tenta
> voce esse pq eu nao quero"

Esclarecimento subsequente, em resposta a pergunta discriminante do orquestrador
("o botão 'Concluir série' apareceu na tela bloqueada e respondeu ao toque?"):

> **"Apareceu e eu toquei nele"**

### Interpretação item a item

- `teste_1_stepper=FAIL` — caminho de UI: stepper de carga, conforme o runbook.
  Observado: a série **não** foi concluída e permaneceu como estava. **Nenhuma
  mensagem de erro visível** — em particular, NÃO apareceu "Informe repetições e
  carga antes de concluir a série", que era o modo de falha previsto pela
  hipótese desta plano. O botão da Lock Screen apareceu e respondeu ao toque.
- `teste_2_duracao=NÃO EXECUTADO` — o dono declinou. Motivo declarado, que é um
  fato de domínio relevante: o programa de treino dele **não contém exercício de
  métrica tempo/tempo_distancia**; quando contém, a duração é digitada. O
  cenário do Teste 2 é raro no uso real dele.

A exigência de confirmação individual do caminho de UI (a lacuna que tornou a
evidência de 16-09 inconclusiva para CR-01) **foi cumprida** nesta rodada: o
dono nomeou o caminho e, sob pergunta dirigida, confirmou o comportamento do
botão da Lock Screen.

## Achado principal: a premissa desta plano estava errada

A investigação de código (partindo do grafo do projeto, `graphify query`) concluiu
que **o fix da Plano 16-10 é irrelevante para o sintoma observado**, e a causa é
um descarte silencioso numa camada anterior:

1. `modules/live-activity/ios/CompleteSetIntent.swift:12` captura o id via
   `Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId`
   — encadeamento opcional que pode resolver `nil` num cold-launch disparado pelo
   próprio Intent (app morto no momento do toque).
2. `src/store/activeSessionStore.ts:1699-1712` (antes do fix) tratava
   `sessionLogId` **nulo** e **divergente** como o mesmo caso: `ack` (remoção
   DEFINITIVA da fila) sem nunca chamar `completeSet()` — sem `saveError`, sem
   toast, sem log visível. Bate exatamente com "ficou como estava, sem erro".
3. `stepLoad` (`:1235-1259`) é mecanicamente **idêntico** a `setLoad`/`setReps`
   (`:1203-1233`): mesmo `withSet` → `set({draft})` → `saveDraft` fire-and-forget,
   mesmo campo `actualLoadKg`. Não havia divergência de persistência entre o
   stepper e o campo de texto.
4. Se `canCompleteSet()` (`src/engine/sessionModel.ts:262-278`) tivesse reprovado,
   `completeSet()` (`:1363-1372`) teria setado `saveError`, exibido como banner
   visível em `src/screens/ActiveSessionScreen.tsx:480-487`. O dono não viu
   mensagem alguma — evidência forte de que não foi essa a barreira.

O erro de raciocínio no código original: o comentário justificava o descarte
alegando que a entrada "nunca vai se tornar aplicável". Verdade para
`sessionLogId` **divergente**; falso para **nulo**, que indica origem
desconhecida, não origem errada. A Plano 16-07 já havia corrigido esse mesmo
padrão destrutivo para reprovação de `canCompleteSet()` (peek não-destrutivo +
ack seletivo) e deixou este caminho intacto.

**NÃO DETERMINÁVEL por leitura estática:** se o `sessionLogId` de fato chegou
`nil` naquele toque específico. Isso é runtime do ActivityKit/App Intents. É a
hipótese que explica o sintoma, não um fato observado no aparelho.

## Evidência automatizada substitutiva (Teste 2)

Com o Teste 2 declinado, foram escritos 4 testes cobrindo o caminho
`setDuration` → persistência → reconciliação (commit `91ec4b4`), incluindo um
ciclo de force-quit simulado que descarta o estado em memória e reidrata apenas
do que `saveDraft` gravou.

**LIMITE DESTA EVIDÊNCIA, registrado como tipo diferente e nunca como o teste
físico cumprido:** exercita só o trecho JS entre `setDuration()` e
`completeSet()` via `reconcileLiveActivityIntents()`. Não passa por force-quit
real, Lock Screen, App Group nem cold start do iOS.

Validação por mutação: removendo `saveDraft()` de `setDuration`, exatamente os 2
testes de persistência falham e os outros 13 seguem verdes.

## Deviations from Plan

1. **Isolamento por worktree desligado** (`USE_WORKTREES_FOR_PLAN=false`).
   `dispatch-isolation` resolveu `harness-worktree`, mas `node_modules/`, `.env` e
   `ios/` são untracked — um worktree novo abortaria `expo prebuild`. Seguro:
   plano único na wave, `files_modified: []`, zero concorrência.
   `workflow.use_worktrees` NÃO foi alterado na config.
2. **Correção fora do escopo original**, com aprovação explícita do dono: o
   descarte silencioso foi corrigido (commit `54de3ef`) sob plano curto aprovado.
   O plano 16-11 não previa correção de código.
3. **Teste 2 substituído por evidência automatizada**, a pedido do dono.

## Issues Encountered

- Primeiro executor perdeu o transcript e não pôde ser retomado; o log do build
  sobreviveu, então nada foi refeito (o build não foi repetido).
- Leitura de `.env` negada por sandbox para executor e orquestrador — degradou a
  qualidade do fato de proveniência (c).
- SIGSEGV num worker do jest em `tempoEfetivoMigration` numa execução da suíte
  completa. Não reproduziu em 3 rodadas seguintes; a suíte passa isolada (15
  testes). Não atribuível às mudanças desta rodada, mas registrado.

## Task Commits

| Commit | O quê |
|---|---|
| `866ddba` | Task 1 — proveniência do build |
| `91ec4b4` | Testes do caminho setDuration → persistência → reconciliação |
| `54de3ef` | Fix do descarte silencioso de intent órfã (fora do escopo original) |

## Next Phase Readiness

**Bloqueado para `/gsd-verify-work`.** O fix `54de3ef` está no repositório mas
**não** no build instalado no aparelho. Sequência necessária:

1. `npm run resign` — leva o fix ao aparelho
2. Sessão física curta, só o Teste 1 (~2 min) — agora com hipótese específica a
   confirmar ou refutar
3. `/gsd-verify-work` decide `CMD-01`/`CMD-02`

## Pendências abertas (decisão do dono)

- **Causa raiz no Swift** (`CompleteSetIntent.swift:12`): o fix desta rodada é
  defesa no consumidor. A origem do `nil` continua. Exige rebuild + sessão física
  para verificar.
- **`reconcileOrphans`** (`modules/live-activity/ios/LiveActivityModule.swift:120-127`)
  encerra incondicionalmente todas as `Activity<SessionActivityAttributes>` a cada
  boot, chamado com `stillActiveSessionLogId = null` no boot cru
  (`src/native/liveActivitySync.ts:135-149`). Bug real e separado, não investigado.

## Self-Check

- [x] Resposta do dono citada literalmente, item a item, com caminho de UI
- [x] `CMD-01`/`CMD-02` NÃO marcados completos (proibição do frontmatter respeitada;
      `REQUIREMENTS.md` intocado desde o revert `82c23c8`)
- [x] Evidência automatizada registrada como tipo diferente, não como UAT físico
- [ ] Teste 2 executado no aparelho — **NÃO**, declinado pelo dono
- [ ] Teste 1 aprovado — **NÃO**, FAIL com diagnóstico
