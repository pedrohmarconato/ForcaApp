# Roadmap: ForcaApp

## Milestones

- ✅ **v1.0 Cardio e alongamento** — Phases 1-4 (shipped 2026-08-13) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Release em produção** — Phases 5-8 (shipped 2026-08-14) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 App de iPhone instalável via site (PWA)** — Phases 9-13 (shipped 2026-08-15) — [archive](milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Treino de tela bloqueada (app nativo pessoal)** — Phases 14-17 (in progress)

## Phases

<details>
<summary>✅ v1.0 Cardio e alongamento (Phases 1-4) — SHIPPED 2026-08-13</summary>

- [x] Phase 1: Fluxo cardio e alongamento (4/4 plans) — completed 2026-08-09
- [x] Phase 2: Anamnese e calibração do cardio (3/3 plans) — completed 2026-08-09
- [x] Phase 3: Intercâmbio de modalidade de cardio (9/9 plans) — completed 2026-08-13
- [x] Phase 4: Escrita de execução de treino em lote e offline-first (3/3 plans) — completed 2026-08-12

Detalhes completos: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Release em produção (Phases 5-8) — SHIPPED 2026-08-14</summary>

- [x] Phase 5: Integração e review do gráfico de cardio (2/2 plans) — completed 2026-08-14 (verificação 11/11; UAT visual do dono no PWA de produção: "passou")
- [x] Phase 6: Publicação do código (execução direta) — completed 2026-08-14 (push `0193742..82fd8db`, 68 commits, CI `session-contract` verde run 31822228262)
- [x] Phase 7: Migration 0037 em staging e produção (execução direta) — completed 2026-08-14 (errcode 23505 vivo, md5 `662cbd9e` idêntico staging×prod)
- [x] Phase 8: Deploy web e fechamento (execução direta) — completed 2026-08-14 (https://forca-app-six.vercel.app, 200; preview pulado por decisão do dono)

Detalhes completos: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

Nota de fechamento: override_closeout — fases 6-8 executadas sem diretórios de fase
(evidência direta em ROADMAP/STATE); sem audit formal de milestone.

</details>

<details>
<summary>✅ v1.2 App de iPhone instalável via site (PWA) (Phases 9-13) — SHIPPED 2026-08-15</summary>

- [x] Phase 9: Fechamento de gaps do runtime web (3/4 plans) — completed 2026-08-15 (override_closeout; UAT do dono no iPhone deferido)
- [x] Phase 10: Identidade do app instalável (0/1 plans) — completed 2026-08-15 (override_closeout; infra pronta, UAT do dono deferido)
- [x] Phase 11: Service worker e atualização segura (2/3 plans) — completed 2026-08-15 (override_closeout; UAT do dono deferido)
- [x] Phase 12: Página de instalação guiada (1/2 plans) — completed 2026-08-15 (override_closeout; UAT do dono deferido)
- [x] Phase 13: Push notification ponta a ponta (4/5 plans) — completed 2026-08-15 (infra verificada em produção 15/08; UAT do dono deferido)

Detalhes completos: [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

Nota de fechamento: override_closeout — UAT físico no iPhone DEFERIDO nas 5 fases
(roteiros em `milestones/v1.2-phases/*/NN-UAT.md`); infra da fase 13 concluída e
verificada em produção no mesmo dia (migrations 0038/0039 em staging+produção,
VAPID+service_role+scheduler no VPS, chave pública na Vercel, backend e web
deployados). Sem audit formal de milestone.

</details>

- [ ] **Phase 14: Fundação nativa** - Build nativo assinado no iPhone do dono + spike de App Groups que decide a arquitetura de estado
- [ ] **Phase 15: Tela bloqueada — ver e cronometrar** - Live Activity mostra a sessão ao vivo (Lock Screen + Dynamic Island) e o timer de descanso nativo, com ciclo de vida correto
- [ ] **Phase 16: Tela bloqueada — comandar** - Concluir série e ajustar descanso direto na tela bloqueada, via App Intents, sem abrir o app
- [ ] **Phase 17: Tela bloqueada — registrar e antecipar** - Registro de reps/carga sem teclado (app + tela bloqueada) e antecipação da próxima ação antes do descanso zerar

## Phase Details

### 🚧 v1.3 Treino de tela bloqueada (app nativo pessoal) (In Progress)

**Milestone Goal:** O dono faz a sessão de treino INTEIRA com o iPhone bloqueado —
vê, comanda e registra o treino pela tela bloqueada/Dynamic Island, como o Spotify
opera música — via app nativo pessoal por sideload gratuito (sem Apple Developer
pago, sem distribuição a terceiros).

#### Phase 14: Fundação nativa

**Goal**: O dono instala e roda o ForçaApp nativo assinado no próprio iPhone, com
a arquitetura de estado (com ou sem App Group) decidida por evidência do aparelho
físico, e a extensão de widget + módulo Swift sobrevivendo a um
`expo prebuild --clean`.
**Depends on**: Nothing (primeira fase de v1.3)
**Requirements**: NAT-01, NAT-02
**Success Criteria** (what must be TRUE):

  1. O dono abre o app nativo instalado no iPhone (fora do Expo Go), assinado com
     Apple ID pessoal, e usa o fluxo normal de sessão de treino sem diferença
     percebida em relação ao PWA. (UAT do dono no aparelho físico)

  2. O dono roda o comando único de reassinatura semanal documentado e o app volta
     a abrir sem erro de confiança/certificado. (UAT do dono no aparelho físico)

  3. Depois de `expo prebuild --clean`, o target da extensão de widget e o módulo
     nativo Swift continuam presentes no projeto Xcode gerado — nada foi apagado
     silenciosamente.

  4. O spike de App Groups no aparelho físico está registrado por escrito, com a
     decisão de arquitetura (com ou sem App Group) documentada para orientar as
     fases 16 e 17. (UAT do dono no aparelho físico)
**Plans**: 9 plans

Plans:
- [ ] 14-01-PLAN.md — Decisão de bundle identifiers (D-06) + aprovação de legitimidade dos pacotes SUS
- [ ] 14-02-PLAN.md — Pipeline nativo completo (tracer) + scripts/verify-native-skeleton.sh
- [ ] 14-03-PLAN.md — ProvisioningBanner.tsx + leitura do provisioning profile (D-03)
- [ ] 14-04-PLAN.md — scripts/resign.sh, rotina de reassinatura em 1 comando (D-01/D-02)
- [ ] 14-05-PLAN.md — Preparação do spike de App Groups (entitlement temporária + build assinado)
- [ ] 14-06-PLAN.md — Sessão 1 física: primeira instalação + Developer Mode + spike de App Groups
- [ ] 14-07-PLAN.md — Registro da decisão do spike (14-SPIKE-APP-GROUPS.md) + revert/keep
- [ ] 14-08-PLAN.md — Pre-flight automatizado antes da Sessão 2
- [ ] 14-09-PLAN.md — Sessão 2 física: UAT de reassinatura + paridade com o PWA
**UI hint**: yes

#### Phase 15: Tela bloqueada — ver e cronometrar

**Goal**: A tela bloqueada mostra a sessão de treino ao vivo — exercício atual,
série e timer de descanso nativo — nas 4 apresentações do Dynamic Island e no
Lock Screen, sem abrir o app, e a Live Activity se encerra sozinha quando a
sessão termina ou é cancelada (inclusive após force-quit).
**Depends on**: Phase 14
**Requirements**: LOCK-01, LOCK-02, LOCK-03
**Success Criteria** (what must be TRUE):

  1. Durante uma sessão ativa, o dono vê no Lock Screen e no Dynamic Island
     (compact/minimal/expanded) o exercício atual, a série X/Y e a prescrição
     (reps × carga), sem desbloquear o iPhone. (UAT do dono no aparelho físico)

  2. O timer de descanso conta regressivamente na tela bloqueada mesmo com o app
     suspenso, usando timestamp absoluto (`restEndsAt` no `activeSessionStore`) —
     não um push manual a cada segundo.

  3. Ao finalizar ou cancelar a sessão no app, a Live Activity desaparece da tela
     bloqueada sozinha, sem card "preso" mostrando treino velho.

  4. Depois de um force-quit do app durante uma sessão ativa, reabrir o app
     reconcilia e encerra qualquer Live Activity órfã que tenha sobrado na tela
     bloqueada. (UAT do dono no aparelho físico)
**Plans**: TBD
**UI hint**: yes

#### Phase 16: Tela bloqueada — comandar

**Goal**: O dono controla a série atual e o descanso direto da tela bloqueada —
sem abrir o app — com cada toque seguindo o mesmo caminho de registro
(`completeSet()` → outbox → servidor) que já existe hoje; a Live Activity nunca
vira fonte de verdade.
**Depends on**: Phase 15
**Requirements**: CMD-01, CMD-02
**Success Criteria** (what must be TRUE):

  1. O dono toca "Concluir série" na tela bloqueada e a série é registrada pelo
     mesmo caminho `completeSet()` → outbox → servidor já existente, sem abrir o
     app. (UAT do dono no aparelho físico)

  2. O dono toca "pular descanso" (ou ajusta o descanso) na tela bloqueada e o
     timer nativo reflete o ajuste imediatamente, sem lag perceptível. (UAT do
     dono no aparelho físico)

  3. Um teste deliberado de "force-quit do app e depois tocar o botão da tela
     bloqueada" mostra o comportamento esperado — ação aplicada de fato ou app
     reaberto para concluir — validando o modelo de processo do `perform()` no
     cold-launch. (UAT do dono no aparelho físico)
**Plans**: TBD

#### Phase 17: Tela bloqueada — registrar e antecipar

**Goal**: O dono registra reps e carga sem teclado — pré-preenchido do histórico,
ajuste só por botões +/− e confirmação em 1 toque — tanto no app quanto na Live
Activity da tela bloqueada, e a tela bloqueada já antecipa a próxima
série/exercício antes do descanso acabar.
**Depends on**: Phase 16
**Requirements**: REG-01, REG-02, PRED-01
**Success Criteria** (what must be TRUE):

  1. Ao registrar uma série no app, reps e carga aparecem pré-preenchidos com o
     valor da última sessão do mesmo exercício, ajustáveis só por botões +/− (passo
     de anilha por exercício) e confirmados em 1 toque, sem precisar abrir o
     teclado.

  2. O mesmo ajuste por +/− e confirmação funciona na Live Activity da tela
     bloqueada, com o valor acumulado entre toques preservado corretamente,
     conforme a arquitetura decidida no spike da Fase 14. (UAT do dono no aparelho
     físico)

  3. Um valor fora do passo do stepper (ex.: 37,5 kg com passo de 5) abre o app a
     partir da tela bloqueada em vez de travar ou truncar o valor. (UAT do dono no
     aparelho físico)

  4. Antes do descanso acabar, a tela bloqueada já mostra a próxima
     série/exercício e a prescrição prevista, sem esperar o descanso chegar a
     zero. (UAT do dono no aparelho físico)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fluxo cardio e alongamento | v1.0 | 4/4 | Complete | 2026-08-09 |
| 2. Anamnese e calibração do cardio | v1.0 | 3/3 | Complete | 2026-08-09 |
| 3. Intercâmbio de modalidade de cardio | v1.0 | 9/9 | Complete | 2026-08-13 |
| 4. Escrita de execução de treino em lote e offline-first | v1.0 | 3/3 | Complete | 2026-08-12 |
| 5. Integração e review do gráfico de cardio | v1.1 | 2/2 | Complete | 2026-08-14 |
| 6. Publicação do código | v1.1 | direto | Complete | 2026-08-14 |
| 7. Migration 0037 em staging e produção | v1.1 | direto | Complete | 2026-08-14 |
| 8. Deploy web e fechamento | v1.1 | direto | Complete | 2026-08-14 |
| 9. Fechamento de gaps do runtime web | v1.2 | 3/4 | Complete (override) | 2026-08-15 |
| 10. Identidade do app instalável | v1.2 | 0/1 | Complete (override) | 2026-08-15 |
| 11. Service worker e atualização segura | v1.2 | 2/3 | Complete (override) | 2026-08-15 |
| 12. Página de instalação guiada | v1.2 | 1/2 | Complete (override) | 2026-08-15 |
| 13. Push notification ponta a ponta | v1.2 | 4/5 | Complete (override) | 2026-08-15 |
| 14. Fundação nativa | v1.3 | 0/9 | Not started | - |
| 15. Tela bloqueada — ver e cronometrar | v1.3 | 0/TBD | Not started | - |
| 16. Tela bloqueada — comandar | v1.3 | 0/TBD | Not started | - |
| 17. Tela bloqueada — registrar e antecipar | v1.3 | 0/TBD | Not started | - |
