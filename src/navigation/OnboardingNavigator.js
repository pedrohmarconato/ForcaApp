import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import QuestionnaireScreen from '../screens/QuestionnaireScreen';
import ChatScreen from '../screens/ChatScreen';
// Importe outras telas do onboarding se houver (ex: ProcessingScreen)

const Stack = createStackNavigator();

const OnboardingNavigator = () => {
  return (
    // Você pode querer mostrar o header aqui ou não
    <Stack.Navigator initialRouteName="Questionnaire">
      <Stack.Screen
        name="Questionnaire"
        component={QuestionnaireScreen}
        options={{ title: 'Questionário Inicial' }} // Exemplo de título
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat com IA' }}
      />
      {/* Adicione outras telas do onboarding aqui */}
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;