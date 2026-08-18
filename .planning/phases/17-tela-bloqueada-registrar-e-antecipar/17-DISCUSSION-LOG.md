# Phase 17: Tela bloqueada — registrar e antecipar - Discussion Log

> **Trilha de auditoria.** Não é insumo de planejamento, pesquisa ou execução.
> As decisões estão no `17-CONTEXT.md`; este log preserva as alternativas
> consideradas e o porquê de cada descarte.

**Date:** 2026-08-18
**Phase:** 17-tela-bloqueada-registrar-e-antecipar
**Areas discussed:** Pré-preenchimento e fidelidade; O teclado no app; Controles na tela bloqueada; Antecipação (PRED-01)

---

## Todos pendentes (cross-reference)

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Nenhum | Os 4 casaram por palavra genérica; 3 são de outro domínio e o quarto já passou após o fix `54de3ef` | ✓ |
| Dobrar `force-quit-reconciliacao-pass-b` | A investigação entraria formalmente na Fase 17 | |

**Escolha:** Nenhum todo dobrado.

---

## Pré-preenchimento e fidelidade

### Fonte do valor de reps

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Híbrido: histórico, senão o alvo | Últimas reps reais quando existem; `targetRepsMin` na estreia. Exige criar `lastRepsByExercise` | ✓ |
| Só o alvo do plano | Zero dado novo, mas contraria a letra do critério 1 do ROADMAP | |
| Só o histórico real | Fiel ao ROADMAP, campo vazio na estreia | |

**Nota levantada na discussão:** não existe **nenhum** histórico de reps no repositório (zero ocorrências de `lastReps`); só carga tem (`lastLoadByExercise`).

### Granularidade do histórico

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Um número por exercício (a última) | Espelha `lastLoadByExercise`: mesma consulta, mesma chave, mesmo formato | ✓ |
| Por ordem de série | Respeita a queda por fadiga, mas formato divergente e buraco quando o nº de séries muda | |
| Primeira série da última sessão | Pré-preenche sempre otimista; corrige para baixo justo onde o ganho pesa | |

### Fidelidade do registro em 1 toque

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Marca visual até o primeiro toque | Valor herdado nasce distinto e vira firme no primeiro `+/−`; só apresentação | ✓ |
| Grava e pronto | Herdado indistinguível do digitado; risco de registrar por inércia | |
| Carimbar a origem no banco | Mais fiel, mas exige migration — v1.3 não deveria mexer em schema | |

**Nota:** tensão explícita com a restrição do `PROJECT.md` ("nada de dado inventado na UI").

### Estreia de exercício sem histórico e sem alvo

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Teclado nessa exceção | Campo vazio, teclado abre sozinho só aqui; evita 24 toques até 60 kg | ✓ |
| Vazio e barra, como hoje | Conservador, mas empurra o problema sem resolver | |
| Pré-preenche 0 e você sobe | Nunca barra, mas grava série com 0 kg num descuido | |

---

## O teclado no app

### Campos numéricos no fluxo padrão

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Texto fixo + escape explícito | Número não editável entre `−/+`; teclado só por gesto deliberado e na D-04 | ✓ |
| `TextInput` continua tocável | Mudança mínima, mas cumpre REG-01 na letra e não no espírito | |
| Teclado sai por completo | Mais coerente, mas valor atípico fica sem correção no app | |

**Nota de raio de alcance:** o componente é RN compartilhado — o **PWA web herda** (`sessionPlayerLayout.ts:10`).

### O que conta como "1 toque"

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| "Iniciar série" some quando o valor já vale | Em `carga_reps`, campos revelados e um botão só; dois toques voltam quando falta informar | ✓ |
| Mantém os dois toques | Raio mínimo, ciclo `activateSet` intacto | |
| "Iniciar série" some sempre | Fluxo único, mas botão desabilitado sem explicação na estreia | |

**Nota técnica:** em exercício por tempo/distância "Iniciar série" carimba `activatedAt` e inicia a medição — a remoção fica restrita a `carga_reps`.

### RIR opcional

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Fica onde está | Desvio voluntário; 1 toque continua 1 toque | ✓ |
| Migra para o card de descanso | Libera altura, mas novo estado e mais um caso de UAT | |
| Atrás de "mais opções" | Deixaria de ser respondido, e alimenta a adaptação intra-sessão | |

### Precedência dentro da sessão

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Reusa `suggestLoad()`, reps no mesmo desenho | Adaptação > alvo > histórico; sem regra concorrente | ✓ |
| O último registro manda | Atropela o motor de adaptação; duas fontes de verdade | |
| Sempre o histórico da última sessão | Previsível, mas repete o mesmo ajuste toda série | |

**Descoberta na discussão:** `applyAdjustmentToNextSet()` (`intraSessionAdaptation.ts:426`) já reescreve `targetLoadKg`/reps da próxima série, e a precedência de `suggestLoad()` já honra isso.

---

## Controles na tela bloqueada

### O que é ajustável

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Reps e carga, dois pares de `−/+` | Fiel à letra de REG-02; card denso e alvos de toque menores | ✓ |
| Só carga; reps herdadas | Botões grandes, mas estreitaria REG-02 | |
| Um par que alterna o alvo | Cabe tudo, mas custa toque de modo e risco de ajustar o campo errado | |

### Acúmulo entre toques

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| A store, por delta | Molde do `AdjustRestIntent(deltaSeconds:)`; espelho puro; ack e dedup da Fase 16 já cobrem | ✓ |
| O widget acumula e manda o total | Quebra a regra que sustenta as Fases 15 e 16 | |
| Delta com número de sequência | Mecanismo novo paralelo à dedup já validada no aparelho | |

### O que o card mostra

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Valor em edição, com a marca de herdado | Leitura idêntica no app e na tela bloqueada | ✓ |
| Valor em edição, sem marca | Some o sinal de herança justo onde se confere menos | |
| Alvo prescrito, ajuste relativo | Exige conta de cabeça — o oposto de confirmar em 1 toque | |

### Valor fora do passo

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Botão "abrir para ajustar", sempre disponível | Cumpre o critério 3 com caminho previsível; `−/+` preservam o offset | ✓ |
| Só preservar o offset | Zero divergência, mas exigiria reescrever o critério 3 do ROADMAP | |
| Detecção automática | Estado raro, difícil de lembrar e de testar | |

**Divergência levantada e registrada:** o critério 3 do ROADMAP fala em "travar ou truncar", mas `stepLoad()` (`sessionModel.ts:247`) já preserva o offset — 37,5 + 5 = 42,5. "Abrir o app" seria restrição nova que o app não tem. A decisão cumpre o critério sem introduzir snapping.

---

## Antecipação (PRED-01)

### Quando aparece

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Durante o descanso inteiro | Publicada no update que já acontece ao concluir a série; sem update agendado | ✓ |
| Só nos últimos segundos | Exigiria update com o app possivelmente suspenso — PRED-01 falharia em silêncio | |
| Só quando o descanso zera | Contraria PRED-01 na letra e no propósito | |

**Restrição de plataforma:** o widget não re-renderiza sozinho no meio do intervalo; `Text(timerInterval:)` conta nativamente, mas trocar layout num instante exige `Activity.update()`.

### Conteúdo

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Exercício, série X/Y e o valor pré-preenchido | É o número que será confirmado em 1 toque | ✓ |
| Exercício, série X/Y e a prescrição do plano | Literal ao requisito, mas duas verdades no mesmo card | |
| Só exercício e série X/Y | Card mais leve, mas estreitaria PRED-01 | |

### Distinção entre casos

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Rótulo único, com destaque na virada | A virada é a única que muda o que se faz fisicamente | ✓ |
| Rótulo único, sem distinção | Menor raio de alcance dos três | |
| Rótulos distintos por caso | Quatro ramos a provar no aparelho | |

### Cardio e alongamento

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Só a virada para o bloco | Card segue reduzido dentro do bloco (D-03 da Fase 15); a entrada é anunciada | ✓ |
| Nenhuma antecipação com cardio envolvido | Zero caso novo, mas a virada surpreende | |
| Antecipação completa dentro do bloco | Reverteria em parte a D-03 da Fase 15 | |

---

## Claude's Discretion

- Layout exato do card com os dois pares de `−/+`, dentro do que a Fase 15 fixou.
- Gesto do escape para o teclado (long-press × botão visível) — com a ressalva de que long-press é frágil no PWA web.
- Passo do stepper de reps (`REQUIREMENTS.md` sugere ±1).
- Renderização da marca de "herdado" no app e no widget.
- Estrutura dos arquivos Swift novos, seguindo o molde do `AdjustRestIntent`.
- Comportamento em exercício de peso corporal (sem carga a ajustar).
- O que o card mostra entre o toque e a store responder — sem feedback otimista local, que a plataforma não permite.
- Formato e número das sessões físicas, herdando a D-13 da Fase 15.

## Deferred Ideas

- Carimbar no banco a origem do valor (herdado × ajustado) — exige migration.
- Migrar o RIR para o card de descanso.
- Antecipação completa dentro do bloco de cardio/alongamento.
- Rótulos distintos por caso na antecipação.
- Prescrição do cardio na tela bloqueada (segue excluída pela D-03 da Fase 15).
- Som/vibração no fim do descanso e modo mãos-livres (pós-v1.3).
- Dynamic Island compact/minimal/expanded (sem hardware para UAT).
