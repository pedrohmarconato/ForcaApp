# Phase 1: Fluxo cardio e alongamento — Context

**Gathered:** 2026-08-08
**Status:** Ready for planning
**Source:** Requisitos ditados pelo dono no chat (express path — sem discuss-phase) +
decisão REQ-02 colhida por pergunta direta.

## Phase Boundary

**IN:** os três requisitos abaixo, e só eles.
**OUT:** treino de força, replanejamento semanal, PWA, quota, qualquer refactor ou
"melhoria" não pedida. Escopo não se estreita nem se alarga em silêncio.

## Implementation Decisions

### Input decimal do cardio (REQ-01)

- O campo de distância aceita vírgula como separador decimal (pt-BR): usuário digita
  `2,4`, persiste `2.4`, exibe `2,4 km`. Hoje só aceita inteiro.
- **Locked:** o comportamento acima.
- **Claude's Discretion:** máscara/teclado numérico, validação de faixa, precisão
  (sugestão: 2 casas), tipo de coluna no banco se precisar mudar.

### Meta de cardio no Progresso (REQ-02) — DECISÃO DO DONO (travada 2026-08-08)

- **Derivar do treino.** A meta deixa de ser configurável à parte; passa a ser lida da
  prescrição do plano ativo. A tela Progresso mostra prescrito × realizado.
- A UI de definição manual de meta de cardio sai.
- **Claude's Discretion:** qual agregação usar (km/semana, min/semana, sessões/semana)
  — depende do que a prescrição do plano realmente contém; a pesquisa deve responder
  isso antes do plano.

### Alongamento guiado (REQ-03)

- A parte de alongamento da sessão mostra exercícios nomeados e, para cada um, duração
  (segundos) ou número de movimentos.
- Pedido de foco feito no chat da IA (ex.: "foco em posterior de coxa") reflete na
  condução de alongamento das sessões correspondentes.
- **Claude's Discretion:** fonte dos exercícios (gerados pela IA no plano vs catálogo
  local versionado) — **ATENÇÃO:** se o caminho exigir mudança no schema do JSON do
  plano gerado (`TreinadorEspecialista`), isso é porta de mão única: o plano deve
  marcar `checkpoint:decision` antes da tarefa que implementa.

### Claude's Discretion (geral)

- Copy, componentes, nomes de arquivos/funções — seguindo CONVENTIONS.md.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`
- `.planning/PROJECT.md` (restrições: sem CI — verificação local `tsc`+`jest`+`pytest`;
  nada de dado inventado na UI: sem amostra é "—", nunca "0")
- `AGENTS.md` na raiz do repo (regras de ambiente Supabase)

## Existing Code Insights

- Motores de regra em TS no app (`engine/`); mudanças de comportamento pedem teste
  primeiro (modo TDD do projeto).
- Sessões paralelas em outros clones do mesmo repo: trabalhar SÓ em
  `~/ForcaApp`, branch `feat/fluxo-cardio-alongamento`; reconferir branch na hora de
  cada commit.

## Deferred Ideas

- Nenhuma. Ideia extra descoberta durante a fase vira todo (`/gsd-capture`), não código.
