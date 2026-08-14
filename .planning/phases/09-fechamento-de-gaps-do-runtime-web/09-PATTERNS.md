# Phase 9: Fechamento de gaps do runtime web - Mapa de Padrões

**Mapeado:** 2026-08-14
**Arquivos analisados:** 14 (4 novos + 5 modificados de call sites + 2 testes novos + 3 arquivos de apoio existentes reaproveitados)
**Analogs encontrados:** 12 / 14 (2 sem analog direto — cobertos pelo `RESEARCH.md`)

## File Classification

| Novo/Modificado | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/utils/alertShim.ts` (novo) | utility (shim de plataforma) | request-response (síncrono, decide branch) | `src/utils/haptics.ts` | exact |
| `src/store/alertStore.ts` (novo) | store (Zustand) | event-driven (estado em memória) | `src/store/manualPlanStore.ts` | role-match |
| `src/components/AlertHost.tsx` (novo) | component (Modal global) | request-response (render reativo ao store) | `src/components/session/SwapModalitySheet.tsx` | exact |
| Wake lock lifecycle (dentro de `ActiveSessionScreen.tsx`, sem arquivo novo — discretion) | hook/effect (lifecycle) | event-driven (reage a `status` + `visibilitychange`) | `ActiveSessionScreen.tsx:22,72` (uso atual de `useKeepAwake`) + `expo-keep-awake` API imperativa | role-match |
| `src/screens/QuestionnaireScreen.tsx` (6 call sites) | controller/screen | request-response | `src/screens/ActiveSessionScreen.tsx:264-271` (mesma migração) | exact |
| `src/screens/ActiveSessionScreen.tsx` (4 call sites + wake lock) | controller/screen | request-response + event-driven | (é o próprio arquivo-alvo; molde de migração vem de si mesmo) | exact |
| `src/screens/SignUpScreen.tsx` (1 call site) | controller/screen | request-response | `src/screens/ActiveSessionScreen.tsx:264-271` | exact |
| `src/screens/JointLobbyScreen.tsx` (1 call site, `confirmarPadrao`) | controller/screen (prop injetável) | request-response | `src/screens/ActiveSessionScreen.tsx:264-271` (mesma troca `Alert.alert`→`showAlert`) | role-match (assinatura de prop preservada) |
| `src/screens/PostQuestionnaireChat.tsx` (remoção de import morto) | controller/screen | n/a (edição textual) | n/a | trivial |
| `__tests__/alertNoAlertRemanescente.test.ts` (novo) | test (guarda de varredura) | batch (scan de arquivos) | `__tests__/loadInputLayoutWeb.test.ts:120-176` | exact |
| `__tests__/alertHostWeb.test.tsx` (novo) | test (render + callback) | request-response | `__tests__/swapModalitySheet.test.tsx:1-24` | exact |
| Teste de repasse nativo do shim (novo, arquivo sugerido `__tests__/alertShim.test.ts`) | test (unit) | request-response | `__tests__/secureStorageWeb.test.ts` (mock de `Platform.OS`) | role-match |
| Teste do ciclo de vida do wake lock (extensão de `__tests__/activeSessionScreen.test.tsx`) | test (unit, mock de módulo nativo) | event-driven | `__tests__/activeSessionScreen.test.tsx` (já existe, precisa mock novo de `expo-keep-awake`) | role-match — sem analog de "mock de expo-keep-awake" no repo hoje |
| Teste focado em `confirmarPadrao` real (novo, dentro de `__tests__/jointLobbyScreen.test.tsx` ou arquivo irmão) | test (unit) | request-response | `__tests__/jointLobbyScreen.test.tsx:67` (só injeta mock hoje — precisa de um novo caso que NÃO injete `confirmar`) | sem analog — gap de teste explícito no RESEARCH.md |

## Pattern Assignments

### `src/utils/alertShim.ts` (utility, request-response)

**Analog:** `src/utils/haptics.ts` (arquivo inteiro, 41 linhas — lido integralmente)

**Padrão de shim por `Platform.OS`** (`src/utils/haptics.ts:7-20`):
```typescript
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isWeb = () => Platform.OS === 'web';

export const tapLight = async (): Promise<void> => {
  if (isWeb()) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // acessório: segue sem vibrar
  }
};
```

**Segundo molde, variante `const isWeb = Platform.OS === 'web'` (valor, não função)** — `src/services/auth/secureStorage.ts:14,30,180-184`:
```typescript
import { Platform } from 'react-native';
const isWeb = Platform.OS === 'web';

export const setItem = async (key: string, value: string): Promise<void> => {
  if (isWeb) {
    webStorage.setItem(key, value);
    return;
  }
  // ... caminho nativo
};
```

**Aplicar em `alertShim.ts`:** repassar para `Alert.alert` no branch nativo (D-03), disparar `useAlertStore.getState().show(...)` no branch web (D-02). Código de referência já validado no `RESEARCH.md` (Pattern 1, linhas 273-299) — usar como base, só falta confirmar o tipo `AlertButton` e não sobre-especificar (`style?: 'default' | 'cancel' | 'destructive'`, sem `Alert.prompt`, conforme D-01/OUT de escopo).

**Erro/no-op:** ambos os moldes engolem exceção silenciosamente (`try/catch` vazio com comentário) — D-06 exige o mesmo padrão para o wake lock.

---

### `src/store/alertStore.ts` (store Zustand, event-driven)

**Analog:** `src/store/manualPlanStore.ts:149` e `src/store/activeSessionStore.ts:81,542` (convenção `create<State>()`)

**Padrão de criação da store:**
```typescript
export const useManualPlanStore = create<ManualPlanState>((set, get) => {
  // ...
});
```

**Aplicar:** store mínima de 1 slot (`current`), sem `get` necessário (nenhuma leitura cruzada) — usar a assinatura mais simples `create<AlertState>((set) => ({ ... }))`, já esboçada no `RESEARCH.md` Pattern 3 (linhas 421-436). Fila de 1 alerta por vez (mesmo comportamento do `Alert.alert` nativo) — não implementar fila de múltiplos.

---

### `src/components/AlertHost.tsx` (component, request-response)

**Analog:** `src/components/session/SwapModalitySheet.tsx` (molde visual — Modal nativo RN + StyleSheet + theme)

**Imports pattern** (`SwapModalitySheet.tsx:25-40`):
```typescript
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import theme from '../../theme/theme';
import { Button } from '../ui';
import { EmptyState, Notice, Skeleton } from '../ui/Feedback';
```
(`AlertHost.tsx` fica em `src/components/`, não `src/components/session/` — ajustar o path relativo do theme para `../theme/theme`, um nível a menos.)

**Tokens de tema confirmados** (usados no molde, `SwapModalitySheet.tsx` linhas 199-211 — citado no RESEARCH.md):
- `theme.colors.overlay` — backdrop
- `theme.elevation.floating` — sombra do card
- `theme.borderRadius.xxl` — raio do card
- `theme.colors.surface.card` — fundo do card
- `theme.colors.status.danger = '#DC827B'` — **CONFIRMADO nesta sessão** (`src/theme/theme.ts:90`), junto com `dangerSoft` (linha 91) e `dangerBorder` (linha 92). Usar `theme.colors.status.danger` para `buttonTextDestructive`, não a suposição `[ASSUMED]` do RESEARCH.md (`theme.colors.status?.danger ?? theme.colors.text.accent` pode ser simplificado para `theme.colors.status.danger` direto, já que o token existe).

**Core pattern (Modal + botões, com `onPress` possivelmente async):** ver `RESEARCH.md` "Pattern 2" (linhas 317-401) — código já pronto para copiar, com `testID="alert-host-backdrop"` e `testID={`alert-host-button-${i}`}` para os testes do D-08.

**Ponto de montagem:** `App.tsx:32-34` — único ponto de composição global (D-04). Ler essas linhas antes de editar para confirmar a estrutura exata de `AuthProvider`/`RootNavigator`.

---

### Migração dos 12 call sites (5 arquivos de screen)

**Analog:** o próprio `ActiveSessionScreen.tsx:264-271` (caso mais completo — 2 botões, é o critério de sucesso 2)

**Mecânica idêntica nos 12 (troca só import + nome da função, argumentos preservados):**
```typescript
// ANTES
import { Alert } from 'react-native';
Alert.alert('Concluir treino?', 'Ainda há séries não registradas...', [
  { text: 'Continuar treino', style: 'cancel' },
  { text: 'Concluir', onPress: finalizar },
]);

// DEPOIS
import { showAlert } from '../utils/alertShim';
showAlert('Concluir treino?', 'Ainda há séries não registradas...', [
  { text: 'Continuar treino', style: 'cancel' },
  { text: 'Concluir', onPress: finalizar },
]);
```

**Caso especial `JointLobbyScreen.tsx:80-84`** — não é call site solto, é corpo de `confirmarPadrao` (prop injetável usado por `__tests__/jointLobbyScreen.test.tsx:67` via mock). Só o corpo muda, a assinatura do prop `confirmar` não muda:
```typescript
const confirmarPadrao = (titulo: string, mensagem: string, onSim: () => void) =>
  showAlert(titulo, mensagem, [
    { text: 'Ficar no treino', style: 'cancel' },
    { text: 'Encerrar', style: 'destructive', onPress: onSim },
  ]);
```

**Lista exata dos 12 call sites** (arquivo:linha, tipo, texto verbatim) — ver `RESEARCH.md` seção "Auditoria completa dos 12 call sites" (tabela completa, já com os textos exatos a preservar por D-01/discretion "copy dos diálogos").

**`PostQuestionnaireChat.tsx:11`** — só remover a linha `Alert,` do bloco de import de `react-native` (import morto, nenhuma chamada no arquivo).

---

### Ciclo de vida do Wake Lock (`ActiveSessionScreen.tsx`, SESS-01)

**Analog:** não há analog de "controle imperativo por tag reagindo a um enum de status" no repo — é composição nova de padrões existentes (`useEffect` + API imperativa de `expo-keep-awake`, já em uso como hook simples na linha 72).

**Estado atual a substituir** (`ActiveSessionScreen.tsx:22,72`):
```typescript
import { useKeepAwake } from 'expo-keep-awake';
// ...
useKeepAwake(); // linha 72 — só libera no unmount, nunca dispara em 'finished'
```

**Padrão alvo (D-05 + D-07)** — código já pronto e verificado no `RESEARCH.md` (Pattern 5, linhas 527-551, e Pattern 6, linhas 578-597):
```typescript
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const WAKE_LOCK_TAG = 'active-session';

useEffect(() => {
  const deveSegurarTela = status === 'awaiting_checkin' || status === 'active';
  if (!deveSegurarTela) {
    deactivateKeepAwake(WAKE_LOCK_TAG).catch(() => {});
    return;
  }
  activateKeepAwakeAsync(WAKE_LOCK_TAG).catch(() => {});
  return () => {
    deactivateKeepAwake(WAKE_LOCK_TAG).catch(() => {});
  };
}, [status]);

// separado — reaquisição em visibilitychange (expo-keep-awake web NÃO faz isso sozinho)
useEffect(() => {
  if (typeof document === 'undefined') return;
  const deveSegurarTela = status === 'awaiting_checkin' || status === 'active';
  if (!deveSegurarTela) return;
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      activateKeepAwakeAsync(WAKE_LOCK_TAG).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}, [status]);
```

**Error handling:** `.catch(() => {})` silencioso em toda chamada — mesmo padrão de `haptics.ts` (D-06, no-op sem suporte).

**`status` vem de** `src/store/activeSessionStore.ts:81` — `type Status = 'idle' | 'loading' | 'awaiting_checkin' | 'active' | 'finished' | 'error'`.

---

### `__tests__/alertNoAlertRemanescente.test.ts` (guarda D-08, batch)

**Analog:** `__tests__/loadInputLayoutWeb.test.ts:120-176` (padrão de varredura recursiva)

**Padrão de varredura + guarda contra regressão silenciosa:**
```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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
    // ... varre src/screens, src/components, src/store; pula PERMITIDOS
    expect(arquivosVarridos).toBeGreaterThan(20);
    expect(infratores).toEqual([]);
  });
});
```
Código completo já pronto no `RESEARCH.md` (linhas 792-836).

---

### `__tests__/alertHostWeb.test.tsx` (render + callback, request-response)

**Analog:** `__tests__/swapModalitySheet.test.tsx:1-24` (render + `getByLabelText`/`queryByTestId`, sem DOM literal)

**Mock de `Platform.OS` preservando componentes reais do RN** (necessário porque o `AlertHost` precisa renderizar `Modal`/`View`/`Text` de verdade — diferente do mock enxuto de `secureStorageWeb.test.ts` que mocka `react-native` inteiro como `{ Platform }`):
```typescript
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Platform: { ...jest.requireActual('react-native').Platform, OS: 'web' },
}));
```

**Core pattern:**
```typescript
import { render, fireEvent } from '@testing-library/react-native';
import { showAlert } from '../src/utils/alertShim';
import AlertHost from '../src/components/AlertHost';

describe('AlertHost no web', () => {
  it('mostra o Modal custom e chama onPress do botão', () => {
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

**IMPORTANTE (Pitfall 3 do RESEARCH.md):** não usar `document.querySelector`/assert de DOM — o jest deste repo roda `testEnvironment: react-native/jest/react-native-env.js` (preset `jest-expo` "flat", sem `projects` multi-plataforma), não jsdom. Testar sempre via `@testing-library/react-native`.

---

### Teste de repasse nativo do shim (unit)

**Analog:** `__tests__/secureStorageWeb.test.ts` (mock de `Platform.OS`, mas aqui SEM precisar preservar componentes reais — é só o módulo `alertShim`, não um componente visual)

**Padrão:** mockar `Platform.OS = 'ios'`, espiar `Alert.alert` (`jest.spyOn(Alert, 'alert')`), chamar `showAlert(...)` e assertar que `Alert.alert` foi chamado com os mesmos argumentos, e que `useAlertStore` NÃO foi tocado.

---

### Teste do ciclo de vida do wake lock (extensão de `__tests__/activeSessionScreen.test.tsx`)

**Sem analog direto** — o teste hoje não mocka `expo-keep-awake`. Padrão a introduzir:
```typescript
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));
```
Assertar chamadas por transição de `status` (`active`/`awaiting_checkin` → `activateKeepAwakeAsync`; `finished` → `deactivateKeepAwake`) e reaquisição via `document.dispatchEvent(new Event('visibilitychange'))` com `visibilityState` mockado.

---

### Teste focado em `confirmarPadrao` real (`JointLobbyScreen`)

**Sem analog** — `__tests__/jointLobbyScreen.test.tsx:67` hoje só injeta um mock de `confirmar`, nenhum teste existente exercita o caminho real de `confirmarPadrao`. Este é um gap de teste explícito identificado pelo `RESEARCH.md` (Wave 0 Gaps): criar um caso novo que NÃO injeta `confirmar` (usa o default) e verifica que `showAlert` (spy) é chamado com os textos/estilo `destructive` corretos.

## Shared Patterns

### Shim por `Platform.OS`, engolindo exceção
**Fonte:** `src/utils/haptics.ts:10,14-19` e `src/services/auth/secureStorage.ts:14,30`
**Aplicar em:** `alertShim.ts` (branch nativo/web) e nos dois `useEffect`s do wake lock (D-06 no-op silencioso).
```typescript
const isWeb = () => Platform.OS === 'web'; // ou `const isWeb = Platform.OS === 'web';`
try {
  await algumaCoisa();
} catch {
  // no-op documentado — nunca derruba o fluxo principal
}
```

### Molde visual de Modal + StyleSheet + theme
**Fonte:** `src/components/session/SwapModalitySheet.tsx` (linhas 25-40 imports, 199-211 styles)
**Aplicar em:** `AlertHost.tsx` — mesma estrutura (`Modal` transparent + `Pressable` backdrop + card com `StyleSheet.create` usando tokens de `theme.ts`, sem lib de UI nova).

### Convenção de store Zustand
**Fonte:** `src/store/manualPlanStore.ts:149`, `src/store/activeSessionStore.ts:81,542`
**Aplicar em:** `alertStore.ts` — `create<AlertState>((set) => ({...}))`, 1 slot só (`current`), sem persistência.

### Teste de varredura de arquivos-fonte (guarda de regressão)
**Fonte:** `__tests__/loadInputLayoutWeb.test.ts:120-176`
**Aplicar em:** `alertNoAlertRemanescente.test.ts` (D-08) — `readdirSync`/`readFileSync` recursivo, lista de exceções, `expect(infratores).toEqual([])` + guarda `arquivosVarridos > N`.

### Teste de componente RN sem jsdom
**Fonte:** `__tests__/swapModalitySheet.test.tsx:1-24`
**Aplicar em:** `alertHostWeb.test.tsx` — `@testing-library/react-native` (`render`/`getByText`/`fireEvent`), nunca DOM literal.

## No Analog Found

| Arquivo | Role | Data Flow | Motivo |
|---|---|---|---|
| Teste do ciclo de vida do wake lock (mock de `expo-keep-awake` + `status`) | test | event-driven | Nenhum teste existente mocka `expo-keep-awake`; `RESEARCH.md` já fornece o esqueleto do mock — planner deve compor com o padrão de `__tests__/activeSessionScreen.test.tsx` existente (estrutura de setup/store), sem analog de "assert de chamada imperativa a lib de plataforma" no repo hoje |
| Teste focado em `confirmarPadrao` real sem mock de `confirmar` | test | request-response | Gap de cobertura explícito (`RESEARCH.md` Wave 0 Gaps) — nenhum teste hoje exercita esse caminho; compor a partir da estrutura de `__tests__/jointLobbyScreen.test.tsx` mas com um `describe` novo |

## Metadata

**Escopo de busca de analogs:** `src/utils/`, `src/services/auth/`, `src/store/`, `src/components/session/`, `src/screens/`, `__tests__/` (via referências diretas do `RESEARCH.md`, já lidas com `[VERIFIED: file:linha]` nesta sessão — sem necessidade de nova varredura ampla).
**Arquivos lidos nesta sessão (fora do CONTEXT/RESEARCH):** `src/utils/haptics.ts` (completo), `src/services/auth/secureStorage.ts` (completo), `src/components/session/SwapModalitySheet.tsx` (linhas 1-40), `src/theme/theme.ts` (grep `danger`/`status`, linhas 83-92) — confirma `theme.colors.status.danger = '#DC827B'`, resolvendo a suposição `[ASSUMED]` A1 do `RESEARCH.md`.
**Data de extração:** 2026-08-14
