# Phase 9: Fechamento de gaps do runtime web - Research

**Researched:** 2026-08-14
**Domain:** react-native-web runtime gaps (Alert.alert no-op) + Screen Wake Lock API (Expo/expo-keep-awake) num app Expo/RN 0.81 + Zustand já em produção
**Confidence:** HIGH para o achado mandatório (D-07, lido direto no `node_modules`), HIGH para os 12 call sites (grep + leitura de cada arquivo), MEDIUM para o comportamento do Wake Lock no Safari iOS standalone (fontes externas, sem device real disponível nesta máquina) — ver `Common Pitfalls` para um achado CRÍTICO não previsto no escopo original.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visual e contrato do diálogo web**
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

**Ciclo do Wake Lock (SESS-01)**
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

**Guarda de regressão**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WEB-01 | Nenhum diálogo/botão mudo no alvo web — shim central de Alert (mesmo padrão de `haptics.ts`/`secureStorage.ts`), migração dos 12 call sites em 4 arquivos e auditoria completa da classe (`grep Alert\.` zerado ou justificado). | Ver `Architecture Patterns` (padrão do shim + `AlertHost`), `Code Examples` (todos os 12 call sites listados com linha exata e o texto real), `Common Pitfalls` (correção do jest environment para o teste de render web), `Don't Hand-Roll`. |
| SESS-01 | Durante a sessão de treino ativa, a tela do iPhone não bloqueia (Screen Wake Lock); lock liberado ao fim da sessão. | Ver `Common Pitfalls` (achado CRÍTICO: bug WebKit 254545 — Wake Lock não funciona em Home Screen Web Apps antes do iOS 18.4), `Architecture Patterns` (verdict definitivo do D-07 com evidência de código-fonte), `Code Examples` (hook de lifecycle por tag + listener de `visibilitychange`). |

</phase_requirements>

## Summary

Esta fase fecha duas dívidas técnicas independentes e já bem delimitadas pelo
`CONTEXT.md` — nenhuma das duas precisa de dependência nova. A pesquisa desta
sessão define **duas coisas que a discussão de contexto deixou em aberto**: (1)
o veredito definitivo do D-07 (`expo-keep-awake` web NÃO re-adquire o lock em
`visibilitychange` — confirmado lendo o código-fonte instalado, não por
suposição), e (2) um achado crítico fora do escopo do `CONTEXT.md`: existe um
bug documentado da própria Apple/WebKit (`bugs.webkit.org #254545`, corrigido
só no iOS **18.4**, lançado em março/2025) que faz a Screen Wake Lock API **não
funcionar em Home Screen Web Apps** (PWA instalada) em qualquer iOS entre 16.4
e 18.3.x — mesmo que `navigator.wakeLock.request()` resolva sem erro. Isso é
uma variável externa ao código do app: se o iPhone do dono estiver numa versão
< 18.4, o critério de sucesso 3 do roadmap (tela nunca escurece durante a
sessão) **não pode passar em UAT independentemente de quão correta seja a
implementação** — não é um bug da fase, é uma limitação de plataforma que
precisa ser verificada ANTES do UAT, não descoberta durante ele.

Para o WEB-01, a auditoria confirma exatamente os 12 call sites em 4 arquivos
que o `CONTEXT.md` já mapeou (com linha e texto de cada um), mais o import
morto em `PostQuestionnaireChat.tsx:11`. O padrão recomendado (shim central +
`Modal` nativo do RN + Zustand, já dependência) é o mesmo já usado em
`haptics.ts`/`secureStorage.ts` e no molde visual de `SwapModalitySheet.tsx` —
zero biblioteca nova. Um detalhe não documentado no `CONTEXT.md`: o call site de
`JointLobbyScreen.tsx:81` não é uma chamada solta — é a implementação padrão
(`confirmarPadrao`) de um prop injetável (`confirmar`) que os testes existentes
(`__tests__/jointLobbyScreen.test.tsx`) já substituem por um mock. A migração
troca só o corpo de `confirmarPadrao`, preservando a assinatura do prop — os
testes existentes continuam passando sem alteração, mas não cobrem o caminho
real (isso deixa uma lacuna de teste que o D-08 (guarda de regressão) e um teste
focado novo devem fechar.

Por fim, um achado de infraestrutura de teste específico deste repo: a
sugestão do `PITFALLS.md` do milestone ("assert que o modal aparece no DOM em
ambiente web/jsdom") **não se aplica literalmente** à configuração real deste
projeto — o `jest` deste repo usa o preset `jest-expo` "flat" (sem `projects`
multi-plataforma), cujo `testEnvironment` é `react-native/jest/react-native-env.js`
(nem jsdom, nem `react-native-web`). A forma correta de testar o `AlertHost`
aqui é via `@testing-library/react-native` (`render`/`getByText`/`getByTestId`),
igual ao precedente real do repo (`__tests__/swapModalitySheet.test.tsx`), não
por `document.querySelector`.

**Primary recommendation:** Shim caseiro (`alertShim.ts` + `AlertHost.tsx` via
Zustand) para WEB-01, sem lib nova; para SESS-01, trocar `useKeepAwake()` (hook
de ciclo de vida por montagem) por controle explícito via
`activateKeepAwakeAsync`/`deactivateKeepAwake` por tag dentro de um `useEffect`
que observa `status`, mais um listener de `visibilitychange` escrito à mão (o
pacote não faz isso na web) — e sinalizar ao dono, ANTES do UAT, para confirmar
a versão do iOS do iPhone de teste (bug WebKit 254545).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Diálogo/confirmação visível (WEB-01) | Browser / Client | — | `Alert.alert` é uma API 100% client-side (RN); o shim e o `AlertHost` vivem inteiramente na árvore React do app, sem I/O de rede ou servidor. |
| Estado global do diálogo ativo (fila de 1 alerta por vez) | Browser / Client | — | Store Zustand em memória, sem persistência — o alerta não sobrevive a um reload, o que é o comportamento esperado de um `Alert.alert` nativo também. |
| Ciclo de vida do Wake Lock (SESS-01) | Browser / Client | — | `navigator.wakeLock` é uma API do browser; toda a lógica de ativar/desativar/reagir a `visibilitychange` roda no cliente, sem endpoint novo. |
| Transição de status da sessão (`'active'` → `'finished'`) que dispara a liberação do lock | Browser / Client (Zustand store) | — | `status` já é um campo do `activeSessionStore` (client-side, `src/store/activeSessionStore.ts:81`); a liberação do lock reage a essa transição, não introduz uma nova fonte de verdade. |
| Guarda de regressão (D-08) | Build/Test tooling (roda no cliente do repo, não em runtime do app) | — | Teste Jest que varre arquivos-fonte — não é uma capability de runtime, é infraestrutura de qualidade que impede regressão nas Fases 10-13. |

## Standard Stack

### Core

Nenhuma dependência nova nesta fase — reaproveita exclusivamente o que já está
instalado e em produção.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-native` (`Modal`, `Platform`) | `0.81.5` (já instalada — `package.json`) | `Modal` nativo do RN é a base do `AlertHost` (mesmo componente usado pelos 5 sheets existentes); `Platform.OS` decide o branch do shim | Já é o padrão de todo o app; `react-native-web` mapeia `Modal` para um `<div>` com overlay, funcionando no PWA sem CSS extra |
| `zustand` | `^4.5.7` (já instalada — `package.json`) | Store global do `AlertHost` (estado do alerta ativo: título, mensagem, botões) | Já é a lib de estado global do projeto (`activeSessionStore.ts`, `manualPlanStore.ts`); ARCHITECTURE.md §(c) já recomenda reusar em vez de `Context`/prop drilling |
| `expo-keep-awake` | `~15.0.8` (já instalada — confirmado via `node_modules/expo-keep-awake/package.json`) `[VERIFIED: node_modules/expo-keep-awake/package.json]` | Fornece `activateKeepAwakeAsync`/`deactivateKeepAwake`/`useKeepAwake` (nativo) e o wrapper da Web Wake Lock API (web) | Já em uso em `ActiveSessionScreen.tsx:22,72`; SESS-01 é sobre corrigir o CICLO DE VIDA do uso existente, não trocar de lib |

### Supporting

Nenhuma. `theme.ts` (tokens de design) e o padrão de `StyleSheet.create` já
cobrem 100% da necessidade visual — sem `react-native-modal`, sem
`react-native-web-dialog`, sem qualquer lib de UI nova (decisão já herdada da
Fase 4 do v1.0, reafirmada em `.planning/research/ARCHITECTURE.md` e no
`CONTEXT.md` desta fase).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shim caseiro `alertShim.ts` | `@blazejkustra/react-native-alert` (npm, API idêntica ao `Alert` nativo, resolve web via `<dialog>`) | Já descartado no `STACK.md` do milestone: pacote jovem (poucas versões, baixa adoção), e nenhum call site usa `Alert.prompt` — a única razão para justificar a dependência não existe aqui. Mantido só como registro, não é uma opção viável para esta fase. |
| `useEffect` + `activate/deactivateKeepAwake` por tag | Continuar usando só `useKeepAwake()` (sem tag, mount/unmount) | `useKeepAwake()` é um HOOK — não pode ser condicionado dentro de uma função sem violar Rules of Hooks. Para liberar o lock ao atingir `status === 'finished'` **sem desmontar o componente** (a tela de resumo é renderizada pelo MESMO `ActiveSessionScreen`, dentro do branch `status === 'finished'` em vez de navegar para outra tela — ver `ActiveSessionScreen.tsx:322-340`), é preciso controle imperativo por tag, não o hook de ciclo de vida do componente. |

**Installation:** Nenhuma — todas as dependências já estão em `package.json` e
instaladas. `npm view` não é necessário para pacotes já resolvidos no lockfile;
a verificação de versão foi feita lendo `node_modules/expo-keep-awake/package.json`
diretamente (fonte primária mais confiável que o registry para "o que está
REALMENTE instalado", que é o que importa para o veredito do D-07).

## Package Legitimacy Audit

**Não aplicável nesta fase.** Nenhum pacote novo é instalado — WEB-01 usa
apenas `react-native`/`zustand` já em produção; SESS-01 usa apenas
`expo-keep-awake` já em produção. O Package Legitimacy Gate (`gsd_run query
package-legitimacy check`) não precisa rodar porque não há candidato a
verificar. Se o planner decidir, em algum ponto, introduzir uma lib para o
`AlertHost` (contrariando a decisão D-02), esta seção deve ser reaberta.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  App.tsx (raiz — App.tsx:32-34, dentro de AuthProvider)              │
│                                                                        │
│  ┌──────────────┐        ┌───────────────────────────┐               │
│  │ RootNavigator│        │ <AlertHost /> (montado 1x) │               │
│  └──────┬───────┘        └──────────────┬──────────────┘             │
│         │                               │ lê                          │
│         ▼                               ▼                             │
│  ┌─────────────────────┐      ┌──────────────────────┐               │
│  │ 4 telas (12 call     │      │ useAlertStore         │               │
│  │ sites) chamam        │─────▶│ (Zustand, em memória) │               │
│  │ showAlert(...)       │ show │ { title, message,     │               │
│  │ (mesma assinatura    │      │   buttons } | null     │               │
│  │ de Alert.alert)      │      └──────────────────────┘               │
│  └──────────┬───────────┘                                             │
│             │                                                          │
│             ▼  dentro do shim: Platform.OS decide                     │
│      ┌──────────────┐         ┌─────────────────────────┐            │
│      │ Platform.OS  │────web─▶│ AlertHost renderiza Modal │            │
│      │ !== 'web'    │         │ custom temático (D-02)    │            │
│      └──────┬───────┘         └─────────────────────────┘            │
│             │ nativo                                                   │
│             ▼                                                          │
│      ┌──────────────────┐                                             │
│      │ Alert.alert real  │  (repasse puro — D-03)                     │
│      │ (iOS/Android)     │                                             │
│      └──────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  ActiveSessionScreen.tsx — ciclo do Wake Lock (SESS-01)              │
│                                                                        │
│  useEffect (observa `status` do activeSessionStore)                  │
│    status === 'active' / 'awaiting_checkin' → activateKeepAwakeAsync │
│    status === 'finished'                     → deactivateKeepAwake    │
│                                                                        │
│  + listener de `document.visibilitychange` (só web — expo-keep-awake │
│    web NÃO reage a isso sozinho, ver Pitfall abaixo) que reativa o    │
│    lock quando o app volta a ficar visível E a sessão ainda está      │
│    ativa                                                               │
│                                                                        │
│  expo-keep-awake:                                                      │
│    nativo → módulo nativo (Activity.FLAG_KEEP_SCREEN_ON / idleTimer)  │
│    web    → navigator.wakeLock.request('screen') por tag               │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── utils/
│   └── alertShim.ts          # NOVO — showAlert(), decide Platform.OS
├── store/
│   └── alertStore.ts         # NOVO (ou inline em alertShim.ts) — Zustand
├── components/
│   └── AlertHost.tsx         # NOVO — Modal web, montado 1x em App.tsx
├── hooks/  (ou dentro do próprio screens/)
│   └── useSessionWakeLock.ts # NOVO (nome sugerido) — ciclo de vida por tag
└── screens/
    ├── ActiveSessionScreen.tsx   # MODIFICADO — 4 call sites + wake lock
    ├── QuestionnaireScreen.tsx   # MODIFICADO — 6 call sites
    ├── SignUpScreen.tsx          # MODIFICADO — 1 call site
    ├── JointLobbyScreen.tsx      # MODIFICADO — 1 call site (confirmarPadrao)
    └── PostQuestionnaireChat.tsx # MODIFICADO — remove import morto
```

`src/hooks/` não existe hoje no repo (`.planning/codebase/STRUCTURE.md` não
lista essa pasta) — avaliar se o hook de wake lock deve ficar como função
exportada dentro do próprio `ActiveSessionScreen.tsx` (mais simples, único
consumidor) em vez de criar uma pasta nova para um hook usado uma vez só.
Decisão de discretion do planner/executor.

### Pattern 1: Shim central por `Platform.OS`, mesma assinatura

**What:** Um único módulo (`alertShim.ts`) exporta uma função com a MESMA
assinatura de `Alert.alert(title, message?, buttons?)`. Por dentro, um `if
(Platform.OS !== 'web')` decide entre repassar para `Alert.alert` real (nativo)
ou disparar o estado do `AlertHost` (web).

**When to use:** Toda vez que uma API só-nativa do RN precisa de um
equivalente web — já é o padrão estabelecido em `haptics.ts` e
`secureStorage.ts` neste mesmo repo.

**Example:**
```typescript
// src/utils/alertShim.ts (novo)
// Alert.alert é no-op no react-native-web (ver PITFALLS.md do milestone,
// §Pitfall 5) — este shim resolve para um Modal custom no web e repassa
// para Alert.alert real no resto. MESMA assinatura: call sites trocam só
// o import, nunca a chamada (D-01).
import { Alert, Platform } from 'react-native';
import { useAlertStore } from '../store/alertStore';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void => {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  useAlertStore.getState().show({ title, message: message ?? null, buttons: buttons ?? null });
};
```

Fonte do padrão: `src/utils/haptics.ts:10` (`const isWeb = () => Platform.OS
=== 'web'`) e `src/services/auth/secureStorage.ts:30` (`const isWeb =
Platform.OS === 'web'`) — ambos lidos nesta sessão. `[VERIFIED:
src/utils/haptics.ts:10]` `const isWeb = () => Platform.OS === 'web';`
`[VERIFIED: src/services/auth/secureStorage.ts:30]` `const isWeb = Platform.OS
=== 'web';`

### Pattern 2: `AlertHost` — Modal global no molde dos sheets existentes

**What:** Um componente montado uma única vez em `App.tsx`, que lê o estado do
`useAlertStore` e renderiza um `Modal` do RN (`transparent`, `animationType`)
com backdrop, card, título, mensagem e botões — visualmente idêntico ao molde
de `SwapModalitySheet.tsx`.

**When to use:** É o único consumidor visual do estado gravado por `showAlert`.

**Example:**
```typescript
// src/components/AlertHost.tsx (novo)
// Montado 1x em App.tsx (D-04). Renderiza o alerta ativo do useAlertStore —
// molde visual de SwapModalitySheet.tsx (Modal nativo + StyleSheet + theme).
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import theme from '../theme/theme';
import { useAlertStore } from '../store/alertStore';

const AlertHost = () => {
  const alert = useAlertStore((s) => s.current);
  const dismiss = useAlertStore((s) => s.dismiss);

  if (!alert) return null;

  // 1 botão informativo é o caso mais comum (10/12 call sites) — default
  // sensato quando `buttons` vem undefined (mesmo default do Alert.alert
  // nativo, que mostra só "OK").
  const buttons = alert.buttons ?? [{ text: 'OK' }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} testID="alert-host-backdrop">
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">{alert.title}</Text>
          {alert.message ? <Text style={styles.message}>{alert.message}</Text> : null}
          <View style={styles.buttonRow}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={`${b.text}-${i}`}
                style={[styles.button, b.style === 'destructive' && styles.buttonDestructive]}
                onPress={() => {
                  dismiss();
                  // onPress pode ser async (signOut, navigate) — o shim não
                  // espera a Promise, igual ao Alert.alert nativo.
                  b.onPress?.();
                }}
                testID={`alert-host-button-${i}`}
              >
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'cancel' && styles.buttonTextCancel,
                    b.style === 'destructive' && styles.buttonTextDestructive,
                  ]}
                >
                  {b.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.overlay },
  card: {
    minWidth: 280,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.xxl,
    backgroundColor: theme.colors.surface.card,
    ...theme.elevation.floating,
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  message: { marginTop: theme.spacing.sm, color: theme.colors.text.secondary, fontFamily: theme.fonts.ui },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: theme.spacing.lg, gap: theme.spacing.md },
  button: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  buttonDestructive: {},
  buttonText: { color: theme.colors.text.accent, fontFamily: theme.fonts.ui, fontWeight: theme.typography.fontWeights.semiBold },
  buttonTextCancel: { color: theme.colors.text.quiet },
  buttonTextDestructive: { color: theme.colors.status?.danger ?? theme.colors.text.accent },
});

export default AlertHost;
```

`theme.colors.overlay`, `theme.elevation.floating`, `theme.borderRadius.xxl`,
`theme.spacing.xl`, `theme.colors.surface.card` são todos tokens reais, lidos
em `src/components/session/SwapModalitySheet.tsx` (linhas 202, 210, 207, 205,
209) nesta sessão — `[VERIFIED: src/components/session/SwapModalitySheet.tsx:199-211]`
(bloco `styles.backdrop`/`styles.card`, quote: `backgroundColor:
theme.colors.overlay` / `...theme.elevation.floating` /
`borderTopLeftRadius: theme.borderRadius.xxl` /
`backgroundColor: theme.colors.surface.card`). `theme.colors.status.danger`
NÃO foi confirmado nesta sessão (não lido em `theme.ts`) — tratar como
`[ASSUMED]` e verificar o token real de "destructive"/"danger" em `theme.ts`
antes de codar (o componente `Notice` já usa `tone="danger"` em
`ActiveSessionScreen.tsx:421`, sinal de que existe um token equivalente, mas o
nome exato não foi lido).

### Pattern 3: Store Zustand mínimo para o alerta ativo

**Example:**
```typescript
// src/store/alertStore.ts (novo)
import { create } from 'zustand';
import type { AlertButton } from '../utils/alertShim';

type AlertState = {
  current: { title: string; message: string | null; buttons: AlertButton[] | null } | null;
  show: (a: { title: string; message: string | null; buttons: AlertButton[] | null }) => void;
  dismiss: () => void;
};

export const useAlertStore = create<AlertState>((set) => ({
  current: null,
  show: (a) => set({ current: a }),
  dismiss: () => set({ current: null }),
}));
```

Padrão `create<State>((set, get) => (...))` confirmado em
`src/store/manualPlanStore.ts:149` e `src/store/activeSessionStore.ts:542`
`[VERIFIED: src/store/manualPlanStore.ts:149]` `export const useManualPlanStore
= create<ManualPlanState>((set, get) => {`.

### Pattern 4: Migração de um call site (mecânica idêntica nos 12)

**What:** Trocar só o import e o nome da função — a chamada em si (argumentos)
não muda.

**Example (ActiveSessionScreen.tsx:264 — o caso do critério de sucesso 2):**
```typescript
// ANTES
import { Alert } from 'react-native';
// ...
Alert.alert(
  'Concluir treino?',
  'Ainda há séries não registradas. Deseja concluir mesmo assim?',
  [
    { text: 'Continuar treino', style: 'cancel' },
    { text: 'Concluir', onPress: finalizar },
  ],
);

// DEPOIS
import { showAlert } from '../utils/alertShim';
// ...
showAlert(
  'Concluir treino?',
  'Ainda há séries não registradas. Deseja concluir mesmo assim?',
  [
    { text: 'Continuar treino', style: 'cancel' },
    { text: 'Concluir', onPress: finalizar },
  ],
);
```
`[VERIFIED: src/screens/ActiveSessionScreen.tsx:264-271]` — texto exato lido
nesta sessão: `Alert.alert(\n        'Concluir treino?',\n
'Ainda há séries não registradas. Deseja concluir mesmo assim?',\n        [\n
{ text: 'Continuar treino', style: 'cancel' },\n          { text: 'Concluir',
onPress: finalizar },\n        ],\n      );`

**Caso especial — `JointLobbyScreen.tsx:81`:** não é uma chamada solta dentro
de um handler, é o corpo de uma função default de um prop injetável:
```typescript
// ANTES (linha 80-84, verbatim)
const confirmarPadrao = (titulo: string, mensagem: string, onSim: () => void) =>
  Alert.alert(titulo, mensagem, [
    { text: 'Ficar no treino', style: 'cancel' },
    { text: 'Encerrar', style: 'destructive', onPress: onSim },
  ]);

// DEPOIS — só o corpo muda; a assinatura do prop `confirmar` (usada por
// __tests__/jointLobbyScreen.test.tsx:67 para injetar um mock) NÃO muda.
const confirmarPadrao = (titulo: string, mensagem: string, onSim: () => void) =>
  showAlert(titulo, mensagem, [
    { text: 'Ficar no treino', style: 'cancel' },
    { text: 'Encerrar', style: 'destructive', onPress: onSim },
  ]);
```
`[VERIFIED: src/screens/JointLobbyScreen.tsx:80-84]` quote: `const
confirmarPadrao = (titulo: string, mensagem: string, onSim: () => void) =>\n
Alert.alert(titulo, mensagem, [\n    { text: 'Ficar no treino', style:
'cancel' },\n    { text: 'Encerrar', style: 'destructive', onPress: onSim
},\n  ]);`. `JointLobbyScreen` (export default, `src/screens/JointLobbyScreen.tsx:502`)
renderiza `<JointLobbyView ... />` **sem** passar `confirmar`
`[VERIFIED: src/screens/JointLobbyScreen.tsx:489-497]` — confirma que
`confirmarPadrao` roda de verdade em produção, não é código morto.

### Pattern 5: Ciclo de vida do Wake Lock por tag (D-05)

**What:** Em vez de `useKeepAwake()` sem argumento (tag automática via
`useId()`, liberado só no unmount), usar `activateKeepAwakeAsync(tag)` /
`deactivateKeepAwake(tag)` diretamente, dentro de um `useEffect` que observa
`status` do `activeSessionStore`.

**Why:** `useKeepAwake()` é um HOOK — React proíbe chamá-lo condicionalmente. A
tela de resumo (`status === 'finished'`) é renderizada pelo MESMO componente
`ActiveSessionScreen` (branch dentro do mesmo function component, ver
`ActiveSessionScreen.tsx:323-340` `[VERIFIED: src/screens/ActiveSessionScreen.tsx:322-340]`
quote: `if (status === 'finished') {\n    return (\n      <SafeAreaView
style={styles.container} edges={['top']}>\n        <SessionSummary`), então o
componente NÃO desmonta ao concluir — só troca de branch de render. Isso
significa que a limpeza automática do `useEffect` de `useKeepAwake()` (que só
roda no **unmount**, ver `node_modules/expo-keep-awake/src/index.ts:38-45`)
nunca dispara na transição para `'finished'`. É preciso desativar
explicitamente reagindo à mudança de `status`, não confiar no ciclo de
montagem.

**Example:**
```typescript
// dentro de ActiveSessionScreen.tsx — substitui a linha 72 (useKeepAwake())
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const WAKE_LOCK_TAG = 'active-session'; // tag fixa e nomeada — não usar useId()
                                          // (precisa ser a MESMA entre ativação
                                          // e desativação em efeitos separados)

useEffect(() => {
  // status === 'finished' ou telas de erro/loading: nunca segura a tela.
  const deveSegurarTela = status === 'awaiting_checkin' || status === 'active';
  if (!deveSegurarTela) {
    deactivateKeepAwake(WAKE_LOCK_TAG).catch(() => {
      // ERR_KEEP_AWAKE_TAG_INVALID esperado se nunca foi ativado — no-op (D-06).
    });
    return;
  }
  activateKeepAwakeAsync(WAKE_LOCK_TAG).catch(() => {
    // Sem suporte (iOS < 16.4, browser incompatível): silencioso (D-06).
  });
  return () => {
    deactivateKeepAwake(WAKE_LOCK_TAG).catch(() => {});
  };
}, [status]);
```

`ERR_KEEP_AWAKE_TAG_INVALID` é o código de erro real lançado por
`deactivate()` quando a tag não está ativa — `[VERIFIED:
node_modules/expo-keep-awake/src/ExpoKeepAwake.web.ts:44-49]` quote: `} else
{\n      throw new CodedError(\n        'ERR_KEEP_AWAKE_TAG_INVALID',\n
\`The wake lock with tag ${tag} has not activated yet\`\n      );\n    }`.
`status` é o campo `type Status = 'idle' | 'loading' | 'awaiting_checkin' |
'active' | 'finished' | 'error';` `[VERIFIED: src/store/activeSessionStore.ts:81]`.

### Pattern 6: Re-aquisição em `visibilitychange` (D-07, obrigatório)

**Verdict definitivo do D-07:** `expo-keep-awake@15.0.8` web **NÃO**
re-adquire o lock em `visibilitychange`. Evidência: o arquivo inteiro
`node_modules/expo-keep-awake/src/ExpoKeepAwake.web.ts` (77 linhas, lido
integralmente nesta sessão) não contém nenhuma ocorrência de
`visibilitychange`, `visibilityState`, ou qualquer listener de `document`.
`[VERIFIED: node_modules/expo-keep-awake/src/ExpoKeepAwake.web.ts:1-77]` — o
módulo só expõe `isAvailableAsync`, `activate(tag)`, `deactivate(tag)` e
`addListenerForTag(tag, listener)` (este último só ESCUTA o evento nativo
`release` do próprio `WakeLockSentinel` do browser — `sentinel.addEventListener('release',
eventListener)`, linha 59 — não re-adquire nada, só notifica). Uma busca
adicional em `node_modules/expo-keep-awake/build/` (JS compilado) confirma:
zero ocorrências de `visibilitychange` em todo o pacote instalado. **A fase
PRECISA adicionar seu próprio listener.**

```typescript
// Complementa o Pattern 5 — só necessário no ramo web, mas inofensivo em
// nativo (document pode não existir; guard defensivo).
useEffect(() => {
  if (typeof document === 'undefined') return; // nativo: sem document global
  const deveSegurarTela = status === 'awaiting_checkin' || status === 'active';
  if (!deveSegurarTela) return;

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // O browser já liberou o lock ao esconder a página (comportamento
      // padrão da Screen Wake Lock API) — reativa por cima, idempotente o
      // bastante porque activate() sempre sobrescreve wakeLockMap[tag].
      activateKeepAwakeAsync(WAKE_LOCK_TAG).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}, [status]);
```

Padrão de re-aquisição em si (`document.addEventListener('visibilitychange',
...)` chamando `request('screen')` de novo quando `visibilityState ===
'visible'`) é o padrão oficial documentado pela MDN — `[CITED:
developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diálogo modal cross-platform | Um novo componente de "confirm dialog" do zero com `window.confirm`/CSS solto | `Modal` do RN + `StyleSheet` + `theme.ts`, no molde de `SwapModalitySheet.tsx` | Já existe padrão consolidado no repo para 5 sheets diferentes — reusar reduz superfície de bug visual (dark theme, backdrop, elevação) |
| Fila/estado de "qual alerta está aberto agora" | Um sistema de fila de múltiplos alertas empilhados | Zustand com um único slot `current` (1 alerta por vez) | `Alert.alert` nativo também é sempre 1 por vez — não inventar suporte a alertas simultâneos que o app nunca precisou |
| Detecção de suporte a Wake Lock | `try { navigator.wakeLock } catch` espalhado pelas telas | `expo-keep-awake`'s `isAvailableAsync()`/o próprio `try/catch` silencioso em volta de `activateKeepAwakeAsync` | A lib já encapsula a feature detection (`'wakeLock' in navigator`) — reimplementar duplica a mesma checagem em cada call site |
| Guarda de regressão do grep | Regra de ESLint customizada (`no-restricted-imports` com config própria) | Teste Jest que varre `src/` com `readdirSync`/`readFileSync`, no molde de `__tests__/loadInputLayoutWeb.test.ts` (bloco "regra geral: TextInput com flex precisa de minWidth 0") | O repo **não tem** lint gate funcional (`AGENTS.md`: "Não há `npm run lint`... qualidade via `npx tsc --noEmit`, `npx jest`") — uma regra de ESLint não rodaria em nenhum portão real; o precedente de teste-varredura já existe e roda no `npx jest` que o time já usa |

**Key insight:** este projeto já tem os três precedentes que esta fase precisa
(shim por `Platform.OS`, sheet visual em `Modal`, teste de varredura de
arquivos) — o trabalho é 100% de composição desses padrões existentes, não de
criação de padrão novo.

## Common Pitfalls

### Pitfall 1 (CRÍTICO — fora do escopo original do CONTEXT.md): Wake Lock não funciona em Home Screen Web Apps antes do iOS 18.4

**What goes wrong:** Mesmo com toda a implementação de SESS-01 correta —
`navigator.wakeLock.request('screen')` resolve sem lançar erro, o
`WakeLockSentinel` retornado parece válido — a tela do iPhone **ainda
escurece e bloqueia** durante a sessão de treino, especificamente quando o app
está rodando como PWA instalado (standalone, "Home Screen Web App"). No
Safari comum (aba do navegador, não instalado) o mesmo código funciona.

**Why it happens:** Bug documentado e confirmado pela própria Apple/WebKit —
[`bugs.webkit.org/show_bug.cgi?id=254545`](https://bugs.webkit.org/show_bug.cgi?id=254545)
("New Wake Lock API does not work in Home Screen Web Apps"), reportado em
27/03/2023, **RESOLVIDO FIXED** só no lançamento do iOS/iPadOS **18.4** (31 de
março de 2025) — confirmado no changelog oficial da WebKit:
[`webkit.org/blog/16574/webkit-features-in-safari-18-4`](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/),
trecho exato: "Fixed Screen Wake Lock API for Home Screen Web Apps.
(108573133)" e "The Screen Wake Lock API now also works in Home Screen Web
Apps on iOS and iPadOS 18.4." `[CITED: webkit.org/blog/16574/webkit-features-in-safari-18-4]`.
Isso significa: em QUALQUER iOS entre 16.4 (quando a API foi introduzida) e
18.3.x, o Wake Lock funciona no Safari mas silenciosamente NÃO funciona depois
de "Adicionar à Tela de Início" — exatamente o modo de uso que este milestone
inteiro (v1.2) está construindo.

**How to avoid:**
- Isto não é corrigível por código do app — é uma limitação da plataforma que
  só a Apple resolve, e só a partir do iOS 18.4.
- **Ação obrigatória antes do UAT:** perguntar ao dono a versão do iOS do
  iPhone de teste (Ajustes → Geral → Informações → Versão do software). Se for
  < 18.4, o UAT desta fase **vai falhar mesmo com código perfeito** — isso
  precisa ser comunicado ANTES de rodar o UAT, não descoberto durante ele
  (evita a impressão de "a implementação está quebrada" quando na verdade é
  limitação documentada de plataforma).
- Se a versão for < 18.4, a fase ainda deve implementar SESS-01 corretamente
  (o código É a correção certa e funcionará automaticamente quando o iPhone
  atualizar) — mas o critério de sucesso 3 do roadmap precisa ser registrado
  como "bloqueado por versão de iOS", não como falha de implementação.
- Este achado deve ir para `STATE.md`/`ROADMAP.md` como um risco conhecido do
  milestone, não só desta fase — as fases futuras (10-13) também assumem PWA
  instalado como modo de uso principal.

**Warning signs:** UAT do dono relata "a tela ainda apaga" mesmo depois da
implementação estar tecnicamente correta (sem erro no console, sem exceção) —
primeiro passo de debug deve ser checar a versão do iOS antes de suspeitar do
código.

### Pitfall 2: `useKeepAwake()` sem tag não pode ser "condicionalmente desativado" na transição para `'finished'`

**What goes wrong:** Tentar resolver D-05 mantendo `useKeepAwake()` (como está
hoje, linha 72) e só "desligando" via alguma flag condicional dentro do
próprio hook, ou envolvendo a chamada num `if` — quebra as Rules of Hooks
(hooks não podem ser chamados condicionalmente) e o linter/TypeScript
provavelmente pega isso, mas mesmo que compile, o comportamento real do
`useKeepAwake` é atrelado ao ciclo de MONTAGEM do componente
(`useEffect(() => { activate(); return () => deactivate(); }, [tag])`), não a
uma variável de estado interna — então não existe uma forma de "desligá-lo
sem desmontar" usando a API pública do hook.

**Why it happens:** O componente `ActiveSessionScreen` NÃO desmonta ao
concluir a sessão — ele troca de branch de renderização internamente
(`status === 'finished'` retorna a tela de resumo dentro do MESMO componente,
`ActiveSessionScreen.tsx:322-340`). Um dev que só olha "cadê o
`useKeepAwake()`" pode presumir que bastava mover a chamada do hook para
dentro de um branch condicional — isso é ilegal em React.

**How to avoid:** Usar as funções imperativas (`activateKeepAwakeAsync`/
`deactivateKeepAwake`, ambas assíncronas mas não-hooks) dentro de um
`useEffect` de nível de componente que observa `status` como dependência (ver
Pattern 5 acima) — o efeito roda incondicionalmente, mas o QUE ele faz por
dentro (ativar vs desativar) depende de `status`.

**Warning signs:** Erro de lint "React Hook is called conditionally" ou, pior,
nenhum erro (se o hook acabar em um componente filho condicional) mas a tela
nunca libera o lock ao concluir.

### Pitfall 3: sugestão do PITFALLS.md do milestone ("assert no DOM") não bate com o jest environment real deste repo

**What goes wrong:** Seguir literalmente a recomendação de
`.planning/research/PITFALLS.md` §Pitfall 5 ("teste que dispara o fluxo e
assert que o modal (não o Alert nativo) aparece no DOM em ambiente
web/jsdom") produzindo um teste com `document.querySelector` ou `screen.debug()`
esperando nós DOM reais — esse teste vai falhar (ou pior, dar falso positivo
por engano de mock) porque o ambiente de teste configurado neste repo não é
jsdom nem `react-native-web`.

**Why it happens:** `package.json` deste repo declara `"jest": { "preset":
"jest-expo", ... }` **sem** um array `projects` multi-plataforma. O preset
`jest-expo` "flat" resolve para `jest-expo/jest-preset.js`, que deriva de
`react-native/jest-preset` com `testEnvironment:
require.resolve('./jest/react-native-env.js')` `[VERIFIED:
node_modules/react-native/jest-preset.js:13-30]` quote: `testEnvironment:
require.resolve('./jest/react-native-env.js'),` — um ambiente RN customizado,
NÃO jsdom. Os presets `getWebPreset()`/`getNodePreset()` do `jest-expo`, que
SIM usam `testEnvironment: 'jsdom'` e aliasam `react-native` →
`react-native-web` `[VERIFIED: node_modules/jest-expo/config/getPlatformPreset.js:140-150]`
quote: `getWebPreset({ isReactServer } = {}) {\n    const preset = {\n
...getBaseWebPreset(),\n      testEnvironment: 'jsdom',`, só se aplicam a
projetos com `projects:` configurado — o que este repo NÃO tem.

**How to avoid:** Testar o `AlertHost` com `@testing-library/react-native`
(`render`, `getByText`, `getByTestId`, `fireEvent`) — que já roda perfeitamente
neste ambiente RN (não jsdom) via `react-test-renderer` por baixo. Precedente
real e verificado no repo: `__tests__/swapModalitySheet.test.tsx:6-24`
`[VERIFIED: __tests__/swapModalitySheet.test.tsx:1-24]` — mesma técnica
(render + `getByLabelText`/`queryByTestId`), zero DOM literal, zero jsdom.
Para simular `Platform.OS === 'web'` SEM perder os componentes reais do RN
(diferente do mock enxuto de `secureStorageWeb.test.ts`, que mocka `react-native`
inteiro como `{ Platform }` — inviável para um teste que precisa renderizar
`Modal`/`View`/`Text` de verdade), usar `jest.requireActual` com spread:
```typescript
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Platform: { ...jest.requireActual('react-native').Platform, OS: 'web' },
}));
```

**Warning signs:** Teste que usa `document.querySelector` passa localmente por
acidente (ex.: porque `jsdom` está disponível globalmente por outra
dependência) mas quebra em CI/máquina limpa, ou nunca encontra o nó e o teste
fica silenciosamente `skip`ado por um `try/catch` mal colocado.

### Pitfall 4 (herdado do milestone, reconfirmado nesta sessão): `Alert.alert` no-op como classe, não como bug pontual

**What goes wrong:** Corrigir só o call site conhecido (`ActiveSessionScreen`
"Concluir treino") e deixar os outros 11 — ou pior, corrigir os 12 de hoje mas
deixar a porta aberta para um 13º call site futuro (ex.: nas Fases 10-13, um
novo `Alert.alert` de confirmação antes de ativar push).

**Why it happens:** `react-native-web` não implementa `Alert` — a chamada não
lança erro, só não faz nada; sem crash, sem log, o dev que testa em nativo
nunca vê a lacuna.

**How to avoid:** É exatamente o D-08 (guarda permanente) — ver
`.planning/research/PITFALLS.md` §Pitfall 5 para o relato completo; esta
pesquisa apenas reconfirma que a fase precisa fechar TODOS os 12 call sites de
uma vez (auditados nesta sessão, ver `Code Examples`) e instalar a guarda
antes de considerar a fase concluída.

**Warning signs:** `grep -rn "Alert\." src/` retornando qualquer coisa fora de
`alertShim.ts`/`AlertHost.tsx` depois da migração.

## Code Examples

### Auditoria completa dos 12 call sites (verificados nesta sessão, `grep -rn "Alert\." src/` + leitura de cada linha)

| # | Arquivo:Linha | Tipo | Texto (verbatim, D-01 preserva) |
|---|---------------|------|----------------------------------|
| 1 | `QuestionnaireScreen.tsx:162` | 1 botão, `onPress` async (signOut) | `'Sessão Expirada'` / `'Sua sessão expirou. Por favor, faça login novamente.'` |
| 2 | `QuestionnaireScreen.tsx:424` | 1 botão informativo | `'Erro Interno'` / `'Funcionalidade indisponível. Tente novamente mais tarde.'` |
| 3 | `QuestionnaireScreen.tsx:425` | 1 botão informativo | `'Erro'` / `'Usuário não autenticado. Faça login novamente.'` |
| 4 | `QuestionnaireScreen.tsx:426` | 1 botão informativo | `'Erro Interno'` / `'Não foi possível determinar o armazenamento local.'` |
| 5 | `QuestionnaireScreen.tsx:430` | 1 botão informativo | `'Campos Incompletos'` / `'Verifique se todos os campos obrigatórios...'` |
| 6 | `QuestionnaireScreen.tsx:512` | 1 botão informativo | `` 'Erro ao Salvar' / `Não foi possível salvar seus dados. Detalhes: ${errorMessage}` `` |
| 7 | `ActiveSessionScreen.tsx:174` | 1 botão informativo | `'Não foi possível registrar'` / `saveError ?? 'Tente novamente.'` |
| 8 | `ActiveSessionScreen.tsx:196` | 1 botão informativo | `'Não foi possível trocar'` / `saveError ?? 'Tente novamente.'` |
| 9 | `ActiveSessionScreen.tsx:255` | 1 botão informativo | `'Não foi possível concluir'` / `saveError ?? 'Tente novamente.'` |
| 10 | `ActiveSessionScreen.tsx:264` | **2 botões (confirmar/cancelar)** — critério de sucesso 2 | `'Concluir treino?'` / `'Ainda há séries não registradas...'` |
| 11 | `SignUpScreen.tsx:47` | 1 botão, `onPress` navigate | `'Cadastro realizado!'` / `'Um email de confirmação foi enviado...'` |
| 12 | `JointLobbyScreen.tsx:81` | **2 botões, `style: 'destructive'`** — implementação padrão de prop `confirmar` | `titulo`/`mensagem` (dinâmicos) / `'Ficar no treino'` (cancel) / `'Encerrar'` (destructive) |

Mais: `PostQuestionnaireChat.tsx:11` — import morto de `Alert` (nenhuma chamada
`Alert.alert` no arquivo, confirmado por `grep -n "Alert" ...` retornando só a
linha do import). `[VERIFIED: src/screens/PostQuestionnaireChat.tsx:1-16]`
quote do import: `Modal,\n    Alert,\n    Pressable,`.

Contagem confirma exatamente o `CONTEXT.md`: **12 call sites em 4 arquivos**
(`QuestionnaireScreen` 6, `ActiveSessionScreen` 4, `SignUpScreen` 1,
`JointLobbyScreen` 1) + 1 import morto. `[VERIFIED: grep -rn "Alert\." src/
executado nesta sessão — 12 ocorrências de "Alert.alert(" em 4 arquivos + 1
ocorrência de "Alert," de import em PostQuestionnaireChat.tsx]`

### Guarda de regressão (D-08) — teste jest de varredura

```typescript
// __tests__/alertNoAlertRemanescente.test.ts (nome sugerido)
// Guarda permanente (D-08): nenhum Alert.alert/import de Alert fora do shim
// e do AlertHost. Molde: __tests__/loadInputLayoutWeb.test.ts (bloco "regra
// geral"), mesmo padrão de varredura + guarda contra "parou de varrer".
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIRS_VARRIDOS = [
  join(__dirname, '..', 'src', 'screens'),
  join(__dirname, '..', 'src', 'components'),
  join(__dirname, '..', 'src', 'store'),
];
// Arquivos onde `Alert`/`Alert.alert` É esperado — o shim e o host em si.
const PERMITIDOS = new Set(['alertShim.ts', 'AlertHost.tsx']);

const listarArquivosRecursivo = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const caminho = join(dir, entry.name);
    if (entry.isDirectory()) return listarArquivosRecursivo(caminho);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [caminho] : [];
  });

describe('guarda: nenhum Alert.alert fora do shim (D-08)', () => {
  it('grep Alert\\. zerado fora de alertShim.ts/AlertHost.tsx', () => {
    const infratores: string[] = [];
    let arquivosVarridos = 0;

    for (const dir of DIRS_VARRIDOS) {
      for (const caminho of listarArquivosRecursivo(dir)) {
        const nome = caminho.split('/').pop()!;
        if (PERMITIDOS.has(nome)) continue;
        arquivosVarridos += 1;
        const conteudo = readFileSync(caminho, 'utf8');
        if (/\bAlert\s*[.,]/.test(conteudo)) {
          infratores.push(caminho);
        }
      }
    }

    // Guarda contra a varredura parar de varrer silenciosamente.
    expect(arquivosVarridos).toBeGreaterThan(20);
    expect(infratores).toEqual([]);
  });
});
```

Padrão de varredura (`readdirSync`/`readFileSync`, coleta de `infratores`,
`expect(infratores).toEqual([])`, guarda de "arquivosVarridos >= N" contra
regressão silenciosa da própria varredura) é o precedente real e verificado do
repo: `__tests__/loadInputLayoutWeb.test.ts:144-175` `[VERIFIED:
__tests__/loadInputLayoutWeb.test.ts:120-176]`.

### Teste de render do `AlertHost` no modo web (segunda parte do D-08)

```typescript
// __tests__/alertHostWeb.test.tsx (nome sugerido)
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Platform: { ...jest.requireActual('react-native').Platform, OS: 'web' },
}));

import { showAlert } from '../src/utils/alertShim';
import AlertHost from '../src/components/AlertHost';

describe('AlertHost no web', () => {
  it('mostra o Modal custom (não window.confirm) e chama onPress do botão', () => {
    const onSim = jest.fn();
    const screen = render(<AlertHost />);

    showAlert('Concluir treino?', 'Ainda há séries pendentes.', [
      { text: 'Continuar treino', style: 'cancel' },
      { text: 'Concluir', onPress: onSim },
    ]);

    expect(screen.getByText('Concluir treino?')).toBeTruthy();
    fireEvent.press(screen.getByText('Concluir'));
    expect(onSim).toHaveBeenCalledTimes(1);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `Alert.alert` cru em cada call site (sem indireção) | Shim central `Platform.OS`-aware (`haptics.ts`/`secureStorage.ts` já são o precedente) | Já era o padrão do repo antes desta fase — WEB-01 só estende o padrão para o `Alert` | Elimina o no-op silencioso e fecha a classe do pitfall para as Fases 10-13 |
| `useKeepAwake()` sem tag, ciclo por montagem | Controle imperativo por tag (`activateKeepAwakeAsync`/`deactivateKeepAwake`) + listener de `visibilitychange` | Nesta fase (SESS-01) | Lock some quando deveria (conclusão) e volta quando deveria (retorno do background) — hoje só a primeira metade (ativação inicial) funciona |
| Wake Lock em Home Screen Web App no iOS | Ainda quebrado até iOS 18.3.x, corrigido a partir do 18.4 (março/2025) | Fix da Apple, não do app | Critério de sucesso 3 do roadmap depende da versão do iOS do device de UAT — variável fora do controle da implementação |

**Deprecated/outdated:** Nenhuma API usada nesta fase está deprecated —
`Screen Wake Lock API` é "Baseline 2025" (amplamente suportada) segundo a MDN,
e `expo-keep-awake` está na versão mais recente compatível com o SDK 54 já em
uso.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `theme.colors.status.danger` (ou nome equivalente) existe em `theme.ts` para o botão `destructive` do `AlertHost` | Code Examples — Pattern 2 | Baixo: se o token não existir com esse nome, o `tsc --noEmit` acusa o erro imediatamente (build-time, não runtime) — fácil de corrigir olhando `theme.ts` real antes de codar |
| A2 | O nome de arquivo/pasta exatos (`alertShim.ts`, `AlertHost.tsx`, `alertStore.ts`, tag `'active-session'`) são sugestões, não verificados contra nenhuma convenção nomeada explicitamente no `CONVENTIONS.md` além do padrão geral camelCase/PascalCase | Recommended Project Structure | Baixo: é decisão de discretion explícita do `CONTEXT.md` — qualquer nome respeitando o padrão camelCase (utils) / PascalCase (componentes) é aceitável |
| A3 | `deactivateKeepAwake` sempre rejeita com `ERR_KEEP_AWAKE_TAG_INVALID` quando chamado numa tag nunca ativada, em TODAS as plataformas (nativo e web) — confirmado só para o branch WEB do código-fonte lido | Common Pitfalls / Code Examples | Médio-baixo: se o branch nativo (`ExpoKeepAwake.ts`, não lido nesta sessão — só o `.web.ts` foi lido a fundo) tiver comportamento diferente, o `.catch(() => {})` ao redor de `deactivateKeepAwake` já cobre qualquer rejeição, então o risco prático é baixo mesmo que a suposição esteja errada |

**Nota:** o achado mais importante desta pesquisa — o veredito do D-07 (linhas
1-77 de `ExpoKeepAwake.web.ts` lidas na íntegra) e o bug WebKit 254545 (fonte
primária: `webkit.org` + `bugs.webkit.org`, cross-referenciados) — são
`[VERIFIED]`/`[CITED]`, não `[ASSUMED]`. A tabela acima cobre só os pontos
remanescentes de menor risco.

## Open Questions

1. **Qual a versão do iOS do iPhone de teste do dono?**
   - What we know: o bug WebKit 254545 bloqueia Wake Lock em standalone PWA em
     qualquer iOS 16.4–18.3.x; corrigido só no 18.4 (lançado março/2025).
   - What's unclear: se o device de UAT já está no 18.4+ ou não — não há como
     verificar isso remotamente nesta sessão.
   - Recommendation: perguntar ao dono ANTES de rodar o UAT desta fase (ver
     Pitfall 1). Se < 18.4, documentar o UAT como "implementação correta,
     bloqueado por versão de iOS" em vez de tentar "consertar" um código que já
     está certo.

2. **`theme.ts` tem um token nomeado para estado "destructive"/"danger" de botão?**
   - What we know: `Notice` (componente já existente) usa `tone="danger"`
     (`ActiveSessionScreen.tsx:421`), então o conceito existe no design system.
   - What's unclear: o nome exato do token de cor a usar no botão destrutivo do
     `AlertHost` (`theme.colors.status.danger`? `theme.colors.danger.main`?) —
     não lido nesta sessão.
   - Recommendation: o executor deve abrir `src/theme/theme.ts` e confirmar o
     token exato antes de escrever `AlertHost.tsx` (passo rápido, sem
     ambiguidade real — só não verificado NESTA sessão de pesquisa).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `expo-keep-awake` (instalado) | SESS-01 | ✓ | `15.0.8` (confirmado em `node_modules/expo-keep-awake/package.json`) | — |
| `zustand` (instalado) | WEB-01 (`AlertHost`) | ✓ | `^4.5.7` | — |
| Screen Wake Lock API no device de teste | SESS-01 (UAT) | **Depende da versão do iOS do dono — não verificável nesta sessão** | Requer iOS 16.4+ para a API existir e iOS 18.4+ para funcionar em standalone PWA (bug WebKit 254545) | Nenhum fallback de código possível — é limitação de plataforma (ver Pitfall 1) |
| `@testing-library/react-native` (instalado) | Testes do D-08 | ✓ | `^13.3.3` | — |
| `npx tsc --noEmit` / `npx jest` (portões de qualidade do repo) | Verificação local (sem lint gate real — `AGENTS.md`) | ✓ | — | — |

**Missing dependencies with no fallback:**
- Nenhuma dependência de pacote está faltando. O único "missing" é uma
  informação (versão do iOS do device do dono), não uma dependência de
  software — não pode ser instalado ou contornado por código.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` via preset `jest-expo` (`~54.0.17`) `[VERIFIED: package.json]` |
| Config file | `package.json` (`"jest": {...}` inline — sem `jest.config.js` separado) |
| Quick run command | `npx jest __tests__/alertNoAlertRemanescente.test.ts __tests__/alertHostWeb.test.tsx` (ou os nomes reais escolhidos) |
| Full suite command | `npx jest` — nota do `AGENTS.md`: "A suíte Jest completa com `--runInBand` deixa handle aberto e pode sair 1 mesmo com todos os testes verdes; não use esse exit code como portão." — conferir a saída textual (`Tests: N passed`), não só o exit code |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| WEB-01 | Nenhum `Alert.alert` remanescente fora do shim | unit (varredura) | `npx jest __tests__/alertNoAlertRemanescente.test.ts` | ❌ Wave 0 (novo) |
| WEB-01 | `AlertHost` renderiza no web e dispara `onPress` dos botões | unit/component | `npx jest __tests__/alertHostWeb.test.tsx` | ❌ Wave 0 (novo) |
| WEB-01 | Nativo continua chamando `Alert.alert` real (repasse — D-03) | unit | teste do `alertShim.ts` com `Platform.OS='ios'` mockado + spy em `Alert.alert` | ❌ Wave 0 (novo) |
| SESS-01 | Lock ativa em `status='active'`/`'awaiting_checkin'`, desativa em `'finished'` | unit | teste de `ActiveSessionScreen` (ou do hook extraído) com `expo-keep-awake` mockado (`jest.mock('expo-keep-awake', ...)`) e assert de chamadas a `activateKeepAwakeAsync`/`deactivateKeepAwake` por transição de `status` | ❌ Wave 0 (novo) |
| SESS-01 | Reaquisição em `visibilitychange` (web) | unit | teste disparando `document.dispatchEvent(new Event('visibilitychange'))` com `visibilityState` mockado e assert de nova chamada a `activateKeepAwakeAsync` | ❌ Wave 0 (novo) |
| SESS-01 | Comportamento real no iPhone (tela não escurece, volta ao normal) | manual (UAT) — não automatizável | UAT do dono, condicionado à versão do iOS (Pitfall 1) | N/A — sempre manual |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` + o(s) arquivo(s) de teste novo(s)
  isolado(s) (`npx jest <arquivo>`)
- **Per wave merge:** `npx jest` (suíte completa — ler a saída textual, não o
  exit code, conforme nota do `AGENTS.md`)
- **Phase gate:** Suíte completa verde + UAT do dono no iPhone real (SESS-01) +
  `grep -rn "Alert\." src/` retornando só `alertShim.ts`/`AlertHost.tsx` antes
  de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `__tests__/alertNoAlertRemanescente.test.ts` — guarda de varredura (D-08, WEB-01)
- [ ] `__tests__/alertHostWeb.test.tsx` — render + callbacks do modal web (D-08, WEB-01)
- [ ] Teste do repasse nativo do `alertShim` (`Platform.OS !== 'web'` → `Alert.alert` real chamado com os mesmos argumentos)
- [ ] Teste do ciclo de vida do Wake Lock por `status` (ativa/desativa/reaquire) — provavelmente extensão de `__tests__/activeSessionScreen.test.tsx` (já existe, precisa mockar `expo-keep-awake` explicitamente — hoje esse arquivo não mocka o módulo)
- [ ] Teste focado em `JointLobbyView`/`confirmarPadrao` chamando o shim de verdade (hoje `__tests__/jointLobbyScreen.test.tsx` só injeta um mock de `confirmar` — nenhum teste existente exercita `confirmarPadrao` real; sem esse teste novo, só o D-08 (varredura) protegeria esse call site)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | Não | Fase não toca fluxo de autenticação — só a UI de confirmação de `signOut` já existente (call site #1) |
| V3 Session Management | Não | — |
| V4 Access Control | Não | — |
| V5 Input Validation | Não diretamente | Nenhum input novo do usuário — o shim só transporta strings já definidas em código (títulos/mensagens fixos), não dado de formulário |
| V6 Cryptography | Não | — |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| N/A — esta fase não introduz superfície de ataque nova (sem I/O de rede, sem persistência, sem input de usuário processado) | — | — |

Nenhuma preocupação de segurança real nesta fase: o `AlertHost` é puramente
apresentacional (strings hardcoded nos call sites, nunca `dangerouslySetInnerHTML`
ou equivalente — RN não tem essa superfície); o Wake Lock não expõe nem
processa dado sensível. Seção mantida por completude do template, não porque
haja risco a mitigar.

## Sources

### Primary (HIGH confidence)
- `node_modules/expo-keep-awake/src/ExpoKeepAwake.web.ts` (lido integralmente, 77 linhas) — veredito definitivo do D-07
- `node_modules/expo-keep-awake/src/index.ts`, `node_modules/expo-keep-awake/src/KeepAwake.types.ts` — API pública do hook/funções imperativas
- `node_modules/expo-keep-awake/package.json` — versão instalada `15.0.8`
- `node_modules/react-native/jest-preset.js`, `node_modules/jest-expo/config/getPlatformPreset.js`, `node_modules/jest-expo/jest-preset.js` — comportamento real do jest environment deste repo
- `src/screens/ActiveSessionScreen.tsx`, `src/screens/QuestionnaireScreen.tsx`, `src/screens/SignUpScreen.tsx`, `src/screens/JointLobbyScreen.tsx`, `src/screens/PostQuestionnaireChat.tsx` — todos os 12 call sites + import morto, lidos diretamente
- `src/store/activeSessionStore.ts` (linhas 81, 1734-1777, 302-321) — `type Status`, ação `finishSession`, `retireLocalDraft`
- `src/utils/haptics.ts`, `src/services/auth/secureStorage.ts` — padrão de shim já estabelecido
- `src/components/session/SwapModalitySheet.tsx` — molde visual e tokens de tema reais
- `src/store/manualPlanStore.ts`, `src/store/activeSessionStore.ts` — convenção `create<State>()`
- `__tests__/secureStorageWeb.test.ts`, `__tests__/loadInputLayoutWeb.test.ts`, `__tests__/swapModalitySheet.test.tsx`, `__tests__/jointLobbyScreen.test.tsx` — precedentes de teste reais
- `App.tsx`, `AGENTS.md`, `.planning/codebase/CONVENTIONS.md`, `package.json` — convenções e infraestrutura de projeto
- [WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) — confirmação oficial do fix do bug de Wake Lock em Home Screen Web Apps
- [bugs.webkit.org #254545](https://bugs.webkit.org/show_bug.cgi?id=254545) — bug original, status RESOLVED FIXED
- [MDN — Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) — padrão oficial de re-aquisição via `visibilitychange`

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md` (pesquisa do milestone, 2026-08-14) — já lida e referenciada pelo `CONTEXT.md`; esta pesquisa complementa, não substitui

### Tertiary (LOW confidence)
- WebSearch geral sobre "iOS Safari Screen Wake Lock quirks" (mobiloud.com, tips.ojapp.app, etc.) — usada só para localizar a fonte primária (webkit.org/bugs.webkit.org), não citada como fato isolado

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova, tudo lido direto do `node_modules`/`package.json`
- Architecture (shim/AlertHost/wake lock lifecycle): HIGH — padrões já estabelecidos no próprio repo, código-fonte lido
- Pitfalls: HIGH para o veredito D-07 e para o achado do bug WebKit (fonte primária oficial); MEDIUM para o comportamento fino do Wake Lock no Safari (sem device real disponível para confirmar empiricamente)

**Research date:** 2026-08-14
**Valid until:** 30 dias para a parte de código (padrões estáveis do próprio repo); o achado do bug WebKit é uma verdade de plataforma que só muda se o dono atualizar o iPhone — revalidar a versão do iOS no início do UAT desta fase, não confiar em uma data de expiração fixa.

---
*Phase 9 research — Fechamento de gaps do runtime web*
