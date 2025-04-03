// src/screens/QuestionnaireScreen.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Importe o contexto de autenticação
import { useAuth } from '../contexts/AuthContext';

// Tipos e Constantes (sem alterações)
type Option = { label: string; value: string };
type DayOption = { label: string; value: string };
type TimeOption = { label: string; value: number };

const GENDER_OPTIONS: Option[] = [
  { label: 'Masculino', value: 'male' },
  { label: 'Feminino', value: 'female' },
  { label: 'Outro', value: 'other' },
  { label: 'Prefiro não dizer', value: 'not_specified'}
];
const EXPERIENCE_LEVELS: Option[] = [
  { label: 'Iniciante (Nunca treinei ou < 6 meses)', value: 'beginner' },
  { label: 'Intermediário (6 meses - 2 anos)', value: 'intermediate' },
  { label: 'Avançado (> 2 anos)', value: 'advanced' }
];
const GOALS: Option[] = [
  { label: 'Perda de Peso', value: 'weight_loss' },
  { label: 'Ganho de Massa Muscular', value: 'muscle_gain' },
  { label: 'Melhorar Condicionamento Físico', value: 'fitness_improvement' },
  { label: 'Saúde e Bem-estar', value: 'health_wellness' }
];
const DAYS_OF_WEEK: DayOption[] = [
  { label: 'S', value: 'sun' }, { label: 'T', value: 'mon' }, { label: 'Q', value: 'tue' },
  { label: 'Q', value: 'wed' }, { label: 'S', value: 'thu' }, { label: 'S', value: 'fri' },
  { label: 'D', value: 'sat' }
];
const TIME_OPTIONS: TimeOption[] = [
  { label: '30-45 minutos', value: 45 }, { label: '45-60 minutos', value: 60 },
  { label: '60-90 minutos', value: 90 }, { label: '+90 minutos', value: 120 }
];

// Chave para dados do questionário no AsyncStorage (sem alterações)
const STORAGE_KEY = '@questionnaire_data';

// --- URL REAL para a API do Supabase (sem alterações) ---
const API_BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1` : '';
if (!API_BASE_URL) {
    console.error("CRITICAL ERROR: Supabase URL is not configured in environment variables!");
    // Você pode querer lançar um erro ou ter um estado de erro global aqui
}

// --- Função de API REAL para INSERIR dados na tabela questionario_usuario ---
const saveQuestionnaireDataAPI = async (authToken: string | null, formDataWithUserId: any): Promise<any> => {
    // *** MUDANÇA 1: Endpoint aponta para a nova tabela 'questionario_usuario' ***
    const endpoint = `${API_BASE_URL}/questionario_usuario`;

    // Verifica se a URL base está configurada
    if (!API_BASE_URL) {
        throw new Error("A URL da API não está configurada.");
    }
     // Verifica se o token está presente (a política RLS exigirá autenticação para INSERT)
    if (!authToken) {
        throw new Error("Token de autenticação ausente. Não é possível salvar os dados.");
    }

    console.log(`[API] Enviando dados do questionário para: ${endpoint}`);

    // Headers com autenticação (sem alterações significativas aqui, apenas adicionado verificação da chave anon)
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
        console.error("CRITICAL ERROR: Supabase Anon Key is not configured!");
        throw new Error("Chave da API não configurada.");
    }
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${authToken}`, // Token do usuário logado
        'Prefer': 'return=minimal' // Não precisa retornar o objeto inserido
    };

    try {
        // *** MUDANÇA 2: Usar método 'POST' para inserir um novo registro ***
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            // *** MUDANÇA 3: O corpo da requisição contém o objeto formDataWithUserId ***
            //    (As chaves já devem corresponder às colunas da tabela questionario_usuario)
            body: JSON.stringify(formDataWithUserId),
        });

        // Tratamento de resposta (sem alterações significativas, mas o erro 400 agora pode ser por outros motivos, como RLS)
        if (!response.ok) {
            let errorBody = null;
            try {
                errorBody = await response.json();
                console.error('[API] Corpo do erro recebido:', errorBody);
            } catch (e) {
                console.error('[API] Não foi possível parsear o corpo do erro como JSON.');
            }
            // Mensagem de erro mais específica pode vir de 'errorBody.message' ou 'errorBody.details'
            const details = errorBody?.details ? `Detalhes: ${errorBody.details}` : '';
            const message = errorBody?.message || 'Erro desconhecido do servidor.';
            console.error(`[API] Erro ao salvar questionário: ${response.status} - ${message} ${details}`);

            // Verifica se o erro é de chave duplicada (caso tente inserir um questionário para um usuário que já tem, se usuario_id for UNIQUE)
             if (response.status === 409 || errorBody?.code === '23505') { // 23505 é o código de violação de unicidade do PostgreSQL
                 throw new Error(`Você já possui um questionário salvo. (Erro ${response.status})`);
             }
             // Verifica erro de permissão (RLS)
             if (response.status === 401 || response.status === 403) {
                 throw new Error(`Sem permissão para salvar os dados. Verifique as políticas RLS. (Erro ${response.status})`);
             }

            throw new Error(
                `Falha ao salvar o questionário. Status: ${response.status}. ${message}`
            );
        }

        console.log('[API] Dados do questionário INSERIDOS com sucesso na tabela questionario_usuario.');
        return { success: true };

    } catch (error: any) {
        // Verifica se o erro já é um Error criado acima
         if (error instanceof Error) {
            console.error('[API] Erro capturado ao salvar questionário:', error.message);
            throw error; // Re-throw o erro já formatado
         } else {
            // Trata outros erros (rede, etc.)
            console.error('[API] Erro de rede ou outro erro inesperado ao salvar questionário:', error);
            throw new Error("Erro de conexão ao tentar salvar o questionário. Verifique sua internet.");
         }
    }
};


const QuestionnaireScreen = () => {
  const navigation = useNavigation();
  const paperTheme = useTheme();

  // Estado Local (sem alterações)
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Contexto de Autenticação - Obter user e session corretamente (sem alterações)
  const { user, session } = useAuth();
  const userId = user?.id;
  const authToken = session?.access_token;

  // Estado do Formulário (sem alterações)
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

  // Carregar dados salvos ao montar o componente (sem alterações)
  useEffect(() => {
    const loadSavedData = async () => {
        // ... (código mantido igual)
        try {
            const savedData = await AsyncStorage.getItem(STORAGE_KEY);
            if (savedData) {
              const data = JSON.parse(savedData);
              console.log('[QuestionnaireScreen] Loaded saved data from AsyncStorage');

              // Preencher todos os estados com os dados salvos
              setNome(data.nome || ''); // Mantém 'nome' no estado local
              if (data.data_nascimento) { // Ajusta para o nome da chave que será salva
                const [ano, mes, dia] = data.data_nascimento.split('-');
                setAnoNascimento(ano || '');
                setMesNascimento(mes || '');
                setDiaNascimento(dia || '');
              } else if (data.dataNascimento) { // Fallback para formato antigo no storage
                 setDiaNascimento(data.dataNascimento.dia || '');
                 setMesNascimento(data.dataNascimento.mes || '');
                 setAnoNascimento(data.dataNascimento.ano || '');
              }
              setGenero(data.genero || null);
              setPeso(String(data.peso_kg || data.peso || '')); // Converte para string
              setAltura(String(data.altura_cm || data.altura || '')); // Converte para string
              setExperienciaTreino(data.experiencia_treino || data.experienciaTreino || null);
              setObjetivo(data.objetivo || null);
              setTemLesoes(data.tem_lesoes !== undefined ? data.tem_lesoes : (data.temLesoes !== undefined ? data.temLesoes : null));
              setLesoes(data.lesoes_detalhes || data.lesoes || '');
              // setDescricaoLesao(data.descricaoLesao || ''); // Se não tiver essa coluna, pode remover
              if (data.dias_treino && Array.isArray(data.dias_treino)) { // Usa dias_treino
                const daysObj: { [key: string]: boolean } = {};
                data.dias_treino.forEach((day: string) => { daysObj[day] = true; });
                setTrainingDays(daysObj);
              } else if (data.trainingDays && Array.isArray(data.trainingDays)){ // Fallback
                 const daysObj: { [key: string]: boolean } = {};
                 data.trainingDays.forEach((day: string) => { daysObj[day] = true; });
                 setTrainingDays(daysObj);
              }
              setIncludeCardio(data.inclui_cardio !== undefined ? data.inclui_cardio : (data.includeCardio !== undefined ? data.includeCardio : null));
              setIncludeStretching(data.inclui_alongamento !== undefined ? data.inclui_alongamento : (data.includeStretching !== undefined ? data.includeStretching : null));
              setAverageTrainingTime(data.tempo_medio_treino_min || data.averageTrainingTime || null);
            }
          } catch (error) {
            console.error('[QuestionnaireScreen] Error loading saved data:', error);
          } finally {
            setDataLoaded(true);
          }
    };
    loadSavedData();
  }, []);

  // Limpar erro ao focar na tela (sem alterações)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { setError(null); });
    return unsubscribe;
  }, [navigation]);

  // Handlers (sem alterações)
  const toggleTrainingDay = (dayValue: string) => {
    setTrainingDays(prev => ({ ...prev, [dayValue]: !prev[dayValue] }));
  };

  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);

  const isFormValid = () => {
    // ... (lógica mantida igual)
    const selectedDaysCount = getSelectedDays().length;
    return (
      !!nome && !!diaNascimento && !!mesNascimento && !!anoNascimento && !!genero &&
      !!peso && !!altura && !!experienciaTreino && !!objetivo && temLesoes !== null &&
      selectedDaysCount > 0 && includeCardio !== null && includeStretching !== null &&
      averageTrainingTime !== null
    );
  };

  const handleSubmit = async () => {
    if (!userId || !authToken) { // Verifica também o authToken
      Alert.alert('Erro', 'Usuário não autenticado corretamente. Por favor, faça login novamente.');
      return;
    }

    if (!isFormValid()) {
      Alert.alert('Campos Incompletos', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setError(null);
    setIsLoading(true);

    // *** MUDANÇA 4: Montar o objeto formData que será enviado para a API ***
    //    As chaves DESTE objeto devem corresponder EXATAMENTE às colunas
    //    da tabela 'questionario_usuario' que criamos no Supabase.
    const formDataForApi = {
      usuario_id: userId, // Chave estrangeira obrigatória
      // Formata a data para 'YYYY-MM-DD' se a coluna for do tipo 'date'
      data_nascimento: `${anoNascimento}-${mesNascimento.padStart(2, '0')}-${diaNascimento.padStart(2, '0')}`,
      genero: genero, // Nome da coluna: genero (text)
      peso_kg: parseFloat(peso) || null, // Nome da coluna: peso_kg (numeric) - Converte para número
      altura_cm: parseInt(altura, 10) || null, // Nome da coluna: altura_cm (integer) - Converte para número
      experiencia_treino: experienciaTreino, // Nome da coluna: experiencia_treino (text)
      objetivo: objetivo, // Nome da coluna: objetivo (text)
      tem_lesoes: temLesoes, // Nome da coluna: tem_lesoes (boolean)
      // Combina as duas descrições ou usa uma delas para 'lesoes_detalhes'
      lesoes_detalhes: temLesoes ? `${lesoes}${descricaoLesao ? ` (${descricaoLesao})` : ''}`.trim() || null : null, // Nome da coluna: lesoes_detalhes (text)
      dias_treino: getSelectedDays(), // Nome da coluna: dias_treino (text[]) - Envia o array JS
      inclui_cardio: includeCardio, // Nome da coluna: inclui_cardio (boolean)
      inclui_alongamento: includeStretching, // Nome da coluna: inclui_alongamento (boolean)
      tempo_medio_treino_min: averageTrainingTime, // Nome da coluna: tempo_medio_treino_min (integer)
    };

     // Objeto para salvar no AsyncStorage (pode manter o formato antigo se preferir, ou usar o novo)
     // Usaremos o formato novo para consistência ao recarregar
    const formDataForStorage = { ...formDataForApi, nome: nome }; // Adiciona 'nome' que não vai para a API mas é útil localmente

    try {
      // 1. Salvar localmente ANTES da chamada API (usando o formato novo)
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(formDataForStorage));
      console.log('[QuestionnaireScreen] Form data saved to AsyncStorage before API call.');

      // 2. Chamar a API real para INSERIR na tabela 'questionario_usuario'
      console.log('[QuestionnaireScreen] Submitting form data via REAL API for user:', userId);
      // Passa o authToken e o objeto formatado para a API
      await saveQuestionnaireDataAPI(authToken, formDataForApi);

      // 3. Navegar para a tela de chat após sucesso
      console.log('[QuestionnaireScreen] API submission successful, navigating...');
      // Passa os dados para a próxima tela (usando o formato local/do estado, que a tela de chat espera)
      navigation.navigate('PostQuestionnaireChat', {
          formData: { // Remonta o objeto como a tela de chat espera, se necessário
            userId,
            nome,
            dataNascimento: { dia: diaNascimento, mes: mesNascimento, ano: anoNascimento },
            genero,
            peso,
            altura,
            experienciaTreino,
            objetivo,
            temLesoes,
            lesoes,
            descricaoLesao,
            trainingDays: getSelectedDays(), // Nome que a tela de chat espera? Verifique ChatScreen
            includeCardio,
            includeStretching,
            averageTrainingTime,
          }
      });

    } catch (submissionError: any) {
      console.error('[QuestionnaireScreen] API submission failed:', submissionError);
      const errorMessage = submissionError?.message || 'Ocorreu um erro inesperado ao salvar os dados no servidor.';
      setError(errorMessage);
      Alert.alert('Erro ao Salvar', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Styles (sem alterações)
  const styles = useMemo(() => StyleSheet.create({
    // ... (código mantido igual)
    safeArea: { flex: 1, backgroundColor: paperTheme.colors.background },
    scrollContainer: { padding: 16, paddingBottom: 48 },
    title: { fontSize: 24, fontWeight: 'bold', color: paperTheme.colors.onBackground, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 16, color: paperTheme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 },
    section: { marginBottom: 16 },
    sectionHeader: { fontSize: 20, fontWeight: 'bold', color: paperTheme.colors.primary, marginBottom: 16, marginTop: 8, borderBottomWidth: 1, borderBottomColor: paperTheme.colors.primary + '50', paddingBottom: 4 },
    label: { fontSize: 18, color: paperTheme.colors.onSurface, marginBottom: 8, fontWeight: '600' },
    input: { backgroundColor: paperTheme.colors.surfaceVariant, color: paperTheme.colors.onSurfaceVariant, paddingHorizontal: 16, paddingVertical: 12, borderRadius: paperTheme.roundness, fontSize: 16, borderWidth: 1, borderColor: paperTheme.colors.outline },
    textArea: { height: 100, textAlignVertical: 'top' },
    dateContainer: { flexDirection: 'row', justifyContent: 'space-between' },
    dateInput: { width: '30%', textAlign: 'center' },
    yearInput: { width: '35%', textAlign: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    column: { width: '48%' },
    optionButton: { backgroundColor: paperTheme.colors.surfaceVariant, padding: 16, borderRadius: paperTheme.roundness, marginBottom: 8, borderWidth: 1, borderColor: paperTheme.colors.outline },
    optionButtonSelected: { backgroundColor: paperTheme.colors.primary, borderColor: paperTheme.colors.primary },
    optionText: { color: paperTheme.colors.onSurfaceVariant, fontSize: 16, textAlign: 'center' },
    optionTextSelected: { color: paperTheme.colors.onPrimary, fontWeight: 'bold' },
    yesNoContainer: { flexDirection: 'row', justifyContent: 'space-around' },
    yesNoButton: { width: '45%', alignItems: 'center' },
    daysContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
    dayButton: { backgroundColor: paperTheme.colors.surfaceVariant, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: paperTheme.colors.outline, alignItems: 'center', flexBasis: '12%', minWidth: 45 },
    dayButtonSelected: { backgroundColor: paperTheme.colors.primary, borderColor: paperTheme.colors.primary },
    dayText: { color: paperTheme.colors.onSurfaceVariant, fontSize: 14 },
    dayTextSelected: { color: paperTheme.colors.onPrimary, fontWeight: 'bold' },
    submitButton: { backgroundColor: paperTheme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
    submitButtonDisabled: { backgroundColor: paperTheme.colors.surfaceDisabled, opacity: 0.8 },
    submitButtonText: { color: paperTheme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    errorText: { color: paperTheme.colors.error, textAlign: 'center', marginTop: 8, marginBottom: 8 },
  }), [paperTheme]);

  // Render Helpers (sem alterações)
  const renderOptions = (/*...*/) => { /* ... (código mantido igual) */ };
  const renderYesNo = (/*...*/) => { /* ... (código mantido igual) */ };
   const LoadingOverlay = () => ( // Simplificado para exemplo
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color={paperTheme.colors.primary} />
        <Text style={[styles.subtitle, { color: paperTheme.colors.onBackground }]}>
          Carregando dados...
        </Text>
      </View>
    );

  // Overlay de carregamento (sem alterações)
  if (!dataLoaded) {
    return <LoadingOverlay />;
  }

  // Component Return (sem alterações na estrutura JSX)
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* ... (JSX mantido igual) ... */}
         <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={paperTheme.colors.primary} />
            <Text style={[styles.subtitle, { color: paperTheme.colors.onBackground }]}>Salvando dados...</Text>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Conte-nos sobre você</Text>
          <Text style={styles.subtitle}>Essas informações nos ajudarão a personalizar sua experiência de treino.</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* --- SEÇÕES DO FORMULÁRIO (mantidas como estavam) --- */}
            <Text style={styles.sectionHeader}>Informações Pessoais</Text>
            <View style={styles.section}>
                <Text style={styles.label}>Nome Completo</Text>
                <TextInput style={styles.input} placeholder="Seu nome" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={nome} onChangeText={setNome} autoCapitalize="words"/>
            </View>
            <View style={styles.section}>
                <Text style={styles.label}>Data de Nascimento</Text>
                <View style={styles.dateContainer}>
                    <TextInput style={[styles.input, styles.dateInput]} placeholder="DD" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={diaNascimento} onChangeText={setDiaNascimento} keyboardType="number-pad" maxLength={2}/>
                    <TextInput style={[styles.input, styles.dateInput]} placeholder="MM" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={mesNascimento} onChangeText={setMesNascimento} keyboardType="number-pad" maxLength={2}/>
                    <TextInput style={[styles.input, styles.dateInput, styles.yearInput]} placeholder="AAAA" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={anoNascimento} onChangeText={setAnoNascimento} keyboardType="number-pad" maxLength={4}/>
                </View>
            </View>
            {renderOptions(GENDER_OPTIONS, genero, (v) => setGenero(v as string), 'Gênero')}
            <View style={styles.section}>
                <View style={styles.row}>
                    <View style={styles.column}>
                        <Text style={styles.label}>Peso (kg)</Text>
                        <TextInput style={styles.input} placeholder="Ex: 75" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={peso} onChangeText={setPeso} keyboardType="numeric"/>
                    </View>
                    <View style={styles.column}>
                        <Text style={styles.label}>Altura (cm)</Text>
                        <TextInput style={styles.input} placeholder="Ex: 180" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={altura} onChangeText={setAltura} keyboardType="numeric"/>
                    </View>
                </View>
            </View>

            <Text style={styles.sectionHeader}>Experiência e Objetivos</Text>
            {renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string), 'Qual seu nível de experiência com treinos?')}
            {renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string), 'Qual seu objetivo principal?')}

            <Text style={styles.sectionHeader}>Preferências de Treino</Text>
            <View style={styles.section}>
                <Text style={styles.label}>Quais dias da semana você pretende treinar?</Text>
                <View style={styles.daysContainer}>
                    {DAYS_OF_WEEK.map(day => (
                        <TouchableOpacity key={day.value} style={[styles.dayButton, trainingDays[day.value] && styles.dayButtonSelected]} onPress={() => toggleTrainingDay(day.value)}>
                            <Text style={[styles.dayText, trainingDays[day.value] && styles.dayTextSelected]}>{day.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
            {renderOptions(TIME_OPTIONS, averageTrainingTime, (v) => setAverageTrainingTime(v as number), 'Quanto tempo você tem disponível para treinar em média?')}
            {renderYesNo(includeCardio, setIncludeCardio, 'Gostaria de incluir exercícios de Cardio no seu plano?')}
            {renderYesNo(includeStretching, setIncludeStretching, 'Gostaria de incluir Alongamentos no seu plano?')}

            <Text style={styles.sectionHeader}>Saúde e Restrições</Text>
            {renderYesNo(temLesoes, setTemLesoes, 'Possui alguma lesão ou restrição médica?')}
            {temLesoes === true && (
                <>
                    <View style={styles.section}>
                        <Text style={styles.label}>Quais lesões/restrições? (Opcional)</Text>
                        <TextInput style={styles.input} placeholder="Ex: Dor no joelho direito, Hérnia de disco L5" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={lesoes} onChangeText={setLesoes} />
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.label}>Descreva brevemente (Opcional)</Text>
                        <TextInput style={[styles.input, styles.textArea]} placeholder="Ex: Dor ao agachar, evitar impacto" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={descricaoLesao} onChangeText={setDescricaoLesao} multiline />
                    </View>
                </>
            )}
            {/* --- FIM SEÇÕES DO FORMULÁRIO --- */}

          <TouchableOpacity
            style={[styles.submitButton, (!isFormValid() || isLoading) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isFormValid() || isLoading}
          >
            <Text style={styles.submitButtonText}>Conversar com IA</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Funções Render Helpers (precisam receber styles e theme agora ou ser definidas dentro do componente)
const renderOptions = (
    options: Array<Option | TimeOption>,
    selectedValue: string | number | null,
    onSelect: (value: string | number) => void,
    title: string,
    styles: any, // Pass styles
    paperTheme: any // Pass theme
  ) => (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value.toString()}
          style={[
            styles.optionButton,
            selectedValue === option.value && styles.optionButtonSelected,
          ]}
          onPress={() => onSelect(option.value)}
        >
          <Text
            style={[
              styles.optionText,
              selectedValue === option.value && styles.optionTextSelected,
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderYesNo = (
    value: boolean | null,
    onSelect: (value: boolean) => void,
    title: string,
    styles: any, // Pass styles
    paperTheme: any // Pass theme
  ) => (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.yesNoContainer}>
        <TouchableOpacity
          style={[
            styles.optionButton,
            styles.yesNoButton,
            value === true && styles.optionButtonSelected,
          ]}
          onPress={() => onSelect(true)}
        >
          <Text style={[styles.optionText, value === true && styles.optionTextSelected]}>
            Sim
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.optionButton,
            styles.yesNoButton,
            value === false && styles.optionButtonSelected,
          ]}
          onPress={() => onSelect(false)}
        >
          <Text style={[styles.optionText, value === false && styles.optionTextSelected]}>
            Não
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );


export default QuestionnaireScreen;