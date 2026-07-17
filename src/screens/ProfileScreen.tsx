import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import type { ProfileStackParamList } from '../navigation/MainNavigator';

const ProfileScreen = () => {
  const { user, profile, signOut } = useAuth();
  const navigation = useNavigation<StackNavigationProp<ProfileStackParamList, 'ProfileMain'>>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <View style={styles.profileSection}>
        <Text style={styles.name}>{profile?.full_name || user?.email}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => navigation.navigate('SessionHistory')}
      >
        <Text style={styles.historyText}>Histórico de treinos</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.dark,
    padding: 16,
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  profileSection: {
    backgroundColor: theme.colors.background.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  name: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  email: {
    color: theme.colors.text.secondary,
  },
  historyButton: {
    backgroundColor: theme.colors.background.card,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  historyText: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: theme.colors.primary.main,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProfileScreen;