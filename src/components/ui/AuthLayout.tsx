// src/components/ui/AuthLayout.tsx
// Moldura comum das telas de autenticação (Login, Cadastro, Redefinir senha).
//
// A Direção 02 abre com a assinatura da marca e um cumprimento editorial —
// título humano à esquerda, apoio discreto embaixo — e só então o formulário.
// Sem círculos decorativos, sem degradê, sem sombra: o contraste é tonal.

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import theme from '../../theme/theme';
import { ForcaLockup } from './Logo';

type AuthLayoutProps = {
  /** Título da tela — a frase que fala com a pessoa. */
  headline: string;
  /** Apoio de uma linha logo abaixo do título. */
  support?: string;
  children: React.ReactNode;
  /** Bloco fixo ao final do cartão (links secundários). */
  footer?: React.ReactNode;
};

const AuthLayout = ({ headline, support, children, footer }: AuthLayoutProps) => (
  <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.brand}>
            <ForcaLockup />
            <Text style={styles.tagline}>Treinamento inteligente</Text>
          </View>

          <View style={styles.welcome}>
            <Text style={styles.headline} accessibilityRole="header">
              {headline}
            </Text>
            {support ? <Text style={styles.support}>{support}</Text> : null}
          </View>

          {children}

          {footer ? <View style={styles.footer}>{footer}</View> : null}

          <Text style={styles.signature}>Tecnologia a serviço da constância.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface.canvas,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.xxl,
    backgroundColor: theme.colors.surface.card,
  },
  brand: { alignItems: 'center' },
  tagline: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wider,
    textTransform: 'uppercase',
  },
  welcome: {
    marginTop: theme.spacing.xxxl,
    marginBottom: theme.spacing.xxl,
  },
  headline: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },
  support: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  footer: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
  },
  signature: {
    marginTop: theme.spacing.xxl,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});

export default AuthLayout;
