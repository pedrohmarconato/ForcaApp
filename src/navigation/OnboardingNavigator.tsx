// src/navigation/OnboardingNavigator.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import QuestionnaireScreen from '../screens/QuestionnaireScreen';
import PostQuestionnaireChat from '../screens/PostQuestionnaireChat';
import theme from '../theme/theme';
import { stackCardStyle } from './navigationStyles';

// Corrigido: Tipagem adequada para parâmetros de rota
export type OnboardingStackParamList = {
  Questionnaire: undefined;
  PostQuestionnaireChat: { 
    formData?: any // Ou tipo mais específico para seu formulário
    skipChat?: boolean // Feature A: gerar o treino direto sem passar pelo chat
  };
  // Adicione outras telas aqui
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
      }}
    >
      <Stack.Screen
        name="Questionnaire"
        component={QuestionnaireScreen}
        options={{ title: 'Questionário inicial' }}
      />
      <Stack.Screen
        name="PostQuestionnaireChat"
        component={PostQuestionnaireChat}
        options={{ title: 'Ajustes finais' }}
      />
      {/* Adicione outras telas do onboarding aqui */}
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;