// src/components/session/ReorderControls.tsx
// Setas ↑/↓ do modo "Reordenar" — compartilhadas pelo detalhe da sessão
// (exercícios) e pela aba Plano (treinos da semana).

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';

const Seta = ({
  direcao,
  nome,
  desabilitada,
  onPress,
}: {
  direcao: 'cima' | 'baixo';
  nome: string;
  desabilitada: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={desabilitada}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityState={{ disabled: desabilitada }}
    accessibilityLabel={`Mover ${nome} para ${direcao}`}
    style={[styles.btn, desabilitada && styles.btnDisabled]}
  >
    <Feather
      name={direcao === 'cima' ? 'chevron-up' : 'chevron-down'}
      size={18}
      color={desabilitada ? theme.colors.text.quiet : theme.colors.text.primary}
    />
  </Pressable>
);

type SetasReordenarProps = {
  /** Nome lido pelo leitor de tela ("Mover {nome} para cima/baixo"). */
  nome: string;
  podeSubir: boolean;
  podeDescer: boolean;
  onSubir: () => void;
  onDescer: () => void;
};

export const SetasReordenar = ({
  nome,
  podeSubir,
  podeDescer,
  onSubir,
  onDescer,
}: SetasReordenarProps) => (
  <View style={styles.arrows}>
    <Seta direcao="cima" nome={nome} desabilitada={!podeSubir} onPress={onSubir} />
    <Seta direcao="baixo" nome={nome} desabilitada={!podeDescer} onPress={onDescer} />
  </View>
);

const styles = StyleSheet.create({
  arrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  btn: {
    width: theme.hitTarget.compact,
    height: theme.hitTarget.compact,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.elevated,
  },
  btnDisabled: { opacity: 0.35 },
});
