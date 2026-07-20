// src/screens/ForgotPasswordScreen.tsx
// Redefinição de senha — mesma moldura das demais telas de autenticação.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../contexts/AuthContext';
import theme from '../theme/theme';
import AuthLayout from '../components/ui/AuthLayout';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import { Notice } from '../components/ui/Feedback';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); // Mensagem de sucesso

  const { resetPassword } = useAuth();

  const handlePasswordReset = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: resetError } = await resetPassword(email);
      if (resetError) {
        throw resetError;
      }
      setMessage(
        'Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada e spam.',
      );
    } catch (err: any) {
      console.error('Erro no reset de senha:', err);
      let errorMessage = 'Ocorreu um erro ao tentar enviar o email.';
      if (err instanceof Error) {
        if (err.message.includes('For security purposes, you can only request this after')) {
          errorMessage = 'Muitas tentativas. Tente novamente mais tarde.';
        } else if (err.message.includes('Unable to validate email address')) {
          errorMessage = 'Formato de email inválido.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headline="Redefinir senha."
      support="Enviamos o link de redefinição para o seu e-mail."
      footer={
        <Pressable
          onPress={() => !loading && navigation.navigate('Login')}
          disabled={loading}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.footerLink}>Voltar para o login</Text>
        </Pressable>
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

      {error ? <Notice tone="danger" title={error} style={styles.notice} /> : null}
      {message && !error ? (
        <Notice tone="info" title="Link enviado" description={message} style={styles.notice} />
      ) : null}

      <Button label="Enviar link" icon="send" onPress={handlePasswordReset} loading={loading} />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  notice: { marginBottom: theme.spacing.lg },
  footerLink: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default ForgotPasswordScreen;
