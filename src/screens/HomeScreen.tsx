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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { useDiaLocal } from '../hooks/useDiaLocal';
import {
  getTodaySession,
  getUpcomingSessions,
  fecharSessoesDeSemanasVencidas,
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
import { semanasConstantes } from '../engine/progressStats';
import { localTodayISO } from '../engine/agendaDias';
import { normalizeName } from '../engine/sessionModel';
import { updateTrainingBadge } from '../utils/pushBadge';
import type { Theme } from '../theme/theme';
import { useTheme, useThemeStyles } from '../theme/ThemeProvider';
import { Screen, Card, SectionHeader, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice, Skeleton } from '../components/ui/Feedback';
import FModules from '../components/ui/FModules';
import { JointEntryCard } from '../components/joint';
import { isJointTrainingEnabled } from '../config/featureFlags';

// A tipagem da HomeStack vive em MainNavigator — fonte ÚNICA. A cópia local que
// existia aqui só quebraria em runtime: adicionar rota lá e esquecer daqui
// compila e falha no aparelho.
import type { HomeStackParamList } from '../navigation/MainNavigator';

const formatarData = (isoDate: string | null): string =>
  isoDate ? new Date(`${isoDate}T12:00:00`).toLocaleDateString('pt-BR') : '';

const saudacao = (hora: number): string => {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
};

const HomeScreen = () => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const navigation = useNavigation<StackNavigationProp<HomeStackParamList, 'HomeMain'>>();
  const { user, profile } = useAuth();
  const [todaySession, setTodaySession] = useState<PlannedSession | null>(null);
  const [upcoming, setUpcoming] = useState<PlannedSession[]>([]);
  // `null` = "ainda não sei": o estado vazio da semana só aparece depois de o
  // banco confirmar que o histórico está mesmo vazio.
  const [completed, setCompleted] = useState<CompletedSessionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "nenhum treino": estados distintos (achado #9 do review)
  const [loadError, setLoadError] = useState(false);
  // O histórico falha de forma independente: o plano continua utilizável.
  const [historyError, setHistoryError] = useState(false);
  // Cada carga tem uma geração; resposta de geração antiga é descartada para
  // um retry não ser sobrescrito por uma resposta atrasada.
  const geracaoPlanoRef = useRef(0);
  const geracaoHistoricoRef = useRef(0);

  const userName = profile?.full_name || 'Atleta';
  const primeiroNome = userName.split(' ')[0];

  const carregarPlano = useCallback(async () => {
    if (!user) return;
    const geracao = ++geracaoPlanoRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      // Fechamento de semanas vencidas antes de montar a fila: pendentes de
      // semanas que já passaram não podem ocupar o card de "hoje". Falha NÃO
      // derruba a Home (não-fatal) — o fechador roda de novo na próxima carga.
      await fecharSessoesDeSemanasVencidas(user.id, localTodayISO()).catch((err) =>
        console.warn('[fechamento] falhou (não-fatal):', err)
      );
      const [hoje, proximos] = await Promise.all([
        getTodaySession(user.id),
        getUpcomingSessions(user.id, 5),
      ]);
      if (geracao !== geracaoPlanoRef.current) return;
      setTodaySession(hoje);
      // A lista não repete o treino que já está no card de hoje
      setUpcoming(proximos.filter((sessao) => sessao.id !== hoje?.id));
    } catch (error) {
      console.error('Erro ao buscar treinos:', error);
      if (geracao !== geracaoPlanoRef.current) return;
      setTodaySession(null);
      setUpcoming([]);
      setLoadError(true);
    } finally {
      if (geracao === geracaoPlanoRef.current) setLoading(false);
    }
    // Depende do ID (estável), não da identidade do objeto user: evita
    // relançar o efeito a cada render se o contexto recriar o objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // O histórico alimenta "Sua semana" e "Última sessão". Uma falha aqui não
  // pode derrubar o card do treino de hoje.
  const carregarHistorico = useCallback(async () => {
    if (!user) return;
    const geracao = ++geracaoHistoricoRef.current;
    setHistoryError(false);
    try {
      const historico = await getCompletedSessions(user.id);
      if (geracao !== geracaoHistoricoRef.current) return;
      setCompleted(historico);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      if (geracao !== geracaoHistoricoRef.current) return;
      setCompleted(null);
      setHistoryError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Em paralelo: o histórico não espera o plano nem é derrubado por ele.
  const fetchData = useCallback(() => {
    carregarPlano();
    carregarHistorico();
  }, [carregarPlano, carregarHistorico]);

  // Foco, não montagem: concluir um treino e voltar via popToTop não remonta
  // esta tela — sem isso, contagem e "Última sessão" ficariam obsoletas.
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const abrirDetalhe = (sessionId: string) => {
    navigation.navigate('WorkoutDetail', { sessionId });
  };

  // Dia local vivo: vira à meia-noite e ao voltar ao primeiro plano, para a
  // semana não continuar na anterior depois do domingo.
  const hoje = useDiaLocal();

  // Semana corrente derivada do histórico real (ver src/utils/weekSummary.ts);
  // `null` enquanto o histórico ainda não respondeu.
  const semana = useMemo(
    () => (completed ? resumirSemana(completed, new Date(`${hoje}T12:00:00`)) : null),
    [completed, hoje],
  );
  const ultima = completed?.[0] ?? null;

  // Conjunto normalizado de grupos musculares, na mesma régua dos dois lados.
  const gruposIguais = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const na = a.map(normalizeName).sort();
    const nb = b.map(normalizeName).sort();
    return na.every((g, i) => g === nb[i]);
  };

  // A próxima prescrição REPETE título E grupos da última sessão concluída?
  // Só com os dois iguais (não mera interseção acidental) o destaque precisa
  // explicitar data e semana para comunicar que é OUTRA sessão.
  const repeticao =
    todaySession != null &&
    ultima != null &&
    normalizeName(todaySession.title) === normalizeName(ultima.title) &&
    gruposIguais(todaySession.muscle_groups ?? [], ultima.muscleGroups ?? []);

  // Momentum REAL: semanas consecutivas com treino, ancoradas no dia local
  // (mesma régua da semana). Zero → o cabeçalho não exibe número nenhum.
  const streak = useMemo(
    () => (completed ? semanasConstantes(completed, new Date(`${hoje}T12:00:00`)) : 0),
    [completed, hoje],
  );

  const ehHoje = todaySession?.scheduled_date === hoje;
  const tituloDestaque = todaySession && !ehHoje ? 'Seu próximo treino' : 'Seu treino de hoje';

  // Badge do ícone do app (PUSH-04): reflete a MESMA condição de "treino
  // pendente hoje" já usada acima para o título/atraso — nenhuma segunda
  // fonte de verdade sobre pendência. Gated por suporte + permissão dentro
  // de updateTrainingBadge (no-op silencioso sem os dois, ver src/utils/
  // pushBadge.ts); a Home é a única tela que atualiza este badge.
  useEffect(() => {
    updateTrainingBadge(ehHoje && todaySession?.status === 'pending');
  }, [ehHoje, todaySession?.status]);

  // Verifica se o treino está atrasado
  const ehAtrasado = todaySession &&
    todaySession.scheduled_date &&
    todaySession.status === 'pending' &&
    todaySession.scheduled_date < hoje;

  const descricaoSessao = (sessao: PlannedSession): string =>
    sessao.muscle_groups?.length
      ? sessao.muscle_groups.join(' · ')
      : sessao.session_type || 'Sessão do seu plano';

  return (
    <Screen scroll testID="home-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{saudacao(new Date().getHours())}</Text>
          <Text style={styles.userName}>{primeiroNome}.</Text>
        </View>
        {streak > 0 ? (
          <View style={styles.momentum} testID="momentum-header">
            <FModules
              lit={Math.min(3, streak)}
              size={26}
              accessibilityLabel={`${streak} ${streak === 1 ? 'semana constante' : 'semanas constantes'}`}
            />
            <Text style={styles.momentumLabel}>
              {streak} {streak === 1 ? 'semana' : 'semanas'} no plano
            </Text>
          </View>
        ) : null}
      </View>

      {/* --- Treino em destaque --- */}
      <View style={styles.section}>
        <SectionHeader title={tituloDestaque} />

        {loading ? (
          <Skeleton
            height={196}
            radius={theme.borderRadius.xl}
            accessibilityLabel="Carregando o treino de hoje"
            testID="skl-treino-destaque"
          />
        ) : loadError ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar"
            description="Verifique a conexão e tente novamente."
            action={
              <Button label="Tentar novamente" variant="outline" compact onPress={carregarPlano} />
            }
          />
        ) : todaySession ? (
          <Card
            elevated
            testID="card-treino-destaque"
            onPress={() => abrirDetalhe(todaySession.id)}
            accessibilityLabel={`Abrir o treino ${todaySession.title}`}
          >
            <View style={styles.heroTop}>
              <Text style={styles.kicker}>
                {repeticao
                  ? 'Próxima sessão'
                  : ehHoje
                    ? 'Treino de hoje'
                    : 'Próximo treino'}
              </Text>
              <Text style={styles.heroMeta}>Semana {todaySession.week_number}</Text>
            </View>

            <Text style={styles.heroTitle}>{todaySession.title}</Text>
            <Text style={styles.heroDescription}>{descricaoSessao(todaySession)}</Text>

            {repeticao ? (
              <Text style={styles.repeticaoNote}>
                Você já concluiu esta sessão — confira a data e a semana: esta é
                outra prescrição dela.
              </Text>
            ) : null}

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

            {ehAtrasado ? (
              <View style={styles.atrasadoBadge}>
                <Chip label="Atrasado" tone="info" />
              </View>
            ) : null}

            {/* Caminho curto (Direção 03): Começar entra DIRETO na sessão — o
                check-in de foco recebe o aluno lá. O detalhe vira secundário. */}
            <View style={styles.heroActions}>
              <Button
                label="Começar"
                icon="arrow-right"
                compact
                onPress={() =>
                  navigation.navigate('ActiveSession', { sessionId: todaySession.id })
                }
                style={styles.heroPrimary}
              />
              <Button
                label="Detalhes"
                variant="tonal"
                compact
                onPress={() => abrirDetalhe(todaySession.id)}
                style={styles.heroSecondary}
              />
            </View>
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

      {/* --- Treinar junto: entra DEPOIS do treino do dia, que continua sendo o
           primeiro assunto da tela. O cartão abre a escolha; não cria convite.
           Gate por flag (achado A1): sem a migration 0026 em produção, o card
           quebra na criação e o lobby é beco sem saída. Ver src/config/featureFlags.ts --- */}
      {isJointTrainingEnabled() ? (
        <View style={styles.section}>
          <JointEntryCard
            onCriar={() => navigation.navigate('JointInvite')}
            onEntrar={() => navigation.navigate('JointJoin', {})}
          />
        </View>
      ) : null}

      {/* --- Sua semana: contagem e dias REAIS, sem meta inventada --- */}
      <View style={styles.section}>
        <SectionHeader title="Sua semana" />

        {historyError ? (
          <Notice
            tone="danger"
            title="Não foi possível carregar sua semana"
            description="Seus treinos concluídos aparecem aqui quando a conexão voltar."
            action={
              <Button
                label="Tentar novamente"
                variant="outline"
                compact
                onPress={carregarHistorico}
              />
            }
          />
        ) : !semana ? (
          // Histórico ainda pendente: "não sei" não é "nenhum treino"
          <Skeleton
            height={104}
            radius={theme.borderRadius.xl}
            accessibilityLabel="Carregando sua semana"
            testID="skl-semana"
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
          <View style={styles.skeletonRows}>
            <Skeleton height={52} accessibilityLabel="Carregando próximos treinos" />
            <Skeleton height={52} />
          </View>
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

const createStyles = (theme: Theme) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xxl,
  },
  momentum: { alignItems: 'flex-end', gap: theme.spacing.xs },
  momentumLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  heroActions: { flexDirection: 'row', gap: theme.spacing.sm },
  heroPrimary: { flex: 1.8 },
  heroSecondary: { flex: 1 },
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
  repeticaoNote: {
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
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
  atrasadoBadge: {
    marginBottom: theme.spacing.lg,
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

  skeletonRows: { gap: theme.spacing.sm },
  quietLine: {
    paddingVertical: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
});

export default HomeScreen;
