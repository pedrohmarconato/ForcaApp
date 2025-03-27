// Sistema de cores com variantes para diferentes estados e modos
export const colors = {
    primary: {
      main: '#EBFF00',       // Amarelo neon vibrante
      light: '#F2FF66',
      dark: '#CCDD00',
      contrast: '#000000',   // Texto sobre cor primária
    },
    background: {
      dark: '#0A0A0A',
      darker: '#050505',
      card: 'rgba(26, 26, 26, 0.8)',
      gradient: ['#0A0A0A', '#1A1A1A'],
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 255, 255, 0.7)',
      muted: 'rgba(255, 255, 255, 0.5)',
      inverse: '#000000',
    },
    border: {
      light: 'rgba(255, 255, 255, 0.1)',
      medium: 'rgba(255, 255, 255, 0.2)',
      focus: 'rgba(235, 255, 0, 0.5)',
    },
    status: {
      success: '#4CAF50',
      warning: '#FF9800',
      error: '#F44336',
      info: '#2196F3',
    },
    overlay: 'rgba(0, 0, 0, 0.4)',
    shadow: {
      color: '#000',
      colorAlt: 'rgba(235, 255, 0, 0.2)',
    },
    transparent: 'transparent',
  };
  
  // Sistema de tipografia com variantes para diferentes usos
  export const typography = {
    fontSizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      xxxl: 32,
    },
    fontWeights: {
      light: '300',
      regular: '400',
      medium: '500',
      semiBold: '600',
      bold: '700',
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  };
  
  // Sistema de espaçamento e layout
  export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  };
  
  // Sistema de bordas arredondadas
  export const borderRadius = {
    sm: 4,
    md: 8,
    lg: 16,
    xl: 24,
    circle: 9999,
  };
  
  // Sistema de sombras
  export const shadows = {
    light: {
      shadowColor: colors.shadow.color,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    medium: {
      shadowColor: colors.shadow.color,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 5,
    },
    primary: {
      shadowColor: colors.shadow.colorAlt,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
  };
  
  // Camadas de Z-index para controle de sobreposição
  export const zIndex = {
    base: 0,
    content: 10,
    header: 20,
    modal: 30,
    toast: 40,
    tooltip: 50,
  };
  
  // Variáveis de animação
  export const animation = {
    durations: {
      short: 150,
      medium: 300,
      long: 500,
    },
    easings: {
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  };
  
  // Funções utilitárias para theming
  export const utils = {
    // Função para criar estilo de glassmorphism
    createGlassmorphism: (opacity = 0.1) => ({
      backgroundColor: `rgba(26, 26, 26, ${opacity})`,
      borderColor: colors.border.light,
      borderWidth: 1,
      shadowColor: colors.shadow.color,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 10,
    }),
    
    // Função para criar degradê
    createGradientColors: (variant = 'default') => {
      const gradients = {
        default: colors.background.gradient,
        success: [colors.status.success, `${colors.status.success}88`],
        warning: [colors.status.warning, `${colors.status.warning}88`],
        error: [colors.status.error, `${colors.status.error}88`],
      };
      return gradients[variant] || gradients.default;
    },
  };
  
  // Exportar tema completo
  export default {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
    zIndex,
    animation,
    utils,
  };