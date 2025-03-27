// src/theme/spacing/index.ts
// Sistema de espaçamento baseado em múltiplos de 4 para consistência visual
const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  };
  
  // Para uso em padding, margin, gap
  const padding = {
    container: 16,
    card: 16,
    button: 12,
    input: 12,
  };
  
  // Arredondamento de bordas
  const borderRadius = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    round: 99, // Para elementos circulares
  };
  
  export default {
    spacing,
    padding,
    borderRadius,
  };