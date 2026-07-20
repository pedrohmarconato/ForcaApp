// src/screens/LoginScreen.tsx
// Tela 01 do fluxo — autenticação, na identidade "Força sem ruído".
//
// A lógica de credenciais é a mesma de antes e continua valendo a regra de
// segurança coberta por __tests__/LoginScreen.test.tsx: apenas o e-mail pode
// ser lembrado; a senha NUNCA é persistida, e resíduo legado é apagado.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import AuthLayout from '../components/ui/AuthLayout';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import { CheckboxRow } from '../components/ui/Controls';
import { Notice } from '../components/ui/Feedback';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuth();

  // Carrega o e-mail lembrado (a senha NUNCA é persistida)
  useEffect(() => {
    const loadCredentials = async () => {
      const savedEmail = await AsyncStorage.getItem('rememberedEmail');
      // Remove legado inseguro: versões antigas salvavam a senha em texto puro
      await AsyncStorage.removeItem('rememberedPassword');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true); // Assume if email is saved, rememberMe was checked
      }
    };
    loadCredentials();
  }, []);

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        throw signInError;
      }
      // Persiste apenas o e-mail se rememberMe estiver marcado.
      // A senha jamais é armazenada (nem criptografada) — o usuário a digita a cada login.
      if (rememberMe) {
        await AsyncStorage.setItem('rememberedEmail', email);
      } else {
        await AsyncStorage.removeItem('rememberedEmail');
      }
      await AsyncStorage.removeItem('rememberedPassword');
      // Navigation to Home/Main screen happens inside AuthContext/Navigator
    } catch (err: any) {
      console.error('Erro no login:', err);
      let errorMessage = 'Email ou senha inválidos.'; // Default message
      if (err.message.includes('Invalid login credentials')) {
        errorMessage = 'Email ou senha inválidos.';
      } else if (err.message.includes('Email not confirmed')) {
        errorMessage = 'Email não confirmado. Verifique sua caixa de entrada.';
      } else {
        errorMessage = 'Ocorreu um erro ao tentar fazer login.'; // Generic fallback
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headline="Bem-vindo de volta."
      support="Continue de onde parou."
      footer={
        <View style={styles.signUpRow}>
          <Text style={styles.footerText}>Não tem uma conta? </Text>
          <Pressable
            onPress={() => !loading && navigation.navigate('SignUp')}
            disabled={loading}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Cadastre-se</Text>
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

      <View style={styles.options}>
        <CheckboxRow
          label="Lembrar acesso"
          checked={rememberMe}
          onPress={() => setRememberMe((current) => !current)}
        />
        <Pressable
          onPress={() => navigation.navigate('ForgotPassword')}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.link}>Esqueceu a senha?</Text>
        </Pressable>
      </View>

      {error ? <Notice tone="danger" title={error} style={styles.notice} /> : null}

      <Button label="Entrar" icon="log-in" onPress={handleLogin} loading={loading} />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  options: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xl,
  },
  link: {
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  notice: { marginBottom: theme.spacing.lg },
  signUpRow: { flexDirection: 'row', alignItems: 'center' },
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

export default LoginScreen;
