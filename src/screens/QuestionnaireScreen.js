import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

// Recebe navigation para ir para a próxima etapa (Chat)
const QuestionnaireScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Questionário</Text>
      <Text style={styles.text}>Perguntas sobre seus objetivos, experiência, etc.</Text>
      <Button
        mode="contained"
        onPress={() => navigation.navigate('Chat')} // Navega para Chat
        style={styles.button}
      >
        Próximo: Chat IA
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
  text: {
    marginVertical: 15,
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
  }
});

export default QuestionnaireScreen;