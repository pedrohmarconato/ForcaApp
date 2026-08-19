---
phase: 14
slug: funda-o-nativa
audited: 2026-08-19T22:10:00.000Z
status: verified
threats_total: 17
threats_mitigated: 13
threats_open: 0
risks_accepted: 4
threats_derived_retroactively: 0
asvs_level: 1
block_on: high
head_audited: 4f6ef78
created: 2026-08-19
---

# Fase 14 — Security

Auditoria retroativa, solicitada pelo dono em 2026-08-19. A Fase 14 nunca
tinha passado por auditoria de segurança formal.

## Correção de premissa

O pedido de auditoria partiu da suposição de que a Fase 14 **anteciparia** o
processo de threat model adotado nas Fases 16 e 17, e que o modelo teria de ser
reconstruído retroativamente. **A suposição estava errada.** Os nove planos
(`14-01-PLAN.md` a `14-09-PLAN.md`) já trazem bloco `<threat_model>` STRIDE
completo — ID, categoria, severidade, disposição e plano de mitigação — no
mesmo formato das fases posteriores. Nenhuma das 17 ameaças precisou ser
derivada retroativamente.

O que faltava não era o modelo de ameaças: era o documento de fechamento que
verifica cada mitigação contra o código vivo. É o que este arquivo faz.

## Registro de ameaças

Todas verificadas contra o código no HEAD `4f6ef78`, branch `main`.

| ID | Categoria | Sev. | Disposição | Status | Evidência |
|---|---|---|---|---|---|
| T-14-SC | Tampering (npm install SUS) | high | mitigate | CLOSED | `14-01-SUMMARY.md:80-84` — aprovação citada literalmente, anterior ao install da 14-02; `package-lock.json` confirma `@bacons/apple-targets@5.0.0` do registry oficial |
| T-14-01-02 | Repudiation (decisão de bundle id) | low | mitigate | CLOSED | `14-01-SUMMARY.md:66-76` cita "option-a"; `app.json:22` = `com.pmarconato.forcaapp` |
| T-14-02-01 | Tampering (`aps-environment` vazando) | high | mitigate | CLOSED | `scripts/verify-native-skeleton.sh:102-114` (checagem c) + `app.json` e `targets/session-widget/expo-target.config.js` sem a chave |
| T-14-02-02 | Info Disclosure (bundle aponta ambiente errado) | medium | accept | CLOSED (aceito) | Rationale escrito em `14-02-PLAN.md:224`, citando D-07 (`14-CONTEXT.md:33`). Ver IN-01 do `14-REVIEW.md` |
| T-14-02-03 | Tampering (pacotes npm instalados) | high | mitigate | CLOSED | Mesma evidência de T-14-SC (checkpoint a montante) |
| T-14-03-01 | Info Disclosure (`getProvisioningProfileExpiry`) | medium | mitigate | CLOSED | `modules/native-info/ios/NativeInfoModule.swift:14-19,50-53` — só `ExpirationDate` mapeado; `index.ts:37-39` repassa string ou null |
| T-14-03-02 | Info Disclosure (texto do banner) | low | accept | CLOSED (aceito) | Rationale em `14-03-PLAN.md:176`; `src/components/ProvisioningBanner.tsx:55-59` mostra só dia da semana, sem Team ID nem UUID |
| T-14-04-01 | Tampering (install em device errado) | high | mitigate | CLOSED | `scripts/resign.sh:118-130` aborta com 0 ou mais de 1 device conectado |
| T-14-04-02 | Repudiation (sem trilha de reassinatura) | low | accept | CLOSED (aceito) | Rationale em `14-04-PLAN.md:144` |
| T-14-05-01 | Info Disclosure (payload do App Group) | medium | mitigate | CLOSED | Módulo `modules/app-group-spike/` removido por inteiro (0 ocorrências no repo); payload era um timestamp enquanto existiu |
| T-14-05-02 | Tampering (entitlement órfã se o spike falhasse) | high | mitigate | CLOSED | `14-SPIKE-APP-GROUPS.md` com round-trip PASS/PASS; decisão "COM App Group" consistente com `app.json:24-26` e `expo-target.config.js:8-12`, idênticos |
| T-14-06-01 | Repudiation (resultado do spike impreciso) | high | mitigate | CLOSED | `14-06-SUMMARY.md:79-86` — formato `app=PASS`, `round-trip=PASS`, com duas evidências de máquina independentes |
| T-14-07-01 | Tampering (entitlement órfã pós-decisão) | high | mitigate | CLOSED | `scripts/verify-native-skeleton.sh:252-276` (checagem k). Ver ressalva abaixo |
| T-14-07-02 | Repudiation (decisão não citável) | medium | mitigate | CLOSED | `14-SPIKE-APP-GROUPS.md:15` — linha `Decisão: COM App Group` e parágrafo de implicação para as Fases 15 e 16 |
| T-14-08-01 | Tampering (regressão silenciosa) | medium | mitigate | CLOSED | `14-08-SUMMARY.md` — tsc, jest e verify-native-skeleton rodados juntos, verdes |
| T-14-09-01 | Info Disclosure/Tampering (UAT contra produção real) | medium | accept | CLOSED (aceito) | D-08 em `14-CONTEXT.md:34`, decisão deliberada do dono |
| T-14-09-02 | Repudiation (fase fechada sem confirmação) | high | mitigate | CLOSED | `14-09-SUMMARY.md:84-93` — três itens PASS/N-A citados e um (`fluxo_de_treino`) deixado explicitamente em aberto em vez de forçado a PASS |

### Ressalva sobre T-14-07-01

A mitigação verificada é a checagem (k) de `verify-native-skeleton.sh`, que
trava a entitlement do App Group contra regressão do `expo prebuild --clean`.
Ela **não existia** quando a Fase 14 fechou: foi acrescentada em 2026-08-19
como correção do achado IN-04 do review da Fase 16. A ameaça estava declarada
desde a Fase 14, mas a trava automatizada só passou a existir depois.
Registrado para não creditar à Fase 14 uma proteção que ela não tinha na época.

## Vetores checados diretamente

- **Segredo commitado**: varredura em `git log --all -p` por `.p12`,
  `.mobileprovision`, `.cer`, `BEGIN PRIVATE KEY`, Apple ID e senha de app
  específica. Nenhum artefato de assinatura Apple jamais foi commitado.
  `.gitignore:157,189` cobre `*.mobileprovision` e `/ios` inteiro. O único hit
  de chave privada é uma chave VAPID **de teste, descartável**, de scratchpad da
  Fase 13 — fora do escopo NAT-01/NAT-02 e documentada como não-produção.
- **Team ID versionado**: `app.json:23` traz `appleTeamId`. Verificado e
  classificado como **não vulnerabilidade**: Team ID é extraível de qualquer
  binário assinado via `codesign -d` (o próprio `14-05-SUMMARY.md` demonstra) e
  não concede acesso à conta sem Apple ID, senha e 2FA.
- **Entitlement divergente entre targets**: `app.json` e
  `expo-target.config.js` comparados — idênticos
  (`group.com.pmarconato.forcaapp.shared`).
- **Script de assinatura com falha silenciosa**: `scripts/resign.sh:21` tem
  `set -euo pipefail`, e cada uma das oito etapas aborta com mensagem
  `ABORTADO:` acionável. O portão final roda `verify-native-skeleton.sh` — o
  critério de sucesso não é "compilou".
- **Sideload de 7 dias**: não existe caminho de reinstalação automática. O
  `ProvisioningBanner` é aviso passivo (D-03) e a reassinatura exige
  `npm run resign` disparado à mão, com um único device por cabo.

## Achado novo: injeção por interpolação em `resign.sh`

**Severidade: warning. Não bloqueante. Corrigido nesta auditoria.**

`scripts/resign.sh:61-72` interpolava `${REPO_ROOT}` e `${EXPO_NAME}` — este
último derivado de `app.json.expo.name` — direto dentro de strings JS de aspas
simples passadas a `node -e`, sem escape:

```
const nome = '${EXPO_NAME}';
```

Um `expo.name` que contivesse aspa simples quebraria a string e executaria JS
arbitrário no contexto do build. O risco prático era baixo (só o dono controla
o `app.json`, mesmo limite de confiança do script), mas nenhuma das 17 ameaças
declaradas cobria esse padrão, e é exatamente o vetor "execução de comando com
input não sanitizado".

Achado de forma independente pela auditoria de segurança e pelo code review
desta mesma data (WR-03 do `14-REVIEW.md`). Corrigido pela passagem por
variável de ambiente, que elimina a interpolação de string.

## Relação com o code review desta data

O `14-REVIEW.md` (mesma data) registra 0 CRITICAL, 4 WARNING e 2 INFO. Dois dos
warnings têm leitura de segurança e ficam referenciados aqui:

- **WR-01** — a checagem (c) de `verify-native-skeleton.sh` passa em silêncio se
  o `find` não devolver nenhum `.entitlements`. É a classe "verificação que
  aprova sem exercitar nada", justamente a que T-14-02-01 depende.
- **WR-03** — o mesmo vetor de injeção descrito acima.

## Veredito

**SECURED** — `threats_open: 0`. Nenhuma ameaça aberta em severidade igual ou
superior ao limite de bloqueio (`high`). Quatro riscos aceitos, todos com
decisão escrita e citável. O achado novo foi corrigido durante a auditoria.
