// src/screens/ProgressScreen.tsx
// Aba Progresso (Direção 03) — constância, volume, recordes e histórico.
//
// Regras de dado (herdadas de weekSummary/progressStats):
//  - nada de meta ou percentual de adesão: não existe denominador persistido;
//  - volume/recorde só com carga E reps reais; sem amostra → estado vazio;
//  - falhas de carga são independentes (constância não derruba recordes).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import theme from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import type { ProgressStackParamList } from '../navigation/MainNavigator';
import {
  getCompletedSessions,
  getSetLogsResumo,
  type CompletedSessionSummary,
} from '../services/sessionExecutionRepository';
import type { SetLogResumo } from '../engine/progressStats';
import {
  constanciaSemanal,
  recordesPorExercicio,
  volumePorSemana,
} from '../engine/progressStats';
import {
  DIAS_DA_SEMANA,
  duracaoEmMinutos,
  formatarDataCurta,
  formatarDuracao,
} from '../utils/weekSummary';
import { getCardioLogs } from '../services/cardioGoalRepository';
import type { CardioLog } from '../engine/cardioGoals';
import { getPrescricaoSemanaCorrente } from '../services/cardioPrescritoRepository';
import type { PrescricaoCardio } from '../engine/cardioPrescrito';
import CardioPrescritoSection from '../components/progress/CardioPrescritoSection';
import CardioEvolucaoChart from '../components/progress/CardioEvolucaoChart';
import { Screen, ScreenTitle, Card, SectionHeader, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice, Skeleton } from '../components/ui/Feedback';

const SEMANAS_CONSTANCIA = 4;
const SEMANAS_VOLUME = 8;
const RECORDES_LIMITE = 5;
const HISTORICO_PREVIA = 3;

const formatarKg = (v: number): string =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const ProgressScreen = () => {
  const navigation =
    useNavigation<StackNavigationProp<ProgressStackParamList, 'ProgressMain'>>();
  const { user } = useAuth();

  // `null` = ainda não sei (skeleton); [] = confirmado vazio (estado vazio).
  const [sessoes, setSessoes] = useState<CompletedSessionSummary[] | null>(null);
  const [setLogs, setSetLogs] = useState<SetLogResumo[] | null>(null);
  const [erroSessoes, setErroSessoes] = useState(false);
  const [erroSetLogs, setErroSetLogs] = useState(false);
  // Cardio (REQ-02): séries de cardio + prescrição do plano ativo. Falhar
  // aqui não derruba o resto da aba — cada seção carrega e erra por conta
  // própria.
  const [cardioLogs, setCardioLogs] = useState<CardioLog[] | null>(null);
  const [prescricaoCardio, setPrescricaoCardio] = useState<PrescricaoCardio | null>(null);
  const [erroCardio, setErroCardio] = useState(false);
  const geracaoRef = useRef(0);

  const carregar = useCallback(() => {
    if (!user) return;
    const geracao = ++geracaoRef.current;

    setErroSessoes(false);
    getCompletedSessions(user.id)
      .then((r) => {
        if (geracao === geracaoRef.current) setSessoes(r);
      })
      .catch((err) => {
        console.error('Erro ao carregar sessões do progresso:', err);
        if (geracao === geracaoRef.current) {
          setSessoes(null);
          setErroSessoes(true);
        }
      });

    setErroSetLogs(false);
    getSetLogsResumo(user.id)
      .then((r) => {
        if (geracao === geracaoRef.current) setSetLogs(r);
      })
      .catch((err) => {
        console.error('Erro ao carregar séries do progresso:', err);
        if (geracao === geracaoRef.current) {
          setSetLogs(null);
          setErroSetLogs(true);
        }
      });
    setErroCardio(false);
    Promise.all([getCardioLogs(user.id), getPrescricaoSemanaCorrente(user.id)])
      .then(([logs, prescricao]) => {
        if (geracao !== geracaoRef.current) return;
        setCardioLogs(logs);
        setPrescricaoCardio(prescricao);
      })
      .catch((err) => {
        console.error('Erro ao carregar cardio do progresso:', err);
        if (geracao !== geracaoRef.current) return;
        setCardioLogs(null);
        setPrescricaoCardio(null);
        setErroCardio(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const constancia = useMemo(
    () => (sessoes ? constanciaSemanal(sessoes, SEMANAS_CONSTANCIA) : null),
    [sessoes],
  );
  const volume = useMemo(
    () => (setLogs ? volumePorSemana(setLogs, SEMANAS_VOLUME) : null),
    [setLogs],
  );
  const recordes = useMemo(
    () => (setLogs ? recordesPorExercicio(setLogs, RECORDES_LIMITE) : null),
    [setLogs],
  );

  const maxVolume = volume ? Math.max(...volume.map((s) => s.volumeKg)) : 0;
  // Rótulo direto seletivo (dataviz): só a semana atual e a maior anterior.
  const maiorAnterior = useMemo(() => {
    if (!volume) return null;
    const anteriores = volume.filter((s) => !s.atual && s.volumeKg > 0);
    if (anteriores.length === 0) return null;
    return anteriores.reduce((a, b) => (b.volumeKg > a.volumeKg ? b : a));
  }, [volume]);

  const historicoPrevia = sessoes?.slice(0, HISTORICO_PREVIA) ?? [];

  return (
    <Screen scroll testID="progress-screen">
      <ScreenTitle kicker="Progresso" title="Sua evolução." />

      {/* --- Constância ------------------------------------------------- */}
      <View style={styles.section}>
        <SectionHeader title="Constância" />
        {erroSessoes ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar suas semanas"
            action={<Button label="Tentar novamente" variant="outline" compact onPress={carregar} />}
          />
        ) : !constancia ? (
          <Skeleton height={128} radius={theme.borderRadius.xl} accessibilityLabel="Carregando constância" />
        ) : sessoes && sessoes.length === 0 ? (
          <Card>
            <EmptyState
              icon="activity"
              title="Nenhum treino concluído ainda"
              description="Sua constância aparece aqui a partir da primeira sessão."
            />
          </Card>
        ) : (
          <Card testID="card-constancia">
            <View style={styles.constHeaderRow}>
              <Text style={styles.constHeaderLabel} />
              <View style={styles.constDots}>
                {DIAS_DA_SEMANA.map((d) => (
                  <Text key={d} style={styles.constDia}>
                    {d[0]}
                  </Text>
                ))}
              </View>
              <Text style={styles.constCount} />
            </View>
            {constancia.map((semana) => (
              <View key={semana.rotulo} style={styles.constRow}>
                <Text style={[styles.constRotulo, semana.atual && styles.constRotuloAtual]}>
                  {semana.rotulo}
                </Text>
                <View style={styles.constDots}>
                  {semana.diasComTreino.map((feito, ix) => (
                    <View
                      key={ix}
                      style={[styles.constDot, feito && styles.constDotFeito]}
                    />
                  ))}
                </View>
                <Text style={styles.constCount}>
                  {semana.concluidas > 0
                    ? `${semana.concluidas} ${semana.concluidas === 1 ? 'treino' : 'treinos'}`
                    : '—'}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </View>

      {/* --- Volume por semana ------------------------------------------ */}
      <View style={styles.section}>
        <SectionHeader title="Volume por semana" />
        {erroSetLogs ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar o volume"
            action={<Button label="Tentar novamente" variant="outline" compact onPress={carregar} />}
          />
        ) : !volume ? (
          <Skeleton height={168} radius={theme.borderRadius.xl} accessibilityLabel="Carregando volume" />
        ) : maxVolume === 0 ? (
          <Card>
            <EmptyState
              icon="bar-chart-2"
              title="Sem séries com carga ainda"
              description="O volume soma repetições × carga das séries registradas."
            />
          </Card>
        ) : (
          <Card testID="card-volume">
            <View style={styles.chartArea}>
              {volume.map((semana) => {
                const proporcao = maxVolume > 0 ? semana.volumeKg / maxVolume : 0;
                const mostraRotulo =
                  semana.atual || (maiorAnterior && semana.rotulo === maiorAnterior.rotulo);
                return (
                  <View key={semana.rotulo} style={styles.barCol}>
                    {mostraRotulo && semana.volumeKg > 0 ? (
                      <Text style={styles.barValor}>{formatarKg(semana.volumeKg)}</Text>
                    ) : null}
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max(3, Math.round(96 * proporcao)) },
                        semana.atual && styles.barAtual,
                      ]}
                      accessibilityLabel={`${semana.rotulo}: ${formatarKg(semana.volumeKg)} quilos`}
                    />
                  </View>
                );
              })}
            </View>
            <View style={styles.chartBase} />
            <View style={styles.chartX}>
              {volume.map((semana) => (
                <Text
                  key={semana.rotulo}
                  style={[styles.barRotulo, semana.atual && styles.barRotuloAtual]}
                >
                  {semana.rotulo}
                </Text>
              ))}
            </View>
            <Text style={styles.chartUnidade}>kg levantados · reps × carga</Text>
          </Card>
        )}
      </View>

      {/* --- Cardio: prescrito x realizado (REQ-02) ---------------------- */}
      <CardioPrescritoSection
        logs={cardioLogs}
        prescricao={prescricaoCardio}
        erro={erroCardio}
        onRecarregar={carregar}
      />

      {/* --- Cardio: evolução de pace/km por modalidade ------------------ */}
      <CardioEvolucaoChart />

      {/* --- Recordes ---------------------------------------------------- */}
      <View style={styles.section}>
        <SectionHeader title="Recordes" />
        {erroSetLogs ? (
          <Text style={styles.quietLine}>Não foi possível carregar seus recordes.</Text>
        ) : !recordes ? (
          <Skeleton height={64} accessibilityLabel="Carregando recordes" />
        ) : recordes.length === 0 ? (
          <Text style={styles.quietLine}>Seus recordes de carga aparecem aqui.</Text>
        ) : (
          recordes.map((r) => (
            <ListRow
              key={`${r.name}-${r.quando}`}
              title={r.name}
              subtitle={`${formatarKg(r.loadKg)} kg × ${r.reps}`}
              // R2 (review PR #73): o motor de recordes exclui séries de plano
              // purpose='joint' da agregação solo — este `leading` é defesa em
              // profundidade caso um dia chegue aqui um registro marcado.
              // TODO (dono): seção própria "Dupla" para recordes da dupla.
              leading={r.origemJoint ? <Chip label="Dupla" /> : undefined}
              trailingLabel={formatarDataCurta(r.quando) ?? undefined}
            />
          ))
        )}
      </View>

      {/* --- Histórico ---------------------------------------------------- */}
      <View style={styles.section}>
        <SectionHeader title="Histórico" />
        {erroSessoes ? (
          <Text style={styles.quietLine}>Não foi possível carregar o histórico.</Text>
        ) : !sessoes ? (
          <Skeleton height={64} accessibilityLabel="Carregando histórico" />
        ) : historicoPrevia.length === 0 ? (
          <Text style={styles.quietLine}>Suas sessões concluídas aparecem aqui.</Text>
        ) : (
          <>
            {historicoPrevia.map((sessao) => (
              <ListRow
                key={sessao.sessionLogId}
                title={sessao.title}
                subtitle={[
                  formatarDuracao(duracaoEmMinutos(sessao)),
                  formatarDataCurta(sessao.finishedAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                // Achado A4: sessão vinda de plano purpose='joint' leva o
                // marcador — sem isso ela parecia solo no Histórico.
                leading={sessao.origemJoint ? <Chip label="Dupla" /> : undefined}
                showChevron
                onPress={() =>
                  navigation.navigate('SessionHistoryDetail', {
                    sessionLogId: sessao.sessionLogId,
                    title: sessao.title,
                  })
                }
              />
            ))}
            <Button
              label="Ver histórico completo"
              variant="ghost"
              compact
              onPress={() => navigation.navigate('SessionHistory')}
            />
          </>
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xxl },

  constHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  constRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  constHeaderLabel: { width: 48 },
  constRotulo: {
    width: 48,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  constRotuloAtual: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  constDots: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  constDia: {
    width: 8,
    textAlign: 'center',
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
  constDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.veil.medium,
  },
  constDotFeito: { backgroundColor: theme.colors.accent.main },
  constCount: {
    width: 72,
    textAlign: 'right',
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 128,
    paddingTop: theme.spacing.lg,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: theme.spacing.xs },
  bar: {
    width: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: theme.palette.cinza,
  },
  barAtual: { backgroundColor: theme.colors.accent.main },
  barValor: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  chartBase: { height: 1, backgroundColor: theme.colors.border.strong },
  chartX: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  barRotulo: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: 8,
    letterSpacing: 0.4,
  },
  barRotuloAtual: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  chartUnidade: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },

  quietLine: {
    paddingVertical: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
});

export default ProgressScreen;
