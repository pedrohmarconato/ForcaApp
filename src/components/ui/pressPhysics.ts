// src/components/ui/pressPhysics.ts
// A física de toque da Direção 03: todo controle encolhe para 97% (opacidade
// 85%) em 120ms na curva impulso e volta em 150ms. Um único hook para Button,
// chips, dias, linhas e cards — mesma sensação em todo o app.
//
// Usa o Animated clássico (native driver) de propósito: transform/opacity não
// precisam de worklet, e o mock de teste do jest-expo cobre este caminho sem
// configuração extra.

import { useMemo, useRef } from 'react';
import { Animated } from 'react-native';

import theme from '../../theme/theme';
import { easeImpulso } from '../../utils/motion';
import { tapLight } from '../../utils/haptics';

type PressPhysicsOptions = {
  /** Escala pressionada — controles pequenos podem afundar mais (ex.: 0.94). */
  scale?: number;
  /** Dispara o toque tátil leve no press-in (ações primárias/seleções). */
  haptic?: boolean;
  disabled?: boolean;
};

export const usePressPhysics = ({
  scale = theme.animation.press.scale,
  haptic = false,
  disabled = false,
}: PressPhysicsOptions = {}) => {
  const pressed = useRef(new Animated.Value(0)).current;

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pressed.interpolate({
            inputRange: [0, 1],
            outputRange: [1, scale],
          }),
        },
      ],
      opacity: pressed.interpolate({
        inputRange: [0, 1],
        outputRange: [1, theme.animation.press.opacity],
      }),
    }),
    [pressed, scale],
  );

  const animateTo = (value: number, duration: number) =>
    Animated.timing(pressed, {
      toValue: value,
      duration,
      easing: easeImpulso,
      useNativeDriver: true,
    }).start();

  const onPressIn = () => {
    if (disabled) return;
    if (haptic) tapLight();
    animateTo(1, theme.animation.press.inMs);
  };

  const onPressOut = () => {
    animateTo(0, theme.animation.press.outMs);
  };

  return { animatedStyle, onPressIn, onPressOut };
};
