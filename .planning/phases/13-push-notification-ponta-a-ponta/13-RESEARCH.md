# Phase 13: Push notification ponta a ponta — Research

**Researched:** 2026-08-15
**Domain:** Web Push (VAPID) via `pywebpush` no Flask existente, Supabase (RLS), Workbox SW handlers, iOS 16.4+ Safari PWA
**Confidence:** MEDIUM — stack e padrão de código confirmados por spike executado (`13-SPIKE.md`, GO); a peça de infraestrutura de disparo (agendamento) tem uma **contradição de premissa** encontrada nesta pesquisa que precisa de decisão do dono antes do plano (ver `## CONTRADIÇÃO ENCONTRADA` logo após o Summary).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Spike pywebpush (critério 1 — obrigatório ANTES da implementação)**
- Escopo: provar localmente (a) envio real via `pywebpush`, (b) tratamento de
  `WebPushException` com endpoint fake retornando 410/404 (o caminho de remoção
  de subscription), (c) geração do par VAPID.
- Registro: `13-SPIKE.md` no diretório da fase, com código executado e saídas
  literais. A implementação principal NÃO começa sem o spike documentado.

**Dados e backend**
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

**Frontend (opt-in + service worker)**
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

**Jobs, envio e deploy**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUSH-01 | Infra de push ponta a ponta — botão com gesto síncrono, tabela `push_subscriptions` (RLS), envio via `pywebpush` no Flask, spike prévio de expiração/410 | Spike executado e documentado em `13-SPIKE.md` (GO); `## Standard Stack`, `## Code Examples` (migration, endpoints Flask), `## Package Legitimacy Audit` |
| PUSH-02 | Lembrete de treino no dia/horário configurado | `## CONTRADIÇÃO ENCONTRADA` (não existe cron nem campo de horário hoje) + `## Architecture Patterns` (proposta de scheduler em thread) + `## Open Questions` Q1/Q2 |
| PUSH-03 | Notificação quando o replanejamento semanal fica pronto | `## CONTRADIÇÃO ENCONTRADA` (replanejamento é client-side puro, sem job Flask) + `## Architecture Patterns` (gatilho via `reschedule_week_sessions`) + `## Open Questions` Q1 |
| PUSH-04 | Badge no ícone gated por permissão de push | `## Common Pitfalls` (Badging API iOS), `## Code Examples` (setAppBadge) |
| PUSH-05 | Toque na notificação abre a sessão ativa (1 toque) | `## Code Examples` (linkingConfig, notificationclick), verificado em `src/navigation/linkingConfig.ts` |
</phase_requirements>

## Summary

O spike técnico obrigatório (critério 1) está **executado e documentado em
`13-SPIKE.md` com veredito GO**: `pywebpush==2.1.2` (não `2.4.0`, como a
pesquisa de milestone havia assumido — corrigido nesta pesquisa) envia Web
Push real, levanta `WebPushException` com `response.status_code` acessível, e
o padrão "410/404 → apagar subscription" foi provado em 4 cenários distintos
(410, 404, 400, 201) contra um servidor HTTP fake local. A parte de dados
(migration `push_subscriptions`) e a parte de opt-in/SW do frontend seguem
diretamente o padrão já estabelecido no repo (RLS + GRANT DML explícito,
`alertShim`, `workbox-config.cjs` como pós-processamento do `dist/`).

**A parte que NÃO estava certa na pesquisa de milestone, e que esta pesquisa
corrige: não existe hoje nenhum mecanismo de agendamento/cron no backend, e o
"job de replanejamento" citado em `13-CONTEXT.md` e em
`.planning/research/ARCHITECTURE.md` não existe** — `job_manager.py` é
exclusivamente o gerenciador de jobs assíncronos de **geração de plano**
(disparado por `POST /api/generate-plan`, síncrono à ação do usuário), e o
replanejamento semanal (`src/engine/weeklyReplanner.ts`) é **puro, client-side,
sem I/O**, recalculado quando o aluno abre uma sessão
(`ActiveSessionScreen.tsx:279-280`, comentário "recalcular a semana AO ABRIR a
sessão"). Ver `## CONTRADIÇÃO ENCONTRADA` abaixo para a análise completa e as
opções concretas de correção — isto muda a forma de PUSH-02 e PUSH-03, não a
infra de envio (pywebpush) em si.

**Primary recommendation:** manter `pywebpush`/VAPID/tabela `push_subscriptions`
exatamente como travado no CONTEXT.md (nada muda ali); para os DOIS gatilhos de
domínio, resolver a contradição de premissa ANTES do plano — PUSH-03
(replanejamento) deve ser disparado por um NOVO endpoint Flask chamado pelo
CLIENTE logo após a RPC `reschedule_week_sessions` ter sucesso (evento real,
já existe, é do Postgres, não do Flask), e PUSH-02 (lembrete) precisa de um
scheduler novo, simples, em thread dentro do próprio processo Flask (mesmo
padrão já usado por `job_manager.py`/rate limiter em memória), porque não há
hoje nenhum processo periódico rodando no VPS.

## CONTRADIÇÃO ENCONTRADA (ler antes de planejar)

**Claim do CONTEXT.md (`13-CONTEXT.md:64-65`):** *"Lembrete (PUSH-02) e
replanejamento (PUSH-03): usar o mecanismo de job EXISTENTE do Flask (...);
PUSH-03 é gatilho no job de replanejamento que já existe."*

**Claim da pesquisa de milestone (`.planning/research/ARCHITECTURE.md:154-157,
177-178`):** *"replanejamento semanal roda como job assíncrono
(`services/job_manager.py` já existe para o job de geração de plano — mesmo
padrão serve para o job de replanejamento)"* e *"Lembrete de treino | Cron
horário no backend consulta quem tem treino hoje (...) | Replanejamento
semanal pronto | ... roda no fechamento de semana"*.

**O que a leitura direta do código mostra, nesta sessão:**

1. `backend/services/job_manager.py` **[VERIFIED: backend/services/job_manager.py:1-4]**
   — comentário literal no topo do arquivo: *"Gerenciador de jobs assíncronos
   de geração de plano. MVP: jobs rodam em thread dentro do processo Flask."*
   O único `JobStatus` do enum é sobre geração de plano
   (`CREATED, GERANDO_MOLDE, EXPANDINDO, SALVANDO, SALVO, ERRO`
   **[VERIFIED: backend/services/job_manager.py:17-23]**). Não há nada sobre
   replanejamento ou lembrete neste arquivo. É disparado só a partir de
   `POST /api/generate-plan` com `FORCA_USE_MOLDE_ARCHITECTURE=true`
   **[VERIFIED: backend/app.py:1055-1073]** — uma ação SÍNCRONA do usuário, não
   um agendamento.

2. `src/engine/weeklyReplanner.ts` **[VERIFIED: src/engine/weeklyReplanner.ts:1-12]**
   — comentário literal: *"Fase 6 — Replanejamento SEMANAL por regras. Puro
   (sem I/O)."* É uma função pura de TypeScript que roda **no dispositivo do
   aluno**, não no servidor.

3. `src/screens/ActiveSessionScreen.tsx:279-280` **[VERIFIED]** — comentário
   literal: *"Fase 6: recalcular a semana AO ABRIR a sessão (best-effort — o
   motor de replanejamento nunca impede o treino; sem rede, segue sem
   banner)."* O replanejamento é recalculado TODA VEZ que o aluno abre uma
   sessão — não existe um evento único "replanejamento fica pronto" persistido
   em lugar nenhum, a menos que o aluno CONFIRME a proposta.

4. `supabase/migrations/0027_agenda_e_reancoragem.sql:347-548` define a RPC
   `public.reschedule_week_sessions(uuid, int, jsonb)`
   **[VERIFIED: supabase/migrations/0027_agenda_e_reancoragem.sql:548]**
   (`grant execute on function public.reschedule_week_sessions(uuid, int,
   jsonb) to authenticated;`) — esta é a RPC que **aplica** a proposta de
   reencaixe (comentário do arquivo: *"Esta RPC aplica as mudanças
   atomicamente"*), chamada pelo cliente via `weeklyReplanRepository.ts`
   quando o aluno CONFIRMA o banner (`ReplanBanner.tsx`). É o único evento
   real, persistido e server-side (Postgres, via PostgREST — não passa pelo
   Flask) relacionado a "replanejamento".

5. Não existe **nenhum** mecanismo de cron/agendador/scheduler em lugar
   nenhum do repositório: `docker-compose.yml` sobe só o serviço `backend`
   (gunicorn, 1 worker/8 threads) **[VERIFIED: docker-compose.yml — grep
   "cron|scheduler|timer" sem resultado]**; `backend/Dockerfile` só roda
   `gunicorn ... backend.app:app` **[VERIFIED: backend/Dockerfile]**; não há
   `pg_cron`, Edge Function, nem serviço adicional em `supabase/config.toml`
   ou nas migrations **[VERIFIED: grep "pg_cron|cron.schedule" em supabase/
   sem resultado]**.

**Conclusão desta pesquisa (correção da premissa):**

- **PUSH-03 (replanejamento pronto)**: o evento real e já existente não é um
  "job de replanejamento" no Flask — é a RPC `reschedule_week_sessions`,
  chamada diretamente pelo CLIENTE ao Postgres/PostgREST quando o aluno
  confirma a proposta de reencaixe. O caminho mais simples e mais fiel ao
  padrão do projeto (que já tem "endpoint Flask autenticado" travado no
  CONTEXT.md) é: o cliente, IMEDIATAMENTE após `reschedule_week_sessions`
  retornar sucesso, chama um NOVO endpoint Flask autenticado (ex.: `POST
  /push/notify-replan-applied`) que dispara o `pywebpush` para aquele
  usuário. Isto não precisa de scheduler nenhum — é orientado a evento, síncrono
  à ação que já existe.
- **PUSH-02 (lembrete no dia/horário)**: este É genuinamente uma peça de
  infraestrutura NOVA — não existe nem cron nem campo de horário configurado
  (`questionario_usuario` só tem `dias_treino text[]`
  **[VERIFIED: supabase/migrations/0008_questionario_usuario.sql:19]**
  `dias_treino text[] not null default '{}'`, sem coluna de horário). Precisa
  de: (a) um scheduler simples em thread dentro do processo Flask existente
  (mesmo padrão MVP já documentado em `job_manager.py`, rodando
  `threading.Timer`/loop com `time.sleep` que acorda a cada N minutos), e (b)
  uma decisão sobre horário — não há UI nem coluna para o aluno configurar
  "horário" hoje; ver `## Open Questions` Q2.

**Isto não invalida a decisão do dono de usar Flask (não Edge Function) —
essa parte do CONTEXT.md e da pesquisa de milestone continua correta e é
reafirmada abaixo. O que muda é O QUE dispara o envio, não ONDE ele roda.**

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cálculo do replanejamento semanal (aderência, proposta) | Browser/Client | — | Já existe, puro, sem I/O (`weeklyReplanner.ts`) — fora de escopo desta fase, não recalcular no servidor |
| Aplicação do replanejamento (persistência) | Database (Postgres RPC) | — | `reschedule_week_sessions`, chamada direta cliente→PostgREST, `security invoker` |
| Disparo de push por replanejamento aplicado | API/Backend (Flask) | Client (chama o endpoint) | Cliente sabe que aplicou; Flask é quem tem a chave VAPID privada e fala com o push service |
| Disparo de push por lembrete de treino | API/Backend (Flask, scheduler em thread) | Database (leitura via anon key + RLS ou nova RPC) | Precisa rodar sem o app aberto — só o backend está "sempre ligado" (VPS) |
| Armazenamento de subscriptions | Database (Supabase, RLS) | API/Backend (leitura para envio) | Mesmo padrão de toda tabela do projeto: RLS por `auth.uid()` + GRANT explícito |
| Envio Web Push assinado (VAPID) | API/Backend (Flask, `pywebpush`) | — | Só o backend guarda a chave privada VAPID; nunca no cliente |
| Registro do Service Worker + handlers `push`/`notificationclick` | Browser/Client (SW) | CDN/Static (Vercel serve `dist/sw.js`) | Padrão já estabelecido na Fase 11 (Workbox `generateSW`) |
| Deep link da notificação → sessão ativa | Browser/Client (linkingConfig) | — | Rota `home/active-session/:sessionId` já existe e é recuperável por URL |
| Badge do ícone | Browser/Client (`navigator.setAppBadge`) | — | API do navegador, gated por permissão já concedida — nenhuma peça de servidor nova |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pywebpush` | **2.1.2** — `[VERIFIED: pip index versions pywebpush, executado no spike 13-SPIKE.md §1]` | Envia Web Push assinado (VAPID) a partir do Flask | Único pacote Python amplamente usado para Web Push; mantido pela org `web-push-libs` no GitHub |
| `py-vapid` | **1.9.4** — `[VERIFIED: pip show py-vapid, executado no spike]` | Gera/assina chaves VAPID (ES256) | Dependência do próprio `pywebpush`; mesma org mantenedora (`mozilla-services/vapid`) |

**Correção de versão:** a pesquisa de milestone (`.planning/research/SUMMARY.md:20,25` e
`STACK.md`) citava `pywebpush (2.4.0)`. **Essa versão não existe no PyPI** —
`pip index versions pywebpush` (executado nesta sessão) lista `2.1.2` como a
mais recente. Usar `pywebpush==2.1.2` no `requirements.txt`.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `http-ece` | 1.2.1 (transitiva de `pywebpush`) | Cifra o payload em `aes128gcm` | Automática, não precisa pinar separadamente |
| `cryptography` | (transitiva) | Primitivas EC/ES256 para VAPID | Automática |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pywebpush` (síncrono, `requests`) | `pywebpush` com `requests_session`/variante assíncrona (`aiohttp`, já vem como dependência transitiva) | O Flask do projeto é síncrono (gunicorn `gthread`, 1 worker); envio síncrono é suficiente para o volume (~20 usuários) e mais simples de depurar — não vale a complexidade assíncrona aqui |
| Infra própria (`pywebpush`) | SDK de terceiros (OneSignal, Firebase Cloud Messaging Web) | Explicitamente fora de escopo (`REQUIREMENTS.md` "Out of Scope") — decisão já travada |

**Installation:**
```bash
pip install pywebpush==2.1.2
# regenerar o lock (obrigatório — ver Common Pitfalls #1):
uv pip compile requirements.txt --generate-hashes --python-version 3.11 \
  --output-file requirements.lock.txt
```

**Version verification:** confirmado nesta sessão via `pip index versions
pywebpush` e `pip show pywebpush py-vapid` dentro do venv do spike
(`13-SPIKE.md §1`) — não apenas lido de doc.

## Package Legitimacy Audit

| Package | Registry | Age (publishedAt da versão atual) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `pywebpush` | PyPI | 2026-08-06 (release mais recente) | desconhecido (seam não retornou contagem) | `github.com/web-push-libs/pywebpush` | **SUS** (`too-new`, `unknown-downloads`) | Mantido — org GitHub real e reconhecida (`web-push-libs`, mantenedora de bibliotecas Web Push em várias linguagens); comportamento validado empiricamente no spike (`13-SPIKE.md`). Planner deve inserir `checkpoint:human-verify` antes do `pip install` em produção. |
| `py-vapid` | PyPI | 2026-01-05 | desconhecido | `github.com/mozilla-services/vapid` | **SUS** (`unknown-downloads`) | Mantido pela Mozilla Services — repo oficial. Mesmo tratamento: `checkpoint:human-verify` antes do install. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `pywebpush`, `py-vapid` — ambos com
repositório oficial legítimo e comportamento comprovado por execução real no
spike; o veredito `SUS` do seam decorre de `unknown-downloads` (não consegue
consultar contagem de downloads do PyPI) e `too-new` (última publicação
recente), não de sinal de pacote hallucinado/typosquat. Ainda assim, seguindo
o protocolo, o planner deve gatilhar `checkpoint:human-verify` antes de
`pip install` em produção (confirmar nome exato e origem uma última vez à mão).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│ Browser (PWA instalado)  │        │ Flask (backend/app.py)         │
│                          │        │                                │
│ 1. Perfil → botão        │        │ POST /push/subscribe          │
│    "Ativar notificações" │──HTTP─▶│  → upsert push_subscriptions  │
│    PushManager.subscribe()│       │    (via anon key + JWT usuário)│
│    (1ª ação síncrona)    │        │                                │
│                          │        │ DELETE /push/subscribe        │
│ 2. SW registrado          │        │  → delete própria subscription │
│    (Fase 11, sw.js)       │        │                                │
│    + push-handlers.js     │        │ POST /push/notify-replan-      │
│    (importScripts)        │        │  applied  [NOVO — PUSH-03]     │
│                          │        │  → chamado pelo CLIENTE logo   │
│ 3. Aluno confirma          │──HTTP─▶│    após reschedule_week_       │
│    ReplanBanner            │        │    sessions ter sucesso        │
│    → reschedule_week_      │        │  → lê push_subscriptions do   │
│      sessions (RPC direta  │        │    usuário → pywebpush.webpush│
│      Postgres/PostgREST)   │        │                                │
│                          │        │ Scheduler em thread [NOVO —     │
│                          │        │  PUSH-02] roda a cada N min:    │
│                          │        │  → SELECT alunos com treino     │
│                          │        │    hoje (dias_treino) sem       │
│                          │        │    sessão iniciada ainda        │
│                          │        │  → pywebpush.webpush por aluno  │
│                          │        │                                │
│ 4. SW recebe evento 'push'│◀─Web──│ webpush() assina com VAPID      │
│    → showNotification()   │ Push  │  privada (env VPS) e envia ao   │
│                          │Service│  push service do navegador      │
│ 5. Toque → 'notification  │        │                                │
│    click' → deep link     │        │ WebPushException 410/404 →      │
│    /home/active-session/  │        │  DELETE imediato da            │
│    :sessionId              │        │  subscription (spike provado)  │
└─────────────────────────┘        └──────────────────────────────┘
```

### Recommended Project Structure

```
backend/
├── app.py                        # + rotas /push/subscribe, /push/unsubscribe,
│                                  #   /push/notify-replan-applied
├── services/
│   ├── push_sender.py             # NOVO — wrapper fino sobre pywebpush.webpush(),
│   │                              #   trata WebPushException 410/404 → delete
│   └── push_reminder_scheduler.py # NOVO — thread daemon (mesmo padrão de
│                                  #   job_manager.py), roda a cada N min
requirements.txt                  # + pywebpush==2.1.2
requirements.lock.txt             # regenerado via uv pip compile (ver Pitfall #1)

supabase/migrations/
└── 0038_push_subscriptions.sql   # NOVO

public/
└── push-handlers.js              # NOVO — self.addEventListener('push', ...)
                                   #   + 'notificationclick' (importScripts)

workbox-config.cjs                # + importScripts: ['push-handlers.js']

src/
├── screens/ProfileScreen.tsx      # + botão "Ativar notificações"
├── services/pushSubscription.ts   # NOVO — PushManager.subscribe(), chama
│                                  #   POST /push/subscribe
├── services/weeklyReplanRepository.ts # + chamada a /push/notify-replan-applied
│                                  #   logo após reschedule_week_sessions
└── navigation/linkingConfig.ts    # já cobre active-session/:sessionId — reusar
```

### Pattern 1: `WebPushException` 410/404 → delete imediato (provado no spike)

**What:** capturar `WebPushException`, checar `exc.response.status_code in
(404, 410)`, apagar a linha de `push_subscriptions` correspondente.
**When to use:** toda chamada a `pywebpush.webpush()` no backend.
**Example** (`backend/services/push_sender.py`, baseado no padrão comprovado em `13-SPIKE.md §5`):
```python
from pywebpush import webpush, WebPushException

EXPIRED_STATUS_CODES = (404, 410)

def enviar_push(subscription_row: dict, payload: str, vapid_private_key: str, vapid_sub: str) -> bool:
    """Envia um push; devolve True se enviado, False se a subscription
    expirou (chamador deve apagar a linha). Repropaga qualquer outro erro."""
    subscription_info = {
        "endpoint": subscription_row["endpoint"],
        "keys": {
            "p256dh": subscription_row["p256dh"],
            "auth": subscription_row["auth"],
        },
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": vapid_sub},
            ttl=3600,
            headers={"Urgency": "normal"},
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in EXPIRED_STATUS_CODES:
            return False  # chamador apaga a subscription
        raise  # erro não relacionado a expiração: não mascarar
```

### Pattern 2: Migration de tabela nova com RLS + GRANT DML explícito (fecha a dívida do v1.0)

**What:** `create table` + `enable row level security` + policy `for all` (ou
policies separadas select/insert/delete) **+ `grant select, insert, delete on
table ... to authenticated`** — o passo que faltou em `cardio_goals` (0022) e
está sendo fechado agora.
**When to use:** migration `0038_push_subscriptions.sql`.
**Example**, seguindo literalmente o molde de `supabase/migrations/0022_metas_de_cardio.sql`
(estrutura de tabela) e `0037_swap_guard_codigo_oficial.sql` (GRANT + DO-block
de asserção):
```sql
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Subscriptions de Web Push (VAPID) do aluno. endpoint é UNIQUE porque o mesmo
   navegador/dispositivo produz sempre o mesmo endpoint para uma subscription
   ativa -- reassinar substitui em vez de duplicar.';

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- GRANT DML explícito: fecha a dívida conhecida de 0022 (cardio_goals nunca
-- recebeu isto) -- RLS sozinha NÃO basta, o GRANT de tabela é a camada
-- ANTES da RLS no Postgres.
revoke all on table public.push_subscriptions from public, anon;
grant select, insert, delete on table public.push_subscriptions to authenticated;

-- Asserção (mesmo padrão de 0037): confirma que a policy e os grants existem
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
  ) then
    raise exception 'asserção falhou: nenhuma RLS policy em push_subscriptions';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'push_subscriptions'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    raise exception 'asserção falhou: GRANT INSERT para authenticated ausente';
  end if;
end;
$$;
```
*(o `updated_at` trigger, se necessário para upsert, segue o molde
`touch_cardio_goal` de 0022 — decisão de detalhe do upsert é discricionária,
conforme CONTEXT.md.)*

### Pattern 3: Handlers do Service Worker via `importScripts` (Workbox `generateSW`)

**What:** `workbox-config.cjs` ganha a chave `importScripts`, que injeta
`importScripts('push-handlers.js')` no topo do `sw.js` GERADO — o arquivo
`push-handlers.js` em si **não passa pelo build** (é passthrough de
`public/`, igual `register-sw.js` hoje — `[VERIFIED:
public/register-sw.js:1-4]`, comentário literal: *"Script solto, sem
bundler — o passthrough de public/ do Expo copia este arquivo verbatim para
dist/"*).
**When to use:** adicionar os handlers `push`/`notificationclick` sem
reescrever o `sw.js` gerado.
**Example:**
```javascript
// workbox-config.cjs — adicionar ao objeto exportado existente
module.exports = {
  // ...todas as chaves já existentes, inalteradas...
  importScripts: ['push-handlers.js'],
};
```
```javascript
// public/push-handlers.js — NOVO, solto, sem bundler (mesmo padrão de
// register-sw.js). Registra os listeners DENTRO do escopo do service worker
// (self), não do documento.
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'ForçaApp', body: event.data ? event.data.text() : '' };
  }
  var title = data.title || 'ForçaApp';
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' }, // deep link — usado no notificationclick
  };
  // userVisibleOnly=true é uma PROMESSA feita no subscribe(): TODO push tem
  // que mostrar notificação, sem exceção -- silent push é proibido no iOS
  // Safari e revoga a subscription (ver Common Pitfalls #4).
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: url }); // app escuta e navega
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```
*(Fonte do padrão `push`/`notificationclick`: API padrão documentada — Push
API e Notifications API — `[CITED: webkit.org/blog/12945/meet-web-push/]`
confirma o requisito de sempre chamar `showNotification` — "silent push é
proibido, viola a confiança do usuário e revoga a subscription".)*

### Pattern 4: Deep link para a sessão ativa (PUSH-05, reusa infra existente)

**What:** a rota já existe e é recuperável por URL — nada novo a construir na
navegação, só o `notificationclick` precisa navegar para
`/home/active-session/:sessionId` (ou `/training/active-session/:sessionId`).
**Verificado:** `[VERIFIED: src/navigation/linkingConfig.ts:71-73]` —
```
Home: { path: 'home', screens: { ActiveSession: 'active-session/:sessionId', ... } }
```
e comentário do arquivo confirma que este path é "recuperável por URL nos
stacks Hoje (Home) e Plano (Training): um refresh no web ou um deep link
reabre a MESMA sessão pelo sessionId". O payload da notificação de lembrete
de treino deve incluir a URL completa (`/home/active-session/<sessionId>`) —
o `sessionId` precisa ser resolvido no momento do ENVIO (o servidor sabe qual
é a sessão planejada de hoje via `planned_sessions`; ver Open Questions Q3 se
o `sessionId` não estiver disponível de forma trivial no momento do disparo).

### Anti-Patterns to Avoid

- **Reimplementar `weeklyReplanner.ts` em Python no backend:** a lógica de
  aderência/escada de reencaixe é complexa (curva 100%/66%/45%, prioridade
  primary/secondary/accessory) e vive deliberadamente no cliente, puro, sem
  I/O. Duplicá-la no servidor para ter um "evento de replanejamento pronto"
  viola DRY e cria duas fontes de verdade que podem divergir. Usar o evento
  real que já existe (`reschedule_week_sessions`) em vez disso.
- **Rate limit/scheduler compartilhado entre múltiplos workers gunicorn:**
  o projeto já roda com **1 worker** de propósito (rate limit em memória —
  `[VERIFIED: backend/app.py:213-219]`, aviso literal no log de startup:
  "Rate limit em memória: contadores zeram a cada restart e NÃO são
  compartilhados entre workers"). O scheduler de lembrete (PUSH-02) herda a
  mesma limitação: rodar em thread única dentro do único worker é seguro
  hoje, mas documentar o mesmo aviso operacional (não duplicar disparos se o
  deploy algum dia for multi-worker).
- **`skipWaiting()`/reload automático disparado por push:** fora de escopo
  desta fase; não misturar o fluxo de atualização de SW (Fase 11) com o de
  push.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Assinatura VAPID (JWT ES256) | Gerar/assinar o JWT VAPID manualmente | `py-vapid`/`pywebpush` (`vapid_claims`) | `webpush()` já deriva `aud`/`exp` automaticamente do endpoint — provado no spike (`13-SPIKE.md §6`); reimplementar é superfície de erro criptográfico |
| Cifragem do payload (`aes128gcm`) | Implementar o envelope de criptografia do Web Push (RFC 8291) | `content_encoding='aes128gcm'` (default do `pywebpush`) | Padrão criptográfico não-trivial; `pywebpush` já cuida disso, confirmado funcionando no spike |
| Retry/backoff de envio de push | Loop de retry customizado | Nenhum — 410/404 é definitivo (apaga), outros erros devem logar e não retry síncrono automático (evita duplicar notificações) | Web Push não é fila garantida; o padrão do ecossistema é "fire and forget com limpeza de subscription morta", não retry agressivo |

**Key insight:** a única parte genuinamente "hand-rolled" nesta fase é o
scheduler de lembrete (PUSH-02) e o endpoint de notificação de replanejamento
(PUSH-03) — porque, como a `## CONTRADIÇÃO ENCONTRADA` mostra, nenhuma dessas
peças de infraestrutura já existe no projeto. Isso é esperado e aceitável
(volume pequeno, ~20 usuários, MVP em thread única) — não confundir com "não
hand-roll a parte criptográfica", que é a que realmente importa evitar.

## Common Pitfalls

### Pitfall 1: `requirements.lock.txt` desatualizado quebra o build Docker
**What goes wrong:** `backend/Dockerfile` instala com `pip install --require-hashes
-r requirements.lock.txt` **[VERIFIED: backend/Dockerfile — `RUN pip install
--no-cache-dir --require-hashes -r requirements.lock.txt`]**. Adicionar
`pywebpush` só em `requirements.txt` sem regenerar o lock faz o build de
produção FALHAR (hash ausente) — ou, pior, se alguém regenerar o lock à mão
sem `--generate-hashes`, o `--require-hashes` do Dockerfile recusa o
resultado.
**Why it happens:** o projeto tem lock explícito por decisão de segurança
(DEP-01, comentário no Dockerfile) — dois passos (editar `requirements.txt` E
regenerar `requirements.lock.txt`) em vez de um.
**How to avoid:** sempre rodar `uv pip compile requirements.txt
--generate-hashes --python-version 3.11 --output-file requirements.lock.txt`
(comando documentado no próprio Dockerfile) depois de editar
`requirements.txt`. `uv` já está disponível no ambiente (`uv 0.11.23`
confirmado nesta sessão).
**Warning signs:** build Docker falha com "hash mismatch" ou "no matching
distribution".

### Pitfall 2: subir a migration 0038 no projeto Supabase errado (produção)
**What goes wrong:** `supabase/.temp/project-ref` está hoje apontando para
**PRODUÇÃO** (`zanqygwsgxkyjiuhrzju`) — `[VERIFIED: conteúdo literal de
supabase/.temp/project-ref, lido nesta sessão]`. Qualquer `supabase db push`
sem relinkar primeiro aplica a migration direto em produção, pulando o
checkpoint staging×prod que o CONTEXT.md exige.
**Why it happens:** o projeto tem dois Supabase (staging
`mjdjtiujhwklchalquhc`, produção `zanqygwsgxkyjiuhrzju`) e o link é estado
mutável local, não parte do repo.
**How to avoid:** antes de QUALQUER comando `supabase` linkado nesta fase,
rodar `cat supabase/.temp/project-ref` e confirmar que é `mjdjtiujhwklchalquhc`
(staging); relinkar explicitamente se necessário; produção só depois do
checkpoint humano com verificação md5 (padrão fase 7 do v1.1).
**Warning signs:** `supabase db push` sem confirmação prévia do ref ativo.

### Pitfall 3: `PushManager.subscribe()` chamado depois de um `await` perde o gesto do usuário
**What goes wrong:** iOS Safari exige que a subscrição de push aconteça
dentro do MESMO gesto síncrono do clique — qualquer `await` (ex.: checar
permissão primeiro, buscar config do backend) antes do `subscribe()` faz o
navegador rejeitar silenciosamente, sem erro visível no console.
**Why it happens:** requisito de segurança da WebKit — `[CITED:
developer.apple.com/videos/play/wwdc2022/10098/, webkit.org/blog/12945/meet-web-push/]`
"a web app... can request permission to receive push notifications as long
as that request is in response to direct user interaction — such as tapping
on a 'subscribe' button".
**How to avoid:** já travado no CONTEXT.md (critério 2). `PushManager.subscribe()`
deve ser a primeira linha do handler de `onPress`, antes de qualquer
`fetch`/`await`. Buscar a `applicationServerKey` (VAPID pública) ANTES do
clique (ex.: já embutida via `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, disponível em
build time — não precisa de fetch).
**Warning signs:** clique no botão não abre o prompt de permissão nativo, sem
erro no console.

### Pitfall 4: silent push é proibido — toda mensagem `push` PRECISA mostrar notificação
**What goes wrong:** se o handler `push` do service worker não chamar
`showNotification()` (ex.: só atualiza um badge, ou faz uma chamada de rede
silenciosa), o navegador trata como violação de `userVisibleOnly` e pode
revogar a subscription.
**Why it happens:** `[CITED: webkit.org/blog/12945/meet-web-push/]` — "The
Web Push API is not an invitation for silent background runtime... Developers
must set the userVisibleOnly flag to true and fulfill that promise by always
showing a notification in response to a push message. Violations... result
in a push subscription being revoked."
**How to avoid:** todo `event.waitUntil(...)` do handler `push` (Pattern 3
acima) DEVE terminar em `self.registration.showNotification(...)`, sem
exceção — inclusive para o disparo de badge (PUSH-04): o badge é atualizado
JUNTO com uma notificação visível, nunca sozinho via push silencioso.
**Warning signs:** subscriptions começando a expirar (410) em taxa anormal
depois de um deploy que mudou o handler `push`.

### Pitfall 5: payload do push acima do limite prático (~4 KB) falha silenciosamente no push service real
**What goes wrong:** `pywebpush` não tem NENHUMA checagem de tamanho de
payload no código-fonte (`[VERIFIED: inspect.getsource(pywebpush) — nenhuma
constante de limite de tamanho encontrada, 13-SPIKE.md §6]`) — quem impõe o
limite é o push service do navegador (Apple/Mozilla/Google), não a lib. Um
payload grande passa despercebido em dev/CI e só falha contra o endpoint real
do iPhone.
**Why it happens:** o limite de ~4 KB é uma característica dos push services
reais (RFC 8030), não da lib — o spike não conseguiu reproduzir isso contra
um servidor fake local sem esse limite.
**How to avoid:** manter o payload da notificação pequeno — só `title`,
`body` curto, e uma `url` relativa para o deep link (não embutir o plano
inteiro ou histórico no payload).
**Warning signs:** notificação não chega no iPhone real mesmo com
`webpush()` retornando sucesso (201) — sintoma clássico de payload rejeitado
silenciosamente por trás do endpoint real, que o ambiente de dev não consegue
reproduzir (limitação de máquina sem toolchain nativa, já documentada em
`STATE.md`).

### Pitfall 6: campo "horário configurado" de PUSH-02 não existe no schema hoje
**What goes wrong:** o requisito PUSH-02 fala em "dia/horário configurado",
mas `questionario_usuario` só tem `dias_treino text[]`
**[VERIFIED: supabase/migrations/0008_questionario_usuario.sql:19]** — não
há coluna de horário nem tela para o aluno configurá-lo. Implementar o
scheduler assumindo que esse campo existe vai quebrar em runtime (coluna
inexistente) ou exigir inventar um valor sem base real.
**Why it happens:** nem o CONTEXT.md nem a pesquisa de milestone verificaram
o schema real antes de escrever o requisito.
**How to avoid:** decisão explícita necessária antes do plano — ver `##
Open Questions` Q2 (horário fixo padrão vs. nova coluna/tela de preferência).
**Warning signs:** nenhum — é um gap de dado, não um erro de runtime até
alguém tentar ler a coluna que não existe.

## Code Examples

### Endpoint Flask de subscribe (padrão `token_required` já existente)
```python
# Source: padrão confirmado em backend/utils/auth.py (token_required) e
# backend/app.py (handle_manual_plan como molde de endpoint autenticado)
from flask import g, jsonify, request

@app.route('/api/push/subscribe', methods=['POST'])
@token_required
def handle_push_subscribe():
    user_id = (g.user or {}).get('id')
    if not user_id:
        return jsonify({"error": "ID do usuário não fornecido."}), 400
    corpo = request.get_json(silent=True)
    if not isinstance(corpo, dict):
        return jsonify({"error": "Corpo JSON inválido."}), 400
    endpoint = corpo.get('endpoint')
    keys = corpo.get('keys') or {}
    p256dh, auth_key = keys.get('p256dh'), keys.get('auth')
    if not all(isinstance(v, str) and v for v in (endpoint, p256dh, auth_key)):
        return jsonify({"error": "subscription_info incompleto."}), 400
    # upsert via PostgREST com o access_token do usuário (mesmo padrão de
    # plan_repository.py: anon key + Authorization: Bearer <token>, RLS aplica)
    # ... POST /rest/v1/push_subscriptions com Prefer: resolution=merge-duplicates
    return jsonify({"status": "subscribed"}), 201
```

### `navigator.setAppBadge` gated por permissão (PUSH-04)
```javascript
// Source: padrão confirmado por webkit.org/blog/14112/badging-for-home-screen-web-apps/
// [CITED] — "the badge will only appear if the user has granted notifications
// permission" e "must come from a frame that is the same-origin as your
// top-level document".
if ('setAppBadge' in navigator && Notification.permission === 'granted') {
  navigator.setAppBadge(pendingCount).catch(() => {
    // falha silenciosa esperada em navegadores sem suporte — não bloqueia o app
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `pywebpush==2.4.0` (citado na pesquisa de milestone) | `pywebpush==2.1.2` (real, verificado via `pip index versions`) | Correção feita nesta pesquisa (2026-08-15) | `requirements.txt`/`requirements.lock.txt` devem pinar 2.1.2, não 2.4.0 |
| Push event imperativo (`self.addEventListener('push')` + `showNotification`) | Continua sendo o padrão suportado desde Safari 16.4 (2023); "Declarative Web Push" (WWDC25, iOS 18.x+) é uma alternativa ADICIONAL, não substitui o imperativo | WWDC25 (2025) introduziu o modelo declarativo como opção | Esta fase usa o modelo imperativo clássico (Pattern 3) — mais simples, já documentado desde 16.4, suficiente para ~20 usuários; não adotar o formato declarativo nesta fase |

**Deprecated/outdated:** nenhum — a stack de Web Push do iOS 16.4+ é recente
o bastante para não ter peças obsoletas ainda.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O scheduler de lembrete (PUSH-02) pode rodar como thread única dentro do processo Flask existente (mesmo padrão de `job_manager.py`), sem infra nova (Redis, Celery, cron externo) | Architecture Patterns / Anti-Patterns | Se o dono preferir um cron de verdade (systemd timer no VPS, por exemplo) em vez de thread-in-process, a implementação muda de lugar (script separado vs. módulo do Flask) — decisão de escopo, não técnica |
| A2 | Horário fixo (ex.: 08:00 America/Sao_Paulo) é aceitável como MVP para PUSH-02 na ausência de um campo de horário configurável pelo aluno | Common Pitfalls #6, Open Questions Q2 | Se o dono considerar "horário configurado" um requisito literal (o aluno escolhe a hora), é preciso nova coluna + tela — escopo maior que o assumido |
| A3 | PUSH-03 dispara quando o aluno CONFIRMA a proposta de replanejamento (`reschedule_week_sessions` bem-sucedida), não quando a proposta é meramente CALCULADA/exibida | CONTRADIÇÃO ENCONTRADA, Open Questions Q1 | Se a intenção original era notificar assim que a proposta fica pronta (mesmo sem confirmação), isso exigiria um mecanismo bem diferente (o cálculo é client-side e efêmero) — mudaria a arquitetura da notificação |
| A4 | O `sessionId` da sessão planejada de hoje está disponível para o backend consultar no momento do disparo do lembrete (via `planned_sessions`/`session_logs`), sem precisar reexecutar lógica de agenda complexa | Code Examples / Pattern 4 | Se a resolução do `sessionId` correto exigir a mesma lógica de `agendaDias.ts`/`weeklyReplanner.ts`, o backend precisaria de uma versão simplificada dessa lógica em Python — mais trabalho que o assumido |

**Nenhuma das claims acima é sobre segurança/dinheiro/compliance** — todas
são de escopo/arquitetura, adequadas para revisão do dono antes do plano.

## Open Questions

1. **PUSH-03: notificar na proposta ou na confirmação do replanejamento?**
   - O que sabemos: existe um evento server-side real e persistido
     (`reschedule_week_sessions`, aplicado quando o aluno CONFIRMA a
     proposta no `ReplanBanner`). Não existe nenhum evento server-side para
     "a proposta ficou pronta" (isso é só um cálculo client-side, efêmero,
     recalculado a cada abertura de sessão).
   - O que está incerto: `PUSH-03: "Aluno recebe notificação quando o
     replanejamento semanal fica pronto"` — "fica pronto" pode significar (a)
     quando o aluno confirma a proposta (evento real, fácil de disparar) ou
     (b) quando o sistema TEM uma proposta pronta para mostrar (não existe
     hoje como evento server-side sem duplicar `weeklyReplanner.ts` no
     backend).
   - Recommendation: usar a interpretação (a) — dispara no `reschedule_week_
     sessions` bem-sucedido — é a que não exige reimplementar lógica de
     domínio no backend. Confirmar com o dono antes do plano.

2. **PUSH-02: horário fixo (padrão) ou configurável pelo aluno?**
   - O que sabemos: hoje só existe `dias_treino` (array de dias da semana);
     nenhum campo de horário em `questionario_usuario` nem em
     `training_plans`.
   - O que está incerto: se "horário configurado" do requisito significa um
     valor fixo do sistema (ex.: sempre 08:00) ou uma preferência que o aluno
     define em algum lugar da UI (que precisaria ser construída nesta fase).
   - Recommendation: para o volume do projeto (~20 usuários, uso familiar),
     um horário fixo razoável (ex.: 08:00 America/Sao_Paulo, hardcoded) é
     MVP suficiente e evita escopo de UI extra não pedido explicitamente.
     Confirmar com o dono — se ele quiser configurável, isso é uma tela nova
     + coluna nova, fora do que o CONTEXT.md descreveu como "detalhes do
     upsert de subscription" (discricionário só cobre subscription, não
     preferência de horário).

3. **Como o backend resolve o `sessionId`/link exato de "a sessão de hoje" no momento do lembrete?**
   - O que sabemos: a rota de deep link (`active-session/:sessionId`) já
     existe e funciona para sessões já iniciadas/planejadas.
   - O que está incerto: se o aluno ainda não abriu a sessão de hoje, existe
     uma linha `planned_sessions`/sessão planejada com `scheduled_date =
     hoje` que o scheduler pode consultar diretamente (sem reimplementar
     `agendaDias.ts`), ou se a resolução da "sessão de hoje" depende de
     lógica de agenda mais complexa (reancoragem, semana congelada) que só
     existe no cliente.
   - Recommendation: o planner deve investigar o schema de `planned_sessions`
     (campo `scheduled_date`) durante o plano — provavelmente uma query
     direta (`scheduled_date = current_date and status = 'pending'`) resolve
     sem precisar da lógica completa de reancoragem, mas isto não foi
     verificado nesta pesquisa e deve ser tratado como tarefa de
     investigação do primeiro plano, não assumido.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pywebpush` (PyPI) | PUSH-01 envio de push | ✓ (instalado no venv do spike) | 2.1.2 | — |
| `py-vapid` (CLI `vapid --gen`) | Geração de par VAPID de produção | ✓ | 1.9.4 | — |
| `uv` (regeneração de lock) | Pitfall #1 | ✓ | 0.11.23 | `pip-compile` (pip-tools) como alternativa se `uv` não estiver no VPS — verificar no Dockerfile de build (usa `pip install` puro, não `uv`, então não é dependência de runtime) |
| Supabase CLI (relink staging/produção) | Aplicação da migration 0038 | Não verificado nesta sessão (fora do escopo do spike) | — | Comando `supabase` já é usado pelo projeto em fases anteriores (fase 7 v1.1) — assumir disponível |
| iPhone real com iOS 16.4+ e PWA instalado | UAT ponta a ponta (critérios 3-5) | ✗ (máquina de dev sem toolchain nativa) | — | Nenhum — já documentado em `STATE.md`/`PROJECT.md` como limitação estrutural; cada plano desta fase deve terminar com item de UAT explícito do dono no hardware real |

**Missing dependencies with no fallback:**
- Hardware iOS real para validar entrega de push de verdade (payload >4KB,
  comportamento exato de expiração do endpoint `web.push.apple.com`) — vira
  UAT do dono, não bloqueia o plano/implementação.

**Missing dependencies with fallback:**
- nenhuma outra identificada.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (frontend) | Jest 29.7.0 + `jest-expo` preset — `[VERIFIED: package.json "jest": {"preset": "jest-expo", ...}]` |
| Framework (backend) | pytest (`backend/tests/`, 29 arquivos de teste existentes — `[VERIFIED: ls backend/tests/]`) |
| Config file (frontend) | `package.json` chave `"jest"` (sem `jest.config.js` separado) |
| Config file (backend) | nenhum `pytest.ini`/`pyproject.toml` encontrado na raiz — pytest roda com defaults a partir de `backend/tests/conftest.py` |
| Quick run command (frontend) | `npx jest __tests__/serviceWorkerConfig.test.ts` (guard existente a estender) |
| Quick run command (backend) | `cd backend && python3 -m pytest tests/test_app_security.py -x` (molde de teste de endpoint autenticado existente) |
| Full suite command (frontend) | `npm test` |
| Full suite command (backend) | `cd backend && python3 -m pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | `POST /push/subscribe` upserta subscription autenticada | integration (pytest, mock Supabase) | `pytest backend/tests/test_push_subscribe.py -x` | ❌ Wave 0 |
| PUSH-01 | `webpush()` 410/404 → subscription apagada | unit (pytest, mock `pywebpush.webpush`) | `pytest backend/tests/test_push_sender.py -x` | ❌ Wave 0 |
| PUSH-01 | `workbox-config.cjs` inclui `importScripts` sem quebrar guard existente | unit (jest) | `npx jest __tests__/serviceWorkerConfig.test.ts` | ✅ (estender, não criar) |
| PUSH-02 | Scheduler identifica aluno com treino hoje e sem sessão iniciada | unit (pytest, lógica pura de seleção) | `pytest backend/tests/test_push_reminder_scheduler.py -x` | ❌ Wave 0 |
| PUSH-03 | Endpoint `notify-replan-applied` dispara push após chamada autenticada | integration (pytest) | `pytest backend/tests/test_push_replan_notify.py -x` | ❌ Wave 0 |
| PUSH-04 | `setAppBadge` só chamado com permissão concedida | unit (jest, mock `navigator`) | `npx jest __tests__/pushBadge.test.ts` | ❌ Wave 0 |
| PUSH-05 | `notificationclick` resolve a URL/rota da sessão ativa | unit (jest, se a lógica de resolução virar módulo testável) | `npx jest __tests__/pushHandlers.test.ts` | ❌ Wave 0 — `public/push-handlers.js` não passa pelo Metro/TS (solto), então a parte testável em Jest é só a lógica extraída para um módulo puro, se houver |
| PUSH-05 | Rota `active-session/:sessionId` continua recuperável por URL (regressão) | unit (jest, já existe suite de linking) | `npx jest __tests__/linking` (verificar nome exato do arquivo existente) | ✅ (regressão, não novo) |

### Sampling Rate
- **Per task commit:** rodar o teste específico do arquivo tocado (comandos acima)
- **Per wave merge:** `npm test` (frontend) + `cd backend && python3 -m pytest` (backend)
- **Phase gate:** as duas suítes completas verdes antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_push_subscribe.py` — cobre PUSH-01 (endpoint)
- [ ] `backend/tests/test_push_sender.py` — cobre PUSH-01 (tratamento 410/404, espelhando os 4 cenários provados no spike)
- [ ] `backend/tests/test_push_reminder_scheduler.py` — cobre PUSH-02
- [ ] `backend/tests/test_push_replan_notify.py` — cobre PUSH-03
- [ ] `__tests__/pushBadge.test.ts` — cobre PUSH-04
- [ ] `__tests__/pushHandlers.test.ts` (se a lógica de `push-handlers.js` for extraída para módulo testável) — cobre PUSH-05
- [ ] Extensão de `__tests__/serviceWorkerConfig.test.ts` para checar `importScripts: ['push-handlers.js']` — guard permanente, mesmo padrão das fases 9-12

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `token_required` (JWT Supabase via `Authorization: Bearer`) já usado em todos os endpoints Flask — reusar sem alteração para `/push/subscribe`, `/push/unsubscribe`, `/push/notify-replan-applied` |
| V3 Session Management | yes | Nenhuma sessão nova — reusa access_token do Supabase Auth existente |
| V4 Access Control | yes | RLS `auth.uid() = user_id` em `push_subscriptions` (Pattern 2) — um usuário nunca lê/apaga subscription de outro |
| V5 Input Validation | yes | Validar `endpoint`/`p256dh`/`auth` como strings não vazias no `/push/subscribe` (mesmo padrão de `_validate_context_fields` em `app.py`); `endpoint` deve ser uma URL http(s) válida (mesma checagem `_is_usable_http_url` já existente em `backend/app.py:477-492`, reusável) |
| V6 Cryptography | yes | Nunca hand-roll — `pywebpush`/`py-vapid` fazem a assinatura VAPID (ES256) e a cifra `aes128gcm`; chave privada VAPID só como env var do VPS, nunca no cliente/repo |

### Known Threat Patterns for esta stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Vazamento da chave privada VAPID (comitada por engano, exposta em log) | Information Disclosure | Env var só no VPS (mesmo padrão de `ANTHROPIC_API_KEY`/`SUPABASE_ANON_KEY` — nunca no `.env` comitado, nunca logada; `docker-compose.yml` já usa `${VAR:?defina...}` para obrigatórias) |
| Subscription de outro usuário sendo apagada/lida (IDOR) | Elevation of Privilege | RLS `auth.uid() = user_id` (Pattern 2) — mesma técnica de toda tabela do projeto |
| Endpoint `endpoint` malicioso (SSRF via `pywebpush` fazendo POST para URL arbitrária) | Tampering | Endpoint só é aceito se vier de `PushManager.subscribe()` real do navegador (URL do push service, ex.: `web.push.apple.com`), mas o backend NÃO valida a origem do endpoint hoje — considerar validar que o host do `endpoint` está numa lista conhecida de push services (Apple/Mozilla/Google) antes de aceitar no `/push/subscribe`, para não virar um proxy de SSRF autenticado |
| Payload de notificação com dado sensível (ex.: nome completo, detalhe de treino) exposto na tela de bloqueio | Information Disclosure | Manter o payload genérico ("Hora do treino!"), sem dado que o dono não queira visível na tela de bloqueio de um device compartilhado |

## Sources

### Primary (HIGH confidence)
- Execução real do spike (`13-SPIKE.md`) — `pip install`, `pip index versions`, `vapid --gen`, `webpush()` contra servidor HTTP real local, captura literal de `WebPushException` em 4 cenários (410, 404, 400, 201)
- Codebase do próprio repo, lido diretamente nesta sessão: `backend/app.py`, `backend/services/job_manager.py`, `backend/services/plan_repository.py`, `backend/utils/auth.py`, `backend/Dockerfile`, `docker-compose.yml`, `requirements.txt`, `requirements.lock.txt`, `src/engine/weeklyReplanner.ts`, `src/screens/ActiveSessionScreen.tsx`, `src/navigation/linkingConfig.ts`, `src/services/auth/secureStorage.ts`, `src/services/api/apiClient.ts`, `src/utils/alertShim.ts`, `src/screens/ProfileScreen.tsx`, `workbox-config.cjs`, `public/register-sw.js`, `__tests__/serviceWorkerConfig.test.ts`, `supabase/migrations/0008, 0022, 0027, 0037`, `supabase/.temp/project-ref`, `supabase/config.toml`, `vercel.json`

### Secondary (MEDIUM confidence)
- [Meet Web Push — WebKit blog](https://webkit.org/blog/12945/meet-web-push/) — requisito de `userVisibleOnly`/silent push proibido
- [Meet Web Push for Safari — WWDC22, Apple Developer](https://developer.apple.com/videos/play/wwdc2022/10098/) — requisito de gesto síncrono do usuário
- [Web Push for Web Apps on iOS and iPadOS — WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) — confirmação de suporte desde iOS 16.4
- [Badging for Home Screen Web Apps — WebKit](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/) — requisitos do `navigator.setAppBadge` (permissão + instalado + same-origin)
- [Learn more about Declarative Web Push — WWDC25, Apple Developer](https://developer.apple.com/videos/play/wwdc2025/235/) — confirma que o modelo declarativo é adicional, não substitui o imperativo
- `.planning/research/SUMMARY.md`, `ARCHITECTURE.md` (pesquisa de milestone, 2026-08-14) — reusado onde correto (stack Flask+pywebpush em vez de Edge Function), **corrigido** onde a premissa de "job de replanejamento existente" não bateu com o código real

### Tertiary (LOW confidence)
- Pacotes `pywebpush`/`py-vapid` classificados `SUS` pelo seam de legitimidade (`unknown-downloads`, `too-new`) — mitigado por execução real comprovada no spike e por serem mantidos por orgs GitHub reconhecidas (`web-push-libs`, `mozilla-services`)

## Metadata

**Confidence breakdown:**
- Standard stack (pywebpush/py-vapid): HIGH — versão e comportamento confirmados por execução real (spike), não só leitura de doc
- Arquitetura de disparo (scheduler/evento de replanejamento): MEDIUM — a correção da contradição está bem fundamentada em leitura direta do código, mas a solução recomendada (endpoint pós-RPC, scheduler em thread) ainda depende de confirmação do dono (Open Questions Q1/Q2)
- Pitfalls de iOS/Safari (gesto síncrono, silent push, badge): MEDIUM — fontes oficiais WebKit/Apple, mas nenhuma verificação empírica possível nesta máquina (sem toolchain nativa/iPhone real)
- Migration/RLS/GRANT: HIGH — padrão idêntico a 4+ migrations já existentes no repo, lidas e citadas com número de linha

**Research date:** 2026-08-15
**Valid until:** 30 dias (stack Web Push é estável; revalidar versão do `pywebpush` se o plano só for executado depois de setembro/2026)
