---
phase: 18
slug: neon-configuravel
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-20
validated: 2026-08-20
---

> **Nota de auditoria (2026-08-20, gate Nyquist retroativo):** este arquivo nunca existiu —
> a Fase 18 não teve `-PLAN.md` seedado por `plan-phase` (os planos `18-11` a `18-15`
> citados no `ROADMAP.md` nunca foram criados como arquivos; `18-11`/`18-12` foram
> superados pelo merge `42f1e58`, `18-13`/`18-14` seguem como decisão pendente do dono e
> `18-15` é, na prática, o `18-UAT.md` de hoje). Este gate é construído hoje a partir de
> três fontes já auditadas nesta mesma data — `18-VERIFICATION.md` (score 1/5, status
> `human_needed`), `18-SECURITY.md` (`threats_open: 0`, 6/6 mitigados) e `18-UAT.md`
> (1/5 `pass`, 4/5 `pending`) — mais execução direta dos arquivos de teste citados por
> este verificador, não apenas citação dos SUMMARYs. `nyquist_compliant` fica em `false`
> pelo mesmo precedente da Fase 17: só vira `true` com evidência física de primeira
> ordem (dispositivo/navegador real), e nenhum dos quatro Success Criteria físicos do
> `ROADMAP.md` tem isso ainda — `18-UAT.md` itens 1-4 seguem `pending`.

# Phase 18 — Validation Strategy

> Contrato de validação por fase para amostragem de feedback durante a execução.
> Reconstruído retroativamente a partir de `18-VERIFICATION.md`, `18-SECURITY.md` e
> `18-UAT.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest `^29.7.0` (`package.json`, preset `jest-expo`) + `pytest` (Python 3.9, `backend/tests/`) |
| **Config file** | chave `jest` em `package.json` (sem `jest.config.js` próprio; `jest.integration.config.js` e `jest.web.config.js` são configs auxiliares não usados por esta fase) |
| **Quick run command** | `npx jest __tests__/neonTheme.test.tsx __tests__/liveActivitySwiftContract.test.ts __tests__/themeRuntimeCoverage.test.ts __tests__/themeComponents.test.tsx __tests__/settingsScreen.test.tsx __tests__/liveActivityContentState.test.ts __tests__/liveActivitySync.test.ts` |
| **Full suite command** | `npm test` (Jest completo) + `python3 -m pytest backend/tests/test_migration_neon_color.py` |
| **Estimated runtime** | ~1,1 s (quick run, 7 arquivos/123 testes) + ~0,06 s (pytest, 7 testes); suíte completa citada em `18-UAT.md` item 5: `tsc --noEmit` limpo, Jest 179/179 suítes e 2152/2152 testes, ~poucos segundos |
| **Type gate** | `npx tsc --noEmit` — obrigatório junto do quick run |

**Swift não tem framework de teste automatizado neste repositório** (mesma restrição
estrutural das Fases 15-17). A cobertura de Swift nesta fase é indireta mas real:
`liveActivitySwiftContract.test.ts` lê os dois arquivos `.swift` como texto e valida
estruturalmente (regex/parsing) a paridade byte a byte entre as duas cópias de
`SessionActivityAttributes.swift`, a ordem canônica dos campos, o `switch` fechado de
`neonAccent(for:)` e o fallback amarelo — mais forte que presença de símbolo, mas ainda
não é compilação real (`xcodebuild`) nem execução em device.

---

## Sampling Rate

> Retroativo: a fase já foi mesclada (`42f1e58`) antes deste arquivo existir. A cadência
> abaixo descreve o que os SUMMARYs 18-01 a 18-10 relatam ter seguido e o que qualquer
> amendamento futuro da fase deve manter.

- **Após cada commit de tarefa:** `npx jest <arquivo-do-domínio-tocado>` + `npx tsc --noEmit`.
  Domínios: `theme`/`neonTheme`, `ThemeProvider`/`neonTheme`, `neonPreferenceRepository`,
  `settingsScreen`, `themeComponents`, `themeRuntimeCoverage`, `liveActivityContentState`,
  `liveActivitySwiftContract`, `liveActivitySync`.
- **Após cada wave:** `npm test` (suíte completa) — evidência de 2026-08-20 em `18-UAT.md`
  item 5: 179/179 suítes, 2152/2152 testes.
- **Antes de `/gsd-verify-work`:** suíte completa verde **e** roteiro físico dos 4 itens
  `manual-only` de `18-UAT.md` reportado PASS/FAIL pelo dono — hoje 4/5 seguem `pending`.
- **Max feedback latency:** ~1-2 s (quick run desta fase).

**Regra inegociável:** "compilou" / "testes passaram" **nunca** é critério de conclusão
sozinho quando o requisito descreve comportamento em runtime real — mesma regra que
fechou a Fase 17 (D-14 da Fase 15, D-10 da Fase 14).

---

## Per-Requirement Verification Map

> Fase sem `-PLAN.md`/Task IDs formais — tabela organizada por requisito (`ROADMAP.md`
> Requirements da Fase 18 = `REQUIREMENTS.md` seção v1.4), com o(s) teste(s) nomeado(s)
> mapeado(s) por `18-VERIFICATION.md` e confirmados no disco por este auditor.

| Requirement | Test(s) nomeado(s) | Automated Command | File Exists | Status |
|---|---|---|---|---|
| THEME-01 | `neonTheme.test.tsx` → `describe('contrato da paleta neon')` L168 (4 chaves + derivação RGB L169, fronteira desconhecida→yellow L203, congelamento profundo L210); `liveActivitySwiftContract.test.ts` → `describe('resolver de cor do widget (WidgetLiveActivity.swift)')` L153 (switch fechado L175, 4 chaves RGB exatas L179, fallback yellow L192) + `it('não existe constante neon fixa independente do state')` L202 | `npx jest __tests__/neonTheme.test.tsx -t "contrato da paleta neon"` / `npx jest __tests__/liveActivitySwiftContract.test.ts` | ✅ arquivo / ✅ casos | ✅ green |
| THEME-02 | `themeRuntimeCoverage.test.ts` → `describe('guarda: cobertura runtime do acento neon (18-07 Task 3)')` L450 (9 casos, guarda estática dos 31 consumidores); `themeComponents.test.tsx` (10 casos de propagação em runtime sem remount: player/fila L314-528, sheets L713-989, hosts globais L1141-1199); `neonTheme.test.tsx` → `describe('integração da árvore raiz')` L914 (`App` monta uma vez, tema propaga sem remontar, L928) | `npx jest __tests__/themeRuntimeCoverage.test.ts __tests__/themeComponents.test.tsx` | ✅ arquivo / ✅ casos | ✅ green |
| THEME-03 | `themeComponents.test.tsx` → `it('mantem warning e danger funcionais byte a byte iguais quando o neon vira red')` L989; `themeRuntimeCoverage.test.ts` → `it('separa acento estético de status funcional e reconhece os regressors contratados')` L506 | `npx jest __tests__/themeComponents.test.tsx -t "warning e danger"` / `npx jest __tests__/themeRuntimeCoverage.test.ts -t "separa acento"` | ✅ arquivo / ✅ casos | ✅ green |
| PREF-01 | `backend/tests/test_migration_neon_color.py` (7 casos L32-125: arquivo único de migration, normalização de DDL, coluna `text NOT NULL DEFAULT 'yellow'`, `CHECK` nomeado nas 4 chaves, metadados de constraint/RLS/policy, `update-own` + privilégios `authenticated`, nenhuma outra coluna/policy/grant alterada); `neonTheme.test.tsx` → `describe('neonPreferenceRepository')` L220 (update restrito a `profiles.neon_color` L233, propagação de erro L245, falha fechada sem linha retornada L254) | `python3 -m pytest backend/tests/test_migration_neon_color.py -q` / `npx jest __tests__/neonTheme.test.tsx -t "neonPreferenceRepository"` | ✅ arquivo / ✅ casos | ✅ green — ⚠️ ver nota PREF-01 abaixo |
| PREF-02 | `neonTheme.test.tsx` → `describe('ThemeProvider por conta')` L263, casos: hidratação por identidade e queda para yellow entre contas L326, não reaproveita cor de profile que deixou de pertencer ao user L360, render suspenso de B não invalida save de A L390, sem segundo write para o mesmo owner L498/L547, serialização da última intenção L592, `owners diferentes podem manter writes independentes sem resposta de A tocar B` L676 | `npx jest __tests__/neonTheme.test.tsx -t "ThemeProvider por conta"` | ✅ arquivo / ✅ casos | ✅ green |
| PREF-03 | `neonTheme.test.tsx` → `it('reverte no erro e confirma a tentativa no retry')` L727, `it('normaliza payload desconhecido do repository para yellow')` L782, `it('reverte quando o repository devolve uma linha de outra conta')` L801, `it('retry sem tentativa anterior não escreve')` L820; `settingsScreen.test.tsx` → `it('em erro mantém confirmedNeonColor, expõe Notice danger e permite retry uma vez')` L285 | `npx jest __tests__/neonTheme.test.tsx -t "reverte"` / `npx jest __tests__/settingsScreen.test.tsx -t "em erro"` | ✅ arquivo / ✅ casos | ✅ green — ⚠️ divergência aberta e já documentada (duplo toque serializa 2 chamadas, não 1 — decisão do dono, `REQUIREMENTS.md` PREF-03) |
| SET-01 | `settingsScreen.test.tsx` → `it('renderiza o header, a copy aprovada e exatamente quatro radios na ordem fechada')` L90, `it('expõe checked, nome, swatch de 28px, alvo de 50px e Selecionado sem depender só de cor')` L114, `it('usa uma coluna em 320 e duas colunas em 390 e 768, sem exceder 420px')` L161, `it('usa roving focus com Tab, setas e wrap; Space e Enter selecionam a opção focal')` L214 | `npx jest __tests__/settingsScreen.test.tsx` | ✅ arquivo / ✅ casos | ✅ green — ⚠️ WR-03 (`18-REVIEW.md`): roving-focus não resincroniza após hidratação assíncrona — não coberto pelos testes acima, não-bloqueante |
| SET-02 | `settingsScreen.test.tsx` → `it('selecionar Azul chama o provider uma vez e reflete o preview confirmado pelo provider')` L145, `it('bloqueia todos os cards durante saving e não abre uma segunda seleção')` L251, `it('anuncia sucesso uma vez mesmo com renders adicionais')` L268, `it('em erro mantém confirmedNeonColor...')` L285 | `npx jest __tests__/settingsScreen.test.tsx` | ✅ arquivo / ✅ casos | ✅ green |
| LIVE-01 | `neonTheme.test.tsx`: `onThemeChange` verificado dentro de `it('aplica preview azul antes da escrita resolver e depois o confirma')` L275 (`toHaveBeenLastCalledWith('blue')`) e de `it('reverte no erro e confirma a tentativa no retry')` L727 (sequência `['blue','yellow']`); `describe('integração da árvore raiz')` L914; `liveActivitySync.test.ts` → `it('não duplica update quando a mesma chave neon é repetida')` L208 | `npx jest __tests__/neonTheme.test.tsx -t "aplica preview azul\|reverte no erro\|integração da árvore"` / `npx jest __tests__/liveActivitySync.test.ts -t "não duplica update"` | ✅ arquivo / ✅ casos | ✅ green — ⚠️ ver nota LIVE-01 abaixo (lacuna real) |
| LIVE-02 | `liveActivityContentState.test.ts` → `it('inclui a chave neon validada em measuring, resting, readyOvertime e blockOnly')` L67, `it('usa yellow quando a chave neon está ausente ou é inválida')` L94; `liveActivitySwiftContract.test.ts` (arquivo inteiro, 12 casos L115-236: paridade byte a byte L116, ordem canônica com `neonColor` opcional ao fim L120, `Record`/`contentState(from:)` L135-142, switch fechado + 4 chaves RGB + fallback L175-192, ausência de constante fixa L202, `primaryValue`/`tint`/símbolo/`keylineTint` do state L206-213, estrutura/tipografia/timers/intents preservados L224-236) | `npx jest __tests__/liveActivityContentState.test.ts -t "neon\|yellow"` / `npx jest __tests__/liveActivitySwiftContract.test.ts` | ✅ arquivo / ✅ casos | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Verificação executada nesta auditoria (2026-08-20), dirigida — não a suíte inteira:**

```
npx jest __tests__/neonTheme.test.tsx __tests__/liveActivitySwiftContract.test.ts \
  __tests__/themeRuntimeCoverage.test.ts __tests__/themeComponents.test.tsx \
  __tests__/settingsScreen.test.tsx __tests__/liveActivityContentState.test.ts \
  __tests__/liveActivitySync.test.ts --silent
```
→ **7 suítes / 123 testes, todos PASS**, exit 0 (28 + 12 + 9 + 12 + 8 + 28 + 26 = 123,
contado por arquivo e conferido contra o agregado). Mais:
```
python3 -m pytest backend/tests/test_migration_neon_color.py -q
```
→ **7 testes, todos PASS**, exit 0. Total desta auditoria: **8 arquivos, 130 casos
automatizados, 0 falha.** Nenhum destes números repete a suíte inteira (179
suítes/2152 testes) — essa continua sendo a evidência já registrada em `18-UAT.md`
item 5, não re-executada aqui por não ser necessária ao gate de requisito por requisito.

**Nota PREF-01 — divergência de documentação encontrada nesta auditoria:**
`REQUIREMENTS.md` (linhas 229-236) ainda registra "Status remoto: não verificado — a
migration nunca foi aplicada a um banco Supabase real (nem staging, nem produção)".
Isso está desatualizado frente a `18-VERIFICATION.md` (linha 91, migration confirmada
aplicada ao banco **local** por `psql` direto nesta mesma data) e `18-SECURITY.md`
(mitigação de IDOR-01: "aplicada a local e produção em 20/08"). Este verificador não
tem credencial de produção para reconsultar o fato de produção de forma independente —
registra a divergência textual entre os três documentos, não resolve qual está certo.
Não é um gap de teste; é um `REQUIREMENTS.md` que não foi atualizado após o evento.

**Nota LIVE-01 — lacuna real confirmada nesta auditoria (consistente com
`18-VERIFICATION.md` e o próprio texto de `REQUIREMENTS.md`):** nenhum teste automatizado
exercita a ligação real `App.tsx:39` (`<ThemeProvider onThemeChange={setLiveActivityNeonColor}>`)
contra o módulo real `src/native/liveActivitySync.ts`. O teste de árvore raiz em
`neonTheme.test.tsx` (`describe('integração da árvore raiz')` L914) importa `<App />`
mas mocka `../src/native/liveActivitySync` (linha 84-87) **sem exportar**
`setLiveActivityNeonColor` no mock — a prop é passada mas nunca observada em ação contra
a implementação real. A ligação é confirmada apenas por leitura estática do código
(`grep` em `App.tsx:39`), exatamente como `18-VERIFICATION.md` e `REQUIREMENTS.md`
(LIVE-01, "não tem teste de montagem da árvore real — confirmada só por inspeção de
código") já registram. Os testes citados na tabela acima cobrem a peça que dá certo
(`ThemeProvider` chama `onThemeChange` corretamente, na ordem certa, e `liveActivitySync`
deduplica update por chave) — não cobrem a fiação ponta a ponta entre os dois módulos
reais dentro de `App.tsx` montado. Item 4 de `18-UAT.md` é o fechamento físico
equivalente e segue `pending`.

---

## Wave 0 Requirements

- [x] `__tests__/neonTheme.test.tsx` — paleta, `neonPreferenceRepository`, `ThemeProvider`
      por conta, hooks fora do provider, integração da árvore raiz. **Confirmado presente
      e verde nesta auditoria** (28/28).
- [x] `__tests__/themeComponents.test.tsx` — propagação em runtime pelos consumidores
      (player, fila, sheets, hosts globais) e invariância de status funcional. **Confirmado
      presente e verde** (12/12).
- [x] `__tests__/themeRuntimeCoverage.test.ts` — guarda estática recursiva dos 31
      consumidores. **Confirmado presente e verde** (9/9).
- [x] `__tests__/settingsScreen.test.tsx` — radios, roving focus, delegação ao provider,
      estados de autosave. **Confirmado presente e verde** (8/8).
- [x] `__tests__/liveActivityContentState.test.ts` — `neonColor` nas 4 fases do
      `ContentState`, fallback amarelo em payload legado. **Confirmado presente e verde**
      (28/28, suíte completa do arquivo — inclui casos não relacionados a neon herdados
      de fases anteriores).
- [x] `__tests__/liveActivitySwiftContract.test.ts` — paridade byte a byte das duas cópias
      Swift, resolver `neonAccent(for:)`, contrato do `Record`/`contentState(from:)`.
      **Confirmado presente e verde** (12/12).
- [x] `__tests__/liveActivitySync.test.ts` — deduplicação de update por chave neon
      repetida. **Confirmado presente e verde** (26/26, suíte completa do arquivo).
- [x] `backend/tests/test_migration_neon_color.py` — contrato estrutural da migration 0040
      (coluna, CHECK, RLS/policy preservados). **Confirmado presente e verde** (7/7).
- [ ] Nenhum framework de teste Swift/XCTest instalado — fora do escopo, mesma restrição
      estrutural herdada das Fases 15-17. Cobertura Swift = contrato via
      `liveActivitySwiftContract.test.ts` (leitura estrutural do `.swift` real) + `diff -q`
      das duas cópias (rodado em `18-VERIFICATION.md`, não repetido nesta auditoria por já
      estar coberto pelo teste de paridade).

*Toda a infraestrutura necessária já existia antes desta auditoria — nenhum arquivo novo
foi criado por este gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Troca das quatro cores em runtime, sem restart, sem alterar cores funcionais | THEME-01/02/03 (Critério 1 do ROADMAP) | ActivityKit à parte, a própria troca de tema em runtime — remontagem visual real, foco de teclado, contraste percebido — não é observável em jsdom/RTL; exige app instalado ou navegador real | `18-UAT.md` item 1 (`pending`): abrir Ajustes no app do iPhone (ou PWA real), trocar entre as 4 cores observando `SessionPlayer`/Logo/botões, confirmar que um `Notice` de perigo permanece na cor funcional mesmo com acento vermelho selecionado |
| Persistência por conta, sem vazamento entre contas | PREF-01/02 (Critério 2 do ROADMAP) | Requer dispositivo físico logado contra produção (ou base local revertida) com duas contas reais, force-quit real do app | `18-UAT.md` item 2 (`pending`): Conta A escolhe cor, force-quit, reabrir, confirmar persistência; logout/login Conta B, confirmar que a cor de A não vaza |
| Rollback de UI e Live Activity em falha de persistência | PREF-03 (Critério 3 do ROADMAP) | Requer sessão de treino ativa real + controle físico de rede (modo avião) do aparelho — não simulável em Jest | `18-UAT.md` item 3 (`pending`, com nota explícita de que uma evidência informal do dono — coluna ausente no banco local produzindo o rollback correto — não substitui este item): Live Activity ativa, modo avião, trocar cor em Ajustes, observar UI + card da tela bloqueada |
| Live Activity ativa muda imediatamente; estado legado cai em amarelo | LIVE-01/02 (Critério 4 do ROADMAP) | Renderização real do widget na tela bloqueada de um dispositivo físico — fora do alcance de jsdom/RTL e de qualquer simulador (ActivityKit não roda em simulador) | `18-UAT.md` item 4 (`pending`): Live Activity ativa, trocar cor em Ajustes, bloquear o aparelho imediatamente sem esperar outro evento de sessão; observar mudança imediata e, se possível, um estado legado sem `neonColor` caindo em amarelo |
| Prova comportamental de RLS contra instância viva (IDOR-01) | PREF-01 / IDOR-01 (`18-SECURITY.md`) | `scripts/neon-rls-smoke.mjs` existe e está correto (mitigação estrutural provada por leitura de código), mas `validateStagingUrl` trava o script fora do projeto de staging por desenho — rodá-lo é decisão de escopo/infra do dono, não algo que o código resolve sozinho | `18-SECURITY.md` Follow-ups + `18-UAT.md`: dono decide entre (a) aplicar a mitigação RLS ao staging e rodar `neon-rls-smoke.mjs` com PASS, ou (b) aceitar a mitigação estrutural (policy RLS lida em `0000`/`0040`, sem prova comportamental) como suficiente — waive formal, sem decisão registrada até esta data |

---

## Validation Sign-Off

- [x] Todos os 10 requisitos (THEME-01..03, PREF-01..03, SET-01..02, LIVE-01..02) têm
      teste automatizado nomeado e confirmado presente/verde nesta auditoria — nenhum
      depende só de dependência declarada de Wave 0 sem teste real por trás.
- [x] Continuidade de amostragem: nenhum requisito sem verify automatizado — os 10 têm
      pelo menos um arquivo de teste dirigido, a maioria com 2+.
- [x] Wave 0 cobre todas as referências citadas por `18-VERIFICATION.md` — os 8 arquivos
      de teste e o contrato de migration existem no disco e rodam verdes.
- [x] Nenhuma flag de watch-mode nos comandos usados (`--silent`, sem `--watch`)
- [x] Latência de feedback < 2 s (quick run desta auditoria: 7 suítes/123 testes em
      ~1,1 s; pytest 7/7 em ~0,06 s)
- [x] Roteiro físico dos 5 itens manual-only (4 Success Criteria físicos + decisão de
      RLS staging) mapeado 1:1 para `18-UAT.md`/`18-SECURITY.md`, com PASS/FAIL/decisão
      por item — **hoje 1/5 `pass` (automatizado), 4/5 `pending`**, nenhum `fail`
- [ ] `nyquist_compliant: true` **não marcado** — precedente da Fase 17: só vira `true`
      com evidência física de primeira ordem. Nenhum dos 4 Success Criteria físicos do
      `ROADMAP.md` tem observação num dispositivo/navegador real ainda; `18-UAT.md` está
      1/5 `pass` (o item automatizado), 4/5 `pending`. A cobertura de lógica é
      genuinamente forte — 130 casos automatizados dirigidos verdes nesta auditoria, mais
      os 2152 da suíte completa citados em `18-UAT.md` item 5 — mas "presença + wiring
      provados" não é o mesmo que "comportamento em produção real observado", e o próprio
      `18-VERIFICATION.md` já classificou 4 dos 5 Critérios do ROADMAP como
      `PRESENT_BEHAVIOR_UNVERIFIED`, não `VERIFIED`.

**Approval:** partial — cobertura automatizada completa e verde para os 10 requisitos
(130 casos dirigidos + suíte completa já registrada), 6/6 ameaças mitigadas
(`18-SECURITY.md`), 0 achado crítico (`18-REVIEW.md`). Bloqueio remanescente é
inteiramente físico: os 4 Success Criteria de runtime real do `ROADMAP.md` aguardam
`18-UAT.md` itens 1-4 (execução do dono no aparelho), e a prova comportamental de RLS
(IDOR-01) aguarda decisão do dono sobre staging. Nenhuma lacuna de implementação ou de
teste automatizado identificada nesta auditoria.
