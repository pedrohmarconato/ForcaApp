import React from 'react';
import { stackCardStyle, stackTransition } from './navigationStyles';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import theme from '../theme/theme';

// Tipo dos nomes de ícone válidos do Feather (evita string genérica)
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

// Importar as telas
import HomeScreen from '../screens/HomeScreen';
import TrainingSessionScreen from '../screens/TrainingSessionScreen';
import ProgressScreen from '../screens/ProgressScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';
import ActiveSessionScreen from '../screens/ActiveSessionScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import SessionHistoryDetailScreen from '../screens/SessionHistoryDetailScreen';
import JointInviteScreen from '../screens/JointInviteScreen';
import JointJoinScreen from '../screens/JointJoinScreen';
import JointLobbyScreen from '../screens/JointLobbyScreen';
import QuestionnaireScreen from '../screens/QuestionnaireScreen';
import PostQuestionnaireChat from '../screens/PostQuestionnaireChat';
// Achado P1 (review 2026-08-06): a flag isJointTrainingEnabled() (achado A1)
// só afastava o card da Home — a rota em si não tinha guard nenhum. Ver
// src/navigation/JointTrainingGate.tsx para o porquê do guard viver aqui, no
// registro da tela, e não dentro de JointInviteScreen/JointJoinScreen.
import { withJointTrainingGate } from './JointTrainingGate';

// Direção 03 — 4 abas: Hoje · Plano · Progresso · Perfil. A execução da sessão
// (ActiveSession) é registrada na Home e na aba Treino. O histórico saiu do
// Perfil e virou cidadão de primeira classe dentro do Progresso.
export type HomeStackParamList = {
  HomeMain: undefined;
  WorkoutDetail: { sessionId: string };
  ActiveSession: { sessionId: string };
  // Treino conjunto (Sprint 02). `JointLobby` recebe SÓ o id da sessão: ele vem
  // do retorno de create/join, nunca do código parseado de um link.
  JointInvite: undefined;
  JointJoin: { code?: string };
  JointLobby: { jointSessionId: string };
};

export type TrainingStackParamList = {
  TrainingOverview: undefined;
  WorkoutDetail: { sessionId: string };
  ActiveSession: { sessionId: string };
  // Regeneração de plano a partir da aba Plano (Nível 4): o mesmo fluxo do
  // onboarding, montado dentro do stack de treino. skipChat=true dispara a
  // geração direto, sem chat.
  Questionnaire: undefined;
  PostQuestionnaireChat: { formData?: any; skipChat?: boolean };
};

export type ProgressStackParamList = {
  ProgressMain: undefined;
  SessionHistory: undefined;
  SessionHistoryDetail: { sessionLogId: string; title?: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
};

/**
 * Rotas do tab navigator do app. Cada aba é um stack; o NavigatorScreenParams
 * deixa telas de um stack navegarem PARA OUTRA aba (ex.: "Refazer treino" do
 * Perfil empurra Questionnaire dentro do stack de Treino).
 */
export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Training: NavigatorScreenParams<TrainingStackParamList>;
  Progress: NavigatorScreenParams<ProgressStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

const BottomTab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createStackNavigator<HomeStackParamList>();
const TrainingStack = createStackNavigator<TrainingStackParamList>();
const ProgressStack = createStackNavigator<ProgressStackParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle, ...stackTransition }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      <HomeStack.Screen name="ActiveSession" component={ActiveSessionScreen} />
      <HomeStack.Screen name="JointInvite" component={withJointTrainingGate(JointInviteScreen) as any} />
      <HomeStack.Screen name="JointJoin" component={withJointTrainingGate(JointJoinScreen) as any} />
      <HomeStack.Screen name="JointLobby" component={withJointTrainingGate(JointLobbyScreen) as any} />
    </HomeStack.Navigator>
  );
}

function TrainingStackNavigator() {
  return (
    <TrainingStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle, ...stackTransition }}>
      <TrainingStack.Screen name="TrainingOverview" component={TrainingSessionScreen} />
      <TrainingStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      <TrainingStack.Screen name="ActiveSession" component={ActiveSessionScreen} />
      <TrainingStack.Screen name="Questionnaire" component={QuestionnaireScreen} options={{ headerShown: false }} />
      <TrainingStack.Screen name="PostQuestionnaireChat" component={PostQuestionnaireChat} />
    </TrainingStack.Navigator>
  );
}

function ProgressStackNavigator() {
  return (
    <ProgressStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle, ...stackTransition }}>
      <ProgressStack.Screen name="ProgressMain" component={ProgressScreen} />
      <ProgressStack.Screen name="SessionHistory" component={SessionHistoryScreen} />
      <ProgressStack.Screen name="SessionHistoryDetail" component={SessionHistoryDetailScreen} />
    </ProgressStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle, ...stackTransition }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
    </ProfileStack.Navigator>
  );
}

const MainNavigator = () => {
  return (
    <BottomTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName: FeatherIconName;

          switch (route.name) {
            case 'Home':
              iconName = 'home';
              break;
            case 'Training':
              iconName = 'layers';
              break;
            case 'Progress':
              iconName = 'trending-up';
              break;
            case 'Profile':
              iconName = 'user';
              break;
            default:
              iconName = 'circle';
          }

          return <Feather name={iconName} size={size} color={color} />;
        },
        // A aba ativa é um dos poucos lugares onde o neon aparece no chrome.
        tabBarActiveTintColor: theme.colors.accent.main,
        tabBarInactiveTintColor: theme.colors.text.quiet,
        tabBarStyle: {
          height: 64,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border.subtle,
          backgroundColor: theme.colors.surface.canvas,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: theme.fonts.ui,
          fontSize: theme.typography.fontSizes.micro,
          fontWeight: theme.typography.fontWeights.semiBold,
        },
      })}
    >
      {/* Os nomes de rota seguem os mesmos; só os rótulos visíveis mudam. */}
      <BottomTab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{ tabBarLabel: 'Hoje' }}
      />
      <BottomTab.Screen
        name="Training"
        component={TrainingStackNavigator}
        options={{ tabBarLabel: 'Plano' }}
      />
      <BottomTab.Screen
        name="Progress"
        component={ProgressStackNavigator}
        options={{ tabBarLabel: 'Progresso' }}
      />
      <BottomTab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{ tabBarLabel: 'Perfil' }}
      />
    </BottomTab.Navigator>
  );
};

export default MainNavigator;
