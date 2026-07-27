import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import {
  Button,
  Card,
  CheckboxRow,
  Chip,
  ListRow,
  Notice,
  NumericField,
  OptionButton,
  Screen,
  SectionHeader,
  StackHeader,
  TextField,
} from '../components/ui';
import {
  resolveExerciseName,
  searchCatalog,
  type CatalogEntry,
  type CatalogMetric,
} from '../services/exerciseCatalogService';
import { useManualPlanStore } from '../store/manualPlanStore';
import theme from '../theme/theme';
import {
  formatWorkDuration,
  isValidExercise,
  isValidExerciseDistance,
  isValidExerciseDuration,
  isValidRmPercent,
  type ManualExerciseDraft,
  type ManualExercisePriority,
} from '../types/manualPlan';

const metricCopy: Record<CatalogMetric, string> = {
  carga_reps: 'Carga e repetições',
  tempo: 'Tempo',
  tempo_distancia: 'Tempo e distância',
};

const newExercise = (entry: CatalogEntry | null, freeName?: string): ManualExerciseDraft => {
  const metrica = entry?.metrica ?? 'carga_reps';
  return {
    exercise_key: entry?.chave ?? null,
    nome: entry?.nome ?? freeName?.trim() ?? '',
    equipamento: entry?.equipamento ?? null,
    metrica,
    series: 3,
    repeticoes: metrica === 'carga_reps' ? '8-12' : null,
    duracao_minutos: metrica === 'carga_reps' ? null : 20,
    distancia_km: null,
    tempo_descanso: 90,
    prioridade: 'secundario',
    percentual_rm: null,
    observacoes: null,
    tem_limitacao: false,
  };
};

const DESCANSO_PRESETS = [45, 60, 90, 120];

const numberOrNull = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const ExercisePickerScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const workoutIndex = route.params?.workoutIndex ?? 0;
  const exerciseIndex = route.params?.exerciseIndex as number | undefined;
  const catalog = useManualPlanStore((state) => state.catalog);
  const catalogError = useManualPlanStore((state) => state.catalogError);
  const incluirCardio = useManualPlanStore((state) => state.incluirCardio);
  const incluirAlongamento = useManualPlanStore((state) => state.incluirAlongamento);
  const addExercise = useManualPlanStore((state) => state.addExercise);
  const updateExercise = useManualPlanStore((state) => state.updateExercise);
  const existing = useManualPlanStore(
    (state) => state.draft?.treinos[workoutIndex]?.exercicios[exerciseIndex ?? -1],
  );
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(incluirCardio && incluirAlongamento);
  const [exercise, setExercise] = useState<ManualExerciseDraft | null>(
    existing ? { ...existing } : null,
  );
  const [addError, setAddError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  /**
   * Antes de aceitar um nome como livre, pergunta ao servidor se ele casa com
   * o catálogo. Os aliases não viajam no payload, então o app não tem como
   * saber sozinho que "Bent Over Row" é "Remada Curvada com Barra" — e o
   * servidor canoniza na gravação de qualquer jeito, descartando em silêncio a
   * métrica que o aluno tivesse escolhido aqui. Offline, o nome livre continua
   * valendo: nada é inventado.
   */
  const usarNomeDigitado = async () => {
    const termo = query.trim();
    if (!termo) return;
    setResolving(true);
    const canonico = await resolveExerciseName(termo);
    setResolving(false);
    setExercise(canonico ? newExercise(canonico) : newExercise(null, termo));
  };

  const results = useMemo(
    () => searchCatalog(query, catalog, {
      incluirCardio: incluirCardio || showOptional,
      incluirMobilidade: incluirAlongamento || showOptional,
      grupo: group,
    }).slice().sort((a, b) =>
      a.grupo_muscular.localeCompare(b.grupo_muscular, 'pt-BR') ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
    ),
    [catalog, group, incluirAlongamento, incluirCardio, query, showOptional],
  );
  const groups = useMemo(
    () => Array.from(new Set(catalog.map((entry) => entry.grupo_muscular))).sort(),
    [catalog],
  );

  const patchExercise = (partial: Partial<ManualExerciseDraft>) => {
    setExercise((current) => current ? { ...current, ...partial } : current);
  };

  const selectMetric = (metrica: CatalogMetric) => {
    patchExercise({
      metrica,
      repeticoes: metrica === 'carga_reps' ? '8-12' : null,
      duracao_minutos: metrica === 'carga_reps' ? null : 20,
      distancia_km: null,
      percentual_rm: metrica === 'carga_reps' ? exercise?.percentual_rm ?? null : null,
    });
  };

  const submit = () => {
    if (!exercise || !isValidExercise(exercise)) return;
    if (exerciseIndex == null) {
      // O teto de 30 exercícios devolvia false e o picker fechava do mesmo
      // jeito: o aluno preenchia tudo, voltava e não via exercício nenhum,
      // sem nenhuma mensagem. Agora o motivo aparece na própria tela.
      if (!addExercise(workoutIndex, exercise)) {
        setAddError('Este treino já tem 30 exercícios. Remova um antes de adicionar outro.');
        return;
      }
    } else {
      updateExercise(workoutIndex, exerciseIndex, exercise);
    }
    navigation.goBack();
  };

  if (!exercise) {
    const canUseFreeName = query.trim().length > 0 && results.length === 0;
    let lastGroup = '';
    return (
      <Screen>
        <StackHeader title="Adicionar exercício" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="Buscar ou escrever exercício"
            value={query}
            autoFocus
            placeholder="Ex.: Supino reto"
            onChangeText={setQuery}
          />
          {catalogError ? (
            <Notice tone="info" title="Catálogo indisponível" description={catalogError} />
          ) : null}

          {groups.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Pressable onPress={() => setGroup(null)}>
                <Chip label="Todos" tone={group === null ? 'accent' : 'neutral'} />
              </Pressable>
              {groups
                .filter((item) => showOptional || !['Cardio', 'Mobilidade'].includes(item))
                .map((item) => (
                  <Pressable key={item} onPress={() => setGroup(item)}>
                    <Chip label={item} tone={group === item ? 'accent' : 'neutral'} />
                  </Pressable>
                ))}
            </ScrollView>
          ) : null}

          {(!incluirCardio || !incluirAlongamento) && !showOptional ? (
            <Button
              label="Mostrar cardio e mobilidade"
              variant="ghost"
              compact
              onPress={() => setShowOptional(true)}
              style={styles.showOptional}
            />
          ) : null}

          {canUseFreeName ? (
            <ListRow
              title={`Usar “${query.trim()}”`}
              subtitle={resolving ? 'Conferindo no catálogo…' : 'Nome livre'}
              showChevron
              onPress={usarNomeDigitado}
              style={styles.freeRow}
            />
          ) : null}

          {results.map((entry) => {
            const showGroup = entry.grupo_muscular !== lastGroup;
            lastGroup = entry.grupo_muscular;
            return (
              <React.Fragment key={entry.chave}>
                {showGroup ? <SectionHeader title={entry.grupo_muscular} style={styles.group} /> : null}
                <ListRow
                  title={entry.nome}
                  subtitle={`${entry.equipamento} · ${metricCopy[entry.metrica]}`}
                  showChevron
                  onPress={() => setExercise(newExercise(entry))}
                />
              </React.Fragment>
            );
          })}
        </ScrollView>
      </Screen>
    );
  }

  const isFree = exercise.exercise_key === null;
  return (
    <Screen>
      <StackHeader title={exercise.nome} onBack={() => setExercise(null)} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {addError ? <Notice tone="danger" title={addError} /> : null}
        {isFree ? (
          <Notice
            tone="info"
            title="Esse exercício ainda não está na nossa lista"
            description="Ele vai funcionar normalmente; a sugestão de carga pelo histórico pode demorar mais a aparecer."
          />
        ) : null}

        <Card style={styles.summary}>
          <Text style={styles.exerciseName}>{exercise.nome}</Text>
          {exercise.equipamento ? <Text style={styles.meta}>{exercise.equipamento}</Text> : null}
          <Text style={styles.metric}>{metricCopy[exercise.metrica]}</Text>
        </Card>

        {isFree ? (
          <View style={styles.section}>
            <SectionHeader title="Escolher métrica" />
            <View style={styles.optionsRow}>
              {(['carga_reps', 'tempo', 'tempo_distancia'] as CatalogMetric[]).map((metric) => (
                <OptionButton
                  key={metric}
                  label={metricCopy[metric]}
                  selected={exercise.metrica === metric}
                  onPress={() => selectMetric(metric)}
                  style={styles.flexOption}
                />
              ))}
            </View>
          </View>
        ) : null}

        <SectionHeader title="Prescrição" />
        <View style={styles.stepper}>
          <Text style={styles.fieldLabel}>Séries</Text>
          <View style={styles.stepperControls}>
            <Button
              label="−"
              variant="tonal"
              compact
              disabled={exercise.series <= 1}
              onPress={() => patchExercise({ series: exercise.series - 1 })}
            />
            <Text style={styles.stepperValue}>{exercise.series}</Text>
            <Button
              label="+"
              variant="tonal"
              compact
              disabled={exercise.series >= 10}
              onPress={() => patchExercise({ series: exercise.series + 1 })}
            />
          </View>
        </View>

        {exercise.metrica === 'carga_reps' ? (
          <TextField
            label="Faixa de repetições"
            value={exercise.repeticoes ?? ''}
            placeholder="Ex.: 8-12 ou AMRAP"
            maxLength={30}
            onChangeText={(value) => patchExercise({ repeticoes: value || null })}
          />
        ) : (
          <>
            <NumericField
              label="Duração por série (min)"
              value={exercise.duracao_minutos}
              keyboardType="decimal-pad"
              onChangeNumber={(value) => patchExercise({ duracao_minutos: value })}
            />
            {!isValidExerciseDuration(exercise.duracao_minutos) ? (
              <Notice
                tone="danger"
                title="A duração por série precisa ficar entre 15 segundos (0,25) e 180 minutos."
              />
            ) : exercise.duracao_minutos != null && exercise.duracao_minutos < 1 ? (
              <Text style={styles.hint}>
                Equivale a {formatWorkDuration(exercise.duracao_minutos)} por série.
              </Text>
            ) : null}
            {exercise.metrica === 'tempo_distancia' ? (
              <NumericField
                label="Distância por série (km, opcional)"
                value={exercise.distancia_km}
                keyboardType="decimal-pad"
                onChangeNumber={(value) => patchExercise({ distancia_km: value })}
              />
            ) : null}
            {!isValidExerciseDistance(exercise.distancia_km) ? (
              <Notice
                tone="danger"
                title="A distância por série precisa ficar entre 0,01 km (10 m) e 100 km."
              />
            ) : null}
          </>
        )}

        <Text style={styles.fieldLabel}>Descanso</Text>
        <View style={styles.optionsRow}>
          {DESCANSO_PRESETS.map((seconds) => (
            <OptionButton
              key={seconds}
              label={`${seconds}s`}
              selected={exercise.tempo_descanso === seconds}
              onPress={() => patchExercise({ tempo_descanso: seconds })}
              style={styles.flexOption}
            />
          ))}
        </View>
        <NumericField
          label="Outro descanso (segundos)"
          value={typeof exercise.tempo_descanso === 'number' ? exercise.tempo_descanso : null}
          integer
          keyboardType="number-pad"
          // Só quando o descanso muda POR FORA (toque num preset) o campo livre
          // se esvazia. Antes isso valia também no meio da digitação: "600"
          // passava por "60", o campo se limpava e o último "0" virava zero.
          formatExternal={(valor) =>
            valor == null || DESCANSO_PRESETS.includes(valor) ? '' : String(valor)
          }
          onChangeNumber={(value) => patchExercise({ tempo_descanso: value })}
        />

        <Text style={styles.fieldLabel}>Prioridade</Text>
        <View style={styles.optionsRow}>
          {([
            ['primario', 'Principal'],
            ['secundario', 'Secundário'],
            ['acessorio', 'Acessório'],
          ] as Array<[ManualExercisePriority, string]>).map(([value, label]) => (
            <OptionButton
              key={value}
              label={label}
              selected={exercise.prioridade === value}
              onPress={() => patchExercise({ prioridade: value })}
              style={styles.flexOption}
            />
          ))}
        </View>

        {exercise.metrica === 'carga_reps' ? (
          exercise.percentual_rm == null ? (
            <Button
              label="Adicionar intensidade em %RM"
              variant="ghost"
              compact
              onPress={() => patchExercise({ percentual_rm: 70 })}
              style={styles.optionalField}
            />
          ) : (
            <TextField
              label="Intensidade (%RM, opcional)"
              value={String(exercise.percentual_rm)}
              keyboardType="decimal-pad"
              onChangeText={(value) => patchExercise({ percentual_rm: numberOrNull(value) })}
            />
          )
        ) : null}

        <TextField
          label="Observações (opcional)"
          value={exercise.observacoes ?? ''}
          multiline
          maxLength={1000}
          onChangeText={(value) => patchExercise({ observacoes: value || null })}
        />
        <CheckboxRow
          label="Tenho limitação neste exercício"
          checked={exercise.tem_limitacao}
          onPress={() => patchExercise({ tem_limitacao: !exercise.tem_limitacao })}
        />
        <Text style={styles.support}>O app não vai sugerir aumento de carga aqui.</Text>
        {!isValidRmPercent(exercise.percentual_rm) ? (
          <Notice tone="danger" title="A intensidade em %RM precisa ficar entre 0 e 100." />
        ) : null}

        <Button
          label={exerciseIndex == null ? 'Adicionar ao treino' : 'Salvar exercício'}
          // Só avisar não bastava: o valor inválido entrava no rascunho, a tela
          // fechava, e o Salvar do plano ficava cinza para sempre sem que
          // nenhuma tela dissesse o motivo.
          disabled={!isValidExercise(exercise)}
          onPress={submit}
        />
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  hint: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSizes.sm,
    marginTop: -theme.spacing.xs,
  },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.huge,
  },
  chips: { gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
  showOptional: { alignSelf: 'flex-start', marginBottom: theme.spacing.sm },
  freeRow: { borderColor: theme.colors.accent.border, marginBottom: theme.spacing.md },
  group: { marginTop: theme.spacing.lg },
  summary: { marginBottom: theme.spacing.xl },
  exerciseName: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  meta: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  metric: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.accent,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  section: { marginBottom: theme.spacing.lg },
  optionsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  flexOption: { flex: 1 },
  stepper: { marginBottom: theme.spacing.lg },
  fieldLabel: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  stepperValue: {
    minWidth: theme.spacing.xxl,
    textAlign: 'center',
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  optionalField: { alignSelf: 'flex-start', marginBottom: theme.spacing.lg },
  support: {
    marginLeft: theme.spacing.xxl,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xl,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
});

export default ExercisePickerScreen;
