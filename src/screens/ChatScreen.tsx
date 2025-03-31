// src/screens/onboarding/ChatScreen.tsx (Refatorado)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'; // <<< Adicionar useMemo
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
import { useRoute, useNavigation, useTheme } from '@react-navigation/native'; // <<< Adicionar useTheme
// ^^^ IMPORTANTE: Se você estiver usando outra biblioteca de tema (ex: React Native Paper),
// importe o useTheme dela (ex: import { useTheme } from 'react-native-paper';)
import { Feather } from '@expo/vector-icons';

// Placeholder for the actual API call function
import { callGeminiApi } from '../services/api/geminiService'; // Ajuste o caminho se necessário
// REMOVIDO: import { theme } from '../theme'; // <<< Não importar mais diretamente

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: number;
}

// Define the type for route params if needed
// type ChatScreenRouteParams = {
//   questionnaireData: any;
// };

const MAX_INTERACTIONS = 2;

const ChatScreen = () => {
    // const route = useRoute<RouteProp<Record<string, ChatScreenRouteParams>, string>>();
    const navigation = useNavigation();
    const theme = useTheme(); // <<< OBTER O TEMA AQUI DENTRO
    const flatListRef = useRef<FlatList>(null);

    // --- State ---
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [interactionCount, setInteractionCount] = useState(0);
    const [isChatEnded, setIsChatEnded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [extractedData, setExtractedData] = useState<any>(null);
    // --- End State ---

    // --- Data (Placeholder) ---
    // const questionnaireData = route.params?.questionnaireData || {};
    const questionnaireData = { // Substitua pelos dados reais (via route ou Redux)
        nome: "Usuário Teste",
        objetivo: "hipertrofia",
        trainingDays: ["seg", "qua", "sex"],
        averageTrainingTime: 60,
        includeCardio: true,
        includeStretching: false,
        experienciaTreino: "intermediario",
        temLesoes: false,
    };
    // --- End Data ---

    // --- Effects ---
    // Add initial AI message
    useEffect(() => {
        setMessages([
            {
                id: 'initial-ai-message',
                text: `Olá ${questionnaireData.nome || 'usuário'}! Analisei seu questionário. Antes de gerar seu plano, você gostaria de me perguntar algo sobre o processo ou adicionar algum detalhe/preferência importante? (Você tem ${MAX_INTERACTIONS} interações restantes)`,
                sender: 'ai',
                timestamp: Date.now(),
            },
        ]);
    }, [questionnaireData.nome]); // Dependência apenas no nome para a mensagem inicial

    // Scroll to bottom when messages change
    useEffect(() => {
        // Pequeno delay pode ajudar a garantir que o layout esteja pronto
        setTimeout(() => {
           if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
            }
        }, 100);
    }, [messages]);
    // --- End Effects ---

    // --- Handlers ---
    const handleSend = useCallback(async () => {
        // ... (Lógica do handleSend permanece a mesma) ...
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

        setMessages(prev => [...prev, newUserMessage]);
        setInputText('');
        setIsLoading(true);
        setError(null);
        const currentInteraction = interactionCount + 1;
        setInteractionCount(currentInteraction);

        try {
            const historyForApi = messages.map(msg => ({
                role: msg.sender === 'ai' ? 'model' : 'user',
                parts: [{ text: msg.text }],
            }));
             historyForApi.push({ role: 'user', parts: [{ text: trimmedInput }] });

            const apiResponse = await callGeminiApi(
                historyForApi,
                questionnaireData,
                MAX_INTERACTIONS,
                currentInteraction
            );

            const aiResponseText = apiResponse.text || "Desculpe, não consegui processar sua solicitação.";
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

             // Atualiza a contagem de interações restantes na mensagem inicial ou outra UI se desejar
             // Ex: Modificar a primeira mensagem ou ter um state separado para a contagem exibida

             if (currentInteraction >= MAX_INTERACTIONS) {
                 setIsChatEnded(true);
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
            setIsChatEnded(true);
        } finally {
            setIsLoading(false);
        }
    }, [inputText, isLoading, isChatEnded, messages, interactionCount, questionnaireData]); // Dependências do useCallback

    const handleSkipOrEnd = () => {
        console.log("Skipping/Ending Chat. Extracted Data:", extractedData);
        // Ajuste o nome da rota e os parâmetros conforme sua necessidade
        navigation.navigate('PlanGenerationScreen', { // Ou 'MainNavigator', etc.
             questionnaireData: questionnaireData,
             chatAdjustments: extractedData || {} // Garante que é um objeto
        });
    };
    // --- End Handlers ---

     // --- Styles Definition (Moved Inside Component using useMemo) ---
    const styles = useMemo(() => StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: theme.colors.background, // Usando theme do hook
        },
        container: {
            flex: 1,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: theme.spacing?.regular ?? 16,
            paddingVertical: theme.spacing?.small ?? 12,
            borderBottomWidth: 1,
            // Use a cor de borda do tema se disponível, senão um fallback
            borderBottomColor: theme.colors.border ?? 'rgba(255, 255, 255, 0.1)',
        },
        headerTitle: {
            color: theme.colors.text,
            fontSize: theme.typography?.sizes?.large ?? 20,
            fontWeight: 'bold',
        },
        skipButton: {
            color: theme.colors.primary,
            fontSize: theme.typography?.sizes?.regular ?? 16,
            fontWeight: 'bold',
        },
        messageListContent: {
            padding: theme.spacing?.regular ?? 16,
             paddingBottom: theme.spacing?.small ?? 8, // Add some padding at the bottom
        },
        messageBubble: {
            maxWidth: '80%',
            padding: theme.spacing?.small ?? 12,
            borderRadius: theme.borderRadius?.medium ?? 15,
            marginBottom: theme.spacing?.small ?? 8,
        },
        userMessage: {
            backgroundColor: theme.colors.primary,
            alignSelf: 'flex-end',
        },
        aiMessage: {
            // Usar uma cor de card ou superfície do tema, se disponível
            backgroundColor: theme.colors.card ?? 'rgba(255, 255, 255, 0.15)',
            alignSelf: 'flex-start',
        },
        messageText: {
            // A cor do texto deve contrastar com o fundo do balão
            // Para AI (fundo claro/cinza), theme.colors.text geralmente funciona
            // Para User (fundo primário), pode precisar de theme.colors.textOnPrimary
            // Solução: Aplicar cor específica no userMessage ou definir cores de texto diferentes
            fontSize: theme.typography?.sizes?.regular ?? 16,
            // Cor padrão (boa para AI message):
             color: theme.colors.text,
        },
        // Estilo específico para o texto dentro do balão do usuário
        userMessageText: {
             color: theme.colors.textOnPrimary ?? theme.colors.background, // Tenta textOnPrimary, senão background
        },
        timestamp: {
            fontSize: theme.typography?.sizes?.extraSmall ?? 10,
            color: theme.colors.textSecondary ?? '#aaa',
            alignSelf: 'flex-end',
            marginTop: 4,
        },
        inputContainer: {
            flexDirection: 'row',
            padding: theme.spacing?.regular ?? 16,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border ?? 'rgba(255, 255, 255, 0.1)',
            alignItems: 'flex-end', // Alinha com a base do TextInput multiline
            backgroundColor: theme.colors.background, // Garante fundo consistente
        },
        input: {
            flex: 1,
            backgroundColor: theme.colors.inputBackground ?? 'rgba(255, 255, 255, 0.1)',
            color: theme.colors.text,
            paddingHorizontal: theme.spacing?.regular ?? 16,
            paddingTop: theme.spacing?.small ?? 12, // Padding vertical para multiline
            paddingBottom: theme.spacing?.small ?? 12,
            borderRadius: theme.borderRadius?.large ?? 20,
            fontSize: theme.typography?.sizes?.regular ?? 16,
            marginRight: theme.spacing?.small ?? 8,
            maxHeight: 100, // Limite de altura
            minHeight: 40, // Altura mínima para não ficar muito pequeno
        },
        sendButton: {
            backgroundColor: theme.colors.primary,
            width: 40, // Tamanho fixo para botão redondo
            height: 40,
            borderRadius: 20, // Metade da largura/altura para ser redondo
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: Platform.OS === 'ios' ? 0 : 4, // Pequeno ajuste para alinhar melhor no Android
        },
        sendButtonDisabled: {
            backgroundColor: theme.colors.disabledBackground ?? theme.colors.primary + '80', // Primário com opacidade ou cor desabilitada
            opacity: 0.7,
        },
        errorText: {
            color: theme.colors.error ?? 'red',
            textAlign: 'center',
            paddingHorizontal: theme.spacing?.regular ?? 16,
            paddingBottom: theme.spacing?.small ?? 8, // Espaço abaixo do erro
        },
    }), [theme]); // Recalcula os estilos se 'theme' mudar
    // --- End Styles Definition ---


    // --- Render Helper ---
    const renderMessage = ({ item }: { item: Message }) => {
        const isUser = item.sender === 'user';
        return (
            <View
                style={[
                    styles.messageBubble,
                    isUser ? styles.userMessage : styles.aiMessage,
                ]}
            >
                {/* Aplica cor de texto diferente para mensagens do usuário */}
                <Text style={[styles.messageText, isUser && styles.userMessageText]}>
                    {item.text}
                </Text>
                {/* Optional: Timestamp */}
                {/* <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text> */}
            </View>
        );
    }
    // --- End Render Helper ---

    // --- Component Return ---
    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Ajuste conforme necessário
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Chat com ForcaAI</Text>
                     <TouchableOpacity onPress={handleSkipOrEnd}>
                         <Text style={styles.skipButton}>{isChatEnded ? "Finalizar" : "Pular"}</Text>
                     </TouchableOpacity>
                </View>

                {/* Lista de Mensagens */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.messageListContent}
                    // inverted // Se usar 'inverted', lembre-se de inverter a ordem dos dados em 'messages'
                    // e talvez ajustar o `scrollToEnd`
                />

                {/* Mensagem de Erro */}
                {error && <Text style={styles.errorText}>{error}</Text>}

                {/* Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={isChatEnded ? "Chat encerrado" : "Digite sua mensagem ou dúvida..."}
                        // Usar placeholderTextColor diretamente no componente
                        placeholderTextColor={theme.colors.textSecondary ?? '#888'}
                        editable={!isLoading && !isChatEnded}
                        multiline
                        // blurOnSubmit={false} // Pode ajudar em alguns casos com teclado
                        // returnKeyType="send" // Muda o botão do teclado (não envia por padrão)
                        // onSubmitEditing={handleSend} // Enviar com o botão 'return' do teclado (opcional)
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (isLoading || isChatEnded || !inputText.trim()) && styles.sendButtonDisabled]}
                        onPress={handleSend}
                        disabled={isLoading || isChatEnded || !inputText.trim()}
                    >
                        {isLoading ? (
                            // Usar cor que contraste com o botão primário
                            <ActivityIndicator size="small" color={theme.colors.textOnPrimary ?? theme.colors.background ?? '#FFF'} />
                        ) : (
                            <Feather name="send" size={20} color={theme.colors.textOnPrimary ?? theme.colors.background ?? '#FFF'} />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// --- REMOVIDO: A definição de 'styles' que estava aqui fora ---

export default ChatScreen;