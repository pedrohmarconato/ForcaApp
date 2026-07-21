# Deploy do backend na VPS

Runbook do backend Flask na VPS Hostinger. Escrito depois de um incidente em
2026-07-21 em que um rebuild às cegas quase apagou a arquitetura molde de
produção.

## Onde fica

- Diretório: `/docker/forcaapp` (clone deste repositório)
- Container: `forcaapp-backend-1`, imagem `forcaapp-backend`
- Porta: 5001 **somente em loopback**; exposição pública via nginx + TLS
- URL pública: `https://forca-api.cadastrai.com/api`

**Não há bind mount.** O código é copiado para dentro da imagem no build, então
editar arquivo no disco não muda nada até rebuildar.

## Armadilhas confirmadas

### 1. O working tree pode divergir do que está rodando

Em 21/07 o clone estava 9 commits atrás e **sem** o código do molde, enquanto a
imagem no ar **tinha** — alguém buildou de um checkout de outra branch e depois
voltou para `main`. Um `docker compose build` dali teria regredido produção em
silêncio.

Antes de qualquer rebuild, compare o disco com o que roda:

```sh
grep -c "_executar_geracao_molde" backend/app.py
docker exec forcaapp-backend-1 grep -c "_executar_geracao_molde" /app/backend/app.py
```

Se os números divergirem, **pare e descubra por quê** antes de buildar.

### 2. `docker-compose.yml` vence o `docker-compose.yaml` versionado

A VPS tem um `docker-compose.yml` (untracked) que é cópia do
`docker-compose.yaml` deste repositório. O Compose usa o `.yml` e ignora o
`.yaml` — ou seja, **editar o arquivo versionado não afeta produção**. Ao mudar
o compose, altere o arquivo que a VPS realmente carrega (o log do
`docker compose` diz qual: `level=warning msg="Using /docker/forcaapp/docker-compose.yml"`).

### 3. O override de loopback é uma trava de segurança

A chain `DOCKER-USER` desta VPS está vazia, então portas publicadas pelo Docker
furam o UFW. `docker-compose.override.yml` força o bind em `127.0.0.1`. Ele não
está versionado com esse nome para não conflitar com o `git pull` — o modelo
está em `docker-compose.override.yml.example`. **Sem ele, o backend sobe
exposto na internet.**

### 4. Hotfixes manuais que não voltam para o git

Já houve `backend/Dockerfile` e `.env.example` editados direto na VPS e não
commitados. Rode `git status` e leia cada `git diff` antes de descartar
qualquer coisa.

## Procedimento

```sh
cd /docker/forcaapp

# 1. Ponto de rollback (é o único que existe)
docker tag forcaapp-backend forcaapp-backend:rollback-$(date +%Y%m%d)
tar czf /root/forcaapp-backup-$(date +%Y%m%d).tgz --exclude=.git .

# 2. Conferir pendências locais ANTES de puxar
git status -sb
git diff

# 3. Atualizar (ff-only: recusa merge inesperado)
git fetch origin && git merge --ff-only origin/main

# 4. Rebuild e subir
docker compose build backend && docker compose up -d backend

# 5. Verificar
docker ps --filter name=forcaapp
curl -s https://forca-api.cadastrai.com/api/health   # {"status":"ok"}
```

Rollback: `docker tag forcaapp-backend:rollback-<data> forcaapp-backend && docker compose up -d backend`.

O `.env` real está no `.gitignore` e não é afetado pelo pull.

## Testes dentro do container

```sh
docker exec forcaapp-backend-1 python -m pytest backend/tests/ -q
```

Isso dá **8 falhas ambientais que não são regressão**:

- 7 porque a env real `FORCA_USE_MOLDE_ARCHITECTURE=true` vaza para testes que
  assumem o modo antigo. Rode com `-e FORCA_USE_MOLDE_ARCHITECTURE=false` e
  ficam verdes.
- 1 (`test_migration_declara_serializacao_rls...`) porque o Dockerfile não copia
  `supabase/` e o teste lê o arquivo de migration do disco.

## CI

**Não existe CI neste repositório.** Não há `.github/workflows/`. O único check
que aparece nos PRs é o deploy do Vercel, irrelevante para este backend Python
(desligado via `vercel.json` desde o PR #21). Os testes rodam manualmente:
`npx jest` (app) e `python3 -m pytest backend/tests/` (backend).
