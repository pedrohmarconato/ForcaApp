// src/navigation/OnboardingNavigator.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import QuestionnaireScreen from '../screens/QuestionnaireScreen';
import PostQuestionnaireChat from '../screens/PostQuestionnaireChat';
import ManualPlanEditorScreen from '../screens/ManualPlanEditorScreen';
import ManualWorkoutEditorScreen from '../screens/ManualWorkoutEditorScreen';
import ExercisePickerScreen from '../screens/ExercisePickerScreen';
import InstallScreen from '../screens/InstallScreen';
import theme from '../theme/theme';
import type { ManualOnboardingQuestionnaire } from '../types/manualPlan';
import { stackCardStyle, stackTransition } from './navigationStyles';

// Corrigido: Tipagem adequada para parâmetros de rota
export type OnboardingStackParamList = {
  Questionnaire: undefined;
  PostQuestionnaireChat: {
    formData?: ManualOnboardingQuestionnaire;
    skipChat?: boolean;
    manualPlanId?: string;
  };
  ManualPlanEditor: {
    onboarding: true;
    questionnaireData: ManualOnboardingQuestionnaire;
  };
  ManualWorkoutEditor: { workoutIndex: number };
  ExercisePicker: { workoutIndex: number; exerciseIndex?: number };
  // INST-02 (Fase 12): rota pública /instalar, alcançável também durante o
  // onboarding (este navigator É tipado — Pitfall 3 de 12-RESEARCH.md).
  Instalar: undefined;
};

const Stack = createStackNavigator<OnboardingStackParamList>();

const OnboardingNavigator = () => {
  return (
    // O cabeçalho nativo herda os tokens do tema: sem ele, a faixa clara
    // padrão quebraria a superfície escura da identidade.
    <Stack.Navigator
      initialRouteName="Questionnaire"
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface.canvas,
          borderBottomWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: theme.colors.text.secondary,
        headerTitleStyle: {
          color: theme.colors.text.primary,
          fontFamily: theme.fonts.ui,
          fontSize: theme.typography.fontSizes.md,
          fontWeight: theme.typography.fontWeights.semiBold,
        },
        headerTitleAlign: 'left',
        cardStyle: stackCardStyle,
        ...stackTransition,
      }}
    >
      <Stack.Screen
        name="Questionnaire"
        component={QuestionnaireScreen}
        // Direção 03: a tela tem barra própria de stepper (voltar · contagem ·
        // módulos do F) — o header nativo sairia duplicado.
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PostQuestionnaireChat"
        component={PostQuestionnaireChat}
        options={{ title: 'Ajustes finais' }}
      />
      <Stack.Screen
        name="ManualPlanEditor"
        component={ManualPlanEditorScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ManualWorkoutEditor"
        component={ManualWorkoutEditorScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ExercisePicker"
        component={ExercisePickerScreen}
        options={{ headerShown: false }}
      />
      {/* INST-02 (Fase 12): homeRoute="Questionnaire" — o CTA "Já instalado"
          volta pra cá nesta árvore. */}
      <Stack.Screen name="Instalar" options={{ headerShown: false }}>
        {() => <InstallScreen homeRoute="Questionnaire" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;
