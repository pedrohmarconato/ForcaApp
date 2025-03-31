import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable, // Para simular hover/glow em botões
    TouchableOpacity, // Para link de cadastro
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// import { BlurView } from '@react-native-community/blur'; // Descomente se for usar Blur
import {
    TextInput as PaperTextInput, // Renomear para evitar conflito se usar TextInput normal
    Button as PaperButton,
    Text,
    HelperText,
    useTheme, // Ainda pode ser útil para cores secundárias
} from 'react-native-paper';
import Checkbox from 'expo-checkbox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext'; // Confirme o caminho
import { Feather } from '@expo/vector-icons'; // Exemplo de ícone

// Cores principais do estilo antigo
const NEON_YELLOW = '#EBFF00';
const DARK_GRADIENT_START = '#0A0A0A';
const DARK_GRADIENT_END = '#1A1A1A';
const CARD_BG = 'rgba(0, 0, 0, 0.4)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.1)';
const BORDER_FOCUS_COLOR = 'rgba(255, 255, 255, 0.3)';
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';

const LoginScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [keepLoggedIn, setKeepLoggedIn] = useState(false);
    const { signIn } = useAuth();
    const paperTheme = useTheme(); // Pode usar para consistência se necessário

    // Estados para simular "glow" no botão principal
    const [isLoginPressed, setIsLoginPressed] = useState(false);

    const handleLogin = async () => {
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
        ...paperTheme, // Mantém outras propriedades do tema
        colors: {
            ...paperTheme.colors,
            primary: BORDER_FOCUS_COLOR, // Cor da borda/label em foco
            text: TEXT_COLOR,
            placeholder: PLACEHOLDER_COLOR,
            background: INPUT_BG, // Cor de fundo do input
            outline: BORDER_COLOR, // Cor da borda normal
            onSurfaceVariant: PLACEHOLDER_COLOR, // Cor do label quando não focado
        },
         roundness: 12, // Corresponde a rounded-xl
    };

    return (
        <LinearGradient
            colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]}
            style={styles.fullScreenGradient}
        >
            {/* Elementos Decorativos (Simulados) */}
            <View style={[styles.decorativeCircle, styles.circleTopLeft]} />
            <View style={[styles.decorativeCircle, styles.circleBottomRight]} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoiding}
            >
                <ScrollView contentContainerStyle={styles.scrollContainer}>
                    {/* Card com efeito Glassmorphism */}
                    <View style={styles.card}>
                        {/* Fundo do Card (Blur ou Cor Transparente) */}
                        {/* <BlurView style={styles.cardBackground} blurType="dark" blurAmount={10} /> */}
                        <View style={[styles.cardBackground, { backgroundColor: CARD_BG }]} />

                        {/* Conteúdo */}
                        <View style={styles.contentContainer}>
                            {/* Logo e Header */}
                            <View style={styles.headerContainer}>
                                <Image
                                    source={require('../assets/logo.png')} // Ajuste o caminho
                                    style={styles.logo}
                                    resizeMode="contain"
                                />
                                <Text style={styles.subLogoText}>Treinamento inteligente</Text>
                                <Text style={styles.headerText}>Entre para continuar sua jornada</Text>
                            </View>

                            {/* Formulário */}
                            <View style={styles.formContainer}>
                                <PaperTextInput
                                    label="Endereço de e-mail"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    style={styles.input}
                                    mode="outlined"
                                    theme={inputTheme}
                                    // left={<PaperTextInput.Icon icon="email" color={PLACEHOLDER_COLOR} />} // Ícones podem precisar de ajuste de cor
                                    selectionColor={NEON_YELLOW} // Cor do cursor
                                />

                                <PaperTextInput
                                    label="Senha"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!passwordVisible}
                                    style={styles.input}
                                    mode="outlined"
                                    theme={inputTheme}
                                    // left={<PaperTextInput.Icon icon="lock" color={PLACEHOLDER_COLOR} />}
                                    right={
                                        <PaperTextInput.Icon
                                            icon={passwordVisible ? "eye-off" : "eye"}
                                            onPress={() => setPasswordVisible(!passwordVisible)}
                                            color={PLACEHOLDER_COLOR}
                                        />
                                    }
                                     selectionColor={NEON_YELLOW}
                                />

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
                                    <PaperButton
                                        mode="text"
                                        onPress={() => !loading && navigation.navigate('ForgotPassword')}
                                        disabled={loading}
                                        labelStyle={styles.forgotPasswordLabel}
                                        style={styles.forgotPasswordButton}
                                        rippleColor="rgba(255, 255, 255, 0.1)" // Efeito no press
                                    >
                                        Esqueceu a senha?
                                    </PaperButton>
                                </View>


                                <HelperText type="error" visible={!!error} style={styles.errorText}>
                                    {error}
                                </HelperText>

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
                                         <ActivityIndicator color={BUTTON_TEXT_DARK} />
                                    ) : (
                                        <>
                                            <Text style={styles.loginButtonText}>Entrar</Text>
                                            <Feather name="arrow-right" size={20} color={BUTTON_TEXT_DARK} />
                                        </>
                                     )}
                                </Pressable>
                            </View>

                            {/* Link de Cadastro */}
                            <View style={styles.signUpContainer}>
                                <Text style={styles.signUpText}>Não tem uma conta?{' '}</Text>
                                <TouchableOpacity onPress={() => !loading && navigation.navigate('SignUp')} disabled={loading}>
                                     {/* Usar Pressable aqui também para efeito de cor */}
                                     <Text style={styles.signUpLink}>Cadastre-se</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Footer Text */}
                            <Text style={styles.footerText}>Fabricado no Brasil</Text>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    fullScreenGradient: {
        flex: 1,
    },
    keyboardAvoiding: {
        flex: 1,
    },
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400, // Similar a max-w-md
        borderRadius: 16, // rounded-2xl
        overflow: 'hidden', // Crucial para background/border
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        // Sombra para iOS - ajuste os valores
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
         // Elevação para Android
         elevation: 10,
    },
    cardBackground: {
        ...StyleSheet.absoluteFillObject, // Cobre o fundo do card
        // Se não usar BlurView, defina a cor aqui:
        // backgroundColor: CARD_BG,
    },
    contentContainer: {
        padding: 32, // p-8
        position: 'relative', // Para conteúdo ficar acima do background
        zIndex: 1,
        backgroundColor: CARD_BG, // Aplicar aqui se não usar BlurView
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 32, // mb-8
    },
    logo: {
        width: 192, // w-48
        height: 80, // Altura precisa ser definida
        marginBottom: 0,
    },
    subLogoText: {
        color: TEXT_COLOR,
        fontSize: 14, // text-sm
        fontStyle: 'italic',
        marginTop: -8, // -mt-2
        // Sombra no texto (pode ser menos eficaz que drop-shadow)
        textShadowColor: 'rgba(255, 255, 255, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    headerText: {
        color: TEXT_SECONDARY_COLOR, // text-white/80
        marginTop: 16, // mt-4
        textAlign: 'center',
        textShadowColor: 'rgba(255, 255, 255, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    formContainer: {
        width: '100%',
    },
    input: {
        marginBottom: 16, // space-y-4 ou 6 (ajustar)
        backgroundColor: INPUT_BG, // Cor de fundo explícita
    },
    optionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        marginRight: 8,
        width: 18, // Tamanho do checkbox
        height: 18,
        borderWidth: 1, // Estilo manual se o padrão não agradar
        borderColor: BORDER_COLOR,
    },
    checkboxLabel: {
        color: TEXT_SECONDARY_COLOR,
        fontSize: 14,
    },
    forgotPasswordButton: {
        // Remover padding extra do botão de texto se houver
    },
    forgotPasswordLabel: {
        color: TEXT_SECONDARY_COLOR,
        fontSize: 14,
        textTransform: 'none', // Remover capitalização padrão do Paper se houver
        // Efeito de cor no press pode ser adicionado com Pressable ou state
    },
    errorText: {
        color: '#FF4D4D', // Vermelho claro para erro
        textAlign: 'center',
        minHeight: 20,
        marginBottom: 10,
    },
     loginButtonBase: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12, // py-3
        borderRadius: 12, // rounded-xl
        marginTop: 10,
     },
     loginButtonIdle: {
        backgroundColor: NEON_YELLOW,
        // Sombra iOS
        shadowColor: NEON_YELLOW,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0, // Sem sombra idle
        shadowRadius: 10,
        // Elevação Android
        elevation: 5,
     },
     loginButtonPressed: {
        backgroundColor: '#D4E600', // Um pouco mais escuro no press
        // Sombra iOS para efeito glow
        shadowColor: NEON_YELLOW,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5, // Sombra visível no press
        shadowRadius: 20,
         // Elevação Android
         elevation: 15,
     },
     loginButtonText: {
        color: BUTTON_TEXT_DARK,
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8, // space-x-2
    },
    buttonDisabled: {
        backgroundColor: 'rgba(235, 255, 0, 0.5)', // Neon com opacidade
    },
    signUpContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 32, // mt-8
    },
    signUpText: {
        color: TEXT_SECONDARY_COLOR,
    },
    signUpLink: {
        color: TEXT_COLOR,
        fontWeight: 'bold',
        // Efeito Neon no press pode ser adicionado
        textShadowColor: 'rgba(255, 255, 255, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    footerText: {
        color: TEXT_TERTIARY_COLOR, // text-white/40
        fontSize: 12, // text-xs
        textAlign: 'center',
        marginTop: 32, // mt-8
    },
    // Estilos para círculos decorativos (Simulados)
     decorativeCircle: {
        position: 'absolute',
        width: 500,
        height: 500,
        borderRadius: 250,
        opacity: 0.1, // Ajuste a opacidade
        // O blur real é difícil, usamos apenas cor/opacidade
     },
     circleTopLeft: {
        top: -250,
        left: -250,
        backgroundColor: 'rgba(255, 255, 255, 0.5)', // white/20 -> mais forte aqui
     },
     circleBottomRight: {
        bottom: -250,
        right: -250,
        backgroundColor: NEON_YELLOW, // neon/10
     }
});

export default LoginScreen;