# Spike D-09 — App Groups em time Apple pessoal gratuito

**Data:** 2026-08-16
**Fonte:** Plano 14-06 (sessão física no iPhone 13 do dono), registrado por escrito nesta Plano 14-07 conforme NAT-02.

## Resultado literal reportado pelo dono (14-06-SUMMARY.md)

| Item | Resposta do dono |
|---|---|
| (a) app abre no aparelho, fora do Expo Go | **PASS** |
| (b) round-trip de App Group (widget escreve → app lê) | **PASS** |

**round-trip = PASS**, confirmado nas duas direções, sem ambiguidade — não se aplica a política de "tratar ambíguo/vazio como SEM App Group" (14-07-PLAN.md, `must_haves`).

## Decisão: COM App Group (id = group.com.pmarconato.forcaapp.shared)

## Evidência de máquina que sustenta o PASS (colhida na Plano 14-06, iPhone 13 físico)

1. **Escrita** (processo da extensão de widget) — container compartilhado puxado do aparelho via `devicectl device info files --domain-type appGroupDataContainer`:
   ```
   Library/Preferences/group.com.pmarconato.forcaapp.shared.plist   111 bytes
     appGroupSpikeValue => "app-group-spike-2026-08-16 21:09:59 +0000"
   ```
2. **Leitura** (processo do app principal) — console nativo do aparelho:
   ```
   [AppGroupSpike] read invoked for suiteName group.com.pmarconato.forcaapp.shared
   [AppGroupSpike] read OK — value=app-group-spike-2026-08-16 21:21:35 +0000
   ```
   O valor lido (21:21:35 UTC) é posterior ao escrito (21:09:59 UTC): processos distintos, escrita e leitura, no mesmo container — ciclo completo, não coincidência de cache.
3. Os perfis de provisionamento emitidos pela Apple para o time gratuito `9WD49Z5TV7` concedem `com.apple.security.application-groups = group.com.pmarconato.forcaapp.shared` para os dois alvos (`com.pmarconato.forcaapp` e `com.pmarconato.forcaapp.session-widget`), confirmado tanto em artefato assinado (`codesign -d --entitlements -`, Plano 14-05) quanto em tempo de execução (Plano 14-06).

## Implicação para as Fases 15 (LOCK) e 16 (CMD)

**Um time Apple pessoal gratuito concede App Groups.** As Fases 15 e 16 podem projetar a arquitetura de estado da Live Activity assumindo `UserDefaults(suiteName: "group.com.pmarconato.forcaapp.shared")` como canal de comunicação legítimo e funcional entre o app principal e a extensão de widget/Live Activity — não é necessário desenhar um fallback "sem App Group" (ex.: deep link, polling de API, Darwin notification sem shared container) como caminho principal. O App Group já está congelado como configuração permanente em `app.json` e `targets/session-widget/expo-target.config.js` (entitlement idêntica nos dois, `group.com.pmarconato.forcaapp.shared`) e sobrevive a `expo prebuild --clean` (confirmado por `scripts/verify-native-skeleton.sh`).

O código que efetivamente escreve/lê o estado real da Live Activity (não o valor trivial de spike) é responsabilidade das Fases 15/16 construírem do zero — `modules/app-group-spike/` era descartável por design e foi removido nesta Plano 14-07 (ver Deviations em `14-07-SUMMARY.md`).

## Estado do repositório após esta decisão

- `app.json` — entitlement `com.apple.security.application-groups` = `["group.com.pmarconato.forcaapp.shared"]` **mantida** (D-06, congelado).
- `targets/session-widget/expo-target.config.js` — mesma entitlement **mantida**, idêntica.
- `modules/app-group-spike/` — **removido por inteiro** (módulo descartável, único propósito era este spike).
- `App.tsx` — chamada de leitura do spike (`readAppGroupSpikeValue`) e o `useEffect` associado **removidos**.
- `targets/session-widget/widgets.swift` — bloco de escrita `// SPIKE-ONLY (14-05)` **removido**.
- `package.json` / `package-lock.json` — dependência `app-group-spike` **removida**.
- `scripts/verify-native-skeleton.sh` — checagem (e) de módulos locais linkados ajustada para cobrir só `NativeInfoModule` (o módulo `app-group-spike` não existe mais para ser checado).
