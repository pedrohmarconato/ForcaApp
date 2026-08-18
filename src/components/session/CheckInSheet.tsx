// src/components/session/CheckInSheet.tsx
// Check-in OBRIGATÓRIO antes de iniciar o treino (decisão do dono, 22/07/2026):
//   1. Como está se sentindo para treinar?  (cansado / normal / com energia)
//   2. Quanto tempo disponível tem?         (chips 30/45/60/90, tempo cheio, ou livre)
//
// Direção 03: deixou de ser sheet sobre a tela — é uma TELA DE FOCO que ocupa
// a sessão inteira enquanto as duas respostas não existem. Sem pular e sem
// fechar: o treino só começa com humor + tempo. Contrato de props e rótulos
// idêntico ao do sheet (onConfirm/visible/sessionTitle preservados).

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme, useThemeStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import type { SessionMood } from '../../engine/moodAdjustment';
import Button from '../ui/Button';

type Props = {
  visible: boolean;
  sessionTitle: string | null;
  onConfirm: (answers: { mood: SessionMood; availableMinutes: number | null }) => void;
};

const MOOD_OPTIONS: { value: SessionMood; label: string }[] = [
  { value: 'cansado', label: 'Cansado' },
  { value: 'normal', label: 'Normal' },
  { value: 'com_energia', label: 'Com energia' },
];

const TIME_CHIPS = [30, 45, 60, 90];

const CheckInSheet = ({ visible, sessionTitle, onConfirm }: Props) => {
  const { theme } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [mood, setMood] = useState<SessionMood | null>(null);
  // 'full' = tempo cheio; número = chip; 'custom' = campo livre.
  const [timeChoice, setTimeChoice] = useState<number | 'full' | 'custom' | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');

  const customParsed = useMemo(() => {
    const n = parseInt(customMinutes, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [customMinutes]);

  const timeAnswered =
    timeChoice === 'full' ||
    typeof timeChoice === 'number' ||
    (timeChoice === 'custom' && customParsed != null);

  const canStart = mood != null && timeAnswered;

  const handleConfirm = () => {
    if (!canStart || mood == null) return;
    const availableMinutes =
      timeChoice === 'full'
        ? null
        : typeof timeChoice === 'number'
          ? timeChoice
          : customParsed;
    onConfirm({ mood, availableMinutes: availableMinutes ?? null });
  };

  if (!visible) return null;

  return (
    <View style={styles.tela} testID="checkin-foco">
      <View style={styles.cabeca}>
        <Text style={styles.kicker}>Antes de começar</Text>
        {sessionTitle ? (
          <Text style={styles.titulo} accessibilityRole="header">
            {sessionTitle}
          </Text>
        ) : null}
      </View>

      <Text style={styles.question}>Como está se sentindo para treinar?</Text>
      <View style={styles.seg}>
        {MOOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: mood === opt.value }}
            style={[styles.segItem, mood === opt.value && styles.segItemSelected]}
            onPress={() => setMood(opt.value)}
          >
            <Text style={[styles.segText, mood === opt.value && styles.segTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.question}>Quanto tempo disponível tem?</Text>
      <View style={styles.row}>
        {TIME_CHIPS.map((min) => (
          <TouchableOpacity
            key={min}
            accessibilityRole="button"
            accessibilityLabel={`${min} minutos`}
            accessibilityState={{ selected: timeChoice === min }}
            style={[styles.chip, timeChoice === min && styles.chipSelected]}
            onPress={() => setTimeChoice(min)}
          >
            <Text style={[styles.chipText, timeChoice === min && styles.chipTextSelected]}>
              {min} min
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Tempo cheio"
          accessibilityState={{ selected: timeChoice === 'full' }}
          style={[styles.chip, timeChoice === 'full' && styles.chipSelected]}
          onPress={() => setTimeChoice('full')}
        >
          <Text style={[styles.chipText, timeChoice === 'full' && styles.chipTextSelected]}>
            Tempo cheio
          </Text>
        </TouchableOpacity>
      </View>
      <TextInput
        accessibilityLabel="Outro tempo em minutos"
        style={[styles.input, timeChoice === 'custom' && styles.inputSelected]}
        placeholder="Outro (min)"
        placeholderTextColor={theme.colors.text.secondary}
        keyboardType="number-pad"
        value={customMinutes}
        onFocus={() => setTimeChoice('custom')}
        onChangeText={(v) => {
          setTimeChoice('custom');
          setCustomMinutes(v.replace(/[^0-9]/g, ''));
        }}
      />

      <View style={styles.rodape}>
        <Button label="Começar treino" onPress={handleConfirm} disabled={!canStart} />
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  tela: {
    flex: 1,
    alignSelf: 'stretch',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface.canvas,
  },
  cabeca: { marginBottom: theme.spacing.xxl },
  kicker: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  titulo: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },
  question: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },

  // Humor como segmented control: uma escolha, um gesto.
  seg: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.raised,
  },
  segItem: {
    flex: 1,
    minHeight: theme.hitTarget.compact - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  segItemSelected: {
    backgroundColor: theme.colors.accent.soft,
    borderWidth: 1,
    borderColor: theme.colors.accent.border,
  },
  segText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  segTextSelected: { color: theme.colors.text.accent },

  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    minHeight: theme.hitTarget.compact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.card,
  },
  chipSelected: {
    borderColor: theme.colors.accent.border,
    backgroundColor: theme.colors.accent.soft,
  },
  chipText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSizes.base,
  },
  chipTextSelected: {
    color: theme.colors.text.accent,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  input: {
    marginTop: theme.spacing.sm,
    minHeight: theme.hitTarget.compact,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
    color: theme.colors.text.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inputSelected: {
    borderColor: theme.colors.accent.border,
    backgroundColor: theme.colors.accent.soft,
    color: theme.colors.text.accent,
  },

  rodape: { marginTop: 'auto', paddingTop: theme.spacing.xl },
});

export default CheckInSheet;
