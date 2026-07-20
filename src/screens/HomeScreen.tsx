// src/screens/HomeScreen.tsx
// Tela 04 do fluxo — "Hoje": prioridade e ritmo.
//
// A leitura desce em prioridade: o que treinar agora, como está a semana, o que
// vem depois. O neon aparece uma vez por bloco — na ação principal e nos dias
// já concluídos.
//
// Regra de dado: tudo aqui vem do plano e do histórico REAIS. Onde não há
// amostra, a tela mostra um estado vazio desenhado — nunca um número
// placeholder. Não existe meta semanal persistida no app, então a semana é
// apresentada como contagem e dias marcados, sem percentual de adesão.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import {
  getTodaySession,
  getUpcomingSessions,
  PlannedSession,
} from '../services/trainingRepository';
import {
  getCompletedSessions,
  CompletedSessionSummary,
} from '../services/sessionExecutionRepository';
import {
  resumirSemana,
  duracaoEmMinutos,
  formatarDuracao,
  formatarDataCurta,
  DIAS_DA_SEMANA,
} from '../utils/weekSummary';
import theme from '../theme/theme';
import { Screen, Card, SectionHeader, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice } from '../components/ui/Feedback';

// Tipagem da navegação dentro da HomeStack (HomeMain -> WorkoutDetail)
type HomeStackParamList = {
  HomeMain: undefined;
  WorkoutDetail: { sessionId: string };
};

const formatarData = (isoDate: string | null): string =>
  isoDate ? new Date(`${isoDate}T12:00:00`).toLocaleDateString('pt-BR') : '';

// Data local (não UTC) no formato YYYY-MM-DD, para comparar com scheduled_date
const hojeISO = (): string => {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
};

const saudacao = (hora: number): string => {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
};

const HomeScreen = () => {
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList, 'HomeMain'>>();
  const { user, profile } = useAuth();
  const [todaySession, setTodaySession] = useState<PlannedSession | null>(null);
  const [upcoming, setUpcoming] = useState<PlannedSession[]>([]);
  const [completed, setCompleted] = useState<CompletedSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "nenhum treino": estados distintos (achado #9 do review)
  const [loadError, setLoadError] = useState(false);
  // O histórico falha de forma independente: o plano continua utilizável.
  const [historyError, setHistoryError] = useState(false);

  const userName = profile?.full_name || 'Atleta';
  const primeiroNome = userName.split(' ')[0];

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    setHistoryError(false);
    try {
      const [hoje, proximos] = await Promise.all([
        getTodaySession(user.id),
        getUpcomingSessions(user.id, 5),
      ]);
      setTodaySession(hoje);
      // A lista não repete o treino que já está no card de hoje
      setUpcoming(proximos.filter((sessao) => sessao.id !== hoje?.id));
    } catch (error) {
      console.error('Erro ao buscar treinos:', error);
      setTodaySession(null);
      setUpcoming([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }

    // O histórico alimenta "Sua semana" e "Última sessão". Uma falha aqui não
    // pode derrubar o card do treino de hoje.
    try {
      setCompleted(await getCompletedSessions(user.id));
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      setCompleted([]);
      setHistoryError(true);
    }
    // Depende do ID (estável), não da identidade do objeto user: evita
    // relançar o efeito a cada render se o contexto recriar o objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const abrirDetalhe = (sessionId: string) => {
    navigation.navigate('WorkoutDetail', { sessionId });
  };

  // Semana corrente derivada do histórico real (ver src/utils/weekSummary.ts)
  const semana = useMemo(() => resumirSemana(completed, new Date()), [completed]);
  const ultima = completed[0] ?? null;

  const ehHoje = todaySession?.scheduled_date === hojeISO();
  const tituloDestaque = todaySession && !ehHoje ? 'Seu próximo treino' : 'Seu treino de hoje';

  const descricaoSessao = (sessao: PlannedSession): string =>
    sessao.muscle_groups?.length
      ? sessao.muscle_groups.join(' · ')
      : sessao.session_type || 'Sessão do seu plano';

  return (
    <Screen scroll testID="home-screen">
      <View style={styles.header}>
        <Text style={styles.greeting}>{saudacao(new Date().getHours())}</Text>
        <Text style={styles.userName}>{primeiroNome}.</Text>
      </View>

      {/* --- Treino em destaque --- */}
      <View style={styles.section}>
        <SectionHeader title={tituloDestaque} />

        {loading ? (
          <Card>
            <ActivityIndicator color={theme.colors.accent.main} />
          </Card>
        ) : loadError ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar"
            description="Verifique a conexão e tente novamente."
            action={<Button label="Tentar novamente" variant="outline" compact onPress={fetchData} />}
          />
        ) : todaySession ? (
          <Card elevated testID="card-treino-destaque">
            <View style={styles.heroTop}>
              <Text style={styles.kicker}>{ehHoje ? 'Treino de hoje' : 'Próximo treino'}</Text>
              <Text style={styles.heroMeta}>Semana {todaySession.week_number}</Text>
            </View>

            <Text style={styles.heroTitle}>{todaySession.title}</Text>
            <Text style={styles.heroDescription}>{descricaoSessao(todaySession)}</Text>

            <View style={styles.metaRow}>
              {todaySession.estimated_minutes ? (
                <View style={styles.metaItem}>
                  <Feather name="clock" size={13} color={theme.colors.accent.main} />
                  <Text style={styles.metaText}>{todaySession.estimated_minutes} min</Text>
                </View>
              ) : null}
              {todaySession.scheduled_date ? (
                <View style={styles.metaItem}>
                  <Feather name="calendar" size={13} color={theme.colors.accent.main} />
                  <Text style={styles.metaText}>{formatarData(todaySession.scheduled_date)}</Text>
                </View>
              ) : null}
            </View>

            <Button
              label="Ver treino"
              icon="arrow-right"
              compact
              onPress={() => abrirDetalhe(todaySession.id)}
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="calendar"
              title="Nenhum treino pendente"
              description="Complete o questionário e gere seu plano para começar."
            />
          </Card>
        )}
      </View>

      {/* --- Sua semana: contagem e dias REAIS, sem meta inventada --- */}
      <View style={styles.section}>
        <SectionHeader title="Sua semana" />

        {historyError ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar sua semana"
            description="Seus treinos concluídos aparecem aqui quando a conexão voltar."
          />
        ) : semana.concluidas === 0 ? (
          <Card>
            <EmptyState
              icon="activity"
              title="Nenhum treino concluído nesta semana"
              description="O resumo aparece assim que você finalizar a primeira sessão."
            />
          </Card>
        ) : (
          <Card testID="card-semana">
            <View style={styles.weekTop}>
              <Text style={styles.weekLabel}>Concluídos</Text>
              <View style={styles.weekCount}>
                <Text style={styles.weekValue}>{semana.concluidas}</Text>
                <Text style={styles.weekUnit}>
                  {semana.concluidas === 1 ? 'treino' : 'treinos'}
                </Text>
              </View>
            </View>

            <View style={styles.weekDays}>
              {DIAS_DA_SEMANA.map((dia, indice) => (
                <View key={dia} style={styles.weekDay}>
                  <View
                    style={[styles.weekDot, semana.diasComTreino[indice] && styles.weekDotDone]}
                  />
                  <Text
                    style={[
                      styles.weekDayLabel,
                      semana.diasComTreino[indice] && styles.weekDayLabelDone,
                    ]}
                  >
                    {dia}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>

      {/* --- Última sessão concluída --- */}
      {ultima ? (
        <View style={styles.section}>
          <SectionHeader title="Última sessão" />
          <ListRow
            title={ultima.title}
            subtitle={[
              formatarDuracao(duracaoEmMinutos(ultima)),
              formatarDataCurta(ultima.finishedAt),
            ]
              .filter(Boolean)
              .join(' · ')}
            testID="linha-ultima-sessao"
          />
        </View>
      ) : null}

      {/* --- Próximos treinos --- */}
      <View style={styles.section}>
        <SectionHeader title="Próximos treinos" />

        {loading ? (
          <ActivityIndicator color={theme.colors.accent.main} style={styles.inlineLoader} />
        ) : loadError ? (
          <Text style={styles.quietLine}>Não foi possível carregar seus treinos.</Text>
        ) : upcoming.length > 0 ? (
          upcoming.map((sessao) => (
            <ListRow
              key={sessao.id}
              title={sessao.title}
              subtitle={descricaoSessao(sessao)}
              leading={
                <Chip
                  label={
                    sessao.scheduled_date ? formatarData(sessao.scheduled_date).slice(0, 5) : '—'
                  }
                />
              }
              showChevron
              onPress={() => abrirDetalhe(sessao.id)}
            />
          ))
        ) : (
          <Text style={styles.quietLine}>Nenhum treino agendado</Text>
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: theme.spacing.xxl },
  greeting: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  userName: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },

  section: { marginBottom: theme.spacing.xxl },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  kicker: {
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.bold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  heroMeta: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
  heroTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },
  heroDescription: {
    marginTop: theme.spacing.xxs,
    marginBottom: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  metaText: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  weekTop: { marginBottom: theme.spacing.lg },
  weekLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  weekCount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xxs,
  },
  weekValue: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  weekUnit: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: theme.spacing.xs },
  weekDot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.veil.medium,
  },
  weekDotDone: { backgroundColor: theme.colors.accent.main },
  weekDayLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
  weekDayLabelDone: { color: theme.colors.text.primary },

  inlineLoader: { paddingVertical: theme.spacing.lg },
  quietLine: {
    paddingVertical: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
});

export default HomeScreen;
