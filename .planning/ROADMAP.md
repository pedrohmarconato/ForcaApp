# Roadmap: ForcaApp — Fluxo cardio e alongamento

## Overview

Reformular cardio e alongamento para que deixem de ser apêndices deslocados do treino:
registro decimal fiel do cardio, meta com fonte única de verdade e alongamento com
condução real integrada ao chat da IA.

## Phases

- [ ] **Phase 1: Fluxo cardio e alongamento** - Registro decimal do cardio, meta coerente com o treino e alongamento guiado
- [ ] **Phase 2: Anamnese e calibração do cardio** - Questionário captura experiência de cardio e o gerador calibra dose inicial e progressão por ela
- [ ] **Phase 3: Intercâmbio de modalidade de cardio** - Trocar um momento de cardio por outra modalidade aceita (escada, bike, remo) preservando a dose por tempo

## Phase Details

### Phase 1: Fluxo cardio e alongamento
**Goal**: Cardio registra distância decimal com vírgula; a meta de cardio do Progresso
não existe mais como definição paralela ao treino; o alongamento tem condução (exercícios,
tempo/movimentos) que responde a pedidos de foco feitos no chat da IA.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-02, REQ-03
**Success Criteria** (what must be TRUE):
  1. Usuário digita "2,4" no campo de distância do cardio, o valor persiste e volta a
     aparecer como 2,4 km (não 2).
  2. A tela Progresso não exibe meta de cardio desconectada do treino — conforme a
     decisão do dono, ela some ou passa a derivar da prescrição do plano.
  3. Na parte de alongamento da sessão, o usuário vê quais exercícios fazer e quanto
     tempo ou quantos movimentos em cada um.
  4. Um pedido de foco de alongamento feito no chat da IA muda a condução de alongamento
     apresentada nas sessões correspondentes.
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — REQ-01: verificar em runtime e corrigir a exibição de distância decimal (ManualExerciseRow)
- [x] 01-02-PLAN.md — REQ-02: motor cardioPrescrito.ts + repositório de leitura da prescrição semanal
- [x] 01-03-PLAN.md — REQ-02: trocar CardioGoalsSection por CardioPrescritoSection na aba Progresso
- [x] 01-04-PLAN.md — REQ-03: expandir catálogo de Mobilidade + reforçar prompt do molde (Tasks 1-2; Task 3 = checkpoint humano pendente)

### Phase 2: Anamnese e calibração do cardio
**Goal**: O gerador conhece a experiência de cardio do usuário — o questionário ganha
perguntas de anamnese (já corre?, distância/tempo confortável, objetivo) e o prompt do
molde calibra ponto de partida conservador e teto de progressão semanal pelo nível
declarado. Lição do PR #64: a pergunta nova tem de comprovadamente chegar ao gerador.
**Depends on**: Phase 1
**Requirements**: REQ-04, REQ-05
**Success Criteria** (what must be TRUE):
  1. O questionário pergunta experiência de cardio e as respostas aparecem no payload
     que chega ao prompt do gerador (verificável em teste).
  2. O prompt instrui dose inicial conservadora e teto de progressão por nível; planos
     gerados para iniciante × experiente diferem na dose inicial de cardio.
  3. Nenhuma mudança no schema do molde (campos km/min existentes bastam).
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Intercâmbio de modalidade de cardio
**Goal**: Na sessão, o usuário troca um momento de cardio por outra modalidade aceita
(escada, bike, remo…) preservando a dose por tempo (`target_duration_seconds`); evolui o
fluxo de recusa declarada (motivo `sem_equipamento`) para substituição.
**Depends on**: Phase 1
**Requirements**: REQ-06
**Success Criteria** (what must be TRUE):
  1. Um exercício de cardio da sessão oferece "trocar modalidade" listando só as
     modalidades aceitas do usuário.
  2. A troca preserva a duração-alvo; a distância prescrita da modalidade original NÃO é
     exibida como meta da nova (sem dado inventado).
  3. O realizado na modalidade trocada conta normalmente no realizado do Progresso.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fluxo cardio e alongamento | 4/4 | Executed (gate verde; checkpoint humano 01-04 pendente) | - |
| 2. Anamnese e calibração do cardio | 0/TBD | Not started | - |
| 3. Intercâmbio de modalidade de cardio | 0/TBD | Not started | - |
