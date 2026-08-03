// src/components/plan/FrequenciaCard.tsx
// Card do Nível 4 da escada de reencaixe: avisa com número real quando o
// histórico de semanas fechadas mostra falta crônica, abandono ou agenda
// desalinhada. Só APRESENTA — quem decide veredito e números é o motor
// (adherenceHistory.ts); nada muda sozinho (mesmo princípio de PrioridadeCard).
//
// O botão "Gerar novo plano" leva ao questionário (regeneração): o fluxo de
// geração roda no TrainingStack (MainNavigator) com skipChat — a tela de chat
// dispara a geração direto e, ao concluir, volta ao plano (fix do review #67).

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import theme from '../../theme/theme';
import type { VereditoDeFrequencia } from '../../engine/adherenceHistory';
import { Notice } from '../ui/Feedback';
import Button from '../ui/Button';

export type VereditoDeAviso = Extract<
  VereditoDeFrequencia,
  'falta_cronica' | 'abandono' | 'agenda_desalinhada'
>;

type FrequenciaCardProps = {
  /** Veredito que abriu o card (sempre um dos três de alerta). */
  veredito: VereditoDeAviso;
  /** Mediana de concluídas nas semanas fechadas (o número verificável). */
  frequenciaReal: number;
  /** Dias planejados por semana (denominador do número verificável). */
  diasPlanejados: number;
  /** Janela de semanas fechadas que o veredito considerou (FREQUENCY_CONFIG). */
  semanasFechadasMinimas: number;
  onGerarNovoPlano: () => void;
  style?: StyleProp<ViewStyle>;
};

const FrequenciaCard = ({
  veredito,
  frequenciaReal,
  diasPlanejados,
  semanasFechadasMinimas,
  onGerarNovoPlano,
  style,
}: FrequenciaCardProps) => {
  // "3 semanas" NUNCA fica fixo: o texto segue a config (FREQUENCY_CONFIG
  // .semanasFechadasMinimas) — mudar a config sem mexer aqui faria o card mentir.
  const janela = semanasFechadasMinimas;
  const conteudo: { titulo: string; descricao: string } =
    veredito === 'abandono'
      ? {
          titulo: `Faz ${janela} ${janela === 1 ? 'semana' : 'semanas'} sem treinar`,
          descricao: `Nenhum treino foi concluído nas últimas ${janela} ${janela === 1 ? 'semana' : 'semanas'}.`,
        }
      : veredito === 'agenda_desalinhada'
        ? {
            titulo: 'Seus treinos não encaixam na sua agenda',
            descricao: `Nas últimas ${janela} ${janela === 1 ? 'semana' : 'semanas'} você treinou ${frequenciaReal} dos ${diasPlanejados} dias planejados, mas em dias diferentes do plano.`,
          }
        : {
            titulo: 'Sua frequência caiu',
            descricao: `Nas últimas ${janela} ${janela === 1 ? 'semana' : 'semanas'} você treinou ${frequenciaReal} dos ${diasPlanejados} dias planejados.`,
          };

  return (
    <Notice
      tone="info"
      title={conteudo.titulo}
      description={conteudo.descricao}
      style={style}
      testID="frequencia-card"
      action={
        <View style={styles.action}>
          <Text style={styles.nota}>
            Nada muda sozinho. Você pode ignorar e seguir com o plano atual.
          </Text>
          <View style={styles.botao}>
            <Button
              label="Gerar novo plano"
              variant="tonal"
              compact
              onPress={onGerarNovoPlano}
            />
          </View>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  action: { flexDirection: 'column' },
  nota: {
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  botao: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

export default FrequenciaCard;
