import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

// Importar as novas telas
import HomeScreen from '../screens/HomeScreen';
import TrainingSessionScreen from '../screens/TrainingSessionScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkoutDetailScreen from '../screens/WorkoutDetailScreen';

// Crie um Bottom Tab Navigator
const BottomTab = createBottomTabNavigator();

// Stack Navigator para a Home (para permitir navegação de detalhes)
const HomeStack = createStackNavigator();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
    </HomeStack.Navigator>
  );
}

const MainNavigator = () => {
  return (
    <BottomTab.Navigator 
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName: string;

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
      <BottomTab.Screen name="Training" component={TrainingSessionScreen} />
      <BottomTab.Screen name="Profile" component={ProfileScreen} />
    </BottomTab.Navigator>
  );
};

export default MainNavigator;