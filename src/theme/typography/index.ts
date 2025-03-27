// src/theme/typography/index.ts
import { Platform } from 'react-native';

// Família de fonte base (substituir pelas fontes do design)
const fontFamily = Platform.select({
  ios: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System-Bold',
  },
  android: {
    regular: 'Roboto',
    medium: 'Roboto-Medium',
    semibold: 'Roboto-SemiBold',
    bold: 'Roboto-Bold',
  },
});

// Definições de tamanho
const size = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Presets de tipografia (para uso consistente)
const presets = {
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: size.xxxl,
  },
  h2: {
    fontFamily: fontFamily.bold,
    fontSize: size.xxl,
  },
  h3: {
    fontFamily: fontFamily.semibold,
    fontSize: size.xl,
  },
  h4: {
    fontFamily: fontFamily.semibold,
    fontSize: size.lg,
  },
  body1: {
    fontFamily: fontFamily.regular,
    fontSize: size.md,
  },
  body2: {
    fontFamily: fontFamily.regular,
    fontSize: size.sm,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: size.xs,
  },
  button: {
    fontFamily: fontFamily.semibold,
    fontSize: size.md,
  },
};

export default {
  fontFamily,
  size,
  presets,
};