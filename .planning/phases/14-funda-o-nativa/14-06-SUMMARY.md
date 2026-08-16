---
phase: 14-funda-o-nativa
plan: 06
subsystem: infra
tags: [ios, device, app-groups, widget, provisioning, physical-session]

requires:
  - phase: 14-funda-o-nativa (plano 05)
    provides: "Build assinado com entitlement de App Group e módulo de round-trip"
provides:
  - "Sessão 1 física concluída: app instalado e aberto no iPhone 13 físico, fora do Expo Go"
  - "Resultado do spike D-09 confirmado pelo dono: App Groups FUNCIONA em time pessoal gratuito (round-trip=PASS)"
  - "Modo de Desenvolvedor ativado e certificado de desenvolvedor confiado no aparelho"
  - "Achado fora de escopo registrado: login não funciona no aparelho (backend em localhost)"
affects: [14-07, 14-08, 14-09]

actuals:
  tokens: 0
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Build Release (não Debug) para instalação no aparelho: Debug não embute main.jsbundle e exige Metro"

key-files:
  created:
    - .planning/phases/14-funda-o-nativa/14-06-SUMMARY.md
    - .planning/todos/pending/backend-supabase-producao-no-aparelho.md
  modified: []

key-decisions:
  - "Round-trip de App Groups aprovado pelo dono como PASS — o milestone v1.3 pode contar com widget e app compartilhando estado de sessão"
  - "Login no aparelho tratado como pendência fora do escopo da Fase 14; backend será Supabase em produção conectado ao banco original, depois da fase"

patterns-established:
  - "Verificação física sem depender de log de JavaScript: NSLog nativo aparece em `devicectl device process launch --console`; console.log do RN não"
  - "Container de App Group é inspecionável do Mac via `devicectl device info files --domain-type appGroupDataContainer`, o que permite provar a escrita sem instrumentar o app"

requirements-completed: [NAT-02]

coverage:
  - id: D1
    description: "App instala e abre no iPhone físico, fora do Expo Go, com certificado confiado"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "Resposta literal do dono (2026-08-16): item (a) = PASS"
        status: pass
      - kind: e2e
        ref: "xcrun devicectl device process launch --console com.pmarconato.forcaapp → 'Launched application with com.pmarconato.forcaapp bundle identifier'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Round-trip de App Group entre extensão de widget e app principal em time pessoal gratuito"
    requirement: "NAT-02"
    verification:
      - kind: e2e
        ref: "Console do aparelho: '[AppGroupSpike] read OK — value=app-group-spike-2026-08-16 21:21:35 +0000'"
        status: pass
      - kind: e2e
        ref: "Container puxado do aparelho: Library/Preferences/group.com.pmarconato.forcaapp.shared.plist → appGroupSpikeValue"
        status: pass
      - kind: manual_procedural
        ref: "Resposta literal do dono (2026-08-16): item (b) = PASS"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-16
status: complete
---

# Plano 14-06: Sessão 1 física — instalação no aparelho e spike de App Groups — Summary

**App nativo instalado e aberto no iPhone 13 do dono, e o spike respondeu a pergunta que sustenta o milestone: conta Apple gratuita concede App Groups, e o widget consegue passar dado para o app principal.**

## Respostas do dono (formato exigido por D-10)

Registradas literalmente, conforme a proibição do plano de nunca presumir aprovação por "compilou":

| Item | Resposta |
|---|---|
| (a) app abre no aparelho, fora do Expo Go | **PASS** |
| (b) round-trip de App Group | **PASS** |

Sobre o widget, o dono observou: *"o widget mostra time e favorite emoji quando eu clico vai para o app"*. Isso é o template padrão da Apple para extensões de widget — a Fase 14 entrega o alicerce da extensão, não o conteúdo dela. Renderizar na tela e abrir o app ao toque é o comportamento correto nesta etapa.

## Evidência de máquina do round-trip

Duas provas independentes, ambas colhidas do aparelho físico:

**1. Escrita (processo da extensão de widget)** — container compartilhado puxado do iPhone com `devicectl device info files --domain-type appGroupDataContainer`:

```
Library/Preferences/group.com.pmarconato.forcaapp.shared.plist   111 bytes
  appGroupSpikeValue => "app-group-spike-2026-08-16 21:09:59 +0000"
```

**2. Leitura (processo do app principal)** — console nativo do aparelho:

```
[AppGroupSpike] read invoked for suiteName group.com.pmarconato.forcaapp.shared
[AppGroupSpike] read OK — value=app-group-spike-2026-08-16 21:21:35 +0000
```

O valor lido (21:21:35 UTC) é posterior ao primeiro (21:09:59 UTC): o widget regravou após a reinstalação e o app leu o valor novo um minuto depois. Processos distintos, escrita e leitura, no mesmo container — ciclo completo.

Os perfis de provisionamento emitidos pela Apple para o time gratuito `9WD49Z5TV7` já concediam `com.apple.security.application-groups` com `group.com.pmarconato.forcaapp.shared` para os dois alvos, e a execução confirmou que a concessão vale em tempo de execução, não só no papel.

## Deviations

Três desvios do runbook, todos por causa real descoberta na execução:

1. **O app nunca chamava a leitura.** A Plano 14-05 entregou `readAppGroupSpikeValue()` mas nenhum call site em `App.tsx` ou `src/` — o passo 7 do runbook era inobservável como construído. Foi preciso encadear a chamada (commit `63eee6c`).
2. **`console.log` do React Native não chega ao console do aparelho.** O `devicectl ... --console` só mostra saída nativa. A instrumentação foi movida para `NSLog` no módulo Swift (commit `b6a204f`), o que também deixou distinguível "nunca chamado" de "chamado e retornou nulo".
3. **Build Debug não roda sozinho no aparelho.** Não embute `main.jsbundle` e depende do Metro; sem o servidor, o JavaScript nunca carregava e o módulo nunca era invocado. A observação só foi possível com build **Release** (bundle de 5,7 MB embutido), que é também o artefato que o milestone realmente quer — app que funciona sem o Mac por perto.

## Achado fora de escopo

**Login não funciona no aparelho.** `EXPO_PUBLIC_SUPABASE_URL` aponta para `127.0.0.1:54321`, que dentro do iPhone é o próprio aparelho, e o Supabase local sequer estava em execução. Decisão do dono, literal: *"registrar que iremos usar o supabase em producao conectado ao banco original depois vamos completar a fase 14"*. Registrado em `.planning/todos/pending/backend-supabase-producao-no-aparelho.md`. Não afeta os critérios da Fase 14, que não dependem de autenticação.

## Self-Check: PASSED

- Resposta explícita do dono nos dois itens, citada literalmente: PASS
- Round-trip provado por duas evidências independentes de máquina: PASS
- Nenhum item presumido PASS por "compilou" (proibição D-10 respeitada): PASS
- Achado de login separado do escopo em vez de silenciado ou corrigido por conta própria: PASS
