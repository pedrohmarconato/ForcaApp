import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

// Parâmetros para as rotas de autenticação
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

// Parâmetros para as rotas principais (ATUALIZADO)
// Adicionado WorkoutDetail
export type MainStackParamList = {
  Home: undefined;
  Profile: undefined;
  TrainingDetail: { sessionId: string };
  Questionnaire: undefined;
  Settings: undefined;
  WorkoutDetail: { trainingId: string }; // <-- Adicionado conforme solicitado
};

// Parâmetros para o TabNavigator (ATUALIZADO)
// Removido CalendarTab
export type TabParamList = {
  HomeTab: undefined;
  TrainingTab: undefined;
  // CalendarTab: undefined; // <-- Removido conforme solicitado
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

// NOTA: Se você precisar de tipos para a nova rota WorkoutDetail,
// você pode adicioná-los seguindo o mesmo padrão:
// export type WorkoutDetailScreenProps = {
//   navigation: StackNavigationProp<MainStackParamList, 'WorkoutDetail'>;
//   route: RouteProp<MainStackParamList, 'WorkoutDetail'>;
// };

// União de todas as listas de parâmetros para uso geral
// (ATUALIZADO automaticamente devido às mudanças em MainStackParamList e TabParamList)
export type RootStackParamList = AuthStackParamList & MainStackParamList & TabParamList;