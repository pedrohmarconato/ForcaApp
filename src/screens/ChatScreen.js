import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext'; // Para chamar refreshProfile depois

// Recebe navigation para potencialmente voltar ou indicar conclusão
const ChatScreen = ({ navigation }) => {
   const { refreshProfile } = useAuth(); // Para atualizar o estado de onboarding

   const handleOnboardingComplete = async () => {
     // --- AQUI VIRÁ A LÓGICA ---
     // 1. Coletar dados do Questionário (passados via navegação ou estado) e Chat
     // 2. Chamar os Wrappers 1, 2, 3 via API
     // 3. Se tudo der certo, chamar a função no Supabase para setar onboarding_completed=true
     //    await supabase.from('dim_usuario').update({ onboarding_completed: true }).eq('usuario_id', user.id); // Exemplo
     // 4. Atualizar o estado local chamando refreshProfile()
     console.log("Simulando conclusão do Onboarding...");
     // Simulação de atualização (REMOVER DEPOIS E USAR A LÓGICA REAL ACIMA)
     // Em um cenário real, a atualização do BD e o refreshProfile fariam o RootNavigator mudar para MainNavigator
     alert("Onboarding concluído (Simulação)! O app deveria ir para a Home agora.");
     // refreshProfile(); // Chamaria isso após sucesso real
   };

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Chat com IA</Text>
      <Text style={styles.text}>Converse sobre exercícios, preferências...</Text>
       <Button
        mode="contained"
        onPress={handleOnboardingComplete} // Chama a função de conclusão
        style={styles.button}
      >
        Finalizar Onboarding (Simulação)
      </Button>
      {/* Botão para voltar ao questionário, se necessário */}
      <Button
        mode="text"
        onPress={() => navigation.goBack()}
        style={styles.button}
      >
        Voltar ao Questionário
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

export default ChatScreen;