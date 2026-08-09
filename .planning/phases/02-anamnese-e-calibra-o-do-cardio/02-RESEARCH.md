# Phase 2: Anamnese e calibração do cardio - Research

**Researched:** 2026-08-09
**Domain:** React Native (Expo) questionário → Flask backend proxy de IA (Claude) — anamnese de
experiência de cardio (REQ-04) e calibração de dose inicial/progressão no prompt do molde
(REQ-05), sem mudança de schema do JSON gerado.
**Confidence:** HIGH — todo o domínio é interno ao repositório (nenhuma biblioteca nova), com
a trilha completa do dado lida arquivo a arquivo, linha a linha, do `TextInput` até a chamada
`_montar_chamada_do_molde`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Perguntas de anamnese (REQ-04)**
- Perguntas objetivas NO QUESTIONÁRIO (não no chat), no padrão do bloco de cardio existente.
- As respostas têm de chegar comprovadamente ao gerador — teste de payload obrigatório (lição
  do PR #64: campo do questionário que nunca chegava ao gerador).

**Calibração no prompt (REQ-05)**
- Dose inicial conservadora + teto de progressão semanal por nível declarado.
- NENHUMA mudança no schema do molde (`git diff backend/schemas/molde_schema.py` deve
  permanecer vazio).
- Não tocar o item 5 do prompt (usado por `.replace()` — armadilha já confirmada na Fase 1).

### Claude's Discretion
- O conjunto exato de perguntas de anamnese de cardio. Sugestão de partida do dono: pratica
  cardio atualmente? (freq.), consegue correr/pedalar quanto tempo/distância confortável?,
  objetivo (condicionamento, completar 5k, emagrecimento).
- Como derivar um nível de cardio (iniciante/intermediário/avançado) das respostas.
- Valores dos tetos de progressão por nível e forma da instrução no prompt.

### Deferred Ideas (OUT OF SCOPE)
- Loop de adaptação de dose de cardio pelo realizado (fase futura própria).
- Percurso/elevação, FC média, zonas — fora por ora.
- Intercâmbio de modalidade (Fase 3).
- Qualquer mudança no schema do molde/plano gerado.

### Phase Boundary
**IN:** REQ-04 e REQ-05, e só eles.
**OUT:** loop de adaptação de cardio pelo realizado, intercâmbio de modalidade, qualquer mudança
de schema do JSON do plano.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-04 | Questionário captura experiência de cardio (já corre?, distância/tempo confortável, objetivo) e as respostas chegam comprovadamente ao gerador | Trilha completa mapeada (Architecture Patterns); teste de payload molde identificado nos DOIS lados (`__tests__/questionnaireScreen.test.tsx` e `backend/tests/test_dose_cardio.py::TestDoseNoPrompt`); migração obrigatória em `questionario_usuario` (tabela tipada, não JSONB) seguindo o precedente de `0021_dose_cardio_declarada.sql` |
| REQ-05 | Prompt do molde calibra dose inicial conservadora e teto de progressão semanal pelo nível de cardio declarado, sem mudar o schema do molde | Anchors do prompt mapeados linha a linha (`_instrucao_dose_cardio`, `_montar_chamada_do_molde`, `_INSTRUCOES_MOLDE`); ponto de colisão com o plano 01-04 identificado e evitado; teto verificável em `molde["progressao"]["regras"]` sem chamada real à IA |

</phase_requirements>

## Summary

**Achado crítico que corrige o CONTEXT.md:** `questionario_normalizer.py` — que o CONTEXT.md
lista como "ponto de passagem obrigatório das respostas novas" — é código morto no caminho
que roda em produção. `normalizar_questionario` só é chamado em `backend/app.py:1080`, dentro
do branch `else` (modo síncrono legado) de `handle_generate_plan`; o branch que realmente
executa — `if FORCA_USE_MOLDE_ARCHITECTURE:` (`app.py:1013`) → `_executar_geracao_molde`
(`app.py:1724`) — lê o questionário CRU via `_questionario_para_prompt(questionnaire_data)`
(`app.py:349-366`, que só canonicaliza `cardio_modalidades`) e `_instrucao_dose_cardio(
questionnaire_data)` (`app.py:1521-1568`), nenhum dos dois passando por `normalizar_questionario`.
E `FORCA_USE_MOLDE_ARCHITECTURE=true` **é a env real de produção** — confirmado em
`docs/DEPLOY_VPS.md:139-140` ("a env real `FORCA_USE_MOLDE_ARCHITECTURE=true` vaza para testes
que assumem o modo antigo"). Consequência direta para REQ-04: qualquer campo novo de anamnese
de cardio só precisa ter o MESMO nome de chave entre o que `QuestionnaireScreen.tsx` escreve em
`formDataForApi` e o que o backend lê com `.get(...)` — não existe camada de renomeação no
caminho vivo. É exatamente essa correspondência de nome, e não o normalizer, que é o ponto onde
um campo pode se perder — a mesma classe de bug do commit `011509f` ("dias e frequência
escolhidos voltam a chegar ao gerador", `docs`/PR #64 na memória do projeto), só que hoje o
efeito de uma chave errada é DIFERENTE: como `_instrucao_dose_cardio` (e qualquer instrução
nova no mesmo padrão) devolve `""` quando não encontra dado, uma chave errada faz o bloco
inteiro de calibração desaparecer do prompt **em silêncio**, sem exceção, sem log de erro.

**Trilha do dado (ponta a ponta, verificada nesta sessão):** `QuestionnaireScreen.tsx` usa um
`useState` por campo (não um objeto único) e monta `formDataForApi` só dentro de `handleSubmit`
(`QuestionnaireScreen.tsx:388-395`) → grava local (`secureSetItem`, `formDataForStorage` =
`{...formDataForApi, nome}`) e via `saveQuestionnaireDataAPI` (`upsert` em `questionario_usuario`,
`src/services/api/questionnaireService.ts:38-67`) → navega para `PostQuestionnaireChat` passando
`formData`. Essa tela, na inicialização, **não relê do Supabase** — carrega o MESMO objeto do
`secureStorage` local (`PostQuestionnaireChat.tsx:548-559`) e o repassa, sem transformação de
nome de chave, para `consolidateChat`/`generatePlan` (`completeOnboardingAndGeneratePlan`,
`PostQuestionnaireChat.tsx:182-231`; `trainingPlanService.ts:75-112`). Ou seja: o payload que
chega ao backend em `/api/generate-plan` tem EXATAMENTE as chaves que `formDataForApi` definiu
no cliente — nenhuma tradução em nenhum ponto do caminho vivo.

**REQ-05 — onde calibrar sem colidir com a Fase 1:** o plano 01-04 desta mesma milestone (Wave
1, que a Fase 2 espera mesclada antes de executar) insere um **novo item 8** em
`_INSTRUCOES_MOLDE` (`app.py:1444-1469`), imediatamente antes do antigo item 8 ("Retorne
SOMENTE o JSON..."), que vira item 9 — sem tocar o texto do item 5 (`.replace()` intacto). Isso
muda a numeração de `_INSTRUCOES_MOLDE` no merge, mas **não é o lugar certo para a calibração de
cardio de qualquer forma**: `_INSTRUCOES_MOLDE` é o bloco ESTÁVEL (cacheado entre alunos, layout
v2), e o teto por nível é um dado POR ALUNO. O anchor correto e já preparado para isso é
`_instrucao_dose_cardio()` (`app.py:1521-1568`), que já é passada como string composta para
`_montar_chamada_do_molde(questionnaire_str, diretrizes_str, catalogo_str, dose_cardio_str)`
(`app.py:1595-1600`, parâmetro `dose_cardio_str` já existe) e via `_executar_geracao_molde`
(chamada em `app.py:1771-1776`) entra em `_dados_do_aluno_no_prompt` (`app.py:1571-1592`), que é
sempre a parte VOLÁTIL do prompt (nunca o prefixo cacheado — confirmado em
`backend/tests/test_dose_cardio.py:362-374`). Estender essa função (ou adicionar uma irmã, ex.
`_instrucao_calibracao_cardio`, concatenada ao mesmo `dose_cardio_str`) calibra por aluno **sem
tocar `_INSTRUCOES_MOLDE`**, eliminando o risco de colisão de diff com o plano 01-04 por
completo. O schema (`backend/schemas/molde_schema.py:225-238`) já limita `delta_cardio_percentual`
a `valor: number, minimum 1.0, maximum 10.0` PARA TODOS OS ALUNOS — um teto por nível mais
estreito (ex.: iniciante ≤ 5%) não pode ir no schema (locked) e tem de ser instrução de prompt,
o que respeita a restrição do CONTEXT.md.

**Primary recommendation:** (1) escolher os nomes de campo novos e usá-los IDÊNTICOS em
`QuestionnaireScreen.tsx` → `questionnaireService.ts` (`QuestionnairePayload`) → migração SQL →
qualquer `.get()` novo no backend — sem normalizador no meio; (2) migração em
`questionario_usuario` seguindo byte a byte o precedente de `0021_dose_cardio_declarada.sql`
(coluna + CHECK + espelho em `questionario_historico` + reescrita de `snapshot_questionario()` +
bloco de asserção); (3) instrução de calibração como extensão de `_instrucao_dose_cardio()` (ou
função irmã somada ao mesmo `dose_cardio_str`), nunca em `_INSTRUCOES_MOLDE`; (4) nível de cardio
derivado deterministicamente no backend (função pura, testável sem IA), não deixado para o
modelo inferir nem pré-computado só no cliente; (5) teste de payload nos DOIS lados (frontend:
molde de `__tests__/questionnaireScreen.test.tsx`; backend: molde de
`backend/tests/test_dose_cardio.py::TestDoseNoPrompt`), replicando a lição do commit `011509f`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Captura das perguntas de anamnese (UI) | Browser/Client (`QuestionnaireScreen.tsx`) | — | `useState` por campo + `blocosRespondidos()`/`renderOptions` já é o padrão estabelecido para todo o questionário |
| Validação de obrigatoriedade/formato das respostas novas | Browser/Client (`blocosRespondidos()`) | Database (CHECK constraint na migração) | Front barra o avanço do step; banco é a defesa em profundidade (mesmo padrão de `questionario_cardio_dose_coerente`) |
| Persistência do questionário (nova rodada de campos) | Database (`questionario_usuario`, tabela tipada) | API/Backend indireto (RLS via Supabase JS) | Tabela com colunas explícitas, não JSONB — todo campo novo exige migração, não é "adicionar chave" |
| Transporte local até a geração imediata | Browser/Client (`secureStorage` + `PostQuestionnaireChat.tsx`) | — | O payload que vai para `/api/generate-plan` é o objeto local recém-submetido, não uma releitura do banco |
| Derivação do nível de cardio (iniciante/intermediário/avançado) | API/Backend (função pura nova, espelhando `dose_cardio.py`) | — | Mesma filosofia de `dose_declarada()`: contrato verificável em teste, não inferência do modelo |
| Instrução de calibração no prompt | API/Backend (`_instrucao_dose_cardio`/função irmã, `app.py`) | — | Precisa viver na parte VOLÁTIL do prompt (por aluno), nunca em `_INSTRUCOES_MOLDE` (estável/cacheado) |
| Teto de progressão do cardio | API/Backend (instrução de prompt) + validação opcional pós-geração | Database (schema já limita 1-10% para todos — não muda) | O teto POR NÍVEL é mais estreito que o teto do schema; só é expressável como instrução, com verificação opcional sobre o JSON gerado |

## Standard Stack

Nenhuma biblioteca nova. Todo o trabalho é sobre o stack já fixado (React Native/Expo + Supabase
JS + Flask + jsonschema), documentado em `.planning/codebase/STACK.md`. Sem `npm install`/
`pip install` previsto.

## Package Legitimacy Audit

**Não aplicável.** Nenhum pacote novo é instalado nesta fase.

## Architecture Patterns

### Diagrama — trilha completa do dado novo (proposta)

```
QuestionnaireScreen.tsx (novo bloco de perguntas, useState por campo)
   │  ex.: praticaCardioAtualmente, distanciaConfortavelKm, objetivoCardio
   ▼
blocosRespondidos() [linha 289-316]  ← novo índice no array, valida o bloco novo
   │  (TOTAL_STEPS=11 hoje; se virar step novo, incrementa; se ficar dentro do
   │   step "Incluir cardio?" (632-722), TOTAL_STEPS não muda)
   ▼
handleSubmit() [linha 367]
   │  formDataForApi { ...existentes, <chaves_novas> }  [linha 388-395]
   ├──► secureSetItem(userStorageKey, JSON.stringify(formDataForStorage))  [linha 400]
   │        (formDataForStorage = {...formDataForApi, nome} — ESTA é a fonte
   │         que a geração IMEDIATA usa, não o banco)
   └──► saveQuestionnaireDataAPI(formDataForApi)  [linha 408]
            │  questionnaireService.ts:38-67 — upsert PostgREST
            ▼
        questionario_usuario (colunas tipadas — EXIGE migração para as chaves novas)
   │
   ▼ (navigation.navigate('PostQuestionnaireChat', { formData: formDataForStorage }))
PostQuestionnaireChat.tsx init [linha 548-559]
   │  NÃO relê do Supabase — carrega o MESMO objeto de secureStorage
   ▼
completeOnboardingAndGeneratePlan() [linha 182-231]
   │  currentQuestionnaireData = questionnaireDataRef.current (chaves intocadas)
   ▼
trainingPlanService.ts generatePlan(questionnaireData, diretrizes)  [linha 105-112]
   │  POST /api/generate-plan { questionnaireData, diretrizes }
   ▼
backend/app.py handle_generate_plan [linha 964]
   │  if FORCA_USE_MOLDE_ARCHITECTURE (=true EM PRODUÇÃO, docs/DEPLOY_VPS.md:139-140):
   ▼
_executar_geracao_molde(job, questionnaire_data, diretrizes, ...)  [linha 1724]
   │  questionnaire_data é o dict CRU do request — normalizar_questionario NÃO É CHAMADO aqui
   ├──► _questionario_para_prompt(questionnaire_data)  [linha 349-366, 1759]
   │        (só canonicaliza cardio_modalidades; resto passa direto)
   └──► _instrucao_dose_cardio(questionnaire_data)  [linha 1521-1568, chamada em 1775]
            │  ESTENDER AQUI (ou função irmã) — lê q.get("<chave_nova>") DIRETO
            ▼
        _montar_chamada_do_molde(..., dose_cardio_str)  [linha 1595-1658]
            │  dose_cardio_str entra em _dados_do_aluno_no_prompt [1571-1592]
            │  SEMPRE na parte VOLÁTIL (messages[0].content), nunca no
            │  system[]/prefixo cacheado — confirmado em test_dose_cardio.py:362-374
            ▼
        Claude (PLAN_MODEL_NAME) gera o molde
            │
            ▼
        molde["progressao"]["regras"][] com tipo="delta_cardio_percentual", valor 1.0-10.0
            (schema NÃO limita por nível — teto por nível só existe como instrução;
             verificação opcional sobre este array, sem chamar IA de novo)
```

### Onde inserir as perguntas novas na UI (dois caminhos possíveis)

**Opção A — dentro do step existente "Incluir cardio no plano?"** (`QuestionnaireScreen.tsx:
632-722`): as perguntas de anamnese entrariam como novos `<View style={styles.field}>` dentro do
bloco `{includeCardio === true && (...)}`, no MESMO padrão de "Quantos dias por semana?"/"Quantos
minutos por vez?" (linhas 658-716). `TOTAL_STEPS` não muda; `blocosRespondidos()[8]` (índice do
bloco de cardio, linha 310-311) precisa incluir a validação dos campos novos na mesma condição
`includeCardio === true && (...)`.

**Opção B — novo step dedicado** logo após o step de cardio: precisa incrementar `TOTAL_STEPS`
(hoje `11`, linha 83) e adicionar um novo elemento no array de `blocos` (linha 493 em diante) E
um novo booleano em `blocosRespondidos()` na MESMA posição relativa — os dois arrays são
consumidos por índice posicional e têm de ficar sincronizados (nenhum tipo/enum garante isso
hoje; é convenção lida no código, não imposta pelo compilador).

Ambas as opções reaproveitam `renderOptions`/`OptionButton`/`styles.field` já existentes — nenhum
componente novo de UI é necessário para perguntas de escolha única ou boolena. Para "distância
confortável" (numérico), o padrão a reaproveitar é `TextInput` com `keyboardType="numeric"` +
`parseFloatOrNull`/`sanitizeNumericText` (mesmo padrão do REQ-01 da Fase 1, `SessionPlayer.tsx:
65-70` e `src/components/ui/NumericField.tsx:43-69`), não um parser novo.

### Padrão de teste de payload a replicar (frontend)

```typescript
// Molde: __tests__/questionnaireScreen.test.tsx — describe('QuestionnaireScreen — submissão')
// (linhas ~235-280 desta sessão) já afirma o shape exato de formDataForApi enviado a
// saveQuestionnaireDataAPI, incluindo inclui_cardio/cardio_dias_semana/cardio_modalidades.
// Estender com asserção equivalente para as chaves novas de anamnese.
```

### Padrão de teste de payload a replicar (backend — prova que chega ao prompt)

```python
# Source: backend/tests/test_dose_cardio.py:310-374 (verificado nesta sessão)
class TestDoseNoPrompt:
    def test_bloco_de_contrato_traz_dias_minutos_e_modalidades(self):
        import backend.app as app
        bloco = app._instrucao_dose_cardio(QUEST_BASE)
        assert "2" in bloco and "30" in bloco
        ...

    def test_dose_entra_na_chamada_do_molde_como_instrucao(self):
        import backend.app as app
        chamada = app._montar_chamada_do_molde(
            "{}", "{}", "Cardio: Corrida", app._instrucao_dose_cardio(QUEST_BASE)
        )
        # No layout v2 a dose viaja com a parte VOLÁTIL, nunca no prefixo estável.
        volatil = "".join(m["content"] if isinstance(m["content"], str) else str(m["content"])
                           for m in chamada["messages"])
        estavel = str(chamada.get("system") or "")
        # ... assert bloco in volatil and bloco not in estavel
```
Este é o molde a copiar para uma nova `TestCalibracaoNoPrompt`: constrói um `questionnaire_data`
com as chaves novas, chama a função de instrução nova, afirma que o texto do nível/teto aparece
no bloco E que o bloco entra na parte volátil da chamada — prova, sem chamar a Anthropic, que o
campo chega ao ponto exato onde o prompt é montado.

### Precedente de migração a seguir byte a byte

```sql
-- Source: supabase/migrations/0021_dose_cardio_declarada.sql (verificado nesta sessão)
-- Estrutura obrigatória para QUALQUER campo novo persistido em questionario_usuario:
-- 1. alter table questionario_usuario add column if not exists <campo> <tipo>;
--    + CHECK de faixa (ex.: "questionario_cardio_dias_check" linhas 58-63)
-- 2. Espelhar a MESMA coluna em questionario_historico (linhas 116-119)
-- 3. Reescrever create or replace function snapshot_questionario() para
--    listar a coluna nova no INSERT (linhas 121-142) — o trigger lista
--    colunas UMA A UMA; esquecer aqui perde o campo em SILÊNCIO do histórico
--    (sem erro, sem constraint violada — só falta o dado quando alguém olhar
--    questionario_historico depois).
-- 4. Bloco de asserção (linhas 149-175): confere que a coluna existe em AMBAS
--    as tabelas E que pg_get_functiondef(snapshot_questionario) contém o nome
--    da coluna nova (prova que o trigger GRAVA, não só que a coluna existe).
```
**Próximo número de migração:** `0033` (maior migração hoje é `0032_harden_m0031_backup_tables.sql`;
nenhum plano da Fase 1 cria migração — confirmar com `ls supabase/migrations/` no momento da
execução, pois outro trabalho pode ter mesclado migrações entretanto).

### Anti-Patterns to Avoid
- **Adicionar a instrução de calibração em `_INSTRUCOES_MOLDE`:** é o bloco ESTÁVEL/cacheado
  (layout v2) e colide textualmente com o novo item 8 que o plano 01-04 da Fase 1 já insere ali.
  Calibração por aluno pertence à parte volátil (`_instrucao_dose_cardio`/`dados_do_aluno`).
- **Confiar em `normalizar_questionario`/`questionario_normalizer.py`:** é código morto no
  caminho de produção (`FORCA_USE_MOLDE_ARCHITECTURE=true`). Escrever uma tarefa que "ajusta o
  normalizer" para REQ-04 não move nada no comportamento real do app.
- **Deixar a IA inferir o nível de cardio sozinha a partir de texto livre:** o projeto já tem o
  precedente inverso — `dose_cardio.py` existe precisamente porque deixar a dose "só no prompt"
  sem contrato verificável permitia a IA ignorá-la (comentário de `dose_cardio.py:1-20`). Nível
  derivado deterministicamente no backend é testável sem custo de API; nível deixado para o
  modelo não é.
- **Adicionar campo estruturado novo ao `molde_schema.py` para representar o nível/teto:**
  CONTEXT.md tranca isso (`git diff backend/schemas/molde_schema.py` deve ficar vazio). Mesmo
  que parecesse "mais limpo", abriria a porta de mão única que a Fase 1 já documentou como
  custosa (gramática da API tem teto medido, `molde_schema.py:539-558`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Parsing de distância/tempo confortável (decimal) | Novo parser numérico | `parseFloatOrNull` (`SessionPlayer.tsx:65-70`) ou `sanitizeNumericText`/`numericTextToNumber` (`src/components/ui/NumericField.tsx:43-69`) | Já testados e usados em dois outros contextos deste mesmo questionário/sessão |
| Validação de "dose declarada" como contrato do molde | Novo mecanismo de contrato do zero | Padrão de `dose_cardio.py` (`DoseCardio`, `dose_declarada`, `_validar`) — nunca reprova por impossibilidade, nunca levanta exceção | É o precedente EXATO que REQ-05 precisa replicar para o teto de progressão: função pura, testável com dicts sintéticos, nunca derruba a geração |
| Composição do prompt por aluno | Concatenar string solta em `_executar_geracao_molde` | Estender `_instrucao_dose_cardio` / somar ao parâmetro `dose_cardio_str` já existente em `_montar_chamada_do_molde` | O parâmetro já existe e já é tratado como volátil pelos testes existentes — reaproveitar evita reabrir a separação estável/volátil do layout v2 |
| Coerção de booleano/nível vindo do questionário | Novo `if isinstance(...)` ad-hoc | `_quer_cardio`/`_quer_incluir` (`dose_cardio.py:65-77`, `app.py:1385-1395`) — "só negativo EXPLÍCITO exclui" | Regra de produto já estabelecida e testada: campo ausente/ambíguo NUNCA vira exclusão silenciosa |

**Key insight:** REQ-04 e REQ-05 não abrem nenhum mecanismo novo — eles ESTENDEM dois mecanismos
que a migration 0021 já construiu (dose declarada como contrato, `_instrucao_dose_cardio` como
bloco por aluno no prompt). O risco desta fase é 100% de acoplamento correto de nomes de chave
entre 4 arquivos (tela, service, migração, `app.py`), não de arquitetura nova.

## Runtime State Inventory

> Esta fase envolve uma migração (add column) em tabela existente — não é rename/refactor, mas o
> gatilho da seção inclui "migração" explicitamente. Resposta às 5 categorias:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `questionario_usuario` (linhas existentes de usuários que já responderam) e `questionario_historico` (snapshots antigos) NÃO terão as colunas novas preenchidas até o usuário resubmeter o questionário (via onboarding ou "Refazer treino") | Nenhuma migração de DADOS retroativa — colunas novas nascem `NULL` para linhas existentes; código de leitura precisa tratar `None` como "sem dado" (mesmo padrão de `dose_declarada`: `None` = "aluno não disse", não zero) |
| Live service config | Nenhum serviço externo (n8n, Datadog etc.) referencia estes campos | Nenhuma |
| OS-registered state | Nenhum | Nenhuma |
| Secrets/env vars | Nenhum segredo referencia os nomes dos campos novos | Nenhuma |
| Build artifacts | Nenhum artefato compilado/instalado depende do schema de `questionario_usuario` | Nenhuma |

**Usuários existentes sem os campos novos:** cobertos na seção "Common Pitfalls" (Pitfall 3) e
"Open Questions" (pergunta 1) — o comportamento do backend já é gracioso para dado ausente
(`_instrucao_dose_cardio` devolve `""` quando não há dose), então uma função de calibração nova
que siga o MESMO padrO (retorna vazio/neutro quando os campos novos são `None`) não quebra
geração para ninguém que ainda não respondeu.

## Common Pitfalls

### Pitfall 1: assumir que `questionario_normalizer.py` é o ponto de passagem obrigatório
**What goes wrong:** implementar a leitura dos campos novos DENTRO de `normalizar_questionario`
(seguindo a "Canonical Reference" do CONTEXT.md), e a instrução nunca aparecer no prompt em
produção, porque essa função só roda no branch legado (`FORCA_USE_MOLDE_ARCHITECTURE=false`).
**Why it happens:** o CONTEXT.md (que por sua vez cita "achados do executor de busca") lista
`questionario_normalizer.py` como "ponto de passagem obrigatório das respostas novas" sem
distinguir os dois branches de `handle_generate_plan`.
**How to avoid:** ler o campo novo diretamente de `questionnaire_data` (dict cru) dentro de uma
função chamada por `_executar_geracao_molde` (linha 1724) — o mesmo padrão de `dose_declarada`/
`_instrucao_dose_cardio`, que NUNCA passam por `normalizar_questionario`.
**Warning signs:** qualquer tarefa do plano que edite `questionario_normalizer.py` sem também
editar `_executar_geracao_molde`/`_instrucao_dose_cardio` deve ser questionada.

### Pitfall 2: colidir com o plano 01-04 em `_INSTRUCOES_MOLDE`
**What goes wrong:** inserir a instrução de calibração como "item 9" ou "item 10" de
`_INSTRUCOES_MOLDE`, torcendo para que a numeração pós-merge da Fase 1 bata — e reintroduzir
conflito de merge ou, pior, sobrescrever silenciosamente o item que 01-04 já inseriu.
**Why it happens:** `_INSTRUCOES_MOLDE` é o lugar "óbvio" para instruções de progressão (item 4
já fala de `delta_cardio_percentual`), mas é o MESMO bloco que outro plano paralelo está editando.
**How to avoid:** calibração por aluno vai em `_instrucao_dose_cardio`/função irmã (bloco
volátil), não em `_INSTRUCOES_MOLDE` (bloco estável). Ver "Anti-Patterns to Avoid".
**Warning signs:** diff da tarefa tocando `_INSTRUCOES_MOLDE = """INSTRUÇÕES:` (`app.py:1444`).

### Pitfall 3: nome de campo novo diverge entre tela e leitura no backend (classe do bug PR #64 / commit `011509f`)
**What goes wrong:** `QuestionnaireScreen.tsx` grava `ja_corre_atualmente` mas o backend lê
`praticaCardioAtualmente` (ou qualquer par de nomes que não bata) — a instrução de calibração
nunca recebe dado, `_instrucao_dose_cardio`-like retorna vazio, e NENHUM erro aparece em lugar
nenhum (nem log, nem teste que não cubra esse caminho específico).
**Why it happens:** foi exatamente isso que aconteceu no commit `011509f` (`git log`, verificado
nesta sessão): o app gravava `dias_treino`/`experiencia_treino`/etc. e o backend lia
`diasPreferenciais`/`nivelExperiencia`/etc. — chaves nunca batiam.
**How to avoid:** escolher os nomes UMA VEZ e reusar literalmente em: `QuestionnaireScreen.tsx`
(`formDataForApi`), `questionnaireService.ts` (`QuestionnairePayload`), a migração SQL (nome de
coluna), e o `.get("<mesmo_nome>")` no backend. O teste de payload (backend, molde de
`TestDoseNoPrompt`) É o que pega esse erro — sem ele, o bug é invisível em produção.
**Warning signs:** qualquer PR onde o nome do campo no `.tsx` e o nome usado em `app.py` não são
literalmente a mesma string (grep um pelo outro).

### Pitfall 4: schema do molde já tem teto uniforme de 1-10% para `delta_cardio_percentual`
**What goes wrong:** a instrução de prompt pedir um teto MAIOR que 10% para um nível "avançado"
(ex.: "até 15% ao ano para avançados") — o schema (`molde_schema.py:236`, `"maximum": 10.0`)
rejeitaria a saída da IA, e o retry dirigido queimaria a tentativa.
**Why it happens:** o teto por nível é conceitualmente diferente do teto do schema — o schema
protege TODOS os alunos de uma progressão fisiologicamente perigosa; o teto por nível é mais
conservador que isso, nunca mais permissivo.
**How to avoid:** qualquer teto por nível deve estar DENTRO de `[1.0, 10.0]` (a faixa que o
schema já aceita) — a calibração só pode restringir para baixo, nunca pedir acima do que o schema
permite.
**Warning signs:** valor de teto proposto para qualquer nível ≥ 10 ou < 1.

### Pitfall 5: `mock.patch` sem `autospec` mascara assinatura errada
**What goes wrong:** testar a nova função de calibração (ou qualquer chamada que a atravesse)
com `mock.patch(...)` sem `autospec=True` — um `MagicMock` aceita qualquer kwarg, inclusive um
que a função real rejeitaria, e o teste passa mesmo com uma assinatura quebrada.
**Why it happens:** documentado explicitamente no próprio repo — `backend/tests/
test_anthropic_call_contract.py:1-16` registra um bug de produção real (2026-07-21) que
sobreviveu aos testes exatamente por isso: `app.py` chamava a função com um kwarg de nome
diferente do parâmetro real, e o mock permissivo não pegou.
**How to avoid:** qualquer teste que faça `mock.patch` sobre uma função com assinatura (não uma
função pura testada diretamente) usa `autospec=True` — ver `test_job_endpoints.py:300-303` para
o padrão.
**Warning signs:** `mock.patch("...", ...)` no diff sem `autospec=True` ao lado.

### Pitfall 6: `EXPO_PUBLIC_*` é inlinado em build-time pelo babel
**What goes wrong:** se a fase decidir gatear as perguntas novas atrás de uma env var
`EXPO_PUBLIC_ENABLE_*` (não pedido, mas uma tentação de "rollout seguro"), um teste jest que
tenta mudar essa env var em runtime (`process.env.EXPO_PUBLIC_X = ...` dentro do teste) não tem
efeito — o valor já foi inlinado pelo `babel-preset-expo` no momento do bundle.
**Why it happens:** `babel.config.js` usa inlining de `EXPO_PUBLIC_*` (`.planning/codebase/
ARCHITECTURE.md:224`, `STRUCTURE.md:13`) — não é uma leitura dinâmica de `process.env`.
**How to avoid:** não introduzir uma flag nova para esta fase (não é pedida no CONTEXT.md); se
algum rollout gradual for necessário, usar um mecanismo runtime (ex.: coluna de config lida do
banco), não `EXPO_PUBLIC_*`.
**Warning signs:** qualquer teste que faça `process.env.EXPO_PUBLIC_...  = 'true'` dentro do
corpo do teste esperando efeito imediato.

## Code Examples

### Instrução de dose por aluno — extensão natural para calibração (não tocar em `_INSTRUCOES_MOLDE`)
```python
# Source: backend/app.py:1521-1568 (verificado nesta sessão) — padrão a seguir/estender
def _instrucao_dose_cardio(questionnaire_data) -> str:
    from backend.services.dose_cardio import dose_declarada
    dose = dose_declarada(questionnaire_data)
    if dose is None:
        return ""
    if dose.sem_cardio:
        return ("CARDIO (contrato declarado pelo aluno): ele NÃO quer cardio neste plano. "
                "Não prescreva nenhum exercício de cardio.")
    partes = []
    if dose.dias_semana is not None:
        partes.append(f"- Cardio em EXATAMENTE {dose.dias_semana} sessão(ões) ...")
    # ... (minutos_sessao, modalidades)
    if not partes:
        return ""
    return ("CARDIO (contrato declarado pelo aluno — o molde é REPROVADO se violar):\n"
            + "\n".join(partes))
```

### Parâmetro já pronto para receber a calibração
```python
# Source: backend/app.py:1595-1600, 1771-1776 (verificado nesta sessão)
def _montar_chamada_do_molde(
    questionnaire_str: str,
    diretrizes_str: str,
    catalogo_str: str,
    dose_cardio_str: str = "",   # <- somar a instrução de calibração aqui
) -> dict:
    ...

chamada = _montar_chamada_do_molde(
    questionnaire_str,
    diretrizes_str,
    catalogo_str,
    _instrucao_dose_cardio(questionnaire_data),   # <- ou _instrucao_dose_cardio(...) + calibração
)
```

### Schema do molde — teto uniforme que a calibração por nível deve respeitar (não pode pedir mais que isto)
```python
# Source: backend/schemas/molde_schema.py:225-238 (verificado nesta sessão)
{
    "type": "object",
    "required": ["tipo", "semana_inicio", "semana_fim", "valor"],
    "description": (
        "Progressão do CARDIO: aumenta duração (e distância, quando houver) "
        "em X% por semana. Cardio não progride por %RM."
    ),
    "properties": {
        "tipo": {"const": "delta_cardio_percentual"},
        "semana_inicio": {"type": "integer", "minimum": 1},
        "semana_fim": {"type": "integer", "minimum": 1},
        "valor": {"type": "number", "minimum": 1.0, "maximum": 10.0,
                  "description": "Aumento percentual do cardio por semana, de 1 a 10."},
        "alvo": {"type": "string", "enum": ["duracao", "distancia", "ambos"]}
    }
}
```

### Migração — schema real da tabela que recebe os campos novos
```sql
-- Source: supabase/migrations/0008_questionario_usuario.sql (verificado nesta sessão)
create table if not exists public.questionario_usuario (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  ...
  experiencia_treino text,
  ...
);
-- Tabela TIPADA, colunas explícitas — não é JSONB. Confirma que campo novo = migração,
-- nunca "só adicionar chave no payload".
```

### Payload que a tela monta hoje (onde as chaves novas entram)
```typescript
// Source: src/screens/QuestionnaireScreen.tsx:388-395 (verificado nesta sessão)
const formDataForApi = {
  usuario_id: userId, data_nascimento: formattedDate, genero: genero, peso_kg: pesoNum,
  altura_cm: alturaNum, experiencia_treino: experienciaTreino, objetivo: objetivo,
  tem_lesoes: temLesoes, lesoes_detalhes: lesoesDetalhes, dias_treino: getSelectedDays(),
  inclui_cardio: includeCardio, inclui_alongamento: includeStretching,
  tempo_medio_treino_min: averageTrainingTime,
  cardio_dias_semana: includeCardio === true ? cardioDias : null,
  cardio_minutos_sessao: includeCardio === true ? cardioMinutos : null,
  cardio_modalidades: includeCardio === true && cardioModalidades.length > 0 ? cardioModalidades : null,
  // <- campos novos de anamnese entram aqui, com o MESMO nome usado no backend
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `inclui_cardio` como único sinal de cardio (sim/não) | Dose declarada como contrato (`dias`/`minutos`/`modalidades`), validada e reprovável | migration `0021` | REQ-04/05 estendem esse MESMO mecanismo para experiência/nível, não criam um novo |
| Campo do frontend lido pelo backend por chave diferente (`diasPreferenciais` vs `dias_treino`) | `normalizar_questionario` (só no branch legado) ou correspondência literal de chave (branch molde, o que roda em produção) | commit `011509f` (02/08/2026) | Confirma que correspondência de NOME é o ponto de falha real desta fase, não a existência de um normalizador |

**Deprecado/obsoleto:**
- Caminho síncrono legado (`FORCA_USE_MOLDE_ARCHITECTURE=false`) ainda existe no código mas NÃO
  roda em produção (`docs/DEPLOY_VPS.md:139-140`); não vale a pena gastar tarefa de plano
  garantindo que REQ-04/05 funcionem nesse branch, a menos que o dono confirme que precisa dele
  vivo por algum outro motivo (ex.: testes de regressão do modo antigo).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `FORCA_USE_MOLDE_ARCHITECTURE=true` é a configuração REAL de produção hoje (não só um exemplo de `docs/DEPLOY_VPS.md`). | Summary, Pitfall 1 | Se produção na verdade roda com a flag `false` (ex.: revertida depois da data do doc), a fase precisaria também tratar `normalizar_questionario`/o branch legado — dobrando a superfície de mudança. Baixo risco: o doc é recente e a arquitetura "molde" é citada por toda a Fase 1 e pelo próprio CONTEXT.md desta fase como o caminho vivo. |
| A2 | Nenhum outro trabalho em andamento (fora da Fase 1, plano 01-04) mescla migração nova em `supabase/migrations/` antes da execução da Fase 2, então `0033` é o próximo número livre. | Architecture Patterns (migração) | Se outra migração for mesclada primeiro, o plano precisa recalcular o número — mitigado recomendando checagem de `ls supabase/migrations/` na hora da execução, não confiar neste número estático. |
| A3 | O nível de cardio deve ser DERIVADO deterministicamente no backend (função pura, testável), não deixado para a IA inferir do texto bruto do questionário. | Don't Hand-Roll, Anti-Patterns | Se o dono preferir deixar a IA inferir livremente (menos código, mais flexibilidade semântica), a garantia de "dose inicial conservadora" fica mais fraca e não é verificável em teste sem chamada real — decisão de produto que caberia em discuss-phase se o planner achar ambíguo. |
| A4 | As perguntas novas de anamnese cabem dentro do STEP existente "Incluir cardio no plano?" (Opção A) sem precisar de um step dedicado novo — mas isso é decisão de UX aberta ao Claude's Discretion do CONTEXT.md, não travada aqui. | Architecture Patterns (Opção A/B) | Se a Opção B (step dedicado) for escolhida, `TOTAL_STEPS` e o array de `blocos` precisam ser incrementados/sincronizados manualmente — risco de off-by-one se um dos dois arrays não for atualizado. |

## Open Questions

1. **Usuário que já tem plano ativo e nunca refaz o questionário: ele nunca recebe calibração?**
   - What we know: a única forma de um questionário existente ganhar os campos novos é
     resubmissão completa (onboarding de conta nova ou "Refazer treino" → `RefazerTreinoSheet.tsx`
     → volta para `QuestionnaireScreen`, que reabre com o rascunho local salvo). Não existe
     endpoint de replanejamento semanal com IA que releia um questionário diferente
     (`grep` em `@app.route` não encontrou rota de replan/ajuste).
   - What's unclear: se o produto quer, no futuro, oferecer um jeito mais leve de "só declarar
     experiência de cardio" sem refazer o questionário inteiro (fora do escopo declarado desta
     fase, mas relevante para o Deferred Ideas de loop de adaptação).
   - Recommendation: fora do escopo — a fase deve garantir que ausência dos campos novos (`None`)
     produza comportamento neutro (sem calibração, como hoje), nunca erro.

2. **Qual o vocabulário exato do nível de cardio (2 ou 3 degraus) e como ele se relaciona com
   `experiencia_treino` (nível genérico de musculação, já existente)?**
   - What we know: `EXPERIENCE_LEVELS` (`QuestionnaireScreen.tsx:59`) já usa
     iniciante/intermediário/avançado para MUSCULAÇÃO — CONTEXT.md diagnostica que esse é hoje o
     ÚNICO nível existente e que cardio não tem o seu próprio.
   - What's unclear: se o nível de cardio deve reusar os MESMOS 3 rótulos (para consistência
     visual) mesmo sendo um campo semanticamente separado, ou usar uma escala diferente.
   - Recommendation: reusar os rótulos (iniciante/intermediário/avançado) por consistência de UX,
     mas como um campo de ESTADO SEPARADO (`nivelCardio`, não `experienciaTreino`) — evita reescrever
     a pergunta genérica de musculação e mantém os dois domínios independentes, como o diagnóstico
     do CONTEXT.md já recomenda implicitamente.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | frontend build/test | ✓ | v24.17.0 (herdado da Fase 1, mesma sessão de ambiente) | — |
| npm | dependências frontend | ✓ | 11.13.0 | — |
| Python | backend/testes | ✓ | 3.9.6 (local) / 3.11 (Docker) | — |
| tsc | portão de tipo | ✓ | 5.9.3 | — |
| pytest | testes backend | ✓ | 8.4.2 | — |
| jest | testes frontend | ✓ (via npx) | ^29.7.0 | — |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (`jest-expo` preset) no frontend; pytest 8 no backend |
| Config file | `package.json` (bloco `jest`); `backend/tests/conftest.py` |
| Quick run command | `npx jest __tests__/questionnaireScreen.test.tsx` / `python3 -m pytest backend/tests/test_dose_cardio.py backend/tests/test_prompt_molde_estrutura.py -q` |
| Full suite command | `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q` (não use o exit code do jest como portão — `AGENTS.md`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| REQ-04 | `formDataForApi` inclui os campos novos de anamnese com os valores digitados | component | `npx jest __tests__/questionnaireScreen.test.tsx` | ✅ arquivo existe (`describe('QuestionnaireScreen — submissão')`) — adicionar asserções para as chaves novas |
| REQ-04 | Campo novo chega ao bloco de instrução do backend (prova de payload ponta a ponta, sem chamar IA) | unit | `python3 -m pytest backend/tests/test_dose_cardio.py -q` (ou novo `test_calibracao_cardio.py`) | ✅ padrão existe (`TestDoseNoPrompt`) — replicar para o campo novo |
| REQ-04 | Migração cria as colunas + espelha em `questionario_historico` + trigger grava | integration (SQL) | Harness de migration (padrão de `AGENTS.md`/`0022`) — sem Supabase real; conferir asserção `do $$ ... raise exception` na própria migração | ❌ Wave 0 — migração ainda não existe |
| REQ-05 | Instrução de calibração aparece na parte VOLÁTIL do prompt, nunca na estável (cache) | unit | `python3 -m pytest backend/tests/test_prompt_molde_estrutura.py -q` (estender com nova asserção) | ✅ arquivo existe — adicionar caso |
| REQ-05 | Teto de progressão por nível é respeitado por um molde sintético (sem IA) | unit | `python3 -m pytest backend/tests/test_dose_cardio.py -q` (ou módulo novo, mesmo padrão de `_validar`) | ❌ Wave 0 — função/teste ainda não existem |
| REQ-05 | Instrução de calibração nunca pede `valor` fora de `[1.0, 10.0]` (limite do schema) | unit | Teste que monta a instrução para os 3 níveis e confere os números citados no texto contra o schema | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** teste específico da área tocada (ex.: `python3 -m pytest backend/tests/test_dose_cardio.py -q`)
- **Per wave merge:** `npx jest --runInBand --silent` + `python3 -m pytest backend/tests -q`
- **Phase gate:** suíte completa verde + `npx tsc --noEmit` antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Migração `0033_<nome>.sql` (colunas novas + `questionario_historico` + `snapshot_questionario()` + asserção) — cobre REQ-04
- [ ] `backend/tests/test_calibracao_cardio.py` (ou extensão de `test_dose_cardio.py`) — cobre REQ-05 (derivação de nível + teto de progressão, sem IA)
- [ ] Asserções novas em `backend/tests/test_prompt_molde_estrutura.py` para o bloco de calibração entrar na parte volátil — cobre REQ-05

## Security Domain

`security_enforcement` não está configurado em `.planning/config.json` (arquivo ausente nesta
pesquisa) → tratado como habilitado por padrão.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não | Fase não toca autenticação |
| V3 Session Management | não | Fase não toca sessão |
| V4 Access Control | sim (indireto) | Nenhuma RPC nova prevista; escrita segue o RLS já existente de `questionario_usuario` (`auth.uid() = usuario_id`, `0008_questionario_usuario.sql`) |
| V5 Input Validation | sim | Campos novos precisam de CHECK no banco (mesmo padrão de `questionario_cardio_dias_check`/`questionario_cardio_minutos_check`, `0021`) + sanitização no cliente (`sanitizeNumericText`/opções fechadas) — nunca confiar só no client |
| V6 Cryptography | não | Não aplicável |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Texto livre de anamnese (se alguma pergunta virar campo de texto) injetado no prompt pago como instrução | Tampering (prompt injection) | Seguir o padrão de `_questionario_para_prompt`/`canonicalizar_modalidades_cardio`: só valor de uma lista FECHADA (enum/catálogo) ganha autoridade de instrução; texto livre nunca deve virar bloco de "CONTRATO" no prompt |
| Campo novo sem CHECK de faixa permitindo valor absurdo (ex.: "distância confortável = 9999 km") que vira alvo impossível para o molde | Denial of Service (custo — duas tentativas de retry perdidas) | CHECK de faixa na migração, seguindo `questionario_cardio_minutos_check` (`0021`, faixa 5-180) como precedente de "teto realista" |

## Sources

### Primary (HIGH confidence)
- Leitura direta do código-fonte nesta sessão (`Read`/`grep`/`git log`/`git show`), sem consulta
  a documentação externa — fase 100% interna ao repo, sem biblioteca nova.
- `docs/DEPLOY_VPS.md:139-140` — confirma `FORCA_USE_MOLDE_ARCHITECTURE=true` como env real de
  produção.
- `git show 011509f` — commit completo do fix "dias e frequência escolhidos voltam a chegar ao
  gerador", precedente direto da classe de bug que REQ-04 precisa evitar.
- `.planning/phases/01-fluxo-cardio-e-alongamento/01-04-PLAN.md` — plano paralelo que edita
  `_INSTRUCOES_MOLDE`, usado para identificar e evitar a colisão de diff.
- `.planning/codebase/*.md`, `AGENTS.md` — mapas do codebase (atualizados 2026-08-08).

### Secondary (MEDIUM confidence)
- Nenhuma — não houve consulta a fontes externas (WebSearch/Context7) nesta pesquisa.

### Tertiary (LOW confidence)
- Nenhuma.

## Metadata

**Confidence breakdown:**
- REQ-04 (trilha do dado + onde ela pode se perder): HIGH — código lido ponta a ponta, do
  `TextInput` até `_montar_chamada_do_molde`, incluindo o commit que documenta a classe de bug.
- REQ-05 (anchor de calibração + colisão com Fase 1): HIGH — `_INSTRUCOES_MOLDE`,
  `_instrucao_dose_cardio`, `_montar_chamada_do_molde` e o plano 01-04 foram lidos linha a linha;
  o limite do schema (1-10%) foi confirmado no arquivo fonte.
- Derivação do nível de cardio e valores de teto por nível: MEDIUM — é decisão de produto
  (Claude's Discretion no CONTEXT.md), a pesquisa recomenda o padrão (função pura, testável) mas
  não define os números exatos dos tetos.

**Research date:** 2026-08-09
**Valid until:** 30 dias (domínio interno estável) — reabrir se `FORCA_USE_MOLDE_ARCHITECTURE`
mudar de valor em produção, ou se o plano 01-04 da Fase 1 mudar de forma a tocar
`_instrucao_dose_cardio`/`_dados_do_aluno_no_prompt` em vez de só `_INSTRUCOES_MOLDE`.
