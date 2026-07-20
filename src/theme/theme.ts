// src/theme/theme.ts
// Fonte ÚNICA de tokens da identidade "Força sem ruído" (Direção visual 02).
//
// Paleta: brandbook `branding/forca-identidade-final.md`.
// Geometria (espaçamento, raios, escala tipográfica, estados): extraída do
// protótipo `forca-app-mockup-atual.html`.
//
// Princípios do sistema:
//  1. Acento com propósito — o neon aparece só em foco, ação principal e
//     progresso concluído. Nunca como preenchimento dominante.
//  2. Hierarquia editorial — títulos humanos, dados compactos, espaço generoso.
//  3. Superfícies tonais — grafites próximos no lugar de contornos, sombras e
//     efeitos luminosos.
//  4. Padrões consistentes — cards, botões, campos e navegação compartilham a
//     mesma geometria e escala.
//
// Nenhuma tela deve declarar cor, fonte, raio ou espaçamento fora daqui.

// --- Âncoras do brandbook -------------------------------------------------
const PRETO = '#0A0A0A'; // base principal
const GRAFITE = '#171A1D'; // superfícies secundárias
const CINZA = '#8B9098'; // informação auxiliar
const BRANCO = '#FFFFFF'; // contraste e versão negativa
const NEON = '#EBFF00'; // assinatura, ação e progresso concluído
const AZUL_FUNCIONAL = '#0A66FF'; // estados digitais que não podem virar neon

export const palette = {
  preto: PRETO,
  grafite: GRAFITE,
  cinza: CINZA,
  branco: BRANCO,
  neon: NEON,
  azulFuncional: AZUL_FUNCIONAL,
} as const;

// --- Superfícies ----------------------------------------------------------
// Escada tonal neutra ancorada nas duas superfícies do brandbook (preto e
// grafite). Substitui contornos e sombras: a hierarquia vem do degrau de tom.
export const surfaces = {
  canvas: PRETO, // fundo do app
  raised: '#101315', // 1º degrau — barras, faixas discretas
  card: GRAFITE, // 2º degrau — cards, campos, linhas de lista
  elevated: '#1F2328', // 3º degrau — topo do card de destaque
} as const;

export const colors = {
  // Acento — usar com parcimônia (princípio 1)
  accent: {
    main: NEON,
    // Fundo tênue para chips/estados selecionados: sinaliza sem preencher.
    soft: 'rgba(235, 255, 0, 0.075)',
    border: 'rgba(235, 255, 0, 0.45)',
    // Texto/ícone sobre neon. "Preto sobre neon" é uso aprovado no brandbook.
    on: PRETO,
  },

  surface: surfaces,

  text: {
    primary: BRANCO,
    secondary: CINZA, // informação auxiliar (brandbook)
    quiet: '#61666D', // rótulos, metadados, texto de 3º nível
    inverse: PRETO,
    accent: NEON,
  },

  border: {
    subtle: 'rgba(255, 255, 255, 0.10)', // padrão: separa sem contornar
    strong: 'rgba(255, 255, 255, 0.18)',
    focus: 'rgba(235, 255, 0, 0.45)',
  },

  // Estados funcionais. O azul existe justamente para não competir com o neon.
  status: {
    info: AZUL_FUNCIONAL,
    infoSoft: 'rgba(10, 102, 255, 0.12)',
    success: '#8CAE85',
    successSoft: 'rgba(140, 174, 133, 0.12)',
    warning: '#D8B15C',
    warningSoft: 'rgba(216, 177, 92, 0.12)',
    danger: '#DC827B',
    dangerSoft: 'rgba(220, 130, 123, 0.10)',
    dangerBorder: 'rgba(220, 130, 123, 0.18)',
  },

  overlay: 'rgba(0, 0, 0, 0.62)',
  transparent: 'transparent',
} as const;

// --- Tipografia -----------------------------------------------------------
// Barlow Semi Condensed ExtraBold: wordmark e display. Inter: todo o resto.
// Os arquivos vivem em `assets/fonts/` e são carregados por `expo-font`
// (ver `App.tsx`). Nada de fonte via rede.
export const fonts = {
  display: 'BarlowSemiCondensed-ExtraBold',
  ui: 'Inter',
} as const;

export const typography = {
  fonts,
  fontSizes: {
    micro: 9, // rótulos em caixa alta, legendas de gráfico
    xs: 10, // rótulos de campo, metadados
    sm: 11, // texto de apoio, linhas de lista
    base: 12, // corpo padrão da interface
    md: 14, // títulos de seção, corpo destacado
    lg: 16, // títulos de card
    xl: 20, // números de destaque
    display: 24, // títulos de tela
    hero: 30, // wordmark em telas de autenticação
  },
  fontWeights: {
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
    extraBold: '800',
  },
  lineHeights: {
    tight: 1.15,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
  // Espaçamento ótico das caixas-altas (eyebrows, kickers, rótulos).
  letterSpacing: {
    tight: -0.6,
    display: -0.9,
    normal: 0,
    wide: 1.1,
    wider: 1.6,
  },
} as const;

// --- Espaçamento ----------------------------------------------------------
export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

// --- Raios ----------------------------------------------------------------
export const borderRadius = {
  sm: 9, // chips, quadradinhos de dia
  md: 12, // botões, campos
  lg: 14, // linhas de lista
  xl: 18, // cards
  xxl: 22, // cards de destaque, barra de navegação
  pill: 999,
} as const;

// --- Elevação -------------------------------------------------------------
// A Direção 02 troca sombra por tom. Mantemos um único nível discreto para
// superfícies que realmente flutuam (barra de abas, folhas modais).
export const elevation = {
  none: {},
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export const zIndex = {
  base: 0,
  content: 10,
  header: 20,
  modal: 30,
  toast: 40,
} as const;

export const animation = {
  durations: {
    short: 150,
    medium: 260,
    long: 420,
  },
} as const;

// Altura mínima de alvo tocável — usada por botões, linhas e campos.
export const hitTarget = {
  compact: 44,
  regular: 50,
} as const;

const theme = {
  palette,
  colors,
  surfaces,
  typography,
  fonts,
  spacing,
  borderRadius,
  elevation,
  zIndex,
  animation,
  hitTarget,
};

export default theme;
