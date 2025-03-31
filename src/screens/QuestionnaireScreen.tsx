// src/screens/onboarding/QuestionnaireScreen.tsx (Full Component)

import React, { useState } from 'react';
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
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons'; // Assuming Feather icons are used

// TODO: Import the actual thunk for submitting data
// import { submitQuestionnaireData } from '../../store/slices/userSlice';
import { RootState } from '../../store'; // Assuming RootState is defined
import { theme } from '../theme';// Assuming theme object exists

// --- Placeholder for the Redux Action ---
const submitQuestionnaireData = (formData: any) => ({
  type: 'user/submitQuestionnaire',
  payload: formData,
});
// --- End Placeholder ---

// --- Helper Types/Constants ---
type Option = { label: string; value: string };
type DayOption = { label: string; value: string };
type TimeOption = { label: string; value: number };

const GENDER_OPTIONS: Option[] = [
  { label: 'Masculino', value: 'masculino' },
  { label: 'Feminino', value: 'feminino' },
  { label: 'Outro', value: 'outro' },
  { label: 'Prefiro não informar', value: 'nao_informado' },
];

const EXPERIENCE_LEVELS: Option[] = [
  { label: 'Iniciante (Nunca treinei ou parei há muito tempo)', value: 'iniciante' },
  { label: 'Intermediário (Treino consistentemente há alguns meses/anos)', value: 'intermediario' },
  { label: 'Avançado (Treino há vários anos com técnicas avançadas)', value: 'avancado' },
];

const GOALS: Option[] = [
  { label: 'Perder Peso / Gordura Corporal', value: 'perder_peso' },
  { label: 'Ganhar Massa Muscular (Hipertrofia)', value: 'hipertrofia' },
  { label: 'Melhorar Condicionamento Físico Geral', value: 'condicionamento' },
  { label: 'Aumentar Força', value: 'forca' },
  { label: 'Melhorar Saúde e Bem-estar', value: 'saude_bem_estar' },
];

const DAYS_OF_WEEK: DayOption[] = [
  { label: 'Seg', value: 'seg' },
  { label: 'Ter', value: 'ter' },
  { label: 'Qua', value: 'qua' },
  { label: 'Qui', value: 'qui' },
  { label: 'Sex', value: 'sex' },
  { label: 'Sáb', value: 'sab' },
  { label: 'Dom', value: 'dom' },
];

const TIME_OPTIONS: TimeOption[] = [
  { label: 'Até 20 min (Muito Curto)', value: 20 },
  { label: 'Cerca de 30 min (Curto)', value: 30 },
  { label: 'Cerca de 60 min (Padrão)', value: 60 },
  { label: 'Cerca de 90 min (Longo)', value: 90 },
  { label: '120 min ou mais (Muito Longo)', value: 120 },
];
// --- End Helper Types/Constants ---

const QuestionnaireScreen = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const { loading, error } = useSelector((state: RootState) => state.user);

  // Form State
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
  // New states
  const [trainingDays, setTrainingDays] = useState<{ [key: string]: boolean }>({}); // e.g., { seg: true, qua: true }
  const [includeCardio, setIncludeCardio] = useState<boolean | null>(null);
  const [includeStretching, setIncludeStretching] = useState<boolean | null>(null);
  const [averageTrainingTime, setAverageTrainingTime] = useState<number | null>(null);

  const toggleTrainingDay = (dayValue: string) => {
    setTrainingDays(prev => ({
      ...prev,
      [dayValue]: !prev[dayValue],
    }));
  };

  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);

  const isFormValid = () => {
    const selectedDaysCount = getSelectedDays().length;

    if (!nome || !diaNascimento || !mesNascimento || !anoNascimento || !genero || !peso || !altura || !experienciaTreino || !objetivo || temLesoes === null || selectedDaysCount === 0 || includeCardio === null || includeStretching === null || averageTrainingTime === null) {
      return false;
    }
    if (temLesoes === true && (!lesoes || !descricaoLesao)) {
      // Making lesion details optional if 'Yes' is selected, adjust if needed
      // return false; // Uncomment if details are mandatory when temLesoes is true
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      Alert.alert('Campos Incompletos', 'Por favor, preencha todos os campos obrigatórios e selecione ao menos um dia de treino.');
      return;
    }

    const formData = {
      nome,
      dataNascimento: {
        dia: diaNascimento,
        mes: mesNascimento,
        ano: anoNascimento,
      },
      genero,
      peso,
      altura,
      experienciaTreino,
      objetivo,
      temLesoes,
      lesoes: temLesoes ? lesoes : '', // Only send if temLesoes is true
      descricaoLesao: temLesoes ? descricaoLesao : '', // Only send if temLesoes is true
      // New data
      trainingDays: getSelectedDays(), // Send as an array of selected day values
      includeCardio,
      includeStretching,
      averageTrainingTime,
    };

    try {
      console.log('Submitting Form Data:', formData);
      dispatch(submitQuestionnaireData(formData)); // Simulate dispatch
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
      console.log('Form submitted successfully (simulated)');

      navigation.reset({ index: 0, routes: [{ name: 'MainNavigator' }] });

    } catch (submissionError: any) {
        console.error("Submission Error:", submissionError);
        Alert.alert('Erro ao Salvar', submissionError.message || 'Não foi possível salvar seus dados. Tente novamente.');
    }
  };

  // --- Render Helpers ---

  // Render Options (String or Number value)
  const renderOptions = (
    options: Array<Option | TimeOption>, // Accept both types
    selectedValue: string | number | null,
    onSelect: (value: string | number) => void, // Accept both types
    title: string
  ) => (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value.toString()} // Use toString for key
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

  // Render Yes/No
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

  // Render Day Selector
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

  // --- Component Return ---
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

          {/* --- Personal Info --- */}
          <Text style={styles.sectionHeader}>Informações Pessoais</Text>
          <View style={styles.section}>
            <Text style={styles.label}>Nome Completo</Text>
            <TextInput style={styles.input} placeholder="Seu nome" placeholderTextColor={theme.colors.textSecondary} value={nome} onChangeText={setNome} autoCapitalize="words" />
          </View>
          <View style={styles.section}>
             <Text style={styles.label}>Data de Nascimento</Text>
             <View style={styles.dateContainer}>
                 <TextInput style={[styles.input, styles.dateInput]} placeholder="DD" placeholderTextColor={theme.colors.textSecondary} value={diaNascimento} onChangeText={setDiaNascimento} keyboardType="number-pad" maxLength={2}/>
                 <TextInput style={[styles.input, styles.dateInput]} placeholder="MM" placeholderTextColor={theme.colors.textSecondary} value={mesNascimento} onChangeText={setMesNascimento} keyboardType="number-pad" maxLength={2}/>
                 <TextInput style={[styles.input, styles.dateInput, styles.yearInput]} placeholder="AAAA" placeholderTextColor={theme.colors.textSecondary} value={anoNascimento} onChangeText={setAnoNascimento} keyboardType="number-pad" maxLength={4}/>
             </View>
          </View>
          {renderOptions(GENDER_OPTIONS, genero, (v) => setGenero(v as string), 'Gênero')}
           <View style={styles.section}>
              <View style={styles.row}>
                 <View style={styles.column}>
                    <Text style={styles.label}>Peso (kg)</Text>
                    <TextInput style={styles.input} placeholder="Ex: 75" placeholderTextColor={theme.colors.textSecondary} value={peso} onChangeText={setPeso} keyboardType="numeric"/>
                 </View>
                 <View style={styles.column}>
                    <Text style={styles.label}>Altura (cm)</Text>
                    <TextInput style={styles.input} placeholder="Ex: 180" placeholderTextColor={theme.colors.textSecondary} value={altura} onChangeText={setAltura} keyboardType="numeric"/>
                 </View>
              </View>
          </View>

          {/* --- Training Experience & Goals --- */}
          <Text style={styles.sectionHeader}>Experiência e Objetivos</Text>
          {renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string), 'Qual seu nível de experiência com treinos?')}
          {renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string), 'Qual seu objetivo principal?')}

          {/* --- Training Preferences --- */}
          <Text style={styles.sectionHeader}>Preferências de Treino</Text>
          {renderDaySelector()}
          {renderOptions(TIME_OPTIONS, averageTrainingTime, (v) => setAverageTrainingTime(v as number), 'Quanto tempo você tem disponível para treinar em média?')}
          {renderYesNo(includeCardio, setIncludeCardio, 'Gostaria de incluir exercícios de Cardio no seu plano?')}
          {renderYesNo(includeStretching, setIncludeStretching, 'Gostaria de incluir Alongamentos no seu plano?')}

          {/* --- Health & Restrictions --- */}
          <Text style={styles.sectionHeader}>Saúde e Restrições</Text>
          {renderYesNo(temLesoes, setTemLesoes, 'Possui alguma lesão ou restrição médica?')}
          {temLesoes === true && (
            <>
              <View style={styles.section}>
                <Text style={styles.label}>Quais lesões/restrições? (Opcional)</Text>
                <TextInput style={styles.input} placeholder="Ex: Dor no joelho direito, Hérnia de disco L5" placeholderTextColor={theme.colors.textSecondary} value={lesoes} onChangeText={setLesoes}/>
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>Descreva brevemente (Opcional)</Text>
                <TextInput style={[styles.input, styles.textArea]} placeholder="Ex: Dor ao agachar, evitar impacto" placeholderTextColor={theme.colors.textSecondary} value={descricaoLesao} onChangeText={setDescricaoLesao} multiline/>
              </View>
            </>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, (!isFormValid() || loading) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isFormValid() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.submitButtonText}>Finalizar e Criar Plano</Text> // Updated text
            )}
          </TouchableOpacity>

          {/* Error Message */}
          {error && <Text style={styles.errorText}>{error as string}</Text>}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// --- Styles --- (Add styles for new elements)
const styles = StyleSheet.create({
  // ... (Keep existing styles: safeArea, scrollContainer, title, subtitle, section, label, input, textArea, dateContainer, dateInput, yearInput, row, column, optionButton, optionButtonSelected, optionText, optionTextSelected, yesNoContainer, yesNoButton, submitButton, submitButtonDisabled, submitButtonText, errorText)
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContainer: {
    padding: theme.spacing.regular,
    paddingBottom: theme.spacing.large * 2,
  },
  title: {
    fontSize: theme.typography.sizes.title,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.sizes.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.large,
  },
  section: {
    marginBottom: theme.spacing.medium,
  },
  sectionHeader: {
      fontSize: theme.typography.sizes.large,
      fontWeight: 'bold',
      color: theme.colors.primary, // Highlight section headers
      marginBottom: theme.spacing.regular,
      marginTop: theme.spacing.small, // Add some space before the header
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary + '50', // Faint underline
      paddingBottom: theme.spacing.small / 2,
  },
  label: {
    fontSize: theme.typography.sizes.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.small,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.regular,
    paddingVertical: 12, // Increased padding a bit
    borderRadius: theme.borderRadius.small,
    fontSize: theme.typography.sizes.regular,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  textArea: {
      height: 100,
      textAlignVertical: 'top',
  },
  dateContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
  },
  dateInput: {
      width: '30%',
      textAlign: 'center',
  },
  yearInput: {
      width: '35%',
  },
  row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
  },
  column: {
      width: '48%',
  },
  optionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: theme.spacing.regular,
    borderRadius: theme.borderRadius.small,
    marginBottom: theme.spacing.small,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  optionButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  optionText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.regular,
    textAlign: 'center', // Center text in options
  },
  optionTextSelected: {
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  yesNoContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
  },
  yesNoButton: {
      width: '45%',
      alignItems: 'center',
  },
  daysContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap', // Allow wrapping if needed
      justifyContent: 'space-between',
  },
  dayButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      paddingVertical: theme.spacing.small,
      paddingHorizontal: theme.spacing.regular,
      borderRadius: theme.borderRadius.large, // Make them rounded
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      minWidth: '12%', // Adjust based on container width
      alignItems: 'center',
      marginBottom: theme.spacing.small,
  },
  dayButtonSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
  },
  dayText: {
      color: theme.colors.text,
      fontSize: theme.typography.sizes.small,
  },
  dayTextSelected: {
      color: '#0A0A0A',
      fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.regular,
    borderRadius: theme.borderRadius.medium,
    alignItems: 'center',
    marginTop: theme.spacing.medium,
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(235, 255, 0, 0.5)',
  },
  submitButtonText: {
    color: '#0A0A0A',
    fontSize: theme.typography.sizes.medium,
    fontWeight: 'bold',
  },
  errorText: {
    color: theme.colors.error,
    textAlign: 'center',
    marginTop: theme.spacing.regular,
  },
});
// --- End Styles ---

export default QuestionnaireScreen;