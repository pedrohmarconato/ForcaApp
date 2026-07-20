// src/screens/SignUpScreen.tsx
// Cadastro — mesma moldura e mesma geometria do Login (princípio 4).

import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import AuthLayout from '../components/ui/AuthLayout';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import { Notice } from '../components/ui/Feedback';

const SignUpScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (loading) return;
    if (!email || !password || !confirmPassword) {
      setError('Por favor, preencha todos os campos.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: signUpError } = await signUp(email, password);
      if (signUpError) {
        if (signUpError.message.includes('User already registered')) {
          setError('Este email já está cadastrado.');
        } else if (signUpError.message.includes('Password should be at least 6 characters')) {
          setError('A senha deve ter pelo menos 6 caracteres.');
        } else {
          setError(signUpError.message || 'Ocorreu um erro ao cadastrar.');
        }
        console.error('[SignUpScreen] Erro no cadastro:', signUpError);
      } else {
        Alert.alert(
          'Cadastro realizado!',
          'Um email de confirmação foi enviado. Por favor, verifique sua caixa de entrada.',
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
        );
      }
    } catch (err: any) {
      console.error('[SignUpScreen] Erro inesperado:', err);
      setError(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headline="Vamos começar."
      support="Sua conta guarda o plano e o histórico."
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Já tem uma conta? </Text>
          <Pressable
            onPress={() => !loading && navigation.navigate('Login')}
            disabled={loading}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Faça login</Text>
          </Pressable>
        </View>
      }
    >
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        placeholder="seu@email.com"
      />

      <TextField label="Senha" value={password} onChangeText={setPassword} secureToggle />

      <TextField
        label="Confirmar senha"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureToggle
      />

      {error ? <Notice tone="danger" title={error} style={styles.notice} /> : null}

      <Button label="Cadastrar" icon="arrow-right" onPress={handleSignUp} loading={loading} />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  notice: { marginBottom: theme.spacing.lg },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
  footerText: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
  footerLink: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default SignUpScreen;
