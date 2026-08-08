# Codebase Concerns

**Analysis Date:** 2026-08-08

## Tech Debt

**Arquitetura dupla atrás de flag — `FORCA_USE_MOLDE_ARCHITECTURE`:**
- Issue: o backend mantém DOIS fluxos de geração de plano em produção: o antigo síncrono (`/api/generate-plan` direto via `TreinadorEspecialista`) e o novo (diretrizes → molde → expansor → job polling). O default é `false` em `docker-compose.yml` (linha 55) e `.env.example` — o caminho legado é o default.
- Files: `backend/app.py` (2028 linhas, os dois caminhos), `backend/wrappers/treinador_especialista.py`, `backend/wrappers/distribuidor_treinos.py`, `backend/services/plan_mapper.py`
- Impact: cada correção no domínio de plano precisa ser testada e mantida nos dois caminhos; `app.py` virou um monólito que acumula chat, plano, jobs, plano manual, prévia e cota.
- Fix approach: quando o fluxo molde estiver validado em produção, remover o caminho síncrono e a flag; quebrar `app.py` em blueprints por domínio.

**Modelo legado como default — `claude-opus-4-8`:**
- Issue: `docker-compose.yml` linha 54 (`PLAN_MODEL_NAME: ${PLAN_MODEL_NAME:-claude-opus-4-8}`) e `.env.example` documentam `claude-opus-4-8` como padrão da geração do molde; `app.py` linha 89 repete a referência no comentário. Geração aposentada não deve permanecer como config viva — o padrão ativo deve ser a geração atual (ex.: `claude-opus-5`), e o default de `FORCA_USE_MOLDE_ARCHITECTURE` deve subir para `true` quando o modelo novo for validado.
- Files: `docker-compose.yml:54`, `.env.example`, `backend/app.py:89`
- Impact: se a geração atual for retirada do ar pelo provedor, a geração de plano quebra em produção; além disso, mantém custo/latência da geração antiga.
- Fix approach: trocar o default para a geração vigente nos três pontos e registrar a decisão; revalidar `FORCA_STRUCTURED_OUTPUT`/`FORCA_PROMPT_MOLDE_V2` juntos (o retry dirigido depende da combinação).

**Rate limit, lock e jobs em memória (single-process):**
- Issue: `_rate_buckets`/`_rate_lock` (`backend/app.py:116-117`), trava `_plan_inflight` (`backend/app.py:119+`) e o job store (`backend/services/job_manager.py`, `_JOB_TTL_SECONDS=3600`) vivem em memória. O próprio código loga o aviso ("Rate limit em memória: contadores zeram a cada restart e NÃO são compartilhados entre workers").
- Files: `backend/app.py:58-118`, `backend/services/job_manager.py:78`
- Impact: com mais de um worker gunicorn, os limites efetivos multiplicam e a trava de geração não impede duplicação; restart do container derruba jobs em andamento (o app faz polling e recebe 404).
- Fix approach: Redis/Flask-Limiter para rate limit e lock; persistir jobs no Supabase (tabela já existe via migrations 0024/0025 para cota) ou aceitar explicitamente a limitação de 1 worker.

**Scripts npm obsoletos:**
- Issue: `android:dev`, `ios:dev`, `android:prod`, `ios:prod` usam `ENVFILE=` (padrão react-native-dotenv, removido do projeto segundo `babel.config.js` e `docs/AMBIENTE_SUPABASE.md`); `pods`, `pods:clean`, `pods:update` referenciam um diretório `ios/` que não existe no repo.
- Files: `package.json:6-19`
- Impact: comandos documentados falham; quem segue o `package.json` perde tempo.
- Fix approach: remover ou reescrever os scripts legados; manter só `start`, `test`, `backend:dev*`, `web`, `lint`.

**`npm run lint` quebrado:**
- Issue: `package.json:20` declara `"lint": "eslint . --ext .js,.jsx,.ts,.tsx"` e `lint-staged` roda `eslint --fix`, mas não existe NENHUM arquivo de configuração do ESLint no repo (nem `.eslintrc*`, nem `eslint.config.*`). O `AGENTS.md` diz "Não há npm run lint" — ou seja, o script existe mas não funciona. O `prettier` também roda sem config (defaults).
- Files: `package.json:20,103-104`, `AGENTS.md` (seção Convenções)
- Impact: sem lint rodando, o portão de qualidade depende só de `tsc --noEmit` e jest; os ~30 `eslint-disable` espalhados em `src/` (ex.: `react-hooks/exhaustive-deps` em 16 lugares) nunca são auditados.
- Fix approach: adicionar `eslint.config.js` mínimo (ou flat config com `@react-native/eslint-config` já instalado) e fazer o `lint` rodar no CI.

**`AuthContext.js` e `RootNavigator.js` em JS dentro de codebase TS:**
- Issue: `src/contexts/AuthContext.js` (492 linhas) e `src/navigation/RootNavigator.js` são JavaScript puro; o resto do projeto é TS com `npx tsc --noEmit` como portão. O AuthContext concentra fetchProfile, updateProfile, listener de auth, clock-skew e logout por expiração num único arquivo sem tipos.
- Files: `src/contexts/AuthContext.js`, `src/navigation/RootNavigator.js`
- Impact: mudanças de contrato (ex.: campos de perfil) não são verificadas por tipo nesses arquivos; risco de drift silencioso.
- Fix approach: migrar para TS em fases; começar tipando o contrato do contexto (`AuthContextValue`).

**Migrations gigantes e drift de documentação de ambiente:**
- Issue: `supabase/migrations/0026_treino_conjunto.sql` tem 2214 linhas/91 KB (domínio inteiro numa migration só); `0020` tem 23 KB. Além disso, o `AGENTS.md` declara "0000 → 0022" aplicadas nos dois ambientes enquanto o repo tem até 0030 e o 0031 está **untracked** (`git status` mostra `?? supabase/migrations/0031_sem_perna_upper_split_pedro.sql`) — a seção de estado de migrations já foi reconhecidamente defasada ("Esta seção já esteve defasada por dias").
- Files: `supabase/migrations/0026_treino_conjunto.sql`, `supabase/migrations/0031_sem_perna_upper_split_pedro.sql`, `AGENTS.md`
- Impact: migration grande é difícil de revisar e reverter; 0031 não commitada pode ser aplicada direto no banco (via SQL manual) sem registro — o histórico de 0007/0008 mostra que isso já aconteceu e quebrou o `db push` seguinte.
- Fix approach: commitar 0031 pelo fluxo normal (`supabase db push` registrado) e atualizar a seção de estado; para o futuro, fatiar migrations por assunto.

**Logging inconsistente — `logger` ignorado:**
- Issue: existe `src/utils/logger.ts` que suprime logs fora de `__DEV__`, mas a maioria dos módulos usa `console.*` cru (100+ ocorrências em `src/`; só `src/contexts/AuthContext.js` tem ~60). O `babel.config.js` não remove `console` em produção.
- Files: `src/utils/logger.ts`, `src/contexts/AuthContext.js`, `src/screens/QuestionnaireScreen.tsx`, `src/store/activeSessionStore.ts`
- Impact: em bundle de produção (PWA no browser), `console.log` de dados de saúde/perfil vaza para o console do navegador.
- Fix approach: substituir `console.*` por `logger` nos arquivos que logam dados de usuário, ou adicionar transform de strip de console no babel para produção.

**Versões inconsistentes:**
- Issue: `app.json` declara `"version": "1.0.0"`; `package.json` declara `"version": "0.1.0"`.
- Files: `app.json`, `package.json`

**CI com branch de feature hardcoded e exit code frágil:**
- Issue: `.github/workflows/session-contract.yml` dispara push em `branches: [main, fix/sessao-treinamento-refresh-adaptacoes]` — branch de feature antiga fixada no trigger. Além disso, o `AGENTS.md` documenta que `npx jest --runInBand` "deixa handle aberto e pode sair 1 mesmo com todos os testes verdes" — e é exatamente o comando que o CI roda.
- Files: `.github/workflows/session-contract.yml`, `AGENTS.md`
- Impact: CI pode falhar sem causa real (flaky), e a branch antiga no trigger é ruído.
- Fix approach: remover a branch do trigger; investigar o handle aberto (possível listener de Supabase nos testes) e usar `--forceExit` ou fechar conexões nos teardowns.

**Coverage sem portão:**
- Issue: `package.json` define `collectCoverageFrom` no config do jest mas não há `coverageThreshold`; o CI roda `npx jest --runInBand --silent` sem `--coverage`.
- Files: `package.json` (bloco `jest`), `.github/workflows/session-contract.yml`

## Known Bugs

Não foram encontrados bugs confirmados em aberto na varredura estática — o repo tem cultura forte de teste e trilha de review (achados A1-A3/N1-N5 de PRs resolvidos com testes de regressão). Pontos de atenção que podem virar bug:

**Classe de bug: falhas de persistência engolidas como "não-fatal":**
- Symptoms: `src/store/activeSessionStore.ts` tem 15 ocorrências de `console.warn('... não persistido (não-fatal):', e)` — rascunho de sessão, adaptação e fingerprint de recusa podem falhar ao gravar sem nenhum sinal para o usuário.
- Files: `src/store/activeSessionStore.ts` (linhas 334, 339, 650, 681, 891, 958, 1308, 1319, 1366, 1379, 1430, 1460, 1505)
- Trigger: falha intermitente de AsyncStorage/armazenamento (ex.: quota cheia, race em background) durante a sessão; o estado em memória segue correto, mas o app morre com a sessão de treino perdida no restart.
- Workaround: nenhum — é comportamento deliberado, mas sem telemetria para medir a frequência.
- Fix approach: ao menos logar com `logger.error` e expor contador de falhas; idealmente, tentar persistência pendente na próxima janela de rede.

**Bug potencial: geração duplicada com >1 worker:**
- Symptoms: trava `_plan_inflight` e rate limits são por processo; subir gunicorn com `--workers > 1` permite duas gerações concorrentes do mesmo usuário (custo em dobro) sem violar nenhum limite.
- Files: `backend/app.py:116-119`, `docker-compose.yml`
- Trigger: deploy com múltiplos workers + usuário tocando "gerar" em dois dispositivos.
- Fix approach: mover trava para store compartilhado ou fixar 1 worker (estado atual) e documentar a restrição.

## Security Considerations

**Dados de saúde/PII em logs:**
- Risk: `AuthContext.js` loga o payload de `updateProfile` (`console.log("[AuthContext] Tentando atualizar perfil para:", currentUserId, "com dados:", updates)` linha 245) e IDs de usuário em ~60 pontos; `QuestionnaireScreen.tsx` loga `userId` e "Dados salvos carregados" (linhas 210-249). São dados de questionário de saúde. Sem strip de console em produção (babel.config.js não remove), o PWA vaza isso no console do navegador do usuário.
- Files: `src/contexts/AuthContext.js:245`, `src/screens/QuestionnaireScreen.tsx:210-249`, `src/utils/logger.ts`
- Current mitigation: `logger.ts` existe mas não é usado nesses arquivos.
- Recommendations: trocar para `logger` (que suprime fora de `__DEV__`) ou remover os logs; nunca logar o corpo de `updates`.

**Sessão no `localStorage` (web):**
- Risk: no PWA, a sessão do Supabase cai em `localStorage` (sem o isolamento do Keychain/Keystore) — legível por qualquer script na origem.
- Files: `src/services/auth/secureStorage.ts` (constante `isWeb`/`webStorage`)
- Current mitigation: limitação consciente e documentada; CSP do `vercel.json` restringe `script-src 'self'` e `frame-ancestors 'none'`; `storageReady` + migração de sessão legada.
- Recommendations: manter CSP como está; revisar se o cookie `SameSite` não é opção melhor no web.

**HSTS pode sumir silenciosamente no nginx:**
- Risk: `add_header` no nginx não herda entre níveis — se um `location` do vhost declarar o próprio `add_header`, os headers do snippet somem.
- Files: `deploy/nginx/forca-api-security.conf`
- Current mitigation: o próprio arquivo documenta a armadilha e orienta incluir o snippet no `location` também.
- Recommendations: adicionar um smoke periódico que verifique presença de HSTS em produção (ex.: `curl -sI https://forca-api... | grep -i strict-transport`).

**Política de senha fraca no `supabase/config.toml`:**
- Risk: `minimum_password_length = 6` e `enable_confirmations = false` no config local (padrões do Supabase). Se o projeto remoto espelhar esses defaults, o cadastro aceita senha de 6 caracteres sem confirmação de e-mail.
- Files: `supabase/config.toml` (seção `[auth]`/`[auth.email]`)
- Current mitigation: `enable_signup` é o único controle ativo documentado.
- Recommendations: validar as settings reais do projeto remoto (`supabase projects list` + painel) e subir para 8+ caracteres com requisito misto se estiverem no default.

**Chave anon no bundle do cliente:**
- Risk: `EXPO_PUBLIC_SUPABASE_ANON_KEY` vai no bundle (esperado para Supabase); a segurança depende 100% de RLS. Postura verificada em `supabase/migrations/0002_rls_hardening.sql` (posse do pai em planned_sessions/session_logs/set_logs, índice único de plano ativo) e 0019/0023 (revoga RPCs anon legadas).
- Files: `src/config/supabaseClient.js`, `supabase/migrations/0002_rls_hardening.sql`, `supabase/migrations/0019_revoke_anon_reordenacao.sql`, `supabase/migrations/0023_revoke_anon_rpcs_legadas.sql`
- Current mitigation: RLS por `auth.uid()` com `with check` de posse do pai em todas as tabelas referenciadas; `max_rows = 1000` no `supabase/config.toml`.
- Recommendations: manter o padrão ao criar tabelas novas (a migration 0031 cria tabelas `_m0031_backup_*` — conferir que não ficam expostas via API).

**Backend CORS:**
- Risk: default é `http://localhost:8081,http://localhost:19006` (`backend/app.py:205`); o compose agora obriga `CORS_ORIGINS` (default seguro), mas rodar `python3 -m backend.app` localmente sem a env deixa o default de dev ativo.
- Files: `backend/app.py:203-207`, `docker-compose.yml:50`
- Current mitigation: incidente de 27/07 documentado no compose; variável obrigatória no compose.
- Recommendations: logar as origens efetivas no startup (o log de config ativa já loga modelos/flags — incluir origens CORS).

## Performance Bottlenecks

**Worker único bloqueado por chamada de IA longa:**
- Problem: o backend Flask roda chamadas à Anthropic com timeout de até 240s (`ANTHROPIC_TIMEOUT_SECONDS`) de forma síncrona no request handler; um usuário gerando plano ocupa o worker inteiro — chat, prévia e health degradam juntos.
- Files: `backend/app.py` (endpoints `/api/chat`, `/api/generate-plan`, `/api/manual-plan/preview`)
- Cause: arquitetura single-process deliberada (rate limit/lock/jobs em memória dependem disso).
- Improvement path: o fluxo de job polling já é o passo certo para o molde; estender o padrão ao preview ou aceitar a limitação e documentá-la.

**Monólitos de arquivo:**
- Problem: arquivos grandes concentram lógica e dificultam perfilamento e testes isolados.
- Files: `src/store/activeSessionStore.ts` (1570 linhas), `src/screens/PostQuestionnaireChat.tsx` (1507 linhas), `src/components/session/SessionPlayer.tsx` (1136), `src/screens/QuestionnaireScreen.tsx` (993), `src/screens/TrainingSessionScreen.tsx` (988), `src/services/sessionExecutionRepository.ts` (845), `backend/app.py` (2028)
- Cause: crescimento orgânico sem quebra por responsabilidade.
- Improvement path: extrair sub-stores/selectors e hooks; a prioridade é `activeSessionStore.ts` (lógica de sessão + replan + adaptação + joint em um store).

## Fragile Areas

**`activeSessionStore.ts` (1570 linhas):**
- Files: `src/store/activeSessionStore.ts`
- Why fragile: acopla sessão ativa, rascunho, replan, adaptação automática, recusa e tombstone num único zustand store; 15 falhas de persistência engolidas como não-fatal; `console.warn(e.message)` cru (linha 809).
- Safe modification: manter os testes `__tests__/activeSessionStore.test.ts` (35 KB) como rede de segurança; mudar uma invariante por vez.
- Test coverage: forte (store tem suíte dedicada), mas os caminhos de falha de persistência não são exercitados — nenhum teste simula falha do storage nos `não-fatal`.

**Realtime do treino conjunto:**
- Files: `src/services/jointSessionRealtime.ts`, `src/engine/jointSessionModel.ts`, `src/hooks/useJointSession.ts`
- Why fragile: reconciliação snapshot × eventos incrementais com selo/seq; corridas reais documentadas (A2/A3/N3/N5); depende de Supabase Realtime com reconexão e backoff.
- Safe modification: nunca mexer sem rodar `__tests__/jointSessionRealtime.test.ts` (25 KB) e `jointConcorrenciaCliente.test.tsx`; mudanças precisam de teste de corrida, não só de fluxo feliz.
- Test coverage: forte — é a área mais testada do app.

**Migração 0031 não commitada (data migration do plano do dono):**
- Files: `supabase/migrations/0031_sem_perna_upper_split_pedro.sql`
- Why fragile: altera dados de produção de UM usuário específico (plan_id hardcoded) com tabelas `_m0031_backup_*` permanentes; está fora do git (`git status` mostra untracked). Se for aplicada direto no banco sem registro, quebra o próximo `db push` (histórico 0007/0008).
- Safe modification: commitar e aplicar via `scripts/supabase-preflight.sh prod && supabase db push`; nunca editar as 24 sessões manualmente.

**Estado de migrations/ambiente em docs:**
- Files: `AGENTS.md` (seção "Estado das migrations" e "Ambiente Supabase")
- Why fragile: já ficou defasado por dias (reconhecido no próprio arquivo); a armadilha do ref `zanqygwsgxkyjiuhrzju` (produção com nome histórico "hml") já enganou um briefing de revisão em 31/07.
- Safe modification: confirmar sempre no banco (`supabase_migrations.schema_migrations`) antes de qualquer `db push`; o preflight (`scripts/supabase-preflight.sh`) é obrigatório.

## Scaling Limits

**Single-worker Flask:**
- Current capacity: 1 processo gunicorn (compose), rate limits por processo, jobs em memória com TTL de 1h (`backend/services/job_manager.py:78`).
- Limit: qualquer 2º usuário simultâneo em chamada de IA espera; restart perde jobs; >1 worker quebra os limites.
- Scaling path: Redis (rate limit + lock + job store) e então `--workers N`; ou manter 1 worker e documentar a restrição como cota do produto.

**Cota diária de IA:**
- Current capacity: `AI_DAILY_USD_LIMIT=5.00`/dia somando rotas + contagens por rota (250 chat / 30 consolidate / 15 plano) persistidas no Supabase (migrations 0024/0025).
- Limit: com N usuários ativos, o custo diário é N×5 USD; o bucket em memória não escala entre workers (ver acima).
- Scaling path: os números são env-tunáveis (`backend/services/ai_quota.py:46-57`); o limite real é orçamentário, não técnico.

## Dependencies at Risk

**`claude-opus-4-8` (default de PLAN_MODEL_NAME):**
- Risk: geração aposentada mantida como default vivo em `docker-compose.yml:54` e `.env.example`; o `.env.example` ainda instrui "NÃO usar claude-3-5-sonnet-20240620 — aposentado", mostrando que retirada de modelo já aconteceu e derruba requests.
- Impact: indisponibilidade/custo da geração de plano; viola a diretriz do dono de não deixar geração aposentada em config de projeto.
- Migration plan: trocar default para a geração vigente (com validação de saída no molde + retry dirigido, que já existem) e remover a referência ao modelo antigo.

**`patches/react-native+0.81.5.patch`:**
- Risk: patch-package sobre `mockComponent.js` do RN (optional chaining em `RealComponent.prototype?.constructor`). Qualquer upgrade de RN 0.81.5 precisa revalidar o patch.
- Files: `patches/react-native+0.81.5.patch`, `package.json` (`postinstall: patch-package`)
- Migration plan: verificar se o patch ainda é necessário a cada bump do RN; documentar o bug upstream que ele contorna.

**Dependências antigas de conveniência:**
- Risk: `lodash` e `date-fns@^2.30.0` (v3 é a linha atual) e `react-native-chart-kit@^6.12.0` (manutenção esparsa) — candidatas a substituição, sem pressa.
- Files: `package.json:34,45,55`

## Missing Critical Features

**Observabilidade/rastreamento de erros:**
- Problem: não há error tracking (Sentry etc.) nem métricas; o backend tem só logs de startup/config e warnings de rate limit (`backend/app.py:220-236`); falhas "não-fatal" do front não são contabilizadas.
- Blocks: medir frequência real das falhas de persistência engolidas em `activeSessionStore.ts`; detectar regressões de modelo/API antes do dono reclamar.

**Validação de padrões de treino por profissional:**
- Problem: `src/engine/config.ts` marca TODOS os percentuais/tetos como "PADRÕES A VALIDAR por um profissional de treino" (linhas 4, 49); `progressStats.ts:44,106` e `src/screens/ProgressScreen.tsx:291` marcam a seção "Dupla" de recordes como TODO do dono.
- Blocks: fechar o produto de treino conjunto (recordes da dupla em seção própria) e chancelar os limites de carga/série.

## Test Coverage Gaps

**Telas sem teste direto:**
- What's not tested: `src/screens/ManualWorkoutEditorScreen.tsx` (editor manual de treino avulso) e `src/screens/SessionHistoryDetailScreen.tsx` (detalhe do histórico de sessão) não têm nenhuma referência em `__tests__/` (verificado por grep).
- Files: `src/screens/ManualWorkoutEditorScreen.tsx`, `src/screens/SessionHistoryDetailScreen.tsx`
- Risk: regressões de edição/histórico passam despercebidas; o detalhe do histórico toca `sessionExecutionRepository.ts` (845 linhas).
- Priority: Médio — `SessionHistoryDetailScreen.tsx` é pequeno; `ManualWorkoutEditorScreen.tsx` é fluxo de entrada de dados do dono.

**Módulos de engine sem teste dedicado:**
- What's not tested: `src/engine/guardrails.ts` (1.4 KB), `src/engine/config.ts` (constantes) e `src/engine/sessionSummary.ts` não têm suíte própria; `sessionSummary` é consumido pelo fechamento de sessão (`TrainingSessionScreen.tsx`).
- Files: `src/engine/sessionSummary.ts`, `src/engine/guardrails.ts`
- Risk: baixo (código pequeno), mas `sessionSummary` alimenta o resumo que o usuário vê no pós-treino.
- Priority: Baixo.

**Serviços de storage sem teste direto (cobertura indireta):**
- What's not tested: `src/services/manualPlanDraftStorage.ts`, `src/services/sessionDraftStorage.ts`, `src/services/postQuestionnaireChatStorage.ts`, `src/services/manualPlanImport.ts` não têm arquivos de teste com o próprio nome; há cobertura indireta via `manualPlanDraft.test.ts`, `loadDraftCoercion.test.ts` e `saveWriteIntegration.test.ts`, mas sem isolamento dos caminhos de corrupção de payload.
- Files: `src/services/manualPlanDraftStorage.ts`, `src/services/sessionDraftStorage.ts`, `src/services/postQuestionnaireChatStorage.ts`
- Risk: médio — payload corrompido de rascunho quebra a tela de edição; a coerção de load é testada, a corrupção por versão de schema não.
- Priority: Médio.

**Harness e scripts de smoke sem testes:**
- What's not tested: `harness/*.mjs` e `scripts/*-smoke.mjs` são executados manualmente/CI e dependem de Chrome headless e ambiente HML; nenhum tem teste de sanidade local.
- Files: `harness/capture.mjs`, `harness/server.mjs`, `scripts/joint-realtime-smoke.mjs`
- Risk: baixo (ferramentas de evidência), mas quebram em silêncio se o contrato visual mudar.
- Priority: Baixo.

**CI sem gate de cobertura:**
- What's not tested: nenhum threshold de coverage no jest; o CI roda a suíte sem `--coverage` e com o exit code frágil documentado (`--runInBand` deixa handle aberto).
- Files: `.github/workflows/session-contract.yml`, `package.json`
- Risk: queda de cobertura passa despercebida.
- Priority: Médio.

---

*Concerns audit: 2026-08-08*
