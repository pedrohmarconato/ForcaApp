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

// Tipos e Constantes (mantidos como estavam)
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

// Chave para dados do questionário no AsyncStorage (usada para fallback/passagem de dados)
const STORAGE_KEY = '@questionnaire_data';

// --- INÍCIO: Função de API REAL para salvar o questionário ---
// !! SUBSTITUA PELO SEU SERVIÇO DE API REAL SE TIVER UM !!
const saveQuestionnaireDataAPI = async (userId: string, authToken: string | null, formData: any): Promise<any> => {
  // !!! IMPORTANTE: Substitua pela URL base da sua API !!!
  const API_BASE_URL = 'YOUR_BACKEND_API_BASE_URL';
  // !!! IMPORTANTE: Ajuste o endpoint conforme sua API !!!
  const endpoint = `${API_BASE_URL}/users/${userId}/questionnaire`; // Exemplo

  console.log(`[API] Sending questionnaire data to: ${endpoint} for user: ${userId}`);

  // !!! IMPORTANTE: Adicione cabeçalhos de autenticação se necessário !!!
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    // Exemplo: Se usar Bearer Token
    // headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST', // ou 'PUT' se for atualização
      headers: headers,
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      // Tenta obter mais detalhes do erro do corpo da resposta
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch (e) {
        // Ignora se o corpo não for JSON válido
      }
      console.error('[API] Error saving questionnaire:', response.status, errorBody);
      throw new Error(
        `Falha ao salvar o questionário. Status: ${response.status}. ${errorBody?.message || 'Erro desconhecido.'}`
      );
    }

    console.log('[API] Questionnaire data saved successfully.');
    // Retorna a resposta se precisar de algum dado (ex: ID do questionário salvo)
    // return await response.json();
    return { success: true }; // Ou apenas resolve

  } catch (error) {
    console.error('[API] Network or other error saving questionnaire:', error);
    // Re-throw para ser pego no handleSubmit
    throw error;
  }
};
// --- FIM: Função de API REAL ---

const QuestionnaireScreen = () => {
  const navigation = useNavigation();
  const paperTheme = useTheme();

  // Estado Local
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Contexto de Autenticação
  const { user } = useAuth(); // Obtenha o usuário (e potencialmente o token)
  const userId = user?.id;
  // const authToken = user?.token; // Descomente e ajuste se precisar de token para a API

  // Estado do Formulário (mantido como estava)
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

  // Carregar dados salvos ao montar o componente (mantido como estava)
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedData = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedData) {
          const data = JSON.parse(savedData);
          console.log('[QuestionnaireScreen] Loaded saved data from AsyncStorage');

          // Preencher todos os estados com os dados salvos
          setNome(data.nome || '');
          if (data.dataNascimento) {
            setDiaNascimento(data.dataNascimento.dia || '');
            setMesNascimento(data.dataNascimento.mes || '');
            setAnoNascimento(data.dataNascimento.ano || '');
          }
          setGenero(data.genero || null);
          setPeso(data.peso || '');
          setAltura(data.altura || '');
          setExperienciaTreino(data.experienciaTreino || null);
          setObjetivo(data.objetivo || null);
          setTemLesoes(data.temLesoes !== undefined ? data.temLesoes : null);
          setLesoes(data.lesoes || '');
          setDescricaoLesao(data.descricaoLesao || '');
          if (data.trainingDays && Array.isArray(data.trainingDays)) {
            const daysObj: { [key: string]: boolean } = {};
            data.trainingDays.forEach((day: string) => { daysObj[day] = true; });
            setTrainingDays(daysObj);
          }
          setIncludeCardio(data.includeCardio !== undefined ? data.includeCardio : null);
          setIncludeStretching(data.includeStretching !== undefined ? data.includeStretching : null);
          setAverageTrainingTime(data.averageTrainingTime || null);
        }
      } catch (error) {
        console.error('[QuestionnaireScreen] Error loading saved data:', error);
      } finally {
        setDataLoaded(true);
      }
    };
    loadSavedData();
  }, []);

  // Limpar erro ao focar na tela (mantido como estava)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { setError(null); });
    return unsubscribe;
  }, [navigation]);

  // Handlers (mantidos como estavam)
  const toggleTrainingDay = (dayValue: string) => {
    setTrainingDays(prev => ({ ...prev, [dayValue]: !prev[dayValue] }));
  };

  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);

  const isFormValid = () => {
    const selectedDaysCount = getSelectedDays().length;
    return (
      !!nome && !!diaNascimento && !!mesNascimento && !!anoNascimento && !!genero &&
      !!peso && !!altura && !!experienciaTreino && !!objetivo && temLesoes !== null &&
      selectedDaysCount > 0 && includeCardio !== null && includeStretching !== null &&
      averageTrainingTime !== null
    );
  };

  const handleSubmit = async () => {
    if (!userId) {
      Alert.alert('Erro', 'Usuário não identificado. Por favor, faça login novamente.');
      return;
    }
    // Se precisar de token:
    // if (!authToken) {
    //   Alert.alert('Erro', 'Sessão inválida. Por favor, faça login novamente.');
    //   return;
    // }

    if (!isFormValid()) {
      Alert.alert('Campos Incompletos', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setError(null);
    setIsLoading(true);

    const formData = {
      // userId não precisa ir no corpo se já está na URL, ajuste conforme sua API
      nome,
      dataNascimento: { dia: diaNascimento, mes: mesNascimento, ano: anoNascimento },
      genero,
      peso,
      altura,
      experienciaTreino,
      objetivo,
      temLesoes,
      lesoes: temLesoes ? lesoes : '',
      descricaoLesao: temLesoes ? descricaoLesao : '', // Renomeado de 'descricaoLesao' para 'lesoesDetalhes' se necessário pela API
      trainingDays: getSelectedDays(),
      includeCardio,
      includeStretching,
      averageTrainingTime,
    };

    try {
      // 1. Salvar localmente para garantir que os dados estejam disponíveis para a próxima tela (Chat)
      //    mesmo que a chamada API falhe ou a navegação seja interrompida.
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      console.log('[QuestionnaireScreen] Form data saved to AsyncStorage before API call.');

      // 2. Chamar a API REAL para salvar no backend
      console.log('[QuestionnaireScreen] Submitting form data via REAL API for user:', userId);
      // Passe o authToken se necessário: await saveQuestionnaireDataAPI(userId, authToken, formData);
      await saveQuestionnaireDataAPI(userId, null, formData); // Passando null para authToken por enquanto

      // 3. Navegar para a próxima tela APÓS sucesso da API
      console.log('[QuestionnaireScreen] Real API submission successful, navigating...');
      // Passa os dados via params para a tela de chat usar imediatamente
      navigation.navigate('PostQuestionnaireChat', { formData });

    } catch (submissionError: any) {
      console.error('[QuestionnaireScreen] Real API submission failed:', submissionError);
      const errorMessage = submissionError?.message || 'Ocorreu um erro inesperado ao salvar os dados no servidor.';
      setError(errorMessage);
      Alert.alert('Erro ao Salvar', errorMessage);
      // Não navega se a API falhar
    } finally {
      setIsLoading(false);
    }
  };

  // Styles (mantidos como estavam)
  const styles = useMemo(() => StyleSheet.create({
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

  // Render Helpers (mantidos como estavam)
  const renderOptions = ( options: Array<Option | TimeOption>, selectedValue: string | number | null, onSelect: (value: string | number) => void, title: string ) => ( /* ...código mantido... */ );
  const renderYesNo = ( value: boolean | null, onSelect: (value: boolean) => void, title: string ) => ( /* ...código mantido... */ );

  // Overlay de carregamento (mantido como estava)
  if (!dataLoaded) { return ( /* ...código mantido... */ ); }

  // Component Return (mantido como estava, exceto o texto do botão se desejar)
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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
                        <TouchableOpacity key={day.value} style={[ styles.dayButton, trainingDays[day.value] && styles.dayButtonSelected ]} onPress={() => toggleTrainingDay(day.value)}>
                            <Text style={[ styles.dayText, trainingDays[day.value] && styles.dayTextSelected ]}>{day.label}</Text>
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
                {/* Você pode mudar o texto se quiser, ex: "Salvar e Conversar com IA" */}
                <Text style={styles.submitButtonText}>Conversar com IA</Text>
            </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Funções renderOptions e renderYesNo (Completas, sem alterações)
const renderOptions = (
    options: Array<Option | TimeOption>,
    selectedValue: string | number | null,
    onSelect: (value: string | number) => void,
    title: string,
    styles: any, // Pass styles as argument
    paperTheme: any // Pass theme as argument
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
    styles: any, // Pass styles as argument
    paperTheme: any // Pass theme as argument
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
          <Text style={[styles.optionText, value === true && styles.optionTextSelected]}>Sim</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.optionButton,
            styles.yesNoButton,
            value === false && styles.optionButtonSelected,
          ]}
          onPress={() => onSelect(false)}
        >
          <Text style={[styles.optionText, value === false && styles.optionTextSelected]}>Não</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

// Overlay de carregamento (Função auxiliar completa, sem alterações)
const LoadingOverlay = ({ styles, paperTheme }: { styles: any, paperTheme: any }) => (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="large" color={paperTheme.colors.primary} />
      <Text style={[styles.subtitle, { color: paperTheme.colors.onBackground }]}>
        Carregando dados do questionário...
      </Text>
    </View>
);


export default QuestionnaireScreen;