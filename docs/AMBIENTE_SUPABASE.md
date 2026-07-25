# Ambiente Supabase — ForcaApp

Fonte de verdade sobre qual projeto Supabase o ForcaApp usa. Criado para evitar a confusão de ambiente que ocorreu em 18/07/2026.

> ⚠️ **ATUALIZAÇÃO 25/07/2026 — Correção de nomenclatura crítica.**
> A versão anterior deste doc (18/07/2026) dizia que `forcaapp-hml` era o "único ambiente
> ativo" porque, à época, só existiam `nfe_database` (pausado) e `forcaapp-hml`. Em 22/07/2026
> foi criado o `forcaapp-staging`, o que **inverteu a semântica**: o projeto com sufixo `-hml`
> é, na prática, **PRODUÇÃO** (tem usuários reais — ex.: `tonettoo@gmail.com`, cadastrado em
> 25/07). Em 25/07/2026 o projeto foi **renomeado** para `forcaapp-prod` para eliminar a
> armadilha. Detalhes abaixo.

---

## 🚨 AVISO DE SEGURANÇA — LEIA ANTES DE QUALQUER COMANDO

| Ref | Nome (25/07/2026) | Ambiente | Pode resetar/force-push? |
|---|---|---|---|
| `zanqygwsgxkyjiuhrzju` | **`forcaapp-prod`** | **PRODUÇÃO** (usuários reais) | ❌ **NUNCA.** Dados de clientes reais. |
| `mjdjtiujhwklchalquhc` | `forcaapp-staging` | HML/staging (somente testes) | ✅ Sim, descartável. |

**Comandos PROIBIDOS no ref `zanqygwsgxkyjiuhrzju` (PROD):**
- `supabase db reset` — apaga TODOS os dados.
- `supabase db push --force` (com migração destrutiva) — ignora warnings.
- Qualquer `DROP TABLE` / `TRUNCATE` / `DROP SCHEMA public CASCADE`.
- Rodar migrations experimentais diretamente no banco.

**Fluxo obrigatório para mudar schema em PROD:**
1. Desenvolver e testar a migration em `forcaapp-staging` primeiro.
2. Aplicar via `supabase db push` apontando para PROD **apenas após validação**.
3. Para mudança de dados (DML) em PROD: backup/PITR confirmado antes.

> O **ref não muda** quando o projeto é renomeado. URLs Supabase, anon keys, connection
> strings e todas as configurações do app continuam válidas — apenas o **display name**
> no dashboard mudou de `forcaapp-hml` para `forcaapp-prod`.

---

## Decisão registrada (atualizada 25/07/2026)

**O ForcaApp tem DOIS projetos Supabase:** `forcaapp-prod` (produção) e `forcaapp-staging` (homologação/testes).

| Campo | PROD | HML/staging |
|---|---|---|
| Nome do projeto | `forcaapp-prod` (era `forcaapp-hml`) | `forcaapp-staging` |
| Project ref | `zanqygwsgxkyjiuhrzju` | `mjdjtiujhwklchalquhc` |
| Criado em | 2026-07-17 | 2026-07-22 |
| Conta dona | `pedrohmarconato@gmail.com` | `pedrohmarconato@gmail.com` |
| Org | `ltmhaqdcvidzsbfkxmii` (Marconato) | mesma |
| Região | East US (North Virginia) | East US (North Virginia) |
| Usuários | **Reais** (ex.: `tonettoo@gmail.com`) | Apenas teste (`smoke-hml@forca.test`, `pedrohmarconato+e2e-*`) |
| App aponta para | ✅ Este (via `EXPO_PUBLIC_SUPABASE_URL`) | ❌ Não usado pelo app |

> **Atenção histórica:** qualquer referência antiga a "`forcaapp-hml`" nesta doc, em
> commits, scripts ou configs **significa o que hoje se chama `forcaapp-prod`** (mesmo
> ref `zanqygwsgxkyjiuhrzju`). Não confundir com o `forcaapp-staging` atual.

## Provas (coletadas 18/07 + 25/07/2026)

- 18/07: `supabase projects list` retornava `nfe_database` (pausado) + `forcaapp-hml` (≈ hoje `forcaapp-prod`). Não havia staging.
- 18/07: busca por `fato_registrotreino` e `dim_humor` em **todos os schemas** do prod: **0 resultados**. Essas tabelas legadas **não existem**.
- 18/07: `public` tinha 7 tabelas — exatamente o modelo 0000/0001 do Forca. Não há schema de DW legado.
- 25/07: `forcaapp-staging` (criado 22/07) tem apenas 3 perfis de teste (`smoke-hml@forca.test`, `pedrohmarconato@gmail.com`, `pedrohmarconato+e2e-*`) — **confirmado como ambiente de teste, não prod**.
- 25/07: `forcaapp-prod` tem usuários reais (ex.: `tonettoo@gmail.com`, onboarding incompleto) — **confirmado como produção**.
- 25/07: rename aplicado via Management API (`PATCH /v1/projects/zanqygwsgxkyjiuhrzju` body `{"name":"forcaapp-prod"}`); ref preservado, status `ACTIVE_HEALTHY`.

## O que NÃO é o ForcaApp (não mexa ao trabalhar aqui)

| Ref | Nome | Conta | Por que ignorar |
|---|---|---|---|
| `fgiqdjrzqhhlhvcnmcmj` | CarreraCamposAC | CarreraCampos | App jurídico, outra conta |
| `scuyzplgxkaeiaswrdhm` | carreracampos-hml | CarreraCampos | HML jurídico |
| `tljmfsgxvcardqhmnbwe` | nfe_database | pedrohmarconato | Paused; não é Forca |

## Autenticação

- PAT em `~/.supabase_pat` (chmod 600) → `export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase_pat)"`.
- `supabase login` via browser: **selecione `pedrohmarconato@gmail.com`**. O browser abre por padrão na conta CarreraCampos, que **não enxerga** os projetos forcaapp (link falha com "does not have the necessary privileges").
- Nunca imprimir tokens/connection strings/anon keys no chat ou commits.

## Estado das migrations (forcaapp-prod — ref `zanqygwsgxkyjiuhrzju`)

Todas aplicadas e registradas (`supabase migration list`: local = remote, 0000 → 0009).

> **Reconciliação de 18/07/2026:** 0007 e 0008 haviam sido aplicadas via SQL direto no
> dashboard **sem registro** no histórico (`Remote` vazio no `migration list`) — o
> `supabase db push` seguinte tentaria reaplicá-las. Registradas com
> `supabase migration repair --status applied 0007 0008`; a 0009 entrou pelo fluxo
> normal (`db push`), provando o fluxo restaurado. **Regra: migration nova só via
> `supabase db push`** (ou registrar imediatamente com `repair` se precisar de SQL direto).

| Migration | Conteúdo |
|---|---|
| 0000_profiles_base | Bootstrap de fresh-db: `profiles` + trigger `handle_new_user` + RLS |
| 0001_modelo_treino | `training_plans`, `planned_sessions`, `planned_exercises`, `planned_sets`, `session_logs`, `set_logs` + `profiles.current_plan_id` + RLS |
| 0002_rls_hardening | `WITH CHECK` valida posse do pai; índice único parcial `training_plans_one_active_per_user_idx` |
| 0003_execucao_idempotencia | Índices parciais (`set_logs_uniq_log_plannedset`, `session_logs_one_open_per_session`) + RPCs `start_session`/`finish_session` |
| 0004_save_set_log | RPC `save_set_log` (transacional, `FOR UPDATE`) |
| 0005_set_log_first_write_wins | `save_set_log`/`start_session` com first-write-wins nos retries |
| 0006_save_training_plan | RPC `save_training_plan` (plano+sheets atômico, `pg_advisory_xact_lock`, idempotente) |
| 0007_planned_sets_unicidade | Índice único `planned_sets_exercise_set_order_key (exercise_id, set_order)` (backstop cross-device do replanejamento) |
| 0008_questionario_usuario | Tabela de onboarding `questionario_usuario` (PK `usuario_id` → auth.users, RLS dono-próprio select/insert/update) |
| 0009_questionario_updated_at | Trigger `set_updated_at` em `questionario_usuario` (updated_at honesto no caminho de UPDATE/upsert) |

Reaplicar 0002/0004→0009 é **no-op** (já aplicadas; idempotentes).

Observações de segurança (revisão 18/07/2026):
- Os **grants remotos** de `authenticated` têm os 7 privilégios (inclui DELETE/TRUNCATE) em
  TODAS as tabelas do `public` — default de plataforma do Supabase (default privileges), não
  específico da 0008. A API é protegida pela RLS (e o PostgREST não expõe TRUNCATE); fica
  registrado, sem ação.
- `questionario_usuario` **não tem policy de DELETE** de propósito: RLS nega por default e o
  app não deleta onboarding.

---

# Gaps de alinhamento DB × App — TODOS RESOLVIDOS (18/07/2026)

Auditoria de 18/07/2026 cruzando migrations 0000–0007 vs código do app; os 3 gaps
foram fechados no mesmo dia (0008/0009 + PR de alinhamento). Mantido como histórico.

## Gap 1 — Tabela `questionario_usuario` inexistente [RESOLVIDO: 0008 + 0009 + upsert]

- **Sintoma:** o submit do questionário de onboarding falha (404 / `relation «public.questionario_usuario» does not exist`).
- **Causa:** `src/screens/QuestionnaireScreen.tsx:68` faz `POST {SUPABASE_URL}/rest/v1/questionario_usuario` (`saveQuestionnaireDataAPI`, linhas 67–102). **Nenhuma migration 0000–0007 cria essa tabela** (confirmado: grep retorna vazio).
- **Também documentado em:** `docs/modelo-dados.md:46,53`.
- **Correção FEITA:** migration `0008_questionario_usuario.sql` (tabela, PK `usuario_id` → auth.users, RLS dono-próprio, grants) + `0009_questionario_updated_at.sql` (trigger de `updated_at`). Payload da tela × colunas conferido campo a campo (13/13). A gravação virou **UPSERT pelo cliente supabase** (`src/services/api/questionnaireService.ts`, com testes): re-submissão ATUALIZA a linha em vez de morrer em 409 e descartar as respostas novas.

## Gap 2 — Variáveis de ambiente inconsistentes [RESOLVIDO: EXPO_PUBLIC_* em todo lugar]

- `src/config/supabaseClient.js:3` importa `{ SUPABASE_URL, SUPABASE_ANON_KEY } from '@env'` (via `react-native-dotenv`, lê pelo **nome literal** do `.env`).
- `.env.example:6-7` só declara **`EXPO_PUBLIC_SUPABASE_URL`** e **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** (prefixo `EXPO_PUBLIC_`).
- Consequência: copiar `.env.example` → `SUPABASE_URL`/`SUPABASE_ANON_KEY` resolvem `undefined` → `supabaseClient.js:7-9` lança `"Supabase URL or Anon Key is missing"` → **app não sobe**.
- Em paralelo, `QuestionnaireScreen.tsx:62,71,181` e `apiClient.ts:8` leem `process.env.EXPO_PUBLIC_*` (inline pelo `babel-preset-expo`) — só funcionam com o prefixo.
- **Correção FEITA:** `supabaseClient.js` lê `process.env.EXPO_PUBLIC_*` (mesmo padrão de `apiClient.ts`); resíduos do `@env` removidos (plugin `react-native-dotenv` do babel, `moduleNameMapper` do jest, `mocks/envMock.js` e a dependência). Nota: o babel-preset-expo INLINA `process.env.EXPO_PUBLIC_*` no transform — código testável não deve ler essas vars diretamente; use o cliente supabase compartilhado (mockável), como fazem os repositórios.

## Gap 3 — `EXPO_PUBLIC_ENABLE_OFFLINE_MODE` não documentada [RESOLVIDO]

- Usada em `src/services/api/trainingPlanService.ts:61` (leitura estrita `=== 'true'`). **Documentada no `.env.example`** com default `false`.

## Não-bloqueantes (limpeza / a validar)

- **Código Python morto:** `backend/wrappers/distribuidor_treinos.py` referencia tabelas `Fato_*`/`Dim_*` inexistentes nas migrations, mas **não é importável** (deps `utils.path_resolver`, `wrappers.supabase_client`, etc. não existem; `wrappers/__init__.py:4-7` declara quebrado). Isolar/remover.
- **Parâmetros do motor a validar com profissional de EF:** `src/engine/config.ts:4-8,39-43` marcados "PADRÃO A VALIDAR".
- **Geração de plano síncrona:** `trainingPlanService.ts:6-7` — TODO de tornar assíncrono/idempotente (a RPC 0006 já trata retry, mas a chamada HTTP ainda é síncrona de 180s).

## Veredito (atualizado 18/07/2026)

**Nenhum gap aberto.** O app está alinhado ao banco 0000–0009: onboarding
(`questionario_usuario` + upsert), perfis, plano, execução, adaptação
intra-sessão, replanejamento semanal e persistência via RPCs — tudo coberto
pelas migrations e referenciado de forma consistente pelo app. Pendências que
seguem em aberto (não são gaps DB × app): E2E em device e validação profissional
dos números de `ADAPT_CONFIG`/`REPLAN_CONFIG`.
