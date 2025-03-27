// Definição das cores base
const palette = {
    black: '#000000',
    darkGray: '#0A0A0A',
    gray: '#1A1A1A',
    lightGray: '#282c34',
    white: '#ffffff',
    yellow: '#EBFF00',
    blue: '#61dafb',
    green: '#22c55e',
    red: '#ef4444',
    orange: '#f97316',
    purple: '#a855f7',
  };
  
  // Tema escuro (padrão da aplicação)
  export const darkColors = {
    background: {
      primary: palette.darkGray,
      secondary: palette.gray,
      card: 'rgba(0, 0, 0, 0.4)',
      modal: 'rgba(0, 0, 0, 0.8)',
    },
    text: {
      primary: palette.white,
      secondary: 'rgba(255, 255, 255, 0.8)',
      tertiary: 'rgba(255, 255, 255, 0.6)',
      disabled: 'rgba(255, 255, 255, 0.4)',
      inverse: palette.black,
    },
    border: {
      primary: 'rgba(255, 255, 255, 0.1)',
      active: 'rgba(255, 255, 255, 0.3)',
    },
    button: {
      primary: palette.yellow,
      secondary: 'rgba(255, 255, 255, 0.1)',
      disabled: 'rgba(255, 255, 255, 0.2)',
    },
    icon: {
      primary: palette.yellow,
      secondary: 'rgba(255, 255, 255, 0.7)',
      inactive: 'rgba(255, 255, 255, 0.4)',
    },
    status: {
      success: palette.green,
      error: palette.red,
      warning: palette.orange,
      info: palette.blue,
    },
    training: {
      completed: palette.green,
      partial: palette.orange,
      missed: palette.red,
      scheduled: palette.blue,
    },
  };
  
  // Tema claro (opcional para o futuro)
  export const lightColors = {
    background: {
      primary: '#f5f5f5',
      secondary: palette.white,
      card: 'rgba(255, 255, 255, 0.9)',
      modal: 'rgba(255, 255, 255, 0.95)',
    },
    text: {
      primary: palette.black,
      secondary: 'rgba(0, 0, 0, 0.8)',
      tertiary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.4)',
      inverse: palette.white,
    },
    border: {
      primary: 'rgba(0, 0, 0, 0.1)',
      active: 'rgba(0, 0, 0, 0.3)',
    },
    button: {
      primary: palette.yellow,
      secondary: 'rgba(0, 0, 0, 0.05)',
      disabled: 'rgba(0, 0, 0, 0.1)',
    },
    icon: {
      primary: palette.darkGray,
      secondary: 'rgba(0, 0, 0, 0.7)',
      inactive: 'rgba(0, 0, 0, 0.4)',
    },
    status: {
      success: palette.green,
      error: palette.red,
      warning: palette.orange,
      info: palette.blue,
    },
    training: {
      completed: palette.green,
      partial: palette.orange,
      missed: palette.red,
      scheduled: palette.blue,
    },
  };
  
  export default { darkColors, lightColors };