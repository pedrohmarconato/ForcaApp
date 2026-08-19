// src/components/progress/CardioEvolucaoChart.tsx
// Seção "Evolução do cardio" da aba Progresso: pace × km por execução ao
// longo do tempo, por modalidade. O motor (cardioEvolucao.ts) é quem decide
// o que é um ponto; este componente só escolhe modalidade/métrica e desenha.
//
// Carregamento próprio, no MESMO padrão de CardioPrescritoSection (ver
// ProgressScreen.tsx `carregar`): `null` = ainda não sei (skeleton), `[]` =
// confirmado vazio, erro NUNCA é engolido — vira `Notice` com nova tentativa,
// nunca um gráfico em branco fingindo que não há dado.
//
// Regra inegociável (mesma do resto da aba Progresso): sem amostra é "—",
// nunca 0 inventado. Com menos de duas execuções válidas na combinação
// modalidade × métrica escolhida, não existe reta para desenhar — o
// componente não força um ponto único nem interpola do zero.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import theme from '../../theme/theme';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, SectionHeader } from '../ui/Surface';
import Button from '../ui/Button';
import { Chip, EmptyState, Notice, Skeleton } from '../ui/Feedback';
import { useAuth } from '../../contexts/AuthContext';
import { getCardioLogs } from '../../services/cardioGoalRepository';
import type { CardioLog } from '../../engine/cardioGoals';
import { formatPace } from '../../engine/sessionModel';
import {
  formatarDataCurtaEixo,
  formatarKmComVirgula,
  modalidadesDisponiveis,
  montarSerieEvolucao,
} from '../../engine/cardioEvolucao';

type Metrica = 'pace' | 'km';

/** Mínimo de pontos válidos para uma reta fazer sentido — um ponto só é um marcador, não evolução. */
const AMOSTRA_MINIMA = 2;
/** Acima disto, só uma amostra dos rótulos do eixo X aparece (senão colam uns nos outros). */
const MAX_LABELS_X = 6;
const ALTURA_GRAFICO = 180;

const LARGURA_TELA = Dimensions.get('window').width;
// Largura do gráfico = tela − padding horizontal da Screen (scroll) − padding do Card
// que o envolve. react-native-chart-kit desenha em SVG com largura fixa; não
// há como um `flex: 1` resolver isso como no gráfico de barras vizinho.
const LARGURA_GRAFICO = LARGURA_TELA - theme.spacing.xl * 2 - theme.spacing.lg * 2;

/** Hex ("#RRGGBB") → "r, g, b", formato que a chartConfig do chart-kit exige. */
const hexParaRgbCsv = (hex: string): string => {
  const valor = hex.replace('#', '');
  const r = parseInt(valor.substring(0, 2), 16);
  const g = parseInt(valor.substring(2, 4), 16);
  const b = parseInt(valor.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

/** Pace do eixo Y sem o sufixo " /km" — o sufixo já está implícito no botão "Pace". */
const formatarPaceEixo = (segundosPorKm: number): string =>
  formatPace(segundosPorKm).replace(' /km', '');

const CardioEvolucaoChart = () => {
  const { user } = useAuth();
  const { theme: runtimeTheme } = useTheme();
  const chartConfig = useMemo(() => {
    const accentRgb = hexParaRgbCsv(runtimeTheme.colors.accent.main);
    const labelRgb = hexParaRgbCsv(runtimeTheme.palette.cinza);

    return {
      backgroundColor: runtimeTheme.colors.surface.card,
      backgroundGradientFrom: runtimeTheme.colors.surface.card,
      backgroundGradientTo: runtimeTheme.colors.surface.card,
      color: (opacity = 1) => `rgba(${accentRgb}, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(${labelRgb}, ${opacity})`,
      propsForBackgroundLines: { stroke: runtimeTheme.colors.border.subtle },
      propsForDots: {
        r: '3',
        strokeWidth: '2',
        stroke: runtimeTheme.colors.accent.main,
      },
    };
  }, [runtimeTheme]);
  // `null` = carregando; `[]` = confirmado vazio (mesma convenção do resto da aba).
  const [logs, setLogs] = useState<CardioLog[] | null>(null);
  const [erro, setErro] = useState(false);
  const [modalidade, setModalidade] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<Metrica>('pace');
  // Descarta resposta de uma chamada anterior se `carregar` for chamado de novo
  // antes dela voltar (nova tentativa após erro, remontagem) — mesmo padrão do
  // `geracaoRef` de ProgressScreen.carregar.
  const geracaoRef = useRef(0);

  const carregar = () => {
    if (!user) return;
    const geracao = ++geracaoRef.current;
    setErro(false);
    getCardioLogs(user.id)
      .then((r) => {
        if (geracao !== geracaoRef.current) return;
        setLogs(r);
      })
      .catch((err) => {
        console.error('Erro ao carregar evolução de cardio:', err);
        if (geracao !== geracaoRef.current) return;
        setLogs(null);
        setErro(true);
      });
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const modalidades = useMemo(() => (logs ? modalidadesDisponiveis(logs) : []), [logs]);

  // Default = a modalidade com mais pontos (primeira da lista — o motor já
  // ordena por contagem desc). Só reatribui quando a seleção atual não existe
  // mais na lista: o aluno que escolheu outra modalidade não pode ser
  // "puxado de volta" para a default a cada recarregamento.
  useEffect(() => {
    if (modalidades.length === 0) {
      setModalidade(null);
      return;
    }
    if (!modalidade || !modalidades.some((m) => m.identity === modalidade)) {
      setModalidade(modalidades[0].identity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalidades]);

  const serie = useMemo(
    () => (logs && modalidade ? montarSerieEvolucao(logs, modalidade) : []),
    [logs, modalidade],
  );

  const pontosValidos = useMemo(
    () =>
      metrica === 'pace'
        ? serie.filter((p) => p.paceSecPorKm != null)
        : serie.filter((p) => p.distanciaM != null && p.distanciaM > 0),
    [serie, metrica],
  );

  const semDadoSuficiente = pontosValidos.length < AMOSTRA_MINIMA;

  const { labels, dados } = useMemo(() => {
    const passo = Math.max(1, Math.ceil(pontosValidos.length / MAX_LABELS_X));
    const ultimoIndice = pontosValidos.length - 1;
    return {
      labels: pontosValidos.map((p, i) =>
        i % passo === 0 || i === ultimoIndice ? formatarDataCurtaEixo(p.completedAt) : '',
      ),
      dados:
        metrica === 'pace'
          ? pontosValidos.map((p) => p.paceSecPorKm as number)
          : pontosValidos.map((p) => (p.distanciaM as number) / 1000),
    };
  }, [pontosValidos, metrica]);

  const modalidadeSelecionada = modalidades.find((m) => m.identity === modalidade);

  return (
    <View style={styles.section}>
      <SectionHeader title="Evolução do cardio" />

      {erro ? (
        <Notice
          tone="danger"
          title="Não foi possível carregar sua evolução de cardio"
          action={<Button label="Tentar novamente" variant="outline" compact onPress={carregar} />}
        />
      ) : logs === null ? (
        <Skeleton
          height={220}
          radius={theme.borderRadius.xl}
          accessibilityLabel="Carregando evolução de cardio"
        />
      ) : modalidades.length === 0 ? (
        <Card>
          <EmptyState
            icon="trending-up"
            title="Sem evolução de cardio ainda"
            description="Suas execuções de cardio concluídas aparecem aqui."
          />
        </Card>
      ) : (
        <Card testID="card-cardio-evolucao">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {modalidades.map((m) => (
              <Pressable key={m.identity} onPress={() => setModalidade(m.identity)}>
                <Chip label={m.name} tone={modalidade === m.identity ? 'accent' : 'neutral'} />
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.toggleRow}>
            <Button
              label="Pace"
              compact
              variant={metrica === 'pace' ? 'tonal' : 'outline'}
              onPress={() => setMetrica('pace')}
              style={styles.toggleButton}
              testID="toggle-metrica-pace"
            />
            <Button
              label="Km"
              compact
              variant={metrica === 'km' ? 'tonal' : 'outline'}
              onPress={() => setMetrica('km')}
              style={styles.toggleButton}
              testID="toggle-metrica-km"
            />
          </View>

          {semDadoSuficiente ? (
            <Text style={styles.semDado}>— sem dados suficientes ainda</Text>
          ) : (
            <View
              accessible
              accessibilityLabel={`Gráfico de evolução de ${metrica === 'pace' ? 'pace' : 'quilômetros'} em ${modalidadeSelecionada?.name ?? ''}`}
            >
              <LineChart
                data={{ labels, datasets: [{ data: dados }] }}
                width={LARGURA_GRAFICO}
                height={ALTURA_GRAFICO}
                chartConfig={chartConfig}
                formatYLabel={(y) =>
                  metrica === 'pace' ? formatarPaceEixo(Number(y)) : formatarKmComVirgula(Number(y))
                }
                withOuterLines={false}
                withShadow={false}
                bezier
                style={styles.chart}
              />
            </View>
          )}
        </Card>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xxl },
  chips: { gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  toggleButton: { flex: 1 },
  semDado: {
    paddingVertical: theme.spacing.xxxl,
    textAlign: 'center',
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  chart: {
    borderRadius: theme.borderRadius.lg,
  },
});

export default CardioEvolucaoChart;
