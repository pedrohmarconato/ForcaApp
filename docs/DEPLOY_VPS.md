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

### 2. O compose que produção carregava não estava no git (resolvido em 27/07/2026)

O Compose prefere `docker-compose.yml` a `docker-compose.yaml` quando os dois
existem. Enquanto o versionado se chamava `.yaml`, a cópia `.yml` largada em
`/docker/forcaapp` vencia em silêncio: **mudança feita no arquivo versionado
nunca chegava em produção**. Homologação não tinha essa cópia, então rodava o
arquivo certo — foi por isso que o CORS de homologação estava correto e o de
produção ficou no default de desenvolvimento (ver armadilha 5).

O versionado agora se chama `docker-compose.yml` e ocupa o nome vencedor. Uma
edição manual na VPS passa a aparecer como arquivo modificado no `git status`,
em vez de virar um arquivo paralelo invisível.

Para conferir que não voltou a divergir, o `docker compose` avisa quando há mais
de um candidato:

```sh
docker compose config 2>&1 >/dev/null | grep -i "Found multiple"
# silêncio = só existe um compose no diretório
```

### 3. O override de loopback é defesa em profundidade — não a única trava

A chain `DOCKER-USER` desta VPS está vazia, então portas publicadas pelo Docker
furam o UFW. Desde o hardening de 22/07/2026 o **arquivo versionado** já binda
`${FORCA_BIND_HOST:-127.0.0.1}`, então o default seguro está no git. Conferido
em 27/07/2026: sem o `docker-compose.override.yml`, o bind continua em
`127.0.0.1`. O override permanece porque ele usa `!override` e vence até um
`FORCA_BIND_HOST=0.0.0.0` passado por engano — mas ele é a segunda linha, não a
primeira. O modelo está em `docker-compose.override.yml.example`.

Prova rápida de que a porta não está exposta (rodar de fora da VPS):

```sh
curl -s -o /dev/null -w "%{http_code}\n" --max-time 8 http://187.77.225.31:5001/api/health
# 000 / timeout = fechado, como esperado
```

### 4. Hotfixes manuais que não voltam para o git

Já houve `backend/Dockerfile` e `.env.example` editados direto na VPS e não
commitados. Rode `git status` e leia cada `git diff` antes de descartar
qualquer coisa.

### 5. Variáveis de produção que falham em silêncio

`CORS_ORIGINS` tinha default de desenvolvimento (`localhost`) e ficou assim em
produção sem ninguém notar. O servidor não acusa nada: quem bloqueia é o
navegador, e o app mostra apenas `Erro ao gerar plano: Network Error` mais
"Assistente indisponível" (o probe `/api/health` é barrado do mesmo jeito).
Nenhum participante conseguia gerar plano pelo browser.

A variável virou obrigatória no compose (`${CORS_ORIGINS:?...}`) — faltando
ela, o Compose se recusa a subir em vez de degradar calado. O `.env` de cada
ambiente precisa listar as origens do PWA daquele ambiente.

Diagnóstico deste modo de falha, sem depender do navegador:

```sh
curl -s -i -X OPTIONS https://forca-api.cadastrai.com/api/chat \
  -H "Origin: https://forca-app-six.vercel.app" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
# sem saída = origem bloqueada; toda chamada do app vira "Network Error"
```

As origens de produção são os três aliases do projeto na Vercel
(`vercel inspect <deploy de produção>` lista todos), mais `localhost` para dev.

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
