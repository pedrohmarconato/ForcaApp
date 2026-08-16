# Phase 14: Fundação nativa - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

O dono instala e roda o ForçaApp NATIVO assinado no próprio iPhone (Apple ID
gratuito, time pessoal, validade 7 dias), com: rotina de reassinatura semanal
repetível em 1 comando; target de extensão de widget + módulo Expo em Swift
sobrevivendo a `expo prebuild --clean`; e o spike de App Groups executado no
aparelho físico com a decisão de arquitetura registrada por escrito (orienta as
fases 16–17). Requisitos: NAT-01, NAT-02. Nada de Live Activity funcional nesta
fase (fase 15+) — aqui é fundação: build, assinatura, scaffolding e spike.

</domain>

<decisions>
## Implementation Decisions

### Rotina de reassinatura semanal
- **D-01:** O comando único é um script versionado no repo (ex.: `npm run resign` → `expo prebuild` + build assinado + instalação no aparelho). É ele que cumpre o "runbook documentado e repetível" do NAT-01.
- **D-02:** Instalação por cabo USB (ex.: `xcrun devicectl`) — caminho mais confiável; Wi-Fi não faz parte do fluxo padrão.
- **D-03:** O app mostra um banner discreto de validade ("Reassine até sexta") quando faltarem ≤2 dias para o provisioning profile expirar — lido do profile embarcado. Escopo mínimo: um aviso, não um sistema de notificação.

### Identidade do app no iPhone
- **D-04:** O nativo assume a identidade "Força" (ícone/splash já existentes em `assets/`). O dono remove o atalho do PWA da tela de início quando o nativo estiver estável; o PWA segue vivo como canal web/push no navegador — nada do PWA é desmontado.
- **D-05:** O build do dia a dia durante o v1.3 é **dev-client** (um só app: conecta no Metro quando o dono quiser, roda o bundle embarcado na academia). Vira Release no fechamento do milestone.
- **D-06:** Bundle identifiers (app principal + extensão de widget) e o App Group ID (se o spike aprovar) são congelados na primeira escolha — **Reversibility:** costly — o time pessoal gratuito tem quota de ~10 App IDs/semana (PITFALLS.md); renomear queima quota, exige re-confiar o certificado no aparelho e invalida o resultado do spike.

### Ambiente e dados do build
- **D-07:** O bundle embarcado aponta para **produção** (Supabase prod + `forca-api.cadastrai.com`) — o app é útil de verdade desde o primeiro build. Conectado no Metro, usa o stack local/staging como no fluxo de dev atual. A troca é pelo modo de execução, sem rebuild dedicado.
- **D-08:** UAT no aparelho usa a **conta real do dono** — validar é treinar de verdade. Teste deliberado/artificial fica no Metro + stack local, nunca contra produção.

### Logística dos momentos com iPhone
- **D-09:** Os momentos que exigem o aparelho físico são agrupados em **duas sessões**: Sessão 1 no início da fase (~45 min: primeira instalação, Developer Mode, confiar certificado, spike de App Groups) e Sessão 2 no fim (UAT: rotina de reassinatura + fluxo de treino sem diferença percebida). O spike vem cedo porque a decisão de arquitetura das fases 16–17 depende dele.
- **D-10:** Cada sessão é entregue como **roteiro auto-contido** (comandos prontos para copiar, resultado esperado, critério de aprovação) e a execução da fase PARA nesses checkpoints até o dono reportar o resultado — o dono roda quando puder (rotina remota). Nunca usar "compilou" como critério de conclusão.

### Claude's Discretion
- Ferramenta exata de instalação (`xcrun devicectl` vs alternativa) e estrutura interna do script de reassinatura.
- Como ler a validade do provisioning profile para o banner (D-03) — qualquer mecanismo simples e local serve.
- Formato do registro escrito do spike (sugestão: `14-SPIKE-APP-GROUPS.md` no diretório da fase) — desde que a decisão com/sem App Group fique explícita e citável pelas fases 16–17.
- Nome exibido exato sob o ícone (respeitando D-04: identidade "Força").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pesquisa v1.3 (decisões já arbitradas — não re-pesquisar do zero)
- `.planning/research/SUMMARY.md` — síntese decisória: stack recomendada (`@bacons/apple-targets@^5.0.0` + módulo Expo Swift local), as DUAS contradições reconciliadas (App Groups em time gratuito = UNKNOWN → spike obrigatório como primeira tarefa; `perform()` de LiveActivityIntent = processo do app como hipótese de trabalho) e a ordem de build dependency-locked.
- `.planning/research/PITFALLS.md` — Pitfalls que ESTA fase deve evitar: 1 (`prebuild --clean` apaga target manual — nunca editar `ios/` à mão), 3 (spike de App Groups: passos concretos dos 30 min), 4 (`aps-environment` vazando para entitlements quebra assinatura em time gratuito), 5 (quota de App IDs), 11 (fricção de primeiro build no Xcode 26).
- `.planning/research/STACK.md` — versões pinadas para SDK 54 e por que nenhum wrapper OSS de ActivityKit serve.
- `.planning/research/ARCHITECTURE.md` — layout de `targets/session-widget/` + `modules/live-activity/` que a fase deve scaffoldar.

### Contrato do milestone
- `.planning/REQUIREMENTS.md` — NAT-01 e NAT-02 (texto integral com critérios).
- `.planning/ROADMAP.md` — Phase 14: goal e 4 success criteria (2 são UAT físico do dono).

### Estado atual do código
- `.planning/codebase/STACK.md` — stack vigente: Expo SDK 54/RN 0.81.5, `app.json` (sem EAS), `EXPO_PUBLIC_*` inlined no bundle, patch-package no postinstall.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assets/` (ícone, splash, fontes) — identidade "Força" pronta; o nativo reusa, não recria (D-04).
- `app.json` — config Expo existente (android package `com.pmarconato.forcaapp`, scheme `forcaapp`, dark UI); o iOS bundle id entra aqui e congela (D-06).
- Roteiros de UAT/runbook do v1.2 (`.planning/milestones/v1.2-phases/13-INFRA-RUNBOOK.md`) — padrão de roteiro auto-contido que D-10 replica.

### Established Patterns
- `EXPO_PUBLIC_*` são inlined no momento do bundle (babel-preset-expo) — é isso que viabiliza D-07 (embarcado=prod, Metro=local) sem código de runtime para trocar ambiente.
- `patch-package` roda no postinstall (`patches/react-native+0.81.5.patch`) — o script de reassinatura precisa tolerar/preservar isso após `prebuild`.
- CI (`.github/workflows/session-contract.yml`) roda tsc/jest/pytest/export web — build nativo NÃO entra no CI; verificação é local + UAT do dono.

### Integration Points
- `ios/` é gerado (Continuous Native Generation) — todo artefato nativo persistente vive FORA dele (`targets/`, `modules/`, config plugins), nunca dentro.
- O PWA de produção (Vercel) e o backend (VPS) não são tocados nesta fase; o app nativo é um cliente a mais dos mesmos endpoints.
- `src/store/activeSessionStore.ts` NÃO é tocado nesta fase — o refactor `restEndsAt` é fase 15.

</code_context>

<specifics>
## Specific Ideas

- Banner de validade no estilo "Reassine até sexta" — discreto, informativo, sem modal bloqueante (D-03).
- Sessões com iPhone no formato dos runbooks que o dono já executou no v1.2: blocos de comandos copiáveis + "o que você deve ver" + critério PASS/FAIL.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Reassinatura automática via
AltStore já está registrada como Future em REQUIREMENTS.md, decisão anterior.)

</deferred>

---

*Phase: 14-Fundação nativa*
*Context gathered: 2026-08-15*
