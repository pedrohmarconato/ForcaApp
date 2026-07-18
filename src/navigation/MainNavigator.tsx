import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

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
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      <HomeStack.Screen name="ActiveSession" component={ActiveSessionScreen} />
    </HomeStack.Navigator>
  );
}

function TrainingStackNavigator() {
  return (
    <TrainingStack.Navigator screenOptions={{ headerShown: false }}>
      <TrainingStack.Screen name="TrainingOverview" component={TrainingSessionScreen} />
      <TrainingStack.Screen name="ActiveSession" component={ActiveSessionScreen} />
    </TrainingStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
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
        tabBarActiveTintColor: '#EBFF00', // Sua cor primária
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: '#0A0A0A', // Cor de fundo escura
          borderTopWidth: 0,
        },
      })}
    >
      <BottomTab.Screen name="Home" component={HomeStackNavigator} />
      <BottomTab.Screen name="Training" component={TrainingStackNavigator} />
      <BottomTab.Screen name="Profile" component={ProfileStackNavigator} />
    </BottomTab.Navigator>
  );
};

export default MainNavigator;
