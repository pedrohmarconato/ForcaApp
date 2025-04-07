import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Image, // Import Image if you want to add the logo
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable, // Import Pressable for the main button style
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TextInput as PaperTextInput,
    // Button as PaperButton, // Keep if needed for secondary button, but main button will be Pressable
    Text,
    HelperText,
    useTheme as usePaperTheme, // Rename to avoid conflict if needed, or just use directly
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
const BORDER_FOCUS_COLOR = 'rgba(255, 255, 255, 0.3)'; // Kept for reference
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';
const ERROR_COLOR = '#FF4D4D'; // Define error color

const SignUpScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
    const [isSignUpPressed, setIsSignUpPressed] = useState(false); // For button press state

    const { signUp } = useAuth();
    const paperTheme = usePaperTheme(); // Get paper theme for base colors

    // Input theme copied from LoginScreen
    const inputTheme = {
        ...paperTheme,
        colors: {
            ...paperTheme.colors,
            // Use NEON_YELLOW for focused border and label
            primary: NEON_YELLOW, // Use NEON_YELLOW for focus color
            text: TEXT_COLOR,    // Input text color
            placeholder: PLACEHOLDER_COLOR, // Label color when floating
            background: INPUT_BG,    // Input background (handled by Paper)
            outline: BORDER_COLOR,    // Border color when not focused
            onSurfaceVariant: PLACEHOLDER_COLOR, // Label color when not focused
            error: ERROR_COLOR, // Color for error state
        },
        roundness: 12, // Match border radius
    };

    // handleSignUp function remains the same as previously defined
    const handleSignUp = async () => {
        if (loading) return;
        if (!email || !password || !confirmPassword) {
            setError("Por favor, preencha todos os campos.");
            return;
        }
        if (password !== confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { error: signUpError } = await signUp(email, password);
            if (signUpError) {
                if (signUpError.message.includes("User already registered")) {
                    setError("Este email já está cadastrado.");
                } else if (signUpError.message.includes("Password should be at least 6 characters")) {
                    setError("A senha deve ter pelo menos 6 caracteres.");
                } else {
                    setError(signUpError.message || "Ocorreu um erro ao cadastrar.");
                }
                console.error("[SignUpScreen] Erro no cadastro:", signUpError);
            } else {
                Alert.alert(
                    "Cadastro realizado!",
                    "Um email de confirmação foi enviado. Por favor, verifique sua caixa de entrada.",
                    // Optionally navigate after confirmation
                     [ { text: "OK", onPress: () => navigation.navigate('Login') } ] // Navigate to Login after OK
                );
                // Clear fields maybe?
                // setEmail(''); setPassword(''); setConfirmPassword('');
            }
        } catch (err: any) {
            console.error("[SignUpScreen] Erro inesperado:", err);
            setError(err.message || "Ocorreu um erro inesperado.");
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
                                {/* You can add the logo here if you want */}
                                {/* <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" /> */}
                                <Text style={styles.headerText}>Crie sua conta para começar</Text>
                            </View>

                            {/* Form */}
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
                                    textColor={TEXT_COLOR} // Explicitly set text color
                                    left={<PaperTextInput.Icon icon="email" color={PLACEHOLDER_COLOR} size={20} />}
                                    selectionColor={NEON_YELLOW}
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
                                    left={<PaperTextInput.Icon icon="lock" color={PLACEHOLDER_COLOR} size={20} />}
                                    right={
                                        <PaperTextInput.Icon
                                            icon={passwordVisible ? "eye-off" : "eye"}
                                            onPress={() => setPasswordVisible(!passwordVisible)}
                                            color={PLACEHOLDER_COLOR} // Set icon color
                                            size={20}
                                        />
                                    }
                                    selectionColor={NEON_YELLOW}
                                />

                                <PaperTextInput
                                    label="Confirmar Senha"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!confirmPasswordVisible}
                                    style={styles.input} // Apply style WITHOUT background/paddingTop
                                    mode="outlined"
                                    theme={inputTheme} // Apply custom theme
                                    textColor={TEXT_COLOR} // Explicitly set text color
                                    left={<PaperTextInput.Icon icon="lock-check" color={PLACEHOLDER_COLOR} size={20} />}
                                    right={
                                        <PaperTextInput.Icon
                                            icon={confirmPasswordVisible ? "eye-off" : "eye"}
                                            onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                                            color={PLACEHOLDER_COLOR} // Set icon color
                                            size={20}
                                        />
                                    }
                                    selectionColor={NEON_YELLOW}
                                />

                                <HelperText type="error" visible={!!error} style={styles.errorText}>
                                    {error}
                                </HelperText>

                                {/* Sign Up Button (Styled like Login Button) */}
                                <Pressable
                                    onPress={handleSignUp}
                                    disabled={loading}
                                    onPressIn={() => setIsSignUpPressed(true)}
                                    onPressOut={() => setIsSignUpPressed(false)}
                                    style={({ pressed }) => [
                                        styles.actionButtonBase, // Renamed style for clarity
                                        isSignUpPressed || pressed ? styles.actionButtonPressed : styles.actionButtonIdle,
                                        loading && styles.buttonDisabled,
                                    ]}
                                >
                                    {loading ? (
                                        <ActivityIndicator color={BUTTON_TEXT_DARK} size="small" />
                                    ) : (
                                        <>
                                            <Text style={styles.actionButtonText}>Cadastrar</Text>
                                            <Feather name="arrow-right" size={20} color={BUTTON_TEXT_DARK} />
                                        </>
                                    )}
                                </Pressable>
                            </View>

                            {/* Link to Login */}
                            <View style={styles.secondaryActionContainer}>
                                <Text style={styles.secondaryActionText}>Já tem uma conta?{' '}</Text>
                                <TouchableOpacity onPress={() => !loading && navigation.navigate('Login')} disabled={loading}>
                                    <Text style={styles.secondaryActionLink}>Faça login</Text>
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
// (Make sure these styles match your LoginScreen.tsx styles exactly)
const styles = StyleSheet.create({
    fullScreenGradient: { flex: 1 },
    keyboardAvoiding: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER_COLOR, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    cardBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: CARD_BG },
    contentContainer: { padding: 32, position: 'relative', zIndex: 1 },
    headerContainer: { alignItems: 'center', marginBottom: 32 },
    // logo: { width: 192, height: 80, marginBottom: 0 }, // Style for logo if added
    // subLogoText: { color: TEXT_COLOR, fontSize: 14, fontStyle: 'italic', marginTop: -8, textShadowColor: 'rgba(255, 255, 255, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    headerText: { color: TEXT_SECONDARY_COLOR, fontSize: 18, /*fontWeight: '600',*/ textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }, // Adjusted style for SignUp title
    formContainer: { width: '100%' },
    input: {
        marginBottom: 16,
        // REMOVED: backgroundColor: INPUT_BG, // Removido para permitir que o tema controle o fundo
        // REMOVED: paddingTop: 4, // Removido para corrigir posicionamento do label
    },
    errorText: { color: ERROR_COLOR, textAlign: 'center', minHeight: 20, marginBottom: 10 },
    // Renamed button styles for clarity
    actionButtonBase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 10 }, // Slightly more padding
    actionButtonIdle: { backgroundColor: NEON_YELLOW, elevation: 5, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 10 },
    actionButtonPressed: { backgroundColor: '#D4E600', elevation: 15, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
    actionButtonText: { color: BUTTON_TEXT_DARK, fontSize: 16, fontWeight: 'bold', marginRight: 8 },
    buttonDisabled: { backgroundColor: 'rgba(235, 255, 0, 0.5)' },
    // Renamed secondary action styles
    secondaryActionContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
    secondaryActionText: { color: TEXT_SECONDARY_COLOR },
    secondaryActionLink: { color: TEXT_COLOR, fontWeight: 'bold', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    footerText: { color: TEXT_TERTIARY_COLOR, fontSize: 12, textAlign: 'center', marginTop: 32 },
    // Decorative circles (optional)
    decorativeCircle: { position: 'absolute', width: 500, height: 500, borderRadius: 250, opacity: 0.05 }, // Reduced opacity
    circleTopLeft: { top: -250, left: -250, backgroundColor: NEON_YELLOW }, // Changed color slightly
    circleBottomRight: { bottom: -250, right: -250, backgroundColor: 'rgba(255, 255, 255, 0.5)' } // Changed color slightly
});

export default SignUpScreen;