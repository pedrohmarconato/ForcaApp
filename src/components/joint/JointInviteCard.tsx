// src/components/joint/JointInviteCard.tsx
// Treino Conjunto 2.0 — Sprint 02. O convite dentro do lobby frio.
//
// A rodada 1 mostrava só o código no lobby, e a evidência visual desenhava link,
// relógio e botões que a tela não tinha — a imagem prometia um produto que não
// existia. Este componente é o que fecha B4/B6 de verdade, e é ele que aparece
// na evidência, porque a evidência agora renderiza os componentes reais.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../../theme/theme';
import { Button } from '../ui';
import { Card, SectionHeader } from '../ui/Surface';
import { Notice } from '../ui/Feedback';
import { buildInviteLink } from '../../navigation/inviteLink';

const layout = StyleSheet.create({
  coluna: { gap: theme.spacing.sm },
  codigo: {
    fontFamily: theme.typography.fonts.display,
    fontSize: theme.typography.fontSizes.hero,
    color: theme.colors.text.primary,
    letterSpacing: theme.spacing.xs,
    textAlign: 'center',
  },
  link: {
    fontFamily: theme.typography.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
});

/** Quanto falta, em texto — com o relógio vindo de fora, para o teste não esperar. */
export const tempoRestante = (expiraEm: string, agoraMs: number): string => {
  const restante = Date.parse(expiraEm) - agoraMs;
  if (!Number.isFinite(restante) || restante <= 0) return 'expirado';
  const minutos = Math.floor(restante / 60_000);
  return minutos >= 1 ? `expira em ${minutos} min` : 'expira em menos de 1 min';
};

export const JointInviteCard = ({
  inviteCode,
  inviteExpiresAt,
  agoraMs,
  emCurso,
  onCompartilhar,
  onRotacionar,
}: {
  inviteCode: string;
  inviteExpiresAt: string;
  agoraMs: number;
  emCurso: boolean;
  onCompartilhar: () => void;
  onRotacionar: () => void;
}) => {
  const restante = tempoRestante(inviteExpiresAt, agoraMs);
  const expirado = restante === 'expirado';
  return (
    <Card testID="convite-lobby">
      <SectionHeader title="Código do convite" />
      <Text style={layout.codigo} testID="codigo-lobby">{inviteCode}</Text>
      <Text style={layout.link} testID="link-lobby">{buildInviteLink(inviteCode)}</Text>
      <Notice tone={expirado ? 'warning' : 'info'} title={restante} testID="expiracao-lobby" />
      <View style={layout.coluna}>
        <Button
          label="Compartilhar"
          disabled={emCurso || expirado}
          onPress={onCompartilhar}
          testID="compartilhar-lobby"
        />
        <Button
          label="Gerar novo convite"
          variant="outline"
          loading={emCurso}
          disabled={emCurso}
          onPress={onRotacionar}
          testID="rotacionar-lobby"
        />
      </View>
    </Card>
  );
};
