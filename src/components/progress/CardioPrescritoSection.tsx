// src/components/progress/CardioPrescritoSection.tsx
// Seção "Cardio" da aba Progresso — REQ-02 (D-02/CONTEXT.md, decisão travada
// do dono 2026-08-08): a meta de cardio deixa de ser uma definição paralela
// ao treino (`CardioGoalsSection`/`cardio_goals`) e passa a ser lida direto da
// prescrição do plano ativo — prescrito × realizado, sem nenhuma ação de
// escrita de meta.
//
// Regra que este componente honra sem exceção: número só com lastro.
//  • sem cardio prescrito na semana → estado vazio explícito, nunca 0
//    inventado nem card de meta em branco;
//  • com prescrição e semana sem registro → o realizado é 0 (zero é o fato,
//    mesma disciplina de `cardioGoals.ts`), não "—" (que afirmaria "sem
//    prescrição" quando na verdade a prescrição existe e não foi cumprida).

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import theme from '../../theme/theme';
import { Card, SectionHeader } from '../ui/Surface';
import Button from '../ui/Button';
import { EmptyState, Notice, ProgressTrack, Skeleton } from '../ui/Feedback';
import { type CardioLog } from '../../engine/cardioGoals';
import { progressoPrescrito, type PrescricaoCardio } from '../../engine/cardioPrescrito';
import { formatarDuracao } from '../../utils/weekSummary';

type Props = {
  /** null = carregando; [] = confirmado vazio. */
  logs: CardioLog[] | null;
  /** null = carregando. */
  prescricao: PrescricaoCardio | null;
  erro: boolean;
  onRecarregar: () => void;
};

const formatarNumeroCompacto = (valor: number): string => {
  if (valor === 0) return '0';
  if (valor < 1) return '<1';
  const arredondado = Math.round(valor * 10) / 10;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace('.', ',');
};

const CardioPrescritoSection = ({ logs, prescricao, erro, onRecarregar }: Props) => {
  const semPrescricao =
    prescricao != null &&
    prescricao.duracaoSegundos == null &&
    prescricao.sessoes === 0 &&
    prescricao.distanciaM == null;

  const progresso = useMemo(() => {
    if (!logs || !prescricao || semPrescricao) return null;
    return progressoPrescrito(logs, prescricao);
  }, [logs, prescricao, semPrescricao]);

  return (
    <View style={styles.section}>
      <SectionHeader title="Cardio" />

      {erro ? (
        <Notice
          tone="danger"
          title="Não foi possível carregar seu cardio prescrito"
          action={
            <Button label="Tentar novamente" variant="outline" compact onPress={onRecarregar} />
          }
        />
      ) : logs === null || prescricao === null ? (
        <Skeleton
          height={128}
          radius={theme.borderRadius.xl}
          accessibilityLabel="Carregando cardio prescrito"
        />
      ) : semPrescricao ? (
        <Card>
          <EmptyState
            icon="activity"
            title="Sem cardio prescrito nesta semana"
            description="Seu plano ativo não inclui cardio para esta semana."
          />
        </Card>
      ) : progresso ? (
        <Card testID="card-cardio-prescrito">
          <Text style={styles.metaTitulo}>Cardio desta semana</Text>
          {prescricao.duracaoSegundos != null ? (
            <Text style={styles.detalheSecundario}>
              {`Prescrito: ${formatarDuracao(Math.round(prescricao.duracaoSegundos / 60))} no total`}
            </Text>
          ) : null}

          {progresso.metaMinutos != null ? (
            <>
              <Text style={styles.detalhe}>
                {`${formatarNumeroCompacto(progresso.minutos)} de ${formatarNumeroCompacto(progresso.metaMinutos)} min`}
              </Text>
              <ProgressTrack
                ratio={progresso.fracaoMinutos ?? 0}
                accessibilityLabel="Progresso dos minutos de cardio prescritos"
                style={styles.barra}
              />
            </>
          ) : null}

          {progresso.prescritoKm != null ? (
            <>
              <Text style={styles.detalhe}>
                {`${formatarNumeroCompacto(progresso.realizadoKm ?? 0)} de ${formatarNumeroCompacto(progresso.prescritoKm)} km`}
              </Text>
              <ProgressTrack
                ratio={progresso.fracaoKm ?? 0}
                accessibilityLabel="Progresso da distância de cardio prescrita"
                style={styles.barra}
              />
            </>
          ) : null}

          {progresso.metaSessoes != null ? (
            <>
              <Text style={styles.detalhe}>
                {`${progresso.sessoes} de ${progresso.metaSessoes} ${progresso.metaSessoes === 1 ? 'dia' : 'dias'} com cardio`}
              </Text>
              <ProgressTrack
                ratio={progresso.fracaoSessoes ?? 0}
                accessibilityLabel="Progresso dos dias de cardio prescritos"
                style={styles.barra}
              />
            </>
          ) : null}

          {progresso.atingida ? <Text style={styles.detalhe}>Semana cumprida.</Text> : null}
        </Card>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xxl },
  metaTitulo: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  detalheSecundario: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  barra: { marginTop: theme.spacing.sm },
  detalhe: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
});

export default CardioPrescritoSection;
