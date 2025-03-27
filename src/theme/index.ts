import { darkColors, lightColors } from './colors';
import { spacing, radius } from './spacing';
import { typography } from './typography';

// Criação de temas
export const darkTheme = {
  colors: darkColors,
  spacing,
  radius,
  typography,
};

export const lightTheme = {
  colors: lightColors,
  spacing,
  radius,
  typography,
};

// Hook para usar o tema
import { useAppSelector } from '../hooks/useAppSelector';
import { selectTheme } from '../store/selectors';

export const useTheme = () => {
  const themeType = useAppSelector(selectTheme);
  return themeType === 'dark' ? darkTheme : lightTheme;
};

export default {
  dark: darkTheme,
  light: lightTheme,
};