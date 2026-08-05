// src/components/session/PrioridadeCard.tsx
// Card de prioridade (Nível 3): a semana perdeu um treino de um grupo; se a
// sessão atual treina esse grupo, o primário dele pode subir para o 1º lugar
// real (depois do aquecimento). Proposta NUNCA adiciona série — só reordena.
//
// Copy fechado com o dono — não editar sem passar por ele.

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import theme from '../../theme/theme';
import { Notice } from '../ui/Feedback';
import Button from '../ui/Button';

type PrioridadeCardProps = {
  /** Grupo negligenciado, exibido como estava na semana (ex.: "Costas"). */
  grupo: string;
  /** Nome do exercício que sobe para o 1º lugar real. */
  nomeExercicio: string;
  /** Em andamento uma requisição de reordenação. */
  busy: boolean;
  onAplicar: () => void;
  onRecusar: () => void;
  style?: StyleProp<ViewStyle>;
};

const PrioridadeCard = ({
  grupo,
  nomeExercicio,
  busy,
  onAplicar,
  onRecusar,
  style,
}: PrioridadeCardProps) => (
  <Notice
    tone="info"
    title={`${grupo} ficou sem treino esta semana`}
    description={`Quer começar por ${nomeExercicio}? Ele sobe para 1º, com você descansado`}
    style={style}
    action={
      <View style={styles.action}>
        <Text style={styles.nota}>
          Nada de série a mais. O treino é o mesmo — só muda a ordem.
        </Text>
        <View style={styles.botoes}>
          <Button label="Colocar primeiro" compact loading={busy} disabled={busy} onPress={onAplicar} />
          <Button label="Manter como está" variant="ghost" compact disabled={busy} onPress={onRecusar} />
        </View>
      </View>
    }
  />
);

const styles = StyleSheet.create({
  action: { flexDirection: 'column' },
  nota: {
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  botoes: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
});

export default PrioridadeCard;
