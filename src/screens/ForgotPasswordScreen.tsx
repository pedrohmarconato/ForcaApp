import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  TextInput,
  Button,
  Text,
  HelperText,
  useTheme
} from 'react-native-paper';
// Certifique-se que o import do AuthContext está correto
import { useAuth } from '../contexts/AuthContext';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null); // Mensagem de sucesso
  const { colors } = useTheme();
  // Pega a função resetPassword REAL do contexto
  const { resetPassword } = useAuth();

  const handlePasswordReset = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null); // Limpa mensagens anteriores

    try {
         // --- CHAMADA REAL PARA O SUPABASE ---
         // Descomente esta linha - chama a função resetPassword do AuthContext
         const { error: resetError } = await resetPassword(email);

         // Descomente esta linha - se o Supabase retornar um erro, lança-o
         if (resetError) {
             throw resetError;
         }

        // --- REMOVA O BLOCO DE SIMULAÇÃO ---
        // if (!email) {
        //    throw new Error("Email é obrigatório.");
        // }
        // console.log("Email de reset enviado com sucesso (simulação)!");

         // Define a mensagem de sucesso para o usuário
         setMessage('Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada e spam.');
         console.log("Email de reset enviado para Supabase.");
         // Limpa o campo de email após sucesso (opcional)
         // setEmail('');

    } catch (err) {
      console.error("Erro no reset de senha:", err);
      let errorMessage = "Ocorreu um erro ao tentar enviar o email.";
       if (err instanceof Error) {
           // Mapeia erros específicos, se houver
           if (err.message.includes("For security purposes, you can only request this after")) {
                errorMessage = "Muitas tentativas. Tente novamente mais tarde.";
           }
           // Adicione outros mapeamentos se necessário
           else {
                errorMessage = err.message; // Mensagem genérica do erro
           }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // O restante do JSX (return) permanece igual
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Redefinir Senha</Text>
      <Text style={styles.subtitle}>
        Digite seu email e enviaremos um link para você voltar a acessar sua conta.
      </Text>

      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
        mode="outlined"
        left={<TextInput.Icon icon="email" />}
      />

      {/* Mostra erro OU mensagem de sucesso (não ambos ao mesmo tempo) */}
      {/* Garantimos que apenas um seja mostrado limpando ambos no início de handlePasswordReset */}
      <HelperText type="error" visible={!!error} style={styles.feedbackText}>
        {error}
      </HelperText>
      <HelperText type="info" visible={!!message && !error} style={styles.feedbackText}>
        {message}
      </HelperText>


      <Button
        mode="contained"
        onPress={handlePasswordReset}
        loading={loading}
        disabled={loading}
        style={styles.button}
        labelStyle={styles.buttonLabel}
      >
        {loading ? 'Enviando...' : 'Enviar Link'}
      </Button>

      <Button
        mode="text"
        onPress={() => !loading && navigation.navigate('Login')}
        disabled={loading}
        style={styles.subButton}
      >
        Voltar para Login
      </Button>
    </View>
  );
};

// Os estilos permanecem iguais
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
   title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
     textAlign: 'center',
     marginBottom: 24,
     fontSize: 15,
     color: '#666',
  },
  input: {
    marginBottom: 12,
  },
  feedbackText: {
     marginBottom: 10,
     textAlign: 'center',
  },
  button: {
    marginTop: 10,
    paddingVertical: 8,
  },
  buttonLabel: {
     fontSize: 16,
  },
  subButton: {
    marginTop: 15,
  }
});

export default ForgotPasswordScreen;