import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import {
  Button,
  Card,
  CheckboxRow,
  EmptyState,
  ListRow,
  NO_DATA,
  Notice,
  OptionButton,
  Screen,
  ScreenTitle,
  SectionHeader,
  StackHeader,
  TextField,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useManualPlanStore } from '../store/manualPlanStore';
import theme from '../theme/theme';
import {
  DEFAULT_MANUAL_PROGRESSION,
  hasCardioExercise,
  hasRmExercise,
  isManualPlanSavable,
} from '../types/manualPlan';

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

const ManualPlanEditorScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user, updateProfile } = useAuth();
  const stateUserId = useManualPlanStore((state) => state.userId);
  const draft = useManualPlanStore((state) => state.draft);
  const status = useManualPlanStore((state) => state.status);
  const saveError = useManualPlanStore((state) => state.saveError);
  const previewData = useManualPlanStore((state) => state.previewData);
  const initEmpty = useManualPlanStore((state) => state.initEmpty);
  const setPlanName = useManualPlanStore((state) => state.setPlanName);
  const setDurationWeeks = useManualPlanStore((state) => state.setDurationWeeks);
  const setProgression = useManualPlanStore((state) => state.setProgression);
  const disableProgression = useManualPlanStore((state) => state.disableProgression);
  const addWorkout = useManualPlanStore((state) => state.addWorkout);
  const removeWorkout = useManualPlanStore((state) => state.removeWorkout);
  const preview = useManualPlanStore((state) => state.preview);
  const save = useManualPlanStore((state) => state.save);

  useEffect(() => {
    // `status === 'saved'` significa que o rascunho virou plano agora há pouco.
    // Sem esta guarda o efeito re-disparava logo após o save e regravava um
    // rascunho fantasma no aparelho, que reaparecia dias depois como se fosse
    // trabalho em andamento do aluno.
    if (status === 'saved' || status === 'saving') return;
    if (user?.id && (!draft || stateUserId !== user.id)) void initEmpty(user.id);
  }, [draft, initEmpty, stateUserId, status, user?.id]);

  if (!draft) {
    return (
      <Screen>
        <StackHeader title="Meu plano" onBack={() => navigation.goBack()} />
        <EmptyState
          title={status === 'saved' ? 'Plano criado' : 'Preparando editor'}
          description={
            status === 'saved'
              ? 'Abrindo seu plano…'
              : 'Recuperando seu rascunho…'
          }
        />
      </Screen>
    );
  }

  const progressionActive = Object.values(draft.progressao).some((rule) => rule?.ativa);
  const hasCardio = hasCardioExercise(draft);
  const hasRm = hasRmExercise(draft);
  const canSave = isManualPlanSavable(draft);

  const enableProgression = () => {
    const defaults = DEFAULT_MANUAL_PROGRESSION();
    setProgression({
      deload: defaults.deload,
      series: defaults.series,
      cardio: hasCardio ? { ativa: true, valor: 5, alvo: 'ambos' } : null,
      intensidade: hasRm ? { ativa: false, valor: 2.5 } : null,
    });
  };

  const handleSave = async () => {
    const planId = await save();
    if (!planId) return;
    await updateProfile?.({ current_plan_id: planId });
    navigation.navigate('TrainingOverview');
  };

  return (
    <Screen>
      <StackHeader title="Plano manual" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTitle
          kicker="Meu plano"
          title="Monte do seu jeito"
          subtitle="Escolha os treinos e exercícios; o restante do app continua funcionando igual."
        />
        {route.params?.fromPlanId ? (
          <Notice
            tone="warning"
            title="Um novo plano será criado"
            description="O plano atual irá para o histórico. A confirmação final entra na próxima etapa deste fluxo."
          />
        ) : null}
        <TextField
          label="Nome do plano"
          value={draft.nome}
          maxLength={80}
          onChangeText={setPlanName}
        />

        <SectionHeader title="Duração" />
        <View style={styles.durationRow}>
          {[4, 8, 12, 16].map((weeks) => (
            <OptionButton
              key={weeks}
              label={`${weeks} sem`}
              selected={draft.duracao_semanas === weeks}
              onPress={() => setDurationWeeks(weeks)}
              style={styles.flexOption}
            />
          ))}
        </View>

        <SectionHeader title="Treinos" />
        {draft.treinos.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Seu plano ainda está vazio"
            description="Adicione um treino e escolha os exercícios."
          />
        ) : (
          draft.treinos.map((workout, index) => {
            const day = workout.dia_offset == null ? 'Sem dia fixo' : DAY_NAMES[workout.dia_offset];
            const minutes = workout.duracao_minutos == null ? NO_DATA : `${workout.duracao_minutos} min`;
            return (
              <View key={`${workout.nome}-${index}`} style={styles.workoutRow}>
                <ListRow
                  title={workout.nome || `Treino ${index + 1}`}
                  subtitle={`${day} · ${workout.exercicios.length} exercícios · ${minutes}`}
                  showChevron
                  onPress={() => navigation.navigate('ManualWorkoutEditor', { workoutIndex: index })}
                  style={styles.workoutListRow}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${workout.nome}`}
                  onPress={() => removeWorkout(index)}
                  hitSlop={theme.spacing.sm}
                  style={styles.removeWorkout}
                >
                  <Feather name="trash-2" size={16} color={theme.colors.status.danger} />
                </Pressable>
              </View>
            );
          })
        )}
        <Button
          label="Adicionar treino"
          variant="tonal"
          icon="plus"
          onPress={addWorkout}
          style={styles.addWorkout}
        />
        {saveError ? <Notice tone="danger" title={saveError} /> : null}

        <Card style={styles.progressionCard}>
          <SectionHeader title="Progressão" />
          <CheckboxRow
            label="Progressão automática"
            checked={progressionActive}
            onPress={progressionActive ? disableProgression : enableProgression}
          />

          {progressionActive ? (
            <View style={styles.progressionOptions}>
              <CheckboxRow
                label="Semana de descarga"
                checked={draft.progressao.deload?.ativa === true}
                onPress={() => setProgression({
                  deload: draft.progressao.deload
                    ? null
                    : { ativa: true, semana: 4, fator_rm: 0.8, fator_series: 0.8 },
                })}
              />
              <Text style={styles.support}>Na semana escolhida o volume cai, para o corpo assimilar.</Text>
              {draft.progressao.deload ? (
                <View style={styles.compactOptions}>
                  {[3, 4, 5, 6, 7, 8]
                    .filter((week) => week <= draft.duracao_semanas)
                    .map((week) => (
                      <OptionButton
                        key={week}
                        label={`S${week}`}
                        selected={draft.progressao.deload?.semana === week}
                        onPress={() => setProgression({
                          deload: { ...draft.progressao.deload!, semana: week },
                        })}
                        style={styles.flexOption}
                      />
                    ))}
                </View>
              ) : null}

              <CheckboxRow
                label="Aumentar séries"
                checked={draft.progressao.series?.ativa === true}
                onPress={() => setProgression({
                  series: draft.progressao.series?.ativa
                    ? null
                    : { ativa: true, valor: 1, semana_inicio: 5, semana_fim: Math.min(8, draft.duracao_semanas) },
                })}
              />
              <Text style={styles.support}>
                Soma +1 série a cada semana da janela; o efeito é acumulativo e respeita o teto do app.
              </Text>
              {draft.progressao.series?.ativa ? (
                <View style={styles.seriesWindow}>
                  <TextField
                    label="Começa na semana"
                    value={String(draft.progressao.series.semana_inicio)}
                    keyboardType="number-pad"
                    containerStyle={styles.seriesField}
                    onChangeText={(value) => {
                      const week = Math.max(1, Math.min(draft.duracao_semanas, Number(value) || 1));
                      setProgression({
                        series: { ...draft.progressao.series!, semana_inicio: week },
                      });
                    }}
                  />
                  <TextField
                    label="Termina na semana"
                    value={String(draft.progressao.series.semana_fim)}
                    keyboardType="number-pad"
                    containerStyle={styles.seriesField}
                    onChangeText={(value) => {
                      const week = Math.max(1, Math.min(draft.duracao_semanas, Number(value) || 1));
                      setProgression({
                        series: { ...draft.progressao.series!, semana_fim: week },
                      });
                    }}
                  />
                </View>
              ) : null}

              {hasCardio ? (
                <>
                  <CheckboxRow
                    label="Progredir o cardio"
                    checked={draft.progressao.cardio?.ativa === true}
                    onPress={() => setProgression({
                      cardio: draft.progressao.cardio?.ativa
                        ? null
                        : { ativa: true, valor: 5, alvo: 'ambos' },
                    })}
                  />
                  <Text style={styles.support}>Aumenta duração e distância em 5% por semana.</Text>
                </>
              ) : null}

              {hasRm ? (
                <>
                  <CheckboxRow
                    label="Aumentar intensidade (%RM)"
                    checked={draft.progressao.intensidade?.ativa === true}
                    onPress={() => setProgression({
                      intensidade: draft.progressao.intensidade?.ativa
                        ? null
                        : { ativa: true, valor: 2.5 },
                    })}
                  />
                  <Text style={styles.support}>Aplica-se somente aos exercícios com %RM preenchido.</Text>
                </>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.loadTruth}>
            A carga em kg é ajustada treino a treino, a partir do que você registrar.
          </Text>
          <Button
            label="Ver como fica"
            variant="outline"
            compact
            disabled={!canSave}
            loading={status === 'previewing'}
            onPress={preview}
          />
        </Card>

        {previewData ? (
          <View style={styles.preview}>
            <SectionHeader title="Prévia real do plano" />
            {previewData.semanas.map((week) => (
              <Card key={week.semana} style={styles.previewWeek}>
                <Text style={styles.previewTitle}>{`Semana ${week.semana}`}</Text>
                {week.treinos.map((workout, index) => (
                  <View key={`${workout.nome}-${index}`} style={styles.previewWorkout}>
                    <Text style={styles.previewWorkoutName}>{workout.nome}</Text>
                    <View style={styles.previewMetaRow}>
                      <Text style={styles.previewMeta}>{workout.dia}</Text>
                      <Text style={styles.previewMeta}>·</Text>
                      <Text style={styles.previewMeta}>
                        {workout.minutos == null ? NO_DATA : `${workout.minutos} min`}
                      </Text>
                    </View>
                    {workout.exercicios.map((exercise, exercisePosition) => (
                      <Text key={`${exercise.nome}-${exercisePosition}`} style={styles.previewExercise}>
                        {exercise.nome}: {exercise.alvo}
                      </Text>
                    ))}
                  </View>
                ))}
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          testID="manual-plan-save"
          label="Salvar plano"
          disabled={!canSave}
          loading={status === 'saving'}
          onPress={handleSave}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.huge,
  },
  durationRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  flexOption: { flex: 1 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm },
  workoutListRow: { flex: 1 },
  removeWorkout: { padding: theme.spacing.md },
  addWorkout: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  progressionCard: { marginTop: theme.spacing.xl },
  progressionOptions: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  support: {
    marginLeft: theme.spacing.xxl,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    lineHeight: theme.typography.fontSizes.lg,
  },
  compactOptions: { flexDirection: 'row', gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  seriesWindow: { flexDirection: 'row', gap: theme.spacing.sm },
  seriesField: { flex: 1 },
  loadTruth: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.fontSizes.lg,
  },
  preview: { marginTop: theme.spacing.xl },
  previewWeek: { marginBottom: theme.spacing.md },
  previewTitle: {
    marginBottom: theme.spacing.md,
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  previewWorkout: { marginBottom: theme.spacing.md },
  previewWorkoutName: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  previewMeta: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  previewMetaRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xxs,
  },
  previewExercise: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.raised,
  },
});

export default ManualPlanEditorScreen;
