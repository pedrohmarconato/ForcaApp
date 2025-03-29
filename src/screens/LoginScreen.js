import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  TextInput,
  Button,
  Text,
  HelperText,
  // ActivityIndicator, // Não estamos usando um geral, o botão tem 'loading'
  useTheme
} from 'react-native-paper';
// Certifique-se que o import do AuthContext está correto
import { useAuth } from '../contexts/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { colors } = useTheme();
  // Pega a função signIn REAL do contexto
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
        // --- CHAMADA REAL PARA O SUPABASE ---
        // Descomente esta linha - chama a função signIn do AuthContext
        const { error: signInError } = await signIn(email, password);

        // Descomente esta linha - se o Supabase retornar um erro, lança-o
        if (signInError) {
            throw signInError;
        }

        // --- REMOVA O BLOCO DE SIMULAÇÃO ---
        // if (!email || !password) {
        //     throw new Error("Email e senha são obrigatórios.");
        // }
        // if (password.length < 6) {
        //      throw new Error("Senha inválida (simulação).");
        // }
        // console.log("Login simulado com sucesso!");

        // Se chegou aqui sem erro, o onAuthStateChange no AuthContext
        // vai lidar com a atualização do estado e o RootNavigator
        // cuidará da navegação para MainNavigator.
        console.log("Chamada de login enviada para Supabase.");

    } catch (err) {
      console.error("Erro no login:", err);
      let errorMessage = "Ocorreu um erro ao tentar fazer login.";
      // Verifica se é uma instância de Error para acessar a 'message'
      if (err instanceof Error) {
          // Mapeia erros específicos retornados pelo Supabase Auth
          if (err.message.includes("Invalid login credentials")) {
               errorMessage = "Email ou senha inválidos.";
          } else if (err.message.includes("Email not confirmed")) {
              // Adiciona tratamento para email não confirmado
              errorMessage = "Por favor, confirme seu email antes de fazer login.";
          }
          // Você pode adicionar mais 'else if' para outros erros específicos
          else {
              // Usa a mensagem genérica do erro se não for um dos mapeados
              errorMessage = err.message;
          }
      }
      // Define o erro para ser exibido no HelperText
      setError(errorMessage);
    } finally {
      // Garante que o loading sempre termina
      setLoading(false);
    }
  };

  // O restante do JSX (return) permanece igual ao que você postou
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Login</Text>

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

      <TextInput
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!passwordVisible}
        style={styles.input}
        mode="outlined"
        left={<TextInput.Icon icon="lock" />}
        right={
          <TextInput.Icon
            icon={passwordVisible ? "eye-off" : "eye"}
            onPress={() => setPasswordVisible(!passwordVisible)}
          />
        }
      />

      <HelperText type="error" visible={!!error} style={styles.errorText}>
        {error}
      </HelperText>

      <Button
        mode="contained"
        onPress={handleLogin}
        loading={loading}
        disabled={loading}
        style={styles.button}
        labelStyle={styles.buttonLabel}
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>

      <Button
        mode="text"
        onPress={() => !loading && navigation.navigate('SignUp')}
        disabled={loading}
        style={styles.subButton}
      >
        Não tem conta? Cadastre-se
      </Button>

      <Button
        mode="text"
        onPress={() => !loading && navigation.navigate('ForgotPassword')}
        disabled={loading}
        style={styles.subButton}
      >
        Esqueci minha senha
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
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  errorText: {
    marginBottom: 10,
    alignSelf: 'center',
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

export default LoginScreen;