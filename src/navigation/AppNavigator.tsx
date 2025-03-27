import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectQuestionnaireCompleted } from '../store/selectors';
import { fetchUserProfile } from '../store/slices/userSlice';

// Importação dos navegadores
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import QuestionnaireScreen from '../screens/main/QuestionnaireScreen';
import LoadingScreen from '../screens/LoadingScreen';

const AppNavigator = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const questionnaireCompleted = useAppSelector(selectQuestionnaireCompleted);
  const dispatch = useAppDispatch();
  
  // Buscar perfil do usuário quando autenticado
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchUserProfile());
    }
  }, [isAuthenticated, dispatch]);
  
  // Exibir tela de loading enquanto verifica autenticação
  if (authLoading) {
    return <LoadingScreen />;
  }
  
  return (
    <NavigationContainer>
      {isAuthenticated ? (
        questionnaireCompleted ? (
          <MainNavigator />
        ) : (
          <QuestionnaireScreen />
        )
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
};

export default AppNavigator;