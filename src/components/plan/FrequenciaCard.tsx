// src/components/plan/FrequenciaCard.tsx
// Card do Nível 4 da escada de reencaixe: avisa com número real quando o
// histórico de semanas fechadas mostra falta crônica, abandono ou agenda
// desalinhada. Só APRESENTA — quem decide veredito e números é o motor
// (adherenceHistory.ts); nada muda sozinho (mesmo princípio de PrioridadeCard).
//
// Divergência documentada (COMMIT D): o fluxo de geração do plano vive no
// OnboardingNavigator, montado só com onboarding_completed=false — não há rota
// alcançável da aba Plano nesta versão do app. O botão existe por contrato da
// escada; o destino real (tela de proposta do Nível 4 completo) entra em
// commit futuro.

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
  onGerarNovoPlano: () => void;
  style?: StyleProp<ViewStyle>;
};

const FrequenciaCard = ({
  veredito,
  frequenciaReal,
  diasPlanejados,
  onGerarNovoPlano,
  style,
}: FrequenciaCardProps) => {
  const conteudo: { titulo: string; descricao: string } =
    veredito === 'abandono'
      ? {
          titulo: 'Faz 3 semanas sem treinar',
          descricao: 'Nenhum treino foi concluído nas últimas 3 semanas.',
        }
      : veredito === 'agenda_desalinhada'
        ? {
            titulo: 'Seus treinos não encaixam na sua agenda',
            descricao: `Nas últimas 3 semanas você treinou ${frequenciaReal} dos ${diasPlanejados} dias planejados, mas em dias diferentes do plano.`,
          }
        : {
            titulo: 'Sua frequência caiu',
            descricao: `Nas últimas 3 semanas você treinou ${frequenciaReal} dos ${diasPlanejados} dias planejados.`,
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
