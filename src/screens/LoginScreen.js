import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper'; // Usaremos Paper

// Adicione 'navigation' como prop
const LoginScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Login</Text>
      {/* Botões temporários para navegação */}
      <Button
        mode="text"
        onPress={() => navigation.navigate('SignUp')} // Navega para Cadastro
        style={styles.button}
      >
        Não tem conta? Cadastre-se
      </Button>
      <Button
        mode="text"
        onPress={() => navigation.navigate('ForgotPassword')} // Navega para Reset Senha
        style={styles.button}
      >
        Esqueci minha senha
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  button: {
    marginTop: 10,
  },
});

export default LoginScreen;