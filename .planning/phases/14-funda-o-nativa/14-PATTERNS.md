# Phase 14: Fundação nativa - Pattern Map

**Mapped:** 2026-08-16
**Files analisados:** 8 (2 modificados, 6 novos)
**Analogs encontrados:** 6 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app.json` | config | request-response (config estático lido no build) | `app.json` (próprio arquivo, edição incremental) | exact |
| `targets/session-widget/expo-target.config.js` | config | event-driven (consumido pelo config plugin no `prebuild`) | — nenhum análogo no repo (primeiro config plugin de target nativo) | no-analog |
| `modules/native-info/ios/NativeInfoModule.swift` | service (bridge nativo) | request-response (JS chama, Swift retorna Promise) | — nenhum módulo Expo local existente no repo | no-analog |
| `modules/native-info/index.ts` | service (JS wrapper do módulo nativo) | request-response | `src/store/updateStore.ts` (mais próximo por ser a "ponte" de estado/evento nativo→UI, embora via `window` e não via bridge nativo) | role-match (parcial) |
| `src/components/ProvisioningBanner.tsx` | component | request-response (lê estado local, renderiza condicionalmente) | `src/components/UpdateBanner.tsx` | exact |
| `__tests__/ProvisioningBanner.test.tsx` | test | request-response | `__tests__/UpdateBanner.test.tsx` | exact |
| `scripts/resign.sh` | utility (build/tooling) | batch (sequência de comandos, sai com código de erro) | `scripts/supabase-preflight.sh` | role-match |
| `scripts/verify-native-skeleton.sh` | utility (verificação/smoke) | batch | `scripts/verify-web-bundle.mjs` (mesmo papel — trava de build/deploy, roda antes/depois de gerar artefato) + `scripts/supabase-preflight.sh` (mesmo estilo de shell script com saída 0/1 e mensagens coloridas) | role-match |

## Pattern Assignments

### `src/components/ProvisioningBanner.tsx` (component, request-response)

**Analog:** `src/components/UpdateBanner.tsx` (arquivo completo, 161 linhas — lido integralmente)

**Imports pattern** (linhas 24-28):
```typescript
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import theme from '../theme/theme';
import { useUpdateStore } from '../store/updateStore';
```
Para `ProvisioningBanner.tsx`, trocar `useUpdateStore` pela leitura do módulo nativo (via hook local ou `useEffect` chamando `getProvisioningProfileExpiry()` do wrapper em `modules/native-info/index.ts`) — o import de `theme` e o padrão de `StyleSheet.create` no fim do arquivo devem ser copiados tal qual.

**Guard de plataforma / early return** (linhas 80-81):
```typescript
if (Platform.OS !== 'web') return null;
if (!waiting || dismissed) return null;
```
`ProvisioningBanner` inverte a guarda: só faz sentido em iOS nativo (`Platform.OS === 'ios'`), nunca no web nem no dev-client rodando fora de device assinado. Copiar o formato de early-return duplo (guarda de plataforma primeiro, depois guarda de estado — "não há dado ainda" ou "> 2 dias restantes").

**Core pattern — leitura assíncrona + estado local** (linhas 30-41):
```typescript
const UpdateBanner = () => {
  const waiting = useUpdateStore((s) => s.waiting);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const setWaiting = useUpdateStore((s) => s.setWaiting);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const applyUpdate = useUpdateStore((s) => s.applyUpdate);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    // ...
  }, [setWaiting]);
```
`ProvisioningBanner` não precisa de uma store Zustand dedicada (não há múltiplos consumidores nem persistência entre remounts que justifique isso) — mas deve seguir o mesmo formato de `useEffect` com guarda de plataforma logo na primeira linha do efeito, chamando a função async do módulo nativo (`modules/native-info`) e gravando o resultado em `useState` local. A lógica pura "faltam ≤2 dias" (D-03) deve ficar extraída como função exportada e testável isoladamente (mesmo espírito do `ProvisioningBanner.test.tsx` cobrir só a lógica pura, não a leitura nativa — ver Validation Architecture do RESEARCH.md).

**JSX / estrutura visual — faixa fixa não-bloqueante** (linhas 83-105, 108-158):
```typescript
return (
  <View style={styles.container} testID="update-banner">
    <Text style={styles.message}>Nova versão disponível</Text>
    <View style={styles.actions}>
      <TouchableOpacity
        style={styles.buttonSecondary}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Depois"
      >
        <Text style={styles.buttonSecondaryLabel}>Depois</Text>
      </TouchableOpacity>
      ...
    </View>
  </View>
);
```
Copiar a `View` fixa posicionada (`position: 'absolute', bottom: 0`, `zIndex: theme.zIndex.toast`, `theme.elevation.floating`) e o padrão de `testID` no container — usar `testID="provisioning-banner"`. D-03 pede banner discreto e informativo (não modal bloqueante), então o layout de faixa fixa na base é o padrão certo a copiar; D-03 não pede ação do usuário (não há "Reassinar agora" button — é só aviso), então a `View.actions` com dois `TouchableOpacity` pode virar um único texto informativo sem botões, ou manter um botão "Entendi" para dispensar — decisão do plano.

---

### `__tests__/ProvisioningBanner.test.tsx` (test, request-response)

**Analog:** `__tests__/UpdateBanner.test.tsx` (arquivo completo, 224 linhas — lido integralmente)

**Estrutura de teste RTL para componente condicional** (linhas 1-3, 23-28, 67-72):
```typescript
/**
 * @jest-environment jsdom
 */
import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

import UpdateBanner from '../src/components/UpdateBanner';
import { useUpdateStore } from '../src/store/updateStore';

describe('UpdateBanner (web)', () => {
  it('sem nenhum evento ..., não renderiza nada (retorna null)', () => {
    const screen = render(<UpdateBanner />);
    expect(screen.queryByText('Nova versão disponível')).toBeNull();
  });
```
`ProvisioningBanner.test.tsx` cobre lógica pura de decisão (dado `expiryDate` + `now`, decide mostrar/ocultar e o texto), conforme Wave 0 Gaps do RESEARCH.md — não precisa do pragma `@jest-environment jsdom` porque não há `window` CustomEvent envolvido (o dado chega via prop/mock direto da função nativa, não de evento global). Copiar o padrão de `describe` + múltiplos `it` cobrindo: (a) sem dado → não renderiza; (b) >2 dias → não renderiza; (c) ≤2 dias → renderiza com texto esperado; (d) `Platform.OS !== 'ios'` → não renderiza. Usar `jest.mock` para a função do módulo nativo em vez do event dispatch do `UpdateBanner`.

**Mock de `Platform.OS` via `Object.defineProperty`** (linhas 43-51, 119-130):
```typescript
const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});
afterAll(() => {
  if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
});
```
Copiar tal qual, trocando o valor fixado para `'ios'` (caso feliz) e testando o inverso (`'web'`/`'android'` → `null`) no teste de guarda de plataforma.

---

### `scripts/resign.sh` (utility, batch)

**Analog:** `scripts/supabase-preflight.sh` (arquivo completo, 96 linhas — lido integralmente)

**Header + `set -euo pipefail` + funções de cor** (linhas 1-38):
```bash
#!/usr/bin/env bash
# scripts/supabase-preflight.sh — <descrição do porquê existe, contexto>
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

vermelho() { printf '\033[1;31m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[1;32m%s\033[0m\n' "$*"; }

uso() {
  cat >&2 <<'EOF'
uso: scripts/supabase-preflight.sh <hml|prod>
EOF
  exit 2
}
```
Copiar: `#!/usr/bin/env bash`, `set -euo pipefail`, `readonly REPO_ROOT` calculado via `BASH_SOURCE`, as funções de cor `vermelho`/`amarelo`/`verde`, e etapas numeradas com `echo` (padrão já usado no esqueleto do RESEARCH.md `"1/4 — prebuild"` etc.) — manter esse estilo de saída passo-a-passo em português, cores em falhas.

**Padrão de abort com mensagem explicativa + próximo passo** (linhas 68-85):
```bash
if [[ "$ref_linkado" != "$esperado_ref" ]]; then
  vermelho "ABORTADO: você declarou '$1', mas o diretório aponta para outro projeto."
  ...
  echo "  Para operar em '$1': supabase link --project-ref $esperado_ref" >&2
  exit 1
fi
```
Para `resign.sh`, aplicar o mesmo padrão em cada etapa que pode falhar silenciosamente (ex.: CocoaPods ausente, device não pareado, scheme não encontrado): mensagem `ABORTADO:` + causa + comando exato de correção — nunca deixar o script morrer só com o stderr cru do `xcodebuild`/`devicectl`.

**Confirmação interativa para operação de risco** (linhas 89-96):
```bash
if [[ "$esperado_ref" == "$REF_PROD" ]]; then
  amarelo "  O próximo comando vai atuar sobre DADOS REAIS de produção."
  printf "  Digite exatamente PRODUCAO para continuar: "
  read -r confirmacao
  if [[ "$confirmacao" != "PRODUCAO" ]]; then
    vermelho "ABORTADO: confirmação não recebida."
    exit 1
  fi
fi
```
Não é obrigatório para `resign.sh` (reassinar não é destrutivo como um `db push` em prod), mas o padrão fica disponível caso o plano decida confirmar antes de sobrescrever o app já instalado no device do dono.

---

### `scripts/verify-native-skeleton.sh` (utility, batch — smoke/trava)

**Analog primário:** `scripts/verify-web-bundle.mjs` (linhas 1-60 lidas — trava de build que falha com `process.exit(1)` e mensagem contextual)
**Analog secundário (estilo shell):** `scripts/supabase-preflight.sh` (mesmo do bloco acima)

**Padrão de trava que falha o processo com mensagem acionável** (linhas 1-16, 38-46 de `verify-web-bundle.mjs`):
```javascript
// Trava de deploy do PWA: falha o build se o bundle exportado não aponta para
// a API de produção ou se algum endereço de LAN vazou para o JS publicado.
// Roda encadeada no buildCommand do vercel.json — se as EXPO_PUBLIC_* não
// estiverem no ambiente do build ..., o deploy quebra AQUI, e não
// silenciosamente na mão do usuário.

let bundles;
try {
  bundles = listarJs(raiz);
} catch {
  console.error('verify-web-bundle: dist/ não existe — rode `npx expo export -p web` antes.');
  process.exit(1);
}
```
`verify-native-skeleton.sh` (Bash, conforme Recommended Project Structure do RESEARCH.md) deve seguir o mesmo espírito: comentário de cabeçalho explicando o "porquê" (evitar Pitfall 1 — target apagado silenciosamente pelo `--clean`), e cada checagem (`grep` no `.pbxproj`, `grep -L aps-environment` nos `.entitlements`, presença do módulo no autolinking) deve `exit 1` com mensagem de causa + comando de correção, nunca deixar passar em silêncio. Usar as funções `vermelho`/`verde` de `supabase-preflight.sh` para o relatório final PASS/FAIL de cada checagem.

---

## Shared Patterns

### Guarda de plataforma em componente React Native
**Fonte:** `src/components/UpdateBanner.tsx` linhas 80-81 + `__tests__/UpdateBanner.test.tsx` linhas 43-51
**Aplicar em:** `src/components/ProvisioningBanner.tsx` e seu teste
Sempre primeiro early-return do componente é a checagem de `Platform.OS`; o mock de `Platform.OS` em teste usa `Object.getOwnPropertyDescriptor` + `Object.defineProperty` com `configurable: true`, restaurado em `afterAll`/`finally`.

### Shell script de build/infra com trava explícita
**Fonte:** `scripts/supabase-preflight.sh` (arquivo inteiro)
**Aplicar em:** `scripts/resign.sh`, `scripts/verify-native-skeleton.sh`
`#!/usr/bin/env bash` + `set -euo pipefail` + funções de cor (`vermelho`/`amarelo`/`verde`) + mensagens `ABORTADO: <causa>` seguidas do comando exato de correção + `exit 0`/`exit 1` explícitos no fim. Comentários de cabeçalho em português explicando o "porquê" do script existir, não só o "o quê".

### `theme` como fonte única de estilo
**Fonte:** `src/theme/theme.ts` (importado por `UpdateBanner.tsx` linha 27) — não lido nesta sessão, mas confirmado pelo uso extensivo de `theme.colors.*`, `theme.spacing.*`, `theme.zIndex.toast`, `theme.elevation.floating`, `theme.hitTarget.compact`, `theme.fonts.ui`, `theme.typography.*`
**Aplicar em:** `ProvisioningBanner.tsx` — nenhum valor de cor/espaçamento hardcoded; tudo via `theme`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `targets/session-widget/expo-target.config.js` | config | event-driven | Primeiro target nativo scaffolded do projeto (`@bacons/apple-targets`); não existe `targets/` no repo hoje. Planner deve seguir o exemplo do README oficial citado em RESEARCH.md Pattern 1 (`ios.appleTeamId`, convenção de bundle id prefixado com `.`), não um análogo local. |
| `modules/native-info/ios/NativeInfoModule.swift` | service (bridge nativo) | request-response | Primeiro módulo Expo local em Swift do projeto; não existe `modules/` no repo hoje. Usar o exemplo Swift citado em RESEARCH.md Pattern 3 (parsing de `embedded.mobileprovision` via `Scanner` + `PropertyListDecoder`) como referência primária, não código do repo. |

## Metadata

**Analog search scope:** `src/components/`, `src/store/`, `scripts/`, raiz do repo (`app.json`, `package.json`), `__tests__/`
**Files scanned:** `src/components/UpdateBanner.tsx`, `__tests__/UpdateBanner.test.tsx`, `src/store/updateStore.ts`, `scripts/supabase-preflight.sh`, `scripts/verify-web-bundle.mjs`, `app.json`, `package.json`
**Pattern extraction date:** 2026-08-16
**Graphify:** grafo consultado (`graphify-out/graph.json` presente); busca de análogos feita via Glob/Grep direcionado por não haver query textual de grafo aplicável a "banner de aviso" — achados confirmados por leitura direta dos arquivos candidatos.
</content>
