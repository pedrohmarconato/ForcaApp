# Modelo de dados — ForcaApp

**Status:** DECISÃO PENDENTE (decisão de arquitetura/produto).
**Data do levantamento:** 17/07/2026.
**Fonte única de verdade do banco:** `docs/Supabase Snippet Função e Trigger para Perfis de Usuários.csv` (dump de `information_schema.columns` do projeto Supabase do ForcaApp, schema `public`).

> Este documento existe porque a Fase 2 (consolidação de código) revelou um bloqueio de **modelo de dados**: o frontend consulta tabelas que não casam com o banco real. A consolidação está correta e testada (tsc 0 / jest 32 / pytest 34), mas o PR #3 está como **draft** até esta decisão ser tomada. Nenhuma das opções abaixo foi implementada.

---

## 1. Estado atual do banco (27 tabelas `public`)

Modelo dimensional em **português** (estilo data-warehouse), bem formado:

- **Dimensões (catálogos, 10):** `dim_exercicio`, `dim_grupomuscular`, `dim_humor`, `dim_metodotreinamento`, `dim_modeloperiodizacao`, `dim_objetivo`, `dim_restricao`, `dim_tempodisponivel`, `dim_tiposessao`, `dim_variaveltreinamento`.
- **Associação (1):** `exercicio_grupomuscular`.
- **Fatos (15):** `fato_adaptacaotreinamento`, `fato_aquecimentodesaquecimento`, `fato_ciclotreinamento`, `fato_exercicioaquecimento`, `fato_exerciciosessao`, `fato_exerciciossessao` (ver §5), `fato_metricaprogresso`, `fato_microciclosemanal`, `fato_progressaoexercicio`, `fato_registroexercicio`, `fato_registrotreino`, `fato_sessaogrupomusuclar` (typo, ver §5), `fato_sessaotreinamento`, `fato_substituicaoexercicio`, `fato_usuariorestricao`.
- **Usuário (1):** `profiles` (8 colunas; **sem `current_plan_id`**).

`profiles` colunas: `id, username, full_name, avatar_url, email, onboarding_completed (bool), created_at, updated_at`.

---

## 2. Mapeamento frontend × banco

O frontend consulta tabelas em **inglês** (modelo transacional simples) que **não existem** com esses nomes. Mapeamento conceito a conceito:

### (a) `workouts` — lista de treinos na Home
- **Frontend espera:** `id, name, description, created_at` (e ideally filtro por usuário). Usado em `HomeScreen.tsx:64` `.from('workouts').select('*').order(...).limit(5)`.
- **Candidata no banco:** `fato_ciclotreinamento` (`ciclo_id, treinamento_id, nome, ordem, tipo, duracao_semanas, objetivo_especifico, observacoes, ...`).
- **Casam:** `ciclo_id→id`, `nome→name`, `created_at`.
- **Gaps:** **sem `usuario_id`** (não dá para listar por usuário); **sem `description`** (só `observacoes`/`objetivo_especifico`); a FK `treinamento_id` aponta para uma tabela **inexistente** (ver §4).

### (b) `training_sessions` — sessão de treino
- **Frontend espera:** `id, user_id, status, name, date`. Usado em `WorkoutDetailScreen.tsx:18` e `TrainingSessionScreen.tsx:22`.
- **Candidata no banco:** `fato_sessaotreinamento` (`sessao_id, microciclo_id, nome, descricao, duracao_minutos, nivel_intensidade, dia_semana (int), ordem_dia, calorias_estimadas, tempo_recuperacao_horas, tipo, tipo_sessao_id, ...`).
- **Casam:** `sessao_id→id`, `nome→name`, `descricao`.
- **Gaps:** **sem `usuario_id`**, **sem `status`**, **sem `date`** (há `dia_semana` como inteiro, não data). O usuário só aparece 4 níveis acima via cadeia quebrada.

### (c) `training_exercises` — exercícios de uma sessão
- **Frontend espera:** `id, training_session_id, name, sets, reps`. Usado em `WorkoutDetailScreen.tsx:26` e `TrainingSessionScreen.tsx:31`.
- **Candidata no banco:** `fato_exerciciosessao` (`exercicio_sessao_id, sessao_id, exercicio_id, ordem, series, repeticoes_min, repeticoes_max, peso_sugerido, percentual_rm, tempo_descanso_segundos, cadencia, metodo_treinamento_id, observacoes, ...`).
- **Casam:** `exercicio_sessao_id→id`, `sessao_id→training_session_id`, `series→sets`, `repeticoes_min/max→reps`.
- **Gap (pequeno):** `name` via **JOIN `dim_exercicio.nome`** (`exercicio_id`). É o melhor casamento do conjunto — resolve com uma view.

### (d) `questionario_usuario` — onboarding
- **Frontend envia (POST REST, `QuestionnaireScreen.tsx:68`):** `usuario_id, data_nascimento, genero, peso_kg, altura_cm, experiencia_treino, objetivo, tem_lesoes, lesoes_detalhes, dias_treino, inclui_cardio, inclui_alongamento, tempo_medio_treino_min`.
- **No banco:** `profiles` só tem `onboarding_completed` (bool). `dim_objetivo`/`dim_restricao`/`dim_tempodisponivel` são catálogos (não guardam por usuário). `fato_usuariorestricao` guarda só lesões. `fato_metricaprogresso` guarda peso/%gordura por data (progresso, não onboarding).
- **Gap (grande):** **não existe tabela de onboarding**. Campos demográficos (nascimento, gênero, altura, experiência, dias_treino, cardio, alongamento, tempo médio) **sem destino**. Só objetivo/tempo/lesões têm ancoragem parcial via catálogos.

### (e) `profiles.current_plan_id` — plano atual do usuário
- **Frontend escreve:** `PostQuestionnaireChat.tsx:158` `updateProfile({ onboarding_completed: true, current_plan_id: result.planId })`.
- **No banco:** `profiles` **não tem `current_plan_id`** (escrita falha silenciosamente ou erro). Não há tabela de "plano" referenciável — `treinamento_id` aparece como FK em 3 tabelas mas **nenhuma tabela tem `treinamento_id` como PK** (a âncora falta). `dim_modeloperiodizacao` é catálogo (não serve).
- **Gap:** precisa (1) criar `fato_treinamento` (PK `treinamento_id`, `usuario_id`, `nome`, `descricao`, `status`, datas) e (2) adicionar `current_plan_id uuid` em `profiles`.

---

## 3. Veredito: problema MISTO (3 camadas)

1. **Desalinhamento de nomenclatura/estrutura (maioria)** — tabelas existem e cobrem o domínio, mas pedem camada de tradução (views ou refactor). Ex.: `training_exercises` ↔ `fato_exerciciosessao` + `dim_exercicio`.
2. **Lacunas reais de colunas/âncoras (médio)** — `usuario_id` ausente em `fato_sessaotreinamento`/`fato_ciclotreinamento`/`fato_microciclosemanal`; `status` e `date` ausentes na sessão; cadeia usuário→treino **quebrada** (falta `fato_treinamento`).
3. **Conceitos sem tabela (alto)** — onboarding demográfico e `current_plan_id` inexistentes.

---

## 4. Cadeia de FKs e o "buraco" central

O modelo dimensional pressupõe a hierarquia:

```
fato_treinamento (treinamento_id, usuario_id)   ← TABELA AUSENTE
   └─ fato_ciclotreinamento (ciclo_id, treinamento_id)
        └─ fato_microciclosemanal (microciclo_id, ciclo_id)
             └─ fato_sessaotreinamento (sessao_id, microciclo_id)
                  └─ fato_exerciciosessao (exercicio_sessao_id, sessao_id)
```

Tudo de `fato_ciclotreinamento` para baixo **existe**. Mas `fato_treinamento` (a âncora que liga o plano ao **usuário**) **não existe** — é referenciada por FK mas não está no dump. **Por isso o frontend não consegue listar treinos por usuário:** o usuário não está ancorado em nenhum nível acessível. (`fato_registrotreino` tem `usuario_id`, mas só guarda treinos já *executados*, não planos.)

---

## 5. Problemas de qualidade do modelo (observados, não pedidos)

- **Tabela quase-duplicada:** `fato_exerciciosessao` (1 "s") vs `fato_exerciciossessao` (2 "s") — colunas diferentes (`nome` e `grupo_muscular_id` só na 2ª; `sessao_id` nullable e PK sem default na 2ª). Sinal de modelo não consolidado.
- **Typo de tabela:** `fato_sessaogrupomusuclar` ("musuclar").
- **`Fato_Treinamento` citado em `docs/Relatório Técnico Reconstruçãow3.md` mas ausente do banco** — divergência doc × realidade.

---

## 6. Opções de reconciliação (a decidir)

| # | Opção | Pró | Contra |
|---|---|---|---|
| **A** | **Simplificar:** criar as ~4 tabelas simples em inglês (`workouts`, `training_sessions`, `training_exercises`, `questionario_usuario`) + `current_plan_id` em `profiles`. Ignorar/remover o dimensional. | Frontend quase não muda; modelo proporcional ao app hoje. | Desperdiça o modelo dimensional já modelado; decisões futuras (progresso, adaptação) perdem base. |
| **B** | **Adotar o dimensional:** refactor do frontend para `fato_*`/`dim_*`; criar `fato_treinamento` (âncora usuário) + `current_plan_id` + tabela de onboarding. | Modelo robusto, prepara para progresso/adaptação. | Refactor grande do frontend (escopo de Fase 5+); modelo pode ser over-engineered para o estágio atual. |
| **C** | **Híbrido (views):** criar VIEWS (`workouts_view`, `training_sessions_view`, ...) com JOINs sobre o dimensional + preencher lacunas (`fato_treinamento`, colunas usuario_id/status/date). | Frontend quase não muda; dimensional preservado. | Views não geram dados — as lacunas (`usuario_id`, `status`, `date`) exigem dados reais nas colunas de qualquer forma. |
| **D** | **Decidir depois** (estado atual). | Evita escolha prematura. | Bloqueia PR #3 e a Fase 5 enquanto pendente. |

**Leitura técnica (não vinculante):** o modelo dimensional parece *over-engineered* para um app de treino personalizado + chat IA no estágio atual. A Opção A (simplificar) entregaria valor rápido; a B prepara o terreno para features de progresso/adaptação que o app ainda não tem. A escolha depende de **para onde o produto vai** (é só gerar plano via IA e mostrar? ou vai ter tracking de progresso, adaptação semanal, etc.?).

---

## 7. Bloqueios derivados

- **PR #3 (Fase 2 — Consolidação):** draft/bloqueado. A consolidação em si está correta (tsc 0 / jest 32 / pytest 34). Único ajuste pendente quando desbloquear: o teste de `WorkoutDetailScreen` tem falso positivo (injeta `{ trainingId }` em vez de `{ workout }` que a Home envia) — deve ser reescrito para reproduzir o contrato real, expondo o bug, antes do merge.
- **Bug Home→WorkoutDetail (contrato `{ workout }` × `{ trainingId }`):** sintoma do item (a)+(b) acima. Corrigir o nome do param é cosmético enquanto o modelo de dados não é definido.
- **Fases 3/4/5:** dependem do modelo estar definido (telas de treino, chat, plano precisam saber quais tabelas existem).
