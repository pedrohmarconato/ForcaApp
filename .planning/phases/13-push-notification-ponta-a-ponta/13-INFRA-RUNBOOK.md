# 13-INFRA-RUNBOOK — ligar o push em produção (1 comando do dono)

**Estado em 15/08/2026 (noite):** código completo do push está em produção no
sentido de REPO (VPS `/docker/forcaapp` sincronizado em `ba31fe7`), mas o
container ainda roda a imagem antiga: o classificador de permissões da sessão
remota bloqueou toda mutação de produção (escrita de credencial no `.env`,
rebuild do container) e o MCP da Hostinger estava sem responder. Migrations
0038/0039 JÁ aplicadas em staging e produção.

**Par VAPID de produção:** gerado e guardado nesta máquina em
`~/.forcaapp-vapid-prod/` (`private_b64u.txt` = valor da env, `private_key.pem`
= backup PEM, `public_b64u.txt` = pública). Round-trip verificado com
py_vapid. Pública (não é segredo):
`BMRwvO0Q-14ZXUh-KIBrMrw1sS7c_Vnk6p3DH3fqjpLP6KR_gSGWXUNhzS8oD_uHmzm7NQvNpFy0CIITV-4-0ic`

## O comando (terminal desta máquina; supabase login da conta ForçaApp já feito)

Ele busca a service_role (produção) sem exibir, monta o bloco de envs, anexa ao
`.env` do VPS com backup, faz o rebuild e confere o health:

```bash
S=~/.forcaapp-vapid-prod && env -u SUPABASE_ACCESS_TOKEN supabase projects api-keys --project-ref zanqygwsgxkyjiuhrzju --output json | /Users/phmarconato/ForcaApp/.venv/bin/python -c "import json,sys;d=json.load(sys.stdin);k=[x for x in d if x.get('name')=='service_role'][0];v=k.get('api_key') or k.get('apiKey');assert v;print(v)" > "$S/svc.txt" && chmod 600 "$S/svc.txt" && printf '\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=mailto:pedrohmarconato@gmail.com\nSUPABASE_SERVICE_ROLE_KEY=%s\nPUSH_REMINDER_SCHEDULER_ENABLED=true\n' "$(cat "$S/private_b64u.txt")" "$(cat "$S/svc.txt")" | ssh vonsaltiel-hml 'cp /docker/forcaapp/.env /docker/forcaapp/.env.bak-push-full && cat >> /docker/forcaapp/.env && chmod 600 /docker/forcaapp/.env && cd /docker/forcaapp && docker compose up -d --build 2>&1 | tail -3 && docker compose ps --format "{{.Name}} {{.Status}}"' && rm "$S/svc.txt" && curl -s -o /dev/null -w "health:%{http_code}\n" https://forca-api.cadastrai.com/api/health && echo BACKEND_LIGADO
```

Regras deste runbook (lição do incidente de 10/08 no AGENTS.md): sem comentário
inline, comandos encadeados com `&&`.

## Depois do `BACKEND_LIGADO`

Avisar o Claude ("backend ligado") para os passos restantes, todos sem segredo:
1. `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (a pública acima) no projeto Vercel +
   `npx vercel deploy --prod --yes` — segurado de propósito: publicar o botão
   de ativar notificações ANTES do backend ter os endpoints deixaria o
   subscribe quebrado para usuários.
2. Verificação: health, logs do scheduler (thread só sobe com a flag true),
   `POST /api/push/subscribe` respondendo 401 sem token (existência da rota).
3. Atualização do `13-UAT.md` e das memórias; UAT no iPhone
   (`/gsd-verify-work 13`).

## Alternativa sem teclado

Se a interface remota permitir trocar o modo de permissão da sessão do Claude
(sair do auto-classifier), o Claude executa tudo sozinho — os comandos já estão
prontos e testados até o ponto do bloqueio.
