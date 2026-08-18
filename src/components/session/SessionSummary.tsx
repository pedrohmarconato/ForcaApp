// src/components/session/SessionSummary.tsx
// Resumo da sessão (Direção 03) — a celebração sóbria: números que sobem em
// 420ms na curva controle, nota do treinador quando o motor decidiu algo real
// nesta sessão, e um único CTA. Sem confete: a conquista é o dado.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { easeControle } from '../../utils/motion';
import { notifySuccess } from '../../utils/haptics';
import type { ResumoSessao } from '../../engine/sessionSummary';
import Button from '../ui/Button';
import FModules from '../ui/FModules';

type Props = {
  titulo: string | null;
  /** Fotografia tirada no toque em Concluir; null se indisponível. */
  resumo: ResumoSessao | null;
  /** Razão REAL da última decisão automática do motor nesta sessão. */
  coachNote: string | null;
  onVoltar: () => void;
};

/** Número que sobe de 0 ao alvo em 420ms — Animated puro, sem re-render por frame. */
const CountUp = ({
  target,
  format,
}: {
  target: number;
  format?: (n: number) => string;
}) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const sub = anim.addListener(({ value }) =>
      setShown(Math.round(target * value)),
    );
    Animated.timing(anim, {
      toValue: 1,
      duration: theme.animation.durations.long,
      easing: easeControle,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(sub);
  }, [anim, target]);

  return (
    <Text style={styles.statValor}>
      {format ? format(shown) : String(shown)}
    </Text>
  );
};

const formatarMilhar = (n: number): string => n.toLocaleString('pt-BR');

const SessionSummary = ({ titulo, resumo, coachNote, onVoltar }: Props) => {
  const styles = useThemeStyles(createStyles);
  // Conquista real → confirmação tátil única na entrada.
  useEffect(() => {
    notifySuccess();
  }, []);

  return (
    <View style={styles.tela} testID="resumo-sessao">
      <View style={styles.cabeca}>
        <FModules lit={3} size={28} accessibilityLabel="Sessão completa" />
        <Text style={styles.kicker}>Sessão concluída</Text>
        <Text style={styles.titulo} accessibilityRole="header">
          Treino concluído.
        </Text>
        {titulo ? <Text style={styles.subtitulo}>{titulo}</Text> : null}
      </View>

      {resumo ? (
        <View style={styles.grade}>
          <View style={styles.stat}>
            <Text style={styles.statRotulo}>Séries</Text>
            <View style={styles.statLinha}>
              <CountUp target={resumo.series.done} />
              <Text style={styles.statUnidade}>/{resumo.series.total}</Text>
            </View>
          </View>
          {resumo.duracaoMin != null ? (
            <View style={styles.stat}>
              <Text style={styles.statRotulo}>Duração</Text>
              <View style={styles.statLinha}>
                <CountUp target={resumo.duracaoMin} />
                <Text style={styles.statUnidade}>min</Text>
              </View>
            </View>
          ) : null}
          {resumo.volumeKg > 0 ? (
            <View style={[styles.stat, styles.statLarga]}>
              <Text style={styles.statRotulo}>Volume total</Text>
              <View style={styles.statLinha}>
                <CountUp target={resumo.volumeKg} format={formatarMilhar} />
                <Text style={styles.statUnidade}>kg</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.mudo}>Suas séries foram registradas.</Text>
      )}

      {coachNote ? (
        <View style={styles.nota}>
          <FModules lit={2} size={16} />
          <Text style={styles.notaTexto}>
            <Text style={styles.notaForte}>Treinador: </Text>
            {coachNote}
          </Text>
        </View>
      ) : null}

      <View style={styles.rodape}>
        <Button label="Voltar ao início" onPress={onVoltar} />
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    tela: { flex: 1, padding: theme.spacing.xl },
    cabeca: { marginTop: theme.spacing.xl, marginBottom: theme.spacing.xxl },
    kicker: {
      marginTop: theme.spacing.lg,
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.micro,
      fontWeight: theme.typography.fontWeights.bold,
      letterSpacing: theme.typography.letterSpacing.wide,
      textTransform: 'uppercase',
    },
    titulo: {
      marginTop: theme.spacing.xxs,
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.display,
      fontWeight: theme.typography.fontWeights.semiBold,
      letterSpacing: theme.typography.letterSpacing.display,
    },
    subtitulo: {
      marginTop: theme.spacing.xxs,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
    },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    stat: {
      flexGrow: 1,
      flexBasis: '40%',
      padding: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.xl,
      backgroundColor: theme.colors.surface.card,
    },
    statLarga: { flexBasis: '100%' },
    statRotulo: {
      color: theme.colors.text.quiet,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.micro,
      fontWeight: theme.typography.fontWeights.semiBold,
      letterSpacing: theme.typography.letterSpacing.wide,
      textTransform: 'uppercase',
    },
    statLinha: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing.xxs,
      marginTop: theme.spacing.xs,
    },
    statValor: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.display,
      fontSize: theme.typography.fontSizes.display + 6,
    },
    statUnidade: {
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },

    mudo: {
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
    },

    nota: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
      padding: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surface.raised,
    },
    notaTexto: {
      flex: 1,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
      lineHeight:
        theme.typography.fontSizes.sm * theme.typography.lineHeights.normal,
    },
    notaForte: {
      color: theme.colors.text.primary,
      fontWeight: theme.typography.fontWeights.semiBold,
    },

    rodape: { marginTop: 'auto', paddingBottom: theme.spacing.lg },
  });

export default SessionSummary;
