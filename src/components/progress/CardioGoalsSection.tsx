// src/components/progress/CardioGoalsSection.tsx
// Seção "Cardio" da aba Progresso (migration 0022 + engine/cardioGoals).
//
// Até aqui o cardio era medido com precisão (0014) e não aparecia em lugar
// nenhum do Progresso: constância, volume em kg e recordes de carga só falam de
// musculação, e o pace calculado no banco não tinha consumidor.
//
// Regra que este componente honra sem exceção: número só com lastro.
//  • meta de desempenho sem amostra equivalente mostra "—" e explica o porquê,
//    em vez de 0% que parece medido;
//  • meta de consistência mostra ZERO quando a semana está vazia, porque aí o
//    zero é o fato (e é a informação útil).

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import theme from '../../theme/theme';
import { Card, SectionHeader } from '../ui/Surface';
import Button from '../ui/Button';
import { EmptyState, Notice, ProgressTrack, Skeleton } from '../ui/Feedback';
import CardioGoalSheet, { type NovaMeta } from './CardioGoalSheet';
import {
  progressoConsistencia,
  progressoDesempenho,
  type CardioLog,
} from '../../engine/cardioGoals';
import { formatDistance, formatDuration, formatPace } from '../../engine/sessionModel';
import {
  arquivarMeta,
  definirMeta,
  registrarMetaBatida,
  type CardioGoal,
  type CardioGoalKind,
} from '../../services/cardioGoalRepository';

type Props = {
  /** null = carregando; [] = confirmado vazio. */
  logs: CardioLog[] | null;
  metas: CardioGoal[] | null;
  erro: boolean;
  onRecarregar: () => void;
};

const CardioGoalsSection = ({ logs, metas, erro, onRecarregar }: Props) => {
  const [sheetKind, setSheetKind] = useState<CardioGoalKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const metaDesempenho = metas?.find((m) => m.kind === 'desempenho') ?? null;
  const metaConsistencia = metas?.find((m) => m.kind === 'consistencia') ?? null;

  const progDesempenho = useMemo(() => {
    if (!logs || !metaDesempenho?.modality) return null;
    return progressoDesempenho(logs, {
      modality: metaDesempenho.modality,
      targetDistanceM: metaDesempenho.targetDistanceM ?? 0,
      targetDurationSeconds: metaDesempenho.targetDurationSeconds ?? 0,
    });
  }, [logs, metaDesempenho]);

  const progConsistencia = useMemo(() => {
    if (!logs || !metaConsistencia) return null;
    return progressoConsistencia(logs, {
      weeklyMinutes: metaConsistencia.weeklyMinutes,
      weeklySessions: metaConsistencia.weeklySessions,
    });
  }, [logs, metaConsistencia]);

  const executar = async (acao: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setErroAcao(null);
    try {
      await acao();
      // Relê do servidor: o estado da meta vem de lá, nunca de suposição da tela.
      onRecarregar();
      setSheetKind(null);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível salvar a meta.');
    } finally {
      setBusy(false);
    }
  };

  const confirmarMeta = (nova: NovaMeta) =>
    executar(() =>
      definirMeta(
        nova.kind === 'desempenho'
          ? {
              kind: 'desempenho',
              modality: nova.modality,
              targetDistanceM: nova.targetDistanceM,
              targetDurationSeconds: nova.targetDurationSeconds,
            }
          : {
              kind: 'consistencia',
              weeklyMinutes: nova.weeklyMinutes,
              weeklySessions: nova.weeklySessions,
            },
      ),
    );

  return (
    <View style={styles.section}>
      <SectionHeader title="Cardio" />

      {erro ? (
        <Notice
          tone="danger"
          title="Não foi possível carregar suas metas de cardio"
          action={
            <Button label="Tentar novamente" variant="outline" compact onPress={onRecarregar} />
          }
        />
      ) : logs === null || metas === null ? (
        <Skeleton
          height={128}
          radius={theme.borderRadius.xl}
          accessibilityLabel="Carregando metas de cardio"
        />
      ) : (
        <>
          {erroAcao ? (
            <Notice tone="warning" title="Não foi possível salvar" description={erroAcao} />
          ) : null}

          {/* --- Desempenho ------------------------------------------- */}
          <Card testID="card-meta-desempenho">
            {metaDesempenho && progDesempenho ? (
              <>
                <Text style={styles.metaTitulo}>
                  {`${metaDesempenho.modality} · ${formatDistance(metaDesempenho.targetDistanceM)} em ${formatDuration(metaDesempenho.targetDurationSeconds)}`}
                </Text>

                {progDesempenho.amostras === 0 ? (
                  <Text style={styles.semLastro}>
                    Ainda sem registro comparável — precisa de{' '}
                    {formatDistance(metaDesempenho.targetDistanceM)} de{' '}
                    {metaDesempenho.modality} com distância registrada.
                  </Text>
                ) : (
                  <>
                    <View style={styles.numeros}>
                      <View style={styles.numeroBloco}>
                        <Text style={styles.numeroRotulo}>Seu melhor</Text>
                        <Text style={styles.numeroValor}>
                          {formatPace(progDesempenho.melhorPaceSecPerKm)}
                        </Text>
                      </View>
                      <View style={styles.numeroBloco}>
                        <Text style={styles.numeroRotulo}>Alvo</Text>
                        <Text style={styles.numeroValor}>
                          {formatPace(progDesempenho.paceAlvoSecPerKm)}
                        </Text>
                      </View>
                    </View>
                    <ProgressTrack
                      ratio={progDesempenho.fracao ?? 0}
                      accessibilityLabel="Progresso da meta de desempenho"
                      style={styles.barra}
                    />
                    <Text style={styles.detalhe}>
                      {progDesempenho.atingida
                        ? `Meta alcançada — melhor esforço: ${formatDuration(progDesempenho.melhorDurationSeconds)} em ${formatDistance(progDesempenho.melhorDistanceM)}.`
                        : `Faltam ${formatDuration(progDesempenho.faltaSegundos)} no ritmo atual (${progDesempenho.amostras} ${progDesempenho.amostras === 1 ? 'esforço comparável' : 'esforços comparáveis'}).`}
                    </Text>
                  </>
                )}

                <View style={styles.acoes}>
                  {progDesempenho.atingida ? (
                    <Button
                      label="Bati esta meta"
                      variant="outline"
                      compact
                      disabled={busy}
                      onPress={() => executar(() => registrarMetaBatida(metaDesempenho.id))}
                      testID="meta-desempenho-bati"
                    />
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setSheetKind('desempenho')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Trocar a meta de desempenho"
                    style={styles.linkAcao}
                  >
                    <Text style={styles.linkAcaoLabel}>Trocar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => executar(() => arquivarMeta(metaDesempenho.id))}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Remover a meta de desempenho"
                    style={styles.linkAcao}
                  >
                    <Text style={styles.linkAcaoLabel}>Remover</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <EmptyState
                icon="target"
                title="Sem meta de tempo"
                description="Defina uma distância e um tempo para acompanhar o seu ritmo."
                action={
                  <Button
                    label="Definir meta de tempo"
                    variant="outline"
                    compact
                    onPress={() => setSheetKind('desempenho')}
                    testID="definir-meta-desempenho"
                  />
                }
              />
            )}
          </Card>

          {/* --- Consistência ----------------------------------------- */}
          <Card testID="card-meta-consistencia" style={styles.cardSeguinte}>
            {metaConsistencia && progConsistencia ? (
              <>
                <Text style={styles.metaTitulo}>Rotina desta semana</Text>

                {progConsistencia.metaMinutos != null ? (
                  <>
                    <Text style={styles.detalhe}>
                      {`${progConsistencia.minutos} de ${progConsistencia.metaMinutos} min`}
                    </Text>
                    <ProgressTrack
                      ratio={progConsistencia.fracaoMinutos ?? 0}
                      accessibilityLabel="Progresso dos minutos de cardio da semana"
                      style={styles.barra}
                    />
                  </>
                ) : null}

                {progConsistencia.metaSessoes != null ? (
                  <>
                    <Text style={styles.detalhe}>
                      {`${progConsistencia.sessoes} de ${progConsistencia.metaSessoes} ${progConsistencia.metaSessoes === 1 ? 'dia' : 'dias'} com cardio`}
                    </Text>
                    <ProgressTrack
                      ratio={progConsistencia.fracaoSessoes ?? 0}
                      accessibilityLabel="Progresso dos dias com cardio na semana"
                      style={styles.barra}
                    />
                  </>
                ) : null}

                {progConsistencia.atingida ? (
                  <Text style={styles.detalhe}>Semana cumprida.</Text>
                ) : null}

                <View style={styles.acoes}>
                  <TouchableOpacity
                    onPress={() => setSheetKind('consistencia')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Trocar a meta de rotina"
                    style={styles.linkAcao}
                  >
                    <Text style={styles.linkAcaoLabel}>Trocar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => executar(() => arquivarMeta(metaConsistencia.id))}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Remover a meta de rotina"
                    style={styles.linkAcao}
                  >
                    <Text style={styles.linkAcaoLabel}>Remover</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <EmptyState
                icon="repeat"
                title="Sem meta de rotina"
                description="Defina minutos ou dias de cardio por semana para acompanhar a constância."
                action={
                  <Button
                    label="Definir meta de rotina"
                    variant="outline"
                    compact
                    onPress={() => setSheetKind('consistencia')}
                    testID="definir-meta-consistencia"
                  />
                }
              />
            )}
          </Card>
        </>
      )}

      <CardioGoalSheet
        visible={sheetKind != null}
        kind={sheetKind ?? 'desempenho'}
        busy={busy}
        onConfirm={confirmarMeta}
        onDismiss={() => setSheetKind(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xxl },
  cardSeguinte: { marginTop: theme.spacing.md },
  metaTitulo: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  semLastro: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    lineHeight: theme.typography.fontSizes.sm * theme.typography.lineHeights.normal,
  },
  numeros: { flexDirection: 'row', gap: theme.spacing.xl, marginTop: theme.spacing.md },
  numeroBloco: { gap: 2 },
  numeroRotulo: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    textTransform: 'uppercase',
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  numeroValor: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  barra: { marginTop: theme.spacing.sm },
  detalhe: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  acoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  linkAcao: { minHeight: theme.hitTarget.compact, justifyContent: 'center' },
  linkAcaoLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    textDecorationLine: 'underline',
  },
});

export default CardioGoalsSection;
