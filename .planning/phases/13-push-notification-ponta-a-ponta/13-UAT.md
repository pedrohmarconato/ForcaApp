---
status: testing
phase: 13-push-notification-ponta-a-ponta
source: [13-04-PLAN.md (3 checkpoints humanos), 13-01/13-02 WINDOWS entries #2-#3]
started: 2026-08-15T22:00:00Z
updated: 2026-08-15T19:20:00Z
---

## Current Test

number: 2
name: Opt-in e subscription (PUSH-01)
expected: |
  No PWA instalado, botão "Ativar notificações" no Perfil (ou o convite único)
  pede a permissão do iOS; após conceder, uma linha aparece em
  push_subscriptions do seu usuário. RLS: outro usuário não vê essa linha.
awaiting: user response

## Tests

### 1. Pré-requisitos de infraestrutura
expected: Migrations 0038/0039 em staging e produção (md5 igual); VAPID + service-role no VPS; EXPO_PUBLIC_VAPID_PUBLIC_KEY na Vercel + redeploy; backend deployado.
result: passed — CONCLUÍDO em 15/08/2026. (a) supabase login conta ForçaApp; (b) 0038/0039 em staging E produção (md5 igual, asserções ok; WINDOWS #2/#3 fechadas); (c) par VAPID gerado (privada só em ~/.forcaapp-vapid-prod e no .env do VPS) + service_role + scheduler ligado via runbook executado pelo dono no terminal (13-INFRA-RUNBOOK.md); (d) EXPO_PUBLIC_VAPID_PUBLIC_KEY na Vercel (Sensitive) + deploy web `✓ Ready` aliased forca-app-six.vercel.app; (e) backend rebuildado no VPS. Verificação independente do Claude: health 200; POST /api/push/subscribe → 401 (rota nova viva); chave pública presente 1x no bundle AppEntry deployado; as 4 envs visíveis dentro do container (nomes); 0 linhas de exception/error nos logs. Nota: compose corrigido nos commits e03c52f/641c819/ba31fe7 (repasse VAPID + desligamento gracioso). Prova final do scheduler = lembrete de amanhã ~8h (teste 3). Atenção: supabase/.temp/project-ref aponta para PRODUÇÃO.

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
passed: 1
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
