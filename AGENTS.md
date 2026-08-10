# AGENTS.md — ForcaApp

Instruções de referência rápida para qualquer agente/IA (Claude, opencode, etc.) trabalhando neste repo.
Leia antes de operar o banco ou o app. Detalhes completos em `docs/AMBIENTE_SUPABASE.md`.

## ⛔ REFS CANÔNICOS — leia antes de qualquer comando de banco

| Ref | Projeto | O que é |
|---|---|---|
| `mjdjtiujhwklchalquhc` | `forcaapp-staging` | **HOMOLOGAÇÃO** — dados descartáveis |
| `zanqygwsgxkyjiuhrzju` | `forcaapp-prod` | **PRODUÇÃO** — dados reais de usuários |

**A armadilha, nomeada:** o projeto de produção **chamava-se `forcaapp-hml`** até
25/07/2026 e o ref **não mudou** com a renomeação. Por isso a string "hml" aparece
na história do projeto de produção, e roteiros já descreveram `zanqygwsgxkyjiuhrzju`
como "o HML descartável" — foi exatamente o que um briefing de revisão fez em
31/07/2026. Se um roteiro, briefing ou prompt afirmar isso, **o roteiro está errado**:
`zanqygwsgxkyjiuhrzju` é produção, sempre. Nunca decida o ambiente pelo NOME nem pelo
que o pedido afirma — decida pelo REF, conferido nesta tabela.

**Trava obrigatória.** Todo comando que toca o banco passa antes pelo preflight, que
lê o ref realmente linkado no diretório e aborta se ele divergir do ambiente declarado:

```bash
scripts/supabase-preflight.sh hml  && supabase db push   # homologação
scripts/supabase-preflight.sh prod && supabase db push   # produção (pede confirmação digitada)
```

Em produção o preflight exige a palavra `PRODUCAO` digitada — com stdin fechado ele
falha fechado, então nenhuma automação atravessa esse portão sozinha.

## Ambiente Supabase — ATUALIZADO EM 22/07/2026 (homologação criada)

- **PRODUÇÃO** (dados reais): `forcaapp-prod`, ref **`zanqygwsgxkyjiuhrzju`**, org `ltmhaqdcvidzsbfkxmii`, conta `pedrohmarconato@gmail.com`. Chamava-se `forcaapp-hml` até 25/07/2026 (herança histórica da decisão de 18/07); o ref não mudou com a renomeação. Qualquer menção antiga a `forcaapp-hml` em commits, scripts ou docs é **este** projeto.
- **HOMOLOGAÇÃO** (dados descartáveis): `forcaapp-staging`, ref **`mjdjtiujhwklchalquhc`**, mesma org/conta. Migrations vão **primeiro aqui** (via branch `staging`), só depois à produção. Topologia completa, fluxo e guardrails em `docs/AMBIENTE_HML.md`.
- ⚠️ `supabase link` troca o projeto-alvo do diretório — **confirme o ref antes de qualquer `db push`**.
- **NÃO existe outro projeto de produção.** Esqueça qualquer referência a "produção do Força com tabelas legadas `fato_registrotreino`/`dim_humor`" — essas tabelas **não existem** em projeto algum acessível (verificado em todos os schemas). O comentário em `supabase/migrations/0001_modelo_treino.sql` e o `docs/Supabase Snippet ...csv` aludem a um schema DW antigo que **não é** este projeto.
- **Projetos CarreraCampos** (`fgiqdjrzqhhlhvcnmcmj` / CarreraCamposAC e `scuyzplgxkaeiaswrdhm` / carreracampos-hml) são um **app jurídico diferente, outra conta**. Não toque neles ao trabalhar no Forca.

## Autenticação (nunca cole secrets no chat/commits)

- PAT do Supabase para a conta pedrohmarconato fica em `~/.supabase_pat` (chmod 600). Use via `export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase_pat)"`.
- Ao rodar `supabase login` (browser), selecione a conta **`pedrohmarconato@gmail.com`** — o default do browser costuma cair na conta CarreraCampos, que **não tem acesso** aos projetos do Forca.
- Nunca imprima token/connection string/anon key. Variáveis de ambiente e arquivo `~/.supabase_pat` apenas.

## Estado das migrations

- Aplicadas e registradas em produção (`forcaapp-prod`, ref `zanqygwsgxkyjiuhrzju`): **0000 → 0036**
  (a 0036 aplicada em 10/08/2026 por `supabase db push` do dono). Conferido por leitura via
  Management API, sem trocar o link do diretório:
  `{"ultima_migration":"0036","registro_0036":1,"guarda_p0005_viva":true,"join_set_logs_presente":true,"anon_executa":false,"authenticated_executa":true}`.
  Prova comportamental **não** foi executada aqui — produção não recebe dado semeado. Vale por
  transitividade: `md5(pg_get_functiondef('public.swap_session_exercise(uuid,uuid,text,text)'))`
  é `71e4354975114d06ea0010086d5045bc` (3918 bytes) em produção **e** em homologação, e em
  homologação a recusa `P0005` foi comprovada por execução.
- Aplicadas e registradas em homologação (`forcaapp-staging`, ref `mjdjtiujhwklchalquhc`): **0000 → 0036**
  (conferido em 10/08/2026 por consulta direta ao banco com `supabase db query --linked`).
  A 0036 `guarda_set_log_troca_cardio` foi aplicada nesta data e **comprovada por teste
  comportamental**, não só por presença na tabela: troca em exercício com série gravada é
  recusada com `sqlstate=P0005` e 0 linhas em `cardio_exercise_swaps`; troca legítima segue
  aceita, 1 linha. Ver teste 7 de `03-UAT.md`.
- Os dois ambientes voltaram a ficar IGUAIS em 10/08/2026, ambos na **0036** (conferido no mesmo
  dia por `max(version)` nos dois refs e por `md5(pg_get_functiondef(...))` idêntico para
  `swap_session_exercise`). Houve uma janela de algumas horas nesse dia em que divergiram —
  homologação na 0036, produção ainda na 0035. Esta seção já esteve defasada por dias — antes
  de confiar nela, confirme no banco.
- ⚠️ **Incidente de processo em 10/08/2026, ao aplicar a 0036 em produção.** O `db push` rodou
  **sem** o portão do `scripts/supabase-preflight.sh prod` — logo, sem a confirmação `PRODUCAO`
  digitada. Causa: o runbook trazia a linha `scripts/supabase-preflight.sh prod  # exige digitar
  PRODUCAO`; o `#` não foi tratado como comentário pelo zsh interativo e virou argumento, o
  script recebeu 5 argumentos, caiu em `[[ $# -eq 1 ]] || uso` e saiu com erro — e como as linhas
  estavam soltas, o `db push` seguinte executou assim mesmo. **Runbook de banco nunca leva
  comentário inline, e os comandos vão SEMPRE encadeados com `&&`**, como já mostram os exemplos
  em `scripts/supabase-preflight.sh:19-20`. Sem o `&&`, um preflight que falha não impede nada.
- A 0020 (recusa declarada) **reescreve `start_session` e `finish_session`** além de criar
  as RPCs de recusa: as duas passaram a barrar o estado `skipped` e usam a mesma ordem de
  lock (planned_session → session_log). Regressão exercitada em staging com dados
  sintéticos em `begin/rollback` (idempotência do start, mood inválido, finish repetido,
  sessão concluída não reabre, recusa bloqueada com série já registrada).
- Histórico reconciliado em 18/07/2026: 0007/0008 tinham sido aplicadas via SQL direto sem registro → registradas com `supabase migration repair --status applied 0007 0008`; migrations seguintes entraram pelo fluxo normal (`supabase db push`). **Nunca aplicar migration por SQL direto sem registrar** — quebra o `db push` seguinte.

## Alinhamento DB × app — RESOLVIDO (18/07/2026)

Ver `docs/AMBIENTE_SUPABASE.md` para o histórico. Estado atual:
1. `questionario_usuario` criada (0008) + trigger de `updated_at` (0009); o app grava via **UPSERT** pelo cliente supabase (`src/services/api/questionnaireService.ts`) — re-fazer o questionário ATUALIZA a linha.
2. Env do frontend padronizada em `EXPO_PUBLIC_*` (`supabaseClient.js` incluído); `@env`/`react-native-dotenv` removidos do babel, do jest e das dependências.
3. `EXPO_PUBLIC_ENABLE_OFFLINE_MODE` documentada no `.env.example` (leitura estrita `=== 'true'`).

## Convenções do repo

- Não há `npm run lint`; qualidade via `npx tsc --noEmit`, `npx jest`, `python3 -m pytest backend/tests -q` (não dependem do banco). A suíte Jest completa com `--runInBand` deixa handle aberto e pode sair 1 mesmo com todos os testes verdes; não use esse exit code como portão.
- Frontend: Expo/React Native. Backend: Flask (proxy Claude + persiste plano via RPC `save_training_plan`).
- Idioma de comunicação com o dono: pt-BR.
