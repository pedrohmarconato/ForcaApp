# Feature Research

**Domain:** Treino operado pela tela bloqueada (Live Activity + Dynamic Island) em app nativo iOS pessoal (sideload gratuito)
**Researched:** 2026-08-15
**Confidence:** MEDIUM (cross-checado entre documentação oficial Apple/WWDC, artigos técnicos independentes convergentes, páginas de feature de Hevy/Strong/SmartGym e fóruns de desenvolvedor Apple; nenhuma fonte HIGH única porque a Apple não publica um "guia de app de treino", mas os limites técnicos de ActivityKit citados aparecem repetidos e consistentes em múltiplas fontes independentes)

## Contexto específico do projeto

O ForcaApp já tem sessão interativa série-a-série, timer de descanso e outbox offline (`activeSessionStore.ts`, 1833 linhas — draft de sessão, sets, exercícios, adaptação intra-sessão). O v1.3 não recria esse motor: **estende** o estado dele para uma superfície nativa (Live Activity) via um módulo ponte (bridge nativo Swift/ActivityKit ↔ RN). Isso muda a leitura padrão de "features de Live Activity":

- **Não existe App Store nem push nativo/APNs neste ciclo** (sideload gratuito, Apple ID pessoal) — toda atualização da Live Activity tem de ser **local** (`Activity.update()` a partir do processo do app/extensão em foreground ou acordado por evento local), nunca via push remoto. Isso elimina o "budget de push por hora" como preocupação real, mas introduz uma restrição mais severa: a Live Activity só atualiza quando o app (ou uma extensão com permissão) está rodando o suficiente para chamar `update()`.
- **Uso pessoal, ambiente controlado (o dono, na academia, com o próprio iPhone)** — decisões que seriam erradas para um produto de App Store (ex.: reassinatura manual semanal, sessão de áudio "truque" para manter processo vivo) são aceitáveis aqui porque não há revisão de loja nem usuário terceiro sofrendo o atrito.
- **iOS 26.x confirmado no aparelho do dono** — Live Activity interativa plena (botões via App Intents no Lock Screen e no Dynamic Island expandido) está disponível desde iOS 17 e é o piso técnico deste milestone; não há necessidade de fallback para iOS mais antigo.
- **Sem teclado em nenhuma superfície de tela bloqueada** — ActivityKit não expõe `TextField` nem qualquer entrada de texto livre em Live Activity; a única interatividade suportada é `Button(intent:)` e `Toggle(intent:)` ligados a `LiveActivityIntent`. Isso não é uma limitação de design a ser contornada — é uma restrição de plataforma que **define** a forma do registro de série (stepper, não campo de texto).

## Feature Landscape

### Table Stakes (Users Expect These)

Features que, faltando, fazem a Live Activity "parecer quebrada" frente ao padrão já estabelecido por Hevy, Strong e SmartGym — não são diferencial, são o preço de entrada de "treino na tela bloqueada".

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Card de Live Activity com exercício atual + série X/Y visível no Lock Screen sem desbloquear | Hevy e Strong mostram "o que fazer agora" (exercício, série atual, prescrição de carga/reps) direto no Lock Screen; é o mínimo para "não precisar abrir o app" | MEDIUM | Layout Lock Screen = layout expandido do Dynamic Island (mesma `ActivityConfiguration`, mais espaço); usar o `ContentState` já modelado a partir de `activeSessionStore` |
| Timer de descanso visível e correndo na Live Activity (contagem regressiva) | Hevy mostra o timer de descanso na própria Live Activity assim que a série é marcada como concluída; é a razão nº1 de o usuário olhar o Lock Screen durante o treino | MEDIUM | `Text(timerInterval:)` do SwiftUI conta de forma nativa sem precisar de push/update por segundo — evita gastar o processo do app |
| Botão "concluir série" que funciona sem abrir o app | Interatividade via App Intents (`Button(intent:)`) é suportada desde iOS 17 no Lock Screen e no Dynamic Island expandido; usuário espera 1 toque, não abrir o app | MEDIUM-HIGH | Exige `LiveActivityIntent` compartilhado entre app e extensão; `perform()` roda em processo restrito — deve só gravar o resultado (ex.: escrever no outbox/`activeSessionStore`) e devolver rápido, nunca fazer chamada de rede síncrona |
| Botão "pular descanso" / ajustar descanso (+/-) direto na Live Activity | Hevy permite ajustar o timer em incrementos de 15s ou pular via widget, sem abrir o app; é o padrão de mercado para descanso | LOW-MEDIUM | Mesmo mecanismo do botão de concluir série — outro `LiveActivityIntent`; ajuste de tempo é aritmética local, sem I/O bloqueante |
| Compact view no Dynamic Island (pill) com estado mínimo (série atual + tempo de descanso) | Quando o usuário está com outro app aberto (Spotify, Câmera), o Dynamic Island precisa mostrar o essencial em 2 blocos (leading/trailing) — é o comportamento padrão de toda Live Activity de terceiros observada (Hevy, SmartGym) | LOW | `DynamicIslandExpandedRegion` + par compact-leading/compact-trailing; reaproveita os mesmos dados do Lock Screen, só reduz a apresentação |
| Estado "minimal" do Dynamic Island quando outra Live Activity concorre por espaço | É comportamento obrigatório da API (`ActivityConfiguration` exige as 4 apresentações); sem ele o sistema usa um fallback genérico feio | LOW | Ícone/selo simples (ex.: número da série); baixo esforço de design, mas não pode ser omitido — a API não compila/funciona sem essa view |
| Encerramento automático da Live Activity ao fim da sessão (ou sessão fica "presa" na tela) | Todo app de treino com Live Activity encerra a atividade quando o treino termina/é cancelado; deixá-la viva indefinidamente é o erro mais visível de UX nesta categoria | LOW | `Activity.end(...)` disparado pelo mesmo fluxo que hoje finaliza a sessão em `activeSessionStore`; atenção ao limite de 8-12h de janela ativa do sistema (ver Pitfalls) |
| Confirmação tátil/visual do toque no botão (haptic) | Todo padrão de UX de logging sem teclado observado (StrongLifts, Hevy) usa haptic em cada interação porque mão pode estar suada/sem atenção visual | LOW | Botões de Live Activity herdam o haptic padrão do sistema ao tocar; não requer código extra, mas deve ser testado no aparelho físico (simulador não reproduz) |

### Differentiators (Competitive Advantage)

Features que vão além do que Hevy/Strong/SmartGym oferecem, viáveis só porque este é sideload pessoal sem review de loja.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Registro de reps/carga sem teclado, pré-preenchido do histórico, ajuste só por +/- e confirmação em 1 toque — **componente compartilhado entre app e Live Activity** | Nenhum dos apps pesquisados (Hevy, Strong, SmartGym) expõe stepper de reps/carga *dentro* da Live Activity — eles limitam a interatividade a timer/skip. Fazer o registro completo da série (não só o descanso) pela tela bloqueada é o North Star do milestone e o diferencial real frente ao mercado | HIGH | Cada incremento de +/- em uma Live Activity é uma invocação separada de `LiveActivityIntent` com `perform()` rodando no processo de widget extension — precisa de estado compartilhado (App Group + `UserDefaults`/arquivo compartilhado) entre extensão e app para não perder o valor acumulado entre toques; RN herda o mesmo componente via ponte nativa, não reimplementação |
| Modo mãos-livres com cues falados durante a sessão (via `AVAudioSession` categoria `.playback` mantendo processo vivo) | Nenhum concorrente pesquisado oferece cue de voz nativo durante Live Activity — SmartGym e Hevy dependem do usuário olhar a tela. Cue falado ("descanso acabou", "próxima série: 4x12 a 40kg") fecha o loop "olhos fechados, treino guiado por áudio", equivalente ao Spotify tocando entre séries | HIGH | Só viável porque é sideload sem review de loja: a técnica de "áudio silencioso contínuo" para manter o processo ativo em background é uma zona cinzenta das guidelines da App Store (`Background Modes → Audio`) — aceitável aqui, seria motivo de rejeição em app público. Depende de `AVSpeechSynthesizer` + `AVAudioSession` category `.playback`; comportamento de disparo de fala com o telefone bloqueado é reportado como inconsistente em fóruns Apple — precisa validação empírica no aparelho, não só documentação |
| Fim de descanso audível com som/vibração mesmo com o app fechado, via notificação local agendada (`UNUserNotificationCenter`) no início do descanso | Garante que o aviso de "descanso acabou" funcione mesmo se o processo do app for suspenso pelo sistema entre o início do timer e o fim — não depende do modo mãos-livres estar ativo | LOW-MEDIUM | Notificação local agendada com o tempo exato do descanso, cancelada/reagendada se o usuário pular ou ajustar o descanso pela Live Activity; complementa (não substitui) o timer visual da Live Activity |
| Botão "próxima ação prevista" (padrão "predictive action" da SmartGym) que já mostra o que vem depois do descanso, sem esperar o usuário decidir | SmartGym usa esse padrão especificamente para reduzir toques — "sempre mostra o próximo passo". Aplicável aqui porque o motor de sessão (`activeSessionStore`) já sabe a ordem prescrita da série seguinte | MEDIUM | Requer expor no `ContentState` da Live Activity não só o estado atual mas o próximo (exercício/série seguinte), o que já existe como dado no store — é composição de UI, não engenharia nova de dados |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Campo de texto livre na Live Activity para digitar carga/reps exatos | Parece mais rápido para valores fora do padrão de incremento (ex.: 37,5kg) | ActivityKit **não suporta `TextField`** em Live Activity — não é uma escolha de produto, é impossível na plataforma; tentar contornar (ex.: abrir o app a cada valor atípico) quebra o North Star de "tela inteira bloqueada" | Stepper com incremento configurável por exercício (passo de anilha: 1kg/2,5kg/5kg) cobre >95% dos casos; valor atípico exige abrir o app uma vez — aceitar como exceção, não tentar resolver na Live Activity |
| Atualizar a Live Activity via push remoto (APNs) para ficar "sempre fresca" mesmo com o app suspenso | Padrão usado por apps de App Store (delivery, live score) que têm servidor push e budget de update | Este milestone é sideload gratuito sem Apple Developer pago — **APNs de produção não está disponível** nesse regime (decisão já registrada no PROJECT.md); tentar simular isso adiciona complexidade de infraestrutura sem caminho de deploy real | Atualização local (`Activity.update()` disparada pelo próprio app) combinada com notificação local agendada para o fim do descanso — cobre o caso de uso real sem depender de push |
| Manter a Live Activity viva indefinidamente entre sessões ("treino de amanhã já aparece hoje") | Parece conveniente para não precisar iniciar a Live Activity a cada treino | O sistema limita a janela ativa a 8–12h e depois marca a atividade como stale e a remove; forçar persistência further luta contra a plataforma e gera comportamento inconsistente (a atividade some sozinha em momento imprevisível) | Iniciar a Live Activity só quando a sessão começa e encerrá-la explicitamente ao fim/cancelamento — alinhado ao ciclo de vida real de `activeSessionStore` |
| Ações "pesadas" no botão da Live Activity (ex.: chamar o backend Flask/Claude para recalcular a sessão a partir de um toque na tela bloqueada) | Parece natural reaproveitar o mesmo botão para qualquer ação da sessão, incluindo replanejamento | `perform()` de um `LiveActivityIntent` roda em ambiente de extensão restrito (tempo e memória limitados); chamada de rede síncrona ou processamento pesado nesse contexto é documentado como frágil e pode falhar silenciosamente | Botão grava a intenção localmente (ex.: outbox) e o app, quando reaberto ou em foreground, processa a ação pesada — mesmo padrão que o outbox offline já usa para séries |

## Feature Dependencies

```
[activeSessionStore existente] (motor de sessão, draft de sets/exercícios)
    └──requires (já existe)──> nenhuma mudança de schema necessária para expor estado

[Build nativo por sideload (expo prebuild + assinatura Apple ID)]
    └──requires──> [Ponte nativa RN ↔ ActivityKit] (módulo Swift + App Group)
                       └──requires──> [Live Activity: card Lock Screen + Dynamic Island compact/minimal/expanded]
                                          └──requires──> [Botões via App Intents: concluir série, pular descanso]
                                          └──requires──> [Registro sem teclado: stepper +/- com prefill de histórico]
                                                             └──requires──> [App Group compartilhado (extensão ↔ app) para estado entre toques]

[Notificação local agendada de fim de descanso] ──enhances──> [Timer visual da Live Activity]
    (funciona mesmo se a Live Activity não atualizar a tempo)

[Modo mãos-livres (AVAudioSession + AVSpeechSynthesizer)] ──enhances──> [Live Activity]
    (não é pré-requisito um do outro; mãos-livres pode ser adicionado depois da Live Activity básica funcionar)

[Registro sem teclado] ──conflicts (parcialmente)──> [Widget de tela de início (WidgetKit)]
    (fora de escopo deste milestone por decisão do dono — não desenvolver em paralelo)
```

### Dependency Notes

- **Live Activity requer a ponte nativa, que requer o build por sideload:** não há caminho para testar Live Activity real no Expo Go ou no PWA — precisa do binário assinado rodando no aparelho físico. Isso ordena a fase de "build nativo" **antes** de qualquer fase de Live Activity no roadmap.
- **Botões via App Intents requerem App Group compartilhado:** a extensão de widget (onde a Live Activity roda) e o app principal precisam compartilhar um container de dados (App Group) para que o toque no botão (rodando no processo da extensão) grave um resultado que o app principal leia. Isso é infraestrutura nova — não existe hoje no projeto — e deve ser tratada como pré-requisito explícito, não detalhe de implementação.
- **Registro sem teclado depende do App Group, não só da UI:** cada toque em +/- é uma invocação isolada do `perform()` da extensão; sem estado compartilhado persistente, o valor acumulado (ex.: 3 toques de +2,5kg) se perde entre toques. Isso eleva a complexidade real do stepper de LOW/MEDIUM (parece só UI) para HIGH (é sincronização de estado entre dois processos).
- **Notificação local de fim de descanso não depende de nada novo:** `UNUserNotificationCenter` já é usado no PWA para push web (v1.2); a versão nativa é infraestrutura conhecida, só troca de API. Pode ser entregue em paralelo ou até antes da Live Activity, como rede de segurança.
- **Modo mãos-livres enhances, não requires:** pode ser cortado do MVP sem quebrar o North Star ("ver, comandar e registrar pela tela bloqueada" já é cumprido por Live Activity + notificação, sem áudio falado). Tratar como fase separada e opcional.

## MVP Definition

### Launch With (v1.3 mínimo — cumpre o North Star)

- [ ] Build nativo assinado (Apple ID pessoal, sideload) rodando no iPhone do dono — sem isso nada mais existe
- [ ] Ponte nativa RN ↔ ActivityKit com App Group compartilhado — infraestrutura obrigatória de tudo abaixo
- [ ] Live Activity com Lock Screen + Dynamic Island (compact/minimal/expanded) mostrando exercício atual, série X/Y, timer de descanso — é o "ver" do North Star
- [ ] Botões "concluir série" e "pular descanso" via App Intents, sem abrir o app — é o "comandar" do North Star
- [ ] Stepper +/- de reps/carga com prefill do histórico e confirmação em 1 toque, funcionando tanto na tela do app quanto na Live Activity (componente compartilhado) — é o "registrar" do North Star
- [ ] Notificação local agendada de fim de descanso (som/vibração mesmo com app suspenso) — evita que o usuário perca o momento por o processo ter sido suspenso

### Add After Validation (v1.3.x)

- [ ] Modo mãos-livres com cues falados (`AVSpeechSynthesizer` + sessão de áudio) — adicionar depois que o registro básico pela tela bloqueada estiver provado em uso real, porque depende de validação empírica de comportamento em background (relatos de inconsistência com tela bloqueada)
- [ ] "Predictive action" (mostrar já a próxima série/exercício antes do descanso acabar) — refinamento de UX, não bloqueia o core

### Future Consideration (v2+)

- [ ] Widget de tela de início (WidgetKit) — explicitamente fora de escopo por decisão do dono (PROJECT.md, contexto de contorno)
- [ ] Push nativo/APNs real (exigiria conta Apple Developer paga) — porta reaberta só se o dono decidir pagar US$ 99/ano
- [ ] Reassinatura automática (hoje é rotina manual semanal documentada) — automação só justificável se o app ganhar mais usuários além do dono

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Live Activity Lock Screen + Dynamic Island (estado + timer) | HIGH | MEDIUM | P1 |
| Botões concluir série / pular descanso (App Intents) | HIGH | MEDIUM-HIGH | P1 |
| Stepper sem teclado com prefill de histórico (compartilhado app + Live Activity) | HIGH | HIGH | P1 |
| Notificação local de fim de descanso | MEDIUM | LOW-MEDIUM | P1 |
| Ponte nativa + App Group (infraestrutura) | HIGH (bloqueia tudo) | MEDIUM-HIGH | P1 |
| Build nativo sideload + rotina de reassinatura | HIGH (bloqueia tudo) | MEDIUM | P1 |
| Modo mãos-livres com cues falados | MEDIUM | HIGH | P2 |
| Predictive action (próxima série antecipada) | LOW-MEDIUM | LOW | P3 |
| Widget de tela de início | fora de escopo | — | Não fazer neste milestone |

**Priority key:**
- P1: Necessário para o North Star do milestone (sessão inteira operável de tela bloqueada)
- P2: Deve entrar se o P1 estiver estável, mas não bloqueia o "pronto"
- P3: Bônus se sobrar tempo

## Competitor Feature Analysis

| Feature | Hevy | Strong | SmartGym | Nosso plano |
|---------|------|--------|----------|--------------|
| Card de exercício/série no Lock Screen | Sim | Sim (Live Activity + Dynamic Island) | Sim, com "predictive action" | Sim — replica o padrão de mercado |
| Timer de descanso na Live Activity | Sim, com ajuste em incrementos de 15s e skip | Sim, foco em timers configuráveis | Sim, mostra tempo de descanso entre séries | Sim — botão de pular/ajustar via App Intents |
| Registro completo de reps/carga pela Live Activity (sem abrir o app) | Não encontrado — Live Activity limitada a status/timer | Não encontrado — mesma limitação | Não encontrado — "predictive action" é navegação, não input de dado | **Diferencial**: stepper +/- de reps/carga direto na Live Activity |
| Cues de voz durante o treino via Live Activity/background audio | Não encontrado nesta pesquisa | Não encontrado nesta pesquisa | Não encontrado nesta pesquisa | **Diferencial**: viável só por ser sideload sem review de loja |
| Distribuição | App Store (conta paga, revisão) | App Store (conta paga, revisão) | App Store (conta paga, revisão) | Sideload gratuito, Apple ID pessoal, reassinatura semanal — troca alcance por custo zero |

## Sources

- [Explore Live Activities and the Dynamic Island — Apple Developer](https://developer.apple.com/news/?id=bkm73839) — MEDIUM (oficial Apple, cross-checado)
- [Interactivity with Live Activities and App Intents — Ben Frearson](https://bfrearson.github.io/blog/ios-live-activties/) — MEDIUM (técnico independente, convergente com fóruns Apple)
- [Can LiveActivityIntent open the app when tapping a button? — Apple Developer Forums](https://developer.apple.com/forums/thread/812949) — MEDIUM (fórum oficial Apple, confirma que Live Activity não abre o app)
- [Interactive Live Activity Bug in iOS 18 — perform not called — Apple Developer Forums](https://developer.apple.com/forums/thread/760342) — MEDIUM (sinaliza fragilidade real de `perform()`, usado no Pitfalls)
- [Update Live Activities with push notifications — WWDC23 — Apple Developer](https://developer.apple.com/videos/play/wwdc2023/10185/) — HIGH-tendendo (sessão oficial WWDC sobre budget de push)
- [How to Use Hevy's Live Activity on iOS and Android — Hevy Help Center](https://help.hevyapp.com/hc/en-us/articles/35649846517399-How-to-Use-Hevy-s-Live-Activity-on-iOS-and-Android) — MEDIUM (documentação oficial do produto concorrente)
- [How Live Activity Improves Workout Logging — Hevy App](https://www.hevyapp.com/features/live-activity/) — MEDIUM (página de feature do concorrente)
- [SmartGym Features — smartgymapp.com](https://smartgymapp.com/features.html) — MEDIUM (página oficial do concorrente, "predictive action")
- [Integrating Live Activity and Dynamic Island in iOS: A Complete Guide — Canopas](https://canopas.com/integrating-live-activity-and-dynamic-island-in-i-os-a-complete-guide) — MEDIUM (guia técnico, limites de imagem/payload)
- [Live Activities iOS 26: Complete Guide 2026 — Swift Crafted](https://swiftcrafted.dev/article/live-activities-dynamic-island-ios-26-swiftui-activitykit-guide) — MEDIUM (cobre especificamente iOS 26, relevante ao aparelho do dono)
- [AVSpeechSynthesizer in background — Apple Developer Forums](https://developer.apple.com/forums/thread/27097) — LOW-MEDIUM (relato de comportamento inconsistente com tela bloqueada — usado como alerta, não como garantia)
- [iOS - Playing audio in the background — Jonathan Sagorin](https://www.sagorin.org/ios-playing-audio-in-background-audio/) — MEDIUM (técnica de áudio silencioso contínuo para manter processo vivo)
- [Audio Guidelines By App Type — Apple Developer (arquivo)](https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioGuidelinesByAppType/AudioGuidelinesByAppType.html) — MEDIUM (oficial Apple, categoria `.playback`)
- Repositório do projeto: `src/store/activeSessionStore.ts` (1833 linhas) — fonte primária de código, confirma existência do motor de sessão a ser estendido

---
*Feature research for: treino nativo de tela bloqueada (ForcaApp v1.3)*
*Researched: 2026-08-15*
