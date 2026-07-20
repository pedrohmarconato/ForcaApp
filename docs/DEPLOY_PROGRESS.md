# Deploy ForcaApp — Checkpoint

Última atualização: 2026-07-20 (sessão interrompida para OAuth do Vercel MCP).

## Resumo executivo

Backend Flask **subiu no VPS** e está saudável no loopback. Falta expor via HTTPS — bloqueado em DNS que precisa ser criado na **Vercel** (não na Hostinger).

## Ambiente confirmado

- **Repo ativo:** `/Users/phmarconato/Projects/ForcaApp` (branch local `chore/expo-sdk-54`, default `main`, remote `https://github.com/pedrohmarconato/ForcaApp.git`).
- **VPS Hostinger:** id `1494470`, hostname `pedrohmarconato.cloud`, IPv4 `187.77.225.31`, IPv6 `2a02:4780:6:e:f824::1`, KVM 4, Ubuntu 24.04, firewall group `238438`.
- **SSH:** key `~/.ssh/vonsaltiel_vps` (ED25519, `...aofh`) cadastrada na conta Hostinger como `forcaapp-macbook-pedro` (id `536164`) e attached ao VPS `1494470`. Login via:
  ```bash
  ssh -i ~/.ssh/vonsaltiel_vps -o IdentitiesOnly=yes root@187.77.225.31
  ```
- **Proxy reverso do VPS:** nginx (systemd) escutando em 80/443; certbot 2.9.0; modelo de vhost em `/etc/nginx/sites-available/nfe.cadastrai.com` e `.../vonsaltiel`.
- **DNS authoritative de cadastrai.com:** `ns1.vercel-dns.com` / `ns2.vercel-dns.com` (Vercel). **Zone file da Hostinger está órfão — mudanças lá não têm efeito público.**

## Estado dos itens do deploy

| Item | Status | Detalhe |
|---|---|---|
| Repo clonado local | ✅ | `~/Projects/ForcaApp` |
| `.env` local do app (EXPO_PUBLIC_*) | ✅ | já preenchido |
| `.env` do backend (VPS) | ✅ | injetado via MCP `createNewProjectV1` como `environment` do projeto Docker |
| Container Docker `forcaapp-backend-1` | ✅ UP | porta `0.0.0.0:5001` (firewall bloqueia externo); `/api/health` retorna `{"status":"ok"}` no loopback |
| Variáveis no projeto Docker | ✅ | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` (as 3 obrigatórias do compose) |
| SSH ao VPS | ✅ | via chave `forcaapp-macbook-pedro` |
| A record `forca-api.cadastrai.com` | ❌ na Hostinger errada | preciso criar na **Vercel** → `187.77.225.31` |
| vhost nginx `forca-api.cadastrai.com` | ⏸ pendente | criar após DNS propagar |
| TLS Let's Encrypt | ⏸ pendente | `certbot certonly --webroot -w /var/www/certbot -d forca-api.cadastrai.com` |
| Bind do container para loopback | ⏸ pendente (opcional) | hoje é `0.0.0.0:5001` (firewall bloqueia); alinhar com padrão `127.0.0.1:5001:5001` |
| Validação HTTPS | ⏸ pendente | `curl https://forca-api.cadastrai.com/api/health` |

## Próximos passos (ordem)

### 1. Autenticar Vercel MCP e reiniciar opencode
Fora desta sessão:
```bash
# na outra aba, dispara o flow OAuth
opencode mcp auth vercel    # ou o equivalente que abre browser Vercel
# depois reinicie esta sessão do opencode
```

### 2. Criar A record via Vercel MCP
Após reiniciar, pedir ao agente para usar tool `vercel_*` e criar:
- **Domain:** `cadastrai.com`
- **Type:** A
- **Name:** `forca-api`
- **Value:** `187.77.225.31`
- **TTL:** 60s

### 3. Validar propagação DNS
```bash
dig +short @1.1.1.1 forca-api.cadastrai.com A    # esperar retornar 187.77.225.31
```

### 4. Criar vhost nginx (rodar via SSH no VPS)
Script pronto para colar (HTTP-first para o certbot):
```bash
ssh -i ~/.ssh/vonsaltiel_vps -o IdentitiesOnly=yes root@187.77.225.31 'cat > /etc/nginx/sites-available/forca-api.cadastrai.com <<''EOF''
server {
    listen 80;
    listen [::]:80;
    server_name forca-api.cadastrai.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
EOF
mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/forca-api.cadastrai.com /etc/nginx/sites-enabled/forca-api.cadastrai.com
nginx -t && systemctl reload nginx'
```

### 5. Emitir certificado TLS
```bash
ssh -i ~/.ssh/vonsaltiel_vps -o IdentitiesOnly=yes root@187.77.225.31 \
  'certbot certonly --webroot -w /var/www/certbot -d forca-api.cadastrai.com \
   --email pedrohmarconato@gmail.com --agree-tos --no-eff-email -n'
```

### 6. Substituir vhost pela versão completa (HTTP + HTTPS)
```bash
ssh -i ~/.ssh/vonsaltiel_vps -o IdentitiesOnly=yes root@187.77.225.31 'cat > /etc/nginx/sites-available/forca-api.cadastrai.com <<''EOF''
server {
    listen 80;
    listen [::]:80;
    server_name forca-api.cadastrai.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name forca-api.cadastrai.com;

    ssl_certificate     /etc/letsencrypt/live/forca-api.cadastrai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/forca-api.cadastrai.com/privkey.pem;

    server_tokens off;

    # app.py tem MAX_CONTENT_LENGTH = 256 KB; 1M dá folga.
    client_max_body_size 1M;
    client_body_timeout  120s;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy same-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout    200s;
        proxy_read_timeout    200s;
    }
}
EOF
nginx -t && systemctl reload nginx'
```

### 7. Validar HTTPS
```bash
curl -sS https://forca-api.cadastrai.com/api/health   # espera {"status":"ok"}
```

### 8. Ajustar CORS_ORIGINS no projeto Docker (opcional)
Incluir origens de produção do app (Expo web build, se houver):
- Recriar projeto via `hostinger_VPS_createNewProjectV1` com `environment` adicionando `CORS_ORIGINS=https://forca-app.cadastrai.com,http://localhost:8081,http://localhost:19006`.

## Itens pendentes pós-deploy (não bloqueantes)

- **Bind do container para loopback**: hoje `0.0.0.0:5001` (firewall bloqueia porta 5001, então inerte). Para alinhar com o padrão dos outros projetos do VPS, ajustar o `docker-compose.yaml` do repo para `127.0.0.1:5001:5001` e re-rodar `createNewProjectV1`.
- **Atualizar `.env` do app** (frontend): trocar `EXPO_PUBLIC_API_BASE_URL` de `http://192.168.15.77:5001/api` para `https://forca-api.cadastrai.com/api` quando o backend estiver acessível por HTTPS.
- **Auth-rate edge cases**: o rate limit é em memória, single worker — okay para MVP, mas sinalizar se escalar.
- **Monitoramento**: adicionar uptime check para `https://forca-api.cadastrai.com/api/health`.

## Credenciais/secrets (NÃO estão aqui — local seguro)

- `ANTHROPIC_API_KEY` já está injetada no projeto Docker `forcaapp` do VPS via MCP.
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` (esta é pública/anon) também injetadas.
- PAT Supabase em `~/.supabase_pat` (não usado neste deploy).

## Referências de MCP usadas

- `hostinger_VPS_getVirtualMachinesV1` → id do VPS
- `hostinger_VPS_createNewProjectV1` → recriar projeto + inject env (aceita URL do GitHub como `content`)
- `hostinger_VPS_getProjectContainersV1` → checar container
- `hostinger_VPS_createPublicKeyV1` + `attachPublicKeyV1` → SSH access
- `hostinger_DNS_*` → **não adianta para cadastrai.com** (NS está na Vercel)
