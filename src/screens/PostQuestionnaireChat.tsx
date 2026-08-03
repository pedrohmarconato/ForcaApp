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
import { supabaseSecureStorage as secureStorage, removeLegacyPlaintextCopy } from '../services/auth/secureStorage';
import { Feather } from '@expo/vector-icons';

// Serviços e Contextos
import { callClaudeApi, testClaudeApiConnection } from '../services/api/claudeService';
import { requestTrainingPlanGeneration, consolidateChat, startPlanJob, waitForPlanJob, JobProgress, Diretrizes } from '../services/api/trainingPlanService';
import { getActivePlanId } from '../services/trainingRepository';
import { recuperarPlanoSalvo, RECUPERACAO_TENTATIVAS } from '../services/planRecovery';
import { AcompanhamentoPerdidoError } from '../services/api/planJobErrors';
import { classifyApiError } from '../services/api/apiErrors';
import { STORAGE_KEY_CHAT_PREFIX, STORAGE_KEY_CHAT_STATE_PREFIX } from '../services/postQuestionnaireChatStorage';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingStackParamList } from '../navigation/OnboardingNavigator';
import theme from '../theme/theme';
import Button from '../components/ui/Button';
import { EmptyState, Notice } from '../components/ui/Feedback';
import FModules from '../components/ui/FModules';

// --- Construção do plano (Direção 03) --------------------------------------
// As etapas visíveis mapeiam os status REAIS do job de geração — o aluno vê o
// que está sendo decidido, não um spinner. 'created' ainda é análise; o molde
// é a estrutura das semanas; a expansão escolhe exercícios do catálogo.
const ETAPAS_CONSTRUCAO = [
  { rotulo: 'Analisando suas respostas', estagios: ['consolidando', 'created'] },
  { rotulo: 'Estruturando as semanas', estagios: ['gerando_molde'] },
  { rotulo: 'Escolhendo exercícios do catálogo', estagios: ['expandindo'] },
  { rotulo: 'Calibrando e salvando', estagios: ['salvando'] },
] as const;

const indiceDaEtapa = (estagio: string | null): number => {
  if (!estagio) return 0;
  if (estagio === 'salvo') return ETAPAS_CONSTRUCAO.length;
  const ix = ETAPAS_CONSTRUCAO.findIndex((e) => (e.estagios as readonly string[]).includes(estagio));
  return ix === -1 ? 0 : ix;
};

// Sugestões prontas: 1 toque cobre os ajustes mais comuns sem digitar.
const SUGESTOES_AJUSTE = [
  'Tenho uma limitação no ombro',
  'Prefiro treinos mais curtos',
  'Quero priorizar costas',
] as const;

// Rótulos humanos para a revelação — mesmos values do questionário.
const OBJETIVO_LABELS: Record<string, string> = {
  weight_loss: 'perda de peso',
  muscle_gain: 'ganho de massa muscular',
  fitness_improvement: 'condicionamento físico',
  health_wellness: 'saúde e bem-estar',
};

// --- Tipos ---
type Content = { role: 'user' | 'model' | 'system'; parts: { text: string }[] };
type ChatScreenRouteParams = { formData?: any; skipChat?: boolean };
type PostQuestionnaireChatNavigationProp = StackNavigationProp<OnboardingStackParamList, 'PostQuestionnaireChat'>;

// --- Constantes Funcionais ---
const MAX_INTERACTIONS = 6;
const STORAGE_KEY_QUESTIONNAIRE_PREFIX = '@questionnaire_data_';

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
    const [jobProgressText, setJobProgressText] = useState<string | null>(null);
    // Estágio real do job — dirige as etapas da tela de construção.
    const [jobStage, setJobStage] = useState<string | null>(null);
    // Plano gerado aguardando o aluno entrar: a revelação acontece ANTES de
    // onboarding_completed virar true (que troca o navigator na hora).
    const [readyPlanId, setReadyPlanId] = useState<string | null>(null);
    const [isEnteringApp, setIsEnteringApp] = useState(false);
    // Houve conversa, mas a consolidação falhou: o plano saiu sem os ajustes
    // pedidos e o aluno precisa saber disso na revelação.
    const [ajustesNaoAplicados, setAjustesNaoAplicados] = useState(false);
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
    const STORAGE_KEY_CHAT_STATE = useMemo(() => userId ? `${STORAGE_KEY_CHAT_STATE_PREFIX}${userId}` : null, [userId]);

    // --- FUNÇÕES ---

    const saveChatState = useCallback(async (key: string | null, msgs: Content[], count: number, ended: boolean, adjs: string[]) => {
        if (!key) return;
        try {
            const stateToSave = JSON.stringify({ messages: msgs, interactionsCount: count, isChatEnded: ended, adjustments: adjs });
            await secureStorage.setItem(key, stateToSave);
            // Remove a cópia legada em texto puro (só no nativo — no web isto
            // apagava o estado do chat recém-gravado a cada save)
            await removeLegacyPlaintextCopy(key);
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

// Corrigido: fluxo novo — consolida chat → job async → polling
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
  setAjustesNaoAplicados(false);
  setJobStage('consolidando');
  setJobProgressText('Consolidando suas preferências...');

  // O job pode existir no servidor mesmo quando o app perde a resposta: um
  // POST que deu timeout pode ter criado o job do mesmo jeito.
  let jobPodeExistir = false;

  try {
    const currentAdjustments = [...adjustmentsRef.current];

    const historyForApi = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.parts[0]?.text ?? '' }));

    const diretrizesDoQuestionario = () => {
      const base: Diretrizes = { preferencias: currentAdjustments, restricoes: [], excecoes_estruturais: [] };
      if (currentAdjustments.length > 0) {
        base.observacoes_gerais = currentAdjustments.join('; ');
      }
      return base;
    };

    // Sem nenhuma fala do aluno não há conversa a consolidar — e o backend
    // rejeita esse histórico com 400 (exige ao menos uma mensagem 'user').
    // Quem toca em "Gerar treino direto" caía nesse 400 a cada geração.
    const alunoFalouNoChat = historyForApi.some(
      msg => msg.role === 'user' && msg.content.trim().length > 0,
    );

    let diretrizes: Diretrizes;
    if (!alunoFalouNoChat) {
      console.log(`[Chat ${userId}] Sem conversa do aluno — diretrizes vêm do questionário.`);
      diretrizes = diretrizesDoQuestionario();
    } else {
      try {
        diretrizes = await consolidateChat(historyForApi, currentQuestionnaireData);
        console.log(`[Chat ${userId}] Diretrizes consolidadas:`, JSON.stringify(diretrizes).substring(0, 200));
      } catch (consolidateError: any) {
        // Houve conversa e ela não foi consolidada: o plano vai sair sem os
        // ajustes pedidos. Silenciar isso entregava um plano que ignorava o
        // que o aluno escreveu, sem ele saber.
        console.log(`[Chat ${userId}] Consolidação falhou, usando diretrizes do questionário:`, consolidateError?.message);
        diretrizes = diretrizesDoQuestionario();
        setAjustesNaoAplicados(true);
      }
    }

    jobPodeExistir = true;
    const jobId = await startPlanJob(currentQuestionnaireData, diretrizes);
    console.log(`[Chat ${userId}] Job iniciado: ${jobId}`);

    const result = await waitForPlanJob(jobId, (progress: JobProgress) => {
      setJobProgressText(progress.progress?.detail || progress.status);
      setJobStage(progress.status);
    });

    if (result.status === 'salvo' && result.plan_id) {
      console.log(`[Chat ${userId}] Plano gerado com sucesso, ID: ${result.plan_id}`);
      // Direção 03: o plano é APRESENTADO antes de entrar no app — a revelação
      // renderiza aqui; onboarding_completed só vira no toque em "Começar".
      setJobStage('salvo');
      setReadyPlanId(result.plan_id);
    } else {
      const errMsg = result.error?.message || 'Erro desconhecido na geração.';
      throw new Error(errMsg);
    }
  } catch (error: any) {
    console.error(`[Chat ${userId}] Erro ao gerar plano:`, error);

    // Perder o acompanhamento não é o mesmo que a geração ter falhado: o job
    // segue no servidor e grava o plano. Procurar no banco antes de reportar
    // erro evita cobrar do aluno outra geração no Opus por um plano que já
    // existe — e evita deixá-lo preso no onboarding (incidente 27/07/2026).
    //
    // Só vale ESPERAR pelo plano quando a geração pode estar viva: polling
    // perdido, timeout ou queda de rede. Se o servidor reportou o erro, ou se
    // algo quebrou antes do job existir, uma única consulta basta — segurar a
    // tela por um minuto para confirmar uma falha conhecida é castigo.
    const tipoDeFalha = classifyApiError(error);
    const geracaoPodeSeguir =
      error instanceof AcompanhamentoPerdidoError ||
      (jobPodeExistir && (tipoDeFalha.kind === 'timeout' || tipoDeFalha.kind === 'network'));

    if (geracaoPodeSeguir) {
      setJobProgressText('Conexão instável. Verificando se seu plano foi salvo...');
    }
    const planoRecuperado = await recuperarPlanoSalvo(
      userId,
      geracaoPodeSeguir ? RECUPERACAO_TENTATIVAS : 1,
    );

    if (planoRecuperado) {
      console.log(`[Chat ${userId}] Plano recuperado do banco: ${planoRecuperado}`);
      setJobStage('salvo');
      setReadyPlanId(planoRecuperado);
      return;
    }

    setChatError(`Erro ao gerar plano: ${error.message || 'Tente novamente.'}`);
  } finally {
    isGeneratingPlanRef.current = false;
    setIsGeneratingPlan(false);
    setJobProgressText(null);
  }
}, [userId, messages]);

// Toque em "Começar" da revelação: só aqui o onboarding fecha e o
// RootNavigator troca para o app principal. Falha vira erro com retry —
// o plano JÁ está salvo, nada se perde. Em regeneração (vinda da aba Plano) o
// onboarding já ESTAVA completo: o RootNavigator não troca, então a tela volta
// ao topo do stack de treino para o plano novo aparecer.
//
// O guard é o estado ANTERIOR do onboarding, não `skipChat`: skipChat também é
// o caminho normal do primeiro onboarding ("Gerar treino direto"), e ali o
// popToTop corria contra a troca de navigator — o questionário preenchido
// reaparecia por um frame, ou a ação morria sem navigator que a tratasse.
const handleEnterApp = useCallback(async () => {
  if (!readyPlanId || isEnteringApp) return;
  const eraRegeneracao = user?.onboarding_completed === true;
  setIsEnteringApp(true);
  setChatError(null);
  try {
    await updateProfile({ onboarding_completed: true, current_plan_id: readyPlanId });
    if (eraRegeneracao) {
      navigation.popToTop();
    }
  } catch (error: any) {
    console.error(`[Chat ${userId}] Erro ao concluir onboarding:`, error);
    setChatError('Não foi possível entrar agora. Seu plano está salvo — tente de novo.');
  } finally {
    setIsEnteringApp(false);
  }
}, [readyPlanId, isEnteringApp, updateProfile, userId, user?.onboarding_completed, navigation]);



    const handleUserWantsToChat = useCallback(() => {
        // ... (implementação inalterada) ...
        setShowInitialChoice(false);
    }, []);

    // Ajustar dependências se completeOnboardingAndGeneratePlan foi alterada
    const handleUserDeclinesChat = useCallback(async () => {
        setShowInitialChoice(false);
        setIsChatEnded(true);
        const systemMessage: Content = { role: 'system', parts: [{ text: "Ok, vamos gerar seu treino com base nas respostas." }] };
        const updatedMessages = [...messages, systemMessage];
        setMessages(updatedMessages);

        if (STORAGE_KEY_CHAT) {
            await saveChatState(STORAGE_KEY_CHAT, updatedMessages, interactionsCount, true, adjustments);
        }
        if (STORAGE_KEY_CHAT_STATE) {
            await secureStorage.setItem(STORAGE_KEY_CHAT_STATE, 'generating');
        }
        await completeOnboardingAndGeneratePlan();
    }, [messages, interactionsCount, adjustments, STORAGE_KEY_CHAT, STORAGE_KEY_CHAT_STATE, saveChatState, completeOnboardingAndGeneratePlan]);

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
        setIsSummaryModalVisible(false);
        setIsChatEnded(true);
        const systemMessage: Content = { role: 'system', parts: [{ text: "Ok, gerando seu plano de treino com base no questionário e ajustes..." }] };
        const updatedMessages = [...messages, systemMessage];
        setMessages(updatedMessages);

        if (STORAGE_KEY_CHAT) {
            await saveChatState(STORAGE_KEY_CHAT, updatedMessages, interactionsCount, true, adjustments);
        }
        if (STORAGE_KEY_CHAT_STATE) {
            await secureStorage.setItem(STORAGE_KEY_CHAT_STATE, 'generating');
        }
        await completeOnboardingAndGeneratePlan();
    }, [messages, interactionsCount, adjustments, STORAGE_KEY_CHAT, STORAGE_KEY_CHAT_STATE, saveChatState, completeOnboardingAndGeneratePlan]);

    const handleCancelEndChat = useCallback(() => {
        // ... (implementação inalterada) ...
        setIsSummaryModalVisible(false);
    }, []);

    // textoDireto: caminho das sugestões prontas — 1 toque envia sem digitar.
    const handleSendMessage = useCallback(async (textoDireto?: string) => {
        const textToSend = (textoDireto ?? inputText).trim();
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
                if (chatEndedAfterResponse && STORAGE_KEY_CHAT_STATE) {
                    await secureStorage.setItem(STORAGE_KEY_CHAT_STATE, 'in_progress');
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
        interactionsCount, adjustments, STORAGE_KEY_CHAT, STORAGE_KEY_CHAT_STATE, saveChatState, userId
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
            let chatStateFlag: string | null = null;
            let apiOk = null;

            try {
                // 0. Verificar estado do chat (máquina de estados, NÃO booleano).
                // "completed" = plano gerado, onboarding completo → RootNavigator assume.
                // "generating" = geração em andamento (retomada pós-crash), prossegue.
                // null/"in_progress" = fluxo normal.
                if (STORAGE_KEY_CHAT_STATE) {
                    chatStateFlag = await secureStorage.getItem(STORAGE_KEY_CHAT_STATE);
                }

                if (user?.onboarding_completed && !route.params?.skipChat) {
                    console.log(`[Chat ${userId}] Onboarding já completo; o RootNavigator já exibe o app principal.`);
                    return;
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

                // R1: se havia geração em andamento (crash anterior), prossegue.
                // NUNCA bloqueia a entrada na conversa — o chat é sempre oferecido.
                if (chatStateFlag === 'generating' && loadedQuestionnaireData) {
                    // Recupera os ajustes salvos ANTES de gerar: sem isso, a
                    // retomada (ex.: app morto durante a geração) gerava o
                    // plano ignorando os ajustes feitos no chat — o storage
                    // os tem desde o saveChatState do fluxo normal.
                    if (STORAGE_KEY_CHAT) {
                        const storedChat = await secureStorage.getItem(STORAGE_KEY_CHAT);
                        if (storedChat) {
                            try {
                                const chatState = JSON.parse(storedChat);
                                if (Array.isArray(chatState?.adjustments)) {
                                    const ajustesSalvos = chatState.adjustments.filter(
                                        (a: unknown): a is string => typeof a === 'string',
                                    );
                                    setAdjustments(ajustesSalvos);
                                    adjustmentsRef.current = ajustesSalvos;
                                }
                            } catch (parseError) {
                                console.log(`[Chat ${userId}] Chat salvo ilegível na retomada.`);
                            }
                        }
                    }
                    // Achado #4 do review: se uma geração anterior JÁ salvou um
                    // plano ativo (o app morreu entre a gravação do plano e a
                    // do perfil), adotamos esse plano em vez de pagar outra
                    // geração no Opus. Falha na leitura (offline)? Segue para a
                    // geração normal — comportamento anterior preservado.
                    try {
                        const planoExistente = await getActivePlanId(userId);
                        if (planoExistente) {
                            console.log(`[Chat ${userId}] Plano ativo encontrado na retomada — adotando sem nova geração.`);
                            // Mesmo destino do fluxo normal: revelação primeiro,
                            // onboarding fecha no toque em "Começar".
                            setJobStage('salvo');
                            setReadyPlanId(planoExistente);
                            setIsInitializing(false);
                            return;
                        }
                    } catch {
                        console.log(`[Chat ${userId}] Não foi possível verificar plano existente; seguindo para geração.`);
                    }
                    setIsInitializing(false);
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
                        if (STORAGE_KEY_CHAT_STATE) {
                            await secureStorage.setItem(STORAGE_KEY_CHAT_STATE, 'generating');
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
            // Ver dateCell no QuestionnaireScreen: TextInput em row precisa de
            // minWidth 0 no web, senão não encolhe e empurra o botão de enviar
            // para fora da tela.
            minWidth: 0,
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

        // --- Sugestões prontas ---
        sugestoes: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.md,
        },
        sugestaoChip: {
            minHeight: theme.hitTarget.compact,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.borderRadius.pill,
            backgroundColor: theme.colors.surface.elevated,
        },
        sugestaoTexto: {
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.sm,
            fontWeight: theme.typography.fontWeights.semiBold,
        },

        // --- Construção do plano ---
        construcao: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xxxl,
        },
        construcaoTitulo: {
            marginTop: theme.spacing.xxl,
            marginBottom: theme.spacing.xxxl,
            color: theme.colors.text.primary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.display,
            fontWeight: theme.typography.fontWeights.semiBold,
            letterSpacing: theme.typography.letterSpacing.display,
            textAlign: 'center',
        },
        construcaoEtapas: { alignSelf: 'stretch', gap: theme.spacing.lg },
        etapa: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
        etapaPendente: { opacity: 0.35 },
        etapaMarcador: {
            width: 26,
            height: 26,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: theme.colors.border.strong,
            borderRadius: theme.borderRadius.pill,
        },
        etapaMarcadorAtivo: {
            borderColor: theme.colors.accent.border,
            backgroundColor: theme.colors.accent.soft,
        },
        etapaTexto: {
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.md,
        },
        etapaTextoAtivo: { color: theme.colors.text.primary },
        construcaoDetalhe: {
            marginTop: theme.spacing.xxl,
            color: theme.colors.text.quiet,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.sm,
            textAlign: 'center',
        },

        // --- Revelação ---
        revelacao: {
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing.xxxl,
        },
        revelacaoKicker: {
            marginTop: theme.spacing.xl,
            color: theme.colors.text.accent,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.micro,
            fontWeight: theme.typography.fontWeights.bold,
            letterSpacing: theme.typography.letterSpacing.wide,
            textTransform: 'uppercase',
        },
        revelacaoTitulo: {
            marginTop: theme.spacing.xs,
            color: theme.colors.text.primary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.display,
            fontWeight: theme.typography.fontWeights.semiBold,
            letterSpacing: theme.typography.letterSpacing.display,
            lineHeight: theme.typography.fontSizes.display * theme.typography.lineHeights.tight,
        },
        revelacaoResumo: {
            marginTop: theme.spacing.sm,
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.base,
        },
        revelacaoNota: {
            flexDirection: 'row',
            gap: theme.spacing.md,
            alignItems: 'flex-start',
            marginTop: theme.spacing.xxl,
            padding: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            borderRadius: theme.borderRadius.lg,
            backgroundColor: theme.colors.surface.raised,
        },
        revelacaoNotaTexto: {
            flex: 1,
            color: theme.colors.text.secondary,
            fontFamily: theme.fonts.ui,
            fontSize: theme.typography.fontSizes.sm,
            lineHeight: theme.typography.fontSizes.sm * theme.typography.lineHeights.normal,
        },
        revelacaoNotaForte: {
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeights.semiBold,
        },
        revelacaoCta: { marginTop: theme.spacing.xxl },
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

    // --- Revelação: plano pronto aguardando o aluno entrar -----------------
    if (readyPlanId) {
        const objetivoLabel = OBJETIVO_LABELS[questionnaireData?.objetivo] ?? 'seu objetivo';
        const diasPorSemana = Array.isArray(questionnaireData?.dias_treino)
            ? questionnaireData.dias_treino.length
            : null;
        const tempoMedio = questionnaireData?.tempo_medio_treino_min ?? null;
        return (
            <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
                <View style={styles.revelacao} testID="tela-revelacao">
                    <FModules lit={3} size={34} accessibilityLabel="Plano completo" />
                    <Text style={styles.revelacaoKicker}>Plano pronto</Text>
                    <Text style={styles.revelacaoTitulo} accessibilityRole="header">
                        Seu plano de {objetivoLabel}.
                    </Text>
                    <Text style={styles.revelacaoResumo}>
                        {[
                            diasPorSemana ? `${diasPorSemana} ${diasPorSemana === 1 ? 'treino' : 'treinos'} por semana` : null,
                            tempoMedio ? `~${tempoMedio} min por sessão` : null,
                        ]
                            .filter(Boolean)
                            .join(' · ') || 'Montado a partir das suas respostas.'}
                    </Text>
                    <View style={styles.revelacaoNota}>
                        <FModules lit={1} size={16} />
                        <Text style={styles.revelacaoNotaTexto}>
                            <Text style={styles.revelacaoNotaForte}>Nada aqui é fixo. </Text>
                            Cada treino começa com um check-in — cansaço ou pouco tempo mudam a
                            sessão na hora, sem quebrar o plano.
                        </Text>
                    </View>
                    {ajustesNaoAplicados ? (
                        <Notice
                            tone="warning"
                            title="Os ajustes da conversa não entraram neste plano."
                            description="O plano saiu a partir do seu questionário. Você pode pedir mudanças em qualquer treino depois."
                            style={styles.aviso}
                        />
                    ) : null}
                    {chatError ? <Notice tone="danger" title={chatError} style={styles.aviso} /> : null}
                    <Button
                        label="Começar"
                        icon="arrow-right"
                        onPress={handleEnterApp}
                        loading={isEnteringApp}
                        style={styles.revelacaoCta}
                    />
                </View>
            </SafeAreaView>
        );
    }

    // --- Construção: etapas reais do job no lugar de spinner ---------------
    if (isGeneratingPlan) {
        const etapaAtual = indiceDaEtapa(jobStage);
        return (
            <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
                <View style={styles.construcao} testID="tela-construcao">
                    <FModules
                        lit={Math.min(3, etapaAtual)}
                        size={34}
                        accessibilityLabel="Progresso da construção do plano"
                    />
                    <Text style={styles.construcaoTitulo} accessibilityRole="header">
                        Construindo seu plano.
                    </Text>
                    <View style={styles.construcaoEtapas}>
                        {ETAPAS_CONSTRUCAO.map((etapa, ix) => {
                            const feita = ix < etapaAtual;
                            const ativa = ix === etapaAtual;
                            return (
                                <View key={etapa.rotulo} style={[styles.etapa, !feita && !ativa && styles.etapaPendente]}>
                                    <View style={[styles.etapaMarcador, (feita || ativa) && styles.etapaMarcadorAtivo]}>
                                        {feita ? (
                                            <Feather name="check" size={12} color={theme.colors.accent.on} />
                                        ) : ativa ? (
                                            <ActivityIndicator size="small" color={theme.colors.accent.main} />
                                        ) : null}
                                    </View>
                                    <Text style={[styles.etapaTexto, (feita || ativa) && styles.etapaTextoAtivo]}>
                                        {etapa.rotulo}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                    {jobProgressText ? (
                        <Text style={styles.construcaoDetalhe}>{jobProgressText}</Text>
                    ) : null}
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
    // Aviso B2 (indisponibilidade com CTA de saída). Quando ele está visível,
    // o chatError de indisponibilidade setado no init NÃO renderiza — eram
    // dois banners empilhados dizendo a mesma coisa.
    const avisoIndisponibilidadeVisivel =
        isApiAvailable === false && !showInitialChoice && !isChatEnded && !isGeneratingPlan;
    const chatErrorRedundante =
        avisoIndisponibilidadeVisivel && !!chatError?.startsWith('Assistente IA indisponível');

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

                    {chatError && !showInitialChoice && !chatErrorRedundante && (
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
                    {avisoIndisponibilidadeVisivel && (
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

                    {/* Sugestões prontas: só antes da 1ª interação — 1 toque envia. */}
                    {!showInitialChoice && !isChatEnded && isApiAvailable && interactionsCount === 0 && !isLoadingAi ? (
                        <View style={styles.sugestoes}>
                            {SUGESTOES_AJUSTE.map((sugestao) => (
                                <Pressable
                                    key={sugestao}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Sugerir: ${sugestao}`}
                                    onPress={() => handleSendMessage(sugestao)}
                                    style={({ pressed }) => [styles.sugestaoChip, pressed && styles.acaoInativa]}
                                >
                                    <Text style={styles.sugestaoTexto}>{sugestao}</Text>
                                </Pressable>
                            ))}
                        </View>
                    ) : null}

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
                                onPress={() => handleSendMessage()}
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
                                    <Text style={styles.textoSistema}>
                                        {jobProgressText || 'Solicitando geração do plano...'}
                                    </Text>
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