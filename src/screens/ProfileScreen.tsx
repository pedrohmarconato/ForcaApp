// src/screens/ProfileScreen.tsx
// Tela 06 do fluxo — Perfil: identidade da conta, números do treino e saída.
//
// Regra de dado: as três métricas vêm do histórico REAL de execuções. Sem
// amostra, cada uma renderiza "—" (ver componente Metric) em vez de zero
// travestido de resultado. Nenhuma linha de preferência é exibida sem tela
// correspondente — controle morto é pior que ausência.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { useAuth } from '../contexts/AuthContext';
import { useDiaLocal } from '../hooks/useDiaLocal';
import { useTheme, useThemeStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import {
  getCompletedSessions,
  type CompletedSessionSummary,
} from '../services/sessionExecutionRepository';
import { hasSessionInProgress } from '../services/trainingRepository';
import { resumirSemana, minutosTotais, formatarDuracao } from '../utils/weekSummary';
import { comTimeout, GUARD_TIMEOUT_MS } from '../utils/comTimeout';
import {
  Screen,
  ScreenTitle,
  Card,
  ListRow,
  SectionHeader,
} from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Metric, MetricGroup, Notice } from '../components/ui/Feedback';
import RefazerTreinoSheet from '../components/profile/RefazerTreinoSheet';
import {
  ProfileStackParamList,
  MainTabParamList,
} from '../navigation/MainNavigator';
import {
  getExistingSubscriptionState,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushSubscription';
import apiClient, { ENDPOINTS } from '../services/api/apiClient';
import { logger } from '../utils/logger';

/** Estado do opt-in de notificações — reflete permissão real do navegador +
 * subscription persistida (não só o clique desta visita). */
type NotifState = 'unsupported' | 'default' | 'denied' | 'subscribing' | 'subscribed';

/** Iniciais para o bloco de identidade (no máximo duas). */
const iniciais = (nome: string): string =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');

// Navegação do Perfil é um stack DENTRO da tab "Profile". O composite permite
// saltar para outra aba — é como "Refazer treino" empurra o Questionnaire no
// stack de Treino sem a tela precisar conhecer o tab navigator por dentro.
type ProfileScreenNavigationProp = CompositeNavigationProp<
  StackNavigationProp<ProfileStackParamList, 'ProfileMain'>,
  BottomTabNavigationProp<MainTabParamList>
>;

const ProfileScreen = () => {
  const { user, profile, signOut } = useAuth();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);

  const [completed, setCompleted] = useState<CompletedSessionSummary[] | null>(null);
  const [statsError, setStatsError] = useState(false);
  // Cada carga tem uma geração; resposta de geração antiga é descartada para
  // um retry não ser sobrescrito por uma falha atrasada.
  const geracaoRef = useRef(0);

  // Guard do "Refazer treino": não arquivar um plano com sessão em andamento.
  // `checandoRef` trava o toque duplo no nível da chamada (estado assíncrono
  // não renderiza a tempo de barrar dois toques no mesmo tick).
  const [sheetVisivel, setSheetVisivel] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [bloqueadoPorSessao, setBloqueadoPorSessao] = useState(false);
  const [guardError, setGuardError] = useState(false);
  const checandoRef = useRef(false);

  // Opt-in de notificações (PUSH-01): inicializa a partir da permissão REAL
  // do navegador — 'unsupported' fora do alvo web/Safari fora de PWA
  // instalado (silencioso, sem Notice).
  const [notifState, setNotifState] = useState<NotifState>(() => {
    if (!isPushSupported()) return 'unsupported';
    return typeof Notification !== 'undefined' ? (Notification.permission as NotifState) : 'default';
  });
  const [notifError, setNotifError] = useState(false);

  const buscarHistorico = useCallback(async () => {
    if (!user) return;
    const geracao = ++geracaoRef.current;
    setStatsError(false);
    try {
      const historico = await getCompletedSessions(user.id);
      if (geracao !== geracaoRef.current) return;
      setCompleted(historico);
    } catch (err) {
      console.error('Erro ao buscar histórico do perfil:', err);
      if (geracao !== geracaoRef.current) return;
      // Falha ≠ zero: mantém `completed` nulo para as métricas exibirem "—".
      setCompleted(null);
      setStatsError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const abrirRefazerTreino = useCallback(async () => {
    if (!user || checandoRef.current) return;
    checandoRef.current = true;
    setGuardError(false);
    // Zera o veredito da rodada anterior: o sheet mostra o spinner de
    // checagem e NUNCA reapresenta o estado velho enquanto a consulta roda.
    setBloqueadoPorSessao(false);
    setVerificando(true);
    setSheetVisivel(true);
    try {
      const bloqueado = await comTimeout(hasSessionInProgress(user.id), GUARD_TIMEOUT_MS);
      setBloqueadoPorSessao(bloqueado);
    } catch (err) {
      console.error('Erro ao checar treino em andamento:', err);
      // Falha ≠ zero: sem confirmação confiável, não libera a regeneração.
      setSheetVisivel(false);
      setGuardError(true);
    } finally {
      checandoRef.current = false;
      setVerificando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const confirmarRefazer = useCallback(() => {
    setSheetVisivel(false);
    // Cross-tab: empurra o Questionnaire no stack de Treino. `initial: false`
    // vale só no PRIMEIRO mount do stack (insere TrainingOverview como raiz
    // quando a aba Plano ainda não foi aberta na sessão); se o stack já
    // existe, o estado dele é preservado. Nos dois casos o popToTop() final da
    // regeneração pousa em TrainingOverview — o back durante o questionário
    // pode voltar a uma rota do stack de Treino, não ao Perfil.
    navigation.navigate('Training', { screen: 'Questionnaire', initial: false });
  }, [navigation]);

  const abrirAjustes = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const fecharRefazer = useCallback(() => setSheetVisivel(false), []);

  // Critério 2 (literal): subscribeToPush() é a PRIMEIRA expressão síncrona
  // deste handler — nenhum await/checagem antes, ou o iOS descarta o gesto
  // do usuário (Pitfall 3 de 13-RESEARCH.md).
  const onAtivarNotificacoes = useCallback(() => {
    // WR-01 de 13-REVIEW.md: 'subscribing' precisa ser setado aqui — depois
    // de subscribeToPush() (Critério 2 acima), mas antes de qualquer outro
    // trabalho assíncrono — para o guard `disabled={notifState ===
    // 'subscribing'}` do botão realmente impedir um segundo toque enquanto a
    // cadeia subscribeToPush()->POST /api/push/subscribe está em voo.
    setNotifState('subscribing');
    subscribeToPush()
      .then((subJson) => apiClient.post(ENDPOINTS.PUSH.SUBSCRIBE, subJson))
      .then(() => setNotifState('subscribed'))
      .catch((err) => {
        logger.warn('[profile] falha ao ativar notificações:', err);
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          setNotifState('denied');
        } else {
          // Sai de 'subscribing' de volta para 'default' — senão o botão
          // ficaria permanentemente desabilitado após uma falha que não seja
          // de permissão negada.
          setNotifState('default');
          setNotifError(true);
        }
      });
  }, []);

  const onDesativarNotificacoes = useCallback(() => {
    unsubscribeFromPush()
      .then(() => setNotifState('default'))
      .catch((err) => {
        logger.warn('[profile] falha ao desativar notificações:', err);
        setNotifError(true);
      });
  }, []);

  // Reflete uma subscription JÁ existente de uma sessão anterior: sem isto,
  // um aluno que já ativou numa visita anterior veria o botão errado
  // ("Ativar" em vez de "Desativar") até tocar de novo.
  useEffect(() => {
    if (!isPushSupported()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    getExistingSubscriptionState()
      .then((estado) => {
        if (estado === 'subscribed') setNotifState('subscribed');
      })
      .catch((err) => {
        logger.warn('[profile] falha ao checar subscription existente:', err);
      });
  }, []);

  // Foco, não montagem: voltar de uma sessão recém-concluída via popToTop não
  // remonta esta tela — sem isso, as métricas ficariam obsoletas.
  useFocusEffect(
    useCallback(() => {
      buscarHistorico();
    }, [buscarHistorico]),
  );

  const nome = profile?.full_name || user?.email || 'Atleta';
  // Dia local vivo: vira à meia-noite e ao voltar ao primeiro plano, para
  // "Nesta semana" não continuar na semana velha depois do domingo.
  const hoje = useDiaLocal();

  // `null` significa "sem amostra confiável" e chega ao Metric como "—".
  const metricas = useMemo(() => {
    if (!completed) return { sessoes: null, tempo: null, semana: null };

    return {
      sessoes: completed.length,
      tempo: formatarDuracao(minutosTotais(completed)),
      semana: resumirSemana(completed, new Date(`${hoje}T12:00:00`)).concluidas,
    };
  }, [completed, hoje]);

  return (
    <Screen scroll>
      <ScreenTitle kicker="Conta" title="Seu perfil." />

      <Card style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.accent.soft }]}>
          <Text style={[styles.avatarText, { color: theme.colors.text.accent }]}>
            {iniciais(nome)}
          </Text>
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{profile?.full_name || user?.email}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </Card>

      {statsError ? (
        <Notice
          tone="danger"
          title="Não foi possível carregar seus números"
          description="Eles voltam a aparecer quando a conexão for restabelecida."
          style={styles.notice}
          action={<Button label="Tentar novamente" variant="outline" compact onPress={buscarHistorico} />}
        />
      ) : null}

      <MetricGroup style={styles.metrics}>
        <Metric value={metricas.sessoes} label="Sessões" />
        <Metric value={metricas.tempo} label="Tempo total" />
        <Metric value={metricas.semana} label="Nesta semana" />
      </MetricGroup>

      <SectionHeader title="Preferencias" style={styles.preferencesHeader} />
      <ListRow
        title="Ajustes"
        subtitle="Aparencia"
        showChevron
        onPress={abrirAjustes}
        testID="profile-settings-row"
        style={styles.preferencesRow}
      />

      {/* Regeneração do plano a partir do Perfil (acesso fixo, não só no Nível 4).
          outline para não competir com o tonal do sheet nem com o danger do Sair. */}
      <Button
        label="Refazer treino"
        variant="outline"
        onPress={abrirRefazerTreino}
        disabled={verificando}
        style={styles.refazer}
      />

      {guardError ? (
        <Notice
          tone="danger"
          title="Não foi possível checar seu treino em andamento"
          description="Nada foi arquivado. Tente de novo quando a conexão voltar."
          style={styles.guardError}
          action={
            <Button
              label="Checar de novo"
              variant="outline"
              compact
              onPress={abrirRefazerTreino}
            />
          }
        />
      ) : null}

      {/* Opt-in de notificações (PUSH-01). 'unsupported' fica silencioso —
          Safari fora de PWA instalado não suporta Web Push. */}
      {notifState === 'unsupported' ? null : notifState === 'denied' ? (
        <Notice
          tone="info"
          title="Notificações desativadas"
          description="Você negou a permissão de notificações. Para reativar, vá em Ajustes do iPhone → Notificações → ForçaApp."
          style={styles.notice}
        />
      ) : notifState === 'subscribed' ? (
        <Button
          label="Desativar notificações"
          variant="outline"
          onPress={onDesativarNotificacoes}
          style={styles.refazer}
        />
      ) : (
        <>
          <Button
            label="Ativar notificações"
            variant="outline"
            onPress={onAtivarNotificacoes}
            disabled={notifState === 'subscribing'}
            style={styles.refazer}
          />
          {notifError ? (
            <Notice
              tone="danger"
              title="Não foi possível ativar as notificações"
              description="Tente novamente quando a conexão voltar."
              style={styles.notice}
            />
          ) : null}
        </>
      )}

      {/* Direção 03: o histórico virou cidadão da aba Progresso. */}
      <Button label="Sair" variant="danger" onPress={signOut} style={styles.logout} />

      <RefazerTreinoSheet
        visible={sheetVisivel}
        bloqueadoPorSessaoEmAndamento={bloqueadoPorSessao}
        verificando={verificando}
        onConfirmar={confirmarRefazer}
        onDismiss={fecharRefazer}
      />
    </Screen>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.lg,
  },
  avatarText: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
  },
  identityCopy: { flex: 1, minWidth: 0 },
  name: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  email: {
    marginTop: 2,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  notice: { marginBottom: theme.spacing.lg },
  metrics: { marginBottom: theme.spacing.xxl },
  preferencesHeader: { marginBottom: theme.spacing.sm },
  preferencesRow: { marginBottom: theme.spacing.lg },

  refazer: { marginBottom: theme.spacing.md },
  guardError: { marginBottom: theme.spacing.lg },

  logout: { marginTop: theme.spacing.xxl },
});

export default ProfileScreen;
