# AGENTS.md — ForcaApp

Instruções de referência rápida para qualquer agente/IA (Claude, opencode, etc.) trabalhando neste repo.
Leia antes de operar o banco ou o app. Detalhes completos em `docs/AMBIENTE_SUPABASE.md`.

## Ambiente Supabase — DECISÃO DO DONO (18/07/2026)

- **O projeto Supabase do ForcaApp é UM só:** `forcaapp-hml`, ref **`zanqygwsgxkyjiuhrzju`**, org `ltmhaqdcvidzsbfkxmii`, conta `pedrohmarconato@gmail.com`.
- Apesar do sufixo `-hml` no nome, este é **o projeto de trabalho** do Forca. Trate como ambiente ativo.
- **NÃO existe produção separada.** Esqueça qualquer referência a "produção do Força com tabelas legadas `fato_registrotreino`/`dim_humor`" — essas tabelas **não existem** em projeto algum acessível (verificado em todos os schemas). O comentário em `supabase/migrations/0001_modelo_treino.sql` e o `docs/Supabase Snippet ...csv` aludem a um schema DW antigo que **não é** este projeto.
- **Projetos CarreraCampos** (`fgiqdjrzqhhlhvcnmcmj` / CarreraCamposAC e `scuyzplgxkaeiaswrdhm` / carreracampos-hml) são um **app jurídico diferente, outra conta**. Não toque neles ao trabalhar no Forca.

## Autenticação (nunca cole secrets no chat/commits)

- PAT do Supabase para a conta pedrohmarconato fica em `~/.supabase_pat` (chmod 600). Use via `export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase_pat)"`.
- Ao rodar `supabase login` (browser), selecione a conta **`pedrohmarconato@gmail.com`** — o default do browser costuma cair na conta CarreraCampos, que **não tem acesso** ao forcaapp-hml.
- Nunca imprima token/connection string/anon key. Variáveis de ambiente e arquivo `~/.supabase_pat` apenas.

## Estado das migrations

- Aplicadas e registradas em forcaapp-hml: **0000 → 0009** (`supabase migration list`: local = remote).
- Histórico reconciliado em 18/07/2026: 0007/0008 tinham sido aplicadas via SQL direto sem registro → registradas com `supabase migration repair --status applied 0007 0008`; a 0009 entrou pelo fluxo normal (`supabase db push`). **Nunca aplicar migration por SQL direto sem registrar** — quebra o `db push` seguinte.
- Reaplicar 0002/0004→0009 lá é **no-op** (idempotentes).

## Alinhamento DB × app — RESOLVIDO (18/07/2026)

Ver `docs/AMBIENTE_SUPABASE.md` para o histórico. Estado atual:
1. `questionario_usuario` criada (0008) + trigger de `updated_at` (0009); o app grava via **UPSERT** pelo cliente supabase (`src/services/api/questionnaireService.ts`) — re-fazer o questionário ATUALIZA a linha.
2. Env do frontend padronizada em `EXPO_PUBLIC_*` (`supabaseClient.js` incluído); `@env`/`react-native-dotenv` removidos do babel, do jest e das dependências.
3. `EXPO_PUBLIC_ENABLE_OFFLINE_MODE` documentada no `.env.example` (leitura estrita `=== 'true'`).

## Convenções do repo

- Não há `npm run lint`; qualidade via `npx tsc --noEmit`, `npx jest --runInBand`, `python3 -m pytest backend/tests -q` (não dependem do banco).
- Frontend: Expo/React Native. Backend: Flask (proxy Claude + persiste plano via RPC `save_training_plan`).
- Idioma de comunicação com o dono: pt-BR.
