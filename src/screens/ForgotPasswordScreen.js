import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

// Adicione 'navigation' como prop
const ForgotPasswordScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Esqueci a Senha</Text>
       <Button
        mode="text"
        onPress={() => navigation.navigate('Login')} // Volta para Login
        style={styles.button}
      >
        Voltar para Login
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

export default ForgotPasswordScreen;