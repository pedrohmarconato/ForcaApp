// src/components/AppOpening.tsx
// Fase 3: abertura animada de cold start (~2,3s total). Overlay que cobre a
// tela inteira, monta por cima do navigator sem atrasar o TTI (o app já
// está montado atrás dele) e se retira sozinho — por fim da animação, por
// toque, ou de imediato quando o sistema pede reduce-motion.
//
// Duração deliberadamente fora da escala de `theme.animation` (que limita
// motion de interação recorrente a 420ms — ver src/theme/theme.ts): esta é
// uma sequência única de cold start, não resposta a interação.
//
// `onFinish` é decidido por um setTimeout no thread JS, não pelo callback do
// worklet de `withTiming` — mantém a conclusão determinística e testável
// independente de reanimated realmente animar (ex.: em ambiente de teste).
//
// Import proibido aqui: AuthContext e supabaseClient. A cor neon vem de
// useTheme() (default amarelo pré-login) — mesma regra que protege
// src/theme/ no sentinela __tests__/themeModuleGraphSentinel.test.ts.
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ForcaMark } from './ui/Logo';
import { useTheme } from '../theme/ThemeProvider';

const ENTRY_DURATION_MS = 600;
const HOLD_DURATION_MS = 1300;
const EXIT_DURATION_MS = 400;
const TOTAL_DURATION_MS = ENTRY_DURATION_MS + HOLD_DURATION_MS + EXIT_DURATION_MS;

const GLOW_PULSE_MS = 900;
const GLOW_BASE_OPACITY = 0.35;
const GLOW_PEAK_OPACITY = 0.8;
const GLOW_SIZE = 220;
const MARK_INITIAL_SCALE = 0.85;
const MARK_SIZE = 96;

type AppOpeningProps = {
  /** Chamado exatamente uma vez: fim da animação, toque, ou reduce-motion. */
  onFinish: () => void;
};

/** Abertura animada de cold start — ver cabeçalho do arquivo. */
export const AppOpening = ({ onFinish }: AppOpeningProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  const hasFinishedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overlayOpacity = useSharedValue(1);
  const markOpacity = useSharedValue(0);
  const markScale = useSharedValue(MARK_INITIAL_SCALE);
  const glowOpacity = useSharedValue(GLOW_BASE_OPACITY);

  const finish = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onFinish();
  };

  useEffect(() => {
    if (reduceMotion) {
      finish();
      return undefined;
    }

    markOpacity.value = withTiming(1, {
      duration: ENTRY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    markScale.value = withTiming(1, {
      duration: ENTRY_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    // Pulso do halo: sobe até o pico e volta sozinho (withRepeat com
    // reverse=true), num loop indefinido enquanto o overlay estiver montado.
    glowOpacity.value = withRepeat(
      withTiming(GLOW_PEAK_OPACITY, {
        duration: GLOW_PULSE_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
    overlayOpacity.value = withDelay(
      TOTAL_DURATION_MS - EXIT_DURATION_MS,
      withTiming(0, { duration: EXIT_DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );

    timeoutRef.current = setTimeout(finish, TOTAL_DURATION_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // Roda uma única vez, no mount — reduceMotion/finish não devem reiniciar
    // a sequência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  // Acima do zIndex mais alto do design system (toast — ver src/theme/theme.ts):
  // a abertura tem de cobrir absolutamente tudo, inclusive banners, enquanto
  // estiver montada.
  const overlayZIndex = theme.zIndex.toast + 1;

  return (
    <Animated.View
      style={[
        styles.overlay,
        { backgroundColor: theme.colors.surface.canvas, zIndex: overlayZIndex, elevation: overlayZIndex },
        overlayStyle,
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel="Pular abertura"
      >
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.glow,
              { backgroundColor: theme.colors.accent.main, shadowColor: theme.colors.accent.main },
              glowStyle,
            ]}
          />
          <Animated.View style={markStyle}>
            <ForcaMark size={MARK_SIZE} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 60,
    shadowOpacity: 1,
  },
});

export default AppOpening;
