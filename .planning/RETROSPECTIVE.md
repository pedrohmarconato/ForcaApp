# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Cardio e alongamento

**Shipped:** 2026-08-13
**Phases:** 4 | **Plans:** 19 | **Timeline:** 6 dias (2026-08-08 → 2026-08-13), 126 commits

### What Was Built
- Cardio como parte coerente do treino: registro decimal fiel, meta derivada da
  prescrição (fonte única) e troca de modalidade com guarda no servidor.
- Alongamento guiado (catálogo de Mobilidade nomeado + prompt pilotável pelo chat).
- Gerador calibrado por anamnese de cardio (nível → dose inicial e teto de progressão).
- Execução de treino offline-first: outbox durável cobrindo as 6 operações de execução,
  com retry por idade, dedupe por chave natural e quarentena de recusa definitiva.

### What Worked
- **Prova contra Postgres real como backstop**: o harness de integração pegou duas
  classes de defeito que três camadas de mock nunca viram (coluna inexistente 42703 no
  histórico; P0005 mascarado como 500 pelo PostgREST) — cada uma virou plano de gap
  closure com correção verificada.
- **Checkpoints humanos bloqueantes em decisões de banco vivo**: as migrations 0033,
  0034/0036 e 0037 só tocaram staging/produção por decisão explícita e registrada do
  dono, com verificação pós-aplicação (comportamental em HML, leitura + md5 em prod).
- **Gap closure em ondas dentro da própria fase** (planos 03-07/08/09) evitou fase nova
  para consertar o que o UAT derrubou.
- **Auditoria de milestone antes do fechamento**: encontrou 1 fase sem VERIFICATION.md,
  1 verificação obsoleta e 1 drift documental — todos fechados no mesmo dia com
  verificação retroativa e re-verificação, transformando um override cheio de gaps num
  fechamento com 4/4 fases verificadas.

### What Was Inefficient
- **Documento congelado mentindo sobre o presente**: SUMMARYs e VERIFICATION.md ficaram
  para trás dos fatos (0036 "não aplicada" quando já estava em produção; REQ-03
  "pendente" com o checkpoint já aprovado). Custou uma rodada inteira de auditoria e
  re-verificação para realinhar registro e realidade.
- **Fase 1 fechou sem verify-work** — a verificação retroativa passou 4/4, mas o gap de
  processo só apareceu na auditoria do milestone, 4 dias depois.
- **Runbook de banco sem `&&`**: o preflight de produção falhou e o `db push` rodou
  mesmo assim (sem dano, por sorte). Corrigido em AGENTS.md: comandos de banco sempre
  encadeados.
- **UAT web esbarrou em limitações de plataforma**: `Alert.alert` no-op no
  react-native-web deixou "Concluir treino" mudo com séries pendentes; teste de build
  nativo impossível na máquina do ciclo (sem Xcode/Android SDK).

### Patterns Established
- Migration de guarda sempre com harness textual comparando `pg_get_functiondef` byte a
  byte contra a revisão anterior (0035→0036→0037).
- Retry/dedupe do cliente desenhado CONTRA as guardas do servidor (0005/0036), nunca em
  paralelo a elas; recusa definitiva = quarentena, código desconhecido = backoff
  limitado por idade.
- Verificação em 3 níveis para risco alto: unitário → integração contra Postgres real
  (`test:integration:pg`, fora da suíte padrão) → UAT humano/assistido no fluxo real.
- Execução assistida de UAT contra o stack local com evidência de banco (SELECT antes e
  depois) além da UI.

### Key Lessons
1. Mock não prova contrato com o servidor: toda RPC/consulta nova precisa de pelo menos
   um teste que atravesse o PostgREST real antes do UAT humano.
2. Frontmatter de SUMMARY/VERIFICATION é fonte canônica para os portões do GSD — quando
   o fato mudar (checkpoint aprovado, migration aplicada), atualizar o documento na
   hora, senão o fechamento do milestone paga a conta.
3. Errcode não oficial (P0005) é contrato quebrado com o PostgREST — usar SQLSTATE
   oficial (23505) desde o primeiro draft da guarda.
4. Fluxo de UI crítico (concluir treino) não pode depender de `Alert.alert` sem
   fallback web — ou o alvo web fica com botão morto.

### Cost Observations
- Execução delegada a subagentes (Haiku/Sonnet) com orquestração no modelo da sessão;
  auditoria do fechamento: 6 subagentes Sonnet, 559.401 tokens somados das notificações.
- Sessions: não medido com precisão (transcript diferido; ver `~/.claude/usage/db.json`).
- Notable: a auditoria + fechamento de gaps do v1.0 (integração, verificação retroativa,
  re-verificação, segurança e UAT assistido) coube num único dia de sessão.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1.0 | 4 | Primeiro ciclo GSD do repo; estabeleceu checkpoints de banco vivo, prova contra Postgres real e auditoria pré-fechamento |

### Cumulative Quality

| Milestone | Tests | Notable |
|-----------|-------|---------|
| v1.0 | ~1623 (142 suítes) + harness de integração real | tsc limpo; 0 threats abertos; integração cross-phase 6/6 |
