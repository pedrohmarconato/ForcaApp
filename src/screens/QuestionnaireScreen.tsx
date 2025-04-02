// src/screens/onboarding/QuestionnaireScreen.tsx (Refatorado SEM REDUX)

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
// REMOVIDO: import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
// REMOVIDO: Imports de actions/selectors do Redux
// REMOVIDO: import { RootState } from '../store';

// --- ASSUMPTION: Importe seu contexto de autenticação ---
// Substitua pelo caminho real do seu contexto/hook de autenticação
import { useAuth } from '../contexts/AuthContext'; // <<< EXEMPLO: Ajuste este caminho

// --- Tipos e Constantes (MANTENHA OS SEUS IGUAIS) ---
type Option = { label: string; value: string };
type DayOption = { label: string; value: string };
type TimeOption = { label: string; value: number };

// Substitua pelos seus dados reais ou importe-os de um arquivo de constantes
const GENDER_OPTIONS: Option[] = [ { label: 'Masculino', value: 'male' }, { label: 'Feminino', value: 'female' }, { label: 'Outro', value: 'other' }, { label: 'Prefiro não dizer', value: 'not_specified'} ];
const EXPERIENCE_LEVELS: Option[] = [ { label: 'Iniciante (Nunca treinei ou < 6 meses)', value: 'beginner' }, { label: 'Intermediário (6 meses - 2 anos)', value: 'intermediate' }, { label: 'Avançado (> 2 anos)', value: 'advanced' } ];
const GOALS: Option[] = [ { label: 'Perda de Peso', value: 'weight_loss' }, { label: 'Ganho de Massa Muscular', value: 'muscle_gain' }, { label: 'Melhorar Condicionamento Físico', value: 'fitness_improvement' }, { label: 'Saúde e Bem-estar', value: 'health_wellness' } ];
const DAYS_OF_WEEK: DayOption[] = [ { label: 'S', value: 'sun' }, { label: 'T', value: 'mon' }, { label: 'Q', value: 'tue' }, { label: 'Q', value: 'wed' }, { label: 'S', value: 'thu' }, { label: 'S', value: 'fri' }, { label: 'D', value: 'sat' } ]; // Exemplo: ajuste labels/values
const TIME_OPTIONS: TimeOption[] = [ { label: '30-45 minutos', value: 45 }, { label: '45-60 minutos', value: 60 }, { label: '60-90 minutos', value: 90 }, { label: '+90 minutos', value: 120 } ];
// --- Fim Tipos e Constantes ---

// --- Placeholder para a função de API ---
// Idealmente, esta função estaria em um arquivo de serviço (ex: src/services/userService.ts)
// e faria a chamada real para o seu backend.
const submitQuestionnaireAPI = async (userId: string, formData: any): Promise<void> => {
  console.log('[API Mock] Submitting questionnaire for user:', userId, 'Data:', formData);
  // Simule uma chamada de API (substitua pelo seu fetch ou axios)
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Simular sucesso ou erro aleatoriamente para teste
      // const shouldSucceed = Math.random() > 0.2; // 80% de chance de sucesso
      const shouldSucceed = true; // Forçar sucesso para teste de navegação
      if (shouldSucceed) {
        console.log('[API Mock] Submission successful');
        resolve();
      } else {
        console.error('[API Mock] Submission failed');
        reject(new Error('Falha simulada ao salvar o questionário. Tente novamente.'));
      }
    }, 1500); // Simular delay de rede
  });
};
// --- Fim Placeholder API ---

const QuestionnaireScreen = () => {
  // REMOVIDO: const dispatch = useDispatch();
  const navigation = useNavigation();
  const paperTheme = useTheme(); // Usando paperTheme para clareza

  // --- Estado Local (Substituindo Seletores Redux) ---
  const [isLoading, setIsLoading] = useState(false); // Era selectUserLoading ('pending')
  const [error, setError] = useState<string | null>(null); // Era selectUserError

  // --- Contexto de Autenticação ---
   const { user } = useAuth(); // Obtém o usuário do contexto
   const userId = user?.id; // Obtém ID diretamente do contexto

  // --- Estado do Formulário (MANTIDO COMO ESTAVA) ---
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
  // --- Fim Estado do Formulário ---

  // Limpa o erro local ao focar na tela novamente
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setError(null); // Limpa o erro local
    });
    return unsubscribe;
  }, [navigation]);

  // REMOVIDO: useEffect que observava loadingStatus e submissionError do Redux

  // --- Handlers (Lógica mantida, adaptada para estado local) ---
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
        // Você pode querer navegar para a tela de Login aqui
        // navigation.navigate('Login');
        return;
     }

     if (!isFormValid()) {
      Alert.alert('Campos Incompletos', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    // Limpa erro anterior e define estado de carregamento
    setError(null);
    setIsLoading(true);

    const formData = {
      nome,
      dataNascimento: { dia: diaNascimento, mes: mesNascimento, ano: anoNascimento },
      genero,
      peso,
      altura,
      experienciaTreino,
      objetivo,
      temLesoes,
      lesoes: temLesoes ? lesoes : '',
      descricaoLesao: temLesoes ? descricaoLesao : '',
      trainingDays: getSelectedDays(),
      includeCardio,
      includeStretching,
      averageTrainingTime,
    };

    try {
      console.log('[QuestionnaireScreen] Submitting Form Data for user:', userId);
      // Chama a função da API diretamente (substitua pela sua implementação real)
      await submitQuestionnaireAPI(userId, formData);

      console.log("[QuestionnaireScreen] Submission successful, navigating...");
      // Navega APÓS o sucesso da API
      navigation.navigate('PostQuestionnaireChat'); // Ou para 'MainNavigator', etc.

    } catch (submissionError: any) {
      console.error("[QuestionnaireScreen] Submission failed:", submissionError);
      const errorMessage = submissionError?.message || 'Ocorreu um erro inesperado ao salvar os dados.';
      setError(errorMessage); // Define o erro no estado local
      Alert.alert('Erro ao Salvar', errorMessage); // Exibe o erro para o usuário

    } finally {
      // Garante que o estado de carregamento seja desativado
      setIsLoading(false);
    }
  };
  // --- Fim Handlers ---

  // --- Styles Definition (MANTIDO IGUAL, usando paperTheme) ---
  const styles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: paperTheme.colors.background,
    },
    scrollContainer: {
      padding: 16,
      paddingBottom: 48,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: paperTheme.colors.onBackground,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: paperTheme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 24,
    },
    section: {
      marginBottom: 16,
    },
    sectionHeader: {
      fontSize: 20,
      fontWeight: 'bold',
      color: paperTheme.colors.primary,
      marginBottom: 16,
      marginTop: 8,
      borderBottomWidth: 1,
      borderBottomColor: paperTheme.colors.primary + '50',
      paddingBottom: 4,
    },
    label: {
      fontSize: 18,
      color: paperTheme.colors.onSurface,
      marginBottom: 8,
      fontWeight: '600',
    },
    input: {
      backgroundColor: paperTheme.colors.surfaceVariant,
      color: paperTheme.colors.onSurfaceVariant,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: paperTheme.roundness,
      fontSize: 16,
      borderWidth: 1,
      borderColor: paperTheme.colors.outline,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    dateContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    dateInput: { width: '30%', textAlign: 'center' },
    yearInput: { width: '35%', textAlign: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    column: { width: '48%' },
    optionButton: {
      backgroundColor: paperTheme.colors.surfaceVariant,
      padding: 16,
      borderRadius: paperTheme.roundness,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: paperTheme.colors.outline,
    },
    optionButtonSelected: {
      backgroundColor: paperTheme.colors.primary,
      borderColor: paperTheme.colors.primary,
    },
    optionText: {
      color: paperTheme.colors.onSurfaceVariant,
      fontSize: 16,
      textAlign: 'center',
    },
    optionTextSelected: {
      color: paperTheme.colors.onPrimary,
      fontWeight: 'bold',
    },
    yesNoContainer: { flexDirection: 'row', justifyContent: 'space-around' },
    yesNoButton: { width: '45%', alignItems: 'center' },
    daysContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
    },
    dayButton: {
        backgroundColor: paperTheme.colors.surfaceVariant,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: paperTheme.colors.outline,
        alignItems: 'center',
        flexBasis: '12%',
        minWidth: 45,
    },
    dayButtonSelected: {
        backgroundColor: paperTheme.colors.primary,
        borderColor: paperTheme.colors.primary,
    },
    dayText: {
        color: paperTheme.colors.onSurfaceVariant,
        fontSize: 14,
    },
    dayTextSelected: {
        color: paperTheme.colors.onPrimary,
        fontWeight: 'bold',
    },
    submitButton: {
      backgroundColor: paperTheme.colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 16,
    },
    submitButtonDisabled: {
      backgroundColor: paperTheme.colors.surfaceDisabled,
      opacity: 0.8,
    },
    submitButtonText: {
      color: paperTheme.colors.onPrimary,
      fontSize: 18,
      fontWeight: 'bold',
    },
    // errorText não é mais necessário aqui se o erro for exibido via Alert
  }), [paperTheme]);
  // --- Fim Styles Definition ---

    // --- Render Helpers (MANTIDOS IGUAIS) ---
  const renderOptions = (
    options: Array<Option | TimeOption>,
    selectedValue: string | number | null,
    onSelect: (value: string | number) => void,
    title: string
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
    title: string
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
                <Text style={[ styles.optionText, value === true && styles.optionTextSelected ]}>Sim</Text>
            </TouchableOpacity>
            <TouchableOpacity
                 style={[
                    styles.optionButton,
                    styles.yesNoButton,
                    value === false && styles.optionButtonSelected,
                 ]}
                onPress={() => onSelect(false)}
            >
                <Text style={[ styles.optionText, value === false && styles.optionTextSelected ]}>Não</Text>
            </TouchableOpacity>
        </View>
     </View>
  );

  const renderDaySelector = () => (
    <View style={styles.section}>
        <Text style={styles.label}>Quais dias da semana você pretende treinar?</Text>
        <View style={styles.daysContainer}>
            {DAYS_OF_WEEK.map(day => (
                <TouchableOpacity
                    key={day.value}
                    style={[
                        styles.dayButton,
                        trainingDays[day.value] && styles.dayButtonSelected,
                    ]}
                    onPress={() => toggleTrainingDay(day.value)}
                >
                    <Text style={[
                        styles.dayText,
                        trainingDays[day.value] && styles.dayTextSelected,
                    ]}>
                        {day.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    </View>
  );
  // --- Fim Render Helpers ---


  // --- Component Return (Adaptado para usar isLoading) ---
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Conte-nos sobre você</Text>
          <Text style={styles.subtitle}>
            Essas informações nos ajudarão a personalizar sua experiência de treino.
          </Text>

          {/* --- Seções do Formulário (MANTIDAS IGUAIS) --- */}
          <Text style={styles.sectionHeader}>Informações Pessoais</Text>
          <View style={styles.section}>
            <Text style={styles.label}>Nome Completo</Text>
            <TextInput style={styles.input} placeholder="Seu nome" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={nome} onChangeText={setNome} autoCapitalize="words" />
          </View>
          <View style={styles.section}>
             <Text style={styles.label}>Data de Nascimento</Text>
             <View style={styles.dateContainer}>
                 <TextInput style={[styles.input, styles.dateInput]} placeholder="DD" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={diaNascimento} onChangeText={setDiaNascimento} keyboardType="number-pad" maxLength={2} />
                 <TextInput style={[styles.input, styles.dateInput]} placeholder="MM" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={mesNascimento} onChangeText={setMesNascimento} keyboardType="number-pad" maxLength={2} />
                 <TextInput style={[styles.input, styles.dateInput, styles.yearInput]} placeholder="AAAA" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={anoNascimento} onChangeText={setAnoNascimento} keyboardType="number-pad" maxLength={4} />
             </View>
          </View>
          {renderOptions(GENDER_OPTIONS, genero, (v) => setGenero(v as string), 'Gênero')}
           <View style={styles.section}>
              <View style={styles.row}>
                 <View style={styles.column}>
                    <Text style={styles.label}>Peso (kg)</Text>
                    <TextInput style={styles.input} placeholder="Ex: 75" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={peso} onChangeText={setPeso} keyboardType="numeric" />
                 </View>
                 <View style={styles.column}>
                    <Text style={styles.label}>Altura (cm)</Text>
                    <TextInput style={styles.input} placeholder="Ex: 180" placeholderTextColor={paperTheme.colors.onSurfaceVariant} value={altura} onChangeText={setAltura} keyboardType="numeric" />
                 </View>
              </View>
          </View>

          <Text style={styles.sectionHeader}>Experiência e Objetivos</Text>
          {renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string), 'Qual seu nível de experiência com treinos?')}
          {renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string), 'Qual seu objetivo principal?')}

          <Text style={styles.sectionHeader}>Preferências de Treino</Text>
          {renderDaySelector()}
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
          {/* --- Fim Seções do Formulário --- */}


          {/* Botão Submit usando estado local isLoading */}
          <TouchableOpacity
            style={[styles.submitButton, (!isFormValid() || isLoading) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isFormValid() || isLoading} // Atualizado para usar isLoading
          >
            {isLoading ? ( // Atualizado para usar isLoading
              <ActivityIndicator color={paperTheme.colors.onPrimary} />
            ) : (
              <Text style={styles.submitButtonText}>Conversar com IA</Text>
            )}
          </TouchableOpacity>

          {/* O erro agora é tratado via Alert no handleSubmit */}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default QuestionnaireScreen;