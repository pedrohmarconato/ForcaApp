# Roadmap: ForcaApp — Fluxo cardio e alongamento

## Overview

Reformular cardio e alongamento para que deixem de ser apêndices deslocados do treino:
registro decimal fiel do cardio, meta com fonte única de verdade e alongamento com
condução real integrada ao chat da IA.

## Phases

- [ ] **Phase 1: Fluxo cardio e alongamento** - Registro decimal do cardio, meta coerente com o treino e alongamento guiado

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
- [ ] 01-01-PLAN.md — REQ-01: verificar em runtime e corrigir a exibição de distância decimal (ManualExerciseRow)
- [ ] 01-02-PLAN.md — REQ-02: motor cardioPrescrito.ts + repositório de leitura da prescrição semanal
- [ ] 01-03-PLAN.md — REQ-02: trocar CardioGoalsSection por CardioPrescritoSection na aba Progresso
- [ ] 01-04-PLAN.md — REQ-03: expandir catálogo de Mobilidade + reforçar prompt do molde para foco de alongamento

## Progress

**Execution Order:**
Phases execute in numeric order: 1

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fluxo cardio e alongamento | 0/4 | Not started | - |
