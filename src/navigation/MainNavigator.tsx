import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MainStackParamList, TabParamList } from './navigationTypes';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectActiveTab } from '../store/selectors';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { setActiveTab } from '../store/slices/uiSlice';

// Importação das telas principais
import HomeScreen from '../screens/main/HomeScreen';
import TrainingScreen from '../screens/main/TrainingScreen';
import CalendarScreen from '../screens/main/CalendarScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import QuestionnaireScreen from '../screens/main/QuestionnaireScreen';
import TrainingDetailScreen from '../screens/main/TrainingDetailScreen';

// Importação dos ícones
import { 
  Home as HomeIcon,
  Dumbbell as DumbbellIcon,
  Calendar as CalendarIcon,
  User as UserIcon
} from 'lucide-react-native';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<MainStackParamList>();

// Navegador de abas principal
const MainTabNavigator = () => {
  const activeTab = useAppSelector(selectActiveTab);
  const dispatch = useAppDispatch();
  
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          height: 60,
          paddingBottom: 5,
        },
        tabBarActiveTintColor: '#EBFF00',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
        headerShown: false,
      }}
      screenListeners={{
        tabPress: (e) => {
          const tabName = e.target?.split('-')[0];
          if (tabName) {
            dispatch(setActiveTab(tabName));
          }
        },
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="TrainingTab" 
        component={TrainingScreen} 
        options={{
          tabBarLabel: 'Treinos',
          tabBarIcon: ({ color, size }) => <DumbbellIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="CalendarTab" 
        component={CalendarScreen} 
        options={{
          tabBarLabel: 'Agenda',
          tabBarIcon: ({ color, size }) => <CalendarIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen 
        name="ProfileTab" 
        component={ProfileScreen} 
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

// Navegador principal com stack para telas não-tab
const MainNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#0A0A0A' }
      }}
    >
      <Stack.Screen name="Home" component={MainTabNavigator} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />
      <Stack.Screen name="TrainingDetail" component={TrainingDetailScreen} />
    </Stack.Navigator>
  );
};

export default MainNavigator;