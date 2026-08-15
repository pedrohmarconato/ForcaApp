# Phase 10: Identidade do app instalável - Research

**Researched:** 2026-08-14
**Domain:** PWA iOS splash screen generation (`apple-touch-startup-image`) + static asset deploy routing (Vercel)
**Confidence:** HIGH

## Summary

O gap real desta fase é estreito e bem definido: gerar PNGs de `apple-touch-startup-image`
para iPhones recentes com `pwa-asset-generator`, colar os `<link>` resultantes em
`public/index.html`, versionar os PNGs em `public/splash/`, e — achado crítico do UI
researcher confirmado nesta pesquisa — ajustar `vercel.json` para que `/splash/*` não seja
engolido pelo rewrite de fallback do SPA. Testei o `pwa-asset-generator@8.1.5` de verdade
nesta máquina, com a arte-fonte real (`assets/icon.png`) e as flags prescritas
(`--padding "20%" --background "#0A0A0A" --type png`), e confirmei por inspeção de pixel
que o PNG gerado tem fundo `#0A0A0A` exato e o símbolo `F` neon `#EBFF00` centralizado —
a receita da fase funciona tecnicamente.

Dois achados mudam o plano em relação às premissas do `10-CONTEXT.md`/`10-UI-SPEC.md`:
(1) **o `pwa-asset-generator` NÃO tem flag para filtrar por família/idade de device** — ele
gera todo o catálogo (iPhone + iPad) que a Apple publica: o corte para "iPhone dos últimos
~5 anos" tem que ser feito manualmente, depois da geração, apagando PNGs e linhas
`<link>` fora do escopo; (2) **nesta máquina, o `pwa-asset-generator` falha ao lançar o
Chrome com o erro `find.default is not a function`** por causa de um Chrome já rodando
com debug port aberto (provavelmente automação de outra sessão) combinado com um bug de
interop ESM/CJS na dependência `find-process` do `chrome-launcher` sob Node 24 — o
workaround verificado é forçar `CHROME_PATH` apontando para o binário do Google Chrome
instalado.

**Primary recommendation:** rodar `pwa-asset-generator@8.1.5` uma única vez (dev-time,
fora do build da Vercel, como já decidido em `10-CONTEXT.md`) com
`CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`,
`--splash-only --portrait-only --scrape true --type png --padding "20%" --background "#0A0A0A"`
apontando para `assets/icon.png`, SEM a flag `--index` (evita reescrita automática/risco de
duplicar a meta tag `apple-mobile-web-app-capable` e de "prettificar" o `index.html`
existente); depois, colar manualmente só as linhas `<link rel="apple-touch-startup-image">`
cujo `device-width` (CSS px) é < 700px E cujo par width×height não é um dos 5 tamanhos
pré-2020 identificados nesta pesquisa (ver `## Code Examples`); e adicionar `splash` à
allowlist de exclusão nas duas regras (`rewrites` e `headers`) do `vercel.json`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Geração dos PNGs de splash | CDN/Static (build-time, dev-machine) | — | `pwa-asset-generator` roda uma vez na máquina do dev (não no build da Vercel, per decisão de `10-CONTEXT.md`); os PNGs resultantes são versionados em `public/splash/` e servidos como arquivo estático |
| Links `apple-touch-startup-image` | CDN/Static | Browser/Client | Vivem em `public/index.html`, HTML estático servido pela Vercel; quem os lê e decide qual usar é o WebKit do iOS no momento do "Add to Home Screen"/abertura do app instalado — não há lógica de servidor envolvida |
| Roteamento de asset estático (`vercel.json` rewrites/headers) | CDN/Static | — | Config pura da borda da Vercel; controla se `/splash/*.png` é servido como arquivo ou reescrito para `index.html` pelo fallback de SPA |
| Ícone/nome/status bar (já existentes) | CDN/Static | Browser/Client | `manifest.json` + metas `apple-*` já corretos, servidos estaticamente, lidos pelo iOS na instalação — nenhuma mudança nesta fase |
| Guarda de regressão (splash ↔ index.html) | Build/Test tooling (mapeado em CDN/Static por proximidade) | — | Teste Jest local/dev, não roda em produção; existe para impedir que a camada CDN/Static acima quebre silenciosamente (link apontando para PNG inexistente) |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Splash screen (núcleo da fase):**
- Fonte da arte: `assets/icon.png` (1024×1024, única arte em alta resolução) com
  `--padding` do pwa-asset-generator sobre fundo `#0A0A0A`.
- Splash única escura `#0A0A0A` — app é dark-first; sem variantes prefers-color-scheme.
- Portrait-only (manifest já trava `orientation: portrait`).
- PNGs gerados são versionados em `public/splash/` (deploy determinístico na Vercel; o
  generator NÃO roda no build).

**Ícone, nome e status bar:**
- Manter os ícones atuais de `public/icons/` (180/192/512) — só regenerar se o UAT do dono
  acusar que não são a identidade final.
- Nome sob o ícone: manter `Força` (`apple-mobile-web-app-title` existente).
- Status bar: manter `black-translucent` (conteúdo sob o notch; `viewport-fit=cover` já
  preparado).
- Cores: manter `#0A0A0A` em theme-color/background; neon `#EBFF00` apenas como destaque
  (regra da identidade — logo nunca com sombra/degradê/efeito).

**Tooling e verificação:**
- pwa-asset-generator via script npm `generate:pwa-assets` usando
  `npx pwa-asset-generator@<versão pinada>` — sem devDependency pesada.
- O bloco `<link rel="apple-touch-startup-image">` emitido pelo generator é colado
  diretamente no `public/index.html`.
- Guard automatizável (estilo D-08 da fase 9): teste jest leve que confere que todo
  `apple-touch-startup-image` referenciado no `public/index.html` aponta para arquivo
  existente em `public/splash/`.
- Escopo de devices: resoluções de iPhone dos últimos ~5 anos (cobre os ~20 usuários; não
  emitir o catálogo completo do generator).

### Claude's Discretion
- Versão exata pinada do pwa-asset-generator, flags específicas (--padding,
  --background), e organização interna de `public/splash/`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INST-01 | Aluno instala o ForcaApp pela Tela de Início e o app abre standalone — splash screen iOS correta (sem flash branco), ícone e nome próprios. | Splash gerada e testada localmente (ver Code Examples); vercel.json fix documentado (ver Common Pitfalls #1); ícone/nome já verificados corretos em `public/icons/` e `public/index.html` — nenhuma mudança necessária além da splash |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pwa-asset-generator | 8.1.5 `[VERIFIED: npm view pwa-asset-generator version, 2026-08-14]` | Gera PNGs de splash iOS a partir de uma imagem-fonte e emite o HTML `<link rel="apple-touch-startup-image">` correspondente | Ferramenta prescrita pelo critério de sucesso 1 do ROADMAP e pela decisão travada em `10-CONTEXT.md`; único gerador de splash iOS com CLI madura, mantido desde 2019, sem dependência de build tool específico (Vite/CRA) |

Nenhuma outra biblioteca é necessária — a fase não introduz código de aplicação novo, só
assets estáticos e config de deploy.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Jest `^29.7.0` (preset `jest-expo`) | já em uso no projeto `[VERIFIED: package.json]` | Guard de regressão que varre `public/index.html` e confirma que cada `apple-touch-startup-image` aponta para um PNG existente em `public/splash/` | Mesmo padrão do guard `__tests__/alertNoAlertRemanescente.test.ts` (fase 9) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pwa-asset-generator | `@vite-pwa/assets-generator` | Projeto ativo e mais moderno, mas acoplado à convenção de config do ecossistema Vite; este projeto é Expo/`react-native-web`, não Vite — pwa-asset-generator é agnóstico de build tool e já foi travado pela decisão do dono |
| pwa-asset-generator | Gerar manualmente no Figma/Sketch exportando cada resolução | Processo manual, sujeito a erro de pixel-a-pixel e a esquecer devices; o critério de sucesso 1 do ROADMAP já exige pwa-asset-generator explicitamente |

**Installation:**
```bash
# Sem devDependency — invocado via npx com versão pinada, uma única vez, fora do build:
npx pwa-asset-generator@8.1.5 assets/icon.png public/splash \
  --splash-only --portrait-only --scrape true --type png \
  --padding "20%" --background "#0A0A0A"
```

**Version verification:** `npm view pwa-asset-generator version` retornou `8.1.5`
(publicado em `2026-06-01T09:36:01Z` `[VERIFIED: npm view pwa-asset-generator time.modified]`).
O pacote em si existe desde 2019-08-14 (7 anos) — só a última versão é recente; não é
sinal de pacote novo/suspeito.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pwa-asset-generator | npm | ~7 anos (criado 2019-08-14) | ~22.485/semana | github.com/elegantapp/pwa-asset-generator | OK `[VERIFIED: gsd-tools package-legitimacy check, 2026-08-14]` | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

Verificação adicional rodada nesta pesquisa: `npm view pwa-asset-generator scripts.postinstall`
retornou vazio (sem script `postinstall`) `[VERIFIED: npm view, 2026-08-14]` — sem sinal de
risco de supply-chain via script de instalação.

## Architecture Patterns

### System Architecture Diagram

```
Dev machine (uma vez, fora do build)
  assets/icon.png (1024x1024, fundo #0A0A0A já embutido)
        │
        ▼
  CHROME_PATH=... npx pwa-asset-generator@8.1.5
  --splash-only --portrait-only --padding 20% --background #0A0A0A
        │
        ├──► console: bloco <link rel="apple-touch-startup-image" ...> (22 linhas nesta
        │     pesquisa — inclui iPad e iPhones pré-2020, precisa de curadoria manual)
        │
        └──► public/splash/apple-splash-WIDTH-HEIGHT.png (20-22 arquivos brutos)
                │
                ▼
     Curadoria manual (dev): apaga PNGs + linhas fora do escopo
     "iPhone últimos ~5 anos" (ver Common Pitfalls #2 e Code Examples)
                │
                ▼
     public/index.html  ◄── cola só as linhas <link> curadas dentro de <head>
     public/splash/*.png ◄── só os PNGs correspondentes ficam
                │
                ▼ (git commit — versionado, decisão travada)
     git push → Vercel build: `npx expo export -p web` copia public/ → dist/
     inalterado (confirmado por diff local: só injeta <link rel="icon"> e <script>,
     preserva o resto do <head> como está)
                │
                ▼
     vercel.json: rewrites + headers precisam excluir "splash" da allowlist
     (["_expo","icons","assets","manifest.json","favicon.ico"] atual NÃO inclui
     "splash" — sem o fix, /splash/*.png é reescrito para index.html em produção)
                │
                ▼
     iPhone real: Safari lê manifest.json + metas apple-* na instalação;
     app instalado lê apple-touch-startup-image no momento do tap no ícone,
     ANTES do React montar — exact match do media query decide o PNG usado
```

### Recommended Project Structure
```
public/
├── index.html          # único ponto de injeção dos <link apple-touch-startup-image>
├── manifest.json        # inalterado nesta fase
├── icons/                # inalterado nesta fase (180/192/512 já corretos)
└── splash/               # NOVO — só os PNGs curados (iPhone ~5 anos), versionados
    ├── apple-splash-750-1334.png    # SE2/SE3 (2020/2022)
    ├── apple-splash-1170-2532.png   # 12/13/14/16e (2020+)
    ├── apple-splash-1080-2340.png   # ver nota de identidade incerta, Pitfall #2
    ├── apple-splash-1284-2778.png
    ├── apple-splash-1290-2796.png
    ├── apple-splash-1179-2556.png
    ├── apple-splash-1206-2622.png
    └── apple-splash-1320-2868.png
scripts/
└── (nenhum script novo necessário — geração é comando ad hoc via npm script)
__tests__/
└── splashLinksApontamPараExistente.test.ts   # NOVO — guard estilo D-08 (nome ilustrativo)
```

### Pattern 1: Geração ad hoc, versionamento estático (decisão travada)
**What:** O gerador roda uma única vez na máquina do dev; os PNGs resultantes entram no
git; a Vercel nunca invoca `pwa-asset-generator` no `buildCommand`.
**When to use:** Sempre que o asset-fonte (`assets/icon.png`) ou a lista curada de devices
mudar — regeneração manual, não automática.
**Example:**
```jsonc
// package.json — script novo (Claude's Discretion: nome exato)
{
  "scripts": {
    "generate:pwa-assets": "pwa-asset-generator assets/icon.png public/splash --splash-only --portrait-only --scrape true --type png --padding \"20%\" --background \"#0A0A0A\""
  }
}
```
Rodar com a versão pinada via `npx pwa-asset-generator@8.1.5 ...` (não como
`npm run generate:pwa-assets` direto, a menos que o script já pineie a versão dentro do
comando) e com `CHROME_PATH` setado (ver Pitfall #3) — `[ASSUMED: organização exata do
script é discricionária, ver 10-CONTEXT.md]`.

### Pattern 2: Curadoria pós-geração por regra objetiva de largura CSS
**What:** Como a ferramenta não tem flag de subconjunto por device (ver Pitfall #2),
separar iPhone de iPad pela `device-width` (CSS px) do próprio `<link>` gerado —
verificado localmente: todos os tamanhos de iPad ficam em `device-width ≥ 744px`; todos os
de iPhone em `device-width ≤ 440px`. Não há sobreposição.
**When to use:** Imediatamente após rodar o generator, antes de colar qualquer linha em
`public/index.html`.
**Example:** ver `## Code Examples` para a lista completa, real, gerada nesta pesquisa.

### Anti-Patterns to Avoid
- **Usar a flag `--index public/index.html`:** reescreve o arquivo automaticamente
  (formatação "pretty"), incluindo reemitir `<meta name="apple-mobile-web-app-capable"
  content="yes">` — que **já existe** em `public/index.html` — arriscando duplicar a meta
  tag e/ou perder os comentários em português que documentam o porquê de cada tag. A
  decisão travada em `10-CONTEXT.md` ("colado diretamente") já evita isso; reforçar: rodar
  sem `--index`, copiar só as linhas `<link rel="apple-touch-startup-image">` do console.
- **Confiar que o generator já filtra por "iPhone recente":** não existe essa flag (ver
  Pitfall #2) — assumir isso silenciosamente gera 20-22 PNGs no repo, metade irrelevante
  (iPad) ou obsoleta (iPhone pré-2020), inflando `public/splash/` sem necessidade.
- **Rodar o generator dentro do `buildCommand` da Vercel:** contradiz a decisão travada
  (deploy determinístico) e adicionaria Puppeteer/Chromium ao pipeline de build — decisão
  já fechada em `10-CONTEXT.md`, mas vale como guarda para o executor não "otimizar"
  isso sozinho.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calcular manualmente as combinações `device-width`/`device-height`/`-webkit-device-pixel-ratio` de cada iPhone | Tabela hardcoded de specs de iPhone escrita à mão | Saída real do `pwa-asset-generator --scrape true` (scrapea a página oficial da Apple no momento da execução) | Specs de device mudam a cada lançamento de iPhone; hardcoded fica velho na próxima fase de manutenção. A ferramenta já resolve isso, o único trabalho manual necessário é a *curadoria* (excluir iPad/pré-2020), não o *cálculo* das resoluções |
| Redimensionar/centralizar o logo dentro do canvas da splash | Script próprio com `sharp`/`canvas` para compor logo + fundo + padding | `--padding`/`--background`/`--opaque` do próprio `pwa-asset-generator` | Testado nesta pesquisa: produz exatamente o resultado esperado (fundo `#0A0A0A` exato, logo centralizado) sem código adicional no projeto |

**Key insight:** o único código novo desta fase é o teste de guarda (Jest) — tudo o mais é
config estática (`vercel.json`, `public/index.html`) e assets binários versionados. Resistir
à tentação de escrever scripts auxiliares (ex.: um script Node que filtra os PNGs
automaticamente por regex de device) — a curadoria é uma decisão de conteúdo (quais
devices importam), não um problema técnico que precise de automação nesta fase de escopo
pequeno (~20 usuários).

## Common Pitfalls

### Pitfall 1: `vercel.json` engole `/splash/*` no rewrite de SPA (achado do UI researcher, confirmado)
**What goes wrong:** Em produção, uma requisição a `/splash/apple-splash-1170-2532.png`
recebe o `index.html` (200 OK, mas conteúdo errado) em vez do PNG — o iOS não reconhece
isso como imagem válida e a splash falha silenciosamente, sem erro visível em lugar nenhum
que não seja o iPhone real.
**Why it happens:** `vercel.json` (lido nesta pesquisa) tem, em `rewrites` E em
`headers`, o mesmo padrão negativo:
`"source": "/((?!_expo|icons|assets|manifest\\.json|favicon\\.ico).*)"` `[VERIFIED:
vercel.json:11 e vercel.json:38, lido nesta sessão]` — `splash` não está na lista de
exclusão, então cai no fallback de SPA.
**How to avoid:** Adicionar `splash` ao grupo de exclusão nas DUAS ocorrências do padrão
(rewrites e o bloco de headers de cache `no-cache`):
```diff
- "source": "/((?!_expo|icons|assets|manifest\\.json|favicon\\.ico).*)",
+ "source": "/((?!_expo|icons|assets|splash|manifest\\.json|favicon\\.ico).*)",
```
Isso precisa ser feito em `vercel.json:11` (regra de `rewrites`) e em `vercel.json:38`
(regra de `headers` que aplica `Cache-Control: no-cache` a "tudo exceto"). Sem editar as
duas, uma delas continua tratando `/splash/*` incorretamente (a de `rewrites` é a que
quebra a splash; a de `headers` "só" aplicaria `no-cache` desnecessário a um asset
estático imutável, menos grave mas ainda incorreto).
**Warning signs:** `curl -I https://<domínio>/splash/apple-splash-1170-2532.png` em
produção retornando `content-type: text/html` em vez de `image/png` — verificável sem
precisar de iPhone físico, antes do UAT.

### Pitfall 2: generator não filtra por device — sem curadoria, sobra catálogo completo (iPad + iPhones de 2012)
**What goes wrong:** Rodar o comando "padrão" sem curadoria pós-geração produz splash
para iPad (que este app nunca roda em modo standalone dedicado — fora de escopo) e para
iPhones de 10+ anos (5s, SE 1ª geração, 6/6+/7/7+/8/8+) — nenhum dos ~20 usuários usa
esses aparelhos, e o critério "últimos ~5 anos" fica descumprido silenciosamente se
ninguém filtrar manualmente.
**Why it happens:** O CLI não expõe nenhuma flag de subconjunto por família/idade de
device — confirmado lendo `npx pwa-asset-generator --help` nesta sessão: as únicas flags
de filtro são `--splash-only`/`--icon-only`/`--landscape-only`/`--portrait-only`, nenhuma
por device `[VERIFIED: saída local de --help, 2026-08-14]`.
**How to avoid:** Rodar com `--scrape true` (padrão, pega o catálogo mais atual — testado
nesta pesquisa: `--scrape true` incluiu o iPhone 16 Pro/Pro Max e um tamanho iPad 13"
recente que `--scrape false` não tinha), depois aplicar a regra objetiva: descartar toda
linha com `device-width ≥ 700px` (iPad) e as 5 combinações pré-2020 confirmadas (ver
`## Code Examples` para a lista exata gerada nesta pesquisa).
**Warning signs:** `public/splash/` com mais de ~10 PNGs, ou qualquer arquivo cujo
`device-width` no `media` do `<link>` correspondente seja ≥ 700px.

**Nota de identidade incerta:** a saída real com `--scrape true` (2026-08-14) incluiu um
tamanho `apple-splash-1080-2340.png` com `media="(device-width: 360px) and
(device-height: 780px) and (-webkit-device-pixel-ratio: 3)"`. Esse par CSS 360×780 não
bate com nenhum iPhone mini/SE conhecido (iPhone 12/13 mini são 375×812 CSS apesar de
também terem painel físico 1080×2340 — não é o mesmo cálculo). Pode ser um device muito
recente ou uma entrada instável da tabela que a Apple publica (o próprio `pwa-asset-generator`
documenta que monitora mudanças na página da Apple diariamente `[CITED:
raw.githubusercontent.com/elegantapp/pwa-asset-generator/master/README.md]`). Recomendação:
o executor deve rodar o generator no dia da execução real (não reusar a lista fixada nesta
pesquisa) e decidir se mantém essa entrada olhando o device-width (360px, dentro da faixa
iPhone — mantê-la é seguro, na pior hipótese é uma splash a mais que nunca casa com device
nenhum, não quebra nada).

### Pitfall 3: `pwa-asset-generator` falha ao lançar Chrome nesta máquina (`find.default is not a function`)
**What goes wrong:** Rodar `npx pwa-asset-generator ...` sem `CHROME_PATH` falha com:
```
getBrowserInstance Chrome launcher could not connect to your system browser. Is your port 54702 accessible?
TypeError: find.default is not a function
```
**Why it happens:** Reproduzido localmente nesta pesquisa `[VERIFIED: execução local,
2026-08-14]`. Havia uma instância do Google Chrome já rodando nesta máquina com
`--remote-debugging-port=54702` aberto (de outra automação/sessão); o `chrome-launcher`
interno do `pwa-asset-generator` tenta detectar esse processo via `find-process`, e a
chamada `find.default(...)` quebra sob Node v24.17.0 (incompatibilidade ESM/CJS na
dependência transitiva). Isso é independente da falta de toolchain nativa (Xcode/Android
Studio) desta máquina — é um bug de Node/Chrome-launcher, não de ambiente iOS.
**How to avoid:** Setar `CHROME_PATH` explicitamente apontando para o binário do Chrome
instalado — testado e funcional nesta sessão:
```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx pwa-asset-generator@8.1.5 assets/icon.png public/splash \
  --splash-only --portrait-only --scrape true --type png \
  --padding "20%" --background "#0A0A0A"
```
Com `CHROME_PATH` setado, o comando roda limpo e gera todos os PNGs (confirmado, 22
imagens salvas, sem erro).
**Warning signs:** Se o comando falhar de novo mesmo com `CHROME_PATH`, fechar qualquer
Chrome com debug port aberto (`lsof -i :<porta> | grep Chrome`) antes de tentar de novo —
o path do binário do Chrome pode variar por máquina; confirmar com
`ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` antes de rodar.

### Pitfall 4: splash não aparece em PWA já instalado — exige reinstalar (documentado pela própria ferramenta)
**What goes wrong:** Depois de gerar/trocar a splash e fazer deploy, um usuário que já
tinha o ForcaApp instalado na Tela de Início continua vendo o comportamento antigo (ou o
flash branco) até reinstalar.
**Why it happens:** "An existing PWA on a home screen will not be able to recognize
changed system settings for it's launch image. This is a limitation on iOS."
`[CITED: raw.githubusercontent.com/elegantapp/pwa-asset-generator/master/README.md]` — o
iOS cacheia a splash no momento da instalação, não relê o `index.html` depois.
**How to avoid:** No UAT do dono (critério 2 do ROADMAP), se o app já estava instalado
antes desta fase, remover da Tela de Início e reinstalar antes de validar — não é um bug
do código, é comportamento documentado do iOS. Vale registrar essa instrução explicitamente
no passo de UAT do plano, para não gerar um falso-negativo.
**Warning signs:** Splash "não muda" mesmo depois de confirmar via `curl` que o PNG certo
está no ar em produção — sintoma clássico de cache de instalação, não de deploy quebrado.

### Pitfall 5: match de media query é exato — CSS px, não pixel físico
**What goes wrong:** Se o `device-width`/`device-height`/`-webkit-device-pixel-ratio` de
uma linha `<link>` não bater exatamente com o device real, o iOS não usa aquele PNG (nem
aproxima) — cai para outro `<link>` que combine, ou, se nenhum combinar, mostra tela
branca.
**Why it happens:** "When it's an exact match with device's resolution, iOS displays the
splash screen as a launch image." `[CITED: raw.githubusercontent.com/elegantapp/pwa-asset-generator/master/README.md]`
— não há fallback por proximidade.
**How to avoid:** Não editar manualmente os valores de `media` gerados pela ferramenta —
copiar exatamente como saíram no console. Se precisar adicionar um device novo no futuro,
rodar o generator de novo, não escrever o media query à mão.
**Warning signs:** Qualquer edição manual de número dentro de um `media="..."` já colado —
tratar como bug candidato até provar o contrário.

## Code Examples

### Saída real e completa do `pwa-asset-generator@8.1.5` nesta pesquisa (2026-08-14, `--scrape true`, 22 linhas)
```html
<!-- Fonte: execução local, CHROME_PATH setado, assets/icon.png, --padding "20%" --background "#0A0A0A" -->
<!-- IPAD — descartar (device-width >= 744px), fora do escopo desta fase -->
<link rel="apple-touch-startup-image" href="apple-splash-2064-2752.png" media="(device-width: 1032px) and (device-height: 1376px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-2048-2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1668-2420.png" media="(device-width: 834px) and (device-height: 1210px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1668-2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1668-2224.png" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1536-2048.png" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1640-2360.png" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1620-2160.png" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="apple-splash-1488-2266.png" media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">

<!-- IPHONE PRÉ-2020 — descartar (fora de "últimos ~5 anos") -->
<link rel="apple-touch-startup-image" href="apple-splash-1242-2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"> <!-- XS Max / 11 Pro Max, 2018-2019 -->
<link rel="apple-touch-startup-image" href="apple-splash-1125-2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"> <!-- X / XS / 11 Pro, 2017-2019 -->
<link rel="apple-touch-startup-image" href="apple-splash-828-1792.png"  media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"> <!-- XR / 11, 2018-2019 -->
<link rel="apple-touch-startup-image" href="apple-splash-1242-2208.png" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"> <!-- 6+/7+/8+, 2014-2017 -->
<link rel="apple-touch-startup-image" href="apple-splash-640-1136.png"  media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"> <!-- 5/5s/SE1, 2012-2016 -->

<!-- IPHONE ÚLTIMOS ~5 ANOS — MANTER, colar em public/index.html -->
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1320-2868.png" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1206-2622.png" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1260-2736.png" media="(device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1290-2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1179-2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1170-2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1284-2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/splash/apple-splash-1080-2340.png" media="(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"> <!-- identidade incerta, ver Pitfall #2 -->
```
`[VERIFIED: execução local de pwa-asset-generator@8.1.5, 2026-08-14, CHROME_PATH setado —
os 22 pares href/media acima são cópia literal da saída real do comando, não memória de
treino]`. Note que os `href` no bloco final foram reescritos de `apple-splash-*.png` (path
relativo ao diretório de saída passado no comando de teste) para `/splash/apple-splash-*.png`
(path absoluto a partir da raiz web, consistente com como `manifest.json` e
`apple-touch-icon` já referenciam `public/` em `public/index.html`) — confirmar esse ajuste
de path ao colar de verdade.

### Verificação de pixel do PNG gerado (confirma que as flags produzem o resultado esperado)
```python
# Rodado localmente nesta pesquisa contra o PNG de teste apple-splash-1170-2532.png
from PIL import Image
im = Image.open('apple-splash-1170-2532.png')
im.size            # (1170, 2532) — bate exatamente com o filename/media
im.getpixel((0,0)) # (10, 10, 10)  == #0A0A0A, fundo da marca
im.getpixel((585,1266)) # (235, 255, 0) == #EBFF00, símbolo F centralizado
```
`[VERIFIED: inspeção de pixel via PIL, 2026-08-14]`

### Fix do `vercel.json` (Pitfall #1)
```diff
--- a/vercel.json
+++ b/vercel.json
@@ rewrites
   "rewrites": [
     {
-      "source": "/((?!_expo|icons|assets|manifest\\.json|favicon\\.ico).*)",
+      "source": "/((?!_expo|icons|assets|splash|manifest\\.json|favicon\\.ico).*)",
       "destination": "/index.html"
     }
   ],
@@ headers (bloco de Cache-Control: no-cache)
     {
-      "source": "/((?!_expo|icons|assets|manifest\\.json|favicon\\.ico).*)",
+      "source": "/((?!_expo|icons|assets|splash|manifest\\.json|favicon\\.ico).*)",
       "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
     }
```
`[VERIFIED: vercel.json lido nesta sessão — diff acima é contra o conteúdo real do
arquivo, linhas 11 e 38]`

### Guard Jest (molde: `__tests__/alertNoAlertRemanescente.test.ts`)
```typescript
// __tests__/splashLinksApontamParaExistente.test.ts (nome ilustrativo)
// Guarda de regressão (D-08-style, fase 10): todo <link rel="apple-touch-startup-image">
// em public/index.html precisa apontar para um arquivo existente em public/splash/.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const INDEX_HTML = join(__dirname, '..', 'public', 'index.html');
const SPLASH_DIR = join(__dirname, '..', 'public', 'splash');

describe('guarda: apple-touch-startup-image aponta para arquivo existente', () => {
  it('todo href de apple-touch-startup-image resolve em public/splash/', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    const linkRegex = /<link\s+rel="apple-touch-startup-image"[^>]*href="([^"]+)"/g;
    const hrefs: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      hrefs.push(match[1]);
    }

    // Guarda contra a própria regex parar de casar (molde alertNoAlertRemanescente.test.ts)
    expect(hrefs.length).toBeGreaterThan(0);

    const ausentes = hrefs.filter((href) => {
      const nomeArquivo = href.replace(/^\/splash\//, '');
      return !existsSync(join(SPLASH_DIR, nomeArquivo));
    });
    expect(ausentes).toEqual([]);
  });
});
```
`[VERIFIED: __tests__/alertNoAlertRemanescente.test.ts lido nesta sessão como molde,
linhas 12-40 — padrão de varredura recursiva/regex + assert de "não parou de achar coisa"
replicado aqui]`. Roda via `npx jest __tests__/splashLinksApontamParaExistente.test.ts`,
mesmo preset `jest-expo` do resto do projeto (o teste usa só `fs`/`path` puro, sem
renderizar componente React, igual ao guard da fase 9).

## Runtime State Inventory

Não aplicável — esta fase não é rename/refactor/migração. É adição de asset novo
(`public/splash/`) + config de deploy (`vercel.json`); nenhum dado em runtime (banco,
serviço externo, OS-registered state) referencia nomes ou strings alterados por esta fase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nome exato do script npm (`generate:pwa-assets`) e organização de subpastas dentro de `public/splash/` — explicitamente delegado a Claude's Discretion em `10-CONTEXT.md` | Standard Stack / Recommended Project Structure | Baixo — é só nomenclatura, não afeta funcionamento |
| A2 | Identidade do device correspondente a `apple-splash-1080-2340.png` (device-width 360, dpr 3) não pôde ser confirmada contra nenhum modelo de iPhone conhecido | Common Pitfalls #2 | Baixo — na pior hipótese é um `<link>` a mais que nunca casa com device real, não quebra nada; risco só se a curadoria manual remover esse `<link>` por engano achando que é lixo, quando na verdade corresponde a um iPhone real recém-lançado |
| A3 | Path relativo (`apple-splash-*.png`, sem `/splash/` na frente) na saída de teste precisa ser reescrito para `/splash/apple-splash-*.png` ao colar em `public/index.html` — inferido pela convenção existente (`/icons/apple-touch-icon.png`, `/manifest.json`), não testado literalmente com o path final `public/splash/` como diretório de saída | Code Examples | Médio — se o path ficar errado, os `<link>` apontam para 404 e a splash falha; o guard Jest (Code Examples) pega isso antes do deploy se rodado com o diretório de saída real |

**Se esta tabela estivesse vazia:** não está — A2 e A3 pedem confirmação/re-execução no
dia da implementação (gerar de novo, não reusar os hrefs colados aqui sem ajustar o path).

## Open Questions

1. **A entrada `apple-splash-1080-2340.png` (360×780 CSS, dpr 3) deve ser mantida?**
   - What we know: apareceu na saída real com `--scrape true` em 2026-08-14; device-width
     360px está dentro da faixa iPhone (nunca no range 744px+ de iPad).
   - What's unclear: nenhuma fonte consultada (ios-resolution.com, README do
     pwa-asset-generator, treino) confirma que device físico usa exatamente esse trio CSS.
   - Recommendation: manter por padrão (custo zero se nunca casar com device real);
     revisitar se o UAT do dono revelar tela branca num iPhone específico que bateria com
     esse tamanho.

2. **O executor deve rodar o generator no dia da implementação ou reusar a lista desta
   pesquisa?**
   - What we know: `--scrape true` busca a página da Apple ao vivo; a própria ferramenta
     diz monitorar mudanças diariamente.
   - What's unclear: se a lista mudar entre a pesquisa (2026-08-14) e a execução real, os
     22 pares acima podem não bater 100% com a saída nova.
   - Recommendation: tratar a lista desta pesquisa como referência/ponto de partida, mas
     o plano deve instruir "rodar o comando de novo no momento da execução e usar a saída
     fresca", não copiar os valores fixados aqui sem reconferir.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | rodar `npx pwa-asset-generator` | ✓ | v24.17.0 `[VERIFIED: node --version]` | — |
| Google Chrome (binário local) | `pwa-asset-generator` renderizar a arte via Puppeteer | ✓ | Chrome 151.0.7922.138 (detectado em processo rodando) `[VERIFIED: ps aux, 2026-08-14]` | Se ausente, `pwa-asset-generator` baixaria Chromium via `puppeteer-core` automaticamente (não testado nesta sessão) |
| `CHROME_PATH` setado explicitamente | Contornar o bug `find.default is not a function` nesta máquina (Pitfall #3) | Requer ação manual do executor — não é um binário instalado, é uma env var a setar no comando | — | Sem isso, o comando falha nesta máquina especificamente |
| npm registry (rede) | `npx pwa-asset-generator@8.1.5`, `npm view` | ✓ | — | — |
| developer.apple.com (rede) | `--scrape true` buscar specs atuais | ✓ (HTTP 200 confirmado) `[VERIFIED: curl, 2026-08-14]` | — | `--scrape false` usa dados estáticos embutidos no pacote (mais antigos, sem os modelos mais recentes) |
| Xcode / simulador iOS | **NÃO necessário para esta fase** | N/A | — | UAT sempre no iPhone real do dono (per MEMORY.md: máquina sem toolchain nativa) — `pwa-asset-generator` é uma ferramenta Node/Chromium pura, não depende de Xcode |

**Missing dependencies with no fallback:** nenhuma — todas as dependências reais estão
disponíveis nesta máquina, desde que `CHROME_PATH` seja setado manualmente.

**Missing dependencies with fallback:** `--scrape true` requer rede até a Apple; se
indisponível no dia da execução, cair para `--scrape false` (dados estáticos, testado
nesta pesquisa e funcional, só com catálogo potencialmente desatualizado).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` via preset `jest-expo` `[VERIFIED: package.json]` |
| Config file | `package.json` (`"jest": {...}` inline — `preset: "jest-expo"`,
  `testPathIgnorePatterns: ["/node_modules/", "<rootDir>/__tests__/integration/"]`)
  `[VERIFIED: package.json, campo "jest" lido nesta sessão]` |
| Quick run command | `npx jest __tests__/splashLinksApontamParaExistente.test.ts` |
| Full suite command | `npx jest` — nota do `AGENTS.md:91`: "A suíte Jest completa com
  `--runInBand` deixa handle aberto e pode sair 1 mesmo com todos os testes verdes; não
  use esse exit code como portão." `[VERIFIED: AGENTS.md:91, lido nesta sessão]` — ler a
  saída textual (`Tests: N passed`), não só o exit code |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-01 | Todo `apple-touch-startup-image` em `public/index.html` aponta para PNG existente em `public/splash/` | unit (varredura) | `npx jest __tests__/splashLinksApontamParaExistente.test.ts` | ❌ Wave 0 (novo) |
| INST-01 | `vercel.json` não reescreve `/splash/*` para `index.html` (rewrites) | unit/config | teste Jest simples que faz `JSON.parse` do `vercel.json` e testa a regex de `rewrites[0].source` contra a string `/splash/apple-splash-1170-2532.png`, esperando NÃO casar | ❌ Wave 0 (novo) |
| INST-01 | Splash aparece sem flash branco, ícone/nome corretos, app standalone sem barra do Safari | manual (UAT) — não automatizável | UAT do dono no iPhone real, COM reinstalação do app se já estava instalado antes (Pitfall #4) | N/A — sempre manual |

### Sampling Rate
- **Per task commit:** `npx jest __tests__/splashLinksApontamParaExistente.test.ts` (e o
  teste de regex do `vercel.json`, se separado)
- **Per wave merge:** `npx jest` (suíte completa — ler saída textual, não exit code)
- **Phase gate:** Suíte completa verde + `curl -I https://<domínio-produção>/splash/<um-arquivo>.png`
  retornando `content-type: image/png` (não `text/html`) + UAT do dono no iPhone real
  (critérios 2 e 3 do ROADMAP) antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `__tests__/splashLinksApontamParaExistente.test.ts` — cobre INST-01 (integridade
  link↔arquivo)
- [ ] Teste de regex do `vercel.json` (pode viver no mesmo arquivo acima ou separado) —
  cobre INST-01 (roteamento correto em produção)
- [ ] `public/splash/` — diretório inexistente ainda, precisa ser criado pela geração real

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | fase não toca autenticação |
| V3 Session Management | não | fase não toca sessão |
| V4 Access Control | não | assets estáticos públicos por natureza (splash/ícone não são dado sensível) |
| V5 Input Validation | não diretamente | não há input de usuário nesta fase; a única "entrada" é o arquivo-fonte `assets/icon.png`, já no repo |
| V6 Cryptography | não | fase não toca criptografia |

### Known Threat Patterns para esta fase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Regex de exclusão do `vercel.json` mal escrita ao adicionar "splash" (Pitfall #1) abre caminho não intencional (ex.: um typo que vire `.*splash.*` sem âncora) | Tampering (config drift) | Editar só a lista dentro do grupo negativo existente (`(?!_expo|icons|assets|splash|manifest\\.json|favicon\\.ico)`), sem tocar na estrutura do regex; validar com o `curl -I` do Wave 0 antes do deploy |
| CSP (`img-src 'self' data: blob:`) já cobre `/splash/*.png` por ser mesma origem — nenhuma mudança necessária | — | Confirmado por leitura de `vercel.json` — `img-src 'self'` já permite qualquer imagem same-origin, incluindo o novo diretório `/splash/` |
| `postinstall` malicioso em dependência de supply-chain (`pwa-asset-generator` ou transitiva) | Tampering (supply chain) | Confirmado sem `postinstall` no pacote raiz `[VERIFIED: npm view scripts.postinstall]`; pacote não vira `devDependency` (só `npx` pontual), reduzindo superfície de ataque residente no `node_modules` do projeto |

## Sources

### Primary (HIGH confidence)
- Execução local de `pwa-asset-generator@8.1.5` nesta máquina (2026-08-14) — comando real,
  saída real, PNGs reais inspecionados por pixel via PIL.
- `npx pwa-asset-generator --help` (saída local, 2026-08-14) — lista completa de flags.
- Leitura direta de `vercel.json`, `public/index.html`, `public/manifest.json`,
  `package.json`, `AGENTS.md`, `__tests__/alertNoAlertRemanescente.test.ts`,
  `jest.web.config.js`, `dist/index.html` (diff contra `public/index.html`),
  `scripts/verify-web-bundle.mjs` — todos lidos nesta sessão.
- `npm view pwa-asset-generator version|time.modified|scripts.postinstall|repository.url` —
  registro npm consultado nesta sessão.
- `gsd-tools query package-legitimacy check` — verdict OK para `pwa-asset-generator`.

### Secondary (MEDIUM confidence)
- `raw.githubusercontent.com/elegantapp/pwa-asset-generator/master/README.md` (WebFetch,
  2026-08-14) — comportamento de `--index`, `--scrape`, filename pattern, pitfall de
  reinstalação, exact-match de media query.
- `ios-resolution.com` (WebFetch, 2026-08-14) — tabela de referência de devices iPhone
  SE2 até 17/Air, usada só como cross-check de nomenclatura, não como fonte primária dos
  valores usados no código (esses vieram da execução local real).

### Tertiary (LOW confidence)
- Resultados gerais de WebSearch sobre flags do `pwa-asset-generator` — usados só para
  orientação inicial, superados pela leitura direta do `--help` e pela execução real.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pacote único, versão e legitimidade verificadas via `npm view` +
  gate de legitimidade, comando testado localmente com sucesso.
- Architecture: HIGH — fluxo confirmado por leitura direta de todos os arquivos de config
  envolvidos (`vercel.json`, `public/index.html`, `dist/index.html`) e por execução real
  do generator.
- Pitfalls: HIGH para os 5 catalogados (todos verificados por execução local ou leitura
  direta de arquivo/README oficial); MEDIUM para a identidade exata do device
  `1080-2340`/`360×780` (Open Question #1).

**Research date:** 2026-08-14
**Valid until:** 2026-08-21 (7 dias) — o catálogo de devices do `pwa-asset-generator`
muda com o lançamento de novos iPhones e o próprio scraping é dinâmico; a lista de
`<link>` documentada aqui deve ser regerada, não reusada, se a implementação real ocorrer
depois dessa janela.
