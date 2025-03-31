// src/screens/onboarding/ChatScreen.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList, // Use FlatList for better performance
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

// Placeholder for the actual API call function
import { callGeminiApi } from '../../services/geminiService'; // We will create this file/function next

import { theme } from '../../theme';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: number;
}

// Define the type for route params if needed (e.g., passing questionnaire data)
// type ChatScreenRouteParams = {
//   questionnaireData: any; // Define the actual type of your questionnaire data
// };

const MAX_INTERACTIONS = 2; // Limit to 2 user messages

const ChatScreen = () => {
    // const route = useRoute<RouteProp<Record<string, ChatScreenRouteParams>, string>>(); // Example if using route params
    const navigation = useNavigation();

    // const questionnaireData = route.params?.questionnaireData || {}; // Get data from params or Redux
    const questionnaireData = { /* Placeholder: Replace with actual data */
        nome: "Usuário Teste",
        objetivo: "hipertrofia",
        trainingDays: ["seg", "qua", "sex"],
        averageTrainingTime: 60,
        includeCardio: true,
        includeStretching: false,
        experienciaTreino: "intermediario",
        temLesoes: false,
    };

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interactionCount, setInteractionCount] = useState(0);
    const [isChatEnded, setIsChatEnded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [extractedData, setExtractedData] = useState<any>(null); // To store data extracted by AI

    const flatListRef = useRef<FlatList>(null);

    // Add initial AI message
    useEffect(() => {
        setMessages([
            {
                id: 'initial-ai-message',
                text: `Olá ${questionnaireData.nome || 'usuário'}! Analisei seu questionário. Antes de gerar seu plano, você gostaria de me perguntar algo sobre o processo ou adicionar algum detalhe/preferência importante? (Você tem ${MAX_INTERACTIONS} interações)`,
                sender: 'ai',
                timestamp: Date.now(),
            },
        ]);
    }, [questionnaireData.nome]);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
        }
    }, [messages]);

    const handleSend = useCallback(async () => {
        const trimmedInput = inputText.trim();
        if (!trimmedInput || isLoading || isChatEnded) {
            return;
        }

        const newUserMessage: Message = {
            id: `user-${Date.now()}`,
            text: trimmedInput,
            sender: 'user',
            timestamp: Date.now(),
        };

        // Update UI immediately
        setMessages(prev => [...prev, newUserMessage]);
        setInputText('');
        setIsLoading(true);
        setError(null);
        const currentInteraction = interactionCount + 1;
        setInteractionCount(currentInteraction);

        try {
            // Prepare history for API (simplified: last N messages or format as needed by API)
            const historyForApi = messages.map(msg => ({
                role: msg.sender === 'ai' ? 'model' : 'user',
                parts: [{ text: msg.text }],
            }));
            historyForApi.push({ // Add the new user message to the history being sent
                 role: 'user',
                 parts: [{ text: trimmedInput }],
             });


            // Call the Gemini API service function
            const apiResponse = await callGeminiApi(
                historyForApi, // Pass the prepared history
                questionnaireData,
                MAX_INTERACTIONS,
                currentInteraction
            );

            const aiResponseText = apiResponse.text || "Desculpe, não consegui processar sua solicitação."; // Default text
            // Store extracted data if available
            if (apiResponse.extractedData) {
                setExtractedData(prev => ({ ...(prev || {}), ...(apiResponse.extractedData || {})}));
            }

             const newAiMessage: Message = {
                 id: `ai-${Date.now()}`,
                 text: aiResponseText,
                 sender: 'ai',
                 timestamp: Date.now(),
             };
             setMessages(prev => [...prev, newAiMessage]);

             if (currentInteraction >= MAX_INTERACTIONS) {
                 setIsChatEnded(true);
                 // Optionally add a final closing message from AI after a small delay
                 setTimeout(() => {
                    const finalMessage: Message = {
                         id: `ai-final-${Date.now()}`,
                         text: "Chegamos ao limite de interações. Vou usar tudo que conversamos para gerar seu plano inicial agora!",
                         sender: 'ai',
                         timestamp: Date.now(),
                     };
                     setMessages(prev => [...prev, finalMessage]);
                 }, 500);
             }

        } catch (apiError: any) {
            console.error("API Error:", apiError);
            const errorMsg = apiError.message || 'Ocorreu um erro ao contatar o assistente.';
            setError(errorMsg);
            const errorAiMessage: Message = {
                id: `ai-error-${Date.now()}`,
                text: `Desculpe, tive um problema: ${errorMsg}. Tente novamente mais tarde ou pule esta etapa.`,
                sender: 'ai',
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errorAiMessage]);
            // Potentially allow user to retry or end chat here
            setIsChatEnded(true); // End chat on error for simplicity now
        } finally {
            setIsLoading(false);
        }

    }, [inputText, isLoading, isChatEnded, messages, interactionCount, questionnaireData]);

    const handleSkipOrEnd = () => {
        // Navigate to the next step (Plan Generation / Main App)
        // Pass the questionnaireData and any extractedData
        console.log("Skipping/Ending Chat. Extracted Data:", extractedData);
        // Example navigation:
        navigation.navigate('PlanGenerationScreen', { // Or directly to MainNavigator if plan gen is background
             questionnaireData: questionnaireData,
             chatAdjustments: extractedData
        });
        // Or if navigating back or resetting stack:
        // navigation.goBack(); or navigation.reset(...)
    };

    const renderMessage = ({ item }: { item: Message }) => (
        <View
            style={[
                styles.messageBubble,
                item.sender === 'user' ? styles.userMessage : styles.aiMessage,
            ]}
        >
            <Text style={styles.messageText}>{item.text}</Text>
            {/* Optional: Add timestamp */}
            {/* <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text> */}
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Adjust offset as needed
            >
                {/* Header (Optional) */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Chat com ForcaAI</Text>
                     <TouchableOpacity onPress={handleSkipOrEnd}>
                         <Text style={styles.skipButton}>{isChatEnded ? "Finalizar" : "Pular"}</Text>
                     </TouchableOpacity>
                </View>

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.messageListContent}
                    // inverted // Often used in chats, but requires reversing the data array
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={isChatEnded ? "Chat encerrado" : "Digite sua mensagem ou dúvida..."}
                        placeholderTextColor={theme.colors.textSecondary}
                        editable={!isLoading && !isChatEnded}
                        multiline
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (isLoading || isChatEnded || !inputText.trim()) && styles.sendButtonDisabled]}
                        onPress={handleSend}
                        disabled={isLoading || isChatEnded || !inputText.trim()}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color={theme.colors.background} />
                        ) : (
                            <Feather name="send" size={20} color={theme.colors.background} />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};


const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.regular,
        paddingVertical: theme.spacing.small,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerTitle: {
        color: theme.colors.text,
        fontSize: theme.typography.sizes.large,
        fontWeight: 'bold',
    },
    skipButton: {
        color: theme.colors.primary,
        fontSize: theme.typography.sizes.regular,
        fontWeight: 'bold',
    },
    messageListContent: {
        padding: theme.spacing.regular,
    },
    messageBubble: {
        maxWidth: '80%',
        padding: theme.spacing.small,
        borderRadius: theme.borderRadius.medium,
        marginBottom: theme.spacing.small,
    },
    userMessage: {
        backgroundColor: theme.colors.primary, // User messages in primary color
        alignSelf: 'flex-end',
    },
    aiMessage: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)', // AI messages slightly different bg
        alignSelf: 'flex-start',
    },
    messageText: {
        color: theme.colors.text, // Default text color for AI messages
        fontSize: theme.typography.sizes.regular,
    },
     // Override text color for user message bubble if needed
     // userMessage > messageText: { color: theme.colors.background }, // Uncomment if primary bg needs dark text
    timestamp: {
        fontSize: theme.typography.sizes.extraSmall,
        color: theme.colors.textSecondary,
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: theme.spacing.regular,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center', // Align items vertically
    },
    input: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        color: theme.colors.text,
        paddingHorizontal: theme.spacing.regular,
        paddingVertical: theme.spacing.small,
        borderRadius: theme.borderRadius.large, // Rounded input
        fontSize: theme.typography.sizes.regular,
        marginRight: theme.spacing.small,
        maxHeight: 100, // Limit height for multiline
    },
    sendButton: {
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.small + 2, // Make it slightly larger padding
        borderRadius: theme.borderRadius.large, // Circular button
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: 'rgba(235, 255, 0, 0.5)', // Dimmed primary color
    },
     errorText: {
        color: theme.colors.error,
        textAlign: 'center',
        padding: theme.spacing.small,
    },
});

export default ChatScreen;