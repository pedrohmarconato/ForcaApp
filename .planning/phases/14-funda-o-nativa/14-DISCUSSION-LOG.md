# Phase 14: Fundação nativa - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 14-Fundação nativa
**Areas discussed:** Rotina de reassinatura semanal, Identidade do app no iPhone, Ambiente e dados do build, Logística dos momentos com iPhone

---

## Rotina de reassinatura semanal

| Option | Description | Selected |
|--------|-------------|----------|
| Script no repo (Recomendado) | `npm run resign` → prebuild + build assinado + instala; versionado, vira o runbook do NAT-01 | ✓ |
| Fluxo manual no Xcode | Documento passo a passo, sem script, mais cliques semanais | |
| Script + atalho no macOS | Script embrulhado em atalho clicável (Atalhos/Automator) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cabo USB (Recomendado) | `xcrun devicectl`, caminho mais confiável | ✓ |
| Wi-Fi (sem fio) | Pareamento sem fio, menos fricção, pareamento às vezes cai | |
| Os dois documentados | Wi-Fi com fallback para cabo | |

| Option | Description | Selected |
|--------|-------------|----------|
| Aviso dentro do app (Recomendado) | Banner lendo validade do profile embarcado, ≤2 dias | ✓ |
| Sem aviso | Dono administra sozinho | |
| Lembrete recorrente no macOS | Script agenda lembrete no Calendário/Lembretes | |

**User's choice:** Script no repo + cabo USB + banner de validade no app.

---

## Identidade do app no iPhone

| Option | Description | Selected |
|--------|-------------|----------|
| Nativo assume, PWA sai (Recomendado) | Nativo vira o único ícone "Força"; PWA segue no navegador como canal web/push | ✓ |
| Dois ícones, nomes distintos | PWA renomeado como fallback visível | |
| Dois ícones idênticos | Conviver com a duplicata | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dev-client durante o v1.3 (Recomendado) | Um só app: Metro quando quiser + bundle embarcado na academia; Release no fechamento | ✓ |
| Release desde o dia 1 | App limpo, mas cada iteração exige rebuild completo | |

**User's choice:** Nativo assume a identidade "Força"; build dev-client durante o v1.3.

---

## Ambiente e dados do build

| Option | Description | Selected |
|--------|-------------|----------|
| Embarcado=prod, Metro=local (Recomendado) | Bundle embarcado → produção; desenvolvimento via Metro → stack local/staging | ✓ |
| Tudo produção | Simples, mas testes de dev sujam dados reais | |
| Tudo staging até fechar o v1.3 | Seguro, mas app inútil na academia até trocar | |

| Option | Description | Selected |
|--------|-------------|----------|
| Minha conta real (Recomendado) | UAT = treinar de verdade; teste artificial só no local | ✓ |
| Conta UAT separada em produção | Usuário de teste em prod, mais setup | |

**User's choice:** Embarcado aponta para produção; UAT com a conta real.

---

## Logística dos momentos com iPhone

| Option | Description | Selected |
|--------|-------------|----------|
| Duas sessões (Recomendado) | Sessão 1 no início (instalação + spike App Groups); Sessão 2 no fim (UAT) | ✓ |
| Uma sessão só no fim | Tudo numa sentada; decisão de App Groups sai tarde | |
| Conforme aparecem | Checkpoint sempre que o plano pedir o aparelho | |

| Option | Description | Selected |
|--------|-------------|----------|
| Roteiro pronto, eu rodo quando puder | Roteiros auto-contidos; execução pausa até o dono reportar | ✓ |
| Diariamente | Checkpoints sem cerimônia | |
| Poucas janelas por semana | Sessões em dias específicos, empacotadas | |

**User's choice:** Duas sessões, cada uma como roteiro auto-contido executado quando o dono puder.

---

## Claude's Discretion

- Ferramenta exata de instalação e estrutura interna do script de reassinatura.
- Mecanismo de leitura da validade do provisioning profile para o banner.
- Formato/nome do registro escrito do spike de App Groups.
- Nome exibido exato sob o ícone.

## Deferred Ideas

None — discussion stayed within phase scope.
