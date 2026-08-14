# Feature Research

**Domain:** PWA instalável de primeira classe no iOS (Safari / Home Screen web app)
**Researched:** 2026-08-14
**Confidence:** MEDIUM (cross-checado entre WebKit blog oficial, MDN, web.dev/Chrome DevRel, Apple Developer Forums e múltiplos guias de mercado 2025-2026; nenhuma fonte única HIGH — Apple não documenta PWA como produto de primeira classe, então parte do comportamento vem de observação empírica de terceiros)

## Contexto específico do projeto

O ForcaApp é Expo/React Native Web rodando como PWA na Vercel, com outbox offline-first já implementado (v1.0/v1.1) e ~20 usuários leigos (família/alunos) que abrem o link e precisam instalar sem fricção. Isto muda a leitura padrão de "features PWA":

- **Não existe App Store nem TestFlight neste ciclo** (decisão do dono, ver PROJECT.md) — Safari "Adicionar à Tela de Início" é o ÚNICO caminho de distribuição.
- **Usuários leigos, não devs** — qualquer feature que dependa do usuário entender "cache", "service worker" ou "permissão de notificação" precisa de UX traduzida, não de documentação.
- **Offline-first já existe no nível de dados** (outbox de séries) — o que falta é offline no nível de *casca* (app abre e mostra tela sem rede) e a mecânica de update do service worker não conflitar com esse outbox.

## Feature Landscape

### Table Stakes (Users Expect These)

Features que, faltando, fazem o app "parecer quebrado" para os ~20 usuários — não são diferencial, são o preço de entrada de "app instalável".

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Manifest completo (name, short_name, icons 192/512, theme_color, background_color, display: standalone) | Sem isso o ícone na tela de início vem com screenshot da página em vez de ícone próprio, e abre dentro do Safari com barra de endereço — "não parece um app" | LOW | `display: standalone` sozinho não basta no iOS — depende também das meta tags Apple abaixo |
| `apple-touch-icon` (meta tag, não só manifest) | iOS ainda não lê `icons` do manifest para o ícone da Tela de Início na maioria dos casos reais — precisa do link tag clássico `rel="apple-touch-icon"` | LOW | Gerar 1 PNG 180x180 sem transparência (iOS aplica máscara/cantos arredondados sozinho; PNG com alpha vira fundo preto) |
| `apple-mobile-web-app-capable` + `apple-mobile-web-app-status-bar-style` (meta tags) | Sem `apple-mobile-web-app-capable=yes`, o app abre com a barra do Safari mesmo com `display: standalone` no manifest — Apple não confia só no manifest | LOW | Tag depreciada pela Apple mas ainda funcionalmente obrigatória em 2026; usar junto com `mobile-web-app-capable` (padrão novo) para cobrir os dois |
| Splash screen iOS via `apple-touch-startup-image` (múltiplas resoluções) | Apple não gera splash automaticamente a partir do manifest como o Android faz — sem isso, a tela abre em branco/flash por 1-2s antes do conteúdo, parecendo bug | MEDIUM | Precisa de 1 imagem por combinação de resolução de tela × orientação (dezenas de `<link>` com media queries); usar gerador (ex. `pwa-asset-generator`) em vez de fazer à mão |
| Página de instalação guiada específica para iOS (passo a passo com Share sheet) | Não existe `beforeinstallprompt` no iOS — se o usuário não for instruído explicitamente, ele nunca descobre o caminho "Compartilhar → Adicionar à Tela de Início" | LOW-MEDIUM | Ver seção dedicada abaixo — é a feature de maior alavancagem para os ~20 usuários leigos |
| Detecção de "já instalado" (`navigator.standalone === true`) | Sem isso, usuário que já instalou continua vendo a página de instalação toda vez que abre pelo link, gerando confusão ("já fiz isso, por quê de novo?") | LOW | iOS usa `window.navigator.standalone`, NÃO `matchMedia('display-mode: standalone')` (isso é Android/desktop) — as duas checagens precisam coexistir no código |
| Offline de casca (app shell) via service worker | Usuários da academia estão em rede ruim/instável — se o app não abrir a interface sem rede, o outbox offline-first do v1.0 fica inacessível na hora que mais importa | MEDIUM | Cache-first para shell (JS/CSS/HTML), network-first ou stale-while-revalidate para dados; não confundir com o outbox existente (que é sync de escrita, não cache de leitura) |
| Fluxo de atualização sem confusão (novo SW → aviso, não reload silencioso forçado) | Sem aviso, usuário fica preso em versão antiga sem saber, OU sofre reload no meio de uma série sendo registrada — ambos ruins para usuário leigo | MEDIUM | Ver seção dedicada abaixo — acopla diretamente ao outbox: nunca fazer `skipWaiting()` automático durante uma sessão de treino em andamento |
| Correção do `Alert.alert` no-op (dívida conhecida) | `Alert.alert` do React Native é no-op no react-native-web — botão "Concluir treino" e qualquer confirmação parecem mortos no PWA | LOW | Já mapeado como dívida no PROJECT.md; troca por modal/toast web nativo (ex. componente próprio ou lib como `react-native-web`-compatible dialog) |
| HTTPS (já cumprido via Vercel) | Pré-requisito absoluto para manifest, service worker e push funcionarem no iOS — sem HTTPS nenhuma das features acima existe | LOW | Já satisfeito — Vercel serve HTTPS por padrão |

### Differentiators (Competitive Advantage)

Não são esperadas por padrão em qualquer PWA, mas para o caso de uso (app de treino usado na academia, muitas vezes sem sinal bom) fazem diferença real de experiência.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Push notification real no iPhone (16.4+) | Lembrete de treino do dia / aviso de plano gerado sem depender do usuário abrir o app sozinho — comportamento de app nativo, incomum em PWAs brasileiras de nicho fitness | MEDIUM-HIGH | Exige: (1) PWA já instalado, (2) gesto explícito do usuário pedindo permissão (não pode disparar sozinho no load), (3) infra de push no backend (VAPID keys + endpoint de subscription + envio via Web Push protocol) — é a feature mais cara desta milestone |
| Badge no ícone do app (contagem de treino pendente do dia) | Sinal visual passivo — "tem treino hoje" sem abrir o app, como badge de app nativo | LOW-MEDIUM | Depende 100% de push+permissão de notificação já concedida (Badging API no iOS é gated por permissão de notificação, não é independente); sem push funcionando, badge não compensa a implementação sozinho |
| Detecção de navegador (Safari vs Chrome iOS vs outro) na página de instalação | Chrome/Edge/Firefox no iOS rodam sobre WebKit e também instalam via Share sheet — mas o menu de compartilhamento e a localização do botão variam visualmente por app, então instrução genérica confunde quem usa Chrome iOS (parcela real da audiência) | LOW | Basta branch simples por user agent para trocar o texto/screenshot da instrução — baixo custo, alto ganho de clareza para os ~20 usuários que podem não estar no Safari |
| Persistência de storage protegida (Persistent Storage API) | Evita que o iOS apague o outbox local / cache após ~7 dias de app não aberto — relevante porque alunos podem passar 1-2 semanas sem malhar (férias, lesão) | MEDIUM | Requer permissão de notificação concedida para funcionar de forma confiável no Safari — mais um motivo para push ser priorizado antes desta feature, não depois |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Prompt automático de instalação estilo Android (`beforeinstallprompt`) | "Todo PWA tutorial mostra um botão 'Instalar'" | Esse evento não existe no Safari/iOS — qualquer lib ou tutorial que promete isso está descrevendo comportamento Android/Chrome desktop; tentar implementar gera código morto no iOS | Página/banner de instrução manual com Share sheet, condicionada por user agent |
| Background Sync API nativa do browser | "App deveria sincronizar sozinho mesmo fechado" | Não suportado no iOS Safari — qualquer código escrito contra essa API simplesmente não roda lá, dando falsa sensação de robustez | O outbox já existente (fila local + flush no reabrir/foreground) já é o padrão correto para iOS; não adicionar dependência de Background Sync |
| Push notification disparado automaticamente no primeiro acesso | "Quanto antes pedir permissão, mais gente aceita" | iOS exige gesto explícito do usuário — disparo automático no load simplesmente falha silenciosamente (prompt não aparece) e, mesmo funcionando em outros browsers, pedir permissão sem contexto reduz taxa de aceite em qualquer plataforma | Botão explícito ("Ativar lembretes de treino") em tela própria, com copy que explica o valor antes do gesto |
| `skipWaiting()` automático e reload forçado a cada deploy | "Garante que todo mundo está sempre na versão mais nova" | Pode recarregar a página no meio de uma série sendo registrada, perdendo o estado de UI (mesmo com outbox durável salvando o dado) — para usuário leigo isso parece "o app travou/reiniciou sozinho" | Detectar SW em espera, mostrar aviso não-bloqueante, só ativar após ação do usuário ou ao final de sessão de treino |
| Splash screen "genérica" (1 imagem esticada para todas resoluções) | Economiza tempo de implementação | iOS não escala a imagem — aparece cortada ou com bordas erradas em iPhones de tamanhos diferentes (mini, normal, Pro Max), parecendo bug de layout | Usar gerador de assets (cobre a matriz de resoluções) ou aceitar splash mínima (cor de fundo sólida + ícone central) em vez de imagem forçada malfeita |
| Reimplementar autenticação/conta de usuário Apple ou sistema de contas paralelas para "parecer nativo" | Confundir "app de primeira classe" com "precisa de conta Apple" | Fora do escopo desta milestone — a restrição de contorno do dono é justamente NÃO depender de Apple Developer/conta paga; qualquer feature que precise de entitlements Apple (App Store Connect, TestFlight) está fora | Manter tudo no modelo web: Supabase auth existente, sem dependência de identidade Apple |

## Feature Dependencies

```
[Manifest completo + apple-touch-icon + meta tags standalone]
    └──requires──> nada (é a base)

[Splash screen iOS]
    └──enhances──> [Manifest completo] (não bloqueia instalação, só polimento visual)

[Página de instalação guiada]
    └──requires──> [Manifest completo] (senão instrui a instalar algo que ainda não vira app de verdade)
    └──requires──> [Detecção de "já instalado"] (senão mostra instrução pra quem já instalou)

[Offline de casca via service worker]
    └──requires──> [Manifest completo] (service worker sem manifest válido não gera app instalável, só cache de página comum)
    └──enhances──> [Outbox offline-first existente] (casca offline + outbox de dados = offline real ponta a ponta)

[Fluxo de atualização sem confusão]
    └──requires──> [Offline de casca via service worker] (não existe update de algo que não existe)
    └──conflicts-se-mal-feito──> [Outbox offline-first existente] (reload forçado no meio de sessão de treino corrompe UX, mesmo que dado sobreviva)

[Push notification iOS]
    └──requires──> [Manifest completo] + [app instalado como standalone] (Push API só existe para Home Screen web apps)
    └──requires──> gesto explícito do usuário (não é dependência técnica, é dependência de fluxo de produto)
    └──requires──> infraestrutura de backend (VAPID + endpoint de subscription + envio)

[Badge no ícone]
    └──requires──> [Push notification iOS] (badge é gated por permissão de notificação concedida)

[Persistência de storage protegida]
    └──requires──> permissão de notificação concedida (mesma dependência do badge)
    └──enhances──> [Offline de casca] + [Outbox offline-first] (protege contra eviction do iOS após inatividade)

[Correção do Alert.alert no-op]
    └──requires──> nada (é ortogonal, mas é bloqueador de UX percebida — "botão morto")
```

### Dependency Notes

- **Página de instalação guiada requer manifest completo:** instruir "adicione à tela de início" antes do manifest/ícones estarem corretos produz um app instalado com ícone errado e sem modo standalone — pior que não ter a página.
- **Offline de casca requer manifest completo:** um service worker sozinho, sem manifest válido, cacheia a página mas não faz o iOS tratar isso como "app" — os dois têm que subir juntos.
- **Fluxo de atualização conflita (se malfeito) com o outbox existente:** esta é a dependência de maior risco do projeto. O outbox já resolve "rede ruim durante o treino"; um service worker que força reload sem aviso durante uma sessão ativa reintroduz exatamente o tipo de interrupção que o outbox foi construído para eliminar. Tratar como requisito de design, não detalhe de implementação.
- **Push → Badge → Persistência de storage formam uma cadeia de permissão única:** todas dependem do mesmo gesto de "usuário aceita notificação". Priorizar o pedido de permissão bem-feito (contexto claro, botão explícito, momento certo) desbloqueia as três features em cascata; um pedido malfeito (ou automático, que falha) bloqueia as três.
- **Detecção de "já instalado" e página de instalação são acopladas de fluxo, não de dado:** a página deve se auto-ocultar (ou redirecionar para o app) assim que detectar `navigator.standalone === true`, senão os ~20 usuários leigos vão re-clicar em "instalar" a cada visita.

## MVP Definition

### Launch With (v1.2 — esta milestone)

- [ ] Manifest completo + `apple-touch-icon` + meta tags standalone — sem isso nada mais nesta lista funciona
- [ ] Splash screen iOS (pode ser minimalista: fundo sólido + ícone, não precisa de imagem elaborada em v1)
- [ ] Página de instalação guiada com detecção de iOS/Safari vs Chrome iOS e detecção de "já instalado"
- [ ] Offline de casca via service worker, casando com o outbox existente (app abre sem rede)
- [ ] Fluxo de atualização de service worker com aviso não-bloqueante, sem interromper sessão de treino em andamento
- [ ] Push notification (permissão via gesto explícito + infra de backend) — está no escopo declarado da milestone (PROJECT.md), mas é a peça mais cara; se precisar cortar algo por tempo, é a primeira candidata a virar v1.2.1
- [ ] Correção do `Alert.alert` no-op — dívida já mapeada, baixo custo, alto impacto percebido ("botão Concluir treino parece morto")

### Add After Validation (v1.x seguinte)

- [ ] Badge no ícone (contagem de treino pendente) — só depois que push+permissão estiver validado com uso real dos ~20 usuários
- [ ] Persistent Storage API — só relevante se algum usuário relatar perda de dado local após período de inatividade

### Future Consideration (v2+, condicional a decisão do dono)

- [ ] Distribuição via Apple Developer pago (Ad Hoc/TestFlight) — porta já registrada como reaberta no PROJECT.md caso o dono decida pagar os US$ 99/ano; não iniciar sem decisão explícita
- [ ] Splash screens por resolução exata de cada modelo de iPhone (matriz completa via gerador) — refinamento visual, não bloqueia funcionalidade

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Manifest + ícones + meta tags standalone | HIGH | LOW | P1 |
| Página de instalação guiada (iOS/Safari + detecção de instalado) | HIGH | LOW-MEDIUM | P1 |
| Offline de casca (service worker) | HIGH | MEDIUM | P1 |
| Fluxo de atualização sem confusão | MEDIUM-HIGH | MEDIUM | P1 |
| Correção Alert.alert no-op | MEDIUM | LOW | P1 |
| Push notification iOS | HIGH | HIGH | P1 (declarado no escopo, mas maior risco de estouro de tempo) |
| Splash screen refinada (multi-resolução) | LOW-MEDIUM | MEDIUM | P2 |
| Badge no ícone | LOW-MEDIUM | LOW (dado push pronto) | P2 |
| Persistent Storage API | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Necessário para "app de primeira classe" como definido no PROJECT.md
- P2: Melhora percebida, mas o produto funciona plenamente sem
- P3: Proteção de borda, só justificável com evidência de problema real

## Competitor / Reference Pattern Analysis

Não há concorrente direto (app familiar/de alunos), então a referência é o padrão de mercado de PWAs iOS bem avaliadas (ex.: guias de Starbucks/Twitter Lite/Pinterest citados como cases clássicos de PWA, e a documentação viva de MDN/web.dev/WebKit).

| Aspecto | Padrão de mercado (PWAs maduras) | Nosso plano |
|---------|-----------------------------------|-------------|
| Instrução de instalação iOS | Banner/página dedicada com seta animada apontando pro botão Compartilhar, exibida só quando `navigator.standalone !== true` | Mesma abordagem — página própria, sem depender de lib de terceiros pesada |
| Update de service worker | Toast discreto "Nova versão disponível", sem reload forçado | Igual, com cuidado extra de não disparar durante sessão de treino ativa (especificidade do ForçaApp) |
| Push permission | Botão contextual explicando o valor antes do gesto, nunca automático no load | Igual — "Ativar lembrete de treino" com copy explicando o benefício |
| Ícones/splash | Gerado via ferramenta (pwa-asset-generator ou similar), não desenhado manualmente por resolução | Recomendado adotar ferramenta para não gastar tempo de dev em tarefa mecânica |

## Sources

- [Badging for Home Screen Web Apps — WebKit (oficial Apple)](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)
- [Display a badge on the app icon — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon)
- [Making PWAs installable — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Create a standalone app — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app)
- [Detection — web.dev](https://web.dev/learn/pwa/detection)
- [Installation — web.dev](https://web.dev/learn/pwa/installation)
- [Update — web.dev](https://web.dev/learn/pwa/update/)
- [Handling service worker updates with immediacy — Workbox / Chrome for Developers](https://developer.chrome.com/docs/workbox/handling-service-worker-updates/)
- [How to add push notifications to your mobile website on iOS 16.4 — Median](https://median.co/blog/how-to-add-push-notifications-to-your-mobile-website-on-ios-16-4)
- [iOS 16.4 and Web Push Notifications — GoodBarber](https://www.goodbarber.com/blog/ios-16-4-and-web-push-notifications-a1240/)
- [PWA iOS Limitations and Safari Support [2026] — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [PWA on iOS: Install Guide & Limits for Advertisers 2026 — DeepClick](https://deepclick.com/resources/blog/progressive-web-apps-on-ios/)
- [Do Progressive Web Apps Work on iOS? — Mobiloud (2026)](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [iOS PWA Compatibility — firt.dev](https://firt.dev/notes/pwa-ios/)
- [Do PWA Background Sync will be supported by iOS — Apple Developer Forums](https://developer.apple.com/forums/thread/694805)
- [Background sync — Apple Developer Forums](https://developer.apple.com/forums/thread/767029)
- [Request: Implement beforeinstallprompt event — Apple Developer Forums](https://developer.apple.com/forums/thread/807603)
- [An example of full iOS PWA startup image support — GitHub Gist (Evan Bacon)](https://gist.github.com/EvanBacon/7fd4dc3be3d00096579bb0b134c56ec7)
- [PWA Icons & iOS Splash Screens Generator — Progressier](https://progressier.com/pwa-icons-and-ios-splash-screen-generator)
- [Handling Service Worker updates — Progressier](https://progressier.com/handling-service-worker-updates)

**Nota de confiança:** Apple não publica um guia canônico único de "PWA iOS" — a WebKit blog oficial cobre badging, mas comportamento de eviction, splash screen e algumas nuances de push foram triangulados entre MDN, web.dev, Chrome DevRel e múltiplos guias de mercado independentes (todos convergindo nos mesmos fatos-chave: 16.4+ para push, gesto obrigatório, sem background sync, sem prompt automático). Tratado como MEDIUM confidence — comportamento verificado de forma independente e cruzada, mas sem fonte primária Apple única e definitiva para cada detalhe.

---
*Feature research for: PWA instalável de primeira classe no iOS*
*Researched: 2026-08-14*
