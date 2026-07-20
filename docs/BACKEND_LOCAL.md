# Backend local — setup e checagem de prontidão

Este documento descreve como iniciar o backend Flask localmente e validar
liveness vs readiness. Para contexto de deploy/DNS/nginx, ver
`docs/DEPLOY_PROGRESS.md`.

## Pré-requisitos

1. Python 3.9+ com `python-dotenv`, `flask`, `flask-cors`, `anthropic`,
   `jsonschema`, `requests` e `gunicorn` instalados (ver `requirements.txt`).
2. Arquivo `.env` na raiz do repositório (NUNCA commitado — já está no
   `.gitignore`). Use `.env.example` como template.

## Variáveis do backend (NÃO vão no bundle do app)

- `ANTHROPIC_API_KEY` — chave da Anthropic (somente backend/secret manager;
  nunca com prefixo `EXPO_PUBLIC_`).
- `SUPABASE_URL` — mesmo projeto que `EXPO_PUBLIC_SUPABASE_URL`.
- `SUPABASE_ANON_KEY` — pode usar a mesma anon/publishable do app. Nunca
  use `service_role` no backend que valida JWT de usuário.
- `CORS_ORIGINS`, `FLASK_DEBUG`, `PORT`, `ANTHROPIC_TIMEOUT_SECONDS`,
  rate limits — ver `.env.example`.

## Ordem de inicialização

```bash
# 1) Ative o ambiente Python (venv/conda) e instale deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2) Configure o .env na raiz (sem commitar segredos)
cp .env.example .env
# edite .env preenchendo ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY

# 3) Inicie o Flask em um terminal
npm run backend:dev        # equivalente a: python3 -m backend.app

# 4) Em OUTRO terminal, valide liveness e readiness
curl -i http://127.0.0.1:5001/health        # processo vivo -> 200 {"status":"ok"}
curl -i http://127.0.0.1:5001/api/health     # mesma coisa, via /api
curl -i http://127.0.0.1:5001/api/ready      # config local ok? 200 ready | 503 not_ready

# 5) Inicie o Metro SEMPRE com --clear depois de mexer no .env
npx expo start --clear
```

`/api/ready` retorna 503 quando o `TreinadorEspecialista` não subiu (chave
Anthropic ausente/vazia) ou quando `SUPABASE_URL`/`SUPABASE_ANON_KEY` não
estão configuradas. Não faz chamada à Anthropic nem ao Supabase em cada
probe — apenas checa presença de configuração e inicialização local.

## URLs de desenvolvimento

O `EXPO_PUBLIC_API_BASE_URL` (vai no bundle do app) deve apontar para o
backend que o dispositivo consegue alcançar:

| Ambiente                      | URL                                          |
|-------------------------------|----------------------------------------------|
| Dispositivo físico na mesma LAN | `http://<IP-LAN-DO-MAC>:5001/api`          |
| Emulador Android              | `http://10.0.2.2:5001/api`                  |
| Simulador iOS no mesmo Mac    | `http://localhost:5001/api`                 |

Para descobrir o IP LAN do Mac: `ipconfig getifaddr en0` (Wi-Fi) ou `en1`.

Requisitos de rede local:
- Mac e celular na mesma LAN (mesmo roteador / VLAN).
- Sem client isolation (configuração comum em Wi-Fi de hotel/escritório).
- Firewall/VPN não pode bloquear a porta 5001.

## Por que `.env` exige reiniciar o Metro

Variáveis `EXPO_PUBLIC_*` são inlinadas no bundle no momento do build do
Metro. Hot reload NÃO pega o novo valor. Sempre que mudar `.env`:

```bash
# encerre o Metro (Ctrl+C) e reinicie com cache limpo
npx expo start --clear
```

## Diferença entre liveness e readiness

- **Liveness (`/health`, `/api/health`)**: indica apenas que o processo
  Flask está vivo e respondendo. Não checa configuração nem dependências.
- **Readiness (`/api/ready`)**: indica se a CONFIGURAÇÃO LOCAL do backend
  foi carregada para servir as rotas de IA/chat: chave Anthropic presente e
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` com URL http(s) utilizável (esquema +
  hostname validados localmente). O probe NÃO faz chamada externa — uma
  chave presente porém inválida só aparece na primeira chamada real, que a
  UI trata com fallback. O app usa este endpoint em
  `testClaudeApiConnection()` para decidir se mostra o fallback
  "Assistente IA indisponível".

## O que NÃO fazer

- Não hardcode `192.168.x.y` no fonte versionado — apenas no `.env`.
- Não habilite cleartext HTTP em build release; produção usa HTTPS.
- Não use `service_role` no backend que valida JWT de usuário.
- Não coloque `ANTHROPIC_API_KEY` em nenhuma variável `EXPO_PUBLIC_*`.
- Não considere o deploy corrigido enquanto `forca-api.cadastrai.com`
  responder com `server: Vercel` / `x-vercel-error: DEPLOYMENT_NOT_FOUND`.
