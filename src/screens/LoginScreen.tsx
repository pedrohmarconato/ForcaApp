// src/screens/LoginScreen.tsx
// (Certifique-se de que esta é a versão que você está usando)

import React, { useState } from 'react';
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
const BORDER_FOCUS_COLOR = 'rgba(255, 255, 255, 0.3)';
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';

const LoginScreen = ({ navigation }) => {
    // ... (Estados: email, password, loading, error, etc. - MANTENHA TODOS IGUAIS)
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [keepLoggedIn, setKeepLoggedIn] = useState(false);
    const { signIn } = useAuth();
    const paperTheme = useTheme();
    const [isLoginPressed, setIsLoginPressed] = useState(false);

    const handleLogin = async () => {
        // ... (Lógica handleLogin - MANTENHA IGUAL)
         if (loading) return;
         setLoading(true);
         setError(null);
         try {
             const { error: signInError } = await signIn(email, password);
             if (signInError) throw signInError;
             if (keepLoggedIn) {
                 await AsyncStorage.setItem('@userShouldStayLoggedIn', 'true');
             } else {
                 await AsyncStorage.removeItem('@userShouldStayLoggedIn');
             }
         } catch (err: any) {
             console.error("[LoginScreen] Erro no login:", err);
             let errorMessage = "Ocorreu um erro.";
             if (err instanceof Error) {
                 if (err.message.includes("Invalid login credentials")) errorMessage = "Email ou senha inválidos.";
                 else if (err.message.includes("Email not confirmed")) errorMessage = "Confirme seu email.";
                 else errorMessage = err.message;
             }
             setError(errorMessage);
         } finally {
             setLoading(false);
         }
     };

    const inputTheme = {
        // ... (Tema do Input - MANTENHA IGUAL)
        ...paperTheme,
        colors: {
            ...paperTheme.colors,
            primary: BORDER_FOCUS_COLOR,
            text: TEXT_COLOR,
            placeholder: PLACEHOLDER_COLOR,
            background: INPUT_BG,
            outline: BORDER_COLOR,
            onSurfaceVariant: PLACEHOLDER_COLOR,
        },
         roundness: 12,
    };

    return (
        <LinearGradient
            colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]}
            style={styles.fullScreenGradient}
        >
            {/* Elementos Decorativos (Simulados - MANTIDOS) */}
            <View style={[styles.decorativeCircle, styles.circleTopLeft]} />
            <View style={[styles.decorativeCircle, styles.circleBottomRight]} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoiding}
            >
                <ScrollView contentContainerStyle={styles.scrollContainer}>
                    <View style={styles.card}>
                        {/* Fundo do Card SEM BlurView */}
                        <View style={styles.cardBackground} />

                        <View style={styles.contentContainer}>
                            {/* Logo e Header (MANTIDOS) */}
                            <View style={styles.headerContainer}>
                                <Image
                                    source={require('../../assets/logo.png')} // Ajuste o caminho se necessário
                                    style={styles.logo}
                                    resizeMode="contain"
                                />
                                <Text style={styles.subLogoText}>Treinamento inteligente</Text>
                                <Text style={styles.headerText}>Entre para continuar sua jornada</Text>
                            </View>

                            {/* Formulário (MANTIDO) */}
                            <View style={styles.formContainer}>
                                <PaperTextInput
                                    label="Endereço de e-mail"
                                    value={email}
                                    onChangeText={setEmail}
                                    // ... (outras props mantidas)
                                    style={styles.input}
                                    mode="outlined"
                                    theme={inputTheme}
                                    selectionColor={NEON_YELLOW}
                                />

                                <PaperTextInput
                                    label="Senha"
                                    value={password}
                                    onChangeText={setPassword}
                                    // ... (outras props mantidas)
                                    style={styles.input}
                                    mode="outlined"
                                    theme={inputTheme}
                                    right={
                                        <PaperTextInput.Icon
                                            icon={passwordVisible ? "eye-off" : "eye"}
                                            onPress={() => setPasswordVisible(!passwordVisible)}
                                            color={PLACEHOLDER_COLOR} // Defina a cor do ícone
                                            size={20} // Ajuste o tamanho se necessário
                                        />
                                    }
                                     selectionColor={NEON_YELLOW}
                                />

                                {/* Opções (Checkbox e Senha) (MANTIDAS) */}
                                <View style={styles.optionsRow}>
                                    <View style={styles.checkboxContainer}>
                                        <Checkbox
                                            style={styles.checkbox}
                                            value={keepLoggedIn}
                                            onValueChange={setKeepLoggedIn}
                                            color={keepLoggedIn ? NEON_YELLOW : BORDER_COLOR}
                                        />
                                        <Text
                                            style={styles.checkboxLabel}
                                            onPress={() => setKeepLoggedIn(!keepLoggedIn)}
                                        >
                                            Manter conectado
                                        </Text>
                                    </View>
                                     {/* Botão 'Esqueceu a Senha?' usando PaperButton */}
                                     <PaperButton
                                         mode="text"
                                         onPress={() => !loading && navigation.navigate('ForgotPassword')}
                                         disabled={loading}
                                         labelStyle={styles.forgotPasswordLabel}
                                         style={styles.forgotPasswordButton}
                                         textColor={TEXT_SECONDARY_COLOR} // Cor explícita
                                         compact // Tenta reduzir padding
                                     >
                                        Esqueceu a senha?
                                    </PaperButton>
                                </View>

                                <HelperText type="error" visible={!!error} style={styles.errorText}>
                                    {error}
                                </HelperText>

                                {/* Botão Entrar (MANTIDO com Pressable) */}
                                <Pressable
                                    onPress={handleLogin}
                                    disabled={loading}
                                    onPressIn={() => setIsLoginPressed(true)}
                                    onPressOut={() => setIsLoginPressed(false)}
                                    style={({ pressed }) => [
                                        styles.loginButtonBase,
                                        isLoginPressed || pressed ? styles.loginButtonPressed : styles.loginButtonIdle,
                                        loading && styles.buttonDisabled,
                                     ]}
                                >
                                    {loading ? (
                                         <ActivityIndicator color={BUTTON_TEXT_DARK} size="small" />
                                    ) : (
                                        <>
                                            <Text style={styles.loginButtonText}>Entrar</Text>
                                            <Feather name="arrow-right" size={20} color={BUTTON_TEXT_DARK} />
                                        </>
                                     )}
                                </Pressable>
                            </View>

                            {/* Link de Cadastro (MANTIDO) */}
                            <View style={styles.signUpContainer}>
                                <Text style={styles.signUpText}>Não tem uma conta?{' '}</Text>
                                <TouchableOpacity onPress={() => !loading && navigation.navigate('SignUp')} disabled={loading}>
                                     <Text style={styles.signUpLink}>Cadastre-se</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Footer Text (MANTIDO) */}
                            <Text style={styles.footerText}>Fabricado no Brasil</Text>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

// Estilos (MANTENHA os estilos que definimos, certificando-se que cardBackground não usa blur)
const styles = StyleSheet.create({
    // ... (COLE AQUI OS ESTILOS COMPLETOS DA VERSÃO ANTERIOR)
    fullScreenGradient: { flex: 1 },
    keyboardAvoiding: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER_COLOR, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    // Apenas o fundo semi-transparente, sem blur
    cardBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: CARD_BG },
    contentContainer: { padding: 32, position: 'relative', zIndex: 1 },
    headerContainer: { alignItems: 'center', marginBottom: 32 },
    logo: { width: 192, height: 80, marginBottom: 0 }, // Ajuste height conforme necessário
    subLogoText: { color: TEXT_COLOR, fontSize: 14, fontStyle: 'italic', marginTop: -8, textShadowColor: 'rgba(255, 255, 255, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    headerText: { color: TEXT_SECONDARY_COLOR, marginTop: 16, textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    formContainer: { width: '100%' },
    input: { marginBottom: 16, backgroundColor: INPUT_BG }, // Certifique-se que o fundo está aplicado aqui
    optionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    checkboxContainer: { flexDirection: 'row', alignItems: 'center' },
    checkbox: { marginRight: 8, width: 18, height: 18, borderWidth: 1, borderColor: BORDER_COLOR },
    checkboxLabel: { color: TEXT_SECONDARY_COLOR, fontSize: 14 },
    forgotPasswordButton: { }, // Estilo mínimo, a cor vem de textColor prop
    forgotPasswordLabel: { fontSize: 14, textTransform: 'none' },
    errorText: { color: '#FF4D4D', textAlign: 'center', minHeight: 20, marginBottom: 10 },
    loginButtonBase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginTop: 10 },
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