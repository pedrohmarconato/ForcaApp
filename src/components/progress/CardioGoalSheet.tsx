// src/components/progress/CardioGoalSheet.tsx
// Definição de uma meta de cardio (migration 0022).
//
// Tudo por CHIP, nada de campo numérico livre: o aluno escolhe entre valores que
// o banco aceita (faixas das constraints), então não existe estado inválido para
// validar nem erro de digitação que só aparece no INSERT. Distância e tempo em
// unidades humanas (km e minutos) — a conversão para metros e segundos acontece
// aqui, uma vez, e não espalhada pela tela.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import theme from '../../theme/theme';
import Button from '../ui/Button';
import { OptionButton } from '../ui/Controls';
import { CARDIO_MODALIDADES } from '../../constants/cardioModalidades';
import type { CardioGoalKind } from '../../services/cardioGoalRepository';

export type NovaMeta =
  | {
      kind: 'desempenho';
      modality: string;
      targetDistanceM: number;
      targetDurationSeconds: number;
    }
  | {
      kind: 'consistencia';
      weeklyMinutes: number | null;
      weeklySessions: number | null;
    };

type Props = {
  visible: boolean;
  kind: CardioGoalKind;
  onConfirm: (meta: NovaMeta) => void;
  onDismiss: () => void;
  busy?: boolean;
};

// Distâncias com significado para quem corre/pedala. Em km.
const DISTANCIAS_KM = [1, 2, 3, 5, 10, 21] as const;
// Tempos-alvo em minutos.
const TEMPOS_MIN = [10, 15, 20, 25, 30, 40, 50, 60, 90] as const;
// Minutos por semana (a constraint aceita 5–1200; estes são os úteis).
const MINUTOS_SEMANA = [60, 90, 120, 150, 180, 240] as const;
const SESSOES_SEMANA = [1, 2, 3, 4, 5] as const;

const CardioGoalSheet = ({ visible, kind, onConfirm, onDismiss, busy = false }: Props) => {
  const [modalidade, setModalidade] = useState<string | null>(null);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);
  const [tempoMin, setTempoMin] = useState<number | null>(null);
  const [minutosSemana, setMinutosSemana] = useState<number | null>(null);
  const [sessoesSemana, setSessoesSemana] = useState<number | null>(null);

  // Reabrir nunca herda a escolha anterior: confirmar por engano a meta de outro
  // tipo grava um objetivo que o aluno não definiu.
  useEffect(() => {
    if (visible) {
      setModalidade(null);
      setDistanciaKm(null);
      setTempoMin(null);
      setMinutosSemana(null);
      setSessoesSemana(null);
    }
  }, [visible, kind]);

  const ehDesempenho = kind === 'desempenho';
  const pronta = ehDesempenho
    ? modalidade != null && distanciaKm != null && tempoMin != null
    : minutosSemana != null || sessoesSemana != null;

  const confirmar = () => {
    if (busy || !pronta) return;
    if (ehDesempenho) {
      onConfirm({
        kind: 'desempenho',
        modality: modalidade!,
        targetDistanceM: distanciaKm! * 1000,
        targetDurationSeconds: tempoMin! * 60,
      });
      return;
    }
    onConfirm({ kind: 'consistencia', weeklyMinutes: minutosSemana, weeklySessions: sessoesSemana });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onDismiss}
        testID="cardio-goal-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Fechar sem definir meta"
      >
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.kicker}>Meta de cardio</Text>
          <Text style={styles.title} accessibilityRole="header">
            {ehDesempenho ? 'Quero chegar a um tempo' : 'Quero manter uma rotina'}
          </Text>
          <Text style={styles.description}>
            {ehDesempenho
              ? 'A comparação usa só esforços da mesma modalidade e de distância equivalente — tempo de 1 km não vale para uma meta de 5 km.'
              : 'Conta os minutos e os dias com cardio da semana corrente (segunda a domingo).'}
          </Text>

          <ScrollView style={styles.corpo} keyboardShouldPersistTaps="handled">
            {ehDesempenho ? (
              <>
                <Text style={styles.label}>Modalidade</Text>
                <View style={styles.linha}>
                  {CARDIO_MODALIDADES.map((nome) => (
                    <OptionButton
                      key={nome}
                      label={nome}
                      selected={modalidade === nome}
                      onPress={() => setModalidade(nome)}
                      style={styles.chipLargo}
                    />
                  ))}
                </View>

                <Text style={styles.label}>Distância</Text>
                <View style={styles.linha}>
                  {DISTANCIAS_KM.map((km) => (
                    <OptionButton
                      key={km}
                      label={`${km} km`}
                      centered
                      selected={distanciaKm === km}
                      onPress={() => setDistanciaKm(km)}
                      style={styles.chip}
                    />
                  ))}
                </View>

                <Text style={styles.label}>Em quanto tempo</Text>
                <View style={styles.linha}>
                  {TEMPOS_MIN.map((min) => (
                    <OptionButton
                      key={min}
                      label={`${min} min`}
                      centered
                      selected={tempoMin === min}
                      onPress={() => setTempoMin(min)}
                      style={styles.chip}
                    />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Minutos por semana (opcional)</Text>
                <View style={styles.linha}>
                  {MINUTOS_SEMANA.map((min) => (
                    <OptionButton
                      key={min}
                      label={`${min} min`}
                      centered
                      selected={minutosSemana === min}
                      // Tocar no chip já marcado LIMPA o eixo: é como o aluno
                      // define uma meta só de sessões depois de ter escolhido
                      // minutos por engano.
                      onPress={() => setMinutosSemana(minutosSemana === min ? null : min)}
                      style={styles.chip}
                    />
                  ))}
                </View>

                <Text style={styles.label}>Dias com cardio por semana (opcional)</Text>
                <View style={styles.linha}>
                  {SESSOES_SEMANA.map((n) => (
                    <OptionButton
                      key={n}
                      label={n === 1 ? '1 dia' : `${n} dias`}
                      centered
                      selected={sessoesSemana === n}
                      onPress={() => setSessoesSemana(sessoesSemana === n ? null : n)}
                      style={styles.chip}
                    />
                  ))}
                </View>
                <Text style={styles.nota}>Escolha pelo menos um dos dois.</Text>
              </>
            )}
          </ScrollView>

          <Button
            label="Definir meta"
            onPress={confirmar}
            disabled={busy || !pronta}
            testID="cardio-goal-confirmar"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.overlay },
  card: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    backgroundColor: theme.colors.surface.card,
    ...theme.elevation.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.border.strong,
  },
  kicker: {
    marginBottom: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  description: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
  },
  corpo: { maxHeight: 360, marginVertical: theme.spacing.lg },
  label: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { minWidth: 84, flexGrow: 0 },
  chipLargo: { flexGrow: 0 },
  nota: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
});

export default CardioGoalSheet;
