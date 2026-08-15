// src/screens/InstallScreen.tsx
// Fase 12 Plano 01 (INST-02) — rota pública `/instalar`, alcançável em
// QUALQUER estado de sessão (deslogado, onboarding incompleto, logado).
// Orquestra os 4 estados de detecção (installDetection.ts) com a copy
// literal de 12-UI-SPEC.md. Web-only: fora do 'web', retorna null antes de
// chamar qualquer função de detecção (mesmo padrão de UpdateBanner.tsx:80).
//
// `homeRoute`: cada um dos 3 pontos de registro (AuthNavigator,
// OnboardingNavigator, MainNavigator) passa sua própria rota-lar estática —
// o CTA do Estado 4 nunca navega para um destino hardcoded dentro deste
// componente (ver key_link do 12-01-PLAN.md).
//
// Rules of Hooks: `useNavigation()` é chamado ANTES do early return de
// `Platform.OS !== 'web'`, mesma ordem real de UpdateBanner.tsx (hooks
// primeiro, guarda de Platform depois) — nunca condicionar a chamada de um
// hook a um branch (WR-01, 12-REVIEW.md).
//
// Zero dado de usuário: esta tela não recebe nem lê nenhuma prop/hook de
// AuthContext/sessão/perfil, mesmo estando registrada dentro da árvore Main
// (usuário logado) — conteúdo estático puro.

import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import theme from '../theme/theme';
import { ForcaLockup } from '../components/ui/Logo';
import Button from '../components/ui/Button';
import { Chip, Notice } from '../components/ui/Feedback';
import { isIOS, isSafari, isStandalone } from '../utils/installDetection';

type InstallScreenProps = {
  /** Rota-lar da árvore em que esta tela está montada (Login/Questionnaire/Home). */
  homeRoute: string;
};

type StepRowProps = {
  number: number;
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description: string;
  isLast?: boolean;
};

const StepRow = ({ number, icon, title, description, isLast = false }: StepRowProps) => (
  <View style={[styles.stepRow, isLast && styles.stepRowLast]}>
    <View style={styles.stepBadge}>
      <Text style={styles.stepBadgeNumber}>{number}</Text>
    </View>
    <View style={styles.stepText}>
      <View style={styles.stepTitleRow}>
        <Feather name={icon} size={18} color={theme.colors.text.primary} />
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <Text style={styles.stepDescription}>{description}</Text>
    </View>
  </View>
);

const InstallScreen = ({ homeRoute }: InstallScreenProps) => {
  // Hook primeiro — Rules of Hooks (WR-01, 12-REVIEW.md): nunca condicionar
  // a chamada de um hook a um early return. `any`: InstallScreen monta em 3
  // árvores tipadas de forma diferente (AuthNavigator sem generic,
  // OnboardingNavigator/MainNavigator tipados com ParamLists distintos) —
  // mesmo padrão já usado em ExercisePickerScreen.tsx para uma tela que
  // navega fora do seu próprio ParamList estático.
  const navigation = useNavigation<any>();

  if (Platform.OS !== 'web') return null;

  // Síncrono, sem useEffect — o estado final já está calculado no primeiro
  // render (sem rede, sem await; UI Consideration "loading" de 12-UI-SPEC.md).
  const standalone = isStandalone();
  const ios = isIOS();
  const safari = isSafari();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <ForcaLockup style={styles.lockup} />

          {standalone ? (
            <InstallScreenStandalone homeRoute={homeRoute} navigation={navigation} />
          ) : ios && safari ? (
            <InstallScreenIOSSafari />
          ) : ios && !safari ? (
            <InstallScreenIOSOtherBrowser />
          ) : (
            <InstallScreenFallback />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- Estado 1: iOS + Safari (caminho feliz) --------------------------------

const InstallScreenIOSSafari = () => (
  <>
    <Text style={styles.eyebrow}>INSTALAÇÃO</Text>
    <Text style={styles.headline} accessibilityRole="header">
      Instale o ForçaApp no seu iPhone
    </Text>
    <Text style={styles.support}>Leva menos de um minuto. Siga os 3 passos abaixo.</Text>

    <View style={styles.steps}>
      <StepRow
        number={1}
        icon="share"
        title="Toque em Compartilhar"
        description="Na barra de baixo do Safari, toque no ícone do quadrado com a seta para cima."
      />
      <StepRow
        number={2}
        icon="plus-square"
        title='Toque em "Adicionar à Tela de Início"'
        description='Deslize a lista de opções até encontrar "Adicionar à Tela de Início" e toque nela.'
      />
      <StepRow
        number={3}
        icon="check-circle"
        title='Toque em "Adicionar"'
        description='Confirme tocando em "Adicionar", no canto superior direito da tela.'
        isLast
      />
    </View>

    <Text style={styles.closingNote}>
      Pronto! O ícone do ForçaApp vai aparecer na sua Tela de Início, igual a um aplicativo de
      verdade.
    </Text>
  </>
);

// --- Estado 2: iOS + outro navegador ---------------------------------------

const InstallScreenIOSOtherBrowser = () => (
  <>
    <Text style={styles.headline} accessibilityRole="header">
      Abra este link no Safari
    </Text>
    <Notice
      tone="info"
      title="Você está usando outro navegador. Para instalar o ForçaApp, este link precisa ser aberto no Safari — o navegador que já vem no iPhone."
      description='Toque e segure este link, escolha "Copiar" e cole na barra de endereço do Safari. Ou toque no menu do seu navegador e escolha "Abrir no Safari", se essa opção aparecer.'
      style={styles.notice}
    />
  </>
);

// --- Estado 3: desktop/Android + UA não reconhecida ------------------------

const InstallScreenFallback = () => {
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <>
      <Text style={styles.headline} accessibilityRole="header">
        Abra este link no seu iPhone
      </Text>
      <Text style={styles.support}>
        O ForçaApp só pode ser instalado por um iPhone, usando o Safari. Envie este endereço
        para o seu iPhone (por mensagem ou e-mail) e abra por lá.
      </Text>
      <View style={styles.urlChip}>
        <Text style={styles.urlChipText} selectable>
          {currentUrl}
        </Text>
      </View>
    </>
  );
};

// --- Estado 4: standalone (já instalado) -----------------------------------

type StandaloneNav = { navigate: (route: string) => void };

const InstallScreenStandalone = ({
  homeRoute,
  navigation,
}: {
  homeRoute: string;
  navigation: StandaloneNav;
}) => (
  <>
    <View style={styles.successBadge}>
      <Feather name="check-circle" size={22} color={theme.colors.accent.main} />
    </View>
    <Chip label="INSTALADO" tone="accent" style={styles.successChip} />
    <Text style={styles.headline} accessibilityRole="header">
      Você já instalou o ForçaApp
    </Text>
    <Text style={styles.support}>
      O aplicativo está pronto na sua Tela de Início. Pode fechar esta página e abrir o app por
      lá.
    </Text>
    <Button
      label="Abrir o ForçaApp"
      variant="primary"
      onPress={() => navigation.navigate(homeRoute)}
      style={styles.cta}
    />
  </>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface.canvas,
  },
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
  lockup: {
    alignSelf: 'center',
    marginBottom: theme.spacing.xxxl,
  },
  eyebrow: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wider,
    textTransform: 'uppercase',
  },
  headline: {
    marginTop: theme.spacing.xxs,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    lineHeight: theme.typography.fontSizes.display * theme.typography.lineHeights.tight,
  },
  support: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  steps: {
    marginTop: theme.spacing.xxl,
  },
  stepRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },
  stepRowLast: {
    marginBottom: 0,
  },
  stepBadge: {
    width: theme.spacing.huge,
    height: theme.spacing.huge,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.veil.faint,
    borderWidth: 1,
    borderColor: theme.colors.border.focus,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeNumber: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.accent,
  },
  stepText: {
    flex: 1,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepTitle: {
    flexShrink: 1,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text.primary,
  },
  stepDescription: {
    marginTop: theme.spacing.xxs,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.regular,
    lineHeight: theme.typography.fontSizes.lg * theme.typography.lineHeights.normal,
    color: theme.colors.text.secondary,
  },
  closingNote: {
    marginTop: theme.spacing.xxl,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.regular,
    color: theme.colors.text.secondary,
  },
  notice: {
    marginTop: theme.spacing.xl,
  },
  urlChip: {
    marginTop: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.surface.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  urlChipText: {
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.primary,
  },
  successBadge: {
    alignSelf: 'center',
    width: theme.spacing.huge,
    height: theme.spacing.huge,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.veil.faint,
    borderWidth: 1,
    borderColor: theme.colors.border.focus,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  successChip: {
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
  cta: {
    marginTop: theme.spacing.xxl,
  },
});

export default InstallScreen;
