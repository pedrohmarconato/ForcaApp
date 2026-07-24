// src/utils/motion.ts
// Constrói os Easing do React Native a partir dos parâmetros puros do tema.
// O tema guarda só números (portável p/ web headless e prototipagem); aqui
// vira função de easing de verdade, uma única vez.

import { Easing } from 'react-native';

import theme from '../theme/theme';

const bezierOf = (c: { x1: number; y1: number; x2: number; y2: number }) =>
  Easing.bezier(c.x1, c.y1, c.x2, c.y2);

/** Entradas e resposta ao toque. */
export const easeImpulso = bezierOf(theme.animation.easings.impulso);

/** Transições deliberadas, barras, count-ups. */
export const easeControle = bezierOf(theme.animation.easings.controle);

/** Timers — sem aceleração. */
export const easeDescanso = Easing.linear;

/** Delay de cascata limitado pela direção (máx. 6 itens animam). */
export const staggerDelay = (index: number): number =>
  Math.min(index, theme.animation.stagger.maxItems - 1) * theme.animation.stagger.delayMs;
