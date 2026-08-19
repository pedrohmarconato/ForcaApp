---
tipo: roteiro-uat-fisico-consolidado
criado: 2026-08-19
fases: [14, 15, 16, 17]
head_alvo: 9d9e04b
status: aguarda-dono
bloqueia:
  - LOCK-01 (Fase 15)
  - LOCK-03 (Fase 15)
  - T-15-09-02 (ameaça aberta, 15-SECURITY.md)
  - CMD-01 (Fase 16 — reconfirmação após review-fix)
---

# Roteiro físico consolidado — Fases 15, 16 e 17

Um `resign` só. Este roteiro junta o checkpoint pendente da Fase 15, a
reconfirmação que a Fase 16 passou a exigir e o comportamento novo que entrou
hoje no `main`.

**Por que consolidado:** a evidência física que existe hoje é anterior às
mudanças de código de 19/08. Evidência anterior à mudança não prova o código
atual — por isso os itens abaixo precisam rodar contra o HEAD `a46bea8`, não
contra o build que está no aparelho.

## Preparação

```
npm run resign
```

O comando reconstrói e instala no iPhone. Ele demora mais que o tempo de
espera do terminal e vai para segundo plano — isso é normal, não é falha.
Confirme a hora de instalação antes de começar.

---

## Item 1 — `rest_to_ready_overtime` (Fase 15, LOCK-01)

1. Inicie uma sessão e conclua uma série com descanso curto.
2. Bloqueie o aparelho e **não toque no app**.
3. Observe o card quando o descanso vencer.

**Passa se:** o card muda para Pronto/Série sozinho, e o tempo excedido sai de
`+0:00` e chega a pelo menos `+0:02`, **sem avançar a série**.

**Reprova se:** o card continua em descanso depois do zero, o excedido fica
congelado, ou a série avança sem você mandar.

---

## Item 2 — `inactivity_timeout_recovery` (Fase 15, LOCK-03)

Este é o das **3 horas**. Se preferir, reporte os outros quatro agora e deixe
este como pendente declarado — fica registrado como verificação parcial, sem
fingir que fechou.

1. Inicie uma sessão e deixe-a `active` **sem concluir série por 3 horas**.
2. Confirme que o card saiu da tela bloqueada.
3. Altere o rascunho da mesma sessão (sem finalizar nem cancelar).

**Passa se:** o card reaparece após a alteração.

---

## Item 3 — `no_resurrection_after_finish_cancel` (Fase 15, LOCK-03)

1. Com uma alteração pendente, finalize **ou** cancele a sessão.
2. Observe a tela bloqueada.

**Passa se:** o card **não** reaparece.

---

## Item 4 — Concluir série pela tela bloqueada, com force-quit (Fase 16, CMD-01)

Este item já passou em 18/08, mas os cinco commits do review-fix (19/08)
mexeram exatamente neste caminho: CAS de sessão no caminho quente, ack
condicional, tolerância a falha parcial na reconciliação e dedupe de entrega.
Por isso precisa rodar de novo.

1. Inicie uma sessão, ative uma série e ajuste a carga pelo stepper `+`/`−`.
2. **Force-quit no app** (arraste para cima e descarte).
3. Sem reabrir o app, conclua a série pelo botão da tela bloqueada.
4. Reabra o app.

**Passa se:** a série aparece registrada com a carga que você ajustou, uma
única vez (sem duplicata), e a sessão abre normalmente.

**Reprova se:** a série não foi registrada, foi registrada duas vezes, a carga
voltou ao valor anterior, ou o app abre em estado de erro.

---

## Item 5 — "A SEGUIR" não anuncia exercício recusado (Fase 17, REG-17)

Comportamento **corrigido hoje** — nunca foi exercitado fisicamente.

1. Durante uma sessão, **recuse** um exercício que ainda tenha séries pendentes
   e que venha logo depois do atual.
2. Bloqueie o aparelho e leia a linha "A SEGUIR" no card.

**Passa se:** a linha aponta para o exercício seguinte **que não foi recusado**.

**Reprova se:** o card anuncia o exercício que você acabou de recusar.

---

## Item 6 — Card não fica preso quando a abertura de sessão falha (Janela #6, LOCK-03)

Comportamento **corrigido hoje**, nunca exercitado no aparelho. É o defeito mais
sutil da lista: o card ficava preso mostrando treino velho.

1. Inicie uma sessão e deixe-a ativa, com o card visível na tela bloqueada.
2. Volte para a lista de sessões.
3. **Ative o modo avião** (a falha de rede é o gatilho).
4. Toque numa sessão para abrir.

**Passa se:** a tela mostra erro de carregamento **e** o card some da tela
bloqueada.

**Reprova se:** o card continua lá, mostrando o treino da sessão anterior.

---

## Como reportar

Responda literalmente, um por linha:

```
rest_to_ready_overtime=PASS|FAIL
inactivity_timeout_recovery=PASS|FAIL|PENDENTE
no_resurrection_after_finish_cancel=PASS|FAIL
completeSet_lockscreen_force_quit=PASS|FAIL
next_up_ignora_recusado=PASS|FAIL
card_nao_fica_preso_apos_falha=PASS|FAIL
```

Para cada FAIL, descreva o erro exato observado.

**Fora deste roteiro, não validar nem registrar:** Dynamic Island (deferida —
o aparelho é um iPhone 13, sem hardware), notificações, sons e UX de registro.
