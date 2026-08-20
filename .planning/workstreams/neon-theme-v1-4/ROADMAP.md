# Roadmap: ForcaApp v1.4 Personalizacao do neon

## Milestone Goal

Cada conta escolhe um entre quatro acentos neon e a escolha aparece de forma
reativa em todo o app/PWA e na Live Activity, com amarelo como fallback.

## Phases

- [ ] **Phase 18: Neon configuravel** - Persistencia por conta, tema reativo,
  tela Ajustes, migracao de todos os consumidores e Live Activity dinamica.

## Phase 18: Neon configuravel

**Goal:** trocar o acento neon global em runtime entre amarelo, azul, verde e
vermelho a partir de Ajustes, com persistencia por conta e propagacao para a
Live Activity ativa.

**Depends on:** v1.3 apenas para integracao final dos arquivos de sessao e
widget; o desenvolvimento ocorre em branch paralela.

**Requirements:** THEME-01, THEME-02, THEME-03, PREF-01, PREF-02, PREF-03,
SET-01, SET-02, LIVE-01, LIVE-02.

**Success Criteria:**

1. As quatro opcoes trocam todos os tokens de acento runtime sem restart e sem
   alterar cores funcionais.
2. A escolha persiste na conta e nao vaza entre contas.
3. Falha de persistencia reverte UI e Live Activity para a cor confirmada.
4. Uma Live Activity ativa muda imediatamente e estado legado cai em amarelo.
5. TypeScript, Jest, build web e verificacao nativa passam.

**Plans:** 10/15 complete

- [x] 18-01-PLAN.md - Nucleo reativo, provider e repository por conta
- [x] 18-02-PLAN.md - Migration local de profiles.neon_color
- [x] 18-03-PLAN.md - Harness RLS e tooling seguro de contas/env para UAT staging
- [x] 18-04-PLAN.md - Ajustes, navegacao e estados acessiveis
- [x] 18-05-PLAN.md - Design system reativo ao acento
- [x] 18-06-PLAN.md - Telas e navegadores runtime restantes
- [x] 18-07-PLAN.md - Componentes runtime e guarda integral de 31 consumidores
- [x] 18-08-PLAN.md - Propagacao JS para Live Activity ativa
- [x] 18-09-PLAN.md - Contrato Swift/widget e Release preso ao DerivedData da execucao
- [x] 18-10-PLAN.md - CardioEvolucaoChart reativo e teste de rerender
- [ ] 18-11-PLAN.md - Decisao bloqueante de integracao com main final
- [ ] 18-12-PLAN.md - Integracao e renumeracao definitiva da migration
- [ ] 18-13-PLAN.md - Decisao bloqueante para staging
- [ ] 18-14-PLAN.md - Push staging e prova comportamental RLS
- [ ] 18-15-PLAN.md - Gate agregado, UAT web/iPhone staging com A/B+cleanup e producao bloqueada
