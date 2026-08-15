import React from 'react';
import { stackCardStyle, stackTransition } from './navigationStyles';
import { createStackNavigator } from '@react-navigation/stack';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import InstallScreen from '../screens/InstallScreen';

const Stack = createStackNavigator();

const AuthNavigator = () => {
  return (
        // Opção screenOptions já esconde o header para todas as telas neste navigator
    <Stack.Navigator
      screenOptions={{ headerShown: false, cardStyle: stackCardStyle, ...stackTransition }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      {/* INST-02 (Fase 12): rota pública /instalar, alcançável deslogado.
          homeRoute="Login" — o CTA "Já instalado" volta pra cá nesta árvore. */}
      <Stack.Screen name="Instalar">{() => <InstallScreen homeRoute="Login" />}</Stack.Screen>
    </Stack.Navigator>
  );
};

export default AuthNavigator;