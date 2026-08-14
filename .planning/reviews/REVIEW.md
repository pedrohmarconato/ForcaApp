# REVIEW — PR #76 (fix/replan-semana-fecha-no-domingo)

Contexto do repo: `/Users/phmarconato/ForcaApp`. Base: `main`. Branch de trabalho: `fix/replan-semana-fecha-no-domingo` (PR #76). Convenções: sem `npm run lint`; qualidade via `npx tsc --noEmit` + `npx jest` (o exit code do jest com `--runInBand` não é portão — avaliar pelo resumo "Tests: N passed"); idioma pt-BR em comentários e mensagens de UI; backend Flask não é tocado por estes achados.

Ordem de ataque por severidade. Cada achado exige teste que reproduz o modo de falha ANTES da correção (rodar o teste e vê-lo falhar), depois corrigir, depois commit atômico por achado.

## Achado 1 — [Média] Colisão motor×servidor com sessão pending em sáb/dom

- **Onde:** `src/engine/scheduleShift.ts:92-97` (`slotsDisponiveis` — só sessões `status !== 'pending'` reservam slot) + `supabase/migrations/0027_agenda_e_reancoragem.sql:480-501` (Validação 8, errcode 55000) + `src/store/activeSessionStore.ts:1025-1030` (`isPlanoDesatualizado` mostra "Seu plano mudou em outro lugar" — falso neste caso).
- **Cenário de falha:** hoje = sábado, plano com sessão `pending` marcada para sáb/dom (agenda inclui fim de semana) + atrasadas da semana. O slot de sáb/dom não é reservado pela pending (não-atrasada, fora da fila de atribuição); uma atrasada é atribuída para a data da pending; ao confirmar, a Validação 8 da RPC rejeita (55000) porque a pending não está nas atribuições; o store descarta o overlay com mensagem falsa. Nada é gravado (RPC atômica) — o problema é contrato motor×servidor + diagnóstico falso.
- **Fix esperado (decisão do dono já autorizada — corrigir):** no motor, reservar o slot para sessão `pending` **não-atrasada** (scheduledDate >= hoje) — ela é dona legítima do dia e não entrará na atribuição. Sessão pending atrasada continua liberando o slot (entra na fila e será movida). Critério de aceite: teste novo (hoje=sáb, agenda com sáb, pending em sáb + 2 atrasadas → atribuições não colidem com a pending; servidor aceitaria) passa; suíte antiga verde.
- **Não pode regredir:** Nível 2 puro pós-domingo; fila espremida; nunca antecipa; slot ocupado por fixa; fim de semana absorvendo atrasadas com agenda seg-sex.

## Achado 2 — [Baixa] Docstring promete "para TODOS os alunos" mas agenda vazia é no-op

- **Onde:** `src/engine/scheduleShift.ts:1-6` (comentário novo do PR) + early-return em `reancorarSemana` (agenda vazia → no-op) + guard `agenda.agenda.length > 0` em `src/store/activeSessionStore.ts:735`.
- **Cenário:** aluno com `agenda: []` e pendentes atrasadas → sem reencaixe, sem banner (comportamento pré-existente).
- **Fix esperado (decisão do dono — comportamento NÃO muda):** ajustar o comentário/docstring para não prometer o que não é implementado (agenda vazia permanece no-op); não remover o early-return/guard (mudança de produto não autorizada). Critério de aceite: nenhuma promessa sem lastro no diff final.
- **Não pode regredir:** caso `agenda vazia: no-op` do teste.

## Achado 3 — [Baixa] Guarda de integração do fix não distingue pré/pós-fix

- **Onde:** `__tests__/replanFlow.test.ts:761-836` (describe Nível 2) — com o motor revertido para main, esta suíte passa 100% (o guard do fix vive só nos 8 testes de `scheduleShift`).
- **Fix esperado:** adicionar teste de integração com fim de semana LIVRE (ex.: hoje quarta, agenda [3,4], sessão de segunda atrasada → esperar movida para sáb/dom e `semEncaixe` vazio) que FALHA com o código antigo e passa com o novo. Critério de aceite: reverter `scheduleShift.ts` para main → teste novo falha; com a branch → passa.
- **Não pode regredir:** demais casos do replanFlow.

## Runbook de validação

1. `npx tsc --noEmit` → exit 0
2. `npx jest` → avaliar pelo resumo: suíte completa verde (1522+ novos), sem depender do exit code (handle aberto no --runInBand)
3. Evidência literal de ambos no relatório final

## Formato de entrega

- Um commit por achado, mensagem no padrão do repo (`fix(...)`, `test(...)`), apenas os arquivos do achado.
- Evidência literal (saída truncada de tsc/jest + lista de testes novos).
- Atualizar o body do PR #76 com a lista de achados corrigidos.
- PARAR antes do merge — o orquestrador decide o merge após avaliar o relatório.
