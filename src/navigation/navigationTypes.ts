import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

// Parâmetros para as rotas de autenticação
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

// Parâmetros para as rotas principais
export type MainStackParamList = {
  Home: undefined;
  Profile: undefined;
  TrainingDetail: { sessionId: string };
  Questionnaire: undefined;
  Settings: undefined;
};

// Parâmetros para o TabNavigator
export type TabParamList = {
  HomeTab: undefined;
  TrainingTab: undefined;
  CalendarTab: undefined;
  ProfileTab: undefined;
};

// Definição de tipos para cada rota de autenticação
export type LoginScreenProps = {
  navigation: StackNavigationProp<AuthStackParamList, 'Login'>;
  route: RouteProp<AuthStackParamList, 'Login'>;
};

export type RegisterScreenProps = {
  navigation: StackNavigationProp<AuthStackParamList, 'Register'>;
  route: RouteProp<AuthStackParamList, 'Register'>;
};

// Definição de tipos para cada rota principal
export type HomeScreenProps = {
  navigation: StackNavigationProp<MainStackParamList, 'Home'>;
  route: RouteProp<MainStackParamList, 'Home'>;
};

export type ProfileScreenProps = {
  navigation: StackNavigationProp<MainStackParamList, 'Profile'>;
  route: RouteProp<MainStackParamList, 'Profile'>;
};

// União de todas as listas de parâmetros para uso geral
export type RootStackParamList = AuthStackParamList & MainStackParamList & TabParamList;