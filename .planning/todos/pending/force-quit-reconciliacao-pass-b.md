---
id: force-quit-reconciliacao-pass-b
created: 2026-08-17
source: 16-03 (sessão física, checkpoint force-quit)
severity: investigation
resolves_phase:
---

# Investigar por que o cold-launch não reconciliou o intent sozinho (PASS-B, não PASS-A)

## Relato do dono (2026-08-17, literal)

> "tudeo deu certo só o force quit que quando eu conclu ele fecha o ptreino vai para a home e quando eu entro no treino ele nao conclui a serie"

Desambiguação: conclusão manual funcionou → `force_quit_toque=PASS-B` (aceito pelo
plano 16-03; sem perda silenciosa, intenção recuperável à mão).

## O que investigar

O desenho de 16-02 esperava PASS-A: no relaunch, `reconcileLiveActivityIntents()`
drena a fila do App Group ANTES de `reconcileOrphanActivities()` e aplica o
`completeSet()` pendente. No aparelho real isso não ocorreu. Hipóteses, em ordem:

1. **`perform()` não gravou na fila com o app morto** — o modelo de processo do
   intent no force-quit era exatamente a Open Question 2 do 16-RESEARCH.md; o
   toque pode não ter executado o `perform()` (ou executou noutro processo sem
   acesso/flush do App Group).
2. **Drain rodou, mas a guarda CAS descartou** — `sessionLogId` nulo/divergente
   no momento do boot (store ainda sem sessão hidratada quando o drain roda).
3. **Ordem/timing do boot** — reconciliação disparou antes do login/hidratação
   da sessão ativa e a entrada foi descartada ou o resultado não re-renderizou.

## Como reproduzir

Cenário do passo 8 do runbook 16-03: sessão ativa + Live Activity visível →
force-quit → tocar "Concluir série" no Lock Screen → ~10s → reabrir pelo ícone.
Instrumentar: conteúdo da fila do App Group antes de reabrir (`drainIntentQueue`)
e logs do `reconcileLiveActivityIntents` no boot.

## Critério de fechamento

Causa raiz identificada e decidido (com o dono) se PASS-A vira requisito de fase
futura ou se PASS-B permanece o comportamento aceito documentado.
