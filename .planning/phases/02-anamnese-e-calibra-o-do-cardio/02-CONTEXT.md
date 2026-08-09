# Phase 2: Anamnese e calibração do cardio — Context

**Gathered:** 2026-08-09
**Status:** Ready for planning
**Source:** Pergunta do dono ("como definir tempo e km de corrida sem saber nada da
experiência dela com corrida ou outro cardio?") + achados do executor de busca
confirmados no código vivo em 2026-08-09.

## Phase Boundary

**IN:** REQ-04 (perguntas de anamnese de cardio no questionário, chegando comprovadamente
ao gerador) e REQ-05 (calibração de dose inicial e teto de progressão no prompt do molde).
**OUT:**
- Loop de adaptação de cardio (dose que se ajusta ao realizado) — hoje só força adapta;
  cardio só é classificado under/on_target/over para exibição. Feature maior, deferred.
- Intercâmbio de modalidade — é a Fase 3.
- Qualquer mudança no schema do molde/plano gerado.

> **CORREÇÃO PELA PESQUISA (2026-08-09, prevalece sobre este arquivo):** o
> `questionario_normalizer.py` é código morto no caminho de produção
> (`FORCA_USE_MOLDE_ARCHITECTURE=true` → `_executar_geracao_molde` lê o questionário
> CRU). O nome da chave em `formDataForApi` (QuestionnaireScreen.tsx:388-395) tem de
> ser IDÊNTICO ao `.get(...)` do backend — bloco some do prompt SILENCIOSAMENTE se
> errar. E campo novo exige MIGRATION (tabela `questionario_usuario` é tipada; molde
> byte a byte é a `0021_dose_cardio_declarada.sql`, com espelho no histórico e
> reescrita de `snapshot_questionario()`). Detalhes no 02-RESEARCH.md.

## Diagnóstico que motiva a fase (confirmado no código)

- O questionário JÁ captura a dose declarada: dias/semana, minutos/sessão, modalidades
  (`QuestionnaireScreen.tsx:633-708`) — o tempo não é o problema.
- O que falta é experiência/capacidade: nenhuma pergunta sobre já correr, distância
  confortável, pace. O único nível é o genérico de musculação
  (`EXPERIENCE_LEVELS`, `QuestionnaireScreen.tsx:59`; `questionario_normalizer.py:205`).
- O prompt não instrui calibração: `delta_cardio_percentual` (progressão semanal) fica a
  critério livre do modelo (`backend/app.py:1452-1457`); `_instrucao_dose_cardio`
  (`app.py:1521-1565`) só reforça a dose declarada. O questionário inteiro vai no prompt
  (`_questionario_para_prompt`, `app.py:349-366` / uso em 1758-1765), mas nada manda usar
  o nível para dosar km.

## Implementation Decisions

### Perguntas de anamnese (REQ-04)

- **Locked:** perguntas objetivas NO QUESTIONÁRIO (não no chat), no padrão do bloco de
  cardio existente; as respostas têm de chegar comprovadamente ao gerador — teste de
  payload obrigatório (lição do PR #64: campo do questionário que nunca chegava ao
  gerador).
- **Claude's Discretion:** o conjunto exato de perguntas. Sugestão de partida: pratica
  cardio atualmente? (freq.), consegue correr/pedalar quanto tempo/distância confortável?,
  objetivo (condicionamento, completar 5k, emagrecimento). Como derivar um nível de
  cardio (iniciante/intermediário/avançado) das respostas.

### Calibração no prompt (REQ-05)

- **Locked:** dose inicial conservadora + teto de progressão semanal por nível declarado;
  NENHUMA mudança no schema do molde (`git diff backend/schemas/molde_schema.py` vazio);
  não tocar o item 5 do prompt (usado por `.replace()` — armadilha já confirmada na
  Fase 1).
- **Claude's Discretion:** valores dos tetos por nível e forma da instrução no prompt.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `QuestionnaireScreen.tsx:633-708` (bloco de cardio atual — padrão de UI a seguir)
- `backend/services/questionario_normalizer.py` (normalização; ponto de passagem
  obrigatório das respostas novas)
- `backend/app.py:1452-1457, 1521-1565, 349-366` (prompt do molde e dose)
- `backend/services/dose_cardio.py` (validação da dose contra o molde)
- `.planning/phases/01-fluxo-cardio-e-alongamento/01-RESEARCH.md` (mapa da geração)
- `.planning/codebase/*.md` + `AGENTS.md`

## Riscos e sequenciamento

- **Conflito com a Fase 1:** o plano 01-04 também edita `backend/app.py` (prompt). O
  PLANEJAMENTO da Fase 2 pode rodar em paralelo, mas a EXECUÇÃO da Fase 2 só começa
  depois da wave 1 da Fase 1 mesclada — o planner deve citar os anchors do prompt pelo
  estado pós-Fase-1.
- Classe de bug a testar primeiro: resposta nova do questionário presente no payload que
  chega ao gerador (teste de payload/normalizer, não só de UI).

## Deferred Ideas

- Loop de adaptação de dose de cardio pelo realizado (fase futura própria).
- Percurso/elevação, FC média, zonas — fora por ora.
