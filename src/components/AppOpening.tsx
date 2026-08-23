// src/components/AppOpening.tsx
// Abertura animada de cold start (~1,8s total) — coreografia "assinatura de
// marca". Overlay full-screen que monta por cima do navigator sem atrasar o
// TTI (o app já está montado atrás dele) e se retira sozinho — fim da
// animação, toque, ou de imediato quando o sistema pede reduce-motion.
//
// Coreografia: 0–600ms cascata dos 3 módulos (opacity+translateY, leve
// overshoot); 600–850ms o módulo do topo cruza de branco pra accent.main com
// um bloom radial atrás dele (some até 1100ms); 700–1200ms o wordmark
// "FORÇA" aparece com letterSpacing fechando; 1500–1800ms símbolo+wordmark
// escalam sutilmente enquanto o overlay inteiro esmaece.
//
// Duração deliberadamente fora da escala de `theme.animation` (limite de
// 420ms para motion de interação recorrente — ver src/theme/theme.ts): esta
// é sequência única de cold start, não resposta a interação.
//
// `onFinish` e o háptico de ignição (~600ms) são decididos por setTimeout no
// thread JS, nunca por callback de worklet de `withTiming` — mantém a
// conclusão determinística e testável independente de reanimated realmente
// animar (ex.: em ambiente de teste). Ambos são cancelados no finish/unmount.
//
// Import proibido aqui: AuthContext e supabaseClient. A cor neon vem de
// useTheme() (default amarelo pré-login) — mesma regra que protege
// src/theme/ no sentinela __tests__/themeModuleGraphSentinel.test.ts.
import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { FORCA_MARK_MODULE_PATHS } from './ui/Logo';
import { useTheme } from '../theme/ThemeProvider';

// --- 1) Marca se monta: cascata dos 3 módulos --------------------------
const MODULE_BASE_DELAY_MS = 0;
const MODULE_MID_DELAY_MS = 120;
const MODULE_TOP_DELAY_MS = 240;
const MODULE_ENTRY_DURATION_MS = 360;
const MODULE_TRANSLATE_Y_START = 12;
const MODULE_OVERSHOOT_FACTOR = 1.2; // leve overshoot na entrada

// --- 2) Neon acende: crossfade do módulo do topo + bloom atrás dele ----
// Início = fim da entrada do módulo do topo (240 + 360 = 600ms), o que
// mantém a ignição sempre colada ao fim da cascata mesmo se os tempos acima
// mudarem.
const IGNITION_START_MS = MODULE_TOP_DELAY_MS + MODULE_ENTRY_DURATION_MS;
const IGNITION_DURATION_MS = 250; // 600 → 850ms

const BLOOM_START_MS = IGNITION_START_MS; // 600ms
const BLOOM_RISE_MS = 250; // 600 → 850ms, opacidade sobe ao pico
const BLOOM_FALL_MS = 250; // 850 → 1100ms, opacidade desce a zero
const BLOOM_DURATION_MS = BLOOM_RISE_MS + BLOOM_FALL_MS;
const BLOOM_PEAK_OPACITY = 0.5;
const BLOOM_SCALE_START = 0.6;
const BLOOM_SCALE_END = 1.4;
const BLOOM_SIZE = 220;
const BLOOM_GRADIENT_ID = 'app-opening-bloom';

// --- 3) Wordmark "FORÇA" -------------------------------------------------
const WORDMARK_START_MS = 700;
const WORDMARK_DURATION_MS = 500; // 700 → 1200ms
const WORDMARK_LETTER_SPACING_START = 8;
const WORDMARK_LETTER_SPACING_END = 2;

// --- 4) Saída: escala sutil + fade do overlay inteiro -------------------
const EXIT_DURATION_MS = 300;
const EXIT_SCALE_END = 1.045;

export const TOTAL_DURATION_MS = 1800;
const EXIT_START_MS = TOTAL_DURATION_MS - EXIT_DURATION_MS; // 1500ms

// Háptico de ignição — acompanha o instante em que o neon acende.
const HAPTIC_DELAY_MS = IGNITION_START_MS;

const MARK_SIZE = 96;
const MARK_VIEWBOX = `0 0 ${MARK_SIZE} ${MARK_SIZE}`;
// Offset que centraliza o bloom (maior) atrás do símbolo (menor), derivado
// dos dois tamanhos acima — nunca um valor solto.
const BLOOM_OFFSET = (MARK_SIZE - BLOOM_SIZE) / 2;

type AppOpeningProps = {
  /** Chamado exatamente uma vez: fim da animação, toque, ou reduce-motion. */
  onFinish: () => void;
};

type ModuleLayerProps = {
  path: string;
  fill: string;
  opacity: SharedValue<number>;
  translateY: SharedValue<number>;
};

/** Um módulo do símbolo, isolado em camada própria para animar sozinho. */
const ModuleLayer = ({ path, fill, opacity, translateY }: ModuleLayerProps) => {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  return (
    <Animated.View style={[styles.moduleLayer, style]}>
      <Svg width={MARK_SIZE} height={MARK_SIZE} viewBox={MARK_VIEWBOX}>
        <Path d={path} fill={fill} />
      </Svg>
    </Animated.View>
  );
};

type BloomProps = {
  opacity: SharedValue<number>;
  scale: SharedValue<number>;
  color: string;
};

/** Bloom radial atrás do símbolo — substitui o halo de sombra antigo. */
const Bloom = ({ opacity, scale, color }: BloomProps) => {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.bloom, style]}>
      <Svg
        width={BLOOM_SIZE}
        height={BLOOM_SIZE}
        viewBox={`0 0 ${BLOOM_SIZE} ${BLOOM_SIZE}`}
      >
        <Defs>
          <RadialGradient id={BLOOM_GRADIENT_ID} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={BLOOM_SIZE / 2}
          cy={BLOOM_SIZE / 2}
          r={BLOOM_SIZE / 2}
          fill={`url(#${BLOOM_GRADIENT_ID})`}
        />
      </Svg>
    </Animated.View>
  );
};

/** Abertura animada de cold start — ver cabeçalho do arquivo. */
export const AppOpening = ({ onFinish }: AppOpeningProps) => {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  const hasFinishedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overlayOpacity = useSharedValue(1);
  const contentScale = useSharedValue(1);

  const baseOpacity = useSharedValue(0);
  const baseTranslateY = useSharedValue(MODULE_TRANSLATE_Y_START);
  const midOpacity = useSharedValue(0);
  const midTranslateY = useSharedValue(MODULE_TRANSLATE_Y_START);
  const topTranslateY = useSharedValue(MODULE_TRANSLATE_Y_START);
  const topWhiteOpacity = useSharedValue(0);
  const topNeonOpacity = useSharedValue(0);

  const bloomOpacity = useSharedValue(0);
  const bloomScale = useSharedValue(BLOOM_SCALE_START);

  const wordmarkOpacity = useSharedValue(0);
  const wordmarkLetterSpacing = useSharedValue(WORDMARK_LETTER_SPACING_START);

  const finish = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (hapticTimeoutRef.current) clearTimeout(hapticTimeoutRef.current);
    onFinish();
  };

  useEffect(() => {
    if (reduceMotion) {
      finish();
      return undefined;
    }

    const entryEasing = Easing.out(Easing.back(MODULE_OVERSHOOT_FACTOR));
    const settleEasing = Easing.out(Easing.cubic);

    // `enter()` (overshoot espacial via back-easing) é exclusivo de
    // translateY — é o "assentamento" físico da entrada. Opacidade NUNCA usa
    // back-easing: aplicado a opacity, o overshoot ultrapassa 1.0
    // transitoriamente (visualmente errado — opacidade não tem "além do
    // total"). Toda opacidade, inclusive a da entrada em cascata, usa
    // `settle()` (cubic-out).
    const enter = (duration: number) => ({ duration, easing: entryEasing });
    const settle = (duration: number) => ({ duration, easing: settleEasing });
    baseOpacity.value = withDelay(MODULE_BASE_DELAY_MS, withTiming(1, settle(MODULE_ENTRY_DURATION_MS)));
    baseTranslateY.value = withDelay(MODULE_BASE_DELAY_MS, withTiming(0, enter(MODULE_ENTRY_DURATION_MS)));
    midOpacity.value = withDelay(MODULE_MID_DELAY_MS, withTiming(1, settle(MODULE_ENTRY_DURATION_MS)));
    midTranslateY.value = withDelay(MODULE_MID_DELAY_MS, withTiming(0, enter(MODULE_ENTRY_DURATION_MS)));
    topTranslateY.value = withDelay(MODULE_TOP_DELAY_MS, withTiming(0, enter(MODULE_ENTRY_DURATION_MS)));
    // Módulo do topo: crossfade branco→neon na janela de ignição
    // (IGNITION_START_MS → +IGNITION_DURATION_MS). A camada neon fica POR
    // BAIXO da branca (ver ordem de render abaixo) e precisa estar 100%
    // opaca ANTES do fade do branco começar — por isso ela não anima
    // gradualmente: salta pra opacidade 1 com duration:0 exatamente em
    // IGNITION_START_MS. Nesse instante o branco (por cima, ainda opaco)
    // cobre tudo, então o salto é invisível. Só o branco de fato anima:
    // entra em cascata (0→1) e, sem reiniciar, funde direto pra fora (1→0)
    // na janela da ignição.
    // Restrição que essa ordem existe pra evitar: se os dois alphas
    // animassem empilhados (neon 0→1 por cima, branco 1→0 por baixo — como
    // era antes), a composição no meio da transição vazava o fundo preto:
    // 0,5·neon + 0,25·branco + 0,25·fundo, em vez do crossfade linear limpo
    // w·branco + (1−w)·neon que esta ordem garante.
    topWhiteOpacity.value = withSequence(
      withDelay(MODULE_TOP_DELAY_MS, withTiming(1, settle(MODULE_ENTRY_DURATION_MS))),
      withTiming(0, settle(IGNITION_DURATION_MS)),
    );
    topNeonOpacity.value = withDelay(IGNITION_START_MS, withTiming(1, { duration: 0 }));

    bloomOpacity.value = withDelay(
      BLOOM_START_MS,
      withSequence(
        withTiming(BLOOM_PEAK_OPACITY, settle(BLOOM_RISE_MS)),
        withTiming(0, { duration: BLOOM_FALL_MS, easing: Easing.in(Easing.cubic) }),
      ),
    );
    bloomScale.value = withDelay(BLOOM_START_MS, withTiming(BLOOM_SCALE_END, settle(BLOOM_DURATION_MS)));

    wordmarkOpacity.value = withDelay(WORDMARK_START_MS, withTiming(1, settle(WORDMARK_DURATION_MS)));
    wordmarkLetterSpacing.value = withDelay(
      WORDMARK_START_MS,
      withTiming(WORDMARK_LETTER_SPACING_END, settle(WORDMARK_DURATION_MS)),
    );

    contentScale.value = withDelay(EXIT_START_MS, withTiming(EXIT_SCALE_END, settle(EXIT_DURATION_MS)));
    overlayOpacity.value = withDelay(EXIT_START_MS, withTiming(0, settle(EXIT_DURATION_MS)));

    timeoutRef.current = setTimeout(finish, TOTAL_DURATION_MS);

    // Háptico de ignição: só nativo (expo-haptics não existe no web) e só com
    // motion ativo — reduce-motion já retornou acima antes de chegar aqui.
    // Falha do vibrador nunca pode interromper a abertura: é acessório, por
    // isso o catch silencioso.
    if (Platform.OS !== 'web') {
      hapticTimeoutRef.current = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      }, HAPTIC_DELAY_MS);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hapticTimeoutRef.current) clearTimeout(hapticTimeoutRef.current);
    };
    // Roda uma única vez, no mount — reduceMotion/finish não devem reiniciar
    // a sequência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    letterSpacing: wordmarkLetterSpacing.value,
  }));

  // Acima do zIndex mais alto do design system (toast — ver src/theme/theme.ts):
  // a abertura tem de cobrir absolutamente tudo, inclusive banners, enquanto
  // estiver montada.
  const overlayZIndex = theme.zIndex.toast + 1;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: theme.colors.surface.canvas,
          zIndex: overlayZIndex,
          elevation: overlayZIndex,
        },
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
          <Animated.View style={[styles.content, contentStyle]}>
            <View style={styles.markStage}>
              <Bloom
                opacity={bloomOpacity}
                scale={bloomScale}
                color={theme.colors.accent.main}
              />
              <View style={styles.mark}>
                <ModuleLayer
                  path={FORCA_MARK_MODULE_PATHS.base}
                  fill={theme.colors.text.primary}
                  opacity={baseOpacity}
                  translateY={baseTranslateY}
                />
                <ModuleLayer
                  path={FORCA_MARK_MODULE_PATHS.mid}
                  fill={theme.colors.text.primary}
                  opacity={midOpacity}
                  translateY={midTranslateY}
                />
                {/* Neon primeiro (por baixo): precisa estar opaco antes do
                    branco começar a sumir — ver comentário da ignição
                    acima. Branco por cima é o que de fato dissolve. */}
                <ModuleLayer
                  path={FORCA_MARK_MODULE_PATHS.top}
                  fill={theme.colors.accent.main}
                  opacity={topNeonOpacity}
                  translateY={topTranslateY}
                />
                <ModuleLayer
                  path={FORCA_MARK_MODULE_PATHS.top}
                  fill={theme.colors.text.primary}
                  opacity={topWhiteOpacity}
                  translateY={topTranslateY}
                />
              </View>
            </View>
            <Animated.Text
              style={[
                styles.wordmark,
                {
                  fontFamily: theme.fonts.display,
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSizes.hero,
                  marginTop: theme.spacing.sm,
                },
                wordmarkStyle,
              ]}
            >
              FORÇA
            </Animated.Text>
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
  content: {
    alignItems: 'center',
  },
  markStage: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  bloom: {
    position: 'absolute',
    width: BLOOM_SIZE,
    height: BLOOM_SIZE,
    left: BLOOM_OFFSET,
    top: BLOOM_OFFSET,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
  moduleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  wordmark: {
    textAlign: 'center',
  },
});

export default AppOpening;
