---
phase: 14
slug: funda-o-nativa
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-16
validated: 2026-08-19
---

# Fase 14 — Validation Strategy

> Contrato de validação por fase, aplicado retroativamente após `14-VERIFICATION.md`
> (passed), `14-REVIEW.md` (0 CRITICAL / 4 WARNING / 2 INFO, todos fechados) e
> `14-SECURITY.md` (verified, 17 ameaças, 0 abertas).

---

## Natureza desta fase

NAT-01/NAT-02 são, na maior parte, garantias de **build nativo e infraestrutura
de assinatura**, não lógica JS. O instrumento principal de prova é
`scripts/verify-native-skeleton.sh` — script determinístico que roda `expo
prebuild --clean` duas vezes consecutivas e prova onze condições (a)–(k) sem
alteração de estado entre as rodadas. As suítes Jest cobrem só a fração de
comportamento que roda em JS (o banner de aviso e os guard-imports de
plataforma).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (JS) + shell script determinístico (nativo) |
| **Config file** | `jest.config.js` / `scripts/verify-native-skeleton.sh` |
| **Quick run command** | `npx jest __tests__/ProvisioningBanner.test.tsx __tests__/nativeModulePlatformImport.test.ts __tests__/liveActivityPlatformImport.test.ts` |
| **Full suite command** | `npx jest` **e** `bash scripts/verify-native-skeleton.sh` **e** `bash scripts/verify-resign-name-escaping.sh` |
| **Estimated runtime** | Jest: ~22s · `verify-native-skeleton.sh`: ~2–4min (2x prebuild + pod install + prova Swift) · `verify-resign-name-escaping.sh`: <1s |

---

## Sampling Rate

- **Após cada task de código JS:** suíte rápida acima
- **Após cada plano que toque `targets/`, `modules/`, `app.json`, `scripts/resign.sh` ou `scripts/verify-native-skeleton.sh`:** `bash scripts/verify-native-skeleton.sh` (deve sair 0)
- **Antes de fechar a fase:** suíte Jest completa verde + `verify-native-skeleton.sh` verde
- **Max feedback latency:** ~4min (limitado pelo prebuild nativo, não pelo Jest)

---

## Per-Requisito Verification Map

| Requisito | O que prova | Test Type | Automated Command | Status |
|---|---|---|---|---|
| NAT-01 (build/assinatura) | `scripts/resign.sh` builda em `-configuration Release` (embute `main.jsbundle`), aborta com mensagem acionável em 0/2+ devices conectados, deriva o scheme por `expo.name` sem interpolação insegura | shell/smoke | `bash scripts/verify-native-skeleton.sh` (checagem f) + `bash scripts/verify-resign-name-escaping.sh` | ✅ green |
| NAT-01 (rotina em 1 comando) | `npm run resign` é um único comando documentado, idempotente, repetível semanalmente | smoke (estático) | `bash scripts/verify-native-skeleton.sh` (checagens a, f) | ✅ green |
| NAT-01 (instalação física) | app instalado e aberto no iPhone do dono, fora do Expo Go | manual | — | ⚠️ manual-only, ver Ressalva |
| NAT-02 (target de widget sobrevive a `--clean`) | `session-widget` reaparece em `ios/*.xcodeproj/project.pbxproj` após 2 rodadas de `--clean` | shell | `bash scripts/verify-native-skeleton.sh` (checagem b) | ✅ green |
| NAT-02 (módulos nativos sobrevivem a `--clean`) | `native-info`/`live-activity` autolinked (checagem d) **e** de fato compilados em `ios/Podfile.lock` (checagem e), não só descobertos em disco | shell | `bash scripts/verify-native-skeleton.sh` (checagens d, e) | ✅ green |
| NAT-02 (nenhuma entitlement de push vaza cedo) | nenhum `.entitlements` gerado contém `aps-environment`, com guarda contra `find` vazio (WR-01) | shell | `bash scripts/verify-native-skeleton.sh` (checagem c) | ✅ green |
| NAT-02 (App Group sobrevive a `--clean`, IN-04) | `group.com.pmarconato.forcaapp.shared` presente nos dois `.entitlements` gerados (app + widget) | shell | `bash scripts/verify-native-skeleton.sh` (checagem k) | ✅ green |
| NAT-02 (spike de App Groups decide arquitetura por escrito) | round-trip PASS/PASS documentado com evidência de máquina (escrita/leitura em processos distintos), decisão "COM App Group" registrada | documento | `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` | ✅ green (documental) |
| — (JS) Banner não trava em rejeição da ponte nativa (WR-04) | `getProvisioningProfileExpiry()` rejeitando não vira unhandled rejection; banner permanece oculto | unit | `npx jest __tests__/ProvisioningBanner.test.tsx` | ✅ green |
| — (JS) Import de módulo nativo não quebra em plataforma não-iOS | guard de `Platform.OS` nos módulos `native-info`/`live-activity` | unit | `npx jest __tests__/nativeModulePlatformImport.test.ts __tests__/liveActivityPlatformImport.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ manual-only*

---

## Lacunas encontradas e fechadas nesta validação

### Lacuna 1 — WR-03 (escape de `expo.name` no `node -e` de `resign.sh`) sem prova comportamental

`14-REVIEW.md` (WR-03) e `14-SECURITY.md` confirmaram a correção **por leitura
de código**: `EXPO_NAME` passa por variável de ambiente (`process.env.EXPO_NAME`)
em vez de interpolação de string dentro do literal JS do `node -e`
(`scripts/resign.sh:61-72`). Nenhum teste automatizado exercitava essa
correção com um valor adversarial — o gap real era "a prova existe só como
leitura estática, não como comportamento".

**Fechado:** criei `scripts/verify-resign-name-escaping.sh`, que reproduz
byte-a-byte o segundo `node -e` de `resign.sh:62-72`, injeta
`expo.name = "ForcaApp'; require('fs').writeFileSync('<sentinela>', 'pwned'); //"`
e prova que (a) nenhum código injetado executa e (b) o nome malicioso não
casa com nenhum scheme real. Confirmei que o teste **falha corretamente**
contra o padrão antigo vulnerável (interpolação de string dentro do `-e`):
reproduzi manualmente o padrão pré-WR-03 em `/tmp/old_pattern_test.sh` e o
arquivo sentinela foi criado (injeção confirmada), provando que o teste novo
não é trivial.

```
$ bash scripts/verify-resign-name-escaping.sh
OK: expo.name malicioso nao executa codigo e nao casa com scheme algum (WR-03 comportamentalmente provado).
$ echo $?
0
```

Nenhuma outra lacuna de amostragem real foi encontrada: as checagens (a)–(k)
de `verify-native-skeleton.sh` já provam comportamento observável (não
estrutura), a suíte `ProvisioningBanner.test.tsx` já cobre o caso adversarial
mais provável (WR-04, rejeição da ponte nativa) com asserção em
`unhandledRejection`, e `14-SPIKE-APP-GROUPS.md` já documenta o round-trip
físico por escrito conforme NAT-02 exige.

---

## Execução desta validação (2026-08-19)

| Comando | Resultado |
|---|---|
| `bash scripts/verify-native-skeleton.sh` | ✅ exit 0, 2 rodadas idênticas (após limpeza de um resíduo de `ios/Pods/Local Podspecs` de uma execução anterior interrompida — falha de ambiente, não do código; reproduzida e confirmada estável em execução limpa subsequente) |
| `bash scripts/verify-resign-name-escaping.sh` (novo) | ✅ exit 0 |
| `npx jest` | ✅ 169 suítes / 2030 testes — igual ao baseline (o teste novo é shell, não Jest, não altera a contagem) |
| `npx tsc --noEmit` | ✅ sem erros |
| `xcrun devicectl list devices` | `iPhone de Pedro Henrique` = `unavailable` (não conectado agora) |

---

## Manual-Only Verifications

| Comportamento | Requisito | Por que é manual | Instruções de teste |
|---|---|---|---|
| App instalado e abrindo no iPhone físico do dono, fora do Expo Go | NAT-01 | Exige aparelho conectado por cabo e pareado (`xcrun devicectl`); hoje o device está `unavailable`. A última tentativa de `npm run resign` **compilou** (`BUILD SUCCEEDED`) mas **falhou ao instalar** por falta de device disponível. | Conectar o iPhone por cabo, confirmar `xcrun devicectl list devices` = `available`, rodar `npm run resign` e confirmar visualmente que o app abre fora do Expo Go. |
| Round-trip de App Group no aparelho físico (write no widget → read no app) | NAT-02 | Exige duas extensões rodando simultaneamente no device físico; não reproduzível em CI/simulador com fidelidade suficiente para a decisão arquitetural. | Já executado e documentado por escrito em `14-SPIKE-APP-GROUPS.md` (Plano 14-06, evidência de `devicectl device info files` + console nativo) — **não** pendente, apenas não re-executável por automação nesta sessão. |

---

## Validation Sign-Off

- [x] Todo requisito com garantia automatizável tem comando reproduzível verde
- [x] Nenhuma checagem de `verify-native-skeleton.sh` passa sem exercitar (WR-01 fechado; guarda contra `find` vazio confirmada em (c) e espelhada em (k))
- [x] Gap de cobertura comportamental (WR-03) fechado com `scripts/verify-resign-name-escaping.sh`, testado positivo e negativo (falha contra o padrão antigo)
- [x] Sem flags de watch-mode
- [x] `nyquist_compliant: true` setado no frontmatter
- [ ] NAT-01 — instalação física no iPhone do dono: **não provada por automação nesta sessão** (device `unavailable`). Build/assinatura são verificáveis por máquina e estão verdes; a instalação em si permanece manual-only, registrada acima, não fabricada como PASS.

**Approval:** approved 2026-08-19 (com a ressalva explícita de NAT-01/instalação física acima — consistente com `14-09-SUMMARY.md` e o histórico de pausa em UAT registrado no MEMORY do projeto).
