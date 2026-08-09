# Projeto: ForcaApp — Fluxo cardio e alongamento

## O que é

App Força (React Native/Expo + backend Flask/Claude + Supabase): geração de plano de
treino de 12 semanas por IA, sessão interativa série a série, adaptação intra-sessão e
replanejamento semanal. Este ciclo GSD cobre a reformulação do fluxo de **cardio e
alongamento**, hoje deslocados do resto do treino.

## Core Value

O cardio e o alongamento passam a ser parte coerente do treino: registro fiel do que o
usuário fez, meta com uma única fonte de verdade e condução guiada do alongamento.

## Requisitos

- **REQ-01** — O campo de distância do cardio aceita número decimal com vírgula
  (ex.: 2,4 km), persiste e exibe o valor exato. Hoje só aceita inteiro.
- **REQ-02** — A meta de cardio da tela Progresso deixa de existir como definição
  paralela à do treino. Decisão do dono registrada na tabela abaixo (remover vs derivar
  da prescrição do plano).
- **REQ-03** — O alongamento ganha condução: quais exercícios, quanto tempo ou quantos
  movimentos cada um. O pedido de foco em alongamentos específicos feito no chat da IA
  reflete na condução apresentada.
- **REQ-04** *(Fase 2)* — O questionário captura experiência de cardio (já corre?,
  distância/tempo confortável, objetivo) e as respostas chegam comprovadamente ao
  gerador.
- **REQ-05** *(Fase 2)* — O prompt do molde calibra dose inicial conservadora e teto de
  progressão semanal pelo nível de cardio declarado — sem mudar o schema do molde.
- **REQ-06** *(Fase 3)* — Um momento de cardio da sessão pode ser trocado por outra
  modalidade aceita (escada, bike, remo…), preservando a dose por tempo; a distância da
  modalidade original não vira meta da nova.

## Restrições

- Sem CI de testes no repo — verificação é local: `tsc` + `jest` + `pytest`.
- Supabase único (`forcaapp-hml`, ref `zanqygwsgxkyjiuhrzju`); conferir
  `supabase/.temp/project-ref` antes de qualquer comando linkado.
- Nada de dado inventado na UI: sem amostra é "—", nunca "0".
- Mudança de schema do JSON do plano gerado pela IA é porta de mão única (one-way
  door) — exige decisão explícita do dono.

## Key Decisions

| Data | Decisão | Contexto |
|------|---------|----------|
| 2026-08-08 | Feature planejada via GSD, fase única | Início do uso de GSD no repo |
| 2026-08-08 | REQ-02: meta de cardio derivada da prescrição do treino (prescrito × realizado); UI de meta manual sai | Decisão do dono via pergunta direta |
| 2026-08-08 | REQ-02: tabela `cardio_goals` fica intacta (órfã) — sem drop/arquivamento nesta fase | Decisão do dono; limpeza pode virar fase futura |
| 2026-08-08 | REQ-03: pedido de foco de alongamento acontece no chat de onboarding existente; canal contínuo pós-geração deferred | Decisão do dono; escopo contido, sem schema novo |
