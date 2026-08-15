---
status: testing
phase: 13-push-notification-ponta-a-ponta
source: [13-04-PLAN.md (3 checkpoints humanos), 13-01/13-02 WINDOWS entries #2-#3]
started: 2026-08-15T22:00:00Z
updated: 2026-08-15T19:20:00Z
---

## Current Test

number: 1
name: Pré-requisitos de infraestrutura (só você pode)
expected: |
  (a) supabase login com a conta do ForçaApp (o token desta máquina é da conta
  carreracampos — bloqueio registrado em .planning/WINDOWS.md #2-#3);
  (b) aplicar 0038_push_subscriptions.sql e 0039_push_reminder_idempotencia.sql
  em STAGING (mjdjtiujhwklchalquhc), validar, e depois em PRODUÇÃO com md5
  idêntico (padrão da fase 7 do v1.1);
  (c) gerar par VAPID de produção (comando documentado em 13-SPIKE.md) e
  configurar no VPS: VAPID_PRIVATE_KEY, VAPID_CLAIM_SUB,
  SUPABASE_SERVICE_ROLE_KEY (+ URL) — docker-compose já declara as envs;
  (d) configurar EXPO_PUBLIC_VAPID_PUBLIC_KEY no projeto Vercel e redeploy web;
  (e) deploy do backend no VPS (docker-compose build/up).
awaiting: user response

## Tests

### 1. Pré-requisitos de infraestrutura
expected: Migrations 0038/0039 em staging e produção (md5 igual); VAPID + service-role no VPS; EXPO_PUBLIC_VAPID_PUBLIC_KEY na Vercel + redeploy; backend deployado.
result: [pending] — PARCIAL em 15/08/2026: (a) supabase login com a conta certa do ForçaApp OK e (b) 0038/0039 aplicadas em staging E produção via db push com preflight, mesmo arquivo (md5 fd3ea691…/533c640c…), asserções passaram; WINDOWS.md #2/#3 fechadas. Restam (c) VAPID + envs no VPS, (d) EXPO_PUBLIC_VAPID_PUBLIC_KEY na Vercel + redeploy web, (e) deploy do backend. Atenção: supabase/.temp/project-ref ficou apontando para PRODUÇÃO.
  Avanço noturno 15/08: par VAPID gerado e guardado em ~/.forcaapp-vapid-prod; compose corrigido (repassa VAPID; service_role/VAPID opcionais com desligamento gracioso — commits e03c52f/641c819/ba31fe7); VPS sincronizado em ba31fe7 (container ainda antigo). (c)-(e) bloqueados pelo classificador de permissões da sessão remota (nenhuma mutação de produção por agente) + MCP Hostinger sem responder. Caminho de 1 comando: 13-INFRA-RUNBOOK.md.

### 2. Opt-in e subscription (PUSH-01)
expected: No PWA instalado, botão "Ativar notificações" no Perfil (ou o convite único) pede a permissão do iOS; após conceder, uma linha aparece em push_subscriptions do seu usuário. RLS: outro usuário não vê essa linha.
result: [pending]

### 3. Lembrete de treino às 8h (PUSH-02)
expected: Em dia com planned_session pendente, o lembrete chega ~8h (America/Sao_Paulo); reminder_sent_at preenchido; sem duplicata em reinício do backend.
result: [pending]

### 4. Notificação de replanejamento (PUSH-03)
expected: Ao confirmar um replanejamento no app, a push "replanejamento pronto" chega (best-effort).
result: [pending]

### 5. Toque → sessão (PUSH-05) e badge (PUSH-04)
expected: Tocar na notificação de treino abre o app direto na tela da sessão (1 toque do bloqueio ao registro). Com permissão concedida e treino pendente hoje, o ícone mostra badge.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
