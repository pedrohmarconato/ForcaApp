# Ambiente de homologação (HML)

Criado em 22/07/2026. Espelha a produção com custo mínimo, para testar antes
de promover à main.

## Topologia

| Camada | Produção | Homologação |
|---|---|---|
| Branch git | `main` | `staging` |
| Supabase | `forcaapp-hml`* (`zanqygwsgxkyjiuhrzju`) | `forcaapp-staging` (`mjdjtiujhwklchalquhc`) |
| Backend | VPS `/docker/forcaapp`, loopback 5001 | VPS `/docker/forcaapp-hml`, loopback **5002** |
| API pública | `https://forca-api.cadastrai.com/api` | `https://forca-api-hml.cadastrai.com/api` |
| PWA | deploy Production (`vercel deploy --prod`) | deploy Preview (`vercel deploy`) |
| Modelos IA | Opus 4.8 no plano | **Haiku 4.5 em tudo** (barato) |
| Deploy | manual (runbook `DEPLOY_VPS.md`) | **automático**: push em `staging` → ar em ~3 min |

\* Sim, o projeto de produção chama-se `forcaapp-hml` — herança histórica
(ver `AGENTS.md`). O de homolog é o `forcaapp-staging`.

## Fluxo de trabalho

1. Trabalhe numa branch de feature; quando quiser homologar:
   `git push origin minha-branch:staging` (ou merge em `staging`).
2. A VPS tem um systemd timer (`forcaapp-hml-deploy.timer`, 3 min) que detecta
   a mudança em `origin/staging`, rebuilda e sobe o container. Log:
   `/var/log/forcaapp-hml-deploy.log`.
3. PWA de homolog: `vercel deploy` (sem `--prod`) — o build usa as envs de
   **Preview** do painel (Supabase staging + API hml). O
   `verify-web-bundle.mjs` valida o host conforme o ambiente (`VERCEL_ENV`)
   e continua travando LAN e exigindo produção em builds Production.
4. Aprovado? PR da branch → review → merge em `main` → deploy de produção
   (manual, como sempre).

## Migrations

- **Sempre primeiro no staging**: `supabase link --project-ref
  mjdjtiujhwklchalquhc && scripts/supabase-preflight.sh hml && supabase db push`
  (senha do banco em `~/.forcaapp_staging_db` no Mac do dono).
- Só depois de validada em HML a migration vai à produção — **registrada**
  (`scripts/supabase-preflight.sh prod && supabase db push` no projeto de
  produção; nunca SQL direto sem registro).
- Cuidado com o link do clone: `supabase link` troca o projeto-alvo do
  diretório. O preflight acima é quem confirma o ref — ele lê o projeto
  realmente linkado e aborta se divergir do ambiente que você declarou.
  Não pule esse passo confiando no que o roteiro afirma: um briefing de
  revisão já trocou os dois refs e chamou a produção de "HML descartável"
  (ver o bloco de refs canônicos no `AGENTS.md`).

## Testar o plano com Opus no HML

O HML usa Haiku por padrão para não queimar Opus em teste de fluxo. Para um
teste fiel do plano: na VPS, edite `PLAN_MODEL_NAME=claude-opus-4-8` em
`/docker/forcaapp-hml/.env` e rode `docker compose --project-directory
/docker/forcaapp-hml up -d` (sem rebuild). Volte o valor depois.

## Guardrails

- O container HML binda **somente em loopback** (`127.0.0.1:5002`) — a
  exposição pública passa pelo nginx com TLS, como na produção.
- O `.env` de HML na VPS não é versionado.
- ⚠️ **A `ANTHROPIC_API_KEY` de HML precisa ser exclusiva** (SEG-01 do review
  defensivo de 31/07/2026). Até então era a mesma da produção, o que significa
  que um comprometimento do container, do host ou do `.env` de homologação
  entregava a credencial que produção usa — e a rotação de emergência derrubaria
  os dois ambientes de uma vez. Runbook da separação:

  1. No console da Anthropic, criar uma chave nova **com limite de gasto
     próprio**, nomeada de forma a não haver dúvida (ex.: `forcaapp-hml`).
  2. Na VPS: editar `ANTHROPIC_API_KEY` em `/docker/forcaapp-hml/.env` e subir
     com `docker compose --project-directory /docker/forcaapp-hml up -d`.
  3. Conferir sem imprimir a chave — o log de startup do container mostra os
     modelos e flags ativos, e `GET /api/health` deve voltar `200`.
  4. **Rotacionar a chave antiga**, que continua sendo a de produção e esteve
     exposta ao ambiente de homologação enquanto era compartilhada.

  Passos 1 e 4 dependem de login no console e são do dono do projeto.
- Dados de HML são descartáveis; **nunca** aponte o HML para o banco de
  produção.
