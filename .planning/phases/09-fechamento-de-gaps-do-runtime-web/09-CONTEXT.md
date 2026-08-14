# Phase 9: Fechamento de gaps do runtime web - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning
**Source:** Discuss-phase com o dono — 3 áreas discutidas (Visual do diálogo web,
Ciclo do Wake Lock, Guarda de regressão), 8 decisões travadas. Scout de código
prévio (grafo + rg) corrigiu a premissa do roadmap: ver `<specifics>`.

<domain>
## Phase Boundary

**IN:** WEB-01 — shim central de `Alert.alert` (mesma assinatura, `Platform.OS`
decide dentro do módulo, padrão `haptics.ts`/`secureStorage.ts`), componente
`AlertHost` web no molde dos sheets existentes, migração dos 12 call sites,
remoção do import morto, auditoria completa da classe e guarda permanente de
regressão. SESS-01 — ciclo de vida do Wake Lock durante a sessão ativa
(`useKeepAwake` JÁ roda na `ActiveSessionScreen`): liberação ao concluir,
re-aquisição ao voltar do background, fallback silencioso sem suporte.

**OUT:** Manifest/splash/ícones (Fase 10); service worker (Fase 11); página
`/instalar` (Fase 12); push (Fase 13); `Alert.prompt` (nenhum call site usa);
qualquer mudança de comportamento no alvo nativo (repasse puro); refactor das
telas além da troca do import.

</domain>

<decisions>
## Implementation Decisions

### Visual e contrato do diálogo web

- **D-01:** Shim central com a **mesma assinatura** de `Alert.alert`
  (`alert(title, message?, buttons?)`) — os 12 call sites mudam **só o import**,
  nunca a chamada. Recomendação da pesquisa (`.planning/research/ARCHITECTURE.md`
  §(c)) confirmada pelo dono.
- **D-02:** No **web**, o diálogo é **Modal custom temático** — componente
  `AlertHost` global no molde exato dos 5 sheets existentes (Modal nativo do RN +
  `StyleSheet.create` + `src/theme/theme.ts`). Nada de `window.alert`/
  `window.confirm`. Precisa cobrir: 1 botão informativo (10 casos), 2 botões
  confirmar/cancelar (2 casos), estilo `destructive` (1 caso:
  `JointLobbyScreen`), `onPress` async (signOut, navigate).
- **D-03:** No **nativo**, o shim **repassa para `Alert.alert`** — `Platform.OS`
  decide dentro do shim, call site não tem branch de plataforma. Padrão idêntico
  a `haptics.ts:10` e `secureStorage.ts:30`.
- **D-04:** `AlertHost` montado **uma vez** em `App.tsx` (junto ao
  `RootNavigator`, dentro do `AuthProvider` — `App.tsx:32-34` é o único ponto de
  composição global do app).

### Ciclo do Wake Lock (SESS-01)

- **D-05:** O lock é **liberado ao concluir** a sessão (quando `status` vira
  `'finished'`) — a tela de resumo pós-treino JÁ deixa o iPhone bloquear
  normalmente. Muda o comportamento atual (hoje `useKeepAwake` em
  `ActiveSessionScreen.tsx:72` só solta no desmonte via `popToTop`).
- **D-06:** Sem suporte a Wake Lock (iOS < 16.4, browser incompatível):
  **silencioso, no-op** — mesmo padrão de `haptics.ts`; nenhum aviso, nenhuma UI
  nova.
- **D-07:** Ao voltar do background/tela bloqueada no meio do treino, o lock é
  **re-adquirido sempre**. O researcher DEVE confirmar se o
  `expo-keep-awake@~15.0.8` web (`ExpoKeepAwake.web.ts`) já re-adquire em
  `visibilitychange`; se não, a fase adiciona listener próprio re-ativando o
  lock. O critério de UAT no iPhone real depende disso.

### Guarda de regressão

- **D-08:** A auditoria vira **guarda permanente**: teste jest que varre `src/` e
  falha se aparecer `Alert.alert`/import de `Alert` de `react-native` fora do
  shim/`AlertHost`. Protege as Fases 10-13 (ex.: opt-in de push) do pitfall de
  classe (`.planning/research/PITFALLS.md` §Pitfall 5). Adicionalmente, teste de
  render + callbacks do modo web com `@testing-library/react-native` (precedente:
  `__tests__/secureStorageWeb.test.ts` com `Platform.OS` mockado).

### Claude's Discretion

- Nome/local exatos dos arquivos novos (ex.: `src/utils/alertShim.ts`,
  `src/components/AlertHost.tsx`), seguindo `.planning/codebase/CONVENTIONS.md`.
- Detalhes visuais do modal (espaçamento, animação, backdrop) dentro do
  `theme.ts` e do molde dos sheets.
- Mecânica exata da liberação ao concluir (D-05): desativar por tag,
  condicionar o hook a subcomponente, etc. — desde que o resumo fique sem lock.
- Implementação exata da guarda D-08 (teste de varredura vs regra de lint).
- Remoção do import morto de `Alert` em `src/screens/PostQuestionnaireChat.tsx:11`
  no mesmo passe de migração (necessária para a auditoria zerar).
- Copy dos diálogos: manter os textos atuais dos 12 call sites (migração é de
  mecanismo, não de conteúdo).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pesquisa do milestone (fundamenta WEB-01)
- `.planning/research/ARCHITECTURE.md` — linha 21: inventário original de call
  sites; §(c) (linhas 184+): padrão recomendado do shim (mesma assinatura, não
  `Platform.select` espalhado) e o teste isolado no-op × `window.confirm`.
- `.planning/research/PITFALLS.md` §Pitfall 5 (linhas 106-123) — no-op como
  classe, auditoria `Alert\.` completa, teste que prova modal no DOM.
- `.planning/research/STACK.md` linha 88 — shim caseiro vs
  `@blazejkustra/react-native-alert` (lib só se precisasse de `Alert.prompt` —
  não precisa).

### Código a imitar (moldes)
- `src/utils/haptics.ts` — shim por `Platform.OS` com `isWeb()` e no-op
  silencioso; molde do D-03/D-06.
- `src/services/auth/secureStorage.ts` (linhas 1-51) — segundo molde de shim;
  seus testes `__tests__/secureStorage.test.ts` e
  `__tests__/secureStorageWeb.test.ts` são o precedente do teste web do D-08.
- `src/components/session/SwapModalitySheet.tsx` — molde visual do `AlertHost`
  (Modal nativo, prop `inline`, `StyleSheet` + theme; comentário nas linhas 1-4).
- `src/theme/theme.ts` — fonte única de estilo.

### Código a modificar
- `src/screens/QuestionnaireScreen.tsx:162,424,425,426,430,512` — 6 call sites.
- `src/screens/ActiveSessionScreen.tsx:174,196,255,264` — 4 call sites; `:264` é
  a confirmação de 2 botões do critério de sucesso; `:22,72` `useKeepAwake`;
  `:252-274` conclusão (`finishSession`); `:322-338` tela de resumo
  (`status === 'finished'`).
- `src/screens/SignUpScreen.tsx:47` — call site com navigate no `onPress`.
- `src/screens/JointLobbyScreen.tsx:81` — call site destrutivo de 2 botões.
- `src/screens/PostQuestionnaireChat.tsx:11` — import morto de `Alert`.
- `App.tsx:32-34` — ponto de montagem do `AlertHost`.

### Planejamento e convenções
- `.planning/ROADMAP.md` §Phase 9 — goal e success criteria (com a correção de
  premissa registrada em `<specifics>`).
- `.planning/REQUIREMENTS.md` — WEB-01, SESS-01.
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md`,
  `.planning/codebase/ARCHITECTURE.md` — nomes, suítes planas em `__tests__/`,
  camadas.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 5 sheets prontos como molde visual (`SkipReasonSheet`, `SwapModalitySheet`,
  `AdaptationSheet`, `ReorderScopeSheet`, `RefazerTreinoSheet`) — Modal nativo RN
  + `StyleSheet` + theme, sem lib de UI (sem Paper/Tamagui/NativeWind).
- `expo-keep-awake@~15.0.8` já implementa a Web Wake Lock API
  (`node_modules/expo-keep-awake/src/ExpoKeepAwake.web.ts` —
  `navigator.wakeLock.request('screen')` com activate/deactivate por tag).
- Jest configurado (preset `jest-expo`) + `@testing-library/react-native@13`;
  precedente de teste de shim web em `__tests__/secureStorageWeb.test.ts`.

### Established Patterns
- Shim central por `Platform.OS` dentro do módulo, call site sem branch —
  `haptics.ts`, `secureStorage.ts`.
- Exceções engolidas dentro do shim (try/catch silencioso) para nunca derrubar o
  fluxo principal.
- Sem dependência nativa nova (decisão carregada da Fase 4 do v1.0).
- Verificação local: `npx tsc --noEmit` + suíte jest completa; UAT do dono no
  iPhone real fecha a fase (restrição do milestone — máquina sem Xcode).

### Integration Points
- `App.tsx:32-34` — único ponto de composição global (AuthProvider +
  RootNavigator); `AlertHost` entra aqui.
- `ActiveSessionScreen.tsx` — concentra WEB-01 (4 call sites, incluindo a
  confirmação do critério de sucesso) e SESS-01 (useKeepAwake + transição para
  `'finished'`).
- Nenhum call site usa `Alert.prompt` ou 3+ botões — o shim não precisa
  implementá-los (registrar como limitação intencional).

</code_context>

<specifics>
## Specific Ideas

- **Correção de premissa do roadmap (scout 2026-08-14):** são **12 call sites em
  4 arquivos**, não "6 arquivos" como dizem ROADMAP/REQUIREMENTS —
  `QuestionnaireScreen` (6), `ActiveSessionScreen` (4), `SignUpScreen` (1),
  `JointLobbyScreen` (1) — mais um **import morto** em
  `PostQuestionnaireChat.tsx:11`. O critério de sucesso 1 do roadmap deve ser
  lido como "12 call sites nos 4 arquivos"; a auditoria por grep permanece o
  critério objetivo.
- A pesquisa recomenda um teste isolado (`Alert.alert('teste')` no Expo web)
  para confirmar se o comportamento é no-op total ou `window.confirm` degradado
  — informativo apenas: a correção (D-01/D-02) cobre os dois casos.
- Só 2 diálogos de confirmação no app: `ActiveSessionScreen.tsx:264`
  ("Concluir treino" com séries pendentes — é o exemplo do critério de sucesso
  2) e `JointLobbyScreen.tsx:81` (sair da dupla, destrutivo).
- UAT do dono no iPhone real (PWA instalado) fecha SESS-01: tela nunca escurece
  durante sessão ativa; bloqueio volta ao normal ao concluir/sair (critério 3 do
  roadmap). "Passou no Lighthouse" nunca é critério de conclusão (restrição do
  milestone em STATE.md).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 9-Fechamento de gaps do runtime web*
*Context gathered: 2026-08-14*
