# Pitfalls Research

**Domain:** PWA de primeira classe no iOS — service worker, push iOS 16.4+, instalação guiada — adicionado a um app Expo web + Vercel + Supabase já em produção
**Researched:** 2026-08-14
**Confidence:** MEDIUM (achados corroborados por múltiplas fontes técnicas; nenhum teste em iPhone real foi possível nesta máquina — ver seção de UAT)

## Critical Pitfalls

### Pitfall 1: Service worker cache-first serve HTML/manifest velho para sempre

**What goes wrong:**
O service worker precacheia `index.html`/bundle com estratégia cache-first e nunca revalida. Todo deploy novo na Vercel fica invisível para quem já instalou o PWA — o app abre sempre na versão do dia da instalação. Pior: como o Safari em standalone não tem botão de "recarregar forçado" nem DevTools acessível para o usuário, o dono não tem como orientar um aluno a "limpar o cache".

**Why it happens:**
Cache-first é a estratégia padrão nos tutoriais de PWA para "funcionar offline rápido", mas HTML/manifest raiz precisam ser network-first (ou stale-while-revalidate com nome de cache versionado), nunca cache-first puro. Além disso, por padrão o browser só ativa o novo SW (`waiting` → `active`) depois que todas as abas/instâncias do worker antigo fecham — em standalone, o "fechar aba" é o usuário matar o app pelo app switcher, o que quase nunca acontece.

**How to avoid:**
- HTML raiz e `manifest.json`: `network-first` (ou `no-cache` na entrega, ver Pitfall 2) — nunca precache-first.
- Bundle JS/CSS com hash de conteúdo no nome do arquivo: pode ser cache-first com segurança porque o nome muda a cada build.
- Nome do cache versionado por deploy (timestamp ou commit SHA do Vercel — `VERCEL_GIT_COMMIT_SHA` já vem como env var de build); no `activate`, apagar caches com nome antigo.
- Adotar `skipWaiting()` + `clients.claim()` **deliberadamente**, não por padrão — e emparelhar com um banner in-app ("nova versão disponível, toque para atualizar") que dispara `location.reload()` após a troca, em vez de skipWaiting silencioso no meio de uma sessão de treino.
- Considerar Workbox (`generateSW`/`injectManifest`) em vez de SW escrito à mão — evita reinventar as estratégias de cache por tipo de asset. Expo recomenda Workbox explicitamente para `expo export -p web`.

**Warning signs:**
- Usuário reporta "o app não mudou" depois de um deploy que você confirmou no Vercel.
- Testar: instalar o PWA, fazer deploy, reabrir o app sem matar processo — se a mudança não aparece em ~1 tentativa de reload, a estratégia está errada.

**Phase to address:**
Fase de service worker / offline (a mesma fase que implementa o SW deve já nascer com estratégia de update correta — não é hardening posterior).

---

### Pitfall 2: Headers de cache da Vercel deixando `sw.js` cacheado no edge/CDN

**What goes wrong:**
Mesmo com a lógica de versionamento certa dentro do service worker, se a Vercel (ou o browser) cachear o **arquivo `sw.js` em si** por muito tempo, o browser nunca busca a nova versão do worker — o update strategy do Pitfall 1 nunca dispara porque o novo código do SW nunca chega ao cliente.

**Why it happens:**
Vercel aplica cache-control padrão a assets estáticos servidos da pasta de output; sem override explícito, `sw.js` pode herdar headers agressivos de cache do CDN. `Cache-Control` retornado por uma Vercel Function tem prioridade sobre `next.config`/`vercel.json`; e `CDN-Cache-Control`/`Vercel-CDN-Cache-Control` têm prioridade sobre `Cache-Control` simples — fácil de configurar em duas camadas conflitantes sem perceber.

**How to avoid:**
Em `vercel.json`, forçar explicitamente:
```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    }
  ]
}
```
Fazer o mesmo para `manifest.json`/`manifest.webmanifest`. Verificar com `curl -I` em produção depois do deploy — não confiar em suposição.

**Warning signs:**
`curl -I https://forca-app-six.vercel.app/sw.js` mostrando `Cache-Control: public, max-age=31536000, immutable` (ou qualquer max-age alto) é o sinal direto.

**Phase to address:**
Fase de service worker — configurar `vercel.json` junto com a criação do SW, antes do primeiro deploy que o inclui.

---

### Pitfall 3: Pedir permissão de push fora de gesto do usuário — falha silenciosa no iOS

**What goes wrong:**
`Notification.requestPermission()` chamado automaticamente no load da página, num `useEffect`, ou depois de um `setTimeout` (padrão que funciona em Android/desktop) simplesmente não mostra o prompt no Safari iOS — sem erro no console, sem exceção. O usuário nunca vê o pedido de permissão e a feature de push parece "não fazer nada".

**Why it happens:**
Safari exige que o pedido de permissão seja disparado dentro do call stack síncrono de um gesto do usuário (clique/tap direto). Qualquer `await` antes da chamada, ou instanciar o client de push dentro do handler em vez de fora, já quebra a cadeia de "gesto do usuário" aos olhos do WebKit.

**How to avoid:**
- Botão explícito "Ativar notificações" — a chamada a `Notification.requestPermission()`/`pushManager.subscribe()` deve ser a primeira coisa síncrona no `onClick`, sem `await` antes dela.
- Não chamar automaticamente no primeiro load nem atrás de modais/temporizadores.
- Instanciar qualquer client/SDK de push fora do handler de clique, não dentro.

**Warning signs:**
Prompt de permissão nunca aparece no iPhone, mas aparece normalmente no Chrome desktop durante o mesmo teste manual — sintoma clássico de perda do gesto do usuário.

**Phase to address:**
Fase de push notification — no design do componente/tela que pede a permissão, não como fix posterior.

---

### Pitfall 4: Subscription de push iOS expira ou é revogada sem aviso — sem `expirationTime`

**What goes wrong:**
O objeto de subscription do iOS **não inclui `expirationTime`** como outros browsers fornecem, então o backend não tem como antecipar quando uma inscrição vai parar de funcionar. A Apple pode revogar a subscription silenciosamente fora de qualquer ação do usuário; `pushManager.getSubscription()` passa a retornar `null` e o próximo envio falha.

**Why it happens:**
Implementação do Web Push da Apple é mais restritiva que Chrome/Firefox nesse ponto; é comportamento documentado e reclamado no fórum de desenvolvedores da própria Apple, não um bug do app.

**How to avoid:**
- Backend (Flask + `pywebpush`) deve tratar `WebPushException` com status 410/404 apagando a subscription do banco imediatamente — nunca re-tentar indefinidamente.
- Reconfirmar `getSubscription()` no client em pontos naturais de retorno ao app (abrir o app, voltar do background) e re-subscrever silenciosamente se `null` **e** a permissão ainda for `granted` (isso não conta como novo pedido de permissão, então não precisa de gesto).
- **Nunca** chamar `subscription.unsubscribe()` no logout — isso invalida a possibilidade de re-subscrever sem um novo gesto do usuário. Em vez disso, desativar a subscription apenas no lado do servidor (marcar como inativa/associada a nenhum usuário), mantendo a subscription do browser viva.
- VAPID claims precisam de `sub` no formato `mailto:` correto — subject malformado retorna 403 (fácil de confundir com problema de assinatura/chave).

**Warning signs:**
Push para de chegar para um subconjunto de usuários sem padrão aparente; logs do backend mostrando 410/404 acumulando sem rotina de limpeza.

**Phase to address:**
Fase de push notification (infra de envio no backend) — o tratamento de 410/404 e a política de não-unsubscribe no logout são parte do design inicial, não hardening.

---

### Pitfall 5: `Alert.alert` (e outras APIs RN) no-op silencioso no web — não é só o botão "Concluir treino"

**What goes wrong:**
`Alert.alert` já é dívida conhecida do projeto (botão "Concluir treino" parece morto no alvo web). O risco desta fase é tratar isso como um bug pontual em vez de um padrão de classe: qualquer chamada nova a `Alert.alert`, `Alert.prompt`, ou APIs equivalentes só-nativas introduzida durante o trabalho de PWA (ex.: confirmação antes de ativar push, aviso de instalação) vai reproduzir o mesmo no-op silencioso, sem erro, sem crash — parece "não fizemos nada" para quem testa no iPhone.

**Why it happens:**
`react-native-web` não implementa `Alert` — a chamada simplesmente não faz nada no runtime web, e como o restante do app roda igual (React Native puro em iOS/Android quando houver build nativo), o dev que testa só no simulador Expo Go / device nativo nunca vê a lacuna.

**How to avoid:**
- Um componente de modal cross-platform único (`ConfirmDialog`/`AlertDialog`) que troca `Alert.alert` em **todos** os call sites, não um wrapper condicional "se web, faz X" espalhado. Bibliotecas como `react-native-modal` servem de base, mas dado que o app já tem componentes próprios, preferir um componente local simples e consistente com o design system existente.
- Auditoria de grep por `Alert\.` em todo o repo como parte desta fase — fechar todos os call sites de uma vez, não só o "Concluir treino" que já foi identificado.
- Cobertura básica: teste que dispara o fluxo e assert que o modal (não o Alert nativo) aparece no DOM em ambiente web/jsdom.

**Warning signs:**
Qualquer fluxo que "parece não responder" ao toque no alvo web/PWA, mas funciona normalmente relatado por quem testou só em nativo.

**Phase to address:**
Fase de "fechamento de gaps do runtime web" (explicitamente no escopo do milestone) — deve rodar a auditoria completa de `Alert.*`, não só o item já conhecido.

---

### Pitfall 6: OAuth/redirect do Supabase Auth abrindo fora do app instalado — sessão perdida

**What goes wrong:**
Um PWA instalado em standalone no iOS e o Safari são **contextos de storage/sessão separados**. Se algum fluxo do app (login social, magic link, deep link de reset de senha) redireciona para fora do contexto standalone — abre em Safari — o usuário completa o login lá, mas a sessão fica presa no Safari e não é enxergada pelo app instalado. Em versões antigas do iOS há também relato de o app instalado congelar ao voltar de um link externo depois de ser totalmente encerrado.

**Why it happens:**
"Instalado na Tela de Início" não é um app nativo com deep-linking real — é um atalho para uma página web rodando num contexto WKWebView isolado do Safari. Qualquer navegação que sai do domínio (ex.: `window.open`, `<a target="_blank">`, redirect de provedor OAuth) pode abrir fora desse contexto.

**How to avoid:**
- Verificar hoje quais fluxos de auth o app usa: se é e-mail/senha direto no domínio (sem redirect para provedor externo), o risco é baixo — confirmar isso antes de assumir o pitfall como bloqueante.
- Se houver (ou vier a haver) login social, preferir fluxo que mantém a navegação dentro do próprio domínio/PWA (ex.: OTP por e-mail/magic link que abre e fecha sem trocar de contexto) em vez de um redirect de provedor terceiro.
- Qualquer link para domínio externo (documentação, WhatsApp, etc.) deve usar `target="_blank"` deliberadamente — aceitar que abre no Safari é ok, desde que não seja parte de um fluxo que precisa devolver estado ao app.
- Testar explicitamente: login → matar o app pelo app switcher → reabrir — sessão deve persistir (isso testa Supabase's local storage/session persistence dentro do próprio contexto standalone, que é diferente do problema de redirect cross-context).

**Warning signs:**
Usuário loga no Safari (por engano ou por um link) e diz "logei mas o app continua pedindo login"; ou um link externo clicado dentro do PWA "sai do app" e ele precisa reabrir manualmente pela Tela de Início.

**Phase to address:**
Fase de instalação guiada / fechamento de gaps — mapear todos os pontos de navegação que saem do domínio antes de declarar a fase pronta; é verificação, não necessariamente uma implementação nova (o app já usa Supabase Auth em produção sem esse problema reportado até aqui).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| SW com `skipWaiting()`+`clients.claim()` automático sem aviso ao usuário | Menos código, update "instantâneo" | Troca de versão no meio de uma sessão de treino pode invalidar estado em memória sem aviso | Nunca em produção com usuários reais em sessão ativa — aceitável só em fase de dev/staging |
| Ignorar `expirationTime` ausente e nunca limpar subscriptions mortas | Menos lógica no backend agora | Fila de envios para endpoints mortos cresce, custo de log/erro sobe, taxa de entrega parece cair sem causa aparente | Nunca — o tratamento de 410/404 é barato de implementar já na primeira versão |
| Um só ícone genérico reaproveitado como splash em todas as resoluções | Evita gerar o conjunto completo de imagens | Splash "esticado"/cortado em alguns iPhones — primeira impressão de app malfeito bem na abertura | Aceitável só para MVP interno com poucos usuários (o app JÁ está nesse caso: ~20 usuários família/alunos) — mas vale corrigir cedo porque splash errado é visível e barato de notar/reportar |
| Testar só com Lighthouse e considerar "PWA pronto" | Rápido, automatizável, roda no CI/local | Lighthouse não cobre nenhum comportamento específico de iOS — falsa sensação de prontidão | Nunca como critério único; usar como gate de regressão, não como prova de funcionamento no iPhone |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| Vercel (deploy do PWA) | Deixar `sw.js`/`manifest.json` herdarem cache padrão do CDN | `vercel.json` com headers explícitos `no-cache`/`must-revalidate` para `sw.js` e manifest |
| Supabase Auth + iOS standalone | Assumir que sessão criada no Safari aparece automaticamente no app instalado | Testar login dentro do próprio contexto instalado; evitar fluxos que dependem de redirect cross-context para provedor externo |
| Web Push / Apple Push Service | Tratar subscription como permanente e nunca limpar as revogadas | Backend deve reagir a 410/404 apagando a subscription; nunca chamar `unsubscribe()` no client no logout |
| `pywebpush` (Flask) | VAPID `sub` sem prefixo `mailto:` correto | Formatar claim exatamente como `mailto:endereco@dominio` — subject malformado retorna 403, fácil de confundir com erro de chave |
| Expo web export + service worker | Escrever o SW à mão sem Workbox e reinventar estratégia de cache por tipo de asset | Usar Workbox (`generateSW`/`injectManifest`) sobre `expo export -p web`, com runtime caching network-first separado para chamadas à API do Supabase |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Precache genérico de tudo (incluindo respostas de API do Supabase) | Cache cresce sem limite, dados desatualizados aparecem como se fossem "offline funcionando" | Precache só para o app shell (HTML/JS/CSS/ícones); runtime caching network-first (ou network-only) separado para chamadas ao Supabase | Some usuário relata ver dado velho mesmo com internet — sintoma aparece cedo, não é questão de escala de usuários (20 pessoas já é suficiente para notar) |
| Cache storage sem limite explícito no iOS | App atinge o teto de ~50MB e o iOS começa a evictar dados sem aviso, incluindo o outbox se ele fosse movido para Cache API | Manter o outbox fora do orçamento de Cache Storage do SW (ele já vive em localStorage, que tem política de eviction diferente — ver Pitfall de storage abaixo) | Baixo risco no volume atual (20 usuários, app leve), mas vale monitorar se o SW passar a cachear imagens/mídia pesada |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Chave privada VAPID commitada ou hardcoded no backend Flask | Qualquer terceiro com a chave pode enviar push forjado para os subscribers do app | Variável de ambiente (já é o padrão do projeto pelas regras de segurança globais) — validar presença no boot do backend |
| SW cacheando respostas autenticadas (com token/sessão) da API do Supabase de forma persistente | Dado de um usuário pode vazar para outro em cenário de dispositivo compartilhado (o app é usado por família — cenário real, não hipotético) | Nunca precachear/cachear persistentemente respostas autenticadas por usuário; se cachear para offline, escopar a chave de cache pelo id do usuário/sessão e invalidar no logout |
| Confiar em `postMessage`/mensagens do SW sem validar origem | Abre superfície para injeção se o SW algum dia processar mensagens externas | Validar `event.origin` em qualquer listener de mensagem do SW, mesmo que hoje não haja input externo |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Nenhuma indicação visual de "app atualizando" durante troca de SW | Usuário acha que o app travou durante um deploy | Banner discreto "nova versão disponível" com botão de atualizar explícito, controlado pelo evento de SW `waiting` |
| Pedir permissão de push no primeiro acesso, sem contexto | Usuário nega por reflexo e não há re-pedido fácil depois (iOS não permite re-perguntar automaticamente após negar) | Pedir push só depois de uma ação que justifique (ex.: terminar a primeira sessão de treino), com botão explícito e microcópia do porquê |
| Página de instalação genérica sem passo a passo específico do iOS Safari | Usuário não-técnico (família/alunos) não encontra "Adicionar à Tela de Início" | Instrução com screenshots reais do Safari iOS, passo a passo numerado, testada por alguém que nunca instalou um PWA antes |
| Splash/ícone com dimensão errada visível só na abertura | Primeira impressão de "app quebrado" mesmo que o resto funcione perfeitamente | Gerar o conjunto completo de splash/ícones com ferramenta dedicada (ex.: pacote de geração de assets PWA) e conferir em pelo menos 2 tamanhos de iPhone reais antes do UAT do dono |

## "Looks Done But Isn't" Checklist

- [ ] **Service worker instalado:** Lighthouse passa no audit de PWA — mas isso não prova que o update funciona; verificar manualmente: deploy → reabrir app instalado → nova versão aparece.
- [ ] **Manifest com ícones:** ícones aparecem no Chrome DevTools "Application" tab — mas isso não garante `apple-touch-icon` 180x180 correto nem splash por resolução; conferir os `<link>` tags específicos de iOS no HTML servido, não só o `manifest.json`.
- [ ] **Push notification "funciona":** testado no Chrome desktop ou Android — iOS 16.4+ tem comportamento de subscription e de gesto de permissão diferentes; sem teste em iPhone real, considerar não-verificado.
- [ ] **Offline "funciona":** app abre offline uma vez logo após instalar — não prova que continua funcionando depois de 7+ dias sem uso (eviction) nem que o outbox sobrevive; testar em pelo menos 2 sessões separadas por dias.
- [ ] **Botões que "respondem":** clique gera algum feedback visual — não prova que não é `Alert.alert` mudo; grep por `Alert\.` deve estar zerado ou todos os resultados justificados.
- [ ] **Login "funciona" no PWA instalado:** testado abrindo o link direto no Safari — não prova que funciona a partir do ícone da Tela de Início em modo standalone real; os dois contextos são diferentes.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| SW preso servindo versão velha para usuários já instalados | MEDIUM | Publicar uma versão do SW com `network-first` agressivo temporário no HTML raiz + banner forçando reload; para usuários totalmente presos, orientar via mensagem direta (grupo é pequeno — 20 pessoas, viável individualmente) a desinstalar e reinstalar o PWA |
| Subscriptions de push mortas acumuladas sem limpeza | LOW | Rodar limpeza retroativa: tentar enviar um ping de teste a todas, remover as que retornarem 410/404; passar a tratar isso no fluxo normal daí em diante |
| Splash/ícone errado já em produção | LOW | Corrigir os assets e o `<link>` tags; usuários que já instalaram só veem o novo splash após reinstalar — comunicar isso no grupo pequeno de usuários |
| Sessão perdida por redirect OAuth cross-context | MEDIUM | Se identificado em produção, migrar o fluxo de login problemático para dentro do domínio (magic link/OTP) e comunicar aos usuários afetados para logar novamente dentro do app instalado |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| SW cache-first servindo bundle velho | Fase de service worker/offline | Deploy de teste + reabrir app instalado sem matar processo → nova versão aparece; banner de update visível |
| Headers de cache da Vercel para `sw.js` | Fase de service worker/offline (mesma fase, config junto) | `curl -I` em produção mostrando `no-cache`/`must-revalidate` em `/sw.js` e manifest |
| Pedido de permissão de push fora de gesto | Fase de push notification | Testar manualmente no iPhone: prompt aparece só ao tocar o botão dedicado |
| Subscription expirada sem re-subscribe | Fase de push notification (infra backend) | Log do backend mostra limpeza automática em 410/404; nenhum `unsubscribe()` no fluxo de logout |
| `Alert.alert` e outras APIs RN no-op no web | Fase de fechamento de gaps do runtime web | Grep `Alert\.` zerado no repo (ou justificado); todos os fluxos críticos (inclusive "Concluir treino") respondem visualmente no PWA |
| OAuth/redirect quebrando sessão em standalone | Fase de instalação guiada / fechamento de gaps | Mapear fluxos de auth que saem do domínio; testar login → matar app → reabrir, sessão persiste |
| Splash/ícone com dimensão errada | Fase de manifest/ícones/splash | Conferir visualmente em pelo menos 2 modelos de iPhone (tamanhos de tela diferentes) antes do UAT do dono |
| Impossibilidade de testar iOS real na máquina de dev | Todas as fases relevantes | Lighthouse PWA audit + testes automatizados cobrem o que é testável (manifest válido, SW registrado, instalabilidade genérica); tudo que é comportamento específico do WebKit/iOS (push real, eviction, standalone session, splash real) fica marcado como item de UAT do dono, não como "verificado" pela sessão de dev |

## Nota sobre verificação — "o que TEM de ficar para UAT do dono"

Dado que a máquina de desenvolvimento não tem Xcode nem iPhone conectado (constatação já registrada em `PROJECT.md`), a fronteira entre "verificável na máquina" e "só verificável no device" é:

**Verificável sem iPhone (CI/local):**
- Lighthouse PWA audit (manifest válido, SW registrado, critérios genéricos de instalabilidade) — mas é oficialmente um audit limitado/deprecated e não testa nada específico de iOS.
- `curl -I` para headers de cache em produção.
- Testes unitários/integração do backend de push (`pywebpush`, tratamento de 410/404, formatação de VAPID claim).
- Grep/lint para `Alert\.` remanescente.
- Validação de manifest.json contra o schema (ícones presentes, tamanhos declarados corretos).

**Não verificável sem iPhone real — obrigatoriamente UAT do dono:**
- Comportamento de instalação real pela Tela de Início (o prompt "Adicionar à Tela de Início" não existe em simulador/emulador de forma fiel).
- Push notification ponta a ponta (permissão, entrega, deep link ao tocar a notificação).
- Splash screen real na abertura do app instalado.
- Persistência de sessão do Supabase Auth em modo standalone através de fechar/reabrir o app e do tempo (7+ dias).
- Fluxos de link externo/OAuth abrindo (ou não) fora do contexto instalado.
- Simulador iOS do Xcode **não substitui** device real para nada relacionado a Safari/WebKit em PWA — é conhecido por ter suporte instável/divergente do Safari real em várias dessas áreas.

Cada fase que toca uma dessas áreas deve terminar com um item de UAT explícito para o dono testar no iPhone, não com "passou no Lighthouse" como critério de conclusão.

## Sources

- [8 PWA Integration Mistakes in 2026 — webscraft.org](https://webscraft.org/blog/8-kritichnih-pomilok-pri-integratsiyi-pwa-stsenariyi-prichini-ta-rishennya-z-kodom?lang=en)
- [iOS Safari using memory cache instead of SW — GoogleChrome/workbox #1744](https://github.com/GoogleChrome/workbox/issues/1744)
- [Vercel Cache-Control headers docs](https://vercel.com/docs/caching/cache-control-headers)
- [Disable /sw.js caching in SPA mode — vercel/serve #299](https://github.com/vercel/serve/issues/299)
- [iOS 16.4 web push — Apple Developer Forums thread 728796](https://developer.apple.com/forums/thread/728796?page=2)
- [When do push subscriptions expire on iOS — Apple Developer Forums 727372](https://developer.apple.com/forums/thread/727372)
- [How to fix iOS push subscriptions terminated after 3 notifications — dev.to/progressier](https://dev.to/progressier/how-to-fix-ios-push-subscriptions-being-terminated-after-3-notifications-39a7)
- [Updates to Storage Policy — WebKit blog](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Apple cops flak for deleting local storage after 7 days — iTnews](https://www.itnews.com.au/news/apple-cops-flak-for-deleting-local-browser-storage-after-7-days-539833)
- [Apple Touch Icon Size & Best Practices — appassetgenerator.com](https://www.appassetgenerator.com/blog/apple-touch-icon-size-guide)
- [apple-touch-startup-image — favicontools.com](https://favicontools.com/glossary/apple-touch-startup-image)
- [OAuth flow breaks on Safari iOS/macOS in PWA — next-pwa #131](https://github.com/shadowwalker/next-pwa/issues/131)
- [How to make Supabase auth work in Add to Home Screen iOS — supabase/discussions #12227](https://github.com/orgs/supabase/discussions/12227)
- [Supabase Native Mobile Deep Linking docs](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Does not provide a valid apple-touch-icon — Chrome for Developers Lighthouse docs](https://developer.chrome.com/docs/lighthouse/pwa/apple-touch-icon)
- [PWA on iOS - Current Status & Limitations 2025 — brainhub.eu](https://brainhub.eu/library/pwa-on-ios)
- [Progressive web apps — Expo Documentation](https://docs.expo.dev/guides/progressive-web-apps/)
- [Flask-pyWebPush — PyPI](https://pypi.org/project/Flask-pyWebPush/)
- [Web Push errors explained (HTTP status codes) — Pushpad](https://pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes)
- [Notification prompting can only be done from a user gesture — Pusher/Bird docs](https://docs.bird.com/pusher/beams/beams/troubleshooting/why-am-i-receiving-error-push-notification-prompting-can-only-be-done-from-a-user-gesture-in-safar)
- [The notification prompt can only be triggered by a user gesture on some browsers — Pushpad](https://pushpad.xyz/blog/the-notification-prompt-can-only-be-triggered-by-a-user-gesture-on-some-browsers)
- Nota de confiança: os achados acima vêm de web search (fóruns oficiais Apple/Vercel/Supabase/GitHub issues + docs primárias Expo/Vercel/WebKit) sem device iPhone real disponível para confirmação empírica nesta máquina — classificados MEDIUM (múltiplas fontes convergentes) ou LOW (fonte única) conforme indicado; todos exigem confirmação final em UAT do dono no device real antes de fechar a fase correspondente.

---
*Pitfalls research for: PWA de primeira classe no iOS — ForçaApp v1.2*
*Researched: 2026-08-14*
