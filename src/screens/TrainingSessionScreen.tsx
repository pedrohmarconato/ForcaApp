// src/screens/TrainingSessionScreen.tsx
// Tela 05 do fluxo — "Plano": a sessão corrente (em andamento ou a próxima
// pendente) com seus exercícios e alvos por série.
//
// Apresentação na Direção 02: resumo do ciclo em card de destaque, lista de
// exercícios com a mesma geometria do detalhe, e uma única ação neon fixa no
// rodapé. A busca de dados é a mesma da Fase 3.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import type { TrainingStackParamList } from '../navigation/MainNavigator';
import {
  getTodaySession,
  getPlanSessions,
  getSessionDetail,
  fecharSessoesDeSemanasVencidas,
  SessionDetail,
  PlannedSession,
  PlannedExercise,
} from '../services/trainingRepository';
import {
  EscopoReordenacao,
  isPlanoDesatualizado,
  reordenarSessoesDaSemana,
  reagendarSessoesDaSemana,
} from '../services/planEditRepository';
import {
  moveItem,
  pendentesOrdenadas,
  podeReordenarSemana,
  previewSemana,
  resumoPropagacao,
} from '../engine/planReorder';
import { getAgendaDoAluno } from '../services/agendaRepository';
import { getHistoricoDeSemanas } from '../services/adherenceHistoryRepository';
import {
  aderenciaPorSemana,
  vereditoDeFrequencia,
  frequenciaReal,
  diasPlanejados,
  type VereditoDeFrequencia,
} from '../engine/adherenceHistory';
import { FREQUENCY_CONFIG } from '../engine/config';
import FrequenciaCard, { type VereditoDeAviso } from '../components/plan/FrequenciaCard';
import {
  reancorarSemana,
  precisaReancorar,
  type SessaoParaReancorar,
  type OffsetDaSemana,
} from '../engine/scheduleShift';
import { segundaDaSemanaDe, localTodayISO } from '../engine/agendaDias';
import { DIAS_DA_SEMANA } from '../utils/weekSummary';
import { Screen, Card, ScreenTitle, ListRow } from '../components/ui/Surface';
import Button from '../components/ui/Button';
import { Chip, EmptyState, Notice, Skeleton } from '../components/ui/Feedback';
import FModules from '../components/ui/FModules';
import PlannedExerciseRow from '../components/session/PlannedExerciseRow';
import { SetasReordenar } from '../components/session/ReorderControls';
import ReorderScopeSheet from '../components/session/ReorderScopeSheet';

/** Letra do dia (SEG..DOM) a partir do scheduled_date local; null sem data. */
const diaDaSessao = (sessao: PlannedSession): string | null => {
  if (!sessao.scheduled_date) return null;
  const data = new Date(`${sessao.scheduled_date}T12:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  return DIAS_DA_SEMANA[(data.getDay() + 6) % 7];
};

const estadoDaSessao = (
  sessao: PlannedSession,
  sessaoDaVezId: string | null,
): { rotulo: string; accent: boolean } => {
  if (sessao.status === 'completed') return { rotulo: 'Concluído', accent: true };
  // "Recusado" e "Pulado" não são a mesma coisa: o primeiro foi uma decisão
  // declarada pelo aluno (0020), o segundo é data vencida vista pelo
  // replanejador. Mostrar tudo como "Pulado" apagava a diferença na tela.
  if (sessao.status === 'skipped')
    return {
      rotulo: sessao.skip_source === 'user' ? 'Recusado' : 'Pulado',
      accent: false,
    };
  if (sessao.id === sessaoDaVezId)
    return { rotulo: sessao.status === 'in_progress' ? 'Em andamento' : 'A seguir', accent: true };
  return { rotulo: '', accent: false };
};

const TrainingSessionScreen = () => {
  const navigation = useNavigation<StackNavigationProp<TrainingStackParamList, 'TrainingOverview'>>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Erro de banco ≠ "não há treino": estados distintos (achado #9 do review)
  const [loadError, setLoadError] = useState(false);
  // Visão de ciclo (Direção 03): carga independente — falha aqui só esconde o
  // contexto da semana, nunca derruba a sessão da vez.
  const [planSessions, setPlanSessions] = useState<PlannedSession[] | null>(null);
  const { user } = useAuth();

  // Modo reordenar treinos: IDs das sessões PENDENTES da semana na ordem
  // escolhida. null = modo normal. A permuta de datas só acontece quando a RPC
  // confirma — o rascunho é apenas preview.
  const [ordemSemanaDraft, setOrdemSemanaDraft] = useState<string[] | null>(null);
  const [salvandoSemana, setSalvandoSemana] = useState(false);
  const [avisoSemana, setAvisoSemana] = useState<'falha' | 'desatualizado' | null>(null);
  // Sheet de escopo (Fase 3): a escolha "só esta semana / também as próximas"
  // é do usuário final, na hora de salvar.
  const [escopoSheetAberto, setEscopoSheetAberto] = useState(false);
  const [resumoSemana, setResumoSemana] = useState<string | null>(null);

  // Reancoragem: agendaErro só esconde a ação, nunca derruba a tela
  const [agendaCarregada, setAgendaCarregada] = useState(false);
  const [agendaErro, setAgendaErro] = useState(false);
  const [agenda, setAgenda] = useState<OffsetDaSemana[]>([]);
  // Nível 4 da escada: veredito de frequência das semanas fechadas. Só é
  // montado para os três vereditos de alerta; falha de leitura esconde o
  // card (não-fatal, como a agenda).
  const [frequencia, setFrequencia] = useState<{
    veredito: VereditoDeAviso;
    frequenciaReal: number;
    diasPlanejados: number;
  } | null>(null);
  // Preview do reencaixe: mostrado no Modal antes de confirmar
  const [previewReencaixe, setPreviewReencaixe] = useState<{
    movidas: { id: string; de: string | null; para: string }[];
    semEncaixe: string[];
  } | null>(null);
  const [salvandoReencaixe, setSalvandoReencaixe] = useState(false);
  const [avisoReencaixe, setAvisoReencaixe] = useState<'falha' | 'desatualizado' | 'agenda_vazia' | null>(null);

  const fetchCurrentTraining = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);

    getPlanSessions(user.id)
      .then(setPlanSessions)
      .catch((err) => {
        console.log('Visão de ciclo indisponível:', err?.message ?? err);
        setPlanSessions(null);
      });

    try {
      // Fechamento de semanas vencidas antes de escolher o "treino de hoje":
      // pendentes de semanas que já passaram não são oferecidas aqui. Falha
      // NÃO derruba a tela (não-fatal) — roda de novo na próxima abertura.
      await fecharSessoesDeSemanasVencidas(user.id, localTodayISO()).catch((err) =>
        console.warn('[fechamento] falhou (não-fatal):', err)
      );
      const proxima = await getTodaySession(user.id);
      if (!proxima) {
        setSession(null);
        return;
      }
      const detalhe = await getSessionDetail(proxima.id);
      setSession(detalhe);
    } catch (err) {
      console.error('Erro ao buscar treino:', err);
      setSession(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // Depende do ID (estável), não da identidade do objeto user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Foco, não montagem: voltar do fluxo de "Gerar novo plano" (popToTop) não
  // remonta esta tela — sem refetch por foco, o plano recém-gerado não
  // apareceria na aba Plano (mesmo padrão da Home).
  useFocusEffect(
    useCallback(() => {
      fetchCurrentTraining();
    }, [fetchCurrentTraining]),
  );

  // Busca a agenda do aluno para reencaixe
  useEffect(() => {
    if (!user || !session) {
      setAgendaCarregada(false);
      return;
    }
    const buscarAgenda = async () => {
      try {
        setAgendaErro(false);
        const resultado = await getAgendaDoAluno({
          userId: user.id,
          planId: session.plan_id,
        });
        if (resultado.agenda.length > 0) {
          setAgenda(resultado.agenda);
        }
        setAgendaCarregada(true);
      } catch (err) {
        console.log('Agenda indisponível para reencaixe:', err?.message ?? err);
        setAgendaErro(true);
        setAgendaCarregada(true);
      }
    };
    buscarAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, session?.plan_id]);

  // Diagnóstico de frequência (Nível 4): semanas fechadas antes da semana em
  // curso — a semana em curso nunca conta contra o aluno.
  useEffect(() => {
    if (!user || !session || !agendaCarregada) {
      setFrequencia(null);
      return;
    }
    const buscarFrequencia = async () => {
      try {
        const sessoes = await getHistoricoDeSemanas({
          userId: user.id,
          planId: session.plan_id,
          ateSemana: session.week_number,
          // A janela é UMA só: o que o banco devolve e o que o motor agrega. Com
          // o default do repositório (3), subir a config desligaria o Nível 4 em
          // silêncio — semanas.length < janela vira 'insuficiente_historico'.
          quantidade: FREQUENCY_CONFIG.semanasFechadasMinimas,
        });
        const semanas = aderenciaPorSemana({
          sessoes,
          quantidade: FREQUENCY_CONFIG.semanasFechadasMinimas,
          ateSemana: session.week_number,
        });
        const veredito: VereditoDeFrequencia = vereditoDeFrequencia(semanas, agenda);
        if (veredito === 'ok' || veredito === 'insuficiente_historico') {
          setFrequencia(null);
          return;
        }
        setFrequencia({
          veredito,
          frequenciaReal: frequenciaReal(semanas),
          diasPlanejados: diasPlanejados(semanas),
        });
      } catch (err) {
        console.log('Histórico de frequência indisponível:', err?.message ?? err);
        setFrequencia(null);
      }
    };
    buscarFrequencia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, session?.plan_id, session?.week_number, agendaCarregada, agenda]);

  // Botão do card (Nível 4): leva ao MESMO fluxo de geração do onboarding —
  // o questionário refeito upserta as respostas e o backend arquiva o plano
  // atual antes de salvar o novo (0006). skipChat=true dispara a geração
  // direto, sem chat.
  const gerarNovoPlano = () => {
    navigation.navigate('Questionnaire');
  };

  if (loading) {
    // Direção 03: a estrutura da tela já aparece na carga — skeleton no lugar
    // do spinner centralizado.
    return (
      <Screen>
        <ScreenTitle kicker="Plano" title="Seu plano." style={styles.title} />
        <View style={styles.skeletonStack}>
          <Skeleton
            height={116}
            radius={theme.borderRadius.xl}
            accessibilityLabel="Carregando sua sessão"
            testID="skl-plano-resumo"
          />
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <ScreenTitle kicker="Plano" title="Seu plano." />
        <Notice
          tone="danger"
          title="Falha ao carregar"
          description="Não foi possível carregar seu treino. Verifique a conexão e tente novamente."
          action={
            <Button
              label="Tentar novamente"
              variant="outline"
              compact
              onPress={fetchCurrentTraining}
            />
          }
        />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <ScreenTitle kicker="Plano" title="Seu plano." />
        <EmptyState
          icon="calendar"
          title="Nenhum treino pendente. Gere seu plano para começar."
          description="Assim que seu plano for gerado, a sessão da vez aparece aqui."
        />
      </Screen>
    );
  }

  const emAndamento = session.status === 'in_progress';
  const dataFormatada = session.scheduled_date
    ? new Date(`${session.scheduled_date}T12:00:00`).toLocaleDateString('pt-BR')
    : null;

  // Ciclo REAL: total = maior semana do plano; atual = semana da sessão da vez.
  const totalSemanas = planSessions?.length
    ? Math.max(...planSessions.map((s) => s.week_number))
    : null;
  const sessoesDaSemana =
    planSessions?.filter((s) => s.week_number === session.week_number) ?? [];

  const editandoSemana = ordemSemanaDraft != null;
  const podeReordenarTreinos = podeReordenarSemana(sessoesDaSemana);
  const semanaExibida = ordemSemanaDraft
    ? previewSemana(sessoesDaSemana, ordemSemanaDraft)
    : sessoesDaSemana;

  // Verifica se o reencaixe é possível
  const sessoesParaReancorarCheck: SessaoParaReancorar[] = sessoesDaSemana.map((s) => ({
    id: s.id,
    status: s.status,
    scheduledDate: s.scheduled_date,
    orderInWeek: s.order_in_week ?? 0,
  }));
  const hoje = localTodayISO();
  // Reencaixe só é viável se: agenda foi carregada (não há erro) E tem dias configurados E há atraso
  const podeReencaixar =
    agendaCarregada &&
    !agendaErro &&
    agenda.length > 0 &&
    precisaReancorar(sessoesParaReancorarCheck, hoje);

  const iniciarReordenacaoSemana = () => {
    setAvisoSemana(null);
    setResumoSemana(null);
    setOrdemSemanaDraft(pendentesOrdenadas(sessoesDaSemana).map((s) => s.id));
  };

  const cancelarReordenacaoSemana = () => {
    setOrdemSemanaDraft(null);
    setAvisoSemana(null);
    setEscopoSheetAberto(false);
  };

  const moverSessao = (id: string, delta: -1 | 1) => {
    setOrdemSemanaDraft((atual) => {
      if (!atual) return atual;
      const idx = atual.indexOf(id);
      return moveItem(atual, idx, idx + delta);
    });
  };

  // Salvar não grava direto: com mudança real, quem decide o escopo é o sheet.
  const salvarReordenacaoSemana = () => {
    if (!ordemSemanaDraft) return;
    const original = pendentesOrdenadas(sessoesDaSemana).map((s) => s.id);
    if (original.join('|') === ordemSemanaDraft.join('|')) {
      cancelarReordenacaoSemana();
      return;
    }
    setEscopoSheetAberto(true);
  };

  const aplicarReordenacaoSemana = async (escopo: EscopoReordenacao) => {
    // salvandoSemana guarda contra toque duplo no sheet antes do re-render.
    if (!ordemSemanaDraft || salvandoSemana) return;
    setEscopoSheetAberto(false);
    setSalvandoSemana(true);
    setAvisoSemana(null);
    try {
      const resultado = await reordenarSessoesDaSemana({
        planId: session.plan_id,
        weekNumber: session.week_number,
        orderedSessionIds: ordemSemanaDraft,
        escopo,
      });
      setOrdemSemanaDraft(null);
      setResumoSemana(resumoPropagacao(resultado));
      // Refetch obrigatório: a fila real mudou — a "sessão da vez" pode ser outra.
      await fetchCurrentTraining();
    } catch (err) {
      if (isPlanoDesatualizado(err)) {
        // 40001/55000/42501: o plano mudou fora desta tela — recarrega.
        setOrdemSemanaDraft(null);
        setAvisoSemana('desatualizado');
        await fetchCurrentTraining();
      } else {
        console.error('Erro ao salvar a nova ordem da semana:', err);
        setAvisoSemana('falha');
      }
    } finally {
      setSalvandoSemana(false);
    }
  };

  // Reencaixe de sessões com atraso
  const iniciarReencaixe = () => {
    setAvisoReencaixe(null);
    setPreviewReencaixe(null);

    // Agenda vazia: não há dias configurados para reencaixar
    if (agenda.length === 0) {
      setAvisoReencaixe('agenda_vazia');
      return;
    }

    const hoje = localTodayISO();
    // A segunda-feira é sempre calculada a partir de hoje, não da menor data da semana
    const segundaDaSemana = segundaDaSemanaDe(hoje);
    if (!segundaDaSemana) {
      // Falha ao calcular a segunda-feira: mostrar aviso visível
      setAvisoReencaixe('falha');
      return;
    }

    // Converte sessões para SessaoParaReancorar
    const sessoesParaReancorar: SessaoParaReancorar[] = sessoesDaSemana.map((s) => ({
      id: s.id,
      status: s.status,
      scheduledDate: s.scheduled_date,
      orderInWeek: s.order_in_week ?? 0,
    }));

    const resultado = reancorarSemana({
      sessoes: sessoesParaReancorar,
      hojeISO: hoje,
      agenda,
      segundaDaSemanaISO: segundaDaSemana,
    });

    setPreviewReencaixe({
      movidas: resultado.movidas,
      semEncaixe: resultado.semEncaixe,
    });
  };

  const cancelarReencaixe = () => {
    setPreviewReencaixe(null);
    setAvisoReencaixe(null);
  };

  const confirmarReencaixe = async () => {
    if (!previewReencaixe || salvandoReencaixe) return;
    setSalvandoReencaixe(true);
    setAvisoReencaixe(null);

    try {
      if (previewReencaixe.movidas.length === 0) {
        // Nada a mover
        setPreviewReencaixe(null);
        return;
      }

      const atribuicoes = previewReencaixe.movidas.map((m) => ({
        sessionId: m.id,
        scheduledDate: m.para,
      }));

      await reagendarSessoesDaSemana({
        planId: session.plan_id,
        weekNumber: session.week_number,
        atribuicoes,
      });

      setPreviewReencaixe(null);
      // Refetch obrigatório: as datas mudaram — a "sessão da vez" pode ser outra.
      await fetchCurrentTraining();
    } catch (err) {
      if (isPlanoDesatualizado(err)) {
        setPreviewReencaixe(null);
        setAvisoReencaixe('desatualizado');
        await fetchCurrentTraining();
      } else {
        console.error('Erro ao salvar reencaixe:', err);
        setAvisoReencaixe('falha');
      }
    } finally {
      setSalvandoReencaixe(false);
    }
  };

  const renderExerciseItem = ({ item, index }: { item: PlannedExercise; index: number }) => (
    <PlannedExerciseRow exercise={item} index={index} />
  );

  return (
    <Screen>
      <ScreenTitle kicker="Plano" title="Seu plano." style={styles.title} />

      {/* --- Visão do ciclo: Semana N de M + a semana corrente ------------- */}
      {totalSemanas ? (
        <View style={styles.cycle} testID="visao-ciclo">
          <View style={styles.cycleTop}>
            <Text style={styles.cycleLabel}>
              Semana {session.week_number} de {totalSemanas}
            </Text>
            {editandoSemana ? (
              <View style={styles.cycleEditActions}>
                <Button
                  label="Cancelar"
                  variant="ghost"
                  compact
                  disabled={salvandoSemana}
                  onPress={cancelarReordenacaoSemana}
                />
                <Button
                  label="Salvar"
                  compact
                  loading={salvandoSemana}
                  onPress={salvarReordenacaoSemana}
                />
              </View>
            ) : (
              <View style={styles.cycleTopRight}>
                {podeReencaixar ? (
                  <Pressable
                    onPress={iniciarReencaixe}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text style={styles.reorderAction}>Reencaixar</Text>
                  </Pressable>
                ) : null}
                {podeReordenarTreinos ? (
                  <Pressable
                    onPress={iniciarReordenacaoSemana}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text style={styles.reorderAction}>Reordenar</Text>
                  </Pressable>
                ) : null}
                <FModules
                  lit={Math.ceil((session.week_number / totalSemanas) * 3)}
                  accessibilityLabel={`Semana ${session.week_number} de ${totalSemanas}`}
                />
              </View>
            )}
          </View>

          {avisoSemana === 'falha' ? (
            <Notice
              tone="danger"
              title="Não foi possível salvar"
              description="A nova ordem não foi aplicada. Verifique a conexão e tente novamente."
              style={styles.reorderNotice}
            />
          ) : null}
          {avisoSemana === 'desatualizado' ? (
            <Notice
              tone="info"
              title="Seu plano mudou em outro lugar."
              description="Recarregamos a semana com a ordem atual."
              style={styles.reorderNotice}
            />
          ) : null}
          {resumoSemana ? (
            <Notice
              tone="info"
              title="Ordem atualizada"
              description={resumoSemana}
              style={styles.reorderNotice}
            />
          ) : null}

          {avisoReencaixe === 'agenda_vazia' ? (
            <Notice
              tone="danger"
              title="Dias de treino não configurados"
              description="Configure os dias em que você treina para usar o reencaixe."
              style={styles.reorderNotice}
            />
          ) : null}
          {avisoReencaixe === 'falha' ? (
            <Notice
              tone="danger"
              title="Não foi possível salvar"
              description="Os treinos não foram reencaixados. Verifique a conexão e tente novamente."
              style={styles.reorderNotice}
            />
          ) : null}
          {avisoReencaixe === 'desatualizado' ? (
            <Notice
              tone="info"
              title="Seu plano mudou em outro lugar."
              description="Recarregamos a semana com o reencaixe cancelado."
              style={styles.reorderNotice}
            />
          ) : null}

          {semanaExibida.map((s) => {
            const estado = estadoDaSessao(s, session.id);
            const ehPendente = s.status === 'pending';
            const idxPendente =
              editandoSemana && ehPendente && ordemSemanaDraft
                ? ordemSemanaDraft.indexOf(s.id)
                : -1;
            return (
              <ListRow
                key={s.id}
                testID={`sessao-semana-${s.id}`}
                title={s.title}
                subtitle={
                  [
                    s.estimated_minutes ? `${s.estimated_minutes} min` : null,
                    s.muscle_groups?.length ? s.muscle_groups.join(' · ') : s.session_type,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                leading={<Chip label={diaDaSessao(s) ?? '—'} />}
                trailingLabel={
                  editandoSemana && ehPendente ? undefined : estado.rotulo || undefined
                }
                trailingAccent={estado.accent}
                trailing={
                  editandoSemana && ehPendente && ordemSemanaDraft ? (
                    <SetasReordenar
                      nome={s.title}
                      podeSubir={idxPendente > 0 && !salvandoSemana}
                      podeDescer={
                        idxPendente < ordemSemanaDraft.length - 1 && !salvandoSemana
                      }
                      onSubir={() => moverSessao(s.id, -1)}
                      onDescer={() => moverSessao(s.id, 1)}
                    />
                  ) : undefined
                }
                showChevron={!editandoSemana}
                onPress={
                  editandoSemana
                    ? undefined
                    : () => navigation.navigate('WorkoutDetail', { sessionId: s.id })
                }
                style={editandoSemana && !ehPendente ? styles.rowFixa : undefined}
              />
            );
          })}
          <Button
            label="Editar plano"
            variant="ghost"
            compact
            icon="edit-2"
            onPress={() => navigation.navigate('ManualPlanEditor', { fromPlanId: session.plan_id })}
            style={styles.editPlan}
          />
        </View>
      ) : null}

      {/* --- Aviso de frequência (Nível 4): só fora de sessão ativa ---------- */}
      {frequencia && !emAndamento ? (
        <FrequenciaCard
          veredito={frequencia.veredito}
          frequenciaReal={frequencia.frequenciaReal}
          diasPlanejados={frequencia.diasPlanejados}
          semanasFechadasMinimas={FREQUENCY_CONFIG.semanasFechadasMinimas}
          onGerarNovoPlano={gerarNovoPlano}
          style={styles.frequenciaCard}
        />
      ) : null}

      <Card elevated style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryLabel}>Sessão atual</Text>
            <Text style={styles.summaryTitle}>{session.title}</Text>
          </View>
          <Chip label={`Semana ${session.week_number}`} tone={emAndamento ? 'accent' : 'neutral'} />
        </View>

        <View style={styles.summaryMeta}>
          {dataFormatada ? <Text style={styles.summaryMetaItem}>{dataFormatada}</Text> : null}
          {session.estimated_minutes ? (
            <Text style={styles.summaryMetaItem}>~{session.estimated_minutes} min</Text>
          ) : null}
          <Text style={styles.summaryMetaItem}>
            {session.planned_exercises.length}{' '}
            {session.planned_exercises.length === 1 ? 'exercício' : 'exercícios'}
          </Text>
        </View>
      </Card>

      <Text style={styles.listTitle}>Exercícios</Text>

      <FlatList
        style={styles.list}
        data={session.planned_exercises}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.footer}>
        <Button
          label={emAndamento ? 'Retomar treino' : 'Iniciar treino'}
          icon="arrow-right"
          onPress={() => navigation.navigate('ActiveSession', { sessionId: session.id })}
        />
      </View>

      <ReorderScopeSheet
        visible={escopoSheetAberto}
        onChoose={aplicarReordenacaoSemana}
        onDismiss={() => setEscopoSheetAberto(false)}
      />

      {/* Modal de preview para reencaixe */}
      <Modal
        visible={previewReencaixe != null}
        transparent
        animationType="fade"
        onRequestClose={cancelarReencaixe}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reencaixar semana</Text>

            {previewReencaixe && previewReencaixe.movidas.length > 0 ? (
              <>
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalSectionLabel}>Treinos que mudam de dia:</Text>
                  {previewReencaixe.movidas.map((m) => {
                    const sessao = sessoesDaSemana.find((s) => s.id === m.id);
                    if (!sessao) return null;
                    const dataDe = m.de ? new Date(`${m.de}T12:00:00`).toLocaleDateString('pt-BR') : '(sem data)';
                    const dataPara = new Date(`${m.para}T12:00:00`).toLocaleDateString('pt-BR');
                    const diaPara = DIAS_DA_SEMANA[(new Date(`${m.para}T12:00:00`).getDay() + 6) % 7];
                    return (
                      <View key={m.id} style={styles.modalItem}>
                        <Text style={styles.modalItemTitle}>{sessao.title}</Text>
                        <Text style={styles.modalItemSubtitle}>
                          {dataPara} ({diaPara})
                        </Text>
                      </View>
                    );
                  })}

                  {previewReencaixe.semEncaixe.length > 0 ? (
                    <>
                      <Text style={[styles.modalSectionLabel, { marginTop: theme.spacing.md }]}>
                        Treinos que não cabem nesta semana:
                      </Text>
                      {previewReencaixe.semEncaixe.map((id) => {
                        const sessao = sessoesDaSemana.find((s) => s.id === id);
                        return (
                          <View key={id} style={styles.modalItem}>
                            <Text style={styles.modalItemTitle}>{sessao?.title ?? 'Treino'}</Text>
                            <Text style={styles.modalItemSubtitle}>Sem espaço até domingo</Text>
                          </View>
                        );
                      })}
                    </>
                  ) : null}
                </ScrollView>

                <View style={styles.modalActions}>
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    compact
                    onPress={cancelarReencaixe}
                    disabled={salvandoReencaixe}
                  />
                  <Button
                    label="Confirmar"
                    compact
                    loading={salvandoReencaixe}
                    onPress={confirmarReencaixe}
                  />
                </View>
              </>
              ) : previewReencaixe && previewReencaixe.semEncaixe.length > 0 ? (
                <>
                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.modalSectionLabel}>Treinos que não cabem nesta semana:</Text>
                    {previewReencaixe.semEncaixe.map((id) => {
                      const sessao = sessoesDaSemana.find((s) => s.id === id);
                      return (
                        <View key={id} style={styles.modalItem}>
                          <Text style={styles.modalItemTitle}>{sessao?.title ?? 'Treino'}</Text>
                          <Text style={styles.modalItemSubtitle}>Sem espaço até domingo</Text>
                        </View>
                      );
                    })}
                    <Text style={styles.modalMessage}>
                      A semana fecha com menos volume — estes treinos ficam de fora.
                    </Text>
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <Button
                      label="Fechar"
                      variant="ghost"
                      compact
                      onPress={cancelarReencaixe}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalMessage}>Nenhum treino precisa ser reencaixado.</Text>
                  <View style={styles.modalActions}>
                    <Button
                      label="Fechar"
                      variant="ghost"
                      compact
                      onPress={cancelarReencaixe}
                    />
                  </View>
                </>
              )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  skeletonStack: { gap: theme.spacing.sm },
  title: { marginBottom: theme.spacing.lg },

  cycle: { marginBottom: theme.spacing.xl },
  cycleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  cycleLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  cycleTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  cycleEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  // Mesma gramática do SectionHeader.actionLabel (ação textual discreta).
  reorderAction: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  reorderNotice: { marginBottom: theme.spacing.md },
  frequenciaCard: { marginBottom: theme.spacing.xl },
  // Fixas esmaecidas no modo edição: não participam da permuta.
  rowFixa: { opacity: 0.55 },
  editPlan: { alignSelf: 'flex-start', marginTop: theme.spacing.sm },

  summary: { marginBottom: theme.spacing.xl },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  summaryMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  summaryMetaItem: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  listTitle: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: theme.spacing.lg },

  footer: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },

  // Modal de preview para reencaixe
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.surface.raised,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    maxHeight: '80%',
    width: '100%',
  },
  modalTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginBottom: theme.spacing.md,
  },
  modalSectionLabel: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginBottom: theme.spacing.sm,
  },
  modalScroll: {
    marginBottom: theme.spacing.md,
  },
  modalItem: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.borderRadius.md,
  },
  modalItemTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
  },
  modalItemSubtitle: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    marginTop: theme.spacing.xxs,
  },
  modalMessage: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
});

export default TrainingSessionScreen;
