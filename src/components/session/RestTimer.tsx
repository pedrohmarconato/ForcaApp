// src/components/session/RestTimer.tsx
// Fase 4 — cronômetro de descanso entre séries. Usa planned_exercises.rest_seconds.
// Só exibe/conta; não bloqueia nada — o aluno pode pular.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../../theme/theme';

const formatarTempo = (s: number): string => {
  const m = Math.floor(s / 60);
  const seg = s % 60;
  return `${m}:${String(seg).padStart(2, '0')}`;
};

type Props = {
  seconds: number;
  onDone?: () => void;
};

const RestTimer = ({ seconds, onDone }: Props) => {
  const [remaining, setRemaining] = useState(seconds);
  const jaAvisou = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    jaAvisou.current = false;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!jaAvisou.current) {
            jaAvisou.current = true;
            onDone?.();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // Reinicia só quando muda o tempo de descanso do exercício.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  return (
    <View style={styles.row} accessibilityRole="timer">
      <Text style={styles.label}>
        {remaining > 0 ? `Descanso ${formatarTempo(remaining)}` : 'Descanso concluído'}
      </Text>
      {remaining > 0 ? (
        <TouchableOpacity onPress={() => setRemaining(0)} accessibilityLabel="Pular descanso">
          <Text style={styles.skip}>Pular</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    // Descanso é estado corrente, não ação: fundo tênue, nunca preenchimento.
    backgroundColor: theme.colors.accent.soft,
  },
  label: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  skip: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default RestTimer;
