// src/screens/ProfileScreen.tsx
// Tela 06 do fluxo — Perfil: identidade da conta, números do treino e saída.
//
// Regra de dado: as três métricas vêm do histórico REAL de execuções. Sem
// amostra, cada uma renderiza "—" (ver componente Metric) em vez de zero
// travestido de resultado. Nenhuma linha de preferência é exibida sem tela
// correspondente — controle morto é pior que ausência.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { useAuth } from '../contexts/AuthContext';
import { useDiaLocal } from '../hooks/useDiaLocal';
import theme from '../theme/theme';
import type { ProfileStackParamList } from '../navigation/MainNavigator';
import {
  getCompletedSessions,
  type CompletedSessionSummary,
} from '../services/sessionExecutionRepository';
import { resumirSemana, minutosTotais, formatarDuracao } from '../utils/weekSummary';
import { Screen, ScreenTitle, Card, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Metric, MetricGroup, Notice } from '../components/ui/Feedback';

/** Iniciais para o bloco de identidade (no máximo duas). */
const iniciais = (nome: string): string =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');

const ProfileScreen = () => {
  const { user, profile, signOut } = useAuth();
  const navigation = useNavigation<StackNavigationProp<ProfileStackParamList, 'ProfileMain'>>();

  const [completed, setCompleted] = useState<CompletedSessionSummary[] | null>(null);
  const [statsError, setStatsError] = useState(false);
  // Cada carga tem uma geração; resposta de geração antiga é descartada para
  // um retry não ser sobrescrito por uma falha atrasada.
  const geracaoRef = useRef(0);

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
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{iniciais(nome)}</Text>
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

      <Text style={styles.listTitle}>Treino</Text>
      <ListRow
        title="Histórico de treinos"
        subtitle="Séries, cargas e repetições registradas"
        showChevron
        onPress={() => navigation.navigate('SessionHistory')}
      />

      <Button label="Sair" variant="danger" onPress={signOut} style={styles.logout} />
    </Screen>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: theme.colors.accent.soft,
  },
  avatarText: {
    color: theme.colors.text.accent,
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

  listTitle: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  logout: { marginTop: theme.spacing.xxl },
});

export default ProfileScreen;
