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

## Milestone: v1.1 — Release em produção

**Shipped:** 2026-08-14
**Phases:** 4 (5-8; 6-8 em execução direta) | **Plans:** 2 (Fase 5)

### What Was Built

Nada de feature nova — o milestone levou o v1.0 inteiro a produção com evidência:
gráfico de evolução de cardio integrado com higiene de git e painel adversarial
(7 achados, 4 corrigidos com teste-antes-do-fix, 3 aceitos); 68 commits publicados
com CI verde; migration 0037 (P0005→23505) verificada em staging e produção
(md5 idêntico); PWA no ar com verificação visual do dono.

### What Worked

- Painel adversarial antes do push pegou 7 achados reais no diff acumulado — barato
  comparado a caçá-los em produção.
- Protocolo de verificação de migration por leitura + md5 (herdado da 0036) provou
  a 0037 mesmo quando o push do dono retornou "up to date" (sessão paralela já havia
  aplicado) — a prova por leitura independe de quem aplicou.
- Portões humanos explícitos (deploy prod, UAT visual) com roteiro pronto: o dono
  executou e reportou "passou" em minutos.

### What Was Inefficient

- Fases 6-8 executadas sem diretórios de fase → o fechamento virou override_closeout
  e a projeção do GSD (init.manager) as via como não iniciadas — atrito em todo o
  fluxo de close.
- Preview+smoke da Vercel pulado por decisão do dono; funcionou, mas o smoke acabou
  acontecendo direto em produção — risco aceito, não repetível como padrão.
- Trabalho do gráfico feito FORA do GSD (pós-arquivamento do v1.0) precisou de uma
  fase inteira (5) só para reintegrá-lo com higiene.

### Patterns Established

- UAT deferido para produção: quando a máquina não cobre o alvo (sem toolchain
  nativa), o item vira portão do dono com roteiro explícito e reporte literal.
- Milestone operacional de release pode fechar por evidência direta (CI run, md5,
  HTTP 200) sem SUMMARY por fase — mas custa override e nota de fechamento.

### Key Lessons

1. Trabalho fora do ciclo GSD cobra reintegração formal depois — capturar no ciclo
   desde o início sai mais barato.
2. Fase operacional também merece diretório e SUMMARY mínimo — o custo é minutos e
   evita override no close.
3. Evidência de produção pertence ao artefato na hora (frontmatter/STATE), não à
   memória da sessão — o close do v1.1 só foi rápido porque a sessão anterior
   registrou push/CI/md5/URL no ROADMAP e STATE.

### Cost Observations
- Model mix: não medido por modelo (sem split de cache na sessão em curso).
- Sessions: fechamento do v1.1 + abertura do v1.2 numa única sessão Fable 5 com
  execução delegada (pesquisa Apple/CADE: 1 subagente Sonnet, 108.303 tokens).
- Notable: a verificação visual do dono em produção fechou Fase 5, PUB-04 e o
  milestone num único reporte ("passou").

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1.0 | 4 | Primeiro ciclo GSD do repo; estabeleceu checkpoints de banco vivo, prova contra Postgres real e auditoria pré-fechamento |
| v1.1 | 4 | Primeiro milestone de release-ops; painel adversarial pré-push como portão padrão; UAT do dono direto em produção; override_closeout por execução direta sem diretórios de fase |

### Cumulative Quality

| Milestone | Tests | Notable |
|-----------|-------|---------|
| v1.0 | ~1623 (142 suítes) + harness de integração real | tsc limpo; 0 threats abertos; integração cross-phase 6/6 |
| v1.1 | 1692 (147 suítes) + 617 pytest | CI session-contract verde no remoto (run 31822228262); 7 achados de painel fechados; migration 0037 com paridade md5 staging×prod |
