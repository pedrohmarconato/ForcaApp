import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native'; // Importa Alert para mensagens
import {
  TextInput,
  Button,
  Text,
  HelperText,
  useTheme
} from 'react-native-paper';
// Certifique-se que o import do AuthContext está correto
import { useAuth } from '../contexts/AuthContext';

const SignUpScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const { colors } = useTheme();
  // Pega a função signUp REAL do contexto
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (loading) return;

    // Validação básica no frontend (mantém)
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
       setError("A senha deve ter pelo menos 6 caracteres.");
       return;
    }

    setLoading(true);
    setError(null);

    try {
        // --- CHAMADA REAL PARA O SUPABASE ---
        // Descomente esta linha - chama a função signUp do AuthContext
        const { data, error: signUpError } = await signUp(email, password);

        // Descomente esta linha - se o Supabase retornar um erro, lança-o
        if (signUpError) {
            throw signUpError;
        }

        // --- REMOVA O BLOCO DE SIMULAÇÃO ---
        // if (!email || !password) {
        //    throw new Error("Email e senha são obrigatórios.");
        // }
        // console.log("Cadastro simulado com sucesso! Verifique seu email (simulação).");

        console.log("Cadastro iniciado (Supabase):", data);

        // Verifica se o usuário precisa confirmar o email
        // A propriedade 'identity' pode não existir dependendo do estado ou se o email já foi confirmado em outra tentativa
        const needsConfirmation = data.user && !data.user.email_confirmed_at;


        if (needsConfirmation) {
            // Usa Alert nativo para feedback rápido
             Alert.alert(
                'Verifique seu Email',
                'Enviamos um link de confirmação para o seu email. Por favor, verifique sua caixa de entrada (e spam) para ativar sua conta.',
                [{ text: 'OK', onPress: () => navigation.navigate('Login') }] // Volta pro login após msg
             );
        } else if (data.session) {
             // Se o Supabase já criou uma sessão (ex: email/senha habilitado sem confirmação no painel do Supabase)
             // O onAuthStateChange cuidará da atualização do estado e navegação.
             console.log("Cadastro e login (sem confirmação necessária) realizados!");
             // Não precisa navegar manualmente, o RootNavigator fará isso.
         } else if (data.user) {
            // Se retornou usuário mas não sessão (pode acontecer se a confirmação estiver ativa)
             Alert.alert(
                'Verifique seu Email',
                'Enviamos um link de confirmação para o seu email. Por favor, verifique sua caixa de entrada (e spam) para ativar sua conta.',
                [{ text: 'OK', onPress: () => navigation.navigate('Login') }] // Volta pro login após msg
             );
         }
         else {
             // Caso inesperado, talvez o email já existisse mas não deu erro específico?
              setError("Ocorreu uma situação inesperada. Tente fazer login ou recuperar a senha.");
         }


    } catch (err) {
      console.error("Erro no cadastro:", err);
       let errorMessage = "Ocorreu um erro ao tentar cadastrar.";
      if (err instanceof Error) {
          // Mapeia erros específicos do Supabase
          if (err.message.includes("User already registered")) {
              errorMessage = "Este email já está cadastrado. Tente fazer login.";
          } else if (err.message.includes("rate limit exceeded")) {
              errorMessage = "Muitas tentativas de cadastro. Tente novamente mais tarde.";
          } else if (err.message.includes("check constraints")) { // Erro comum se a senha for muito fraca
              errorMessage = "A senha não atende aos requisitos de segurança.";
          }
           else {
               errorMessage = err.message; // Mensagem genérica
          }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // O restante do JSX (return) permanece igual
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>Criar Conta</Text>

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

      <TextInput
        label="Confirmar Senha"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={!confirmPasswordVisible}
        style={styles.input}
        mode="outlined"
        left={<TextInput.Icon icon="lock-check" />}
         right={
          <TextInput.Icon
            icon={confirmPasswordVisible ? "eye-off" : "eye"}
            onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
          />
        }
      />

      <HelperText type="error" visible={!!error} style={styles.errorText}>
        {error}
      </HelperText>

      <Button
        mode="contained"
        onPress={handleSignUp}
        loading={loading}
        disabled={loading}
        style={styles.button}
        labelStyle={styles.buttonLabel}
      >
         {loading ? 'Cadastrando...' : 'Cadastrar'}
      </Button>

      <Button
        mode="text"
        onPress={() => !loading && navigation.navigate('Login')}
        disabled={loading}
        style={styles.subButton}
      >
        Já tem conta? Faça login
      </Button>
    </ScrollView>
  );
};

// Os estilos permanecem iguais
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
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

export default SignUpScreen;