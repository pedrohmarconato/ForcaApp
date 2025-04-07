// /home/pmarconato/ForcaApp/src/screens/PostQuestionnaireChat.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Button,
    Modal,
    Alert,
    Pressable,
    Image,
    Text,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import {
    useTheme as usePaperTheme,
    TextInput as PaperTextInput,
    HelperText,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

// Serviços e Contextos
import { callClaudeApi, testClaudeApiConnection } from '../services/api/claudeService';
import { requestTrainingPlanGeneration } from '../services/api/trainingPlanService';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingStackParamList } from '../navigation/OnboardingNavigator';

// --- Tipos ---
type Content = { role: 'user' | 'model' | 'system'; parts: { text: string }[] };
type ChatScreenRouteParams = { formData?: any };
type PostQuestionnaireChatNavigationProp = StackNavigationProp<OnboardingStackParamList, 'PostQuestionnaireChat'>;

// --- Constantes de Estilo ---
const NEON_YELLOW = '#EBFF00';
const DARK_GRADIENT_START = '#0A0A0A';
const DARK_GRADIENT_END = '#1A1A1A';
const CARD_BG = 'rgba(0, 0, 0, 0.4)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.1)';
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';
const ERROR_COLOR = '#FF4D4D';
const SUCCESS_COLOR = '#4CAF50';

// --- Constantes Funcionais ---
const MAX_INTERACTIONS = 3;
const STORAGE_KEY_CHAT_PREFIX = '@chat_messages_';
const STORAGE_KEY_QUESTIONNAIRE_PREFIX = '@questionnaire_data_';
const STORAGE_KEY_CHAT_COMPLETED_PREFIX = '@chat_completed_';

const PostQuestionnaireChat = () => {
    const paperTheme = usePaperTheme();
    const route = useRoute<RouteProp<{ params: ChatScreenRouteParams }, 'params'>>();
    const navigation = useNavigation<PostQuestionnaireChatNavigationProp>();
    const { user, updateProfile } = useAuth();
    const flatListRef = useRef<FlatList<Content>>(null);

    // --- Estados ---
    const [messages, setMessages] = useState<Content[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [isApiAvailable, setIsApiAvailable] = useState<boolean | null>(null);
    const [interactionsCount, setInteractionsCount] = useState(0);
    const [isChatEnded, setIsChatEnded] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [questionnaireData, setQuestionnaireData] = useState<any>(null);
    const [adjustments, setAdjustments] = useState<string[]>([]);
    const [isQuestionnaireReady, setIsQuestionnaireReady] = useState(false);
    const [showInitialChoice, setShowInitialChoice] = useState(false);
    const [isSummaryModalVisible, setIsSummaryModalVisible] = useState(false);
    const [summaryContent, setSummaryContent] = useState('');
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [isSendButtonPressed, setIsSendButtonPressed] = useState(false);
    const [isEndButtonPressed, setIsEndButtonPressed] = useState(false);

    // --- DERIVAÇÃO DE CHAVES ---
    const userId = user?.id;
    const STORAGE_KEY_CHAT = useMemo(() => userId ? `${STORAGE_KEY_CHAT_PREFIX}${userId}` : null, [userId]);
    const STORAGE_KEY_QUESTIONNAIRE = useMemo(() => userId ? `${STORAGE_KEY_QUESTIONNAIRE_PREFIX}${userId}` : null, [userId]);
    const STORAGE_KEY_CHAT_COMPLETED = useMemo(() => userId ? `${STORAGE_KEY_CHAT_COMPLETED_PREFIX}${userId}` : null, [userId]);

    // --- Tema para Inputs ---
    const inputTheme = useMemo(() => ({
        // ... (definição do tema inalterada) ...
        ...paperTheme,
        colors: {
            ...paperTheme.colors,
            primary: NEON_YELLOW,
            text: TEXT_COLOR,
            placeholder: PLACEHOLDER_COLOR,
            background: INPUT_BG,
            outline: BORDER_COLOR,
            onSurfaceVariant: PLACEHOLDER_COLOR,
            error: ERROR_COLOR,
        },
        roundness: 12,
    }), [paperTheme]);

    // --- FUNÇÕES ---

    const saveChatState = useCallback(async (key: string | null, msgs: Content[], count: number, ended: boolean, adjs: string[]) => {
        // ... (implementação inalterada) ...
        if (!key) return;
        try {
            const stateToSave = JSON.stringify({ messages: msgs, interactionsCount: count, isChatEnded: ended, adjustments: adjs });
            await AsyncStorage.setItem(key, stateToSave);
        } catch (error) {
            console.error(`[Chat ${userId}] Erro ao salvar estado do chat no AsyncStorage:`, error);
        }
    }, [userId]);

    const getAICoachWelcomeText = useCallback((userName: string | null | undefined) => {
        // ... (implementação inalterada) ...
        const namePart = userName ? `, ${userName}` : '';
        return `Olá${namePart}! Sou seu assistente IA da Forca App. Analisei suas respostas. Antes de gerar seu plano de treino personalizado, você gostaria de fazer alguma pergunta ou solicitar algum ajuste específico? Você tem até ${MAX_INTERACTIONS} interações para isso.`;
    }, []);

    // ** Função para gerar o plano **
    const completeOnboardingAndGeneratePlan = useCallback(async () => {
        // Acessa questionnaireData e adjustments diretamente do estado aqui
        // Não precisa deles como dependência do useCallback

        if (isGeneratingPlan) {
            console.log(`[Chat ${userId}] Tentativa de gerar plano enquanto já estava gerando.`);
            return;
        }
        // Lê o estado atualizado de questionnaireData aqui
        if (!userId || !questionnaireData) {
            Alert.alert("Erro", "Dados do usuário ou questionário ausentes para gerar o plano.");
            return;
        }

        console.log(`[Chat ${userId}] Iniciando geração do plano...`);
        setIsGeneratingPlan(true);
        setChatError(null);

        try {
            // Lê o estado atualizado de adjustments aqui
            const result = await requestTrainingPlanGeneration(userId, questionnaireData, adjustments);

            if (result.success && result.planId) {
                console.log(`[Chat ${userId}] Plano gerado com sucesso, ID: ${result.planId}`);
                await updateProfile({ onboarding_completed: true, current_plan_id: result.planId });
                console.log(`[Chat ${userId}] Perfil atualizado, onboarding completo.`);

                navigation.reset({
                    index: 0,
                    routes: [{ name: 'App', params: { screen: 'Home' } }],
                });
                console.log(`[Chat ${userId}] Navegando para App/Home.`);

            } else {
                throw new Error(result.message || "Falha ao gerar o plano de treino.");
            }
        } catch (error: any) {
            console.error(`[Chat ${userId}] Erro ao gerar plano ou completar onboarding:`, error);
            setChatError(`Erro ao gerar plano: ${error.message || 'Tente novamente.'}`);
            setIsGeneratingPlan(false);
        }
    // *** CORREÇÃO: Removido questionnaireData e adjustments das dependências ***
    // A função agora depende apenas de coisas que não mudam *durante* a inicialização
    }, [userId, updateProfile, navigation, isGeneratingPlan]); // Dependências estáveis

    const handleUserWantsToChat = useCallback(() => {
        // ... (implementação inalterada) ...
        setShowInitialChoice(false);
    }, []);

    // Ajustar dependências se completeOnboardingAndGeneratePlan foi alterada
    const handleUserDeclinesChat = useCallback(async () => {
        // ... (implementação inalterada, mas verifica dependências) ...
        setShowInitialChoice(false);
        setIsChatEnded(true);
        const systemMessage = { role: 'system', parts: [{ text: "Ok, vamos gerar seu treino com base nas respostas." }] };
        // Cria uma cópia atualizada das mensagens para salvar
        const updatedMessages = [...messages, systemMessage];
        setMessages(updatedMessages);

        if (STORAGE_KEY_CHAT) {
            // Salva o estado ANTES de chamar a geração
            await saveChatState(STORAGE_KEY_CHAT, updatedMessages, interactionsCount, true, adjustments);
        }
        if (STORAGE_KEY_CHAT_COMPLETED) {
            await AsyncStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
        }
        await completeOnboardingAndGeneratePlan();
    }, [messages, interactionsCount, adjustments, STORAGE_KEY_CHAT, STORAGE_KEY_CHAT_COMPLETED, saveChatState, completeOnboardingAndGeneratePlan]); // completeOnboardingAndGeneratePlan agora é estável

    const generateSummary = useCallback(() => {
        // ... (implementação inalterada) ...
        let summary = "Resumo do Questionário:\n";
        if (questionnaireData) {
            for (const key in questionnaireData) {
                if (Object.hasOwnProperty.call(questionnaireData, key)) {
                    summary += `- ${key.replace(/_/g, ' ')}: ${JSON.stringify(questionnaireData[key])}\n`;
                }
            }
        } else {
            summary += "- (Dados do questionário não disponíveis)\n";
        }

        summary += "\nAjustes Solicitados no Chat:\n";
        if (adjustments.length > 0) {
            adjustments.forEach((adj, index) => {
                summary += `- ${index + 1}: ${adj}\n`;
            });
        } else {
            summary += "- Nenhum ajuste solicitado.\n";
        }
        return summary;
    }, [questionnaireData, adjustments]); // Depende dos estados que usa

    const handleEndChatPress = useCallback(() => {
        // ... (implementação inalterada) ...
        const summary = generateSummary();
        setSummaryContent(summary);
        setIsSummaryModalVisible(true);
    }, [generateSummary]);

    // Ajustar dependências se completeOnboardingAndGeneratePlan foi alterada
    const handleConfirmEndChat = useCallback(async () => {
        // ... (implementação inalterada, mas verifica dependências) ...
        setIsSummaryModalVisible(false);
        setIsChatEnded(true);
        const systemMessage = { role: 'system', parts: [{ text: "Ok, gerando seu plano de treino com base no questionário e ajustes..." }] };
        const updatedMessages = [...messages, systemMessage];
        setMessages(updatedMessages);

        if (STORAGE_KEY_CHAT) {
            await saveChatState(STORAGE_KEY_CHAT, updatedMessages, interactionsCount, true, adjustments);
        }
        if (STORAGE_KEY_CHAT_COMPLETED) {
            await AsyncStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
        }
        await completeOnboardingAndGeneratePlan();
    }, [messages, interactionsCount, adjustments, STORAGE_KEY_CHAT, STORAGE_KEY_CHAT_COMPLETED, saveChatState, completeOnboardingAndGeneratePlan]); // completeOnboardingAndGeneratePlan agora é estável

    const handleCancelEndChat = useCallback(() => {
        // ... (implementação inalterada) ...
        setIsSummaryModalVisible(false);
    }, []);

    const handleSendMessage = useCallback(async () => {
        // ... (implementação inalterada) ...
        const textToSend = inputText.trim();
        if (!textToSend || isLoadingAi || isChatEnded || !isApiAvailable || isGeneratingPlan) return;

        const userMessage: Content = { role: 'user', parts: [{ text: textToSend }] };
        const currentMessages = [...messages, userMessage];
        setMessages(currentMessages);
        setInputText('');
        setIsLoadingAi(true);
        setChatError(null);
        const newInteractionCount = interactionsCount + 1;
        setInteractionsCount(newInteractionCount);

        const currentAdjustments = [...adjustments, textToSend];
        setAdjustments(currentAdjustments);

        if (STORAGE_KEY_CHAT) {
            await saveChatState(STORAGE_KEY_CHAT, currentMessages, newInteractionCount, false, currentAdjustments);
        }

        try {
            const historyForApi = currentMessages.filter(msg => msg.role !== 'system');
            const aiResponseText = await callClaudeApi(historyForApi);

            if (aiResponseText) {
                const aiMessage: Content = { role: 'model', parts: [{ text: aiResponseText }] };
                const updatedMessagesWithAI = [...currentMessages, aiMessage];
                setMessages(updatedMessagesWithAI);

                let finalMessages = updatedMessagesWithAI;
                let chatEndedAfterResponse = false;

                if (newInteractionCount >= MAX_INTERACTIONS) {
                    chatEndedAfterResponse = true;
                    setIsChatEnded(true);
                    const endMessage: Content = { role: 'system', parts: [{ text: `Limite de ${MAX_INTERACTIONS} interações atingido. Clique em ✓ para gerar seu treino com os ajustes feitos.` }] };
                    finalMessages = [...updatedMessagesWithAI, endMessage];
                    setMessages(finalMessages);
                }

                if (STORAGE_KEY_CHAT) {
                    await saveChatState(STORAGE_KEY_CHAT, finalMessages, newInteractionCount, chatEndedAfterResponse, currentAdjustments);
                }
                if (chatEndedAfterResponse && STORAGE_KEY_CHAT_COMPLETED) {
                    await AsyncStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
                }

            } else {
                throw new Error("Resposta da IA vazia ou inválida.");
            }
        } catch (error: any) {
            console.error(`[Chat ${userId}] Erro ao chamar API Claude:`, error);
            const errorMessage = error.message || "Ocorreu um erro ao contatar o assistente. Tente novamente.";
            setChatError(errorMessage);
        } finally {
            setIsLoadingAi(false);
        }
    }, [
        inputText, isLoadingAi, isChatEnded, isApiAvailable, isGeneratingPlan, messages,
        interactionsCount, adjustments, STORAGE_KEY_CHAT, STORAGE_KEY_CHAT_COMPLETED, saveChatState, userId
    ]);


    // --- EFEITOS ---

    // Efeito de Carga Inicial e Verificação da API
    useEffect(() => {
        const initializeChat = async () => {
            // ... (lógica interna da função inalterada) ...
            console.log(`[Chat ${userId}] Iniciando inicialização... (isInitializing: ${isInitializing})`);
            setChatError(null);
            let loadedQuestionnaireData = null;
            let chatAlreadyCompleted = false;
            let apiOk = null;

            try {
                // 0. Verificar se o chat já foi concluído
                if (STORAGE_KEY_CHAT_COMPLETED) {
                    const completedStatus = await AsyncStorage.getItem(STORAGE_KEY_CHAT_COMPLETED);
                    if (completedStatus === 'true') {
                        console.log(`[Chat ${userId}] Chat já concluído anteriormente.`);
                        chatAlreadyCompleted = true;
                        if (user?.onboarding_completed) {
                            console.log(`[Chat ${userId}] Onboarding já completo. Navegando para App.`);
                            navigation.reset({ index: 0, routes: [{ name: 'App', params: { screen: 'Home' } }] });
                            return;
                        } else {
                            console.warn(`[Chat ${userId}] Chat completo, mas onboarding não. Tentando gerar plano.`);
                        }
                    }
                }

                // 1. Carregar dados do questionário
                if (STORAGE_KEY_QUESTIONNAIRE) {
                    const storedData = await AsyncStorage.getItem(STORAGE_KEY_QUESTIONNAIRE);
                    if (storedData) {
                        loadedQuestionnaireData = JSON.parse(storedData);
                        setQuestionnaireData(loadedQuestionnaireData);
                        setIsQuestionnaireReady(true);
                        console.log(`[Chat ${userId}] Dados do questionário carregados.`);
                    } else {
                        throw new Error("Dados do questionário não encontrados.");
                    }
                } else {
                    throw new Error("Chave do questionário inválida.");
                }

                // Se chat completo, tenta gerar plano e sai
                if (chatAlreadyCompleted && loadedQuestionnaireData) {
                    // Chama a função que agora tem referência estável
                    await completeOnboardingAndGeneratePlan();
                    return;
                }

                // 2. Testar API Claude
                apiOk = await testClaudeApiConnection();
                setIsApiAvailable(apiOk);
                if (!apiOk) {
                    setChatError("Assistente IA indisponível. Você pode gerar o treino sem ajustes.");
                    console.warn(`[Chat ${userId}] API Claude indisponível.`);
                } else {
                    console.log(`[Chat ${userId}] API Claude disponível.`);
                }

                // 3. Carregar histórico ou iniciar
                let initialMessages: Content[] = [];
                let initialInteractionCount = 0;
                let initialIsChatEnded = false;
                let initialAdjustments: string[] = [];
                let loadedState = false;

                if (STORAGE_KEY_CHAT) {
                    const storedChat = await AsyncStorage.getItem(STORAGE_KEY_CHAT);
                    if (storedChat) {
                        try {
                            const chatState = JSON.parse(storedChat);
                            initialMessages = chatState.messages || [];
                            initialInteractionCount = chatState.interactionsCount || 0;
                            initialIsChatEnded = chatState.isChatEnded || false;
                            initialAdjustments = chatState.adjustments || [];
                            loadedState = true;
                            console.log(`[Chat ${userId}] Histórico carregado: ${initialMessages.length} msgs, ${initialInteractionCount} interações, terminado: ${initialIsChatEnded}`);
                        } catch (parseError) {
                            console.error(`[Chat ${userId}] Erro ao parsear estado do chat salvo:`, parseError);
                            await AsyncStorage.removeItem(STORAGE_KEY_CHAT);
                        }
                    }
                }

                setMessages(initialMessages);
                setInteractionsCount(initialInteractionCount);
                setIsChatEnded(initialIsChatEnded);
                setAdjustments(initialAdjustments);

                if (!loadedState && !initialIsChatEnded) {
                    if (apiOk) {
                        const welcomeMsg: Content = { role: 'model', parts: [{ text: getAICoachWelcomeText(user?.user_metadata?.full_name) }] };
                        setMessages([welcomeMsg]);
                        setShowInitialChoice(true);
                        console.log(`[Chat ${userId}] Iniciando novo chat com boas-vindas.`);
                        if (STORAGE_KEY_CHAT) {
                            await saveChatState(STORAGE_KEY_CHAT, [welcomeMsg], 0, false, []);
                        }
                    } else {
                        setShowInitialChoice(true);
                        console.log(`[Chat ${userId}] API indisponível, mostrando opção de gerar direto.`);
                    }
                } else if (initialIsChatEnded) {
                    setShowInitialChoice(false);
                    console.log(`[Chat ${userId}] Chat carregado já estava encerrado.`);
                } else {
                    setShowInitialChoice(false);
                    console.log(`[Chat ${userId}] Continuando chat existente ou iniciado.`);
                }

            } catch (error: any) {
                console.error(`[Chat ${userId}] Erro durante inicialização:`, error);
                setChatError(`Erro ao inicializar: ${error.message}`);
                setIsQuestionnaireReady(false);
            } finally {
                setIsInitializing(false);
                console.log(`[Chat ${userId}] Inicialização finalizada.`);
            }
        };

        if (userId && isInitializing) {
            initializeChat();
        } else if (!userId) {
            console.warn("[Chat] Tentando inicializar sem userId.");
            setChatError("Erro: Usuário não identificado.");
            setIsInitializing(false);
            setIsQuestionnaireReady(false);
        }
    // *** Dependências do useEffect atualizadas ***
    // Agora completeOnboardingAndGeneratePlan tem referência estável
    }, [
        userId,
        navigation,
        user?.onboarding_completed,
        user?.user_metadata?.full_name,
        getAICoachWelcomeText, // Estável
        completeOnboardingAndGeneratePlan, // Agora estável
        isInitializing,
        // STORAGE_KEYS são derivados de userId via useMemo, não precisam estar aqui
        // saveChatState é estável
    ]);


    // Efeito para Rolar FlatList
    useEffect(() => {
        // ... (implementação inalterada) ...
        if (messages.length > 0) {
            const timerId = setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 150);
            return () => clearTimeout(timerId);
        }
    }, [messages]);


    // --- Renderização de Mensagens ---
    const renderMessage = useCallback(({ item, index }: { item: Content, index: number }) => {
        // ... (implementação inalterada) ...
        const isUser = item.role === 'user';
        const isSystem = item.role === 'system';
        let messageText: string = '[Mensagem inválida]';
        try {
            if (item?.parts?.[0]?.text) {
                messageText = item.parts[0].text;
            } else {
                console.warn(`[renderMessage ${index}] Formato de mensagem inesperado:`, JSON.stringify(item));
            }
        } catch (e) {
            console.error(`[renderMessage ${index}] Erro ao processar texto da mensagem: `, e, JSON.stringify(item));
        }

        const bubbleStyle = isUser ? styles.userBubble : (isSystem ? styles.systemBubble : styles.aiBubble);
        const textStyle = isUser ? styles.userMessageText : (isSystem ? styles.systemMessageText : styles.aiMessageText);
        const key = `msg-${item.role}-${index}-${messageText.slice(0, 15)}-${Math.random()}`;

        return (
            <View key={key} style={[styles.messageBubbleBase, bubbleStyle]}>
                <Text style={textStyle}>{messageText}</Text>
            </View>
        );
    }, []);

    // --- ESTILOS ---
    const styles = useMemo(() => StyleSheet.create({
        // ... (definições de estilo inalteradas) ...
        fullScreenGradient: { flex: 1 },
        keyboardAvoiding: { flex: 1 },
        mainContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: Platform.OS === 'ios' ? 10 : 20,
            paddingHorizontal: 10,
        },
        card: {
            width: '100%',
            maxWidth: 500,
            flex: 1,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: BORDER_COLOR,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
            display: 'flex',
            flexDirection: 'column'
        },
        cardBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: CARD_BG },
        contentContainer: {
            flex: 1,
            padding: 20,
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column'
        },
        headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
        headerTitle: { fontSize: 18, fontWeight: 'bold', color: TEXT_COLOR, textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
        interactionsLeft: { fontSize: 14, color: TEXT_SECONDARY_COLOR },
        listContainer: {
            flex: 1,
            marginBottom: 12
        },
        messageListContentContainer: { paddingBottom: 8 },
        messageBubbleBase: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, marginVertical: 5, maxWidth: '85%' },
        userBubble: { backgroundColor: NEON_YELLOW, alignSelf: 'flex-end', marginLeft: 40 },
        aiBubble: { backgroundColor: INPUT_BG, alignSelf: 'flex-start', marginRight: 40, borderWidth: 1, borderColor: BORDER_COLOR },
        systemBubble: { backgroundColor: 'transparent', alignSelf: 'center', paddingVertical: 5, marginVertical: 8 },
        userMessageText: { color: BUTTON_TEXT_DARK, fontSize: 15 },
        aiMessageText: { color: TEXT_SECONDARY_COLOR, fontSize: 15 },
        systemMessageText: { color: TEXT_TERTIARY_COLOR, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
        inputAreaContainer: {
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: BORDER_COLOR,
        },
        statusMessageContainer: { paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER_COLOR, marginBottom: 10 },
        inputRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
        input: { flex: 1, marginRight: 8, maxHeight: 100 },
        inputActionsContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
        actionButtonBase: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
        actionButtonIdle: { backgroundColor: NEON_YELLOW, elevation: 3, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 5 },
        actionButtonPressed: { backgroundColor: '#D4E600', elevation: 6, shadowOpacity: 0.6, shadowRadius: 8 },
        actionButtonDisabled: { backgroundColor: 'rgba(235, 255, 0, 0.4)', elevation: 0, shadowOpacity: 0 },
        loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
        loadingText: { color: TEXT_COLOR, marginTop: 15, fontSize: 16 },
        errorContainer: { backgroundColor: `${ERROR_COLOR}20`, padding: 10, borderRadius: 8, marginHorizontal: 0, marginBottom: 10, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        errorText: { color: ERROR_COLOR, flex: 1, marginRight: 10, fontSize: 14 },
        errorIconTouchable: { padding: 5 },
        initialChoiceContainer: { padding: 16, marginVertical: 15, backgroundColor: INPUT_BG, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: BORDER_COLOR },
        initialChoiceText: { fontSize: 15, color: TEXT_SECONDARY_COLOR, textAlign: 'center', marginBottom: 15, lineHeight: 21 },
        initialChoiceButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
        modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
        modalContent: { width: '90%', maxHeight: '80%', backgroundColor: DARK_GRADIENT_END, borderRadius: 10, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, borderWidth: 1, borderColor: BORDER_COLOR },
        modalTitle: { fontSize: 18, fontWeight: 'bold', color: TEXT_COLOR, marginBottom: 15, textAlign: 'center' },
        modalScrollView: { maxHeight: '65%', marginBottom: 15 },
        modalSummaryText: { fontSize: 14, color: TEXT_SECONDARY_COLOR, lineHeight: 20 },
        modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
        modalButtonContainer: { alignItems: 'center', marginTop: 10 },
        decorativeCircle: { position: 'absolute', width: 500, height: 500, borderRadius: 250, opacity: 0.08 },
        circleTopLeft: { top: -250, left: -250, backgroundColor: TEXT_COLOR },
        circleBottomRight: { bottom: -250, right: -250, backgroundColor: NEON_YELLOW },
        footerText: { color: TEXT_TERTIARY_COLOR, fontSize: 12, textAlign: 'center', marginTop: 'auto', paddingTop: 10 },
    }), []);

    // --- RENDERIZAÇÃO ---

    // Tela de Loading Inicial
    if (isInitializing) {
        // ... (renderização do loading inalterada) ...
        return (
            <LinearGradient colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]} style={styles.fullScreenGradient}>
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={NEON_YELLOW} />
                    <Text style={styles.loadingText}>Inicializando Chat...</Text>
                </View>
            </LinearGradient>
        );
    }

    // Tela de Erro Crítico
    if (!isInitializing && !isQuestionnaireReady) {
        // ... (renderização do erro inalterada) ...
        return (
            <LinearGradient colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]} style={styles.fullScreenGradient}>
                <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ alignItems: 'center', padding: 20 }}>
                        <Feather name="alert-triangle" size={40} color={ERROR_COLOR} />
                        <Text style={[styles.loadingText, { color: ERROR_COLOR, marginTop: 15, textAlign: 'center' }]}>
                            {chatError || "Erro crítico: Não foi possível carregar os dados necessários."}
                        </Text>
                        <Button title="Voltar" onPress={() => navigation.goBack()} color={NEON_YELLOW} />
                    </View>
                </SafeAreaView>
            </LinearGradient>
        );
    }

    // Renderização Principal do Chat
    return (
        <LinearGradient colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]} style={styles.fullScreenGradient}>
            {/* ... (elementos decorativos) ... */}
            <View style={[styles.decorativeCircle, styles.circleTopLeft]} />
            <View style={[styles.decorativeCircle, styles.circleBottomRight]} />

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardAvoiding}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
                >
                    <View style={styles.mainContainer}>
                        <View style={styles.card}>
                            {/* ... (fundo do card) ... */}
                            <View style={styles.cardBackground} />
                            <View style={styles.contentContainer}>

                                {/* Cabeçalho */}
                                {/* ... (cabeçalho inalterado) ... */}
                                <View style={styles.headerContainer}>
                                    <Text style={styles.headerTitle}>Ajustes Finais</Text>
                                    {!isChatEnded && isApiAvailable && MAX_INTERACTIONS > 0 && (
                                        <Text style={styles.interactionsLeft}>
                                            {Math.max(0, MAX_INTERACTIONS - interactionsCount)} Restantes
                                        </Text>
                                    )}
                                </View>

                                {/* Lista de Mensagens */}
                                {/* ... (lista inalterada) ... */}
                                <View style={styles.listContainer}>
                                    <FlatList
                                        ref={flatListRef}
                                        data={messages}
                                        renderItem={renderMessage}
                                        contentContainerStyle={styles.messageListContentContainer}
                                        ListEmptyComponent={
                                            !showInitialChoice && !isInitializing ? (
                                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                                                    <Text style={styles.systemMessageText}>
                                                        {isApiAvailable === false ? "Assistente indisponível." : "Aguardando interação..."}
                                                    </Text>
                                                </View>
                                            ) : null
                                        }
                                    />
                                </View>

                                {/* Área de Escolha Inicial */}
                                {/* ... (escolha inicial inalterada) ... */}
                                {showInitialChoice && (
                                    <View style={styles.initialChoiceContainer}>
                                        <Text style={styles.initialChoiceText}>
                                            Seu questionário foi recebido! Deseja fazer alguma pergunta ou ajuste antes de gerarmos seu treino?
                                        </Text>
                                        <View style={styles.initialChoiceButtons}>
                                            <Button title="Sim, ajustar" onPress={handleUserWantsToChat} color={NEON_YELLOW} disabled={!isApiAvailable || isGeneratingPlan} />
                                            <Button title="Não, gerar" onPress={handleUserDeclinesChat} color={NEON_YELLOW} disabled={isGeneratingPlan || isLoadingAi} />
                                        </View>
                                        {!isApiAvailable && chatError && (<Text style={[styles.errorText, { marginTop: 15, paddingRight: 0, color: ERROR_COLOR, textAlign: 'center' }]}>{chatError}</Text>)}
                                        {isGeneratingPlan && <ActivityIndicator style={{ marginTop: 15 }} color={NEON_YELLOW} />}
                                    </View>
                                )}


                                {/* Erro Não Fatal */}
                                {/* ... (erro não fatal inalterado) ... */}
                                {chatError && !showInitialChoice && (
                                    <View style={styles.errorContainer}>
                                        <Text style={styles.errorText}>{chatError}</Text>
                                        <TouchableOpacity onPress={() => setChatError(null)} style={styles.errorIconTouchable}>
                                            <Feather name="x" size={18} color={ERROR_COLOR} />
                                        </TouchableOpacity>
                                    </View>
                                )}


                                {/* Área de Input */}
                                {/* ... (área de input inalterada) ... */}
                                {!showInitialChoice && (
                                    <View style={styles.inputAreaContainer}>
                                        <View style={styles.inputRow}>
                                            <PaperTextInput
                                                style={styles.input}
                                                value={inputText}
                                                onChangeText={setInputText}
                                                placeholder={!isApiAvailable ? "Assistente indisponível." : isChatEnded ? "Chat finalizado." : isGeneratingPlan ? "Gerando plano..." : "Digite sua pergunta ou ajuste..."}
                                                placeholderTextColor={PLACEHOLDER_COLOR}
                                                editable={!isLoadingAi && isApiAvailable === true && !isChatEnded && !isGeneratingPlan}
                                                multiline
                                                maxLength={500}
                                                mode="outlined"
                                                theme={inputTheme}
                                                selectionColor={NEON_YELLOW}
                                                textColor={TEXT_COLOR}
                                                outlineColor={BORDER_COLOR}
                                                activeOutlineColor={NEON_YELLOW}
                                            />
                                            <View style={styles.inputActionsContainer}>
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.actionButtonBase,
                                                        isEndButtonPressed || pressed ? styles.actionButtonPressed : styles.actionButtonIdle,
                                                        (isLoadingAi || !isApiAvailable || isChatEnded || isGeneratingPlan) && styles.actionButtonDisabled
                                                    ]}
                                                    onPress={handleEndChatPress}
                                                    onPressIn={() => setIsEndButtonPressed(true)}
                                                    onPressOut={() => setIsEndButtonPressed(false)}
                                                    disabled={isLoadingAi || !isApiAvailable || isChatEnded || isGeneratingPlan}
                                                >
                                                    <Feather name="check" size={22} color={BUTTON_TEXT_DARK} />
                                                </Pressable>
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.actionButtonBase,
                                                        isSendButtonPressed || pressed ? styles.actionButtonPressed : styles.actionButtonIdle,
                                                        (isLoadingAi || !inputText.trim() || !isApiAvailable || isChatEnded || isGeneratingPlan) && styles.actionButtonDisabled
                                                    ]}
                                                    onPress={handleSendMessage}
                                                    onPressIn={() => setIsSendButtonPressed(true)}
                                                    onPressOut={() => setIsSendButtonPressed(false)}
                                                    disabled={isLoadingAi || !inputText.trim() || !isApiAvailable || isChatEnded || isGeneratingPlan}
                                                >
                                                    {isLoadingAi ? (
                                                        <ActivityIndicator size="small" color={BUTTON_TEXT_DARK} />
                                                    ) : (
                                                        <Feather name="send" size={20} color={BUTTON_TEXT_DARK} />
                                                    )}
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                )}


                                {/* Mensagem Final / Loading Geração */}
                                {/* ... (mensagem final/loading inalterado) ... */}
                                {(isChatEnded || isGeneratingPlan) && !showInitialChoice && (
                                    <View style={[styles.statusMessageContainer, { paddingTop: 15, alignItems: 'center' }]}>
                                        {isGeneratingPlan ? (
                                            <>
                                                <Text style={styles.systemMessageText}>Solicitando geração do plano...</Text>
                                                <ActivityIndicator style={{ marginTop: 10 }} color={NEON_YELLOW} />
                                            </>
                                        ) : (
                                            <Text style={styles.systemMessageText}>
                                                {messages[messages.length - 1]?.parts[0]?.text.includes('Limite de interações atingido')
                                                    ? messages[messages.length - 1]?.parts[0]?.text
                                                    : "Chat encerrado. Clique em ✓ para gerar o treino."}
                                            </Text>
                                        )}
                                    </View>
                                )}



                                {/* Footer */}
                                {/* ... (footer inalterado) ... */}
                                <Text style={styles.footerText}>Forca App IA Coach</Text>

                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* Modal de Resumo */}
            {/* ... (modal inalterado) ... */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={isSummaryModalVisible}
                onRequestClose={() => { if (!isGeneratingPlan) setIsSummaryModalVisible(false); }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Confirmar e Gerar Treino?</Text>
                        <ScrollView style={styles.modalScrollView}>
                            <Text style={styles.modalSummaryText}>{summaryContent}</Text>
                        </ScrollView>
                        {isGeneratingPlan ? (
                            <View style={styles.modalButtonContainer}>
                                <ActivityIndicator size="large" color={NEON_YELLOW} />
                                <Text style={[styles.loadingText, { fontSize: 14, color: TEXT_COLOR }]}>Gerando Plano...</Text>
                            </View>
                        ) : (
                            <View style={styles.modalActions}>
                                <Button title="Voltar ao Chat" onPress={handleCancelEndChat} color={TEXT_SECONDARY_COLOR} />
                                <Button title="Confirmar e Gerar" onPress={handleConfirmEndChat} color={NEON_YELLOW} />
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
};

export default PostQuestionnaireChat;