// src/screens/SettingsScreen.tsx
// Superfície de escolha do acento neon: quatro opções fechadas, com preview
// otimista fornecido pelo ThemeProvider e feedback acessível de persistência.
// A seleção nunca vive nesta tela; checked e rollback vêm exclusivamente do
// provider para que a conta confirmada continue sendo a única fonte de verdade.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { Button } from '../components/ui';
import { StackHeader } from '../components/ui/Controls';
import { Notice } from '../components/ui/Feedback';
import { Screen, ScreenTitle, SectionHeader } from '../components/ui/Surface';
import {
  useTheme,
  useThemeStyles,
  type ThemeSaveStatus,
} from '../theme/ThemeProvider';
import { NEON_COLORS, type NeonColorKey, type Theme } from '../theme/theme';
import type { ProfileStackParamList } from '../navigation/MainNavigator';

type SettingsNavigationProp = StackNavigationProp<
  ProfileStackParamList,
  'Settings'
>;

type KeyboardPressEvent = {
  key?: string;
  nativeEvent?: { key?: string };
  preventDefault?: () => void;
};

type KeyboardPressableProps = React.ComponentProps<typeof Pressable> & {
  onKeyDown?: (event: KeyboardPressEvent) => void;
  tabIndex?: 0 | -1;
};

// React Native não declara os eventos de teclado no Pressable nativo, mas o
// renderer web os encaminha ao mesmo host. O cast fica isolado nesta fronteira
// e não altera a API usada no iOS/Android.
const KeyboardPressable =
  Pressable as unknown as React.ComponentType<KeyboardPressableProps>;

const NEON_OPTIONS: ReadonlyArray<{
  key: NeonColorKey;
  label: string;
  hex: string;
}> = [
  { key: 'yellow', label: 'Amarelo neon', hex: NEON_COLORS.yellow },
  { key: 'blue', label: 'Azul neon', hex: NEON_COLORS.blue },
  { key: 'green', label: 'Verde neon', hex: NEON_COLORS.green },
  { key: 'red', label: 'Vermelho neon', hex: NEON_COLORS.red },
];

const statusAnnouncement = (status: ThemeSaveStatus): string | null => {
  switch (status) {
    case 'saving':
      return 'Salvando...';
    case 'success':
      return 'Acento salvo na sua conta.';
    case 'error':
      return 'Nao foi possivel salvar o acento. Sua cor anterior foi restaurada.';
    default:
      return null;
  }
};

const SettingsScreen = () => {
  const navigation = useNavigation<SettingsNavigationProp>();
  const { width } = useWindowDimensions();
  const { theme, neonColor, status, selectNeonColor, retryNeonColor } =
    useTheme();
  const styles = useThemeStyles(createStyles);
  const [focusedIndex, setFocusedIndex] = useState(() =>
    Math.max(
      0,
      NEON_OPTIONS.findIndex((option) => option.key === neonColor),
    ),
  );
  const cardRefs = useRef<Array<{ focus?: () => void } | null>>([]);
  const announcedStatusRef = useRef<ThemeSaveStatus | null>(null);
  const saving = status === 'saving';

  useEffect(() => {
    if (status === 'idle') {
      announcedStatusRef.current = null;
      return;
    }

    if (announcedStatusRef.current === status) return;
    announcedStatusRef.current = status;
    const message = statusAnnouncement(status);
    if (message) AccessibilityInfo.announceForAccessibility?.(message);
  }, [status]);

  const focusOption = useCallback((index: number) => {
    setFocusedIndex(index);
    if (Platform.OS === 'web') {
      cardRefs.current[index]?.focus?.();
    }
  }, []);

  const chooseOption = useCallback(
    (index: number) => {
      if (saving) return;
      const option = NEON_OPTIONS[index];
      if (!option) return;
      focusOption(index);
      // O provider mantém o lock/generation guard. A tela só impede eventos
      // visuais quando saving e nunca mantém uma cópia paralela da seleção.
      void selectNeonColor(option.key);
    },
    [focusOption, saving, selectNeonColor],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardPressEvent, index: number) => {
      if (saving) return;
      const key = event.key ?? event.nativeEvent?.key;

      if (key === 'ArrowRight' || key === 'ArrowDown') {
        event.preventDefault?.();
        focusOption((index + 1) % NEON_OPTIONS.length);
        return;
      }

      if (key === 'ArrowLeft' || key === 'ArrowUp') {
        event.preventDefault?.();
        focusOption((index - 1 + NEON_OPTIONS.length) % NEON_OPTIONS.length);
        return;
      }

      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        event.preventDefault?.();
        chooseOption(index);
      }
    },
    [chooseOption, focusOption, saving],
  );

  const renderOption = (
    option: (typeof NEON_OPTIONS)[number],
    index: number,
  ) => {
    const selected = neonColor === option.key;
    const focused = Platform.OS === 'web' && focusedIndex === index;

    return (
      <KeyboardPressable
        key={option.key}
        ref={(node) => {
          cardRefs.current[index] = node as { focus?: () => void } | null;
        }}
        testID={`neon-option-${option.key}`}
        onPress={() => chooseOption(index)}
        onFocus={() => setFocusedIndex(index)}
        onKeyDown={
          Platform.OS === 'web'
            ? (event) => handleKeyDown(event, index)
            : undefined
        }
        disabled={saving}
        tabIndex={Platform.OS === 'web' ? (focused ? 0 : -1) : undefined}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityState={{
          checked: selected,
          disabled: saving,
          busy: saving,
        }}
        style={[
          styles.option,
          width < 360 && styles.optionSingleColumn,
          selected && styles.optionSelected,
          focused && styles.optionFocused,
        ]}
      >
        <View
          testID={`neon-swatch-${option.key}`}
          style={[styles.swatch, { backgroundColor: option.hex }]}
        >
          {selected ? (
            <Text style={styles.swatchCheck} accessibilityElementsHidden>
              ✓
            </Text>
          ) : null}
        </View>
        <View style={styles.optionCopy}>
          <Text style={styles.optionLabel}>{option.label}</Text>
          {selected ? (
            <Text style={styles.selectedLabel}>Selecionado</Text>
          ) : null}
        </View>
      </KeyboardPressable>
    );
  };

  const announcement = statusAnnouncement(status);

  return (
    <Screen contentStyle={styles.screenContent}>
      <View style={styles.content} testID="settings-content">
        <StackHeader title="Ajustes" onBack={() => navigation.goBack()} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <ScreenTitle
            kicker="Aparencia"
            title="Seu acento neon."
            subtitle="Escolha a cor usada em ações, foco e progresso concluído."
          />

          <SectionHeader title="Cor do acento" />
          <View
            testID="settings-options"
            accessibilityRole="radiogroup"
            accessibilityLabel="Cor do acento"
            style={[
              styles.options,
              width < 360
                ? styles.optionsSingleColumn
                : styles.optionsTwoColumns,
            ]}
          >
            {NEON_OPTIONS.map(renderOption)}
          </View>

          <Text style={styles.supportingCopy}>
            Cores de informação, sucesso, aviso e erro não mudam.
          </Text>

          {announcement ? (
            status === 'saving' ? (
              <View
                testID="settings-status"
                accessibilityLiveRegion="polite"
                style={styles.statusRow}
              >
                <ActivityIndicator
                  testID="settings-saving-indicator"
                  size="small"
                  color={theme.colors.accent.main}
                />
                <Text style={styles.statusMessage}>{announcement}</Text>
              </View>
            ) : (
              <Text
                testID="settings-status"
                accessibilityLiveRegion="polite"
                style={styles.statusMessage}
              >
                {announcement}
              </Text>
            )
          ) : null}

          {status === 'error' ? (
            <Notice
              testID="settings-error"
              tone="danger"
              title="Nao foi possivel salvar o acento"
              description="Sua cor anterior foi restaurada. Tente novamente quando a conexao voltar."
              action={
                <Button
                  label="Tentar novamente"
                  variant="outline"
                  compact
                  onPress={() => void retryNeonColor()}
                />
              }
              style={styles.errorNotice}
            />
          ) : null}
        </ScrollView>
      </View>
    </Screen>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screenContent: { flex: 1 },
    content: {
      width: '100%',
      maxWidth: 420,
      flex: 1,
      alignSelf: 'center',
    },
    scrollContent: {
      paddingTop: theme.spacing.xxl,
      paddingBottom: theme.spacing.huge,
    },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.md,
    },
    optionsTwoColumns: { flexDirection: 'row' },
    optionsSingleColumn: { flexDirection: 'column' },
    option: {
      width: '48%',
      minHeight: theme.hitTarget.regular,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surface.card,
    },
    optionSingleColumn: { width: '100%' },
    optionSelected: {
      borderColor: theme.colors.accent.main,
      backgroundColor: theme.colors.accent.soft,
    },
    optionFocused: {
      borderWidth: 2,
      borderColor: theme.colors.accent.main,
    },
    swatch: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.borderRadius.pill,
    },
    swatchCheck: {
      color: theme.colors.accent.on,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.md,
      fontWeight: theme.typography.fontWeights.bold,
    },
    optionCopy: { flex: 1, minWidth: 0 },
    optionLabel: {
      color: theme.colors.text.primary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.base,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    selectedLabel: {
      marginTop: theme.spacing.xxs,
      color: theme.colors.text.accent,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.xs,
      fontWeight: theme.typography.fontWeights.semiBold,
    },
    supportingCopy: {
      marginTop: theme.spacing.xl,
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },
    statusMessage: {
      color: theme.colors.text.secondary,
      fontFamily: theme.fonts.ui,
      fontSize: theme.typography.fontSizes.sm,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    errorNotice: { marginTop: theme.spacing.lg },
  });

export default SettingsScreen;
