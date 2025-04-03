export default PostQuestionnaireChat;// src/screens/PostQuestionnaireChat.tsx
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
    Alert, // Keep Alert if needed elsewhere
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
// Assuming a similar structure for messages, keep Content or define a new shared type
// If Claude's SDK provides a specific type you want to use directly, import it here.
// For now, we'll keep the existing structure assuming the service adapts it.
type Content = { role: 'user' | 'model'; parts: { text: string }[] };
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
// --- CHANGE: Import Claude service instead of Gemini ---
import { callClaudeApi, testClaudeApiConnection } from '../services/api/claudeService'; // Adjust path if needed
import { useAuth } from '../contexts/AuthContext'; // Verify path

// Constants remain the same
const MAX_INTERACTIONS = 3;
const STORAGE_KEY_CHAT_PREFIX = '@chat_messages_';
const STORAGE_KEY_QUESTIONNAIRE_PREFIX = '@questionnaire_data_';
const STORAGE_KEY_ADJUSTMENTS_PREFIX = '@chat_adjustments_';
const STORAGE_KEY_CHAT_COMPLETED_PREFIX = '@chat_completed_';

// Interface for route parameters remains the same
type ChatScreenRouteParams = {
    formData?: any;
};

// Navigation type remains the same conceptually
// type NavigationProps = StackNavigationProp<YourRootStackParamList, 'PostQuestionnaireChat'>;

const PostQuestionnaireChat = () => {
    const theme = useTheme();
    const route = useRoute<RouteProp<{ params: ChatScreenRouteParams }, 'params'>>();
    const navigation = useNavigation(); // Use appropriate navigation hook
    const { user } = useAuth();

    // Refs remain the same
    const flatListRef = useRef<FlatList<Content>>(null);

    // States remain the same
    const [messages, setMessages] = useState<Content[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [isRestoringChat, setIsRestoringChat] = useState(true);
    const [isCheckingApi, setIsCheckingApi] = useState(true);
    const [isApiAvailable, setIsApiAvailable] = useState<boolean | null>(null);
    const [interactionsCount, setInteractionsCount] = useState(0);
    const [isChatEnded, setIsChatEnded] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [questionnaireData, setQuestionnaireData] = useState<any>(null);
    const [adjustments, setAdjustments] = useState<string[]>([]);

    // Storage keys derivation remains the same
    const userId = user?.id;
    const STORAGE_KEY_CHAT = userId ? `${STORAGE_KEY_CHAT_PREFIX}${userId}` : null;
    const STORAGE_KEY_QUESTIONNAIRE = userId ? `${STORAGE_KEY_QUESTIONNAIRE_PREFIX}${userId}` : null;
    const STORAGE_KEY_ADJUSTMENTS = userId ? `${STORAGE_KEY_ADJUSTMENTS_PREFIX}${userId}` : null;
    const STORAGE_KEY_CHAT_COMPLETED = userId ? `${STORAGE_KEY_CHAT_COMPLETED_PREFIX}${userId}` : null;

    // Styles remain the same
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
        userMessageText: { color: theme.colors.onPrimary || '#FFFF', fontSize: 16 },
        aiMessageText: { color: theme.colors.onSurfaceVariant, fontSize: 16 },
        inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.outline, backgroundColor: theme.colors.surface },
        input: { flex: 1, backgroundColor: theme.colors.surfaceVariant, borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 8, color: theme.colors.onSurfaceVariant, maxHeight: 100, fontSize: 16, marginRight: 8 },
        sendButton: { backgroundColor: theme.colors.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
        sendButtonDisabled: { backgroundColor: theme.colors.surfaceDisabled || '#BDBDBD', opacity: 0.7 },
        errorContainer: { backgroundColor: `${theme.colors.error}20`, padding: 12, borderRadius: 8, marginHorizontal: 12, marginBottom: 8, marginTop: 4, position: 'relative' },
        errorText: { color: theme.colors.error, textAlign: 'center', paddingRight: 20 },
        skipButtonContainer: { paddingLeft: 10 },
        skipButtonText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 16 },
        messageListContentContainer: { paddingBottom: 12, paddingTop: 8 },
        errorIconTouchable: { position: 'absolute', right: 8, top: 8, padding: 4 },
        emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        emptyChatText: { color: theme.colors.onSurfaceVariant, textAlign: 'center' },
    }), [theme]);

    // --- FUNCTIONS ---

    // saveChatState remains the same
    const saveChatState = useCallback(async (currentMessages: Content[], currentAdjustments: string[], ended: boolean) => {
        if (!STORAGE_KEY_CHAT || !STORAGE_KEY_ADJUSTMENTS || !STORAGE_KEY_CHAT_COMPLETED) {
            console.warn("[SaveChatState] Storage keys unavailable (no userId?).");
            return;
        };
        try {
            const stateToSave = {
                messages: currentMessages,
                interactions: interactionsCount,
                adjustments: currentAdjustments,
                chatEnded: ended,
                timestamp: Date.now(),
            };
            await AsyncStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(stateToSave));
            if (ended) {
                await AsyncStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
            } else {
                await AsyncStorage.removeItem(STORAGE_KEY_CHAT_COMPLETED);
            }
            console.log("[SaveChatState] Chat state saved.");
        } catch (error) {
            console.error("[SaveChatState] Error saving chat state:", error);
        }
    }, [userId, interactionsCount, STORAGE_KEY_CHAT, STORAGE_KEY_ADJUSTMENTS, STORAGE_KEY_CHAT_COMPLETED]);

    // generateWelcomeMessage remains the same
    const generateWelcomeMessage = useCallback(() => {
        if (!questionnaireData) return;

        let initialMessageText = "Olá! Analisei suas respostas do questionário. ";
        if (MAX_INTERACTIONS > 0) {
            initialMessageText += `Você tem ${MAX_INTERACTIONS} interações para refinar ou perguntar sobre os resultados. Como posso ajudar?`;
        } else {
            initialMessageText += "Como posso ajudar com base nas suas respostas?";
        }

        const welcomeMessage: Content = {
            role: 'model',
            parts: [{ text: initialMessageText }],
        };
        setMessages([welcomeMessage]);
        console.log("[LoadChatState] Welcome message generated.");
    }, [questionnaireData]);

    // loadChatState remains the same logic, just uses the derived keys
    const loadChatState = useCallback(async () => {
        if (!userId || !STORAGE_KEY_CHAT || !STORAGE_KEY_QUESTIONNAIRE || !STORAGE_KEY_CHAT_COMPLETED || !STORAGE_KEY_ADJUSTMENTS) {
            console.warn("[LoadChatState] Storage keys or userId unavailable. Aborting load.");
            setIsRestoringChat(false);
            return;
        }
        console.log("[LoadChatState] Attempting to load state for user:", userId);
        setIsRestoringChat(true);

        try {
            const [savedStateString, savedQuestionnaire, chatCompleted, savedAdjustments] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEY_CHAT),
                AsyncStorage.getItem(STORAGE_KEY_QUESTIONNAIRE),
                AsyncStorage.getItem(STORAGE_KEY_CHAT_COMPLETED),
                AsyncStorage.getItem(STORAGE_KEY_ADJUSTMENTS)
            ]);

            let loadedQuestionnaireData = null;
            if (savedQuestionnaire) {
                loadedQuestionnaireData = JSON.parse(savedQuestionnaire);
                console.log("[LoadChatState] Questionnaire data loaded from AsyncStorage.");
            } else if (route.params?.formData) {
                loadedQuestionnaireData = route.params.formData;
                console.log("[LoadChatState] Using questionnaire data from route params.");
                await AsyncStorage.setItem(STORAGE_KEY_QUESTIONNAIRE, JSON.stringify(loadedQuestionnaireData));
            } else {
                console.error("[LoadChatState] No questionnaire data found! Cannot proceed.");
                setChatError("Error: Questionnaire data not found.");
                setIsRestoringChat(false);
                return;
            }
            setQuestionnaireData(loadedQuestionnaireData);

            const isAlreadyCompleted = chatCompleted === 'true';
            setIsChatEnded(isAlreadyCompleted);

            if (savedStateString) {
                const savedState = JSON.parse(savedStateString);
                if (savedState && Array.isArray(savedState.messages) && savedState.messages.length > 0) {
                    console.log("[LoadChatState] Saved state found. Restoring.");
                    setMessages(savedState.messages);
                    setInteractionsCount(savedState.interactions ?? 0);
                    setAdjustments(savedState.adjustments ?? []);
                    setIsChatEnded(savedState.chatEnded ?? isAlreadyCompleted);
                } else {
                    console.log("[LoadChatState] Saved state empty or invalid. Generating welcome message.");
                    if (!isAlreadyCompleted) {
                        generateWelcomeMessage();
                    } else {
                        console.log("[LoadChatState] Chat already completed, no welcome message.")
                    }
                }
            } else {
                console.log("[LoadChatState] No saved state found.");
                if (!isAlreadyCompleted) {
                    generateWelcomeMessage();
                } else {
                    console.log("[LoadChatState] Chat already completed, no saved state, no welcome message.")
                }
            }

            if (savedAdjustments && (!savedStateString || !savedState?.adjustments)) {
                try {
                    const parsedAdjustments = JSON.parse(savedAdjustments);
                    if (Array.isArray(parsedAdjustments)) {
                        setAdjustments(parsedAdjustments);
                        console.log("[LoadChatState] Adjustments loaded from separate key (fallback).");
                    }
                } catch (adjError){
                    console.warn("[LoadChatState] Error parsing adjustments from separate key:", adjError);
                }
            }

        } catch (error) {
            console.error("[LoadChatState] Error loading chat state:", error);
            setChatError("Could not load chat history.");
            if (questionnaireData && !isChatEnded) {
                generateWelcomeMessage();
            }
        } finally {
            setIsRestoringChat(false);
            console.log("[LoadChatState] Restoration complete.");
        }
    }, [userId, route.params?.formData, generateWelcomeMessage, STORAGE_KEY_CHAT, STORAGE_KEY_QUESTIONNAIRE, STORAGE_KEY_CHAT_COMPLETED, STORAGE_KEY_ADJUSTMENTS]);

    // --- CHANGE: Use Claude API connection test ---
    const checkApi = useCallback(async () => {
        console.log("[CheckApi] Checking connection with the Claude API..."); // Update comment
        setIsCheckingApi(true);
        setChatError(null);
        try {
            // --- CHANGE: Call Claude's test function ---
            const connected = await testClaudeApiConnection();
            setIsApiAvailable(connected);
            console.log("[CheckApi] Claude API status:", connected); // Update comment
            if (!connected) {
                setChatError("The AI assistant is currently unavailable.");
            }
        } catch (error: any) {
            console.error("[CheckApi] Error checking API:", error);
            setIsApiAvailable(false);
            // Adjust error message based on potential Claude API errors if needed
            const errorMessage = error?.message?.includes('authentication_error') // Example Claude error
                ? "Invalid API key."
                : "Failed to connect with the AI assistant.";
            setChatError(errorMessage);
        } finally {
            setIsCheckingApi(false);
            console.log("[CheckApi] API check completed.");
        }
    }, []); // Dependencies remain empty as it should run once

    // Effect for initial load and API check remains the same
    useEffect(() => {
        checkApi();
        loadChatState();
    }, [checkApi, loadChatState]);

    // Effect for scrolling remains the same
    useEffect(() => {
        if (messages.length > 0 && flatListRef.current) {
            const timerId = setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 150);
            return () => clearTimeout(timerId);
        }
    }, [messages]);

    // --- CHANGE: Use Claude API call ---
    const handleSendMessage = useCallback(async () => {
        const trimmedInput = inputText.trim();
        if (!trimmedInput || isLoadingAi || isChatEnded || !isApiAvailable || !userId || !questionnaireData || !STORAGE_KEY_CHAT) {
            console.log("[HandleSend] Send blocked:", { input: !trimmedInput, loading: isLoadingAi, ended: isChatEnded, api: isApiAvailable, uid: !!userId, qData: !!questionnaireData, storage: !!STORAGE_KEY_CHAT });
            return;
        }

        const userMessageText = trimmedInput;
        const newUserMessage: Content = { role: 'user', parts: [{ text: userMessageText }] };

        const updatedMessages = [...messages, newUserMessage];
        const newInteractionsCount = interactionsCount + 1;
        const updatedAdjustments = [...adjustments, userMessageText];

        setMessages(updatedMessages);
        setInputText('');
        setIsLoadingAi(true);
        setChatError(null);
        setInteractionsCount(newInteractionsCount);
        setAdjustments(updatedAdjustments);

        let chatIsEnding = newInteractionsCount >= MAX_INTERACTIONS;

        // Save state before API call
        await saveChatState(updatedMessages, updatedAdjustments, chatIsEnding);

        try {
            console.log("[HandleSend] Calling Claude API..."); // Update comment

            // Prepare history for the API. Claude might need a different format.
            // Assuming `claudeService` handles the conversion from `Content[]`
            // to the format Claude expects (e.g., alternating user/assistant messages).
            // We still filter out previous error messages.
            const historyForApi = updatedMessages
                .filter(msg => !(msg.role === 'model' && msg.parts[0]?.text?.startsWith('Sorry, an error occurred:'))) // Filter previous errors
                .map(msg => ({
                    role: msg.role,
                    // Ensure parts is an array and text is a string, matching 'Content' type
                    parts: msg.parts?.map(part => ({ text: part.text ?? '' })) ?? [{ text: '' }]
                }));

            // Remove the last message (current user input) before sending history
            historyForApi.pop();

            // --- CHANGE: Call Claude API ---
            // Pass the necessary data. `claudeService` needs to know how to use these.
            const aiResponseText = await callClaudeApi(userMessageText, historyForApi, questionnaireData, updatedAdjustments);
            console.log("[HandleSend] API response received.");

            let finalAiResponseText = aiResponseText;
            if (chatIsEnding) {
                finalAiResponseText += `\n\n(Limit of ${MAX_INTERACTIONS} interactions reached. Chat ended.)`;
                setIsChatEnded(true);
            }
            const aiMessage: Content = { role: 'model', parts: [{ text: finalAiResponseText }] };

            const finalMessages = [...updatedMessages, aiMessage];
            setMessages(finalMessages);

            // Save final state
            await saveChatState(finalMessages, updatedAdjustments, chatIsEnding);

        } catch (error: any) {
            console.error("[HandleSend] Error calling Claude API:", error); // Update comment
            // Adjust error message based on potential Claude API errors
            const errorMessage = error.message?.includes('rate_limit_error') ? "Rate limit exceeded. Please try again later." : // Example Claude error
                                 error.message?.includes('invalid_request_error') ? "Invalid request sent to the assistant." : // Example Claude error
                                 error.message || "An error occurred while processing your request.";

            const errorAiMessage: Content = { role: 'model', parts: [{ text: `Sorry, an error occurred: ${errorMessage}` }] };
            setMessages([...updatedMessages, errorAiMessage]);
            setChatError(`Communication error: ${errorMessage}`);

            // Revert local state counts/adjustments on error
            setInteractionsCount(interactionsCount);
            setAdjustments(adjustments);

            // Do not save state with the API error message.
        } finally {
            setIsLoadingAi(false);
            console.log("[HandleSend] Message processing complete.");
        }
    }, [
        inputText, isLoadingAi, isChatEnded, isApiAvailable, userId, questionnaireData,
        messages, interactionsCount, adjustments, saveChatState,
        STORAGE_KEY_CHAT
    ]);

    // renderMessage remains the same as it depends on the 'Content' structure
    const renderMessage = useCallback(({ item, index }: { item: Content, index: number }) => {
        const isUser = item.role === 'user';
        let messageText: string = '[Invalid message]';

        try {
            // Check if parts exist, is an array, has items, first item exists, and text is a string
            if (item && Array.isArray(item.parts) && item.parts.length > 0 && item.parts[0] && typeof item.parts[0].text === 'string') {
                messageText = item.parts[0].text;
            } else {
                console.warn(`[renderMessage ${index}] Unexpected message format:`, JSON.stringify(item));
            }
        } catch (e) {
            console.error(`[renderMessage ${index}] Error processing message text: `, e);
            console.error(`[renderMessage ${index}] Problematic item: `, JSON.stringify(item));
        }

        return (
            <View style={[ styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble ]}>
                <Text style={isUser ? styles.userMessageText : styles.aiMessageText}>
                    {messageText}
                </Text>
            </View>
        );
    }, [styles]); // Only styles dependency

    // --- RENDER ---

    // Initial loading UI remains the same
    if (isRestoringChat || isCheckingApi) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>
                        {isRestoringChat ? "Loading chat..." : "Checking assistant..."}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // Fatal error UI remains the same
    if (!questionnaireData && !isRestoringChat) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <Feather name="alert-triangle" size={40} color={theme.colors.error} />
                    <Text style={[styles.loadingText, { color: theme.colors.error, marginTop: 15 }]}>
                        Critical error: Could not load essential data to start the chat.
                    </Text>
                    {/* Consider adding a retry or back button here */}
                </View>
            </SafeAreaView>
        );
    }

    // Main chat UI structure remains the same
    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Adjust offset if needed
            >
                {/* Header */}
                <View style={styles.headerContainer}>
                    <Text style={styles.headerTitle}>AI Assistant</Text>
                    {!isChatEnded && isApiAvailable && MAX_INTERACTIONS > 0 && (
                        <Text style={styles.interactionsLeft}>
                            {Math.max(0, MAX_INTERACTIONS - interactionsCount)} {MAX_INTERACTIONS - interactionsCount === 1 ? 'interaction left' : 'interactions left'}
                        </Text>
                    )}
                    {/* Optional Skip/Complete Button */}
                </View>

                {/* Messages Area & Input */}
                <View style={styles.contentContainer}>
                    {/* Message List */}
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(_, index) => `msg-${userId || 'nouser'}-${index}`}
                        style={styles.listContainer}
                        contentContainerStyle={styles.messageListContentContainer}
                        ListEmptyComponent={() => (
                            !isLoadingAi && messages.length === 0 && (
                                <View style={styles.emptyChatContainer}>
                                    <Text style={styles.emptyChatText}>
                                        {isApiAvailable === false ? "Assistant unavailable at the moment." :
                                        isChatEnded ? "The chat has ended." :
                                        "Send your first question or adjustment."}
                                    </Text>
                                </View>
                            )
                        )}
                    />

                    {/* Non-fatal Error Message */}
                    {chatError && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{chatError}</Text>
                            <TouchableOpacity
                                onPress={() => setChatError(null)}
                                style={styles.errorIconTouchable}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Feather name="x-circle" size={16} color={theme.colors.error} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Text Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={inputText}
                            onChangeText={setInputText}
                            placeholder={
                                isChatEnded ? "Chat ended." :
                                isApiAvailable === false ? "Assistant unavailable." :
                                !isApiAvailable ? "Checking assistant..." :
                                "Type your question or adjustment..."
                            }
                            placeholderTextColor={theme.colors.onSurfaceVariant + '80'}
                            editable={!isLoadingAi && !isChatEnded && isApiAvailable === true}
                            multiline
                            maxLength={500} // Adjust max length if needed
                            selectionColor={theme.colors.primary}
                            autoFocus={false}
                        />
                        <TouchableOpacity
                            style={[
                                styles.sendButton,
                                (isLoadingAi || !inputText.trim() || isChatEnded || isApiAvailable !== true) && styles.sendButtonDisabled
                            ]}
                            onPress={handleSendMessage}
                            disabled={isLoadingAi || !inputText.trim() || isChatEnded || isApiAvailable !== true}
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