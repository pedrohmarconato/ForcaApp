// src/screens/LoginScreen.tsx
// No changes needed here as backgroundColor was already removed from styles.input

import React, { useState, useEffect } from 'react'; // Added useEffect
import {
    View,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable,
    TouchableOpacity,
    ActivityIndicator, // Importar ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// import { BlurView } from '@react-native-community/blur'; // <-- GARANTIR QUE ESTÁ REMOVIDO/COMENTADO
import {
    TextInput as PaperTextInput,
    Button as PaperButton,
    Text,
    HelperText,
    useTheme,
} from 'react-native-paper';
import Checkbox from 'expo-checkbox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext'; // Confirme o caminho
import { Feather } from '@expo/vector-icons';

// Cores principais do estilo antigo (mantidas)
const NEON_YELLOW = '#EBFF00';
const DARK_GRADIENT_START = '#0A0A0A';
const DARK_GRADIENT_END = '#1A1A1A';
const CARD_BG = 'rgba(0, 0, 0, 0.4)'; // Fundo semi-transparente simples
const BORDER_COLOR = 'rgba(255, 255, 255, 0.1)';
const BORDER_FOCUS_COLOR = 'rgba(255, 255, 255, 0.3)'; // Kept for reference, but NEON_YELLOW is used for focus
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';
const ERROR_COLOR = '#FF4D4D'; // Define error color

const LoginScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoginPressed, setIsLoginPressed] = useState(false); // For button press state

    const { signIn } = useAuth();
    const paperTheme = useTheme();

    // Load saved credentials on mount
    useEffect(() => {
    const loadCredentials = async () => {
    const savedEmail = await AsyncStorage.getItem('rememberedEmail');
    const savedPassword = await AsyncStorage.getItem('rememberedPassword');
    if (savedEmail) {
    setEmail(savedEmail);
    setRememberMe(true); // Assume if email is saved, rememberMe was checked
    if (savedPassword) {
    setPassword(savedPassword); // Only set password if it was also saved
    }
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
    // Save credentials if rememberMe is checked
    if (rememberMe) {
    await AsyncStorage.setItem('rememberedEmail', email);
    await AsyncStorage.setItem('rememberedPassword', password); // Consider security implications
    } else {
    await AsyncStorage.removeItem('rememberedEmail');
    await AsyncStorage.removeItem('rememberedPassword');
    }
    // Navigation to Home/Main screen happens inside AuthContext/Navigator
    } catch (err: any) {
    console.error("Erro no login:", err);
    let errorMessage = "Email ou senha inválidos."; // Default message
    if (err.message.includes("Invalid login credentials")) {
    errorMessage = "Email ou senha inválidos.";
    } else if (err.message.includes("Email not confirmed")) {
    errorMessage = "Email não confirmado. Verifique sua caixa de entrada.";
    } else {
    errorMessage = "Ocorreu um erro ao tentar fazer login."; // Generic fallback
    }
    setError(errorMessage);
    } finally {
    setLoading(false);
    }
    };

    // Custom theme for PaperTextInput
    const inputTheme = {
    ...paperTheme,
    colors: {
    ...paperTheme.colors,
    // Use NEON_YELLOW for focused border and label
    primary: NEON_YELLOW,
    text: TEXT_COLOR, // Color of the text being typed
    placeholder: PLACEHOLDER_COLOR, // Color of the label when floating/placeholder
    background: INPUT_BG, // Background color of the input field (handled by Paper)
    outline: BORDER_COLOR, // Border color when not focused
    onSurfaceVariant: PLACEHOLDER_COLOR, // Color of the label when not focused (for outlined mode)
    error: ERROR_COLOR, // Color for error state
    },
    roundness: 12, // Match border radius of the card/button
    };

    return (
    <LinearGradient
    colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]}
    style={styles.fullScreenGradient}
    >
    {/* Decorative Elements */}
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
    <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
    <Text style={styles.subLogoText}>Treinamento inteligente</Text>
    <Text style={styles.headerText}>Bem-vindo</Text>
    </View>

    {/* Formulário */}
    <View style={styles.formContainer}>
    <PaperTextInput
    label="Endereço de e-mail"
    value={email}
    onChangeText={setEmail}
    keyboardType="email-address"
    autoCapitalize="none"
    style={styles.input} // Apply style WITHOUT background/paddingTop
    mode="outlined"
    theme={inputTheme} // Apply custom theme
    selectionColor={NEON_YELLOW} // Cursor/selection color
    textColor={TEXT_COLOR} // Explicitly set text color
    // Optional: Add left icon for consistency if desired
    // left={<PaperTextInput.Icon icon="email" color={PLACEHOLDER_COLOR} size={20} />}
    />

    <PaperTextInput
    label="Senha"
    value={password}
    onChangeText={setPassword}
    secureTextEntry={!passwordVisible}
    style={styles.input} // Apply style WITHOUT background/paddingTop
    mode="outlined"
    theme={inputTheme} // Apply custom theme
    textColor={TEXT_COLOR} // Explicitly set text color
    // Optional: Add left icon for consistency if desired
    // left={<PaperTextInput.Icon icon="lock" color={PLACEHOLDER_COLOR} size={20} />}
    right={
    <PaperTextInput.Icon
    icon={passwordVisible ? "eye-off" : "eye"}
    onPress={() => setPasswordVisible(!passwordVisible)}
    color={PLACEHOLDER_COLOR} // Set icon color
    size={20}
    />
    }
    selectionColor={NEON_YELLOW} // Cursor/selection color
    />

    {/* Options Row */}
    <View style={styles.optionsRow}>
    <TouchableOpacity style={styles.checkboxContainer} onPress={() => setRememberMe(!rememberMe)}>
    <Checkbox
    style={styles.checkbox}
    value={rememberMe}
    onValueChange={setRememberMe}
    color={rememberMe ? NEON_YELLOW : BORDER_COLOR}
    />
    <Text style={styles.checkboxLabel}>Manter-me conectado</Text>
    </TouchableOpacity>
    <PaperButton
    onPress={() => navigation.navigate('ForgotPassword')}
    labelStyle={[styles.forgotPasswordLabel, { color: TEXT_SECONDARY_COLOR }]} // Apply color here
    style={styles.forgotPasswordButton}
    uppercase={false} // Ensure text is not uppercase
    >
    Esqueceu a senha?
    </PaperButton>
    </View>

    {/* Error Message */}
    <HelperText type="error" visible={!!error} style={styles.errorText}>
    {error}
    </HelperText>

    {/* Login Button */}
    <Pressable
    onPress={handleLogin}
    disabled={loading}
    onPressIn={() => setIsLoginPressed(true)}
    onPressOut={() => setIsLoginPressed(false)}
    style={({ pressed }) => [
    styles.loginButtonBase,
    isLoginPressed || pressed ? styles.loginButtonPressed : styles.loginButtonIdle,
    loading && styles.buttonDisabled, // Style for disabled state
    ]}
    >
    {loading ? (
    <ActivityIndicator color={BUTTON_TEXT_DARK} size="small" />
    ) : (
    <>
    <Text style={styles.loginButtonText}>Entrar</Text>
    <Feather name="log-in" size={20} color={BUTTON_TEXT_DARK} />
    </>
    )}
    </Pressable>
    </View>

    {/* Sign Up Link */}
    <View style={styles.signUpContainer}>
    <Text style={styles.signUpText}>Não tem uma conta?{' '}</Text>
    <TouchableOpacity onPress={() => !loading && navigation.navigate('SignUp')} disabled={loading}>
    <Text style={styles.signUpLink}>Cadastre-se</Text>
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

// Estilos
const styles = StyleSheet.create({
    fullScreenGradient: { flex: 1 },
    keyboardAvoiding: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER_COLOR, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    cardBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: CARD_BG },
    contentContainer: { padding: 32, position: 'relative', zIndex: 1 },
    headerContainer: { alignItems: 'center', marginBottom: 32 },
    logo: { width: 192, height: 80, marginBottom: 0 },
    subLogoText: { color: TEXT_COLOR, fontSize: 14, fontStyle: 'italic', marginTop: -8, textShadowColor: 'rgba(255, 255, 255, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    headerText: { color: TEXT_SECONDARY_COLOR, marginTop: 16, textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    formContainer: { width: '100%' },
    input: {
    marginBottom: 16,
    // REMOVED: backgroundColor: INPUT_BG, // Already removed
    // REMOVED: paddingTop: 4, // Already removed
    },
    optionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    checkboxContainer: { flexDirection: 'row', alignItems: 'center' },
    checkbox: { marginRight: 8, width: 18, height: 18, borderWidth: 1, borderColor: BORDER_COLOR },
    checkboxLabel: { color: TEXT_SECONDARY_COLOR, fontSize: 14 },
    forgotPasswordButton: { },
    forgotPasswordLabel: { fontSize: 14, textTransform: 'none' },
    errorText: { color: ERROR_COLOR, textAlign: 'center', minHeight: 20, marginBottom: 10 },
    loginButtonBase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 10 },
    loginButtonIdle: { backgroundColor: NEON_YELLOW, elevation: 5, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 10 },
    loginButtonPressed: { backgroundColor: '#D4E600', elevation: 15, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
    loginButtonText: { color: BUTTON_TEXT_DARK, fontSize: 16, fontWeight: 'bold', marginRight: 8 },
    buttonDisabled: { backgroundColor: 'rgba(235, 255, 0, 0.5)' },
    signUpContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
    signUpText: { color: TEXT_SECONDARY_COLOR },
    signUpLink: { color: TEXT_COLOR, fontWeight: 'bold', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    footerText: { color: TEXT_TERTIARY_COLOR, fontSize: 12, textAlign: 'center', marginTop: 32 },
    decorativeCircle: { position: 'absolute', width: 500, height: 500, borderRadius: 250, opacity: 0.1 },
    circleTopLeft: { top: -250, left: -250, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
    circleBottomRight: { bottom: -250, right: -250, backgroundColor: NEON_YELLOW }
});

export default LoginScreen;