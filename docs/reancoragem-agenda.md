# Reancoragem de agenda — PROGRESS

Branch `feat/reancoragem-agenda`, worktree `~/Projects/ForcaApp-reancoragem`, base `origin/main` (93730b2).
Worktree separado de propósito: o clone principal está em `feat/treino-conjunto-2.0`, de outra sessão.

## Decisão do dono (02/08/2026)
- Modelo: **semana-calendário fixa (seg–dom) + reancoragem das pendentes dentro da semana**.
  O que não couber até domingo continua a ser proposto como "pular", com o custo na tela.
- Plano vivo em produção: **reancorar** o plano `cbc3deda` depois da Fase 2 validada em HML,
  com confirmação explícita na hora. Nada de UPDATE em prod antes disso.

## Baseline (medido antes de qualquer alteração)
- `npx tsc --noEmit` → limpo
- `npx jest` → 78 suítes, 735 testes, verde
- `python3 -m pytest backend/tests -q` → 527 testes, verde

## Fases
| # | Escopo | Estado |
|---|---|---|
| 0 | Contrato do questionário app→backend (`questionario_normalizer`) | pronto, revisado |
| 1 | Agenda no plano + fim do clamp da semana 1 (`plan_mapper`) | pronto, revisado |
| 2 | Motor puro de reancoragem (`src/engine/scheduleShift.ts`) | pronto, revisado |
| 3 | Migration 0027: `training_days` + RPC `reschedule_week_sessions` | revisado por leitura; **não executado contra banco** |
| 4a | `agendaDias`, `agendaRepository`, binding da RPC | pronto, revisado |
| 4b | Tela do Plano + selo de atraso na Home | 2ª rodada de correção |
| 5 | Commit, PR, validação em HML | pendente |

## Achados da revisão (todos devolvidos ao autor e corrigidos)
1. **Fase 1 — semanas 1 e 2 nas mesmas datas.** A âncora nova valia só para a semana 1; as
   demais continuavam presas à segunda anterior. 15 sessões em 10 datas. O teste da semana 2
   só contava sessões (`assert len(semana2) == 1`), nunca olhou uma data.
2. **Fase 2 — antecipação indevida.** A atribuição "i-ésima da fila → i-ésimo slot" puxava
   a semana inteira para trás mesmo sem atraso nenhum. Corrigido com a regra do piso
   (`max(data original, hoje)`): empurra atrasada, nunca antecipa futura.
3. **Fase 3 — colisão com pendente não citada.** A validação só olhava sessões fixas; como o
   cliente manda só o que muda, duas pendentes podiam terminar no mesmo dia. É o risco que a
   0017 documenta como corrupção silenciosa do `getTodaySession`.
4. **Fase 3 — validação de data ineficaz.** `to_date` faz overflow em silêncio e `limit 1`
   olhava só o primeiro item. Trocado por cast `::date` sobre todas as linhas.
5. **Fase 3 — UUID maiúsculo rejeitado; `not in` com NULL mascara colisão.**
6. **Fase 4a — coluna ausente derrubava a feature.** `42703` (migration ainda não aplicada)
   era lançado e matava inclusive o fallback do questionário, que é o caminho de todo plano
   que já existe.
7. **Fase 4b — testes fantasmas.** Um arquivo com quatro `toBeDefined()` sobre imports; outro
   reimplementava a lógica da tela dentro do teste e testava a cópia. Nenhum dos dois
   renderiza a tela.
8. **Fase 4b — "Reordenar" sumia quando havia atraso** (ternário mutuamente exclusivo):
   remoção silenciosa de uma funcionalidade que já estava em produção.

## Verificações feitas pelo revisor (não pelos autores)
- Normalizador com o payload literal de `QuestionnaireScreen` → `dias_disponiveis` com os 5
  dias e `disponibilidade_semanal = 5`. Causa raiz resolvida.
- Plano de 12 semanas no cenário real (gerado sexta 31/07, agenda seg–sex) → 60 sessões,
  **60 datas distintas**, nenhuma em fim de semana.
- 6 testes de invariante do motor escritos pelo revisor, hoje em
  `__tests__/scheduleShiftInvariantes.test.ts`.
- `save_training_plan` recriada: diff de exatamente 6 linhas de adição, resto intacto.

## Limitações conhecidas, a declarar no PR
- A migration 0027 **nunca rodou contra banco**. Precisa de HML antes do merge.
- Com 8 ou mais sessões numa mesma semana, a colisão de datas é inevitável (7 dias), e o
  mapper cai no dia preferido — mesmo impasse que `_resolver_dia` já tratava.
- Semana-calendário fixa não recupera a semana já vencida: se todos os dias da agenda
  passaram, o reencaixe não tem slot e as sessões ficam declaradas como sem encaixe.

## Consequência de desenho a confirmar antes do merge
Um plano gerado numa sexta não tem como encaixar 5 treinos até domingo. A Fase 1 passa a
**começar o plano na próxima semana-calendário** nesse caso, em vez de empilhar 5 sessões no
dia da geração. Efeito visível: "seu plano começa segunda", em vez de cinco treinos mortos.

## Fora de escopo (não viaja junto)
Motor de adaptação intra-sessão · regras de carga · `ADAPT_CONFIG`/`REPLAN_CONFIG` ·
regeneração por IA · branch `feat/treino-conjunto-2.0` · notificações · o cartão de
"reagendar" dentro do banner de replanejamento (fica para a fase seguinte).
