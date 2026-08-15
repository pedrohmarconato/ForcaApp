# Phase 12: Página de instalação guiada - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Mode:** Smart discuss (autônomo) — 3 áreas propostas, todas aceitas integralmente pelo dono

<domain>
## Phase Boundary

Qualquer aluno leigo consegue instalar o ForcaApp sozinho a partir do site, sem
instrução verbal do dono. Rota `/instalar` dentro do próprio app (React
Navigation), com detecção de iOS/Safari e de "já instalado". Requisito: INST-02.

Contexto do fluxo real: o dono compartilha o link
`https://forca-app-six.vercel.app/instalar`; o aluno abre no Safari do iPhone
**deslogado** (possivelmente antes de ter conta) e segue os passos.

</domain>

<decisions>
## Implementation Decisions

### Acesso e navegação
- `/instalar` é PÚBLICA — funciona deslogado (aluno recebe o link antes de ter
  conta) e logado.
- Path `instalar` registrado no linkingConfig; a tela é acessível em qualquer
  estado de auth (mecanismo exato — tela nos dois stacks, gate acima do auth,
  etc. — a critério do planner, respeitando a arquitetura existente do
  RootNavigator/linkingConfig).
- Porta de entrada: só a rota direta (o dono compartilha o link). Sem botão novo
  no app.

### Conteúdo do passo a passo
- 4 estados detectados e cobertos:
  1. iOS + Safari → passo a passo de instalação (caminho feliz).
  2. iOS + outro navegador (Chrome/Firefox iOS) → "abra este link no Safari" com
     instrução de como.
  3. Desktop/Android → "abra este link no iPhone".
  4. Standalone (já instalado) → mensagem adaptada de sucesso, SEM repetir o
     passo a passo (critério de sucesso 2).
- Formato: 3 passos numerados com ícone (Compartilhar → "Adicionar à Tela de
  Início" → Confirmar), sem screenshots pesados.
- Copy: tom leigo e literal, pt-BR (ex.: "Toque no botão Compartilhar — o
  quadrado com a seta para cima, na barra de baixo do Safari").
- QR code para desktop: NÃO — deferido.

### Detecção técnica e guards
- "Já instalado": `window.matchMedia('(display-mode: standalone)')` +
  `navigator.standalone === true` (iOS legado).
- iOS/Safari: utilitário puro e testável (trata Chrome iOS = CriOS, Firefox iOS
  = FxiOS; ciente do user-agent desktop do iPadOS).
- Página web-only (`Platform.OS === 'web'`); zero efeito no app nativo.
- Testes: RTL da página cobrindo os 4 estados (mockando o utilitário) + testes
  unitários do utilitário de detecção.

### Claude's Discretion
- Nome/estrutura do componente e do utilitário, mecanismo exato de registro da
  rota pública, layout interno da página (dentro do UI-SPEC e da identidade).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/navigation/RootNavigator.js` (NavigationContainer + linkingInterceptor),
  `src/navigation/linkingConfig.ts` e `linking.ts` (deep links já mapeiam
  `treino-conjunto/novo` e `treino-conjunto/:code` — padrão a seguir).
- `src/navigation/AuthNavigator.tsx`, `MainNavigator.tsx`,
  `OnboardingNavigator.tsx` (estados de auth onde a rota precisa existir).
- Identidade: `#0A0A0A` base, `#171A1D` superfícies, neon `#EBFF00` destaque,
  branco/cinza para texto (branding/forca-identidade-final.md).
- Padrão de guard/testes das fases 9–11 (jest + RTL; jsdom via docblock quando
  precisar de window — ver __tests__/UpdateBanner.test.tsx).

### Established Patterns
- Deep-linking web via linkingConfig (rewrite SPA da Vercel já manda tudo para
  index.html — a rota /instalar chega ao React Navigation sem mudança de infra).
- Web-only por Platform.OS === 'web' (UpdateBanner da fase 11).
- Alert.alert proibido (alertShim); CSP estrita (sem inline).

### Integration Points
- `src/navigation/linkingConfig.ts` — novo path `instalar`.
- Navigators — registro da tela nos estados de auth necessários.
- Tela nova (ex.: `src/screens/InstallScreen.tsx`) + utilitário (ex.:
  `src/utils/installDetection.ts`).

</code_context>

<specifics>
## Specific Ideas

- Critério 2 do ROADMAP: standalone → mensagem adaptada, sem passo a passo.
- UAT (critério 3): dono ou aluno real acessa /instalar pelo Safari e instala
  sem ajuda.

</specifics>

<deferred>
## Deferred Ideas

- QR code na visão desktop apontando para /instalar (deferido pelo dono nesta
  discussão).

</deferred>
