import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext'; // Importa o hook para acessar signOut e user

// A tela Home também recebe 'navigation' como prop se precisar navegar para outros lugares
const Home = ({ navigation }) => {
  // Pega a função signOut e os dados do usuário do nosso contexto de autenticação
  const { signOut, user } = useAuth();

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Tela Principal (Home)</Text>

      {/* Mostra o email do usuário se disponível */}
      {user ? (
        <Text style={styles.welcomeText}>Bem-vindo, {user.email}!</Text>
      ) : null}

      {/* Botão para fazer Logout */}
      <Button
        mode="contained"
        onPress={signOut} // Chama a função signOut do AuthContext
        style={styles.button}
        icon="logout" // Ícone opcional
      >
        Sair
      </Button>

      {/* Exemplo: Botão para navegar para outra tela principal */}
      <Button
         mode="outlined"
         // Supondo que você tenha uma tela 'Treinos' no MainNavigator
         onPress={() => navigation.navigate('Treinos')}
         style={styles.button}
         icon="dumbbell" // Ícone opcional
       >
         Ver Meus Treinos
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
  welcomeText: {
    marginVertical: 15,
    fontSize: 16,
  },
  button: {
    marginTop: 15,
    width: '80%', // Define uma largura para os botões
  },
});

export default Home;