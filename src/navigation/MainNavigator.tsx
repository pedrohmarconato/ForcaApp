import React from 'react';
import { stackCardStyle } from './navigationStyles';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

import theme from '../theme/theme';

// Tipo dos nomes de ícone válidos do Feather (evita string genérica)
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

// Importar as telas
import HomeScreen from '../screens/HomeScreen';
import TrainingSessionScreen from '../screens/TrainingSessionScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';
import ActiveSessionScreen from '../screens/ActiveSessionScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import SessionHistoryDetailScreen from '../screens/SessionHistoryDetailScreen';

// Fase 4 — navegação tipada. A execução da sessão (ActiveSession) é registrada
// tanto na Home (Home → Detalhe → Iniciar) quanto na aba Treino (Iniciar/Retomar
// direto). O histórico vive no Perfil. Cada stack declara seu ParamList.
export type HomeStackParamList = {
  HomeMain: undefined;
  WorkoutDetail: { sessionId: string };
  ActiveSession: { sessionId: string };
};

export type TrainingStackParamList = {
  TrainingOverview: undefined;
  ActiveSession: { sessionId: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  SessionHistory: undefined;
  SessionHistoryDetail: { sessionLogId: string; title?: string };
};

const BottomTab = createBottomTabNavigator();
const HomeStack = createStackNavigator<HomeStackParamList>();
const TrainingStack = createStackNavigator<TrainingStackParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      <HomeStack.Screen name="ActiveSession" component={ActiveSessionScreen} />
    </HomeStack.Navigator>
  );
}

function TrainingStackNavigator() {
  return (
    <TrainingStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle }}>
      <TrainingStack.Screen name="TrainingOverview" component={TrainingSessionScreen} />
      <TrainingStack.Screen name="ActiveSession" component={ActiveSessionScreen} />
    </TrainingStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false, cardStyle: stackCardStyle }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="SessionHistory" component={SessionHistoryScreen} />
      <ProfileStack.Screen name="SessionHistoryDetail" component={SessionHistoryDetailScreen} />
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
              iconName = 'activity';
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
        name="Profile"
        component={ProfileStackNavigator}
        options={{ tabBarLabel: 'Perfil' }}
      />
    </BottomTab.Navigator>
  );
};

export default MainNavigator;
