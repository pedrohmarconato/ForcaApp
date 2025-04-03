// src/navigation/OnboardingNavigator.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import QuestionnaireScreen from '../screens/QuestionnaireScreen';
import PostQuestionnaireChat from '../screens/PostQuestionnaireChat';

// Corrigido: Tipagem adequada para parâmetros de rota
export type OnboardingStackParamList = {
  Questionnaire: undefined;
  PostQuestionnaireChat: { 
    formData?: any // Ou tipo mais específico para seu formulário
  };
  // Adicione outras telas aqui
};

const Stack = createStackNavigator<OnboardingStackParamList>();

const OnboardingNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Questionnaire">
      <Stack.Screen
        name="Questionnaire"
        component={QuestionnaireScreen}
        options={{ title: 'Questionário Inicial' }}
      />
      <Stack.Screen
        name="PostQuestionnaireChat"
        component={PostQuestionnaireChat}
        options={{ title: 'Chat com IA' }}
      />
      {/* Adicione outras telas do onboarding aqui */}
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;