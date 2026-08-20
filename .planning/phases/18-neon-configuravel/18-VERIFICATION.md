---
phase: 18-neon-configuravel
verified: 2026-08-20T18:10:19Z
status: human_needed
score: 1/5 must-haves verified
behavior_unverified: 4
overrides_applied: 0
behavior_unverified_items:
  - truth: "Critério 1 do ROADMAP (THEME-01/02/03): as quatro opções trocam todos os tokens de acento em runtime sem restart e sem alterar cores funcionais — nunca renderizado numa superfície real (app no aparelho físico ou PWA em navegador real)."
    test: "No app instalado no iPhone (ou PWA real), abrir Ajustes e trocar entre as quatro cores observando SessionPlayer/Logo/botões, e confirmar que um elemento de status (ex.: Notice de perigo) permanece na cor funcional mesmo com o acento vermelho selecionado."
    expected: "Todos os tokens de acento mudam imediatamente em cada troca, sem restart e sem perda de estado da tela; cores funcionais (info/success/warning/danger) nunca mudam."
    why_human: "Lógica provada por unit tests, RTL/jsdom (themeRuntimeCoverage.test.ts, neonTheme.test.tsx, themeComponents.test.tsx) e guarda estática dos 31 consumidores — mas nenhuma delas é o app rodando de verdade num dispositivo ou navegador real. 18-UAT.md item 1 está `pending`."
  - truth: "Critério 2 do ROADMAP (PREF-01/02): a escolha persiste na conta e não vaza entre contas."
    test: "Escolher uma cor na Conta A, force-quit e reabrir o app, confirmar que a cor persiste; fazer logout/login com a Conta B e confirmar que a cor da A não vaza."
    expected: "Cor persiste após reabrir o app na mesma conta; a Conta B nunca herda a cor da Conta A."
    why_human: "Migration 0040 confirmada aplicada ao banco LOCAL por esta verificação (psql direto, ver evidência abaixo); aplicação em produção é um fato relatado de hoje (18-SECURITY.md, 18-UAT.md), não uma consulta que este verificador tenha rodado contra produção (sem acesso a credenciais de produção). Persistência ponta a ponta num dispositivo real (force-quit, troca de conta) nunca foi exercitada. 18-UAT.md item 2 está `pending`."
  - truth: "Critério 3 do ROADMAP (PREF-03): falha de persistência reverte UI e Live Activity para a cor confirmada."
    test: "Com uma Live Activity ativa, ativar modo avião, tentar trocar de cor em Ajustes, e observar a UI e o card da tela bloqueada."
    expected: "A troca não se confirma; UI reverte para a cor anterior com mensagem de erro; Live Activity permanece/reverte para a cor confirmada, sem parar numa cor intermediária."
    why_human: "Caminho de rollback confirmado por leitura de código (`ThemeProvider.runSaveToken` reatribui `confirmed = rollback` no catch) e há evidência informal do dono (coluna ausente no banco local produziu o rollback correto), mas não é o teste formal (modo avião com Live Activity ativa). 18-UAT.md item 3 está `pending`, com a nota explícita de que o cenário informal não substitui este item."
  - truth: "Critério 4 do ROADMAP (LIVE-01/02): uma Live Activity ativa muda imediatamente e estado legado cai em amarelo."
    test: "Com Live Activity ativa, trocar de cor em Ajustes e bloquear o aparelho imediatamente (sem esperar outro evento de sessão); observar um estado legado sem o campo `neonColor`, se disponível."
    expected: "O card na tela bloqueada muda para a nova cor assim que a troca é confirmada, sem esperar por outro evento de sessão; payload legado sem `neonColor` cai em amarelo sem erro de decode."
    why_human: "`setLiveActivityNeonColor` → `WidgetLiveActivity.neonAccent(for:)` com fallback amarelo confirmados por leitura de código e por testes de contrato (`liveActivityContentState.test.ts` nas 4 fases, `liveActivitySwiftContract.test.ts` para paridade das duas cópias Swift), mas nenhum card real foi observado na tela bloqueada. 18-UAT.md item 4 está `pending`. Ver também WR-01 do 18-REVIEW.md (janela estreita de staleness entre o publisher do draft e a fila de troca de tema — não bloqueante, mas relevante para este item)."
human_verification:
  - test: "No app instalado no iPhone (ou PWA real), abrir Ajustes e trocar entre as quatro cores observando SessionPlayer/Logo/botões, e confirmar que um elemento de status (ex.: Notice de perigo) permanece na cor funcional mesmo com o acento vermelho selecionado."
    expected: "Todos os tokens de acento mudam imediatamente em cada troca, sem restart e sem perda de estado da tela; cores funcionais nunca mudam."
    why_human: "Restrição estrutural do ambiente sandboxed — sem app nativo instalável nem navegador real aqui. Ver 18-UAT.md item 1."
  - test: "Escolher uma cor na Conta A, force-quit e reabrir o app, confirmar persistência; logout/login com a Conta B e confirmar que a cor não vaza."
    expected: "Cor persiste após reabrir na mesma conta; Conta B nunca herda a cor da Conta A."
    why_human: "Requer dispositivo físico logado contra produção (ou base local revertida) com duas contas reais. Ver 18-UAT.md item 2."
  - test: "Com Live Activity ativa, modo avião, trocar de cor em Ajustes e observar UI + card da tela bloqueada."
    expected: "UI reverte com mensagem de erro; Live Activity permanece/reverte para a cor confirmada."
    why_human: "Requer sessão de treino ativa real + controle físico de rede do aparelho. Ver 18-UAT.md item 3."
  - test: "Com Live Activity ativa, trocar de cor em Ajustes e bloquear o aparelho imediatamente; observar card e, se possível, um estado legado sem `neonColor`."
    expected: "Card muda de cor sem esperar outro evento de sessão; estado legado cai em amarelo sem erro."
    why_human: "Requer sessão de treino ativa real e Live Activity visível na tela bloqueada de um dispositivo físico. Ver 18-UAT.md item 4."
  - test: "Decisão do dono: aplicar `scripts/neon-rls-smoke.mjs` contra staging (prova comportamental de RLS, IDOR-01) ou aceitar a mitigação estrutural (policy RLS lida em 0000/0040) como suficiente sem prova comportamental."
    expected: "Decisão registrada — rodar o smoke contra staging com PASS, ou waive formal do item."
    why_human: "`validateStagingUrl` trava o script fora do projeto de staging por desenho; é decisão de escopo/infra do dono, não algo que o código resolve sozinho. Ver 18-SECURITY.md, Follow-ups."
---

# Phase 18: Neon configurável Verification Report

**Phase Goal:** Trocar o acento neon global em runtime entre amarelo, azul, verde e
vermelho a partir de Ajustes, com persistência por conta e propagação para a Live
Activity ativa.

**Verified:** 2026-08-20T18:10:19Z
**Status:** human_needed
**Re-verification:** No — initial verification (fase sem `-PLAN.md`; planos 18-11 a
18-15 nunca existiram como arquivos — ver Gaps Summary)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | As quatro opções trocam todos os tokens de acento em runtime sem restart e sem alterar cores funcionais | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `theme.ts` `createTheme()` deriva `accent.main/soft/border` do RGB da chave escolhida e mantém `colors.status.*` fixo (linhas 256-294); `ThemeProvider` recalcula `theme` via `useMemo` a cada `neonColor` (linha 234); guarda estática `themeRuntimeCoverage.test.ts` (9/9 passou, rodado nesta verificação) prova 31 consumidores sem captura estática do amarelo. **Nunca renderizado numa superfície real** — 18-UAT.md item 1 `pending`. |
| 2 | A escolha persiste na conta e não vaza entre contas | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `neonPreferenceRepository.saveNeonColor` faz `update` com `.eq('id', userId)` (payload de coluna única); `ThemeProvider` só assume estado quando `profileMatchesUser` (linha 143) e cai em `'yellow'` em mismatch. Migration `0040` confirmada **aplicada ao banco LOCAL** por esta verificação (`psql` direto, ver Required Artifacts). Aplicação em produção é fato relatado de hoje, não reconsultado por este verificador (sem credencial de produção). Persistência ponta-a-ponta num dispositivo real nunca exercitada — 18-UAT.md item 2 `pending`. |
| 3 | Falha de persistência reverte UI e Live Activity para a cor confirmada | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `runSaveToken` reatribui `confirmed = rollback` no `catch` (`ThemeProvider.tsx:263-265`) antes de aplicar `setState`; `setLiveActivityNeonColor` só avança `currentNeonColor` após a troca ser aceita pelo chamador. Rollback nunca exercitado com Live Activity ativa + perda de rede real — 18-UAT.md item 3 `pending` (nota do próprio roteiro: evidência informal do dono não substitui este item). |
| 4 | Uma Live Activity ativa muda imediatamente e estado legado cai em amarelo | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `WidgetLiveActivity.swift` `neonAccent(for:)` (linha 18) resolve por `switch` fechado com fallback amarelo; `liveActivityContentState.test.ts` valida decode legado nas 4 fases (`measuring`/`resting`/`readyOvertime`/`blockOnly`); `liveActivitySwiftContract.test.ts` (2/2, rodado nesta verificação) prova as duas cópias Swift byte-a-byte idênticas (`diff -q` também confirmado nesta verificação). Nenhum card real observado na tela bloqueada — 18-UAT.md item 4 `pending`. |
| 5 | TypeScript, Jest, build web e verificação nativa passam | ✓ VERIFIED | Evidência de 2026-08-20 (18-UAT.md item 5, `source: automated`): `tsc --noEmit` limpo, Jest 179/179 suítes e 2152/2152 testes verdes, 4 harnesses nativos exit 0, `npm run build:web` exit 0 com `verify-web-bundle` OK. Corroborado nesta verificação por spot-checks nomeados (ver Behavioral Spot-Checks) — todos passaram. |

**Score:** 1/5 truths verified (4 present, behavior-unverified)

### Ponto de ceticismo — por que 4 dos 5 critérios ficam PRESENT_BEHAVIOR_UNVERIFIED, não VERIFIED

Os quatro primeiros critérios do ROADMAP são, por definição, transições de estado
observáveis em runtime (troca de acento sem restart, persistência entre sessões,
rollback sob falha de rede, atualização imediata da Live Activity). A fase tem
cobertura de teste genuinamente forte para a *lógica* — unit tests da fábrica de
tema, testes de comportamento RTL/jsdom do `SettingsScreen`, guarda estática
recursiva dos 31 consumidores, testes de contrato do `ContentState` nas 4 fases da
Live Activity, e paridade byte-a-byte das duas cópias Swift. Isso é mais forte que
presença de símbolo. Mas nenhuma dessas evidências é o app rodando de verdade: o
próprio `18-UAT.md`, criado hoje, existe precisamente porque nenhum dos cinco
critérios "está fisicamente validado" (citação literal do `ROADMAP.md`) e registra
os itens 1-4 como `pending`. Por isso mantenho a classificação
PRESENT_BEHAVIOR_UNVERIFIED em vez de VERIFIED — presença + wiring provados, o
comportamento em produção real (dispositivo físico ou navegador real) ainda não.

### Required Artifacts (amostra verificada por leitura direta do código + execução)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/theme/theme.ts` | 4 chaves fechadas, derivados de RGB, fallback amarelo, status invariante | ✓ VERIFIED | Código lido linha a linha; `NEON_COLOR_KEYS`/`NEON_COLORS` congelados, `parseNeonColor` faz allowlist com fallback `'yellow'`, `createTheme()` deep-freeze do resultado |
| `src/theme/ThemeProvider.tsx` | Provider reativo, hidratação por identidade, preview otimista, rollback, fila serial | ✓ VERIFIED | 427 linhas lidas; `stateForProfile`, `runSaveToken`, `persistNeonColor`, `retryNeonColor` presentes e coerentes com PREF-02/03 |
| `src/services/neonPreferenceRepository.ts` | Update restrito a `profiles.neon_color`, sem `AuthContext.updateProfile` | ✓ VERIFIED | 26 linhas; único método `saveNeonColor`, payload de coluna única com `.eq('id', userId)` |
| `supabase/migrations/0040_profiles_neon_color.sql` | Coluna `text NOT NULL DEFAULT 'yellow'` com CHECK fechado, RLS preservado | ✓ VERIFIED (local) | **Aplicada e confirmada no banco local por esta verificação**: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.profiles"` mostra `neon_color text not null default 'yellow'::text` e `CHECK (neon_color = ANY (ARRAY['yellow','blue','green','red']))`. Aplicação em produção: fato relatado hoje em 18-SECURITY.md/18-UAT.md, não requerido de novo por este verificador (sem acesso a credencial de produção) |
| `src/screens/SettingsScreen.tsx` | 4 opções em radios, roving focus, delega ao provider (SET-01/02) | ✓ VERIFIED | Cabeçalho lido; `useTheme()`/`useThemeStyles()` consumidos, nenhum estado de seleção paralelo encontrado |
| `App.tsx` — ponte `onThemeChange` → `setLiveActivityNeonColor` | Ligação real entre ThemeProvider e Live Activity | ✓ VERIFIED (wiring) | `grep` confirma `<ThemeProvider ... onThemeChange={setLiveActivityNeonColor}>`; nenhuma prova de montagem real da árvore (LIVE-01, ver REQUIREMENTS.md) |
| `src/native/liveActivitySync.ts` | `setLiveActivityNeonColor` com fila serial, fallback amarelo | ✓ VERIFIED | `currentNeonColor`/`themeUpdateQueue` presentes; ver WR-01 do 18-REVIEW.md para uma janela estreita de staleness (não bloqueante) |
| `targets/session-widget/WidgetLiveActivity.swift` + `modules/live-activity/ios/SessionActivityAttributes.swift` (2 cópias) | Resolver `neonAccent(for:)` com fallback amarelo; cópias idênticas | ✓ VERIFIED | `neonAccent` lido; `diff -q` das duas cópias executado nesta verificação — idênticas |
| `scripts/neon-rls-smoke.mjs` | Prova comportamental de RLS, staging-only por desenho | ✓ VERIFIED (nunca executado contra staging real) | `validateStagingUrl` confirmado travando fora do projeto de staging; ver Follow-up IDOR-01 em 18-SECURITY.md |
| `__tests__/themeRuntimeCoverage.test.ts` | Guarda estática dos 31 consumidores | ✓ VERIFIED | Rodado nesta verificação: 9/9 passou |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `App.tsx` | `ThemeProvider` | prop `onThemeChange={setLiveActivityNeonColor}` | ✓ WIRED (grep confirmado; montagem real não testada) |
| `SettingsScreen.tsx` | `ThemeProvider.selectNeonColor` | `useTheme()` hook, sem estado paralelo | ✓ WIRED |
| `ThemeProvider.runSaveToken` | `neonPreferenceRepository.saveNeonColor` | `require()` em call-time (evita poluir grafo estático do bundle) | ✓ WIRED |
| `neonPreferenceRepository.saveNeonColor` | Supabase `profiles` (PostgREST) | `.update({neon_color}).eq('id', userId)` | ✓ WIRED (schema local confirmado; produção assumida por relato de hoje) |
| `ThemeProvider.onThemeChange` | `liveActivitySync.setLiveActivityNeonColor` | callback direto | ✓ WIRED |
| `setLiveActivityNeonColor` | `WidgetLiveActivity.neonAccent(for:)` | `ContentState.neonColor` opcional no contrato Swift | ✓ WIRED (contrato testado; renderização real não confirmada) |

### Behavioral Spot-Checks (rodados nesta verificação, não apenas citados do SUMMARY)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Guarda de cobertura runtime dos 31 consumidores (THEME-02) | `npx jest __tests__/themeRuntimeCoverage.test.ts` | 9 passed | ✓ PASS |
| Fábrica de tema / paleta fechada (THEME-01) | `npx jest __tests__/neonTheme.test.tsx` | incluído nos 40 passed abaixo | ✓ PASS |
| Paridade das duas cópias Swift (LIVE-02) | `npx jest __tests__/liveActivitySwiftContract.test.ts` | incluído nos 40 passed abaixo | ✓ PASS |
| (agregado) `neonTheme.test.tsx` + `liveActivitySwiftContract.test.ts` | `npx jest __tests__/neonTheme.test.tsx __tests__/liveActivitySwiftContract.test.ts` | 2 suítes, 40 passed | ✓ PASS |
| Contrato da migration 0040 (PREF-01, estrutural) | `python3 -m pytest backend/tests/test_migration_neon_color.py -q` | 7 passed | ✓ PASS |
| Migration 0040 aplicada ao banco local (verificação independente, não citação do SUMMARY) | `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.profiles"` | `neon_color text not null default 'yellow'` + CHECK presente | ✓ PASS |
| Paridade Swift via diff de arquivo (independente do teste JS) | `diff -q modules/live-activity/ios/SessionActivityAttributes.swift targets/session-widget/SessionActivityAttributes.swift` | sem diferença | ✓ PASS |
| Working tree limpo (nenhuma mudança não commitada nos artefatos revisados) | `git status --short` | vazio | ✓ PASS |

Suíte completa (179 suítes/2152 testes, `tsc --noEmit`, `npm run build:web`, 4
harnesses nativos) — **não re-rodada nesta verificação** (fato já estabelecido,
evidência de 2026-08-20 citada em `18-UAT.md` item 5); os spot-checks acima usam
testes nomeados/comandos independentes, sem repetir a suíte inteira.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| THEME-01 | 18-01 (theme.ts), 18-09 (resolver Swift) | ⚠️ Human needed | Paleta fechada, derivados RGB e fallback confirmados no código; sem UAT visual real (verdade 1) |
| THEME-02 | 18-04 a 18-10 | ⚠️ Human needed | Guarda dos 31 consumidores passou (rodada nesta verificação); sem renderização real (verdade 1) |
| THEME-03 | 18-05 | ⚠️ Human needed | `colors.status` invariante confirmado em `createTheme()`; sem UAT visual real (verdade 1) |
| PREF-01 | 18-02, 18-03 | ⚠️ Human needed | Migration aplicada ao **local**, confirmada por esta verificação; produção relatada, não reconsultada aqui; prova comportamental de RLS (IDOR-01) pendente de decisão do dono para staging |
| PREF-02 | 18-01, 18-04 | ⚠️ Human needed | Hidratação por identidade e repository dedicado confirmados no código; persistência ponta-a-ponta em dispositivo real não exercitada (verdade 2) |
| PREF-03 | 18-01, 18-08 | ⚠️ Human needed | Rollback confirmado no código; divergência aberta e já documentada (duplo toque serializa 2 chamadas, não 1 — decisão do dono, não é falha da verdade 3 do ROADMAP); teste físico de modo avião pendente |
| SET-01 | 18-04 | ⚠️ Human needed | Rota `ProfileStack.Settings`, navegação a partir de "Preferências" confirmadas no código; sem UAT de leitor de tela/browser real |
| SET-02 | 18-04 | ⚠️ Human needed | Delegação total ao provider confirmada (nenhum estado paralelo no `SettingsScreen`); mesma pendência física de SET-01 |
| LIVE-01 | 18-08 | ⚠️ Human needed | Ligação `App.tsx → setLiveActivityNeonColor` confirmada por grep nesta verificação; sem teste de montagem real da árvore (WR-01 do REVIEW aponta janela de staleness relacionada, não bloqueante) |
| LIVE-02 | 18-08, 18-09 | ⚠️ Human needed | Contrato `ContentState`/fallback/paridade Swift confirmados por teste (rodado nesta verificação); sem `xcodebuild` Release + device físico |

Todos os 10 requisitos declarados no `ROADMAP.md` (`Requirements:` da Fase 18)
aparecem em `REQUIREMENTS.md` sob a seção v1.4 — nenhum requisito órfão
encontrado. `REQUIREMENTS.md` já marca todos como `[ ]` (não completos) na sua
própria tabela de traceability, coerente com esta verificação — não há
discrepância de documentação a sinalizar aqui (diferente da Fase 17).

### Anti-Patterns Found

Nenhum. Varredura de `TODO|FIXME|TBD|XXX|HACK|PLACEHOLDER|not yet implemented|coming soon`
nos artefatos centrais da fase (theme, ThemeProvider, repository, SettingsScreen,
ProfileScreen, liveActivitySync, liveActivityContentState, Swift do widget, scripts
de UAT/RLS/resign, migration) não retornou ocorrência real (um falso positivo de
`XXXXXX` do template `mktemp` em `resign.sh` foi descartado). Consistente com
`18-REVIEW.md` (0 crítico, 3 warnings de qualidade/estilo não-bloqueantes: WR-01
staleness de draft na Live Activity, WR-02 mutação de `SaveToken` em vez de
objeto imutável — desvio da regra global de imutabilidade, contido e sem bug
observado, WR-03 roving-focus não resincroniza após hidratação assíncrona) e com
`18-SECURITY.md` (`threats_open: 0`, 6/6 mitigados por leitura de código/SQL).

### Human Verification Required

Ver os cinco itens em `human_verification` no frontmatter — mapeiam 1:1 os
Critérios 1-4 do ROADMAP (pendentes em `18-UAT.md`) mais a decisão de staging
para a prova comportamental de RLS (IDOR-01, `18-SECURITY.md`).

### Gaps Summary

Nenhum gap de código encontrado — a lógica, o wiring e os testes automatizados
das 10 plans executadas (18-01 a 18-10) estão presentes, coerentes entre si e
sem placeholder ou stub. A migration 0040 está aplicada e correta no banco
**local** (confirmado nesta verificação por consulta direta ao Postgres, não
apenas por citação do SUMMARY). O único bloqueio para fechar a fase é **físico,
não de implementação**: os quatro primeiros Success Criteria do ROADMAP exigem
observação num dispositivo/navegador real, e o roteiro formal para isso
(`18-UAT.md`, criado hoje) tem 4 dos 5 itens `pending` — nenhum aceito nem
reprovado ainda. Os planos 18-11 a 18-15 citados no `ROADMAP.md` nunca existiram
como arquivos: 18-11/18-12 (decisão de integração/renumeração da migration)
foram superados pelos eventos do merge `42f1e58` e não se aplicam mais; 18-13/18-14
(decisão para staging, push com prova de RLS) permanecem como a decisão pendente
de IDOR-01 listada acima; 18-15 (gate agregado com UAT web/iPhone) é, na prática,
o próprio `18-UAT.md` que este relatório cita — ainda em andamento, não
substituído por nenhum artefato adicional. Critério 5 (automatizado) está
fechado com evidência corroborada nesta verificação.

---

_Verified: 2026-08-20T18:10:19Z_
_Verifier: Claude (gsd-verifier)_
