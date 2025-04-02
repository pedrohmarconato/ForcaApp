// src/screens/PostQuestionnaireChat.tsx
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
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import { Content } from "@google/generative-ai";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

// Import do serviço Gemini (real)
import { callGeminiApi, testGeminiApiConnection } from '../services/api/geminiService';

// Import do contexto de autenticação
import { useAuth } from '../contexts/AuthContext';

// Constantes
const MAX_INTERACTIONS = 3;
const STORAGE_KEY_CHAT = '@chat_messages';
const STORAGE_KEY_QUESTIONNAIRE = '@questionnaire_data'; // Chave para buscar dados do questionário se não vierem via route params
const STORAGE_KEY_ADJUSTMENTS = '@chat_adjustments';
const STORAGE_KEY_CHAT_COMPLETED = '@chat_completed';

// Interface para parâmetros de rota
type ChatScreenRouteParams = {
    formData?: any; // Recebe os dados do questionário da tela anterior
};

// Definindo tipo para a navegação (Opcional mas recomendado)
// import { StackNavigationProp } from '@react-navigation/stack';
// import { OnboardingStackParamList } from '../navigation/OnboardingNavigator'; // Ajuste o caminho
// type PostQuestionnaireChatNavigationProp = StackNavigationProp<OnboardingStackParamList, 'PostQuestionnaireChat'>;

const PostQuestionnaireChat = () => {
    // Hooks
    const route = useRoute<RouteProp<{ params: ChatScreenRouteParams }, 'params'>>(); // Tipo mais específico
    const navigation = useNavigation(); // Use o tipo específico se definido: useNavigation<PostQuestionnaireChatNavigationProp>();
    const theme = useTheme();
    const flatListRef = useRef<FlatList>(null);
    const { user } = useAuth();
    const userId = user?.id;

    // Estados
    const [messages, setMessages] = useState<Content[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [isApiAvailable, setIsApiAvailable] = useState<boolean | null>(null);
    const [isCheckingApi, setIsCheckingApi] = useState(true); // Começa verificando
    const [chatError, setChatError] = useState<string | null>(null);
    const [currentInteraction, setCurrentInteraction] = useState(0);
    const [isChatEnded, setIsChatEnded] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null); // Armazena dados do questionário
    const [extractedAdjustments, setExtractedAdjustments] = useState<string[]>([]);
    const [isRestoringChat, setIsRestoringChat] = useState(true); // Estado para carregamento inicial

    // Timeout de segurança para resetar estado de loading da IA
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 1. Carregar dados do questionário (da rota ou storage) e Restaurar chat
    useEffect(() => {
        const loadInitialData = async () => {
            if (!userId) {
                 console.warn('[ChatScreen] User ID não encontrado, não é possível carregar dados.');
                 setIsRestoringChat(false);
                 // Poderia mostrar um erro ou redirecionar
                 return;
            }

            let loadedProfile = null;
            try {
                // Tentar obter dos parâmetros da rota primeiro (ideal)
                if (route.params?.formData) {
                    console.log('[ChatScreen] Usando dados do questionário da rota.');
                    loadedProfile = route.params.formData;
                } else {
                    // Se não houver na rota, tentar do AsyncStorage (fallback)
                    const savedData = await AsyncStorage.getItem(STORAGE_KEY_QUESTIONNAIRE);
                    if (savedData) {
                        loadedProfile = JSON.parse(savedData);
                        console.log('[ChatScreen] Carregados dados do questionário do storage (fallback).');
                    } else {
                        console.warn('[ChatScreen] Nenhum dado de questionário encontrado (nem na rota, nem no storage).');
                        Alert.alert(
                            'Erro',
                            'Não foi possível carregar seus dados do questionário. Por favor, preencha novamente.',
                            [{ text: 'OK', onPress: () => navigation.goBack() }]
                        );
                        setIsRestoringChat(false);
                        return; // Interrompe se não houver dados
                    }
                }
                setUserProfile(loadedProfile); // Define o perfil

                 // Restaurar chat do storage APÓS ter certeza do userId
                const savedChat = await AsyncStorage.getItem(`${STORAGE_KEY_CHAT}_${userId}`);
                 if (savedChat) {
                     const chatData = JSON.parse(savedChat);
                     console.log('[ChatScreen] Restaurando chat do storage:', chatData.messages?.length || 0, 'mensagens');
                     setMessages(chatData.messages || []);
                     setCurrentInteraction(chatData.currentInteraction || 0);
                     setIsChatEnded(chatData.isChatEnded || false);
                     setExtractedAdjustments(chatData.extractedAdjustments || []);
                 }

            } catch (error) {
                console.error('[ChatScreen] Erro ao carregar dados iniciais (perfil/chat):', error);
                Alert.alert('Erro', 'Falha ao carregar dados. Tente novamente.');
                // Considerar navegação de volta ou estado de erro mais robusto
            } finally {
                setIsRestoringChat(false); // Marca o fim do carregamento inicial
            }
        };

        loadInitialData();
    }, [route.params, userId, navigation]); // Depende de userId e route.params

    // 2. Verificar disponibilidade da API Gemini
    useEffect(() => {
        // Só executa se ainda não foi verificado (isApiAvailable === null)
        if (isApiAvailable !== null) return;

        const checkApiConnection = async () => {
            setIsCheckingApi(true); // Garante que está checando
            try {
                console.log('[ChatScreen] Verificando conexão com API Gemini...');
                const isAvailable = await testGeminiApiConnection();
                setIsApiAvailable(isAvailable);
                console.log('[ChatScreen] API Gemini disponível:', isAvailable);

                if (!isAvailable) {
                    setChatError('Serviço de IA temporariamente indisponível. Algumas funcionalidades podem não responder.');
                }
            } catch (error) {
                console.error('[ChatScreen] Erro ao verificar API Gemini:', error);
                setIsApiAvailable(false);
                setChatError('Não foi possível conectar ao serviço de IA.');
            } finally {
                setIsCheckingApi(false); // Marca o fim da checagem
            }
        };

        checkApiConnection();
    }, [isApiAvailable]); // Executa quando isApiAvailable for null

    // 3. Mensagem inicial da IA (só após carregamento e se não houver msgs)
    useEffect(() => {
        // Condições: Não estar restaurando, perfil carregado, API checada (não precisa estar disponível, a msg é local), e sem mensagens existentes
        if (!isRestoringChat && userProfile && !isCheckingApi && messages.length === 0 && !isChatEnded) {
             const initialMessageText = isApiAvailable
                ? `Olá ${userProfile.nome || 'usuário'}! Analisei seu questionário. Você tem ${MAX_INTERACTIONS} interações para tirar dúvidas ou adicionar detalhes antes que eu gere seu plano. O que gostaria de perguntar ou adicionar?`
                : `Olá ${userProfile.nome || 'usuário'}! Analisei seu questionário. No momento, não consigo me conectar ao assistente para processar novas informações, mas você pode revisar os dados.`; // Mensagem alternativa se API offline

            const initialMessage: Content = {
                role: 'model',
                parts: [{ text: initialMessageText }]
            };

            setMessages([initialMessage]);
            console.log('[ChatScreen] Mensagem inicial adicionada.');
        }
    }, [isRestoringChat, userProfile, isCheckingApi, messages.length, isApiAvailable, isChatEnded]); // Depende de todos esses estados

    // 4. Salvar estado do chat no storage quando mudar
    useEffect(() => {
        // Não salva durante o carregamento inicial ou se não houver user ID
        if (isRestoringChat || !userId || messages.length === 0) return;

        const saveChatState = async () => {
            try {
                const chatState = {
                    messages,
                    currentInteraction,
                    isChatEnded,
                    extractedAdjustments,
                };
                await AsyncStorage.setItem(`${STORAGE_KEY_CHAT}_${userId}`, JSON.stringify(chatState));
                console.log('[ChatScreen] Estado do chat salvo no storage.');
            } catch (error) {
                console.error('[ChatScreen] Erro ao salvar estado do chat:', error);
            }
        };

        // Debounce save operation slightly if needed, otherwise save directly
        saveChatState();

    }, [userId, messages, currentInteraction, isChatEnded, extractedAdjustments, isRestoringChat]); // Salva quando estes mudarem (exceto no restore)

    // Rolar para o final quando mensagens mudarem
    useEffect(() => {
        if (flatListRef.current && messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    // Limpar timeout de segurança ao desmontar
    useEffect(() => {
        return () => {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }
        };
    }, []);

    // Handler para enviar mensagem
    const handleSendMessage = useCallback(async () => {
        const textToSend = inputText.trim();
        // Verifica se pode enviar
        if (isLoadingAi || !textToSend || isChatEnded || !userProfile || !isApiAvailable) {
            if (!userProfile) Alert.alert("Erro", "Dados do perfil não carregados.");
            else if (!isApiAvailable) Alert.alert("Erro", "Assistente de IA indisponível no momento.");
            else if (isChatEnded) Alert.alert("Info", "O chat já foi encerrado.");
            return;
        }

        // Reset erro e inicia loading
        setChatError(null);
        setIsLoadingAi(true);

        // Timeout de segurança para a chamada da API
        loadingTimeoutRef.current = setTimeout(() => {
            console.warn('[ChatScreen] Timeout de segurança da API acionado.');
            setIsLoadingAi(false);
            setChatError('A resposta do assistente demorou muito. Tente novamente ou pule o chat.');
            // Limpar timeout ref
             if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }
        }, 35000); // Timeout um pouco maior que o do geminiService

        const userMessage: Content = {
            role: 'user',
            parts: [{ text: textToSend }]
        };

        const interactionNumber = currentInteraction + 1;
        const updatedMessages = [...messages, userMessage];

        setMessages(updatedMessages); // Mostra a mensagem do usuário imediatamente
        setInputText(''); // Limpa o input

        try {
            console.log(`[ChatScreen] Enviando mensagem ${interactionNumber}/${MAX_INTERACTIONS} para a API Gemini.`);

            const response = await callGeminiApi(
                updatedMessages, // Envia histórico atualizado
                userProfile,
                MAX_INTERACTIONS,
                interactionNumber
            );

             // Limpa o timeout de segurança se a API respondeu a tempo
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }

            // Adicionar resposta da IA
            const aiMessage: Content = {
                role: 'model',
                parts: [{ text: response.text }]
            };

            // Processar ajustes extraídos
            let currentAdjustments = extractedAdjustments;
            if (response.extractedData?.ajustes?.length > 0) {
                console.log('[ChatScreen] IA extraiu ajustes:', response.extractedData.ajustes);
                // Evita duplicatas simples
                const newAdjustments = response.extractedData.ajustes.filter((adj: string) => !currentAdjustments.includes(adj));
                if (newAdjustments.length > 0) {
                    currentAdjustments = [...currentAdjustments, ...newAdjustments];
                    setExtractedAdjustments(currentAdjustments);
                }
            }

            // Atualizar estado geral
            setMessages(prev => [...prev, aiMessage]); // Adiciona a resposta da IA
            setCurrentInteraction(interactionNumber); // Incrementa interação

            // Verificar se atingiu o limite de interações ou a IA indicou o fim
            if (interactionNumber >= MAX_INTERACTIONS || response.text.toLowerCase().includes("gerar o plano")) {
                console.log('[ChatScreen] Limite de interações atingido ou IA finalizou. Encerrando chat.');
                setIsChatEnded(true); // Marca o chat como encerrado

                // Adiciona uma mensagem final se a IA não o fez explicitamente
                if (!response.text.toLowerCase().includes("gerar o plano")) {
                    const finalMessage: Content = {
                        role: 'model',
                        parts: [{
                            text: "Chegamos ao limite de interações. Vou usar todas as informações coletadas para gerar seu plano de treino personalizado!"
                        }]
                    };
                    // Adiciona DEPOIS da resposta da IA
                     setMessages(prev => [...prev, finalMessage]);
                }

                // Navega após um pequeno delay para o usuário ler a mensagem final
                setTimeout(() => {
                    finalizeChatAndNavigate(currentAdjustments); // Passa os ajustes finais
                }, 3000);
            }

        } catch (error: any) {
            console.error('[ChatScreen] Erro ao chamar API Gemini:', error);
             // Limpa o timeout de segurança em caso de erro também
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }

            const errorMsg = error.message || 'Falha na comunicação com o assistente.';
            setChatError(errorMsg);

            // Adiciona uma mensagem de erro no chat para o usuário
            const errorMessageContent: Content = {
                role: 'model',
                parts: [{
                    text: `Desculpe, ocorreu um erro: ${errorMsg}`
                }]
            };
             // Remove a mensagem do usuário que causou o erro e adiciona a de erro
            // Ou mantém a mensagem do usuário e adiciona a de erro depois?
            // Melhor manter a do usuário e adicionar o erro.
            setMessages(prev => [...prev, errorMessageContent]);

        } finally {
            setIsLoadingAi(false); // Garante que o loading seja desativado
        }
    }, [
        isLoadingAi, inputText, isChatEnded, userProfile, isApiAvailable,
        messages, currentInteraction, navigation, extractedAdjustments // Inclui navigation e adjustments
    ]);

    // Finalizar chat e navegar (agora recebe ajustes)
    const finalizeChatAndNavigate = useCallback(async (finalAdjustments: string[]) => {
        if (!userId) return; // Segurança extra

        console.log('[ChatScreen] Finalizando chat e navegando...');
        setIsChatEnded(true); // Garante que está marcado como encerrado

        try {
            // Salvar ajustes extraídos finais para uso posterior (geração do plano)
            if (finalAdjustments.length > 0) {
                await AsyncStorage.setItem(STORAGE_KEY_ADJUSTMENTS, JSON.stringify(finalAdjustments));
                console.log('[ChatScreen] Ajustes finais salvos:', finalAdjustments);
            } else {
                // Garante que não haja ajustes antigos se não houver novos
                 await AsyncStorage.removeItem(STORAGE_KEY_ADJUSTMENTS);
            }

            // Marcar chat como completado no storage (para não reabrir automaticamente)
            await AsyncStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');

            // Limpar o estado do chat salvo para não restaurar esta conversa específica depois
            await AsyncStorage.removeItem(`${STORAGE_KEY_CHAT}_${userId}`);

            // Navegar para a tela principal ou próxima etapa
            // !! Ajuste o nome do Navigator/Screen se for diferente !!
            navigation.navigate('MainNavigator', { screen: 'Home' });
            console.log('[ChatScreen] Navegado para MainNavigator/Home.');

        } catch (error) {
            console.error('[ChatScreen] Erro ao salvar dados finais do chat ou limpar storage:', error);
            Alert.alert('Erro', 'Não foi possível salvar os detalhes finais do chat. Seu plano pode não incluir os últimos ajustes.');
            // Navega mesmo assim para não prender o usuário
            navigation.navigate('MainNavigator', { screen: 'Home' });
        }
    }, [navigation, userId]); // Depende de navigation e userId

    // Render item para FlatList
    const renderMessage = useCallback(({ item }: { item: Content }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[ styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble ]}>
                <Text style={isUser ? styles.userMessageText : styles.aiMessageText}>
                    {item.parts[0]?.text || ''} {/* Adiciona fallback para texto vazio */}
                </Text>
            </View>
        );
    }, [theme]); // Depende do theme para os estilos

    // Estilos (usando useMemo para otimização)
    const styles = useMemo(() => StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: theme.colors.background },
        container: { flex: 1 },
        contentContainer: { flex: 1 },
        headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.outline },
        headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
        interactionsLeft: { fontSize: 14, color: theme.colors.onSurfaceVariant },
        listContainer: { flex: 1, paddingHorizontal: 12 },
        loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        loadingText: { marginTop: 12, fontSize: 16, color: theme.colors.onBackground, textAlign: 'center'},
        messageBubble: { padding: 12, borderRadius: 18, marginVertical: 4, maxWidth: '85%' },
        userBubble: { backgroundColor: theme.colors.primary, alignSelf: 'flex-end', marginLeft: 40 },
        aiBubble: { backgroundColor: theme.colors.surfaceVariant, alignSelf: 'flex-start', marginRight: 40 },
        userMessageText: { color: theme.colors.onPrimary || '#FFFFFF', fontSize: 16 }, // Fallback branco
        aiMessageText: { color: theme.colors.onSurfaceVariant, fontSize: 16 },
        inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.outline, backgroundColor: theme.colors.surface },
        input: { flex: 1, backgroundColor: theme.colors.surfaceVariant, borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 8, color: theme.colors.onSurfaceVariant, maxHeight: 100, fontSize: 16, marginRight: 8 },
        sendButton: { backgroundColor: theme.colors.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
        sendButtonDisabled: { backgroundColor: theme.colors.surfaceDisabled || '#BDBDBD', opacity: 0.7 }, // Fallback cinza
        errorContainer: { backgroundColor: `${theme.colors.error}20`, padding: 12, borderRadius: 8, marginHorizontal: 12, marginBottom: 8, marginTop: 4 },
        errorText: { color: theme.colors.error, textAlign: 'center', marginBottom: 0 }, // Removido margin bottom extra
        // Botão de Pular/Finalizar (ajustado)
        skipButtonContainer: { paddingLeft: 10 }, // Espaçamento à esquerda
         skipButtonText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 16 },
         // Estilo para lista de mensagens
         messageListContentContainer: { paddingBottom: 12, paddingTop: 8 },
    }), [theme]);

    // Loading inicial (Restaurando ou Checando API)
    if (isRestoringChat || isCheckingApi) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>
                        {isRestoringChat ? 'Carregando conversa...' : 'Conectando ao assistente...'}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // UI principal
    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}> {/* Remove edge top se o header já cuida */}
             <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Ajuste conforme necessário
            >
                {/* Header */}
                <View style={styles.headerContainer}>
                    <Text style={styles.headerTitle}>Chat com ForcaAI</Text>
                     {!isChatEnded && (
                        <Text style={styles.interactionsLeft}>
                            {`Interação ${currentInteraction + 1} de ${MAX_INTERACTIONS}`}
                        </Text>
                    )}
                    {/* Botão Pular / Finalizar */}
                    <TouchableOpacity
                        style={styles.skipButtonContainer}
                        onPress={() => {
                            if (isChatEnded) {
                                finalizeChatAndNavigate(extractedAdjustments);
                            } else {
                                Alert.alert(
                                    'Pular Chat',
                                    'Deseja pular o restante da conversa e ir para a geração do plano de treino?',
                                    [
                                        { text: 'Não', style: 'cancel' },
                                        { text: 'Sim', onPress: () => finalizeChatAndNavigate(extractedAdjustments) },
                                    ]
                                );
                            }
                        }}
                    >
                        <Text style={styles.skipButtonText}>
                            {isChatEnded ? 'Finalizar' : 'Pular'}
                        </Text>
                    </TouchableOpacity>
                </View>

                 <View style={styles.contentContainer}>
                    {/* Lista de Mensagens */}
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(_, index) => `msg-${userId}-${index}`} // Chave mais única
                        style={styles.listContainer}
                        contentContainerStyle={styles.messageListContentContainer}
                        ListEmptyComponent={() => (
                            // Mostra algo se não houver mensagens (ex: durante carregamento inicial pós-restore)
                             !isRestoringChat && !isCheckingApi ? (
                                 <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                     <Text style={{ color: theme.colors.onSurfaceVariant }}>{isApiAvailable ? "Envie sua primeira dúvida." : "Assistente indisponível."}</Text>
                                 </View>
                             ) : null // Não mostra nada durante o loading
                         )}
                    />

                     {/* Mensagem de Erro (fora da lista) */}
                    {chatError && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{chatError}</Text>
                            {/* Opcional: Botão para limpar erro ou tentar novamente */}
                             <TouchableOpacity onPress={() => setChatError(null)} style={{ alignSelf: 'flex-end', padding: 4}}>
                                 <Feather name="x-circle" size={16} color={theme.colors.error} />
                             </TouchableOpacity>
                        </View>
                    )}

                    {/* Input de Texto */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={inputText}
                            onChangeText={setInputText}
                            placeholder={
                                isChatEnded ? "Chat encerrado." :
                                !isApiAvailable ? "Assistente indisponível." :
                                "Digite sua dúvida ou ajuste..."
                            }
                            placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
                            editable={!isLoadingAi && !isChatEnded && isApiAvailable} // Só editável se não estiver carregando, não encerrado e API ok
                            multiline
                            maxLength={500} // Limite de caracteres
                            selectionColor={theme.colors.primary} // Cor do cursor
                        />
                        <TouchableOpacity
                            style={[
                                styles.sendButton,
                                (isLoadingAi || !inputText.trim() || isChatEnded || !isApiAvailable) && styles.sendButtonDisabled
                            ]}
                            onPress={handleSendMessage}
                            disabled={isLoadingAi || !inputText.trim() || isChatEnded || !isApiAvailable}
                        >
                            {isLoadingAi ? (
                                <ActivityIndicator size="small" color={theme.colors.onPrimary || 'white'} />
                            ) : (
                                <Feather name="send" size={20} color={theme.colors.onPrimary || 'white'} />
                            )}
                        </TouchableOpacity>
                    </View>
                 </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default PostQuestionnaireChat;