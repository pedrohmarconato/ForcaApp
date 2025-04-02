// src/navigation/OnboardingNavigator.tsx

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import QuestionnaireScreen from '../screens/QuestionnaireScreen';
// REMOVA a importação antiga do ChatScreen (se existir)
// import ChatScreen from '../screens/ChatScreen';

// <<< IMPORTE O NOVO COMPONENTE >>>
import PostQuestionnaireChat from '../screens/PostQuestionnaireChat'; // Verifique se o caminho está correto

// Importe outras telas do onboarding se houver

const Stack = createStackNavigator();

// <<< OPCIONAL: Defina os tipos para este navegador específico (bom para type safety) >>>
export type OnboardingStackParamList = {
  Questionnaire: undefined;
  PostQuestionnaireChat: undefined; // Use o nome correto aqui
  // Adicione outras telas aqui
};


const OnboardingNavigator = () => {
  return (
    // Use o tipo definido acima se o criou
    <Stack.Navigator initialRouteName="Questionnaire">
      <Stack.Screen
        name="Questionnaire"
        component={QuestionnaireScreen}
        options={{ title: 'Questionário Inicial' }}
      />
      {/* <<< ALTERE ESTA LINHA >>> */}
      <Stack.Screen
        name="PostQuestionnaireChat" // <<< Use o NOME correto
        component={PostQuestionnaireChat} // <<< Use o COMPONENTE correto
        options={{ title: 'Chat com IA' }}
      />
      {/* Adicione outras telas do onboarding aqui */}
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;