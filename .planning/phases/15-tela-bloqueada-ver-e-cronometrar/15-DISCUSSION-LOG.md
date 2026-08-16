# Phase 15: Tela bloqueada — ver e cronometrar - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16
**Phase:** 15-Tela bloqueada — ver e cronometrar
**Areas discussed:** Todos cruzados, O que aparece em cada apresentação, Quando o card nasce e quando morre, Semântica do descanso com timestamp absoluto, Reconciliação de card órfão, Logística das sessões físicas

---

## Todos cruzados com a fase

**Pergunta:** Achei 1 todo pendente que cruza com esta fase: `backend-supabase-producao-no-aparelho` (o `.env` aponta para 127.0.0.1, o login não completa no iPhone). Sem isso, o UAT da Fase 15 — que exige uma sessão de treino real no aparelho — não roda. Dobrar dentro da Fase 15?

| Option | Description | Selected |
|--------|-------------|----------|
| Dobrar na Fase 15 | Apontar `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` para produção vira tarefa da fase, como pré-requisito do UAT. Inclui resolver a CLI do Supabase autenticada na conta errada. | ✓ |
| Manter fora, resolver antes | O dono resolve por fora antes do UAT; a fase assume login funcionando. | |
| Adiar para a Fase 16 | A Fase 15 valida card e timer com a sessão que der para abrir. | |

**User's choice:** Dobrar na Fase 15
**Notes:** Match score 0.6 no `todo.match-phase`. O todo nasceu da Sessão 1 física da Fase 14 (plano 14-06) e foi deliberadamente separado de lá para não expandir aquele escopo em silêncio.

---

## O que aparece em cada apresentação

**Pergunta 1:** No Lock Screen, o card tem dois momentos possíveis: executando a série e descansando. Qual hierarquia?

| Option | Description | Selected |
|--------|-------------|----------|
| Troca com o estado (espelha o app) | Descansando: timer grande, exercício secundário. Executando: prescrição (reps × carga) grande. Espelha os dois cartões que o `SessionPlayer` já alterna. | ✓ |
| Exercício sempre no topo | Nome + série X/Y fixos em destaque; timer embaixo. Layout estável, menos salto visual. | |
| Layout único sem estado | Mesma hierarquia sempre. Mais simples de implementar e sincronizar. | |

**User's choice:** Troca com o estado (espelha o app)

**Pergunta 2:** Dynamic Island espremida (compact e minimal): o que ler de relance?

| Option | Description | Selected |
|--------|-------------|----------|
| Prioridade ao tempo | Compact trailing e minimal mostram mm:ss do descanso; fora do descanso caem para série X/Y. | ✓ |
| Prioridade à série | Compact e minimal mostram sempre X/Y; tempo só no expanded e Lock Screen. | |
| Exercício + tempo lado a lado | Compact leading = exercício abreviado, trailing = mm:ss. Aperta com nomes longos. | |

**User's choice:** Prioridade ao tempo

**Pergunta 3:** A sessão tem musculação, cardio e alongamento. LOCK-01 fala em "reps × carga", que não existe nos outros dois. Como o card trata cardio e alongamento?

| Option | Description | Selected |
|--------|-------------|----------|
| Uma linha por tipo | Musculação `3/4 · 12 reps × 40 kg`; cardio `12:00 · 2,4 km`; alongamento nome + duração. | |
| Só musculação no card | Cardio e alongamento mostram nome do bloco e progresso, sem prescrição. | ✓ |
| Card só na musculação | A Activity nem sobe durante cardio/alongamento. | |

**User's choice:** Só musculação no card
**Notes:** Consequência aceita e registrada em CONTEXT.md (D-03 + Deferred): a dose do cardio não aparece na tela bloqueada nesta fase.

**Pergunta 4:** Descanso chegou a zero e ninguém tocou em nada. O que o card mostra?

| Option | Description | Selected |
|--------|-------------|----------|
| "Pronto" + tempo excedido discreto | `Pronto · Série 3/4` em destaque e, pequeno, a contagem crescente desde o zero (`+2:30`). | ✓ |
| Só "Pronto" | Timer some, card volta à cara de série. | |
| Contagem crescente dominante | O número grande vira o tempo desde o fim do descanso. | |

**User's choice:** "Pronto" + tempo excedido discreto

---

## Quando o card nasce e quando morre

**Pergunta 1:** Quando a Live Activity deve subir?

| Option | Description | Selected |
|--------|-------------|----------|
| Ao iniciar a sessão | Sobe ao iniciar o treino e fica até o fim, inclusive antes do primeiro descanso. | ✓ |
| Só no primeiro descanso | Aparece quando começa o primeiro descanso. Menos ruído, mas "aparece do nada". | |
| Ao iniciar, mas só na musculação | Sobe no bloco de musculação; cria buraco se o cardio vier primeiro. | |

**User's choice:** Ao iniciar a sessão

**Pergunta 2:** Ao terminar o treino, o card some na hora ou vira resumo? (Cancelar some na hora nos três casos.)

| Option | Description | Selected |
|--------|-------------|----------|
| Some na hora | `.immediate`. Zero risco de card preso. | |
| Resumo curto e some sozinho | Fica ~2–5 min com "Treino concluído · 45 min · 18 séries" e desaparece sem toque. | ✓ |
| Resumo até você dispensar | `.default` (até 4h ou arrastar para fora) — mais parecido com card preso. | |

**User's choice:** Resumo curto e some sozinho

**Pergunta 3:** Com o app aberto, o card continua vivo na Dynamic Island?

| Option | Description | Selected |
|--------|-------------|----------|
| Continua vivo | Ciclo de vida único por sessão; sem start/end repetidos. | ✓ |
| Some com o app aberto | Encerra em foreground e reinicia ao sair; mais chance de órfão. | |

**User's choice:** Continua vivo

**Pergunta 4:** Se o treino for largado pela metade, o card se encerra sozinho depois de um tempo?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, timeout de inatividade | Sem série registrada por N horas, a Activity se encerra; a sessão no store fica intacta. | ✓ |
| Não, fica até o limite do iOS | Vive até finalizar/cancelar ou até o sistema encerrar (~8h). | |
| Não, e reabrir o app decide | Limpeza só na reconciliação de reabertura. | |

**User's choice:** Sim, timeout de inatividade
**Notes:** Valor exato deixado à discrição (3h como padrão sugerido).

---

## Semântica do descanso com timestamp absoluto

**Pergunta 1:** Descanso de 90s, iPhone bloqueado, volta ao app 4 min depois. O que deve ter acontecido?

| Option | Description | Selected |
|--------|-------------|----------|
| Espera você | Chega a zero e o card passa a "Pronto · Série 3/4"; o avanço só por ação do dono. | ✓ |
| Auto-avança igual hoje | Mantém o comportamento atual do `SessionPlayer`. | |
| Auto-avança só se o estouro for pequeno | Até ~60s avança; acima disso espera. Duas regras para manter. | |

**User's choice:** Espera você
**Notes:** Motivo declarado na opção: com o app suspenso ninguém está olhando — avançar sozinho registraria progresso não feito.

**Pergunta 2:** A regra "espera você" vale também com a tela do app na frente? (Hoje, com o app aberto, zerar avança sozinho.)

| Option | Description | Selected |
|--------|-------------|----------|
| Uma regra só — nunca auto-avança | Coerente no app e na tela bloqueada. Muda comportamento atual da tela do app. | ✓ |
| Depende do estado do app | App aberto continua auto-avançando; só suspenso espera. Duas semânticas para o mesmo timer. | |

**User's choice:** Uma regra só — nunca auto-avança
**Notes:** Mudança perceptível no fluxo atual do app, escolhida de propósito. Registrada com `Reversibility: costly` em CONTEXT.md (D-09), com ponteiro para `SessionPlayer.tsx:298`.

---

## Reconciliação de card órfão

**Pergunta 1:** Force-quit no meio do treino, card órfão na tela bloqueada. Reabre o app — e aí?

| Option | Description | Selected |
|--------|-------------|----------|
| Encerra e sobe um novo | Mata toda Activity existente e, se a sessão estiver viva no store, sobe card novo com o estado correto. | ✓ |
| Reata o card existente | Confere se é da mesma sessão e só atualiza; mais suave, mais estado para reconciliar. | |
| Encerra e não recria | Reabrir sempre limpa; o card só volta na próxima interação. | |

**User's choice:** Encerra e sobe um novo

**Pergunta 2:** E se a Live Activity não conseguir subir (desativada em Ajustes, recusa do iOS)?

| Option | Description | Selected |
|--------|-------------|----------|
| Avisa uma vez, discreto | Aviso no app na primeira falha, sem bloquear o treino. | ✓ |
| Silêncio total | Diagnóstico só pelo console nativo com o iPhone no cabo. | |
| Avisa toda vez que falhar | Impossível não notar — e impossível ignorar se foi desativado de propósito. | |

**User's choice:** Avisa uma vez, discreto

---

## Logística das sessões físicas

**Pergunta:** Como agrupar os momentos com o iPhone na Fase 15? (Nada é testável em simulador — registrado em STATE.md.)

| Option | Description | Selected |
|--------|-------------|----------|
| Duas sessões | Sessão 1 cedo (~20 min, card + 4 apresentações + timer bloqueado, sessão de mentira contra stack local); Sessão 2 no fim (UAT com treino real). | ✓ |
| Uma sessão só, no fim | UAT único de ~45 min cobrindo os 4 critérios; layout errado só aparece no fim. | |
| Três ou mais checkpoints | Cada critério vira um momento com o aparelho; máxima fricção. | |

**User's choice:** Duas sessões

---

## Claude's Discretion

- Formato interno do `ContentState`/`ActivityAttributes` (string pré-formatada vs campos estruturados) — com a restrição de que a Fase 17 (REG-02) precisa de reps/carga como números.
- Valor exato do timeout de inatividade (3h sugerido).
- Onde e como o aviso de falha de Live Activity aparece na UI do app.
- Tradução do `±30s` (`ajustarDescanso`) para o modelo de timestamp.
- Estrutura de arquivos em `targets/session-widget/` e `modules/live-activity/`, e a sincronia do `ActivityAttributes` duplicado.
- Estilo visual do card — a fase é `UI hint: yes`; `/gsd-ui-phase 15` pode preceder o planejamento.

## Deferred Ideas

- Prescrição do cardio (tempo/distância) na tela bloqueada — excluída pela D-03; cabe em fase posterior se incomodar no uso real.
- Antecipação da próxima ação durante o descanso — já é PRED-01, Fase 17.
- Ajustar/pular descanso pela tela bloqueada — CMD-02, Fase 16.
- Som/vibração no fim do descanso — deferido para pós-v1.3 por decisão do dono em 15/08.
</content>
