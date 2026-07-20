// /home/pmarconato/ForcaApp/src/screens/PostQuestionnaireChat.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Alert,
    Pressable,
    Text,
    TextInput,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseSecureStorage as secureStorage } from '../services/auth/secureStorage';
import { Feather } from '@expo/vector-icons';

// Serviços e Contextos
import { callClaudeApi, testClaudeApiConnection } from '../services/api/claudeService';
import { requestTrainingPlanGeneration } from '../services/api/trainingPlanService';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingStackParamList } from '../navigation/OnboardingNavigator';
import theme from '../theme/theme';
import Button from '../components/ui/Button';
import { EmptyState, Notice } from '../components/ui/Feedback';

// --- Tipos ---
type Content = { role: 'user' | 'model' | 'system'; parts: { text: string }[] };
type ChatScreenRouteParams = { formData?: any; skipChat?: boolean };
type PostQuestionnaireChatNavigationProp = StackNavigationProp<OnboardingStackParamList, 'PostQuestionnaireChat'>;

// --- Constantes Funcionais ---
const MAX_INTERACTIONS = 3;
const STORAGE_KEY_CHAT_PREFIX = '@chat_messages_';
const STORAGE_KEY_QUESTIONNAIRE_PREFIX = '@questionnaire_data_';
const STORAGE_KEY_CHAT_COMPLETED_PREFIX = '@chat_completed_';

const PostQuestionnaireChat = () => {
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
    // Guarda o disparo do declínio por skipChat para evitar duplicação em
    // re-renders do init. completeOnboardingAndGeneratePlan já se protege com
    // isGeneratingPlan, mas o disparo do declínio precisa da própria guarda.
    const skipChatDispatchedRef = useRef(false);
    // Refs de leitura para completeOnboardingAndGeneratePlan: o init chama a
    // geração logo após set* antes do re-render propagar. Sem os refs, o
    // callback capturaria o valor anterior (null) e cairia no early return.
    // isGeneratingPlan também vai para ref: setIsGeneratingPlan(true) dentro
    // do callback recriaria o useCallback por isGeneratingPlan estar nas deps,
    // disparando o useEffect de init de novo com isInitializing ainda true
    // (finally não rodou enquanto a promise está pendente) — re-entrada com
    // boas-vindas fantasmas no modo skipChat.
    const questionnaireDataRef = useRef<any>(null);
    const adjustmentsRef = useRef<string[]>([]);
    const isGeneratingPlanRef = useRef(false);
    // Guarda contra dupla execução do init (independente dos hooks deps).
    const initRanRef = useRef(false);

    // --- DERIVAÇÃO DE CHAVES ---
    const userId = user?.id;
    const STORAGE_KEY_CHAT = useMemo(() => userId ? `${STORAGE_KEY_CHAT_PREFIX}${userId}` : null, [userId]);
    const STORAGE_KEY_QUESTIONNAIRE = useMemo(() => userId ? `${STORAGE_KEY_QUESTIONNAIRE_PREFIX}${userId}` : null, [userId]);
    const STORAGE_KEY_CHAT_COMPLETED = useMemo(() => userId ? `${STORAGE_KEY_CHAT_COMPLETED_PREFIX}${userId}` : null, [userId]);

    // --- FUNÇÕES ---

    const saveChatState = useCallback(async (key: string | null, msgs: Content[], count: number, ended: boolean, adjs: string[]) => {
        if (!key) return;
        try {
            const stateToSave = JSON.stringify({ messages: msgs, interactionsCount: count, isChatEnded: ended, adjustments: adjs });
            await secureStorage.setItem(key, stateToSave);
            // Remove a cópia legada em texto puro (versões antigas usavam AsyncStorage)
            await AsyncStorage.removeItem(key).catch(() => undefined);
        } catch (error) {
            console.error(`[Chat ${userId}] Erro ao salvar estado do chat no armazenamento seguro:`, error);
        }
    }, [userId]);

    const getAICoachWelcomeText = useCallback((userName: string | null | undefined) => {
        // ... (implementação inalterada) ...
        const namePart = userName ? `, ${userName}` : '';
        return `Olá${namePart}! Sou seu assistente IA da Forca App. Analisei suas respostas. Antes de gerar seu plano de treino personalizado, você gostaria de fazer alguma pergunta ou solicitar algum ajuste específico? Você tem até ${MAX_INTERACTIONS} interações para isso.`;
    }, []);

    // ** Função para gerar o plano **

// Corrected version (inserted)
const completeOnboardingAndGeneratePlan = useCallback(async () => {
  const currentQuestionnaireData = questionnaireDataRef.current;
  if (isGeneratingPlanRef.current || !userId || !currentQuestionnaireData) {
    console.log(`[Chat ${userId}] Dados insuficientes ou geração já em andamento.`);
    return;
  }

  console.log(`[Chat ${userId}] Iniciando geração do plano...`);
  isGeneratingPlanRef.current = true;
  setIsGeneratingPlan(true);
  setChatError(null);

  try {
    const currentAdjustments = [...adjustmentsRef.current]; 
    
    const result = await requestTrainingPlanGeneration(
      userId,
      currentQuestionnaireData,
      currentAdjustments
    );

    if (result.success) {
      console.log(`[Chat ${userId}] Plano gerado com sucesso, ID: ${result.planId ?? '(offline, sem plano no banco)'}`);
      const profileUpdate: { onboarding_completed: boolean; current_plan_id?: string } = {
        onboarding_completed: true,
      };
      if (result.planId) {
        profileUpdate.current_plan_id = result.planId;
      }
      await updateProfile(profileUpdate);
    } else {
      throw new Error(result.message || "Falha ao gerar o plano de treino.");
    }
  } catch (error: any) {
    console.error(`[Chat ${userId}] Erro ao gerar plano:`, error);
    setChatError(`Erro ao gerar plano: ${error.message || 'Tente novamente.'}`);
  } finally {
    isGeneratingPlanRef.current = false;
    setIsGeneratingPlan(false);
  }
}, [userId, updateProfile, navigation]);
// End of corrected version



    const handleUserWantsToChat = useCallback(() => {
        // ... (implementação inalterada) ...
        setShowInitialChoice(false);
    }, []);

    // Ajustar dependências se completeOnboardingAndGeneratePlan foi alterada
    const handleUserDeclinesChat = useCallback(async () => {
        // ... (implementação inalterada, mas verifica dependências) ...
        setShowInitialChoice(false);
        setIsChatEnded(true);
        const systemMessage: Content = { role: 'system', parts: [{ text: "Ok, vamos gerar seu treino com base nas respostas." }] };
        // Cria uma cópia atualizada das mensagens para salvar
        const updatedMessages = [...messages, systemMessage];
        setMessages(updatedMessages);

        if (STORAGE_KEY_CHAT) {
            // Salva o estado ANTES de chamar a geração
            await saveChatState(STORAGE_KEY_CHAT, updatedMessages, interactionsCount, true, adjustments);
        }
        if (STORAGE_KEY_CHAT_COMPLETED) {
            await secureStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
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
        const systemMessage: Content = { role: 'system', parts: [{ text: "Ok, gerando seu plano de treino com base no questionário e ajustes..." }] };
        const updatedMessages = [...messages, systemMessage];
        setMessages(updatedMessages);

        if (STORAGE_KEY_CHAT) {
            await saveChatState(STORAGE_KEY_CHAT, updatedMessages, interactionsCount, true, adjustments);
        }
        if (STORAGE_KEY_CHAT_COMPLETED) {
            await secureStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
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
            const aiResponseText = await callClaudeApi(historyForApi, questionnaireData, currentAdjustments);

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
                    await secureStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
                }

            } else {
                throw new Error("Resposta da IA vazia ou inválida.");
            }
        } catch (error: any) {
            // Falha operacional já logada (uma vez) pelo interceptor do apiClient
            // e tratada aqui pela UI (chatError) — log informativo, não error.
            console.log(`[Chat ${userId}] Falha tratada ao chamar API Claude:`, error?.message ?? error);
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
            if (initRanRef.current) return;
            initRanRef.current = true;
            console.log(`[Chat ${userId}] Iniciando inicialização... (isInitializing: ${isInitializing})`);
            setChatError(null);
            let loadedQuestionnaireData = null;
            let chatAlreadyCompleted = false;
            let apiOk = null;

            try {
                // 0. Verificar se o chat já foi concluído
                if (STORAGE_KEY_CHAT_COMPLETED) {
                    const completedStatus = await secureStorage.getItem(STORAGE_KEY_CHAT_COMPLETED);
                    if (completedStatus === 'true') {
                        console.log(`[Chat ${userId}] Chat já concluído anteriormente.`);
                        chatAlreadyCompleted = true;
                        if (user?.onboarding_completed) {
                            console.log(`[Chat ${userId}] Onboarding já completo; o RootNavigator já exibe o app principal.`);
                            // Sem navegação manual: a troca de navigator é dirigida pelo
                            // AuthContext (profile.onboarding_completed). Só encerra aqui.
                            return;
                        } else {
                            console.warn(`[Chat ${userId}] Chat completo, mas onboarding não. Tentando gerar plano.`);
                        }
                    }
                }

                // 1. Carregar dados do questionário
                if (STORAGE_KEY_QUESTIONNAIRE) {
                    const storedData = await secureStorage.getItem(STORAGE_KEY_QUESTIONNAIRE);
                    if (storedData) {
                        loadedQuestionnaireData = JSON.parse(storedData);
                        setQuestionnaireData(loadedQuestionnaireData);
                        // Atualiza o ref imediatamente para que
                        // completeOnboardingAndGeneratePlan (chamado mais
                        // abaixo no mesmo init) leia o valor fresco, antes do
                        // re-render propagar o estado.
                        questionnaireDataRef.current = loadedQuestionnaireData;
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
                    // Indisponibilidade esperada: o único warn é o do interceptor.
                    console.log(`[Chat ${userId}] API Claude indisponível.`);
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
                    const storedChat = await secureStorage.getItem(STORAGE_KEY_CHAT);
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
                            await secureStorage.removeItem(STORAGE_KEY_CHAT);
                        }
                    }
                }

                setMessages(initialMessages);
                setInteractionsCount(initialInteractionCount);
                setIsChatEnded(initialIsChatEnded);
                setAdjustments(initialAdjustments);
                // Sincroniza o ref imediatamente para a geração ler o valor
                // fresco caso seja chamada no mesmo ciclo do init.
                adjustmentsRef.current = initialAdjustments;

                if (!loadedState && !initialIsChatEnded) {
                    // Feature A: skipChat vem do botão "Gerar treino direto" do
                    // QuestionnaireScreen. Só vale para chat NOVO — se há chat
                    // salvo em andamento, o usuário já tinha escolhido conversar
                    // e skipChat é ignorado.
                    const pularChat = route.params?.skipChat === true && !skipChatDispatchedRef.current;
                    if (pularChat) {
                        skipChatDispatchedRef.current = true;
                        setShowInitialChoice(false);
                        console.log(`[Chat ${userId}] skipChat recebido — gerando plano direto.`);
                        const systemMessage: Content = { role: 'system', parts: [{ text: "Ok, vamos gerar seu treino com base nas respostas." }] };
                        const skipMessages = [systemMessage];
                        setMessages(skipMessages);
                        if (STORAGE_KEY_CHAT) {
                            await saveChatState(STORAGE_KEY_CHAT, skipMessages, 0, true, []);
                        }
                        if (STORAGE_KEY_CHAT_COMPLETED) {
                            await secureStorage.setItem(STORAGE_KEY_CHAT_COMPLETED, 'true');
                        }
                        // Libera isInitializing ANTES do await da geração: a tela
                        // precisa sair do spinner "Preparando..." e mostrar o
                        // indicador de progresso da geração no chat.
                        setIsInitializing(false);
                        await completeOnboardingAndGeneratePlan();
                    } else if (apiOk) {
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

    // Sincroniza refs com estado: completeOnboardingAndGeneratePlan lê dos
    // refs (estáveis) para não precisar de estado nas deps do useCallback, o
    // que causaria re-entrada do init. Os refs precisam refletir o estado
    // atual para a geração usar os valores corretos fora do init.
    useEffect(() => { questionnaireDataRef.current = questionnaireData; }, [questionnaireData]);
    useEffect(() => { adjustmentsRef.current = adjustments; }, [adjustments]);


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

        const bubbleStyle = isUser ? styles.bolhaUsuario : (isSystem ? styles.bolhaSistema : styles.bolhaIa);
        const textStyle = isUser ? styles.textoUsuario : (isSystem ? styles.textoSistema : styles.textoIa);
        const key = `msg-${item.role}-${index}-${messageText.slice(0, 15)}-${Math.random()}`;

        return (
            <View key={key} style={[styles.bolhaBase, bubbleStyle]}>
                <Text style={textStyle}>{messageText}</Text>
            </View>
        );
    }, []);

    // --- ESTILOS ---
    // Direção 02: uma única superfície de conversa, sem card flutuante nem
    // círculos decorativos. O neon fica na bolha do usuário e no enviar.
    const styles = useMemo(() => StyleSheet.create({
        screen: { flex: 1, backgroundColor: theme.colors.surface.canvas },
        flex: { flex: 1 },
        centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },

        conversa: {
            flex: 1,
            margin: theme.spacing.lg,
            padding: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.borderRadius.xxl,
            backgroundColor: theme.colors.surface.card,
        },
        cabecalho: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border.subtle,
        },
        cabecalhoTitulo: {
            color: theme.colors.text.primary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.lg,
            fontWeight: theme.typography.fontWeights.semiBold,
        },
        cabecalhoMeta: {
            color: theme.colors.text.quiet,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.sm,
        },

        lista: { flex: 1, marginVertical: theme.spacing.md },
        listaConteudo: { paddingBottom: theme.spacing.sm },
        vazio: { alignItems: 'center', padding: theme.spacing.xl },

        bolhaBase: {
            maxWidth: '86%',
            marginVertical: theme.spacing.xxs,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.borderRadius.xl,
        },
        bolhaUsuario: { alignSelf: 'flex-end', backgroundColor: theme.colors.accent.main },
        bolhaIa: {
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            backgroundColor: theme.colors.surface.elevated,
        },
        bolhaSistema: { alignSelf: 'center', backgroundColor: theme.colors.transparent },
        textoUsuario: {
            color: theme.colors.accent.on,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
            lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
        },
        textoIa: {
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
            lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
        },
        textoSistema: {
            color: theme.colors.text.quiet,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.sm,
            textAlign: 'center',
        },

        escolhaInicial: {
            marginVertical: 'auto',
            padding: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.borderRadius.lg,
            backgroundColor: theme.colors.surface.elevated,
        },
        escolhaTexto: {
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
            lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
            textAlign: 'center',
        },
        escolhaAcoes: { flexDirection: 'row', gap: theme.spacing.sm },
        escolhaBotao: { flex: 1 },

        entrada: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border.subtle,
        },
        campo: {
            flex: 1,
            maxHeight: 96,
            minHeight: theme.hitTarget.compact,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.surface.elevated,
            color: theme.colors.text.primary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
        },
        acaoRedonda: {
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.borderRadius.pill,
            backgroundColor: theme.colors.accent.main,
        },
        acaoSecundaria: {
            borderWidth: 1,
            borderColor: theme.colors.border.strong,
            backgroundColor: theme.colors.transparent,
        },
        acaoInativa: { opacity: 0.45 },

        rodape: {
            marginTop: theme.spacing.md,
            color: theme.colors.text.quiet,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.micro,
            textAlign: 'center',
        },
        estado: { alignItems: 'center', paddingTop: theme.spacing.md },
        aviso: { marginTop: theme.spacing.md },

        modalFundo: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.overlay,
        },
        modalCartao: {
            width: '100%',
            maxHeight: '80%',
            padding: theme.spacing.xl,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.borderRadius.xxl,
            backgroundColor: theme.colors.surface.card,
        },
        modalTitulo: {
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.primary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.lg,
            fontWeight: theme.typography.fontWeights.semiBold,
        },
        modalRolagem: { maxHeight: '62%', marginBottom: theme.spacing.lg },
        modalResumo: {
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
            lineHeight: theme.typography.fontSizes.base * theme.typography.lineHeights.normal,
        },
        modalAcoes: { gap: theme.spacing.sm },
        modalCarregando: { alignItems: 'center', paddingVertical: theme.spacing.lg },
        modalCarregandoTexto: {
            marginTop: theme.spacing.md,
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
        },
        esperandoTexto: {
            marginTop: theme.spacing.md,
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
            textAlign: 'center',
        },
    }), []);

    // --- RENDERIZAÇÃO ---

    // Tela de espera da inicialização
    if (isInitializing) {
        return (
            <SafeAreaView style={styles.screen}>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={theme.colors.accent.main} />
                    <Text style={styles.esperandoTexto}>Preparando seus ajustes finais...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // Erro crítico: sem os dados do questionário não há o que ajustar
    if (!isInitializing && !isQuestionnaireReady) {
        return (
            <SafeAreaView style={styles.screen}>
                <View style={styles.centered}>
                    <EmptyState
                        icon="alert-triangle"
                        title="Não foi possível carregar seus dados"
                        description={chatError || 'Erro crítico: não foi possível carregar os dados necessários.'}
                        action={<Button label="Voltar" variant="outline" onPress={() => navigation.goBack()} />}
                    />
                </View>
            </SafeAreaView>
        );
    }

    // Feature B: o ✓ "Finalizar ajustes" deixa de depender de isApiAvailable
    // e de isChatEnded — finalizar/gerar não usa o chat, e é exatamente a
    // saída de quem está preso com a IA indisponível. O input de texto e o
    // botão de enviar continuam bloqueados quando a IA não responde.
    const inputBloqueado = isLoadingAi || !isApiAvailable || isChatEnded || isGeneratingPlan;
    const finalizarBloqueado = isLoadingAi || isGeneratingPlan;

    return (
        <SafeAreaView style={styles.screen} edges={['bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            >
                <View style={styles.conversa}>
                    <View style={styles.cabecalho}>
                        <Text style={styles.cabecalhoTitulo} accessibilityRole="header">Ajustes finais</Text>
                        {!isChatEnded && isApiAvailable && MAX_INTERACTIONS > 0 && (
                            <Text style={styles.cabecalhoMeta}>
                                {Math.max(0, MAX_INTERACTIONS - interactionsCount)} restantes
                            </Text>
                        )}
                    </View>

                    <View style={styles.lista}>
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderMessage}
                            contentContainerStyle={styles.listaConteudo}
                            showsVerticalScrollIndicator={false}
                            ListEmptyComponent={
                                !showInitialChoice && !isInitializing ? (
                                    <View style={styles.vazio}>
                                        <Text style={styles.textoSistema}>
                                            {isApiAvailable === false ? 'Assistente indisponível.' : 'Aguardando interação...'}
                                        </Text>
                                    </View>
                                ) : null
                            }
                        />
                    </View>

                    {showInitialChoice && (
                        <View style={styles.escolhaInicial}>
                            <Text style={styles.escolhaTexto}>
                                Seu perfil está pronto. Quer incluir alguma preferência antes de montarmos a primeira semana?
                            </Text>
                            <View style={styles.escolhaAcoes}>
                                <Button
                                    label="Quero ajustar"
                                    variant="outline"
                                    compact
                                    onPress={handleUserWantsToChat}
                                    disabled={!isApiAvailable || isGeneratingPlan}
                                    style={styles.escolhaBotao}
                                />
                                <Button
                                    label="Montar plano"
                                    compact
                                    onPress={handleUserDeclinesChat}
                                    loading={isGeneratingPlan}
                                    disabled={isGeneratingPlan || isLoadingAi}
                                    style={styles.escolhaBotao}
                                />
                            </View>
                            {!isApiAvailable && chatError ? (
                                <Notice tone="danger" title={chatError} style={styles.aviso} />
                            ) : null}
                        </View>
                    )}

                    {chatError && !showInitialChoice && (
                        <Notice
                            tone="danger"
                            title={chatError}
                            style={styles.aviso}
                            action={
                                chatError.startsWith('Erro ao gerar plano') ? (
                                    // Feature A4/B: em falha de geração, retry
                                    // além do "Dispensar" — sem isso, o modo
                                    // direto que falha vira beco sem saída.
                                    <Button
                                        label="Tentar novamente"
                                        compact
                                        onPress={completeOnboardingAndGeneratePlan}
                                        loading={isGeneratingPlan}
                                        disabled={isGeneratingPlan}
                                    />
                                ) : (
                                    <Button label="Dispensar" variant="ghost" compact onPress={() => setChatError(null)} />
                                )
                            }
                        />
                    )}

                    {/* Feature B2: IA indisponível em chat em andamento. Sem este
                        CTA, quem retomou um chat com a IA fora do ar ficava sem
                        nenhuma saída (input morto, ✓ já desbloqueado mas não
                        óbvio). handleUserDeclinesChat preserva os adjustments
                        acumulados — eles entram na geração. */}
                    {isApiAvailable === false && !showInitialChoice && !isChatEnded && !isGeneratingPlan && (
                        <Notice
                            tone="warning"
                            title="Assistente indisponível no momento."
                            description="Você ainda pode finalizar seu treino com os ajustes já feitos."
                            style={styles.aviso}
                            action={
                                <Button
                                    label="Gerar treino sem ajustes"
                                    variant="outline"
                                    compact
                                    onPress={handleUserDeclinesChat}
                                    loading={isGeneratingPlan}
                                    disabled={isGeneratingPlan}
                                />
                            }
                        />
                    )}

                    {!showInitialChoice && (
                        <View style={styles.entrada}>
                            <TextInput
                                style={styles.campo}
                                value={inputText}
                                onChangeText={setInputText}
                                accessibilityLabel="Mensagem para o assistente"
                                placeholder={!isApiAvailable ? 'Assistente indisponível.' : isChatEnded ? 'Chat finalizado.' : isGeneratingPlan ? 'Gerando plano...' : 'Digite sua pergunta ou ajuste...'}
                                placeholderTextColor={theme.colors.text.quiet}
                                selectionColor={theme.colors.accent.main}
                                editable={!inputBloqueado}
                                multiline
                                maxLength={500}
                            />
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Finalizar ajustes"
                                onPress={handleEndChatPress}
                                disabled={finalizarBloqueado}
                                style={({ pressed }) => [
                                    styles.acaoRedonda,
                                    styles.acaoSecundaria,
                                    (finalizarBloqueado || pressed) && styles.acaoInativa,
                                ]}
                            >
                                <Feather name="check" size={18} color={theme.colors.text.primary} />
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Enviar mensagem"
                                onPress={handleSendMessage}
                                disabled={inputBloqueado || !inputText.trim()}
                                style={({ pressed }) => [
                                    styles.acaoRedonda,
                                    (inputBloqueado || !inputText.trim() || pressed) && styles.acaoInativa,
                                ]}
                            >
                                {isLoadingAi ? (
                                    <ActivityIndicator size="small" color={theme.colors.accent.on} />
                                ) : (
                                    <Feather name="send" size={18} color={theme.colors.accent.on} />
                                )}
                            </Pressable>
                        </View>
                    )}

                    {(isChatEnded || isGeneratingPlan) && !showInitialChoice && (
                        <View style={styles.estado}>
                            {isGeneratingPlan ? (
                                <>
                                    <Text style={styles.textoSistema}>Solicitando geração do plano...</Text>
                                    <ActivityIndicator style={{ marginTop: theme.spacing.sm }} color={theme.colors.accent.main} />
                                </>
                            ) : (
                                <Text style={styles.textoSistema}>
                                    {messages[messages.length - 1]?.parts[0]?.text.includes('Limite de interações atingido')
                                        ? messages[messages.length - 1]?.parts[0]?.text
                                        : 'Chat encerrado. Toque em ✓ para gerar o treino.'}
                                </Text>
                            )}
                        </View>
                    )}

                    <Text style={styles.rodape}>Assistente Força · respostas objetivas e contextuais</Text>
                </View>
            </KeyboardAvoidingView>

            <Modal
                animationType="fade"
                transparent={true}
                visible={isSummaryModalVisible}
                onRequestClose={() => { if (!isGeneratingPlan) setIsSummaryModalVisible(false); }}
            >
                <View style={styles.modalFundo}>
                    <View style={styles.modalCartao}>
                        <Text style={styles.modalTitulo} accessibilityRole="header">Confirmar e gerar treino?</Text>
                        <ScrollView style={styles.modalRolagem} showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalResumo}>{summaryContent}</Text>
                        </ScrollView>
                        {isGeneratingPlan ? (
                            <View style={styles.modalCarregando}>
                                <ActivityIndicator size="large" color={theme.colors.accent.main} />
                                <Text style={styles.modalCarregandoTexto}>Gerando plano...</Text>
                            </View>
                        ) : (
                            <View style={styles.modalAcoes}>
                                <Button label="Confirmar e gerar" onPress={handleConfirmEndChat} />
                                <Button label="Voltar ao chat" variant="ghost" onPress={handleCancelEndChat} />
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );

};

export default PostQuestionnaireChat;