# Phase 10: Identidade do app instalável - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning
**Mode:** Smart discuss (autônomo) — 3 áreas propostas, todas aceitas integralmente pelo dono

<domain>
## Phase Boundary

O ForcaApp instalado pela Tela de Início abre em modo standalone, com ícone, nome
e splash screen próprios — sem flash de tela branca. Requisito: INST-01.

Estado atual (scout 2026-08-14): `public/manifest.json` completo (name "Força —
Treinamento Inteligente", short_name "Força", display standalone, orientation
portrait, cores `#0A0A0A`, ícones 192/512 + maskable), `public/icons/` com
apple-touch-icon 180 + 192 + 512, `public/index.html` já com viewport-fit=cover,
manifest link, theme-color, `apple-mobile-web-app-capable/status-bar-style
black-translucent/title "Força"`. **O gap real da fase é a splash screen
(`apple-touch-startup-image`) — hoje inexistente no index.html — e a validação
visual da identidade no iPhone real.**

</domain>

<decisions>
## Implementation Decisions

### Splash screen (núcleo da fase)
- Fonte da arte: `assets/icon.png` (1024×1024, única arte em alta resolução) com
  `--padding` do pwa-asset-generator sobre fundo `#0A0A0A`.
- Splash única escura `#0A0A0A` — app é dark-first; sem variantes
  prefers-color-scheme.
- Portrait-only (manifest já trava `orientation: portrait`).
- PNGs gerados são versionados em `public/splash/` (deploy determinístico na
  Vercel; o generator NÃO roda no build).

### Ícone, nome e status bar
- Manter os ícones atuais de `public/icons/` (180/192/512) — só regenerar se o
  UAT do dono acusar que não são a identidade final.
- Nome sob o ícone: manter `Força` (`apple-mobile-web-app-title` existente).
- Status bar: manter `black-translucent` (conteúdo sob o notch;
  `viewport-fit=cover` já preparado).
- Cores: manter `#0A0A0A` em theme-color/background; neon `#EBFF00` apenas como
  destaque (regra da identidade em `branding/forca-identidade-final.md` — logo
  nunca com sombra/degradê/efeito).

### Tooling e verificação
- pwa-asset-generator via script npm `generate:pwa-assets` usando
  `npx pwa-asset-generator@<versão pinada>` — sem devDependency pesada.
- O bloco `<link rel="apple-touch-startup-image">` emitido pelo generator é
  colado diretamente no `public/index.html`.
- Guard automatizável (estilo D-08 da fase 9): teste jest leve que confere que
  todo `apple-touch-startup-image` referenciado no `public/index.html` aponta
  para arquivo existente em `public/splash/`.
- Escopo de devices: resoluções de iPhone dos últimos ~5 anos (cobre os ~20
  usuários; não emitir o catálogo completo do generator).

### Claude's Discretion
- Versão exata pinada do pwa-asset-generator, flags específicas (--padding,
  --background), e organização interna de `public/splash/`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assets/icon.png` 1024×1024 (fonte de arte em alta resolução).
- `public/manifest.json`, `public/icons/` (180/192/512), `public/index.html` com
  metas apple-* já corretas.
- `branding/forca-identidade-final.md` (paleta: neon #EBFF00, preto #0A0A0A,
  branco #FFFFFF, grafite #171A1D, cinza #8B9098, azul funcional #0A66FF) e
  `branding/pranchas/forca-performance-final.{html,png}`.
- `assets/splash.png` existe mas é 525×300 (baixa demais para fonte de splash —
  não usar).

### Established Patterns
- Guard de regressão via teste jest que varre artefatos
  (`__tests__/alertNoAlertRemanescente.test.ts` da fase 9) — replicar o padrão
  para splash ↔ index.html.
- Deploy web estático na Vercel a partir de `dist/` (vercel.json na raiz);
  `public/` é copiado ao build do Expo web.

### Integration Points
- `public/index.html` — único ponto de injeção dos links de splash.
- `public/splash/` — diretório novo, versionado.
- `package.json` — script `generate:pwa-assets`.

</code_context>

<specifics>
## Specific Ideas

- Splash = logo centrado sobre `#0A0A0A`, sem texto adicional, sem degradê
  (regras da identidade).
- Critério de sucesso 1 do ROADMAP exige pwa-asset-generator como ferramenta.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
