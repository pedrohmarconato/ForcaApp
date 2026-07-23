// src/components/session/CheckInSheet.tsx
// Check-in OBRIGATÓRIO antes de iniciar o treino (decisão do dono, 22/07/2026):
//   1. Como está se sentindo para treinar?  (cansado / normal / com energia)
//   2. Quanto tempo disponível tem?         (chips 30/45/60/90, tempo cheio, ou livre)
//
// Sem botão de pular e sem fechar pelo fundo: o treino só começa com as duas
// respostas. Mesma base do AdaptationSheet (Modal nativo, testável em jest).

import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import theme from '../../theme/theme';
import type { SessionMood } from '../../engine/moodAdjustment';

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title} accessibilityRole="header">
            Antes de começar
          </Text>
          {sessionTitle ? <Text style={styles.subtitle}>{sessionTitle}</Text> : null}

          <Text style={styles.question}>Como está se sentindo para treinar?</Text>
          <View style={styles.row}>
            {MOOD_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: mood === opt.value }}
                style={[styles.chip, mood === opt.value && styles.chipSelected]}
                onPress={() => setMood(opt.value)}
              >
                <Text style={[styles.chipText, mood === opt.value && styles.chipTextSelected]}>
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

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Começar treino"
            accessibilityState={{ disabled: !canStart }}
            disabled={!canStart}
            style={[styles.start, !canStart && styles.startDisabled]}
            onPress={handleConfirm}
          >
            <Text style={styles.startText}>Começar treino</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    backgroundColor: theme.colors.surface.card,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.display,
    fontSize: theme.typography.fontSizes.lg,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSizes.base,
    marginBottom: theme.spacing.md,
  },
  question: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.canvas,
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
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  input: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inputSelected: {
    borderColor: theme.colors.accent.border,
  },
  start: {
    marginTop: theme.spacing.xl,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent.main,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  startDisabled: {
    opacity: 0.4,
  },
  startText: {
    color: theme.colors.accent.on,
    fontWeight: theme.typography.fontWeights.semiBold,
    fontSize: theme.typography.fontSizes.md,
  },
});

export default CheckInSheet;
