// src/screens/PostQuestionnaireChat.tsx (Refatorado SEM REDUX)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// REMOVIDO: import { useSelector, useDispatch } from 'react-redux';
import { useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { Content } from "@google/generative-ai"; // MANTIDO: Tipo do SDK Gemini

// REMOVIDO: import { RootState } from '../store';
// REMOVIDO: Imports de selectUserProfile, selectUserLoading, selectUserError, clearUserError
import type { UserProfile } from '../store/slices/userSlice'; // <<< IMPORTANTE: Mantém a interface UserProfile

// --- ASSUMPTION: Importe seu contexto de autenticação e serviço de perfil ---
import { useAuth } from '../contexts/AuthContext'; // <<< Ajuste este caminho
import { callGeminiApi } from '../services/api/geminiService'; // Ajuste o caminho
// --- Precisamos de uma função para buscar o perfil ---
// Idealmente, esta função estaria em um arquivo de serviço (ex: src/services/userProfileService.ts)
// usando Axios ou Fetch para chamar sua API (ex: GET /api/users/me/profile)
async function getUserProfileAPI(userId: string): Promise<UserProfile> {
    console.log(`[API Mock] Fetching profile for user: ${userId}`);
    // Simule uma chamada de API (substitua pelo seu fetch ou axios real)
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Simular sucesso ou erro
            const shouldSucceed = true; // Math.random() > 0.1; // 90% sucesso
            if (shouldSucceed) {
                // Retorne dados de perfil MOCK realistas, incluindo o campo usado na saudação
                const mockProfile: UserProfile = {
                    id: userId,
                    nome_completo: "Usuário Mock", // Use um nome mock
                    email: "mock@example.com", // Adicione campos conforme sua interface UserProfile
                    // Adicione outros campos mock se sua lógica inicial depender deles
                    // Ex: questionnaire_completed_at se você usa isso para algo
                    questionnaire_completed_at: new Date().toISOString(), // Exemplo
                };
                console.log('[API Mock] Profile fetch successful');
                resolve(mockProfile);
            } else {
                console.error('[API Mock] Profile fetch failed');
                reject(new Error('Falha simulada ao buscar o perfil.'));
            }
        }, 1000); // Simular delay de rede
    });
}
// --- Fim Placeholder API ---

// Defina quantas interações o usuário terá no máximo
const MAX_INTERACTIONS = 3;

const PostQuestionnaireChat = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    // REMOVIDO: const dispatch = useDispatch();
    const flatListRef = useRef<FlatList>(null);
    const { user } = useAuth(); // Obter usuário (e ID) do contexto
    const userId = user?.id;

    // --- Estado Local (Substituindo Redux) ---
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isProfileLoading, setIsProfileLoading] = useState<boolean>(true); // Começa carregando
    const [profileError, setProfileError] = useState<string | null>(null); // Erro ao buscar perfil

    // --- Estado Local do Chat (Mantido) ---
    const [messages, setMessages] = useState<Content[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [currentInteraction, setCurrentInteraction] = useState(0);
    const [isChatEnded, setIsChatEnded] = useState(false);

    // --- Efeito para Buscar Perfil ---
    useEffect(() => {
        const fetchProfileData = async () => {
            if (!userId) {
                console.warn("[ChatScreen] User ID not available, cannot fetch profile.");
                setProfileError("ID do usuário não encontrado para buscar perfil.");
                setIsProfileLoading(false);
                return;
            }

            setIsProfileLoading(true);
            setProfileError(null);
            setChatError(null); // Limpa erro do chat também

            try {
                console.log(`[ChatScreen] Fetching profile for user: ${userId}`);
                const profile = await getUserProfileAPI(userId); // <<< CHAMA A API REAL/MOCK
                setUserProfile(profile);
                console.log("[ChatScreen] Profile loaded:", profile);
            } catch (error: any) {
                console.error("[ChatScreen] Error fetching profile:", error);
                setProfileError(error.message || "Falha ao carregar dados do perfil.");
            } finally {
                setIsProfileLoading(false);
            }
        };

        fetchProfileData();
    }, [userId]); // Depende do userId

    // --- Efeito Inicial para Mensagem de Boas-vindas (Adaptado) ---
    useEffect(() => {
        // Só define a mensagem inicial QUANDO o perfil estiver carregado E não houver mensagens ainda
        if (userProfile && messages.length === 0) {
            setMessages([
                { role: 'model', parts: [{ text: `Olá ${userProfile.nome_completo || 'usuário'}! Analisei seu questionário. Você tem ${MAX_INTERACTIONS} interações para tirar dúvidas rápidas ou adicionar detalhes antes de eu gerar seu plano. O que gostaria de perguntar?` }] }
            ]);
        }
        // Não precisa mais limpar erro do Redux aqui. O useEffect acima já limpa profileError.
    }, [userProfile, messages.length]); // Depende do perfil CARREGADO e do array de mensagens

    // --- Scroll Automático (Mantido) ---
    useEffect(() => {
        if (flatListRef.current && messages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
        }
    }, [messages]);

    // --- Handler para Enviar Mensagem (Adaptado) ---
    const handleSendMessage = useCallback(async () => {
        // Usa userProfile do estado local
        if (isLoadingAi || !inputText.trim() || isChatEnded || !userProfile) {
            if (!userProfile) {
                 Alert.alert("Erro", "Dados do perfil ainda não foram carregados. Aguarde um momento.");
            }
            return;
        }

        setIsLoadingAi(true);
        setChatError(null);
        const interactionNumber = currentInteraction + 1;

        const userMessage: Content = { role: 'user', parts: [{ text: inputText.trim() }] };
        const currentHistory = [...messages, userMessage];

        setMessages(currentHistory);
        setInputText('');

        try {
            console.log(`[ChatScreen] Sending message ${interactionNumber}/${MAX_INTERACTIONS} to Gemini.`);
            const response = await callGeminiApi(
                currentHistory,
                userProfile, // Passa o perfil do estado local
                MAX_INTERACTIONS,
                interactionNumber
            );

            const aiMessage: Content = { role: 'model', parts: [{ text: response.text }] };
            setMessages(prev => [...prev, aiMessage]);

            if (response.extractedData?.ajustes?.length > 0) {
                console.log("[ChatScreen] IA extraiu ajustes:", response.extractedData.ajustes);
                // Lógica TODO mantida
            }

            setCurrentInteraction(interactionNumber);

            if (interactionNumber >= MAX_INTERACTIONS) {
                setIsChatEnded(true);
                console.log("[ChatScreen] Max interactions reached. Chat ended.");
                 if (!response.text.toLowerCase().includes("gerar o plano")) {
                    const finalMessage: Content = { role: 'model', parts: [{ text: "Ok! Usei todas as informações. Vou preparar seu plano de treino agora." }] };
                    setMessages(prev => [...prev, finalMessage]);
                 }
                 setTimeout(() => {
                     // A navegação pode precisar ser ajustada dependendo da sua estrutura
                     // Se MainNavigator for o navigator raiz que contém este chat E o Home:
                     navigation.navigate('MainNavigator', { screen: 'Home' });
                     // Se este chat está num stack separado, talvez só 'Home':
                     // navigation.navigate('Home');
                 }, 2500);
            }

        } catch (error: any) {
            console.error("[ChatScreen] Error calling Gemini API:", error);
            const errorMsg = error.message || "Falha na comunicação com o assistente.";
            setChatError(errorMsg);
            const errorMessage: Content = { role: 'model', parts: [{ text: `Desculpe, ocorreu um erro: ${errorMsg}` }] };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoadingAi(false);
        }
        // Dependências atualizadas: messages, inputText, isLoadingAi, isChatEnded, userProfile (local), currentInteraction, navigation
    }, [messages, inputText, isLoadingAi, isChatEnded, userProfile, currentInteraction, navigation]);

    // --- Render Item para FlatList (Mantido) ---
    const renderMessage = ({ item }: { item: Content }) => {
        const isUser = item.role === 'user';
        // Adicione uma chave única e estável se possível, index não é ideal para listas dinâmicas
        return (
            <View style={[
                styles.messageBubble,
                isUser ? styles.userBubble : styles.aiBubble,
                isUser ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }
            ]}>
                <Text style={isUser ? styles.userText : styles.aiText}>
                    {item.parts[0].text}
                </Text>
            </View>
        );
    };

    // --- Estilos (Refatorado com useMemo) ---
    const styles = useMemo(() => StyleSheet.create({
        flex: { flex: 1 },
        container: {
            flex: 1,
            backgroundColor: theme.colors.background,
            justifyContent: 'center', // Para centralizar loading/erro inicial
            alignItems: 'center', // Para centralizar loading/erro inicial
        },
         chatContainer: { // Novo estilo para quando o chat estiver pronto
             flex: 1,
             backgroundColor: theme.colors.background,
             justifyContent: 'flex-start', // Alinha conteúdo no topo
             alignItems: 'stretch', // Estica itens horizontalmente
         },
        title: {
            fontSize: 20,
            fontWeight: 'bold',
            textAlign: 'center',
            marginVertical: 10,
            color: theme.colors.onBackground,
        },
         interactionsLeft: {
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 10,
            color: theme.colors.onSurfaceVariant,
        },
        chatList: {
            flex: 1,
             width: '100%', // Garante que a FlatList ocupe a largura
        },
        chatListContent: {
            paddingHorizontal: 10,
            paddingBottom: 10,
        },
        messageBubble: {
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 18,
            marginVertical: 4,
            maxWidth: '80%',
        },
        userBubble: {
            backgroundColor: theme.colors.primary,
        },
        aiBubble: {
            backgroundColor: theme.colors.surfaceVariant,
        },
        userText: {
            color: theme.colors.onPrimary,
            fontSize: 16,
        },
        aiText: {
            color: theme.colors.onSurfaceVariant,
            fontSize: 16,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 10,
            borderTopWidth: 1,
            borderTopColor: theme.colors.outline,
            backgroundColor: theme.colors.surface,
             width: '100%', // Garante que o input ocupe a largura
        },
        input: {
            flex: 1,
            minHeight: 40,
            maxHeight: 120,
            backgroundColor: theme.colors.surfaceVariant,
            borderRadius: 20,
            paddingHorizontal: 15,
            paddingVertical: 10,
            fontSize: 16,
            color: theme.colors.onSurfaceVariant,
            marginRight: 10,
        },
        sendButton: {
            backgroundColor: theme.colors.primary,
            borderRadius: 20,
            padding: 10,
            justifyContent: 'center',
            alignItems: 'center',
            minWidth: 60,
        },
        sendButtonDisabled: {
            backgroundColor: theme.colors.surfaceDisabled,
        },
        sendButtonText: {
            color: theme.colors.onPrimary,
            fontWeight: 'bold',
        },
         loadingText: {
            marginTop: 10,
            color: theme.colors.onSurfaceVariant,
            textAlign: 'center',
        },
        errorText: {
            color: theme.colors.error,
            textAlign: 'center',
            marginHorizontal: 20, // Adiciona margem horizontal
            fontSize: 16,
        },
         chatErrorText: {
            color: theme.colors.error,
            textAlign: 'center',
            paddingHorizontal: 10,
            fontSize: 14,
            marginBottom: 5,
        },
        linkText: {
            color: theme.colors.primary,
            textAlign: 'center',
            marginTop: 10,
            fontSize: 16,
        },
    }), [theme]); // Recalcula estilos se o tema mudar

    // --- Loading ou Erro Inicial (Usando Estado Local) ---
    if (isProfileLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Carregando perfil...</Text>
            </SafeAreaView>
        );
    }

    // Se houve erro ao buscar o perfil OU se o perfil não foi encontrado após carregar
    if (profileError || !userProfile) {
         return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.errorText}>
                    {profileError || "Perfil do usuário não encontrado."}
                </Text>
                 <TouchableOpacity onPress={() => navigation.goBack()}>
                     <Text style={styles.linkText}>Voltar</Text>
                 </TouchableOpacity>
            </SafeAreaView>
         );
     }

    // --- Renderização Principal do Chat ---
    // Só renderiza o chat se o perfil carregou com sucesso
    return (
        <SafeAreaView style={styles.chatContainer} edges={['bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <Text style={styles.title}>Chat Rápido com ForcaAI</Text>
                <Text style={styles.interactionsLeft}>
                    {isChatEnded ? "Chat finalizado." : `Interações restantes: ${MAX_INTERACTIONS - currentInteraction}`}
                </Text>

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(_item, index) => `msg-${index}`} // Chave um pouco melhor
                    style={styles.chatList}
                    contentContainerStyle={styles.chatListContent}
                />

                {chatError && <Text style={styles.chatErrorText}>{chatError}</Text>}

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={isChatEnded ? "Chat encerrado" : "Digite sua dúvida ou detalhe..."}
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        editable={!isLoadingAi && !isChatEnded}
                        multiline
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (isLoadingAi || !inputText.trim() || isChatEnded) && styles.sendButtonDisabled]}
                        onPress={handleSendMessage}
                        disabled={isLoadingAi || !inputText.trim() || isChatEnded}
                    >
                        {isLoadingAi ? (
                            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                        ) : (
                            <Text style={styles.sendButtonText}>Enviar</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default PostQuestionnaireChat;