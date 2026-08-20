---
status: testing
phase: 18-neon-configuravel
source: 18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md, 18-06-SUMMARY.md, 18-07-SUMMARY.md, 18-08-SUMMARY.md, 18-09-SUMMARY.md, 18-10-SUMMARY.md
head_alvo: 69b4c79
started: 2026-08-20T17:45:50Z
updated: 2026-08-20T17:45:50Z
---

# UAT físico — Fase 18: Neon configurável (v1.4)

Este é o primeiro roteiro físico da Fase 18. Os planos 18-01 a 18-10 foram
mesclados ao `main` em `42f1e58` com evidência só automatizada (tsc, Jest,
harnesses nativos); o plano 18-15 (gate agregado com UAT web/iPhone) nunca
foi executado. Nenhum dos cinco Success Criteria do `ROADMAP.md` está
fisicamente validado até este roteiro rodar. Os itens abaixo mapeiam 1:1 os
critérios 1-4 (físicos); o critério 5 é automatizado e já tem evidência —
ver item 5.

## Preparação

```
npm run resign
```

Reconstrói e instala no iPhone contra o HEAD `69b4c79` (nenhum commit entre
`42f1e58` e `69b4c79` toca código de tema/Live Activity/migration — só
documentação — mas o binário no aparelho precisa refletir esse HEAD antes de
começar, já que nenhum resign físico da Fase 18 foi confirmado ainda). O
comando demora mais que o tempo de espera do terminal e vai para segundo
plano — isso é normal, não é falha. Confirme a hora de instalação antes de
começar.

**Nota de substrato (decisão do dono):** hoje o app instalado no iPhone
aponta para PRODUÇÃO, onde a migration `0040_profiles_neon_color.sql` já foi
aplicada. Os itens 2 e 3 (persistência) podem rodar assim, direto contra
produção com uma conta real — ou, se preferir isolar de produção, revertendo
o `.env` do aparelho para a base local antes de testar. Nenhuma das duas
opções está pré-decidida aqui; escolha antes de começar e registre qual foi
usada no resultado do item 2.

**Nota sobre RLS (PREF-02):** existe uma prova comportamental de RLS por
script (`scripts/neon-rls-smoke.mjs`), mas ela só roda contra staging por
desenho — o script trava (`validateStagingUrl`) em qualquer URL que não seja
o projeto de staging, então não serve como substituto de produção nem de
base local. Rodar esse script contra staging é uma decisão à parte, ainda
pendente do dono, e não faz parte deste roteiro físico.

## Current Test

number: 1
name: Troca das quatro cores em runtime
expected: |
  A cada seleção em Ajustes, todos os tokens de acento (botões, controles,
  textos de destaque, Logo) mudam imediatamente para a cor escolhida, sem
  fechar/reabrir o app; as cores funcionais (info/success/warning/danger,
  em especial danger quando o acento escolhido é vermelho) não mudam.
awaiting: user response

## Tests

### 1. Troca das quatro cores em runtime (Critério 1 do ROADMAP)
steps: |
  1. Abra o app logado, vá em Perfil → Preferências (tela de Ajustes).
  2. Selecione "amarelo" e observe os tokens de acento em uma tela com
     elementos neon visíveis (ex.: SessionPlayer com uma sessão ativa).
  3. Volte a Ajustes e selecione "azul". Observe de novo.
  4. Repita para "verde" e depois "vermelho", observando a cada troca.
  5. Em cada cor, confirme que um elemento de status funcional (ex.: um erro
     ou aviso, como o `Notice` de perigo) continua na cor de status de
     sempre — não muda para a cor do acento.
expected: As quatro trocas mudam todos os tokens de acento em runtime, sem
  restart e sem perda de estado da tela; as cores funcionais permanecem
  invariantes durante todas as quatro trocas, inclusive danger com o acento
  vermelho selecionado.
result: [pending]

### 2. Persistência por conta (Critério 2 do ROADMAP)
steps: |
  1. Registre qual substrato está em uso (produção ou local revertido) —
     ver nota de substrato acima.
  2. Com a Conta A logada, escolha uma cor de acento (ex.: azul) em Ajustes.
  3. Force-quit o app (arraste para cima e descarte).
  4. Reabra o app já logado na Conta A (ou faça login de novo, se preciso).
  5. Observe a cor de acento ativa.
  6. Faça logout e login com a Conta B (cor diferente ou nunca escolhida).
  7. Observe a cor de acento ativa da Conta B.
expected: No passo 5, a cor escolhida no passo 2 continua ativa após matar e
  reabrir o app. No passo 7, a Conta B mostra a própria cor (ou o fallback
  amarelo, se nunca escolheu) — nunca a cor da Conta A. Nenhuma cor vaza
  entre contas nos dois sentidos.
result: [pending]

### 3. Falha de persistência reverte UI e Live Activity (Critério 3 do ROADMAP)
steps: |
  1. Inicie uma sessão de treino, deixando a Live Activity ativa e visível
     na tela bloqueada.
  2. Com o app em primeiro plano, vá em Ajustes.
  3. Ative o modo avião no aparelho (sem rede).
  4. Tente trocar a cor de acento para uma diferente da atualmente
     confirmada.
  5. Observe a tela de Ajustes e, em seguida, bloqueie o aparelho e observe
     o card da Live Activity.
expected: A troca não se confirma — a UI reverte para a cor anteriormente
  confirmada e mostra mensagem de erro; a Live Activity ativa também
  permanece/reverte para a cor confirmada, sem parar numa cor intermediária.
result: [pending]
note: |
  Evidência preliminar do dono, observada em 20/08/2026 fora deste roteiro
  formal: ao faltar a coluna `neon_color` no banco local, a troca de cor
  produziu o erro "Não foi possível salvar o acento, sua cor anterior foi
  restaurada", com rollback correto na UI. Isso é indício de que o caminho
  de erro funciona, mas não substitui o teste físico formal deste item —
  aquele cenário testou coluna ausente, não perda de rede em modo avião, e
  o item só fecha quando este roteiro rodar de propósito.

### 4. Live Activity ativa muda imediatamente; estado legado cai em amarelo (Critério 4 do ROADMAP)
steps: |
  1. Com rede disponível (fora do modo avião), inicie uma sessão de treino
     e deixe a Live Activity ativa.
  2. Bloqueie o aparelho e observe a cor do card na tela bloqueada.
  3. Desbloqueie, abra o app, vá em Ajustes e troque para uma cor diferente
     da que está ativa na Live Activity.
  4. Bloqueie o aparelho de novo e observe o card imediatamente (sem esperar
     nenhum outro evento da sessão, como conclusão de série).
expected: O card na tela bloqueada muda para a nova cor assim que a troca é
  confirmada no app, sem esperar por outro evento de sessão. Se for possível
  observar um estado legado (Live Activity/ContentState sem o campo
  `neonColor`, ex. de uma sessão iniciada antes desta instalação), ele deve
  cair no amarelo de fallback, sem erro de decode nem card em branco.
result: [pending]

### 5. Suíte automatizada e build (Critério 5 do ROADMAP)
expected: TypeScript, Jest, build web e verificação nativa passam.
result: pass
source: automated
evidence: |
  Evidência de 20/08/2026, contra o HEAD `69b4c79`: `npx tsc --noEmit` sem
  erros; Jest 179/179 suítes e 2152/2152 testes verdes; os 4 harnesses de
  verificação nativa (`verify-native-skeleton.sh`,
  `verify-live-activity-overtime.sh`, `verify-intent-action-queue-race.sh`,
  `verify-resign-name-escaping.sh`) todos com exit 0; `npm run build:web`
  com exit 0 e `verify-web-bundle` OK. Não é item físico — não requer ação
  do dono.

## Summary

total: 5
passed: 1
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

[none yet]
