// src/components/opening/useOpeningTimeline.ts
// Orquestra a abertura: um "relógio" (shared value `clock`, 0 a
// CLOCK_DURATION_MS) dirige toda a coreografia visual via worklets
// (ProgressiveSymbol/WordmarkDrop leem `clock.value` e derivam seus próprios
// estilos — porta direta da função `seek(t)` do protótipo aprovado).
//
// A DECISÃO DE SAÍDA (`onFinish`) é deliberadamente JS, não worklet: só
// setTimeout no thread JS, reagindo à prop `isReady` — mesma convenção já
// documentada no AppOpening.tsx anterior ("nunca por callback de worklet de
// withTiming — mantém a conclusão determinística e testável independente de
// reanimated realmente animar"). `isReady` é um valor de React que muda de
// fora (fontes + sessão resolvidas); não há como um worklet observar isso
// sem ele próprio virar uma ponte JS->UI->JS mais frágil que um timer.
//
// `onFinish` e os hápticos são despachados via `runOnJS` (mesmo já rodando
// no thread JS) — chamada seguramente idempotente nesse contexto, e é o que
// a spec pede para qualquer callback que cruza a fronteira do Reanimated.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  ABSOLUTE_CEILING_MS,
  CLOCK_DURATION_MS,
  IMPACT_HAPTIC_DELAY_MS,
  LAST_LETTER_HAPTIC_DELAY_MS,
  PULSE_OPACITY_MAX,
  PULSE_OPACITY_MIN,
  PULSE_PERIOD_MS,
  PULSE_START_MS,
  READY_EXIT_MS,
} from './timeline';

type UseOpeningTimelineArgs = {
  isReady: boolean;
  reduceMotion: boolean;
  onFinish: () => void;
};

type UseOpeningTimelineResult = {
  clock: SharedValue<number>;
  topPulseOpacity: SharedValue<number>;
  /** Toque: finaliza imediatamente SE o app já estiver pronto. */
  skip: () => void;
};

// Falha do vibrador nunca pode interromper a abertura — acessório, catch
// silencioso. Web não tem expo-haptics utilizável (Platform.OS === 'web').
const triggerHaptic = (style: Haptics.ImpactFeedbackStyle) => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => {});
};

export const useOpeningTimeline = ({
  isReady,
  reduceMotion,
  onFinish,
}: UseOpeningTimelineArgs): UseOpeningTimelineResult => {
  const clock = useSharedValue(0);
  const topPulseOpacity = useSharedValue(PULSE_OPACITY_MAX);

  const hasFinishedRef = useRef(false);
  const isReadyRef = useRef(isReady);
  const mountTimeRef = useRef(Date.now());
  const pulsingRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactHapticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLetterHapticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    [
      readyTimeoutRef,
      ceilingTimeoutRef,
      pulseStartTimeoutRef,
      impactHapticTimeoutRef,
      lastLetterHapticTimeoutRef,
    ].forEach((ref) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = null;
    });
  };

  const stopPulse = () => {
    if (pulseStartTimeoutRef.current) {
      clearTimeout(pulseStartTimeoutRef.current);
      pulseStartTimeoutRef.current = null;
    }
    if (!pulsingRef.current) return;
    pulsingRef.current = false;
    cancelAnimation(topPulseOpacity);
    topPulseOpacity.value = withTiming(PULSE_OPACITY_MAX, { duration: 0 });
  };

  const finish = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    clearAllTimers();
    stopPulse();
    runOnJS(onFinishRef.current)();
  };

  // Pronto e ainda dentro da sustentação (< 1700ms): espera até 1700ms.
  // Pronto e já passou de 1700ms (chegou tarde): finaliza logo em seguida,
  // sem esperar um novo marco de 1700ms. Reduce-motion nunca espera —
  // finaliza assim que pronto, "estado final estático" sem sustentação.
  const scheduleFinish = () => {
    if (hasFinishedRef.current || !isReadyRef.current) return;
    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    if (reduceMotion) {
      finish();
      return;
    }
    const elapsed = Date.now() - mountTimeRef.current;
    if (elapsed >= READY_EXIT_MS) {
      finish();
      return;
    }
    readyTimeoutRef.current = setTimeout(finish, READY_EXIT_MS - elapsed);
  };

  const startPulse = () => {
    if (hasFinishedRef.current || isReadyRef.current || pulsingRef.current) return;
    pulsingRef.current = true;
    topPulseOpacity.value = withRepeat(
      withSequence(
        withTiming(PULSE_OPACITY_MIN, {
          duration: PULSE_PERIOD_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(PULSE_OPACITY_MAX, {
          duration: PULSE_PERIOD_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
  };

  // Arma (ou reativa) o pulso de espera de forma correta em relação ao
  // tempo já decorrido — usado tanto no mount quanto quando isReady regride
  // de volta a false (achado MÉDIO do review adversarial do PR #81: sem
  // isto, o timer original de pulso já tinha sido cancelado por
  // `stopPulse()` na ida a `isReady=true`, e uma regressão posterior nunca
  // re-agendava o pulso).
  const armPulseTimer = () => {
    if (hasFinishedRef.current || isReadyRef.current || reduceMotion) return;
    if (pulseStartTimeoutRef.current || pulsingRef.current) return;
    const elapsed = Date.now() - mountTimeRef.current;
    if (elapsed >= PULSE_START_MS) {
      startPulse();
      return;
    }
    pulseStartTimeoutRef.current = setTimeout(startPulse, PULSE_START_MS - elapsed);
  };

  useEffect(() => {
    isReadyRef.current = isReady;
    if (isReady) {
      stopPulse();
      scheduleFinish();
    } else if (!hasFinishedRef.current) {
      // isReady regrediu (ex.: AuthContext volta a `loading` num
      // TOKEN_REFRESHED/USER_UPDATED do boot frio — achado MÉDIO do review
      // adversarial do PR #81): cancela a saída já armada por
      // `scheduleFinish` na ida anterior a isReady=true — senão `finish()`
      // dispararia sozinho no marco de 1700ms mesmo com o app não pronto de
      // novo, revelando o spinner de RootNavigator atrás de uma abertura já
      // finalizada — e volta ao estado de espera (pulso).
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      armPulseTimer();
    }
    // scheduleFinish/stopPulse/armPulseTimer leem refs sempre atuais — não
    // precisam entrar nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  useEffect(() => {
    if (reduceMotion) {
      // Estado final estático: relógio já no fim, sem animação, sem pulso.
      clock.value = CLOCK_DURATION_MS;
    } else {
      clock.value = withTiming(CLOCK_DURATION_MS, {
        duration: CLOCK_DURATION_MS,
        easing: Easing.linear,
      });
      armPulseTimer();
      impactHapticTimeoutRef.current = setTimeout(() => {
        runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Medium);
      }, IMPACT_HAPTIC_DELAY_MS);
      lastLetterHapticTimeoutRef.current = setTimeout(() => {
        runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Heavy);
      }, LAST_LETTER_HAPTIC_DELAY_MS);
    }

    scheduleFinish();
    // Teto absoluto: sai mesmo que o app nunca fique pronto. Só arma se
    // ainda não terminamos — reduce-motion+isReady já finaliza
    // sincronamente logo acima (via scheduleFinish), e armar um setTimeout
    // depois disso deixaria um timer pendurado por até 6s à toa (achado
    // BAIXO do review adversarial do PR #81).
    if (!hasFinishedRef.current) {
      ceilingTimeoutRef.current = setTimeout(finish, ABSOLUTE_CEILING_MS);
    }

    return () => clearAllTimers();
    // Roda uma única vez, no mount — mesma convenção do AppOpening.tsx
    // anterior (reduceMotion não muda no meio da abertura, nesse escopo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (hasFinishedRef.current) return;
    if (isReadyRef.current) {
      finish();
    }
    // Se ainda não está pronto, o toque não pode adiantar uma tela que não
    // existe — só finaliza quando isReady chegar (efeito acima cuida disso).
  };

  return { clock, topPulseOpacity, skip };
};

export default useOpeningTimeline;
