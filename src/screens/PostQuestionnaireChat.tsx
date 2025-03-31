// src/screens/PostQuestionnaireChat.tsx (NOVO ARQUIVO)

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useSelector, useDispatch } from 'react-redux';
import { useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { Content } from "@google/generative-ai"; // Importar tipo do SDK Gemini

import { RootState } from '../store'; // Ajuste o caminho
import { selectUserProfile, selectUserLoading, selectUserError, UserProfile } from '../store/slices/userSlice'; // Ajuste o caminho
import { callGeminiApi } from '../services/geminiService'; // Ajuste o caminho
import { clearUserError } from '../store/slices/userSlice'; // Para limpar erros ao focar

// Defina quantas interações o usuário terá no máximo
const MAX_INTERACTIONS = 3;

const PostQuestionnaireChat = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const dispatch = useDispatch();
    const flatListRef = useRef<FlatList>(null);

    // --- Seletores Redux ---
    const userProfile = useSelector(selectUserProfile);
    const userLoading = useSelector(selectUserLoading); // Pode ser útil mostrar loading inicial
    const serviceError = useSelector(selectUserError); // Erros gerais do userSlice

    // --- Estado Local do Chat ---
    const [messages, setMessages] = useState<Content[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoadingAi, setIsLoadingAi] = useState(false); // Loading específico da IA
    const [chatError, setChatError] = useState<string | null>(null); // Erro específico do chat/API
    const [currentInteraction, setCurrentInteraction] = useState(0); // Começa em 0, primeira msg do user é 1
    const [isChatEnded, setIsChatEnded] = useState(false);

    // --- Efeito Inicial ---
    useEffect(() => {
        // Limpa erros anteriores ao entrar na tela
        dispatch(clearUserError());

        // Define a mensagem inicial da IA
        setMessages([
            { role: 'model', parts: [{ text: `Olá ${userProfile?.full_name || 'usuário'}! Analisei seu questionário. Você tem ${MAX_INTERACTIONS} interações para tirar dúvidas rápidas ou adicionar detalhes antes de eu gerar seu plano. O que gostaria de perguntar?` }] }
        ]);
    }, [dispatch, userProfile?.full_name]); // Depende do nome para personalizar

    // --- Scroll Automático ---
    useEffect(() => {
        if (flatListRef.current && messages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
        }
    }, [messages]); // Roda sempre que as mensagens mudam

    // --- Handler para Enviar Mensagem ---
    const handleSendMessage = useCallback(async () => {
        if (isLoadingAi || !inputText.trim() || isChatEnded) {
            return; // Não envia se já estiver carregando, vazio ou chat encerrado
        }

        // Verifica se o perfil está carregado
        if (!userProfile) {
            Alert.alert("Erro", "Dados do perfil não estão disponíveis. Tente novamente.");
            return;
        }

        setIsLoadingAi(true);
        setChatError(null);
        const interactionNumber = currentInteraction + 1; // Interação atual a ser enviada

        const userMessage: Content = { role: 'user', parts: [{ text: inputText.trim() }] };
        const currentHistory = [...messages, userMessage]; // Histórico a ser enviado

        setMessages(currentHistory); // Mostra a mensagem do usuário imediatamente
        setInputText(''); // Limpa o input

        try {
            console.log(`[ChatScreen] Sending message ${interactionNumber}/${MAX_INTERACTIONS} to Gemini.`);
            const response = await callGeminiApi(
                currentHistory, // Envia histórico com a msg atual do usuário
                userProfile,    // Passa o perfil completo
                MAX_INTERACTIONS,
                interactionNumber // Passa o número da interação atual
            );

            const aiMessage: Content = { role: 'model', parts: [{ text: response.text }] };
            setMessages(prev => [...prev, aiMessage]); // Adiciona resposta da IA

            // --- Processar Dados Extraídos ---
            if (response.extractedData?.ajustes?.length > 0) {
                console.log("[ChatScreen] IA extraiu ajustes:", response.extractedData.ajustes);
                // TODO: Implementar lógica para usar esses ajustes
                // Ex: Salvar em Redux, mostrar ao usuário, passar para próxima etapa
                // Por agora, apenas logamos.
            }

            setCurrentInteraction(interactionNumber); // Incrementa o contador

            // Verifica se o chat deve terminar
            if (interactionNumber >= MAX_INTERACTIONS) {
                setIsChatEnded(true);
                console.log("[ChatScreen] Max interactions reached. Chat ended.");
                // Poderia adicionar uma última mensagem automática aqui ou desabilitar input
                 // Adiciona mensagem final se a IA não o fez
                 if (!response.text.toLowerCase().includes("gerar o plano")) {
                    const finalMessage: Content = { role: 'model', parts: [{ text: "Ok! Usei todas as informações. Vou preparar seu plano de treino agora." }] };
                    setMessages(prev => [...prev, finalMessage]);
                 }
                 // Navegar após um pequeno delay?
                 setTimeout(() => {
                     navigation.navigate('MainNavigator', { screen: 'Home' }); // Navega para Home dentro do MainNavigator
                 }, 2500); // Delay de 2.5 segundos
            }

        } catch (error: any) {
            console.error("[ChatScreen] Error calling Gemini API:", error);
            const errorMsg = error.message || "Falha na comunicação com o assistente.";
            setChatError(errorMsg);
            // Opcional: Adicionar mensagem de erro no chat
            const errorMessage: Content = { role: 'model', parts: [{ text: `Desculpe, ocorreu um erro: ${errorMsg}` }] };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoadingAi(false);
        }
    }, [messages, inputText, isLoadingAi, isChatEnded, userProfile, currentInteraction, navigation]);

    // --- Render Item para FlatList ---
    const renderMessage = ({ item }: { item: Content }) => {
        const isUser = item.role === 'user';
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

    // --- Loading ou Erro Inicial ---
    if (userLoading === 'pending' && !userProfile) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Carregando perfil...</Text>
            </SafeAreaView>
        );
    }
    if (serviceError && !userProfile) {
         return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.errorText}>Erro ao carregar perfil: {serviceError}</Text>
                 <TouchableOpacity onPress={() => navigation.goBack()}>
                     <Text style={styles.linkText}>Voltar</Text>
                 </TouchableOpacity>
            </SafeAreaView>
         );
    }
    if (!userProfile) {
         return (
             <SafeAreaView style={styles.container}>
                 <Text style={styles.errorText}>Perfil do usuário não encontrado.</Text>
                  <TouchableOpacity onPress={() => navigation.goBack()}>
                     <Text style={styles.linkText}>Voltar</Text>
                 </TouchableOpacity>
             </SafeAreaView>
         );
     }


    // --- Renderização Principal ---
    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0} // Ajuste conforme necessário
            >
                <Text style={styles.title}>Chat Rápido com ForcaAI</Text>
                <Text style={styles.interactionsLeft}>
                    {isChatEnded ? "Chat finalizado." : `Interações restantes: ${MAX_INTERACTIONS - currentInteraction}`}
                </Text>

                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(_item, index) => index.toString()}
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
                        editable={!isLoadingAi && !isChatEnded} // Desabilita enquanto carrega ou se encerrou
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

// --- Estilos (usando theme do Paper) ---
const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: {
        flex: 1,
        backgroundColor: useTheme().colors.background, // Usa tema aqui também para o container geral
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 10,
        color: useTheme().colors.onBackground,
    },
     interactionsLeft: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 10,
        color: useTheme().colors.onSurfaceVariant,
    },
    chatList: {
        flex: 1,
    },
    chatListContent: {
        paddingHorizontal: 10,
        paddingBottom: 10, // Espaço para não colar no input
    },
    messageBubble: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 18,
        marginVertical: 4,
        maxWidth: '80%',
    },
    userBubble: {
        backgroundColor: useTheme().colors.primary, // Cor primária para usuário
        // alignSelf: 'flex-end', // Removido daqui, aplicado no renderItem
    },
    aiBubble: {
        backgroundColor: useTheme().colors.surfaceVariant, // Cor de superfície para IA
        // alignSelf: 'flex-start', // Removido daqui, aplicado no renderItem
    },
    userText: {
        color: useTheme().colors.onPrimary, // Texto sobre a cor primária
        fontSize: 16,
    },
    aiText: {
        color: useTheme().colors.onSurfaceVariant, // Texto sobre a cor de superfície
        fontSize: 16,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: useTheme().colors.outline,
        backgroundColor: useTheme().colors.surface, // Fundo da área de input
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120, // Permite múltiplas linhas mas limita altura
        backgroundColor: useTheme().colors.surfaceVariant,
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        fontSize: 16,
        color: useTheme().colors.onSurfaceVariant,
        marginRight: 10,
    },
    sendButton: {
        backgroundColor: useTheme().colors.primary,
        borderRadius: 20,
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 60,
    },
    sendButtonDisabled: {
        backgroundColor: useTheme().colors.surfaceDisabled,
    },
    sendButtonText: {
        color: useTheme().colors.onPrimary,
        fontWeight: 'bold',
    },
     loadingText: {
        marginTop: 10,
        color: useTheme().colors.onSurfaceVariant,
        textAlign: 'center',
    },
    errorText: {
        color: useTheme().colors.error,
        textAlign: 'center',
        margin: 20,
        fontSize: 16,
    },
     chatErrorText: {
        color: useTheme().colors.error,
        textAlign: 'center',
        paddingHorizontal: 10,
        fontSize: 14,
        marginBottom: 5,
    },
    linkText: {
        color: useTheme().colors.primary,
        textAlign: 'center',
        marginTop: 10,
        fontSize: 16,
    },
});

export default PostQuestionnaireChat;