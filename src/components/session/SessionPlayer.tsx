// src/components/session/SessionPlayer.tsx
// Redesign da sessão (22/07/2026, direção do dono): "modo player" — UM card
// dominante que mostra só o que importa AGORA, em quatro estados:
//   measuring → série ativa: medição com números grandes + fôlego em chips;
//   resting   → descanso pós-série: timer GRANDE + o que vem a seguir;
//   ready     → próxima série pendente com um único botão Iniciar;
//   all_done  → tudo registrado, aponta para Concluir treino.
// Os contratos do store não mudam (activateSet/setReps/setLoad/stepLoad/
// setRir/completeSet) — só a apresentação. RIR vira "Quantas ainda
// aguentaria?" (0–4+), opcional, sem jargão.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import {
  canCompleteSet,
  exerciseIdentity,
  formatDistance,
  formatDuration,
  formatPace,
  findActiveSet,
  findNextPendingSet,
  isTimeBased,
  metricOf,
  resolveInheritedSet,
  type SessionDraft,
  type DraftExercise,
  type DraftSet,
  type PerceivedEffort,
  type SetRef,
  paceSecondsPerKm,
} from '../../engine/sessionModel';
import {
  exercicioConcluido,
  posicaoDoExercicio,
} from '../../engine/sessionFlow';
import { easeImpulso } from '../../utils/motion';
import {
  FIELD_FLEX,
  LOAD_INPUT_STYLE,
  REPS_INPUT_STYLE,
  idDoExercicioNoCard,
} from './sessionPlayerLayout';
import { tapLight } from '../../utils/haptics';
import { useActiveSessionStore } from '../../store/activeSessionStore';

// Anel do descanso: círculo de r=80 num viewBox de 176 — o traço neon drena
// conforme o tempo passa (descanso se esgota, não se acumula).
const RING_R = 80;
const RING_C = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const parseIntOrNull = (t: string): number | null => {
  const only = t.replace(/[^0-9]/g, '');
  if (only === '') return null;
  return parseInt(only, 10);
};
const parseFloatOrNull = (t: string): number | null => {
  const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
  if (norm === '' || norm === '.') return null;
  const v = parseFloat(norm);
  return Number.isFinite(v) ? v : null;
};

const formatarTempo = (s: number): string => {
  const absoluto = Math.max(0, Math.round(Math.abs(s)));
  const m = Math.floor(absoluto / 60);
  const seg = absoluto % 60;
  return `${m}:${String(seg).padStart(2, '0')}`;
};

export const repsAlvo = (set: DraftSet): string =>
  set.targetRepsMin === set.targetRepsMax
    ? `${set.targetRepsMin}`
    : `${set.targetRepsMin}–${set.targetRepsMax}`;

/**
 * Alvo da série em texto, ciente da métrica. Cardio nunca mostra "reps": o
 * plano prescreve tempo (e distância), e é isso que o aluno lê.
 */
export const alvoDaSerie = (exercise: DraftExercise, set: DraftSet): string => {
  if (!isTimeBased(metricOf(exercise))) return `${repsAlvo(set)} REPS`;
  const partes: string[] = [];
  if (set.targetDurationSeconds)
    partes.push(formatDuration(set.targetDurationSeconds));
  if (set.targetDistanceM) partes.push(formatDistance(set.targetDistanceM));
  return partes.length > 0 ? partes.join(' · ') : 'LIVRE';
};

const ESFORCO_CHOICES: { valor: PerceivedEffort; rotulo: string }[] = [
  { valor: 'leve', rotulo: 'Leve' },
  { valor: 'moderado', rotulo: 'Moderado' },
  { valor: 'forte', rotulo: 'Forte' },
];

const RIR_CHOICES = [0, 1, 2, 3, 4] as const;

type RestState = {
  next: SetRef | null;
  /** O exercício que acabou de ser registrado fechou por completo? */
  fechouExercicio: boolean;
  /** Nome do exercício que ficou para trás — só quando ele fechou. */
  nomeConcluido: string | null;
} | null;

type Props = {
  draft: SessionDraft;
  suggestedLoadFor: (exercise: DraftExercise, set: DraftSet) => number | null;
  suggestedRepsFor: (exercise: DraftExercise, set: DraftSet) => number | null;
};

const SessionPlayer = ({ draft, suggestedLoadFor, suggestedRepsFor }: Props) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const activateSet = useActiveSessionStore((s) => s.activateSet);
  const setLoad = useActiveSessionStore((s) => s.setLoad);
  const stepLoad = useActiveSessionStore((s) => s.stepLoad);
  const stepReps = useActiveSessionStore((s) => s.stepReps);
  const setRir = useActiveSessionStore((s) => s.setRir);
  const setDuration = useActiveSessionStore((s) => s.setDuration);
  const setDistance = useActiveSessionStore((s) => s.setDistance);
  const setEffort = useActiveSessionStore((s) => s.setEffort);
  const completeSet = useActiveSessionStore((s) => s.completeSet);
  const adjustRestInStore = useActiveSessionStore((s) => s.adjustRest);
  const lastAutoDecision = useActiveSessionStore((s) => s.lastAutoDecision);
  const autoNote =
    lastAutoDecision && lastAutoDecision.sessionLogId === draft.sessionLogId
      ? lastAutoDecision.reason
      : null;

  const [saving, setSaving] = useState(false);
  // Texto CRU dos campos decimais enquanto o aluno digita. Sem isto, o valor
  // reformatado a cada tecla engole o separador: "3." vira "3" e o "2"
  // seguinte produz "32" — era impossível digitar 3,2 km ou 42,5 kg.
  const [textoCarga, setTextoCarga] = useState<string | null>(null);
  const [textoDistancia, setTextoDistancia] = useState<string | null>(null);
  const [rest, setRest] = useState<RestState>(null);
  // Total corrente do descanso (cresce com +30s) — denominador do anel.
  const [restTotal, setRestTotal] = useState(0);
  const restTotalSecondsRef = useRef(0);
  const [, setRestTick] = useState(0);
  // Anel: drena continuamente — a cada segundo anima até a fração seguinte.
  const ringAnim = useRef(new Animated.Value(1)).current;

  const active = findActiveSet(draft);
  const next = findNextPendingSet(draft);
  // D-06: quando não há série ativa, uma série `next` cujo pré-preenchimento
  // (histórico/alvo, D-17) já passa em canCompleteSet() revela o card de
  // medição direto — sem depender de `active`, que a Fase 15 já registrou
  // como estado de UI puramente local (não sobrevive à retomada).
  const readyToMeasure =
    active ??
    (next &&
    canCompleteSet(
      {
        ...next.set,
        ...resolveInheritedSet(
          next.set,
          next.exercise,
          draft.lastRepsByExercise[exerciseIdentity(next.exercise)],
          draft.lastLoadByExercise[exerciseIdentity(next.exercise)],
        ),
      },
      next.exercise.isBodyweight,
      metricOf(next.exercise),
    )
      ? next
      : null);
  const restEndsAtMs = draft.restEndsAt
    ? new Date(draft.restEndsAt).getTime()
    : Number.NaN;
  const restRemainingDisplay = Number.isFinite(restEndsAtMs)
    ? Math.round((restEndsAtMs - Date.now()) / 1000)
    : 0;
  const emDescanso = Number.isFinite(restEndsAtMs) && !active;
  // Tempo extra: a contagem já venceu (restRemainingDisplay negativo — o
  // mesmo sinal que já acende o prefixo "+" no relógio, linhas 457-459). A
  // partir daqui a ação de avançar vira o CTA primário, porque "Pular
  // descanso" não é lido como "seguir para a próxima série" (relato real).
  const emTempoExtra = emDescanso && restRemainingDisplay < 0;
  const proximaDoDescanso = rest?.next ?? next;
  const descanso = rest ?? {
    next: proximaDoDescanso,
    fechouExercicio: false,
    nomeConcluido: null,
  };

  // O timestamp do store é a fonte de verdade; este intervalo só força a
  // repintura cosmética do anel e do relógio no app em foreground.
  useEffect(() => {
    if (!draft.restEndsAt) return undefined;
    const tick = setInterval(() => setRestTick((value) => value + 1), 1000);
    return () => clearInterval(tick);
  }, [draft.restEndsAt]);

  // O denominador do anel é cosmético. O valor inicial vem do exercício que
  // aguarda e não participa da decisão de avançar a série.
  useEffect(() => {
    if (!draft.restEndsAt) {
      restTotalSecondsRef.current = 0;
      setRestTotal(0);
      return undefined;
    }
    if (restTotalSecondsRef.current <= 0) {
      const total = Math.max(1, proximaDoDescanso?.exercise.restSeconds ?? 1);
      restTotalSecondsRef.current = total;
      setRestTotal(total);
      ringAnim.setValue(1);
    }
    return undefined;
  }, [draft.restEndsAt, proximaDoDescanso?.exercise.exerciseId, ringAnim]);

  useEffect(() => {
    if (!draft.restEndsAt || restTotal <= 0) return undefined;
    const anim = Animated.timing(ringAnim, {
      toValue: Math.max(0, restRemainingDisplay) / restTotal,
      duration: 1000,
      easing: (t) => t,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [draft.restEndsAt, restRemainingDisplay, restTotal, ringAnim]);

  // Pulso discreto do relógio nos 5 segundos finais.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const emReta =
    emDescanso && restRemainingDisplay <= 5 && restRemainingDisplay > 0;
  useEffect(() => {
    if (!emReta) {
      pulseAnim.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [emReta, pulseAnim]);

  // Cleanup no unmount: cancela timers e animações iniciados para que nenhuma
  // atualização de estado dispare após o componente sair da árvore.
  useEffect(() => {
    return () => {
      entrada.stopAnimation();
      ringAnim.stopAnimation();
      pulseAnim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entrada do card quando o TREINO vira a página do exercício. Dispara só na
  // troca de exercício — animar a cada série viraria ruído, e era justamente a
  // ausência desta marcação que fazia "mudou de exercício" passar batido.
  const entrada = useRef(new Animated.Value(1)).current;
  const exercicioAnterior = useRef<string | null>(null);
  // O gatilho é o exercício que está NO CARD ANIMADO, não o do rascunho. Ao
  // fechar um exercício o rascunho já aponta para o próximo, mas quem está na
  // tela é o card de descanso (não animado): usar o rascunho fazia a animação
  // correr e terminar durante o descanso, e o card novo entrava sem nada.
  const exercicioAtivoId = idDoExercicioNoCard({
    ativo: active?.exercise.exerciseId ?? null,
    proximo: next?.exercise.exerciseId ?? null,
    emDescanso,
  });
  useEffect(() => {
    if (!exercicioAtivoId) return;
    const trocou =
      exercicioAnterior.current !== null &&
      exercicioAnterior.current !== exercicioAtivoId;
    exercicioAnterior.current = exercicioAtivoId;
    if (!trocou) return undefined;
    entrada.setValue(0);
    const anim = Animated.timing(entrada, {
      toValue: 1,
      duration: theme.animation.durations.medium,
      easing: easeImpulso,
      // Driver JS de propósito: o alvo é o PWA, e o react-native-web ignora o
      // driver nativo de qualquer forma. Com `true`, o card que troca de estado
      // no meio da transição tenta resolver um nó nativo que não existe (quebra
      // o teste de ponta a ponta e, no app, animaria contra um nó desmontado).
      useNativeDriver: false,
    });
    anim.start();
    // O card troca de estado (medição → descanso) no meio da transição; sem
    // parar aqui a animação segue mirando um nó já desmontado.
    return () => anim.stop();
  }, [exercicioAtivoId, entrada]);

  const estiloDeEntrada = {
    transform: [
      {
        translateY: entrada.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  const posicao = exercicioAtivoId
    ? posicaoDoExercicio(draft, exercicioAtivoId)
    : null;

  // Trocou de série → o texto em edição não pertence mais a ela. Usa
  // `readyToMeasure` (não só `active`): D-06 revela o card de medição sem
  // passar por `activateSet` quando o pré-preenchimento já é suficiente, e
  // sem este ajuste um texto digitado numa série revelada direto vazaria
  // para a próxima série revelada direto (nenhuma das duas passa por `active`).
  const serieAtivaId = readyToMeasure?.set.plannedSetId ?? null;
  useEffect(() => {
    setTextoCarga(null);
    setTextoDistancia(null);
  }, [serieAtivaId]);

  // ±30s: o store ajusta o timestamp; o total local só evita que o anel
  // ultrapasse 100% quando o dono acrescenta tempo.
  const ajustarRest = (delta: number) => {
    const remainingAfterAdjustment = Math.max(1, restRemainingDisplay + delta);
    restTotalSecondsRef.current = Math.max(
      restTotalSecondsRef.current,
      remainingAfterAdjustment,
    );
    setRestTotal(restTotalSecondsRef.current);
    adjustRestInStore(delta);
  };

  const endRest = (autoStart: boolean) => {
    const alvo = proximaDoDescanso;
    setRest(null);
    if (autoStart && alvo && alvo.set.status !== 'done') {
      activateSet(alvo.exercise.exerciseId, alvo.set.setOrder);
    }
  };

  // Série ativada por fora (fila) durante o descanso: o descanso perde a vez.
  useEffect(() => {
    if (active && rest) endRest(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.set.plannedSetId, rest]);

  const onConcluir = async () => {
    if (!readyToMeasure) return;
    const { exercise, set } = readyToMeasure;
    setSaving(true);
    try {
      const ok = await completeSet(exercise.exerciseId, set.setOrder);
      if (ok) {
        tapLight();
        const draftAtual = useActiveSessionStore.getState().draft;
        const proxima = draftAtual ? findNextPendingSet(draftAtual) : null;
        // Lê o exercício JÁ atualizado: completeSet acabou de marcar a série.
        const depois = draftAtual?.exercises.find(
          (e) => e.exerciseId === exercise.exerciseId,
        );
        const fechouExercicio = depois ? exercicioConcluido(depois) : false;
        if (
          proxima &&
          exercise.restSeconds != null &&
          exercise.restSeconds > 0
        ) {
          setRest({
            next: proxima,
            fechouExercicio,
            nomeConcluido: fechouExercicio ? exercise.name : null,
          });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------------- resting ----------------
  if (emDescanso) {
    const proxima = proximaDoDescanso;
    return (
      <View style={[styles.card, styles.cardRest]} accessibilityRole="timer">
        {/* Fechar o exercício é um marco — merece nome próprio, não "série
            registrada" outra vez. */}
        <View
          style={[
            styles.restDone,
            descanso.fechouExercicio && styles.restDoneMarco,
          ]}
        >
          <Feather
            name={descanso.fechouExercicio ? 'check-circle' : 'check'}
            size={descanso.fechouExercicio ? 15 : 13}
            color={theme.colors.accent.main}
          />
          <Text
            style={[
              styles.restDoneText,
              descanso.fechouExercicio && styles.restDoneTextMarco,
            ]}
          >
            {descanso.fechouExercicio && descanso.nomeConcluido
              ? `${descanso.nomeConcluido} concluído`
              : 'Série registrada'}
          </Text>
        </View>
        <Text style={styles.kicker}>DESCANSO</Text>

        {/* Anel: o traço neon drena com o tempo — descanso se esgota. */}
        <View style={styles.ringWrap}>
          <Svg
            width={188}
            height={188}
            viewBox="0 0 176 176"
            style={styles.ringSvg}
          >
            <Circle
              cx="88"
              cy="88"
              r={RING_R}
              stroke={theme.colors.veil.soft}
              strokeWidth={7}
              fill="none"
            />
            <AnimatedCircle
              cx="88"
              cy="88"
              r={RING_R}
              stroke={theme.colors.accent.main}
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${RING_C}`}
              strokeDashoffset={ringAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [RING_C, 0],
              })}
            />
          </Svg>
          <Animated.Text
            style={[styles.restClock, { transform: [{ scale: pulseAnim }] }]}
            accessibilityLabel={`Descanso: ${restRemainingDisplay < 0 ? '+' : ''}${formatarTempo(restRemainingDisplay)}`}
          >
            {restRemainingDisplay < 0 ? '+' : ''}
            {formatarTempo(restRemainingDisplay)}
          </Animated.Text>
        </View>

        <View style={styles.restAdjust}>
          <TouchableOpacity
            style={styles.adjustChip}
            accessibilityRole="button"
            accessibilityLabel="Diminuir descanso em 30 segundos"
            onPress={() => ajustarRest(-30)}
          >
            <Text style={styles.adjustChipText}>−30s</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.adjustChip}
            accessibilityRole="button"
            accessibilityLabel="Aumentar descanso em 30 segundos"
            onPress={() => ajustarRest(30)}
          >
            <Text style={styles.adjustChipText}>+30s</Text>
          </TouchableOpacity>
        </View>

        {proxima ? (
          descanso.fechouExercicio ? (
            // Troca de exercício: o "a seguir" vira anúncio, com o nome no
            // tamanho do título e a posição no treino. O aluno chega no card
            // novo já sabendo que mudou.
            <View style={styles.proximoExercicio}>
              <Text style={styles.proximoKicker}>
                A SEGUIR
                {(() => {
                  const p = posicaoDoExercicio(
                    draft,
                    proxima.exercise.exerciseId,
                  );
                  return p ? ` · EXERCÍCIO ${p.indice} DE ${p.total}` : '';
                })()}
              </Text>
              <Text style={styles.proximoNome}>{proxima.exercise.name}</Text>
              <Text style={styles.restNext}>
                {proxima.exercise.sets.length}{' '}
                {proxima.exercise.sets.length === 1 ? 'série' : 'séries'} · alvo{' '}
                {alvoDaSerie(proxima.exercise, proxima.set)}
              </Text>
            </View>
          ) : (
            <Text style={styles.restNext}>
              Próxima: {proxima.exercise.name} — Série {proxima.set.setOrder} ·
              alvo {alvoDaSerie(proxima.exercise, proxima.set)}
            </Text>
          )
        ) : null}
        {autoNote ? <Text style={styles.autoNote}>{autoNote}</Text> : null}
        {emTempoExtra ? (
          // Tempo extra: mesmo botão que "Iniciar série"/"Concluir série"
          // (styles.completeBtn) — CTA primário e destacado, mesma ação
          // (endRest(true)) do "Pular descanso" de antes.
          <TouchableOpacity
            style={styles.completeBtn}
            accessibilityRole="button"
            accessibilityLabel="Começar próxima série"
            onPress={() => endRest(true)}
          >
            <Text style={styles.completeBtnText}>Começar próxima série</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.secondaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Pular descanso"
            onPress={() => endRest(true)}
          >
            <Text style={styles.secondaryBtnText}>Pular descanso</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ---------------- measuring: cardio/isometria ----------------
  if (active && isTimeBased(metricOf(active.exercise))) {
    const { exercise, set } = active;
    const metrica = metricOf(exercise);
    const temDistancia = metrica === 'tempo_distancia';
    const podeConcluir = canCompleteSet(set, exercise.isBodyweight, metrica);
    const totalSeries = exercise.sets.length;
    const minutos =
      set.actualDurationSeconds != null
        ? Math.floor(set.actualDurationSeconds / 60)
        : null;
    const segundos =
      set.actualDurationSeconds != null ? set.actualDurationSeconds % 60 : null;
    // Pace ao vivo: derivado do que já foi digitado. Sem distância, "—".
    const pace = paceSecondsPerKm(
      set.actualDurationSeconds,
      set.actualDistanceM,
    );

    const aplicarTempo = (novoMin: number | null, novoSeg: number | null) => {
      const m = novoMin ?? minutos ?? 0;
      const sg = novoSeg ?? segundos ?? 0;
      const total = m * 60 + sg;
      setDuration(exercise.exerciseId, set.setOrder, total > 0 ? total : null);
    };

    return (
      <Animated.View style={[styles.card, styles.cardActive, estiloDeEntrada]}>
        {posicao ? (
          <Text style={styles.exercisePos}>
            EXERCÍCIO {posicao.indice} DE {posicao.total}
          </Text>
        ) : null}
        <Text style={styles.kicker}>
          SÉRIE {set.setOrder} DE {totalSeries} · ALVO{' '}
          {alvoDaSerie(exercise, set)}
        </Text>
        <Text style={styles.exerciseName}>{exercise.name}</Text>

        <View style={styles.inputsRow}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Minutos</Text>
            <TextInput
              style={styles.bigInput}
              editable={!saving}
              keyboardType="number-pad"
              value={minutos != null ? String(minutos) : ''}
              onChangeText={(t) => aplicarTempo(parseIntOrNull(t) ?? 0, null)}
              placeholder={
                set.targetDurationSeconds
                  ? String(Math.floor(set.targetDurationSeconds / 60))
                  : 'min'
              }
              placeholderTextColor={theme.colors.text.quiet}
              accessibilityLabel={`Minutos da série ${set.setOrder}`}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Segundos</Text>
            <TextInput
              style={styles.bigInput}
              editable={!saving}
              keyboardType="number-pad"
              value={segundos ? String(segundos) : ''}
              onChangeText={(t) => {
                const v = parseIntOrNull(t);
                aplicarTempo(null, v == null ? 0 : Math.min(59, v));
              }}
              placeholder="0"
              placeholderTextColor={theme.colors.text.quiet}
              accessibilityLabel={`Segundos da série ${set.setOrder}`}
            />
          </View>
          {temDistancia ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Distância (km)</Text>
              <TextInput
                style={styles.bigInput}
                editable={!saving}
                keyboardType="decimal-pad"
                value={
                  textoDistancia ??
                  (set.actualDistanceM != null
                    ? String(set.actualDistanceM / 1000)
                    : '')
                }
                onChangeText={(t) => {
                  setTextoDistancia(t);
                  const km = parseFloatOrNull(t);
                  setDistance(
                    exercise.exerciseId,
                    set.setOrder,
                    km == null ? null : Math.round(km * 1000),
                  );
                }}
                placeholder={
                  set.targetDistanceM
                    ? String(set.targetDistanceM / 1000)
                    : 'km'
                }
                placeholderTextColor={theme.colors.text.quiet}
                accessibilityLabel={`Distância da série ${set.setOrder} em quilômetros`}
              />
            </View>
          ) : null}
        </View>

        {temDistancia ? (
          <View style={styles.paceRow}>
            <Text style={styles.paceLabel}>Pace</Text>
            <Text
              style={styles.paceValue}
              accessibilityLabel={`Pace ${formatPace(pace)}`}
            >
              {formatPace(pace)}
            </Text>
          </View>
        ) : null}

        {temDistancia && pace == null ? (
          <Text style={styles.hint}>
            Informe a distância para calcular o pace (opcional).
          </Text>
        ) : null}

        {/* Equivalente do RIR no cardio: como o esforço pesou. Opcional. */}
        <Text style={styles.rirLabel}>
          Como pegou? <Text style={styles.rirOptional}>(opcional)</Text>
        </Text>
        <View style={styles.rirRow}>
          {ESFORCO_CHOICES.map(({ valor, rotulo }) => {
            const selected = set.perceivedEffort === valor;
            return (
              <TouchableOpacity
                key={valor}
                style={[styles.effortChip, selected && styles.rirChipSelected]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Esforço ${rotulo}`}
                accessibilityState={{ selected }}
                onPress={() =>
                  setEffort(
                    exercise.exerciseId,
                    set.setOrder,
                    selected ? null : valor,
                  )
                }
              >
                <Text
                  style={[
                    styles.rirChipText,
                    selected && styles.rirChipTextSelected,
                  ]}
                >
                  {rotulo}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.completeBtn,
            (!podeConcluir || saving) && styles.controlDisabled,
          ]}
          onPress={onConcluir}
          disabled={!podeConcluir || saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent.on} size="small" />
          ) : (
            <Text style={styles.completeBtnText}>Concluir série</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ---------------- measuring ----------------
  if (readyToMeasure) {
    const { exercise, set } = readyToMeasure;
    const suggestedLoad = suggestedLoadFor(exercise, set);
    const suggestedReps = suggestedRepsFor(exercise, set);
    // podeConcluir precisa enxergar o MESMO valor herdado que a tela mostra —
    // sem isto, o botão "Concluir série" ficaria desabilitado mesmo quando o
    // card já nasceu revelado por já passar em canCompleteSet() (D-06).
    const podeConcluir = canCompleteSet(
      {
        ...set,
        actualReps: set.actualReps ?? suggestedReps,
        actualLoadKg: exercise.isBodyweight ? null : (set.actualLoadKg ?? suggestedLoad),
      },
      exercise.isBodyweight,
      metricOf(exercise),
    );
    const precisaCarga =
      !exercise.isBodyweight && suggestedLoad == null && set.actualLoadKg == null;
    // O primeiro dígito digitado já torna `actualLoadKg` não-nulo, o que
    // zeraria `precisaCarga` NO MEIO da digitação (D-04 exige o teclado
    // aberto até o aluno terminar de digitar, não só no primeiro caractere).
    // `textoCarga` já existe para guardar o texto cru em edição — reusa-lo
    // aqui mantém o TextInput montado até o aluno soltar o campo (stepper ou
    // troca de série, que já resetam `textoCarga` para null).
    const editandoCarga = textoCarga != null;
    const totalSeries = exercise.sets.length;

    // D-03: o valor herdado (ainda não tocado) fica marcado até o primeiro +/−.
    const valorReps = set.actualReps ?? suggestedReps;
    const herdadoReps = set.actualReps == null;
    const herdadoCarga = set.actualLoadKg == null;

    // Última carga REAL deste exercício (histórico semeado + sessão corrente).
    const ultimaCarga = draft.lastLoadByExercise[exerciseIdentity(exercise)];

    return (
      <Animated.View style={[styles.card, styles.cardActive, estiloDeEntrada]}>
        {posicao ? (
          <Text style={styles.exercisePos}>
            EXERCÍCIO {posicao.indice} DE {posicao.total}
          </Text>
        ) : null}
        <Text style={styles.kicker}>
          SÉRIE {set.setOrder} DE {totalSeries} · ALVO{' '}
          {alvoDaSerie(exercise, set)}
        </Text>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        {!exercise.isBodyweight && ultimaCarga != null ? (
          <View style={styles.lastLine}>
            <Feather
              name="rotate-ccw"
              size={12}
              color={theme.colors.text.quiet}
            />
            <Text style={styles.lastLineText}>
              Última carga: {String(ultimaCarga).replace('.', ',')} kg
            </Text>
          </View>
        ) : null}

        {/*
          Reps e carga EMPILHADOS (não lado a lado): os dois agora têm o
          MESMO formato (−/valor/+ com botões hitTarget.regular=50pt) desde
          que reps ganhou stepper nesta fase. O antigo inputsRow dividia a
          linha 1:2.2 (FIELD_FLEX:FIELD_WIDE_FLEX) — proporção calibrada para
          quando reps era um TextInput solto sem botões. Com dois botões de
          50pt também no campo de reps, a fatia de 1/3.2 da linha (≈92,5pt a
          390pt) fica MENOR que só os dois botões do próprio stepper de reps
          (2×50 + 2×gap = 112pt) — o par "+/−" do stepper de reps estourava a
          tela ANTES mesmo do valor entrar. Medido ao planejar a Task 2
          (checagem de largura no PWA, D-05): ver measureField/measureFields
          abaixo e o teste equivalente de largura. D-07 já aceitava o card
          mais alto com dois steppers — o empilhamento cumpre essa troca.
        */}
        <View style={styles.measureFields}>
          <View style={styles.measureField}>
            <Text style={styles.fieldLabel}>Reps</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, saving && styles.controlDisabled]}
                onPress={() => stepReps(exercise.exerciseId, set.setOrder, -1)}
                disabled={saving}
                accessibilityLabel={`Diminuir repetições da série ${set.setOrder}`}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.bigInput,
                  styles.repsInput,
                  herdadoReps && styles.inheritedValue,
                ]}
                accessibilityLabel={`Repetições da série ${set.setOrder}`}
              >
                {String(valorReps ?? '—')}
              </Text>
              <TouchableOpacity
                style={[styles.stepBtn, saving && styles.controlDisabled]}
                onPress={() => stepReps(exercise.exerciseId, set.setOrder, 1)}
                disabled={saving}
                accessibilityLabel={`Aumentar repetições da série ${set.setOrder}`}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {exercise.isBodyweight ? (
            <View style={styles.measureField}>
              <Text style={styles.fieldLabel}>Carga</Text>
              <Text style={styles.bodyweightTag}>Peso corporal</Text>
            </View>
          ) : (
            <View style={styles.measureField}>
              <Text style={styles.fieldLabel}>Carga (kg)</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, saving && styles.controlDisabled]}
                  onPress={() => {
                    setTextoCarga(null);
                    stepLoad(exercise.exerciseId, set.setOrder, -1);
                  }}
                  disabled={saving}
                  accessibilityLabel={`Diminuir carga da série ${set.setOrder}`}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                {precisaCarga || editandoCarga ? (
                  <TextInput
                    style={[styles.bigInput, styles.loadInput]}
                    editable={!saving}
                    keyboardType="decimal-pad"
                    autoFocus={precisaCarga}
                    value={
                      textoCarga ??
                      (set.actualLoadKg != null ? String(set.actualLoadKg) : '')
                    }
                    onChangeText={(t) => {
                      setTextoCarga(t);
                      setLoad(exercise.exerciseId, set.setOrder, parseFloatOrNull(t));
                    }}
                    placeholder="kg"
                    placeholderTextColor={theme.colors.text.quiet}
                    accessibilityLabel={`Carga da série ${set.setOrder}`}
                  />
                ) : (
                  <Text
                    style={[
                      styles.bigInput,
                      styles.loadInput,
                      herdadoCarga && styles.inheritedValue,
                    ]}
                    accessibilityLabel={`Carga da série ${set.setOrder}`}
                  >
                    {String(set.actualLoadKg ?? suggestedLoad).replace('.', ',')}
                    {/* "kg" num corpo menor: no formato antigo (mesma fonte
                        grande do número) o sufixo sozinho já reduzia a folga
                        de largura medida em loadInputLayoutWeb.test.ts de
                        8,3pt para negativo em telas de 390pt. */}
                    <Text style={styles.loadUnitSuffix}> kg</Text>
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.stepBtn, saving && styles.controlDisabled]}
                  onPress={() => {
                    setTextoCarga(null);
                    stepLoad(exercise.exerciseId, set.setOrder, 1);
                  }}
                  disabled={saving}
                  accessibilityLabel={`Aumentar carga da série ${set.setOrder}`}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* F10: a sugestão só vira valor gravado quando o aluno ACEITA ou digita. */}
        {!exercise.isBodyweight &&
        suggestedLoad != null &&
        set.actualLoadKg == null ? (
          <TouchableOpacity
            style={[styles.suggestBtn, saving && styles.controlDisabled]}
            onPress={() => {
              setTextoCarga(null);
              setLoad(exercise.exerciseId, set.setOrder, suggestedLoad);
            }}
            disabled={saving}
          >
            <Text style={styles.suggestText}>
              Usar sugestão: {suggestedLoad} kg
            </Text>
          </TouchableOpacity>
        ) : null}

        {precisaCarga ? (
          <Text style={styles.hint}>
            Primeira vez neste exercício: informe a carga usada.
          </Text>
        ) : null}

        {/* RIR sem jargão: fôlego que sobrou, em UM toque. Opcional. */}
        <Text style={styles.rirLabel}>
          Quantas ainda aguentaria?{' '}
          <Text style={styles.rirOptional}>(opcional)</Text>
        </Text>
        <View style={styles.rirRow}>
          {RIR_CHOICES.map((n) => {
            const selected = set.actualRir === n;
            return (
              <TouchableOpacity
                key={n}
                style={[styles.rirChip, selected && styles.rirChipSelected]}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Ainda aguentaria ${n === 4 ? '4 ou mais' : n}`}
                accessibilityState={{ selected }}
                onPress={() =>
                  setRir(exercise.exerciseId, set.setOrder, selected ? null : n)
                }
              >
                <Text
                  style={[
                    styles.rirChipText,
                    selected && styles.rirChipTextSelected,
                  ]}
                >
                  {n === 4 ? '4+' : n}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.completeBtn,
            (!podeConcluir || saving) && styles.controlDisabled,
          ]}
          onPress={onConcluir}
          disabled={!podeConcluir || saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent.on} size="small" />
          ) : (
            <Text style={styles.completeBtnText}>Concluir série</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ---------------- ready ----------------
  if (next) {
    return (
      <Animated.View style={[styles.card, estiloDeEntrada]}>
        {posicao ? (
          <Text style={styles.exercisePos}>
            EXERCÍCIO {posicao.indice} DE {posicao.total}
          </Text>
        ) : null}
        <Text style={styles.kicker}>
          PRÓXIMA · SÉRIE {next.set.setOrder} DE {next.exercise.sets.length} ·
          ALVO {alvoDaSerie(next.exercise, next.set)}
        </Text>
        <Text style={styles.exerciseName}>{next.exercise.name}</Text>
        {autoNote ? <Text style={styles.autoNote}>{autoNote}</Text> : null}
        <TouchableOpacity
          style={styles.completeBtn}
          accessibilityRole="button"
          accessibilityLabel="Iniciar série"
          onPress={() =>
            activateSet(next.exercise.exerciseId, next.set.setOrder)
          }
        >
          <Text style={styles.completeBtnText}>Iniciar série</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ---------------- all done ----------------
  return (
    <View style={[styles.card, styles.cardRest]}>
      <Text style={styles.kicker}>TUDO REGISTRADO</Text>
      <Text style={styles.exerciseName}>Treino completo.</Text>
      <Text style={styles.restNext}>Confira abaixo e conclua o treino.</Text>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      marginBottom: theme.spacing.lg,
      padding: theme.spacing.xl,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.xl,
      backgroundColor: theme.colors.surface.card,
    },
    cardActive: { borderColor: theme.colors.border.focus },
    paceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: theme.spacing.md,
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
    },
    paceLabel: {
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.colors.text.quiet,
    },
    paceValue: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    effortChip: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      marginRight: theme.spacing.xs,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.md,
    },
    cardRest: { alignItems: 'center' },

    restDone: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.md,
    },
    restDoneText: {
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    // Fim de exercício é marco: ganha pílula e cor de acento para não se
    // confundir com o "série registrada" de sempre.
    restDoneMarco: {
      paddingVertical: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.borderRadius.pill,
      backgroundColor: theme.colors.accent.soft,
    },
    restDoneTextMarco: {
      color: theme.colors.text.accent,
      fontSize: theme.typography.fontSizes.base,
    },
    proximoExercicio: {
      marginTop: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
      alignItems: 'center',
      alignSelf: 'stretch',
    },
    proximoKicker: {
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.micro,
      fontWeight: theme.typography.fontWeights.bold,
      letterSpacing: theme.typography.letterSpacing.wide,
      textTransform: 'uppercase',
    },
    proximoNome: {
      marginTop: theme.spacing.xxs,
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.display,
      fontSize: theme.typography.fontSizes.xl,
      textAlign: 'center',
    },
    // Onde o aluno está no treino — some no ruído até precisar, e é o que
    // ancora a sensação de progresso entre um exercício e outro.
    exercisePos: {
      marginBottom: theme.spacing.xxs,
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.micro,
      fontWeight: theme.typography.fontWeights.bold,
      letterSpacing: theme.typography.letterSpacing.wide,
    },
    ringWrap: {
      width: 188,
      height: 188,
      marginTop: theme.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
    restAdjust: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.lg,
    },
    adjustChip: {
      minHeight: theme.hitTarget.compact,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.pill,
      backgroundColor: theme.colors.surface.elevated,
    },
    adjustChipText: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    lastLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    lastLineText: {
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },

    kicker: {
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.micro,
      letterSpacing: theme.typography.letterSpacing.wide,
      textTransform: 'uppercase',
    },
    exerciseName: {
      marginTop: theme.spacing.xxs,
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.display,
      fontSize: theme.typography.fontSizes.xl,
    },

    restClock: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.display,
      fontSize: 44,
      lineHeight: 50,
    },
    restNext: {
      marginTop: theme.spacing.sm,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      textAlign: 'center',
    },

    inputsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
    field: { flex: FIELD_FLEX },
    fieldLabel: {
      marginBottom: theme.spacing.xxs,
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
    },
    bigInput: {
      minHeight: theme.hitTarget.regular,
      paddingHorizontal: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surface.elevated,
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.display,
      fontWeight: theme.typography.fontWeights.semiBold,
      textAlign: 'center',
    },
    loadInput: LOAD_INPUT_STYLE,
    repsInput: REPS_INPUT_STYLE,
    // D-03: marca do valor herdado (ainda não tocado) — mesma cor discreta de
    // `lastLineText` ("Última carga"), sem paleta nova. Some assim que o aluno
    // toca +/− pela primeira vez.
    inheritedValue: {
      color: theme.colors.text.quiet,
    },
    // Reps e carga empilhados no card measuring (D-05): cada campo ocupa a
    // largura inteira do card — os dois agora têm o mesmo formato de stepper
    // (2 botões de 50pt + valor), e side-by-side (o antigo inputsRow) não
    // sobra espaço nem para os botões do próprio stepper de reps a 390pt.
    measureFields: {
      marginTop: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    measureField: {},
    // "kg" em corpo menor que o número: no mesmo tamanho de fonte do valor
    // (bigInput/loadInput), o sufixo sozinho já apertava a folga de largura
    // medida em loadInputLayoutWeb.test.ts (8,3pt) a negativo em 390pt.
    loadUnitSuffix: {
      fontSize: theme.typography.fontSizes.sm,
      fontWeight: theme.typography.fontWeights.medium,
      color: theme.colors.text.quiet,
    },
    bodyweightTag: {
      paddingVertical: theme.spacing.md,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      textAlign: 'center',
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    stepBtn: {
      width: theme.hitTarget.regular,
      height: theme.hitTarget.regular,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surface.elevated,
    },
    stepBtnText: {
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xl,
      fontWeight: theme.typography.fontWeights.semiBold,
    },

    suggestBtn: {
      alignSelf: 'flex-start',
      marginTop: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.accent.border,
      borderRadius: theme.borderRadius.md,
    },
    suggestText: {
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    hint: {
      marginTop: theme.spacing.sm,
      color: theme.colors.status.warning,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
    },

    rirLabel: {
      marginTop: theme.spacing.lg,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },
    rirOptional: { color: theme.colors.text.quiet },
    rirRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    rirChip: {
      minWidth: theme.hitTarget.compact,
      minHeight: theme.hitTarget.compact,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.pill,
      backgroundColor: theme.colors.surface.elevated,
    },
    rirChipSelected: {
      borderColor: theme.colors.accent.border,
      backgroundColor: theme.colors.accent.soft,
    },
    rirChipText: {
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    rirChipTextSelected: { color: theme.colors.text.accent },

    autoNote: {
      marginTop: theme.spacing.md,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      textAlign: 'center',
    },
    secondaryBtn: {
      marginTop: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xl,
      borderWidth: 1,
      borderColor: theme.colors.border.strong,
      borderRadius: theme.borderRadius.md,
    },
    secondaryBtnText: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      fontWeight: theme.typography.fontWeights.semiBold,
    },

    completeBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: theme.hitTarget.regular,
      marginTop: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.accent.main,
    },
    controlDisabled: { opacity: 0.45 },
    completeBtnText: {
      color: theme.colors.accent.on,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.md,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
  });

export default SessionPlayer;
