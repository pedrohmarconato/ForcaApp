// src/components/ui/Surface.tsx
// Superfícies e estrutura de tela: Screen, ScreenTitle, Card, SectionHeader,
// ListRow e Divider.
//
// A hierarquia vem do degrau tonal, não de contorno ou sombra (princípio 3).

import React from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';
import { usePressPhysics } from './pressPhysics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// --- Screen ---------------------------------------------------------------

type ScreenProps = {
  children: React.ReactNode;
  /** Envolve o conteúdo num ScrollView com o padding padrão da tela. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Fundo e área segura padrão de todas as telas. */
export const Screen = ({ children, scroll = false, contentStyle, style, testID }: ScreenProps) => (
  <SafeAreaView style={[styles.screen, style]} testID={testID}>
    {scroll ? (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, contentStyle]}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.plainContent, contentStyle]}>{children}</View>
    )}
  </SafeAreaView>
);

// --- Título de tela -------------------------------------------------------

type ScreenTitleProps = {
  /** Linha curta em caixa alta acima do título. */
  kicker?: string;
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
};

/** Cabeçalho editorial: kicker discreto, título humano, subtítulo opcional. */
export const ScreenTitle = ({ kicker, title, subtitle, style }: ScreenTitleProps) => (
  <View style={[styles.screenTitle, style]}>
    {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
    <Text style={styles.title} accessibilityRole="header">
      {title}
    </Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>
);

// --- Card -----------------------------------------------------------------

type CardProps = {
  children: React.ReactNode;
  /** Degrau tonal mais alto, para o card de destaque da tela. */
  elevated?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const Card = ({
  children,
  elevated = false,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: CardProps) => {
  // Superfície grande afunda pouco (0.985) — presença, não pulo.
  const { animatedStyle, onPressIn, onPressOut } = usePressPhysics({ scale: 0.985 });
  const content = [styles.card, elevated && styles.cardElevated, style];

  if (!onPress) {
    return (
      <View style={content} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[...content, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};

// --- Cabeçalho de seção ---------------------------------------------------

type SectionHeaderProps = {
  title: string;
  /** Ação textual discreta à direita (ex.: "Histórico"). */
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const SectionHeader = ({
  title,
  actionLabel,
  onActionPress,
  style,
}: SectionHeaderProps) => (
  <View style={[styles.sectionHeader, style]}>
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {title}
    </Text>
    {actionLabel ? (
      <Pressable onPress={onActionPress} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </Pressable>
    ) : null}
  </View>
);

// --- Linha de lista -------------------------------------------------------

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Bloco à esquerda: dia da semana, ícone de concluído, iniciais. */
  leading?: React.ReactNode;
  /** Texto curto de estado à direita (ex.: "Hoje", "Concluído"). */
  trailingLabel?: string;
  /** Destaca o estado em neon — reservado ao item corrente. */
  trailingAccent?: boolean;
  /** Bloco de ação à direita (ex.: setas do modo reordenar). */
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const ListRow = ({
  title,
  subtitle,
  leading,
  trailingLabel,
  trailingAccent = false,
  trailing,
  onPress,
  showChevron = false,
  style,
  testID,
}: ListRowProps) => {
  const body = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailingLabel ? (
        <Text style={[styles.rowState, trailingAccent && styles.rowStateAccent]}>
          {trailingLabel}
        </Text>
      ) : null}
      {trailing ? <View style={styles.rowTrailing}>{trailing}</View> : null}
      {showChevron ? (
        <Feather name="chevron-right" size={16} color={theme.colors.text.quiet} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, style]} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <PressableListRow
      testID={testID}
      onPress={onPress}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={style}
    >
      {body}
    </PressableListRow>
  );
};

// Hooks não podem ficar no ramo condicional do ListRow — vivem num componente
// próprio, montado só quando a linha é tocável.
const PressableListRow = ({
  children,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressPhysics({ scale: 0.985 });

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.row, animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
};

export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.divider, style]} />
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface.canvas,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.huge,
  },
  plainContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
  },

  screenTitle: { marginBottom: theme.spacing.xxl },
  kicker: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },
  subtitle: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },

  card: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface.card,
  },
  cardElevated: { backgroundColor: theme.colors.surface.elevated },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.tight,
  },
  sectionAction: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface.card,
  },
  rowLeading: { justifyContent: 'center' },
  rowTrailing: { flexDirection: 'row', alignItems: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  rowSubtitle: {
    marginTop: 2,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
  rowState: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
  },
  rowStateAccent: { color: theme.colors.text.accent },

  divider: {
    height: 1,
    backgroundColor: theme.colors.border.subtle,
  },
});
