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
    Button,
    Modal, // Importar Modal
    ScrollView, // Importar ScrollView para o conteúdo do modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
type Content = { role: 'user' | 'model' | 'system'; parts: { text: string }[] };
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { callClaudeApi, testClaudeApiConnection } from '../services/api/claudeService';
import { useAuth } from '../contexts/AuthContext'; // Usa o AuthContext fornecido

// Constantes
const MAX_INTERACTIONS = 3;
const STORAGE_KEY_CHAT_PREFIX = '@chat_messages_';
const STORAGE_KEY_QUESTIONNAIRE_PREFIX = '@questionnaire_data_';
const STORAGE_KEY_ADJUSTMENTS_PREFIX = '@chat_adjustments_';
const STORAGE_KEY_CHAT_COMPLETED_PREFIX = '@chat_completed_';

// Tipos
type ChatScreenRouteParams = { formData?: any };

const PostQuestionnaireChat = () => {
    const theme = useTheme();
    const route = useRoute<RouteProp<{ params: ChatScreenRouteParams }, 'params'>>();
    const navigation = useNavigation();
    const { user } = useAuth(); // Obtém user do AuthContext
    const flatListRef = useRef<FlatList<Content>>(null);

    // --- ESTADOS ---
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

    // --- DERIVAÇÃO DE CHAVES ---
    const userId = user?.id;
    const STORAGE_KEY_CHAT = userId ? `${STORAGE_KEY_CHAT_PREFIX}${userId}` : null;
    const STORAGE_KEY_QUESTIONNAIRE = userId ? `${STORAGE_KEY_QUESTIONNAIRE_PREFIX}${userId}` : null;
    const STORAGE_KEY_ADJUSTMENTS = userId ? `${STORAGE_KEY_ADJUSTMENTS_PREFIX}${userId}` : null;
    const STORAGE_KEY_CHAT_COMPLETED = userId ? `${STORAGE_KEY_CHAT_COMPLETED_PREFIX}${userId}` : null;

    // --- ESTILOS ---
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
        systemBubble: { backgroundColor: theme.colors.surfaceVariant, alignSelf: 'flex-start', marginRight: 40 },
        userMessageText: { color: theme.colors.onPrimary || '#FFFFFF', fontSize: 16 },
        aiMessageText: { color: theme.colors.onSurfaceVariant, fontSize: 16 },
        systemMessageText: { color: theme.colors.onSurfaceVariant, fontSize: 16, fontStyle: 'italic' },
        inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.colors.outline, backgroundColor: theme.colors.surface },
        input: { flex: 1, backgroundColor: theme.colors.surfaceVariant, borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 8, color: theme.colors.onSurfaceVariant, maxHeight: 100, fontSize: 16, marginRight: 8 },
        inputActionsContainer: { flexDirection: 'row', alignItems: 'center' },
        actionButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
        sendButton: { backgroundColor: theme.colors.primary },
        endChatButton: { backgroundColor: theme.colors.secondary },
        actionButtonDisabled: { backgroundColor: theme.colors.surfaceDisabled || '#BDBDBD', opacity: 0.7 },
        errorContainer: { backgroundColor: `${theme.colors.error}20`, padding: 12, borderRadius: 8, marginHorizontal: 12, marginBottom: 8, marginTop: 4, position: 'relative' },
        errorText: { color: theme.colors.error, textAlign: 'center', paddingRight: 20 },
        messageListContentContainer: { paddingBottom: 12, paddingTop: 8 },
        errorIconTouchable: { position: 'absolute', right: 8, top: 8, padding: 4 },
        emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        emptyChatText: { color: theme.colors.onSurfaceVariant, textAlign: 'center' },
        initialChoiceContainer: { padding: 16, margin: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8, alignItems: 'center' },
        initialChoiceText: { fontSize: 16, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 16 },
        initialChoiceButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
        modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
        modalContent: { width: '90%', maxHeight: '80%', backgroundColor: theme.colors.background, borderRadius: 10, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
        modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 15, textAlign: 'center' },
        modalSummaryText: { fontSize: 15, color: theme.colors.onSurfaceVariant, marginBottom: 20, lineHeight: 22 },
        modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
        modalScrollView: { maxHeight: '70%' }
    }), [theme]);

    // --- FUNÇÕES ---

    const saveChatState = useCallback(async (currentMessages: Content[], currentAdjustments: string[], ended: boolean) => {
        if (!STORAGE_KEY_CHAT || !STORAGE_KEY_ADJUSTMENTS || !STORAGE_KEY_CHAT_COMPLETED) return;
        try {
            const stateToSave = { messages: currentMessages, interactions: interactionsCount, adjustments: currentAdjustments, chatEnded: ended, timestamp: Date.now() };
            await AsyncStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(stateToSave));
            if (ended) await AsyncStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
            else await AsyncStorage.removeItem(STORAGE_KEY_CHAT_COMPLETED);
            console.log("[SaveChatState] Chat state saved.");
        } catch (error) { console.error("[SaveChatState] Error saving chat state:", error); }
    }, [userId, interactionsCount, STORAGE_KEY_CHAT, STORAGE_KEY_ADJUSTMENTS, STORAGE_KEY_CHAT_COMPLETED]);

    const getAICoachWelcomeText = (): string => {
        let text = "Entendido! Analisei suas respostas do questionário. ";
        text += `Estou pronto para anotar qualquer dúvida ou pedido especial que você tenha para o seu treino. `;
        if (MAX_INTERACTIONS > 0) text += `Você tem ${MAX_INTERACTIONS} interações para isso. O que gostaria de ajustar ou perguntar?`;
        else text += "Como posso te ajudar a personalizar seu treino?";
        return text;
    }

    const handleUserWantsToChat = useCallback(() => {
        console.log("[InitialChoice] User chose YES.");
        setShowInitialChoice(false);
        const welcomeText = getAICoachWelcomeText();
        const welcomeMessage: Content = { role: 'model', parts: [{ text: welcomeText }] };
        setMessages([welcomeMessage]);
        setInteractionsCount(0);
        setAdjustments([]);
        setIsChatEnded(false);
        saveChatState([welcomeMessage], [], false);
    }, [saveChatState]); // Removido getAICoachWelcomeText da dependência pois não depende de estado/props

    const handleUserDeclinesChat = useCallback(() => {
        console.log("[InitialChoice] User chose NO.");
        setShowInitialChoice(false);
        const confirmationText = "Ok! Vou preparar seu treino com base nas informações do questionário.";
        const confirmationMessage: Content = { role: 'system', parts: [{ text: confirmationText }] };
        setMessages([confirmationMessage]);
        setIsChatEnded(true);
        setInputText('');
        saveChatState([confirmationMessage], [], true);
        console.log("[InitialChoice] TODO: Navigate to the next screen.");
    }, [saveChatState]);

    const generateSummary = useCallback((): string => {
        let summary = "Resumo do Questionário:\n";
        summary += "- Suas respostas foram consideradas.\n";
        // Exemplo: summary += `- Objetivo: ${questionnaireData?.objetivo || 'Não informado'}\n`;
        summary += "\nAjustes/Perguntas feitas no chat:\n";
        if (adjustments.length > 0) {
            summary += adjustments.map(adj => `- ${adj}`).join('\n');
        } else {
            summary += "- Nenhuma interação adicional registrada.";
        }
        return summary;
    }, [questionnaireData, adjustments]);

    const handleEndChatPress = useCallback(() => {
        console.log("[EndChat] User pressed End Chat button.");
        const summary = generateSummary();
        setSummaryContent(summary);
        setIsSummaryModalVisible(true);
    }, [generateSummary]);

    const handleConfirmEndChat = useCallback(async () => {
        console.log("[EndChat] User confirmed End Chat (Generate Training).");
        setIsSummaryModalVisible(false);
        setIsChatEnded(true);
        const finalSystemMessage: Content = { role: 'system', parts: [{ text: "Chat finalizado. Preparando para gerar o treino..." }] };
        const finalMessages = [...messages, finalSystemMessage];
        setMessages(finalMessages);
        await saveChatState(finalMessages, adjustments, true);
        console.log("[EndChat] TODO: Navigate to training generation screen or start process.");
        // Exemplo: navigation.navigate('GenerateTraining', { questionnaireData, adjustments });
    }, [messages, adjustments, saveChatState]); // Adicionado navigation se for usar

    const handleCancelEndChat = useCallback(() => {
        console.log("[EndChat] User cancelled End Chat (Go Back).");
        setIsSummaryModalVisible(false);
    }, []);

    // --- EFEITOS ---
    useEffect(() => {
        const performInitialLoad = async () => {
            if (!userId || !STORAGE_KEY_QUESTIONNAIRE) { setIsInitializing(false); return; }
            console.log("[InitialLoad] Starting...");
            setIsInitializing(true); setChatError(null); setIsQuestionnaireReady(false); setShowInitialChoice(false);
            let loadedQuestionnaireData = null;
            try {
                const savedQuestionnaire = await AsyncStorage.getItem(STORAGE_KEY_QUESTIONNAIRE);
                if (savedQuestionnaire) loadedQuestionnaireData = JSON.parse(savedQuestionnaire);
                else if (route.params?.formData) { loadedQuestionnaireData = route.params.formData; await AsyncStorage.setItem(STORAGE_KEY_QUESTIONNAIRE, JSON.stringify(loadedQuestionnaireData)); }
                if (loadedQuestionnaireData) setQuestionnaireData(loadedQuestionnaireData);
                else throw new Error("Questionnaire data not found");
                const connected = await testClaudeApiConnection();
                setIsApiAvailable(connected); if (!connected) setChatError("O assistente de IA está indisponível.");
                setIsQuestionnaireReady(true);
            } catch (error: any) { console.error("[InitialLoad] Error:", error); setChatError("Falha ao inicializar."); setIsApiAvailable(false); if (loadedQuestionnaireData) setIsQuestionnaireReady(true); }
            finally { setIsInitializing(false); console.log("[InitialLoad] Finished."); }
        };
        performInitialLoad();
    }, [userId, route.params?.formData, STORAGE_KEY_QUESTIONNAIRE]);

    useEffect(() => {
        if (isInitializing || !isQuestionnaireReady || !userId || !STORAGE_KEY_CHAT) return;
        let isMounted = true;
        const loadHistoryOrPresentChoice = async () => {
            console.log("[LoadChatOrChoice] Attempting for user:", userId);
            setShowInitialChoice(false);
            try {
                const savedStateString = await AsyncStorage.getItem(STORAGE_KEY_CHAT);
                if (!isMounted) return;
                if (savedStateString) {
                    const savedState = JSON.parse(savedStateString);
                    if (savedState && Array.isArray(savedState.messages)) {
                        console.log("[LoadChatOrChoice] Saved state found, restoring.");
                        setMessages(savedState.messages);
                        setInteractionsCount(savedState.interactions ?? 0);
                        setAdjustments(savedState.adjustments ?? []);
                        setIsChatEnded(savedState.chatEnded ?? false);
                    } else {
                        console.log("[LoadChatOrChoice] Saved state invalid. Presenting initial choice.");
                        setIsChatEnded(false); setMessages([]); setShowInitialChoice(true);
                    }
                } else {
                    console.log("[LoadChatOrChoice] No history found. Presenting initial choice.");
                    setIsChatEnded(false); setMessages([]); setShowInitialChoice(true);
                }
            } catch (error) {
                console.error("[LoadChatOrChoice] Error:", error);
                if (isMounted) { setChatError("Não foi possível carregar o estado do chat."); setMessages([]); setIsChatEnded(false); setShowInitialChoice(false); }
            } finally { console.log("[LoadChatOrChoice] Process finished."); }
        };
        loadHistoryOrPresentChoice();
        return () => { isMounted = false; };
    }, [isInitializing, isQuestionnaireReady, userId, STORAGE_KEY_CHAT]);

    useEffect(() => {
        if (messages.length > 0 && flatListRef.current) {
            const timerId = setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 150);
            return () => clearTimeout(timerId);
        }
    }, [messages]);

    const handleSendMessage = useCallback(async () => {
        const trimmedInput = inputText.trim();
        if (!trimmedInput || isLoadingAi || isChatEnded || !isApiAvailable || !userId || !questionnaireData || !STORAGE_KEY_CHAT) return;
        const userMessageText = trimmedInput;
        const newUserMessage: Content = { role: 'user', parts: [{ text: userMessageText }] };
        const currentMessages = messages; const currentAdjustments = adjustments; const currentInteractions = interactionsCount;
        const updatedMessages = [...currentMessages, newUserMessage];
        const newInteractionsCount = currentInteractions + 1; const updatedAdjustments = [...currentAdjustments, userMessageText];
        setMessages(updatedMessages); setInputText(''); setIsLoadingAi(true); setChatError(null); setInteractionsCount(newInteractionsCount); setAdjustments(updatedAdjustments);
        let chatIsEnding = newInteractionsCount >= MAX_INTERACTIONS;
        await saveChatState(updatedMessages, updatedAdjustments, chatIsEnding);
        try {
            console.log("[HandleSend] Calling Claude API...");
            const historyForApi = updatedMessages.slice(0, -1).filter(msg => msg.role !== 'system' && !(msg.role === 'model' && msg.parts[0]?.text?.startsWith('Desculpe,'))).map(msg => ({ role: msg.role, parts: msg.parts?.map(part => ({ text: part.text ?? '' })) ?? [{ text: '' }] }));
            const aiResponseText = await callClaudeApi(userMessageText, historyForApi, questionnaireData, updatedAdjustments);
            console.log("[HandleSend] API response received.");
            let finalAiResponseText = aiResponseText;
            if (chatIsEnding) { finalAiResponseText += `\n\n(Limite de ${MAX_INTERACTIONS} interações atingido. Chat encerrado.)`; setIsChatEnded(true); }
            const aiMessage: Content = { role: 'model', parts: [{ text: finalAiResponseText }] };
            const finalMessages = [...updatedMessages, aiMessage];
            setMessages(finalMessages); await saveChatState(finalMessages, updatedAdjustments, chatIsEnding);
        } catch (error: any) {
            console.error("[HandleSend] Error calling Claude API:", error);
            const errorMessage = error.message || "Ocorreu um erro."; const errorAiMessage: Content = { role: 'model', parts: [{ text: `Desculpe, ocorreu um erro: ${errorMessage}` }] };
            setMessages([...updatedMessages, errorAiMessage]); setChatError(`Erro de comunicação: ${errorMessage}`);
            setInteractionsCount(currentInteractions); setAdjustments(currentAdjustments); setIsChatEnded(currentInteractions >= MAX_INTERACTIONS);
        } finally { setIsLoadingAi(false); console.log("[HandleSend] Message processing complete."); }
    }, [ inputText, isLoadingAi, isChatEnded, isApiAvailable, userId, questionnaireData, messages, interactionsCount, adjustments, saveChatState, STORAGE_KEY_CHAT ]);

    const renderMessage = useCallback(({ item, index }: { item: Content, index: number }) => {
        const isUser = item.role === 'user'; const isSystem = item.role === 'system';
        let messageText: string = '[Mensagem inválida]';
        try { if (item && Array.isArray(item.parts) && item.parts.length > 0 && item.parts[0] && typeof item.parts[0].text === 'string') messageText = item.parts[0].text; else console.warn(`[renderMessage ${index}] Formato inesperado:`, JSON.stringify(item)); }
        catch (e) { console.error(`[renderMessage ${index}] Erro: `, e, JSON.stringify(item)); }
        const bubbleStyle = isUser ? styles.userBubble : (isSystem ? styles.systemBubble : styles.aiBubble);
        const textStyle = isUser ? styles.userMessageText : (isSystem ? styles.systemMessageText : styles.aiMessageText);
        return ( <View key={`msg-${index}`} style={[ styles.messageBubble, bubbleStyle ]}><Text style={textStyle}>{messageText}</Text></View> ); // Adicionado key para segurança
    }, [styles]);

    // --- RENDERIZAÇÃO ---
    if (isInitializing) { return <SafeAreaView style={styles.safeArea}><View style={styles.loadingContainer}><ActivityIndicator size="large" color={theme.colors.primary} /><Text style={styles.loadingText}>Inicializando chat...</Text></View></SafeAreaView>; }
    if (!questionnaireData) { return <SafeAreaView style={styles.safeArea}><View style={styles.loadingContainer}><Feather name="alert-triangle" size={40} color={theme.colors.error} /><Text style={[styles.loadingText, { color: theme.colors.error, marginTop: 15 }]}>{chatError || "Erro crítico: Não foi possível carregar os dados."}</Text></View></SafeAreaView>; }

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} >
                {/* Cabeçalho */}
                <View style={styles.headerContainer}>
                   <Text style={styles.headerTitle}>Ajustes do Treino</Text>
                    {!isChatEnded && isApiAvailable && MAX_INTERACTIONS > 0 && (
                        <Text style={styles.interactionsLeft}>
                            {Math.max(0, MAX_INTERACTIONS - interactionsCount)} {MAX_INTERACTIONS - interactionsCount === 1 ? 'interação restante' : 'interações restantes'}
                        </Text>
                    )}
                </View>

                {/* Área de Mensagens e Input */}
                <View style={styles.contentContainer}>
                    <FlatList ref={flatListRef} data={messages} renderItem={renderMessage} keyExtractor={(_, index) => `msg-${userId || 'nouser'}-${index}`} style={styles.listContainer} contentContainerStyle={styles.messageListContentContainer} />

                    {/* Área de Escolha Inicial */}
                    {showInitialChoice && (
                        <View style={styles.initialChoiceContainer}>
                            <Text style={styles.initialChoiceText}>
                                Seu questionário foi recebido! Antes de gerar seu plano de treino, você gostaria de fazer alguma pergunta ou adicionar alguma observação/preferência?
                            </Text>
                            <View style={styles.initialChoiceButtons}>
                                <Button title="Sim, quero ajustar/perguntar" onPress={handleUserWantsToChat} color={theme.colors.primary} disabled={!isApiAvailable} />
                                <Button title="Não, pode gerar o treino" onPress={handleUserDeclinesChat} color={theme.colors.primary} />
                            </View>
                             {!isApiAvailable && chatError && ( <Text style={[styles.errorText, {marginTop: 10, paddingRight: 0}]}>{chatError}</Text> )}
                        </View>
                    )}

                    {/* Mensagem de Erro Não Fatal */}
                    {chatError && !showInitialChoice && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{chatError}</Text>
                            <TouchableOpacity onPress={() => setChatError(null)} style={styles.errorIconTouchable} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Feather name="x-circle" size={16} color={theme.colors.error} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Input de Texto e Botões */}
                    {!isChatEnded && !showInitialChoice && (
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                value={inputText}
                                onChangeText={setInputText}
                                placeholder={!isApiAvailable ? "Assistente indisponível." : "Digite sua pergunta ou ajuste..."}
                                placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
                                editable={!isLoadingAi && isApiAvailable === true}
                                multiline
                                maxLength={500}
                                selectionColor={theme.colors.primary}
                            />
                            <View style={styles.inputActionsContainer}>
                                <TouchableOpacity
                                    style={[ styles.actionButton, styles.endChatButton, (isLoadingAi || !isApiAvailable) && styles.actionButtonDisabled ]}
                                    onPress={handleEndChatPress}
                                    disabled={isLoadingAi || !isApiAvailable}
                                >
                                    <Feather name="check-circle" size={20} color={theme.colors.onSecondary || 'white'} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[ styles.actionButton, styles.sendButton, (isLoadingAi || !inputText.trim() || !isApiAvailable) && styles.actionButtonDisabled ]}
                                    onPress={handleSendMessage}
                                    disabled={isLoadingAi || !inputText.trim() || !isApiAvailable}
                                >
                                    {isLoadingAi ? <ActivityIndicator size="small" color={theme.colors.onPrimary || 'white'} /> : <Feather name="send" size={20} color={theme.colors.onPrimary || 'white'} />}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                     {/* Mensagem Final */}
                     {isChatEnded && !showInitialChoice && messages.length > 0 && (
                         <View style={styles.inputContainer}>
                             <Text style={[styles.systemMessageText, { flex: 1, textAlign: 'center', paddingVertical: 10 }]}>
                                 {messages[messages.length - 1]?.parts[0]?.text || "Chat encerrado."}
                             </Text>
                         </View>
                     )}
                </View>

                {/* Modal de Resumo */}
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={isSummaryModalVisible}
                    onRequestClose={() => { setIsSummaryModalVisible(false); }}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Confirmar Finalização</Text>
                            <ScrollView style={styles.modalScrollView}>
                                <Text style={styles.modalSummaryText}>{summaryContent}</Text>
                            </ScrollView>
                            <View style={styles.modalActions}>
                                <Button title="Voltar ao Chat" onPress={handleCancelEndChat} color={theme.colors.onSurfaceVariant} />
                                <Button title="Gerar Treinamento" onPress={handleConfirmEndChat} color={theme.colors.primary} />
                            </View>
                        </View>
                    </View>
                </Modal>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default PostQuestionnaireChat;