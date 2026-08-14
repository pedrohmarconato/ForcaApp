# Requirements — Milestone v1.1 "Release em produção"

Escopo: publicar em produção tudo que está pronto e verificado neste clone.
Contexto herdado: v1.0 shipped 2026-08-13; migration 0037 pendente (ação do dono);
trabalho do gráfico de cardio feito fora do GSD após o arquivamento do v1.0.

## v1.1 Requirements

### Integração do trabalho pendente (INT)

- [x] **INT-01**: Dono vê o gráfico de evolução de cardio commitado no repositório
  com higiene de git — adds nomeados (nunca `git add -A`), `.claude/` no `.gitignore`,
  `.planning/reviews/` commitado como docs — com suíte completa e typecheck verdes.

- [ ] **INT-02**: Todo o diff que vai a produção passa por painel adversarial
  (4 revisores) antes do push; achados CONFIRMADOS são corrigidos ou explicitamente
  aceitos pelo dono.

### Publicação (PUB)

- [ ] **PUB-01**: `origin/main` contém todos os commits locais (~46 + integração) e o
  CI `session-contract` (tsc, jest, pytest, export web) está verde no push.

- [ ] **PUB-02**: Migration 0037 (P0005→23505) aplicada em staging
  (`mjdjtiujhwklchalquhc`) via preflight + `supabase db push`, verificada por leitura
  (errcode 23505 vivo na função).

- [ ] **PUB-03**: Migration 0037 aplicada em produção (`zanqygwsgxkyjiuhrzju`) pelo
  mesmo fluxo COM preflight, com md5 da função idêntico entre staging e produção
  (protocolo da 0036). Comando executado pelo dono; a sessão entrega pronto e valida.

- [ ] **PUB-04**: PWA de produção atualizado — `vercel deploy` de preview com smoke
  aprovado (app carrega; aba Progresso renderiza o gráfico novo) antes de
  `vercel deploy --prod` (executado pelo dono).

- [ ] **PUB-05**: Pendências fechadas com evidência no `STATE.md` — deploy da 0037
  registrado como concluído e verificação pós-produção anotada.

## Future Requirements

- Limpeza da tabela `cardio_goals` órfã.
- GRANT DML de tabela para `authenticated` nas migrations (projeto Supabase novo).
- Canal contínuo de foco de alongamento pós-geração (deferred 2026-08-08).
- Texto literal do erro de produção da sessão de debug `typeerror-envio-series-treino`.

## Out of Scope

- Config ESLint (lint quebrado é pré-existente e não bloqueia release).
- Flakiness de timeouts da suíte sob carga (147/147 reprodutível; sem asserção quebrada).
- Religar deploy automático da Vercel (desligado de propósito — quebrava em todo commit).
- `test:integration:pg` (harness de integração já validou 0036/0037 no stack local, fase 04).
- Backend de homologação na VPS (fora do caminho de produção deste release).

## Traceability

| REQ | Phase | Status |
|-----|-------|--------|
| INT-01 | Phase 5 | Complete |
| INT-02 | Phase 5 | Pending |
| PUB-01 | Phase 6 | Pending |
| PUB-02 | Phase 7 | Pending |
| PUB-03 | Phase 7 | Pending |
| PUB-04 | Phase 8 | Pending |
| PUB-05 | Phase 8 | Pending |
