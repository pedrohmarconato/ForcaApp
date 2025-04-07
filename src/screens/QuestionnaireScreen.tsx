// /home/pmarconato/ForcaApp/src/screens/QuestionnaireScreen.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react'; // Adicionado useCallback
import {
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
    TextInput as PaperTextInput,
    HelperText,
    useTheme as usePaperTheme,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext'; // Importa o hook de autenticação

// --- Cores e Estilos (sem alterações) ---
const NEON_YELLOW = '#EBFF00';
const DARK_GRADIENT_START = '#0A0A0A';
const DARK_GRADIENT_END = '#1A1A1A';
const CARD_BG = 'rgba(0, 0, 0, 0.4)';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.1)';
const BORDER_FOCUS_COLOR = NEON_YELLOW;
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';
const PLACEHOLDER_COLOR = 'rgba(255, 255, 255, 0.4)';
const TEXT_COLOR = '#FFFF';
const TEXT_SECONDARY_COLOR = 'rgba(255, 255, 255, 0.6)';
const TEXT_TERTIARY_COLOR = 'rgba(255, 255, 255, 0.4)';
const BUTTON_TEXT_DARK = '#0A0A0A';
const ERROR_COLOR = '#FF4D4D';
const SUCCESS_COLOR = '#4CAF50';

// --- Tipos e Constantes (sem alterações) ---
type Option = { label: string; value: string };
type DayOption = { label: string; value: string };
type TimeOption = { label: string; value: number };

const GENDER_OPTIONS: Option[] = [ { label: 'Masculino', value: 'male' }, { label: 'Feminino', value: 'female' }, { label: 'Outro', value: 'other' }, { label: 'Prefiro não dizer', value: 'not_specified'} ];
const EXPERIENCE_LEVELS: Option[] = [ { label: 'Iniciante (Nunca treinei ou < 6 meses)', value: 'beginner' }, { label: 'Intermediário (6 meses - 2 anos)', value: 'intermediate' }, { label: 'Avançado (> 2 anos)', value: 'advanced' } ];
const GOALS: Option[] = [ { label: 'Perda de Peso', value: 'weight_loss' }, { label: 'Ganho de Massa Muscular', value: 'muscle_gain' }, { label: 'Melhorar Condicionamento Físico', value: 'fitness_improvement' }, { label: 'Saúde e Bem-estar', value: 'health_wellness' } ];
const DAYS_OF_WEEK: DayOption[] = [ { label: 'S', value: 'sun' }, { label: 'T', value: 'mon' }, { label: 'Q', value: 'tue' }, { label: 'Q', value: 'wed' }, { label: 'S', value: 'thu' }, { label: 'S', value: 'fri' }, { label: 'D', value: 'sat' } ];
const TIME_OPTIONS: TimeOption[] = [ { label: '30-45 min', value: 45 }, { label: '45-60 min', value: 60 }, { label: '60-90 min', value: 90 }, { label: '+90 min', value: 120 } ];

const STORAGE_KEY_BASE = '@questionnaire_data';
const API_BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1` : '';
if (!API_BASE_URL) { console.error("CRITICAL ERROR: Supabase URL is not configured!"); }

// --- Função API (sem alterações) ---
// Função para salvar os dados do questionário via API Supabase
const saveQuestionnaireDataAPI = async (authToken: string | null, formDataWithUserId: any): Promise<any> => {
    const endpoint = `${API_BASE_URL}/questionario_usuario`;
    if (!API_BASE_URL) throw new Error("A URL da API não está configurada.");
    if (!authToken) throw new Error("Token de autenticação ausente.");
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) { console.error("CRITICAL ERROR: Supabase Anon Key is not configured!"); throw new Error("Chave da API não configurada."); }
    const headers: HeadersInit = { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${authToken}`, 'Prefer': 'return=minimal' };
    try {
    const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(formDataWithUserId) });
    if (!response.ok) {
    let errorBody = null;
    try { errorBody = await response.json(); } catch (e) { /* ignore */ }
    const details = errorBody?.details ? `Detalhes: ${errorBody.details}` : '';
    const message = errorBody?.message || 'Erro desconhecido do servidor.';
    console.error(`[API] Erro ao salvar questionário: ${response.status} - ${message} ${details}`, errorBody);

    // Detectar token expirado
    if (response.status === 401 && (errorBody?.code === 'PGRST301' || message.includes('JWT expired'))) {
    throw new Error(`TOKEN_EXPIRED`);
    }

    if (response.status === 409 || errorBody?.code === '23505') {
    throw new Error(`QUESTIONNAIRE_ALREADY_EXISTS`);
    }
    if (response.status === 401 || response.status === 403) {
    throw new Error(`Sem permissão para salvar os dados. Verifique as políticas RLS. (Erro ${response.status})`);
    }
    throw new Error(`Falha ao salvar o questionário. Status: ${response.status}. ${message}`);
    }
    console.log('[API] Dados do questionário INSERIDOS com sucesso.');
    return { success: true };
    } catch (error: any) {
    if (error instanceof Error) { console.error('[API] Erro capturado ao salvar questionário:', error.message); throw error; }
    else { console.error('[API] Erro de rede/inesperado ao salvar questionário:', error); throw new Error("Erro de conexão ao tentar salvar o questionário."); }
    }
};

const QuestionnaireScreen = () => {
  const navigation = useNavigation();
  const paperTheme = usePaperTheme();

  // --- Estados ---
  const [isLoading, setIsLoading] = useState(false); // Loading geral (submissão)
  const [error, setError] = useState<string | null>(null);
  // MODIFICADO: Renomeado e adicionado estado para controlar o carregamento inicial do storage
  const [isLoadingStorage, setIsLoadingStorage] = useState(true); // Loading específico do AsyncStorage
  const [dataLoadedFromStorage, setDataLoadedFromStorage] = useState(false); // Indica se a tentativa de carregar do storage já ocorreu

  // MODIFICADO: Obtém loadingSession do AuthContext para saber quando a autenticação inicial terminou
  const { user, session, updateProfile, signOut, loadingSession } = useAuth();
  const userId = user?.id;
  const authToken = session?.access_token;

  // Estados do formulário (sem alterações)
  const [nome, setNome] = useState('');
  const [diaNascimento, setDiaNascimento] = useState('');
  const [mesNascimento, setMesNascimento] = useState('');
  const [anoNascimento, setAnoNascimento] = useState('');
  const [genero, setGenero] = useState<string | null>(null);
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [experienciaTreino, setExperienciaTreino] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const [temLesoes, setTemLesoes] = useState<boolean | null>(null);
  const [lesoes, setLesoes] = useState('');
  const [descricaoLesao, setDescricaoLesao] = useState('');
  const [trainingDays, setTrainingDays] = useState<{ [key: string]: boolean }>({});
  const [includeCardio, setIncludeCardio] = useState<boolean | null>(null);
  const [includeStretching, setIncludeStretching] = useState<boolean | null>(null);
  const [averageTrainingTime, setAverageTrainingTime] = useState<number | null>(null);
  const [isSubmitPressed, setIsSubmitPressed] = useState(false);

  // Chave de armazenamento local baseada no userId
  const userStorageKey = useMemo(() => userId ? `${STORAGE_KEY_BASE}_${userId}` : null, [userId]);

  // --- Lidar com expiração da sessão (usando useCallback) ---
  const handleSessionExpiration = useCallback(async () => {
    Alert.alert(
    'Sessão Expirada',
    'Sua sessão expirou. Por favor, faça login novamente.',
    [
    {
    text: 'OK',
    onPress: async () => {
    setIsLoading(true); // Mostra loading geral
    try {
    if (typeof signOut === 'function') {
    await signOut(); // Usa a função signOut do AuthContext
    } else {
    // Fallback caso signOut não esteja disponível (pouco provável)
    await AsyncStorage.removeItem('@userShouldStayLoggedIn');
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    } catch (error) {
    console.error("[QuestionnaireScreen] Erro ao fazer logout via handleSessionExpiration:", error);
    // Força navegação para login em último caso
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } finally {
    setIsLoading(false);
    }
    }
    }
    ]
    );
  }, [signOut, navigation]); // Depende de signOut e navigation

  // --- Verificação de sessão válida (sem alterações, mas usa handleSessionExpiration com useCallback) ---
  useEffect(() => {
    const checkValidSession = async () => {
    if (session && error) { // Se temos sessão mas ocorreu um erro (pode ser de token)
    console.log("[QuestionnaireScreen] Verificando validade da sessão devido a erro anterior...");
    try {
    const testEndpoint = `${API_BASE_URL}/profiles?select=id&limit=1`;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey || !authToken) throw new Error("Dados de autenticação incompletos para teste.");
    const response = await fetch(testEndpoint, { headers: { 'apikey': anonKey, 'Authorization': `Bearer ${authToken}` } });
    if (!response.ok) {
    console.error("[QuestionnaireScreen] Sessão inválida detectada em teste de requisição.");
    handleSessionExpiration(); // Chama a função de logout
    } else {
     console.log("[QuestionnaireScreen] Sessão ainda válida após teste.");
    }
    } catch (err) {
    console.error("[QuestionnaireScreen] Erro ao testar validade da sessão:", err);
    handleSessionExpiration(); // Chama a função de logout em caso de erro no teste
    }
    }
    };
    checkValidSession();
  }, [session, error, authToken, handleSessionExpiration]); // Adicionado handleSessionExpiration

  // --- Carregar Dados Salvos ---
  // MODIFICADO: Este useEffect agora depende de `userId`, `userStorageKey`, `loadingSession` e `dataLoadedFromStorage`.
  // Ele só tentará carregar os dados quando a sessão não estiver mais carregando E o userId estiver disponível E ainda não tentou carregar.
  useEffect(() => {
    const loadSavedData = async () => {
      // Condições para NÃO prosseguir com o carregamento:
      // 1. A sessão ainda está carregando (loadingSession é true)
      // 2. Não temos um userId (usuário não logado ou ainda não disponível)
      // 3. A chave de storage não pôde ser gerada (consequência de não ter userId)
      // 4. Já tentamos carregar os dados anteriormente (dataLoadedFromStorage é true)
      if (loadingSession || !userId || !userStorageKey || dataLoadedFromStorage) {
        if (!loadingSession && !userId && !dataLoadedFromStorage) {
          // Se a sessão carregou, não há usuário e ainda não tentamos carregar
          console.log("[QuestionnaireScreen] Sessão carregada, sem usuário. Marcando carregamento do storage como concluído (sem dados).");
          setIsLoadingStorage(false); // Finaliza o loading específico do storage
          setDataLoadedFromStorage(true); // Marca que a tentativa (neste caso, não carregar) ocorreu
        } else if (dataLoadedFromStorage) {
           // Se já tentamos carregar antes, não faz nada.
           // console.log("[QuestionnaireScreen] Tentativa de carregamento do storage já realizada.");
        } else {
           // Se ainda está carregando a sessão ou esperando userId
           console.log("[QuestionnaireScreen] Aguardando fim do loading da sessão ou disponibilidade do userId para carregar dados do storage...");
           // Mantém setIsLoadingStorage(true) (estado inicial)
        }
        return; // Sai da função se alguma das condições acima for verdadeira
      }

      // Se chegou aqui, significa que:
      // - loadingSession é false
      // - userId existe
      // - userStorageKey existe
      // - dataLoadedFromStorage é false (primeira vez que tentamos carregar nesta montagem/mudança de dependência)

      console.log(`[QuestionnaireScreen] Iniciando carregamento de dados do AsyncStorage com a chave: ${userStorageKey}`);
      setIsLoadingStorage(true); // Garante que o loading do storage está ativo
      try {
        const savedData = await AsyncStorage.getItem(userStorageKey);
        if (savedData) {
          const data = JSON.parse(savedData);
          console.log('[QuestionnaireScreen] Dados salvos carregados do AsyncStorage para o usuário:', userId);
          // Preenche os estados com os dados carregados
          setNome(data.nome || '');
          if (data.data_nascimento) { const [ano, mes, dia] = data.data_nascimento.split('-'); setAnoNascimento(ano || ''); setMesNascimento(mes || ''); setDiaNascimento(dia || ''); }
          setGenero(data.genero || null);
          setPeso(String(data.peso_kg || data.peso || ''));
          setAltura(String(data.altura_cm || data.altura || ''));
          setExperienciaTreino(data.experiencia_treino || null);
          setObjetivo(data.objetivo || null);
          setTemLesoes(data.tem_lesoes !== undefined ? data.tem_lesoes : null);
          setLesoes(data.lesoes_detalhes || data.lesoes || '');
          if (data.dias_treino && Array.isArray(data.dias_treino)) { const daysObj: { [key: string]: boolean } = {}; data.dias_treino.forEach((day: string) => { daysObj[day] = true; }); setTrainingDays(daysObj); }
          setIncludeCardio(data.inclui_cardio !== undefined ? data.inclui_cardio : null);
          setIncludeStretching(data.inclui_alongamento !== undefined ? data.inclui_alongamento : null);
          setAverageTrainingTime(data.tempo_medio_treino_min || null);
        } else {
          console.log('[QuestionnaireScreen] Nenhum dado salvo encontrado no AsyncStorage para o usuário:', userId);
          // Opcional: Resetar campos se não encontrar dados? (Decidi não resetar para manter o que o usuário pode ter digitado antes)
        }
      } catch (error) {
        console.error('[QuestionnaireScreen] Erro ao carregar dados salvos do AsyncStorage:', error);
        setError("Erro ao carregar dados salvos localmente."); // Define um erro específico
      } finally {
        setIsLoadingStorage(false); // Finaliza o loading específico do storage
        setDataLoadedFromStorage(true); // Marca que a tentativa de carregamento (com sucesso ou falha) ocorreu
        console.log('[QuestionnaireScreen] Carregamento de dados do AsyncStorage finalizado.');
      }
    };

    loadSavedData();
    // As dependências garantem que o hook re-executa se o estado de loading da sessão mudar,
    // se o userId mudar, ou se a chave de storage mudar (embora esta dependa do userId).
    // dataLoadedFromStorage evita re-execuções desnecessárias após a primeira tentativa.
  }, [userId, userStorageKey, loadingSession, dataLoadedFromStorage]);

  // --- Limpar Erro no Foco (sem alterações) ---
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { setError(null); });
    return unsubscribe;
  }, [navigation]);

  // --- Handlers (sem alterações) ---
  const toggleTrainingDay = (dayValue: string) => { setTrainingDays(prev => ({ ...prev, [dayValue]: !prev[dayValue] })); };
  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);
  const isFormValid = () => {
    const selectedDaysCount = getSelectedDays().length;
    const diaNum = parseInt(diaNascimento, 10);
    const mesNum = parseInt(mesNascimento, 10);
    const anoNum = parseInt(anoNascimento, 10);
    const isDateValid = /^\d{1,2}$/.test(diaNascimento) && diaNum > 0 && diaNum <= 31 &&
    /^\d{1,2}$/.test(mesNascimento) && mesNum > 0 && mesNum <= 12 &&
    /^\d{4}$/.test(anoNascimento) && anoNum > 1900 && anoNum <= new Date().getFullYear();

    return (
    !!nome &&
    isDateValid &&
    !!genero &&
    !!peso && /^\d+(\.\d+)?$/.test(peso) && parseFloat(peso) > 0 &&
    !!altura && /^\d+$/.test(altura) && parseInt(altura, 10) > 0 &&
    !!experienciaTreino &&
    !!objetivo &&
    temLesoes !== null &&
    (!temLesoes || (temLesoes && (lesoes.trim() !== '' || descricaoLesao.trim() !== ''))) &&
    selectedDaysCount > 0 &&
    includeCardio !== null &&
    includeStretching !== null &&
    averageTrainingTime !== null
    );
  };

  // --- handleSubmit ---
  // MODIFICADO: Removida a chamada a `updateProfile({ onboarding_completed: true })` daqui.
  // Essa atualização agora deve ocorrer na tela PostQuestionnaireChat, após a interação do usuário.
  const handleSubmit = async () => {
    setIsSubmitPressed(true);
    // Verifica se updateProfile existe no contexto (embora não seja mais usado aqui, é uma boa prática verificar)
    if (typeof updateProfile !== 'function') { console.error("[QuestionnaireScreen] A função updateProfile não está disponível no AuthContext!"); Alert.alert('Erro Interno', 'Funcionalidade indisponível. Tente novamente mais tarde.'); setIsSubmitPressed(false); return; }
    if (!userId || !authToken) { Alert.alert('Erro', 'Usuário não autenticado. Faça login novamente.'); setIsSubmitPressed(false); return; }
    if (!userStorageKey) { Alert.alert('Erro Interno', 'Não foi possível determinar o armazenamento local.'); setIsSubmitPressed(false); return; }

    if (!isFormValid()) {
    setError('Por favor, preencha todos os campos obrigatórios corretamente.');
    Alert.alert('Campos Incompletos', 'Verifique se todos os campos obrigatórios foram preenchidos corretamente, incluindo data de nascimento, peso e altura válidos.');
    setIsSubmitPressed(false);
    return;
    }

    setError(null); setIsLoading(true); // Ativa o loading geral para a submissão

    // Prepara os dados para API e Storage (sem alterações)
    const formattedDate = `${anoNascimento}-${mesNascimento.padStart(2, '0')}-${diaNascimento.padStart(2, '0')}`;
    const pesoNum = parseFloat(peso) || null;
    const alturaNum = parseInt(altura, 10) || null;
    const lesoesDetalhes = temLesoes ? `${lesoes}${descricaoLesao ? ` (${descricaoLesao})` : ''}`.trim() || null : null;
    const formDataForApi = { usuario_id: userId, data_nascimento: formattedDate, genero: genero, peso_kg: pesoNum, altura_cm: alturaNum, experiencia_treino: experienciaTreino, objetivo: objetivo, tem_lesoes: temLesoes, lesoes_detalhes: lesoesDetalhes, dias_treino: getSelectedDays(), inclui_cardio: includeCardio, inclui_alongamento: includeStretching, tempo_medio_treino_min: averageTrainingTime };
    const formDataForStorage = { ...formDataForApi, nome: nome }; // Inclui o nome para o storage local

    try {
    // 1. Salvar no AsyncStorage primeiro (para ter backup local)
    await AsyncStorage.setItem(userStorageKey, JSON.stringify(formDataForStorage));
    console.log('[QuestionnaireScreen] Dados salvos no AsyncStorage.');

    // 2. Tentar salvar na API (Supabase)
    try {
      await saveQuestionnaireDataAPI(authToken, formDataForApi);
      console.log('[QuestionnaireScreen] Dados salvos na API com sucesso.');
    } catch (apiError: any) {
      // Verificar se é erro de token expirado
      if (apiError.message === 'TOKEN_EXPIRED') {
        console.log('[QuestionnaireScreen] Token expirado detectado durante submissão API');
        handleSessionExpiration(); // Lida com a expiração (mostra alerta e desloga)
        // Não continua a execução, pois o usuário será deslogado
        return; // Interrompe a execução do handleSubmit
      }
      // Se for erro 409 (já existe), apenas loga e continua, pois vamos navegar para o chat de qualquer forma
      if (apiError.message === 'QUESTIONNAIRE_ALREADY_EXISTS') {
         console.warn('[QuestionnaireScreen] API indica que o questionário já existe (409). Prosseguindo para o chat.');
         // Não precisa de Alert aqui, o fluxo normal levará ao chat
      } else {
        // Outros erros da API, lança para o catch externo tratar
        throw apiError;
      }
    }

    // 3. Navegar para a tela de Chat
    // REMOVIDO: await updateProfile({ onboarding_completed: true });
    // A linha acima foi removida. A atualização do perfil ocorrerá APÓS o chat.
    console.log('[QuestionnaireScreen] Navegando para PostQuestionnaireChat...');
    navigation.navigate('PostQuestionnaireChat', { formData: formDataForStorage });

    } catch (submissionError: any) {
      console.error('[QuestionnaireScreen] Falha no processo de submissão (fora do erro 409/token):', submissionError);
      let errorMessage = submissionError?.message || 'Erro inesperado ao salvar os dados.';

      // O tratamento para QUESTIONNAIRE_ALREADY_EXISTS foi movido para dentro do try/catch da API
      // e permite a continuação do fluxo para a navegação, então não precisa ser tratado aqui.

      if (errorMessage.includes('Sessão expirada')) {
        // Já tratado pelo handleSessionExpiration se o erro veio da API
        setError('Sua sessão expirou. Por favor, faça login novamente.');
      } else {
        // Erros gerais (problema no AsyncStorage, outros erros da API não tratados especificamente)
        setError(`Erro ao salvar: ${errorMessage}`);
        Alert.alert('Erro ao Salvar', `Não foi possível salvar seus dados. Detalhes: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false); // Desativa o loading geral
      setIsSubmitPressed(false);
    }
  };

  // --- Tema e Estilos (sem alterações) ---
  const inputTheme = { ...paperTheme, colors: { ...paperTheme.colors, primary: BORDER_FOCUS_COLOR, text: TEXT_COLOR, placeholder: PLACEHOLDER_COLOR, background: INPUT_BG, outline: BORDER_COLOR, onSurfaceVariant: PLACEHOLDER_COLOR, error: ERROR_COLOR, }, roundness: 12, };
  const styles = useMemo(() => StyleSheet.create({
    fullScreenGradient: { flex: 1 },
    keyboardAvoiding: { flex: 1 },
    scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 0 },
    card: { width: '100%', maxWidth: 500, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER_COLOR, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10, marginVertical: 20, alignSelf: 'center' },
    cardBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: CARD_BG },
    contentContainer: { padding: 24, position: 'relative', zIndex: 1 },
    headerContainer: { alignItems: 'center', marginBottom: 24 },
    title: { color: TEXT_COLOR, fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    subtitle: { color: TEXT_SECONDARY_COLOR, fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(255, 255, 255, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
    section: { marginBottom: 20 },
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: TEXT_COLOR, marginBottom: 16, marginTop: 8, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR, paddingBottom: 6 },
    label: { fontSize: 16, color: TEXT_SECONDARY_COLOR, marginBottom: 10, fontWeight: '600' },
    input: { marginBottom: 16 },
    standardInput: { backgroundColor: INPUT_BG, color: TEXT_COLOR, paddingHorizontal: 16, paddingVertical: 14, borderRadius: inputTheme.roundness, fontSize: 16, borderWidth: 1, borderColor: BORDER_COLOR, height: 58 },
    textArea: { height: 100, textAlignVertical: 'top', paddingTop: 14 },
    dateContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    dateInput: { width: '28%', textAlign: 'center' },
    yearInput: { width: '36%', textAlign: 'center' },
    optionButton: { backgroundColor: INPUT_BG, paddingVertical: 14, paddingHorizontal: 16, borderRadius: inputTheme.roundness, marginBottom: 10, borderWidth: 1, borderColor: BORDER_COLOR, alignItems: 'center' },
    optionButtonSelected: { backgroundColor: NEON_YELLOW, borderColor: NEON_YELLOW },
    optionText: { color: TEXT_SECONDARY_COLOR, fontSize: 16, textAlign: 'center' },
    optionTextSelected: { color: BUTTON_TEXT_DARK, fontWeight: 'bold' },
    yesNoContainer: { flexDirection: 'row', justifyContent: 'space-around', gap: 10 },
    yesNoButton: { flex: 1 },
    daysContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
    dayButton: { backgroundColor: INPUT_BG, paddingVertical: 10, paddingHorizontal: 0, borderRadius: 20, borderWidth: 1, borderColor: BORDER_COLOR, alignItems: 'center', justifyContent: 'center', flexBasis: '12%', minWidth: 48, height: 48 },
    dayButtonSelected: { backgroundColor: NEON_YELLOW, borderColor: NEON_YELLOW },
    dayText: { color: TEXT_SECONDARY_COLOR, fontSize: 16, fontWeight: 'bold' },
    dayTextSelected: { color: BUTTON_TEXT_DARK },
    actionButtonBase: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, marginTop: 24 },
    actionButtonIdle: { backgroundColor: NEON_YELLOW, elevation: 5, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 10 },
    actionButtonPressed: { backgroundColor: '#D4E600', elevation: 15, shadowColor: NEON_YELLOW, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
    actionButtonText: { color: BUTTON_TEXT_DARK, fontSize: 16, fontWeight: 'bold', marginRight: 8 },
    buttonDisabled: { backgroundColor: 'rgba(235, 255, 0, 0.5)', elevation: 0, shadowOpacity: 0 },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    loadingText: { color: TEXT_COLOR, marginTop: 10 },
    errorText: { color: ERROR_COLOR, textAlign: 'center', marginTop: 0, marginBottom: 16, minHeight: 20 },
    decorativeCircle: { position: 'absolute', width: 500, height: 500, borderRadius: 250, opacity: 0.1 },
    circleTopLeft: { top: -250, left: -250, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
    circleBottomRight: { bottom: -250, right: -250, backgroundColor: NEON_YELLOW },
    footerText: { color: TEXT_TERTIARY_COLOR, fontSize: 12, textAlign: 'center', marginTop: 32, paddingBottom: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    column: { flex: 1 },
  }), [paperTheme.roundness]);

  // --- Render Helpers (sem alterações) ---
  const renderOptions = (options: Array<Option | TimeOption>, selectedValue: string | number | null, onSelect: (value: string | number) => void, title: string,) => ( <View style={styles.section}><Text style={styles.label}>{title}</Text>{options.map((option) => (<TouchableOpacity key={option.value.toString()} style={[ styles.optionButton, selectedValue === option.value && styles.optionButtonSelected, ]} onPress={() => onSelect(option.value)}><Text style={[ styles.optionText, selectedValue === option.value && styles.optionTextSelected, ]}>{option.label}</Text></TouchableOpacity>))}</View> );
  const renderYesNo = (value: boolean | null, onSelect: (value: boolean) => void, title: string,) => ( <View style={styles.section}><Text style={styles.label}>{title}</Text><View style={styles.yesNoContainer}><TouchableOpacity style={[ styles.optionButton, styles.yesNoButton, value === true && styles.optionButtonSelected, ]} onPress={() => onSelect(true)}><Text style={[styles.optionText, value === true && styles.optionTextSelected]}>Sim</Text></TouchableOpacity><TouchableOpacity style={[ styles.optionButton, styles.yesNoButton, value === false && styles.optionButtonSelected, ]} onPress={() => onSelect(false)}><Text style={[styles.optionText, value === false && styles.optionTextSelected]}>Não</Text></TouchableOpacity></View></View> );

  // --- Loading Overlay ---
  const LoadingOverlay = ({ text = "Carregando..." }: { text?: string }) => ( <View style={styles.loadingOverlay}><ActivityIndicator size="large" color={NEON_YELLOW} /><Text style={styles.loadingText}>{text}</Text></View> );

  // MODIFICADO: Tela de loading principal agora depende de `loadingSession` (do AuthContext)
  // E também de `isLoadingStorage` para garantir que a tentativa de carregar do storage ocorreu.
  if (loadingSession || isLoadingStorage) {
    return (
      <LinearGradient colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]} style={styles.fullScreenGradient}>
        <LoadingOverlay text={loadingSession ? "Verificando sessão..." : "Carregando dados..."} />
      </LinearGradient>
    );
  }

  // --- Renderização Principal (sem alterações na estrutura JSX, apenas lógica de loading acima) ---
  return (
    <LinearGradient colors={[DARK_GRADIENT_START, DARK_GRADIENT_END]} style={styles.fullScreenGradient}>
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding}>
    {/* O isLoading geral (para salvar/submeter) continua aqui */}
    {isLoading && <LoadingOverlay text="Salvando dados..." />}
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
    <View style={styles.card}>
    <View style={styles.cardBackground} />
    <View style={styles.contentContainer}>
    <View style={styles.headerContainer}>
    <Text style={styles.title}>Conte-nos sobre você</Text>
    <Text style={styles.subtitle}>Para personalizar sua experiência</Text>
    </View>
    <Text style={styles.errorText}>{error || ' '}</Text>

    <Text style={styles.sectionHeader}>Informações Pessoais</Text>
    <View style={styles.section}>
    <PaperTextInput
    label="Nome Completo"
    value={nome}
    onChangeText={setNome}
    autoCapitalize="words"
    style={styles.input}
    mode="outlined"
    theme={inputTheme}
    textColor={TEXT_COLOR}
    selectionColor={NEON_YELLOW}
    />
    </View>
    <View style={styles.section}>
    <Text style={styles.label}>Data de Nascimento</Text>
    <View style={styles.dateContainer}>
    <TextInput
    style={[styles.standardInput, styles.dateInput]}
    placeholder="DD"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={diaNascimento}
    onChangeText={setDiaNascimento}
    keyboardType="number-pad"
    maxLength={2}
    />
    <TextInput
    style={[styles.standardInput, styles.dateInput]}
    placeholder="MM"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={mesNascimento}
    onChangeText={setMesNascimento}
    keyboardType="number-pad"
    maxLength={2}
    />
    <TextInput
    style={[styles.standardInput, styles.yearInput]}
    placeholder="AAAA"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={anoNascimento}
    onChangeText={setAnoNascimento}
    keyboardType="number-pad"
    maxLength={4}
    />
    </View>
    </View>
    {renderOptions(GENDER_OPTIONS, genero, (v) => setGenero(v as string), 'Gênero')}
    <View style={styles.section}>
    <View style={styles.row}>
    <View style={styles.column}>
    <Text style={styles.label}>Peso (kg)</Text>
    <TextInput
    style={styles.standardInput}
    placeholder="Ex: 75.5"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={peso}
    onChangeText={setPeso}
    keyboardType="numeric"
    />
    </View>
    <View style={styles.column}>
    <Text style={styles.label}>Altura (cm)</Text>
    <TextInput
    style={styles.standardInput}
    placeholder="Ex: 180"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={altura}
    onChangeText={setAltura}
    keyboardType="numeric"
    />
    </View>
    </View>
    </View>

    <Text style={styles.sectionHeader}>Experiência e Objetivos</Text>
    {renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string), 'Nível de experiência com treinos?')}
    {renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string), 'Objetivo principal?')}

    <Text style={styles.sectionHeader}>Preferências de Treino</Text>
    <View style={styles.section}>
    <Text style={styles.label}>Dias da semana para treinar?</Text>
    <View style={styles.daysContainer}>
    {DAYS_OF_WEEK.map(day => (
    <TouchableOpacity
    key={day.value}
    style={[styles.dayButton, trainingDays[day.value] && styles.dayButtonSelected]}
    onPress={() => toggleTrainingDay(day.value)}
    >
    <Text style={[styles.dayText, trainingDays[day.value] && styles.dayTextSelected]}>{day.label}</Text>
    </TouchableOpacity>
    ))}
    </View>
    </View>
    {renderOptions(TIME_OPTIONS, averageTrainingTime, (v) => setAverageTrainingTime(v as number), 'Tempo médio disponível por treino?')}
    {renderYesNo(includeCardio, setIncludeCardio, 'Incluir Cardio no plano?')}
    {renderYesNo(includeStretching, setIncludeStretching, 'Incluir Alongamentos no plano?')}

    <Text style={styles.sectionHeader}>Saúde e Restrições</Text>
    {renderYesNo(temLesoes, setTemLesoes, 'Possui alguma lesão ou restrição médica?')}
    {temLesoes === true && (
    <>
    <View style={styles.section}>
    <Text style={styles.label}>Quais lesões/restrições? (Opcional)</Text>
    <TextInput
    style={styles.standardInput}
    placeholder="Ex: Dor no joelho, Hérnia L5"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={lesoes}
    onChangeText={setLesoes}
    />
    </View>
    <View style={styles.section}>
    <Text style={styles.label}>Descreva brevemente (Opcional)</Text>
    <TextInput
    style={[styles.standardInput, styles.textArea]}
    placeholder="Ex: Dor ao agachar, evitar impacto"
    placeholderTextColor={PLACEHOLDER_COLOR}
    value={descricaoLesao}
    onChangeText={setDescricaoLesao}
    multiline
    />
    </View>
    </>
    )}

    <Pressable
    onPress={handleSubmit}
    disabled={!isFormValid() || isLoading} // Desabilita se formulário inválido OU se está salvando
    onPressIn={() => setIsSubmitPressed(true)}
    onPressOut={() => setIsSubmitPressed(false)}
    style={({ pressed }) => [
    styles.actionButtonBase,
    isSubmitPressed || pressed ? styles.actionButtonPressed : styles.actionButtonIdle,
    (!isFormValid() || isLoading) ? styles.buttonDisabled : null,
    ]}
    >
    {isLoading ? (
    <ActivityIndicator color={BUTTON_TEXT_DARK} size="small" />
    ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text style={styles.actionButtonText}>Conversar com IA</Text>
    <Feather name="message-circle" size={20} color={BUTTON_TEXT_DARK} />
    </View>
    )}
    </Pressable>

    <Text style={styles.footerText}>Desenvolvido no Brasil</Text>
    </View>
    </View>
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
};

export default QuestionnaireScreen;