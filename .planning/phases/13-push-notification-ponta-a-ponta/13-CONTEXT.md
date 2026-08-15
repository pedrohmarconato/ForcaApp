# Phase 13: Push notification ponta a ponta - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Mode:** Smart discuss (autônomo) — 4 áreas propostas, todas aceitas integralmente pelo dono

<domain>
## Phase Boundary

O aluno recebe notificações push relevantes (lembrete de treino, replanejamento
pronto) e um toque leva direto à sessão, com infra própria (`pywebpush`) e sem
SDK de terceiros. Requisitos: PUSH-01..PUSH-05.

Achados do scout (2026-08-15):
- Backend Flask em `backend/` (app.py + services/), rodando em VPS Hostinger via
  `docker-compose.yml`; sem `pywebpush` instalado ainda (requirements.txt na
  raiz do repo).
- Migrations Supabase até `0037` — a nova é `0038_push_subscriptions.sql`.
- **`supabase/.temp/project-ref` atual = `zanqygwsgxkyjiuhrzju` (PRODUÇÃO)** —
  qualquer comando linkado precisa conferir o ref antes (aviso do STATE.md);
  staging é `mjdjtiujhwklchalquhc`.
- O `sw.js` é GERADO por Workbox generateSW (fase 11) — handlers de push entram
  via `importScripts`, não editando o sw.js.
- Dependências técnicas satisfeitas: SW registrado (fase 11), alertShim (fase 9).

</domain>

<decisions>
## Implementation Decisions

### Spike pywebpush (critério 1 — obrigatório ANTES da implementação)
- Escopo: provar localmente (a) envio real via `pywebpush`, (b) tratamento de
  `WebPushException` com endpoint fake retornando 410/404 (o caminho de remoção
  de subscription), (c) geração do par VAPID.
- Registro: `13-SPIKE.md` no diretório da fase, com código executado e saídas
  literais. A implementação principal NÃO começa sem o spike documentado.

### Dados e backend
- Migration `0038_push_subscriptions.sql`: `user_id` FK auth.users, `endpoint`
  UNIQUE, `p256dh`, `auth`, timestamps; RLS por usuário (select/insert/delete
  próprios) **+ GRANT DML para `authenticated`** (fecha a dívida técnica
  conhecida do v1.0 — projeto novo não pode subir quebrado).
- Aplicação: STAGING primeiro (relink `mjdjtiujhwklchalquhc` com verificação
  explícita de `supabase/.temp/project-ref` antes de qualquer comando), teste,
  e PRODUÇÃO como CHECKPOINT do dono (padrão fase 7 do v1.1: md5 staging×prod).
- VAPID: par gerado no spike; chave privada = env do VPS (backend); pública =
  `EXPO_PUBLIC_VAPID_PUBLIC_KEY` no frontend.
- Endpoints Flask autenticados: `POST /push/subscribe` (grava/upserta) e
  `DELETE /push/subscribe` (remove); envio embutido nos jobs existentes.

### Frontend (opt-in + service worker)
- Handlers no SW: `importScripts: ['push-handlers.js']` no `workbox-config.cjs`
  (arquivo versionado em `public/`), com `push` (showNotification) e
  `notificationclick` (deep link + focus/openWindow).
- Opt-in: botão "Ativar notificações" no Perfil + convite ÚNICO via alertShim em
  momento oportuno; `PushManager.subscribe()` é a PRIMEIRA ação síncrona do
  clique (critério 2 — exigência de user gesture do iOS; sem await antes).
- Toque na notificação de treino: abre direto a rota da sessão ativa (deep link
  via linkingConfig) — 1 toque do bloqueio ao registro (PUSH-05).
- Badge (PUSH-04): `navigator.setAppBadge` gated por permissão concedida
  (iOS 16.4+ PWA).

### Resoluções pós-research (decididas pelo dono em 2026-08-15)
- A premissa "job de replanejamento no Flask" era FALSA (13-RESEARCH.md): o
  replanejamento roda no cliente (weeklyReplanner.ts puro) e não há scheduler no
  backend.
- PUSH-03: dispara NA CONFIRMAÇÃO — após a RPC reschedule_week_sessions ter
  sucesso, o cliente chama um endpoint novo do Flask que envia a push (evento
  real do fluxo existente).
- PUSH-02: horário FIXO MVP — lembrete às 8h (America/Sao_Paulo) nos dias de
  treino do questionário (dias_treino); scheduler novo em thread no processo
  Flask, no padrão do job_manager.py existente. Campo de preferência de horário
  fica para milestone futuro.
- pywebpush==2.1.2 APROVADA pelo dono (gate SUS revisto: org web-push-libs /
  ecossistema Mozilla; comportamento provado no 13-SPIKE.md) — entra pinada no
  requirements.txt sem checkpoint adicional de install.

### Jobs, envio e deploy
- Lembrete (PUSH-02) e replanejamento (PUSH-03): usar o mecanismo de job
  EXISTENTE do Flask (o researcher confirma qual é e onde vive; PUSH-03 é
  gatilho no job de replanejamento que já existe).
- Expiração (critério 5): resposta 410/404 no envio → DELETE imediato da
  subscription (comportamento provado no spike). Sem órfãs.
- Deploy do backend no VPS Hostinger: FORA das tasks automáticas — checkpoint do
  dono (docker-compose).

### Claude's Discretion
- Nomes exatos de arquivos/módulos, formato do payload da notificação, texto das
  notificações (pt-BR, tom do app), detalhes do upsert de subscription.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `workbox-config.cjs` (fase 11 — adicionar importScripts), `public/register-sw.js`,
  `__tests__/serviceWorkerConfig.test.ts` (guard a estender).
- `src/utils/alertShim.ts` (convite de opt-in), `src/navigation/linkingConfig.ts`
  (deep link da sessão), `src/store/activeSessionStore.ts`.
- `backend/app.py` + `backend/services/` (Flask; job de replanejamento existente).
- `supabase/migrations/0034..0037` (padrão de migration com guards do projeto).
- Padrões de teste: jest/RTL frontend; `backend/tests/` pytest.

### Established Patterns
- Guards permanentes por teste (fases 9-12); TDD red→green; conventional commits.
- Migration com verificação staging×produção (fase 7 do v1.1).
- CSP estrita; web-only por Platform.OS; Alert.alert proibido.
- Deploy web manual (`vercel deploy --prod`); backend via docker-compose no VPS.

### Integration Points
- `workbox-config.cjs` + `public/push-handlers.js` (novo).
- `supabase/migrations/0038_push_subscriptions.sql` (novo).
- `requirements.txt` (+pywebpush pinado) e `backend/app.py`/services (endpoints
  + envio nos jobs).
- Perfil (botão), alertShim (convite), linkingConfig (deep link), badge.

</code_context>

<specifics>
## Specific Ideas

- Critério 2 é literal: `PushManager.subscribe()` como primeira ação síncrona do
  clique — nenhum await antes (iOS descarta o gesto).
- UAT (critérios 3-4): lembrete no horário + replanejamento + toque abrindo a
  sessão — só no iPhone real do dono.
- Web Push no iOS: EXIGE PWA instalado (não funciona no Safari em aba) — os
  textos de erro/estado devem refletir isso.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
