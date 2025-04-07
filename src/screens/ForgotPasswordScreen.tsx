import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable, // Import Pressable for the main button
    TouchableOpacity, // For the secondary link
    ActivityIndicator, // For loading state
    Image, // Optional: if you want the logo
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TextInput as PaperTextInput,
    // Button as PaperButton, // Keep if needed for secondary button, but main button will be Pressable
    Text,
    HelperText,
    useTheme as usePaperTheme, // Rename to avoid conflict if needed
} from 'react-native-paper';
import { Feather } from '@expo/vector-icons'; // For button icon

// Import AuthContext
import { useAuth } from '../contexts/AuthContext';

// --- Copy Colors and Styles from LoginScreen ---

// Color constants from LoginScreen
const NEON_YELLOW = '#EBFF00';
const DARK_GRADIENT_START = '#0A0A0A';
const DARK_GRADIENT_END = '#1A1A1A';
const CARD_BG = 'rgba(0, 0, 0, 0.4)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.1)';
const BORDER_FOCUS_COLOR = 'rgba(255, 255, 255, 0.3)';
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';
const ERROR_COLOR = '#FF4D4D'; // Define error color
const INFO_COLOR = '#4CAF50'; // Define an info color for success message

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); // Mensagem de sucesso
  const [isSendPressed, setIsSendPressed] = useState(false); // For button press state

  const { resetPassword } = useAuth();
  const paperTheme = usePaperTheme();

  // Input theme copied from LoginScreen
  const inputTheme = {
    ...paperTheme,
    colors: {
      ...paperTheme.colors,
      primary: BORDER_FOCUS_COLOR,
      text: TEXT_COLOR,
      placeholder: PLACEHOLDER_COLOR,
      background: INPUT_BG,
      outline: BORDER_COLOR,
      onSurfaceVariant: PLACEHOLDER_COLOR,
      error: ERROR_COLOR,
    },
    roundness: 12,
  };

  // handlePasswordReset function remains the same as previously defined
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
      setMessage('Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada e spam.');
      console.log("Email de reset enviado para Supabase.");
      // setEmail(''); // Optional: Clear email field
    } catch (err: any) {
      console.error("Erro no reset de senha:", err);
      let errorMessage = "Ocorreu um erro ao tentar enviar o email.";
      if (err instanceof Error) {
        if (err.message.includes("For security purposes, you can only request this after")) {
          errorMessage = "Muitas tentativas. Tente novamente mais tarde.";
        } else if (err.message.includes("Unable to validate email address")) {
            errorMessage = "Formato de email inválido.";
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
    <LinearGradient
      colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]}
      style={styles.fullScreenGradient}
    >
      {/* Optional Decorative Elements */}
      <View style={[styles.decorativeCircle, styles.circleTopLeft]} />
      <View style={[styles.decorativeCircle, styles.circleBottomRight]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.card}>
            {/* Card Background */}
            <View style={styles.cardBackground} />

            <View style={styles.contentContainer}>
              {/* Header */}
              <View style={styles.headerContainer}>
                {/* Optional Logo */}
                {/* <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" /> */}
                <Text style={styles.headerTitle}>Redefinir Senha</Text>
                <Text style={styles.headerSubtitle}>
                  Digite seu email para receber o link de redefinição.
                </Text>
              </View>

              {/* Form */}
              <View style={styles.formContainer}>
                <PaperTextInput
                  label="Endereço de e-mail"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                  mode="outlined"
                  theme={inputTheme} // Apply custom theme
                  left={<PaperTextInput.Icon icon="email" color={PLACEHOLDER_COLOR} size={20} />}
                  selectionColor={NEON_YELLOW}
                />

                {/* Feedback Messages */}
                <HelperText type="error" visible={!!error} style={styles.errorText}>
                  {error}
                </HelperText>
                <HelperText type="info" visible={!!message && !error} style={styles.successText}>
                  {message}
                </HelperText>

                {/* Send Link Button (Styled like Login Button) */}
                <Pressable
                  onPress={handlePasswordReset}
                  disabled={loading}
                  onPressIn={() => setIsSendPressed(true)}
                  onPressOut={() => setIsSendPressed(false)}
                  style={({ pressed }) => [
                    styles.actionButtonBase,
                    isSendPressed || pressed ? styles.actionButtonPressed : styles.actionButtonIdle,
                    loading && styles.buttonDisabled,
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color={BUTTON_TEXT_DARK} size="small" />
                  ) : (
                    <>
                      <Text style={styles.actionButtonText}>Enviar Link</Text>
                      <Feather name="send" size={20} color={BUTTON_TEXT_DARK} />
                    </>
                  )}
                </Pressable>
              </View>

              {/* Link to Login */}
              <View style={styles.secondaryActionContainer}>
                <TouchableOpacity onPress={() => !loading && navigation.navigate('Login')} disabled={loading}>
                  <Text style={styles.secondaryActionLink}>Voltar para Login</Text>
                </TouchableOpacity>
              </View>

              {/* Footer Text */}
              <Text style={styles.footerText}>Desenvolvido no Brasil</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

// --- Copy Styles from LoginScreen ---
// (Make sure these styles match your LoginScreen.tsx styles exactly,
//  with minor adjustments for ForgotPassword specific text if needed)
const styles = StyleSheet.create({
    fullScreenGradient: { flex: 1 },
    keyboardAvoiding: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER_COLOR, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    cardBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: CARD_BG },
    contentContainer: { padding: 32, position: 'relative', zIndex: 1 },
    headerContainer: { alignItems: 'center', marginBottom: 32 },
    // logo: { width: 192, height: 80, marginBottom: 0 }, // Style for logo if added
    headerTitle: { color: TEXT_COLOR, fontSize: 24, fontWeight: 'bold', marginBottom: 8, textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }, // Main title style
    headerSubtitle: { color: TEXT_SECONDARY_COLOR, fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }, // Subtitle style
    formContainer: { width: '100%' },
    input: { marginBottom: 16, backgroundColor: INPUT_BG },
    errorText: { color: ERROR_COLOR, textAlign: 'center', minHeight: 20, marginBottom: 10 },
    successText: { color: INFO_COLOR, textAlign: 'center', minHeight: 20, marginBottom: 10 }, // Style for success message
    actionButtonBase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 10 },
    actionButtonIdle: { backgroundColor: NEON_YELLOW, elevation: 5, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 10 },
    actionButtonPressed: { backgroundColor: '#D4E600', elevation: 15, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
    actionButtonText: { color: BUTTON_TEXT_DARK, fontSize: 16, fontWeight: 'bold', marginRight: 8 },
    buttonDisabled: { backgroundColor: 'rgba(235, 255, 0, 0.5)' },
    secondaryActionContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
    // secondaryActionText: { color: TEXT_SECONDARY_COLOR }, // Not needed if only link is present
    secondaryActionLink: { color: TEXT_COLOR, fontWeight: 'bold', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    footerText: { color: TEXT_TERTIARY_COLOR, fontSize: 12, textAlign: 'center', marginTop: 32 },
    decorativeCircle: { position: 'absolute', width: 500, height: 500, borderRadius: 250, opacity: 0.05 }, // Reduced opacity like SignUp
    circleTopLeft: { top: -250, left: -250, backgroundColor: NEON_YELLOW }, // Match SignUp
    circleBottomRight: { bottom: -250, right: -250, backgroundColor: 'rgba(255, 255, 255, 0.5)' } // Match SignUp
});

export default ForgotPasswordScreen;