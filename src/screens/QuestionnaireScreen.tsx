// src/screens/onboarding/QuestionnaireScreen.tsx (Refatorado)

import React, { useState, useMemo } from 'react'; // Importar useMemo
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
import { useNavigation, useTheme } from '@react-navigation/native'; // <<< IMPORTAR useTheme
// ^^^ IMPORTANTE: Se você estiver usando outra biblioteca de tema (ex: React Native Paper),
// importe o useTheme dela (ex: import { useTheme } from 'react-native-paper';)
import { Feather } from '@expo/vector-icons';

// TODO: Import the actual thunk for submitting data
// import { submitQuestionnaireData } from '../../store/slices/userSlice';
import { RootState } from '../../store'; // Assuming RootState is defined
// REMOVIDO: import { theme } from '../theme'; // <<< Não importar mais diretamente

// --- Placeholder for the Redux Action ---
const submitQuestionnaireData = (formData: any) => ({
  type: 'user/submitQuestionnaire',
  payload: formData,
});
// --- End Placeholder ---

// --- Helper Types/Constants ---
// ... (Seus tipos GENDER_OPTIONS, EXPERIENCE_LEVELS, GOALS, etc. permanecem os mesmos) ...
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
  const theme = useTheme(); // <<< OBTER O TEMA AQUI DENTRO
  const { loading, error } = useSelector((state: RootState) => state.user);

  // --- Form State ---
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
  // --- End Form State ---

  // --- Handlers ---
  const toggleTrainingDay = (dayValue: string) => {
    setTrainingDays(prev => ({
      ...prev,
      [dayValue]: !prev[dayValue],
    }));
  };

  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);

  const isFormValid = () => {
    // ... (lógica de validação permanece a mesma) ...
     const selectedDaysCount = getSelectedDays().length;

    if (!nome || !diaNascimento || !mesNascimento || !anoNascimento || !genero || !peso || !altura || !experienciaTreino || !objetivo || temLesoes === null || selectedDaysCount === 0 || includeCardio === null || includeStretching === null || averageTrainingTime === null) {
      return false;
    }
    // Removido o bloqueio se lesões for true mas campos não preenchidos, conforme código original
    // if (temLesoes === true && (!lesoes || !descricaoLesao)) {
    //   return false;
    // }
    return true;
  };

  const handleSubmit = async () => {
     if (!isFormValid()) {
        Alert.alert('Campos Incompletos', 'Por favor, preencha todos os campos obrigatórios e selecione ao menos um dia de treino.');
        return;
      }
    // ... (lógica de submit permanece a mesma) ...
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
      console.log('Submitting Form Data:', formData);
      // dispatch(submitQuestionnaireData(formData)); // Descomente quando tiver a action real
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulação
      console.log('Form submitted successfully (simulated)');
      navigation.reset({ index: 0, routes: [{ name: 'MainNavigator' }] }); // Ajuste nome da rota se necessário
    } catch (submissionError: any) {
      console.error("Submission Error:", submissionError);
      Alert.alert('Erro ao Salvar', submissionError.message || 'Não foi possível salvar seus dados. Tente novamente.');
    }
  };
  // --- End Handlers ---

  // --- Styles Definition (Moved Inside Component using useMemo) ---
  const styles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background, // Usando theme do hook
    },
    scrollContainer: {
      // Assumindo que seu theme tem 'spacing' (ajuste se necessário)
      padding: theme.spacing?.regular ?? 16,
      paddingBottom: (theme.spacing?.large ?? 24) * 2,
    },
    title: {
      // Assumindo theme.typography e theme.colors
      fontSize: theme.typography?.sizes?.title ?? 24,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: theme.spacing?.small ?? 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: theme.typography?.sizes?.regular ?? 16,
      color: theme.colors.textSecondary ?? theme.colors.text, // Fallback para text
      textAlign: 'center',
      marginBottom: theme.spacing?.large ?? 24,
    },
    section: {
      marginBottom: theme.spacing?.medium ?? 16,
    },
    sectionHeader: {
      fontSize: theme.typography?.sizes?.large ?? 20,
      fontWeight: 'bold',
      color: theme.colors.primary,
      marginBottom: theme.spacing?.regular ?? 16,
      marginTop: theme.spacing?.small ?? 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary + '50', // Pode precisar ajustar
      paddingBottom: (theme.spacing?.small ?? 8) / 2,
    },
    label: {
      fontSize: theme.typography?.sizes?.medium ?? 18,
      color: theme.colors.text,
      marginBottom: theme.spacing?.small ?? 8,
      fontWeight: '600',
    },
    input: {
      // Manter cores fixas se for intencional (ex: para contraste em tema escuro)
      // Ou usar cores do tema: theme.colors.inputBackground ?? 'rgba(255, 255, 255, 0.1)'
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      color: theme.colors.text,
      paddingHorizontal: theme.spacing?.regular ?? 16,
      paddingVertical: 12,
      // Assumindo theme.borderRadius
      borderRadius: theme.borderRadius?.small ?? 8,
      fontSize: theme.typography?.sizes?.regular ?? 16,
      borderWidth: 1,
      // borderColor: theme.colors.border ?? 'rgba(255, 255, 255, 0.2)'
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
    // Combine styles for date inputs if they are identical except width
    dateInput: {
        // Herda estilos de 'input', só muda a largura e alinhamento
        width: '30%',
        textAlign: 'center',
    },
    yearInput: {
        // Herda estilos de 'input', só muda a largura
        width: '35%',
        textAlign: 'center', // Added for consistency
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    column: {
        width: '48%',
    },
    optionButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.1)', // Ou theme.colors.inputBackground
      padding: theme.spacing?.regular ?? 16,
      borderRadius: theme.borderRadius?.small ?? 8,
      marginBottom: theme.spacing?.small ?? 8,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)', // Ou theme.colors.border
    },
    optionButtonSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary, // Manter borda da mesma cor
    },
    optionText: {
      color: theme.colors.text,
      fontSize: theme.typography?.sizes?.regular ?? 16,
      textAlign: 'center',
    },
    optionTextSelected: {
      // Usar cor de texto sobre primária se existir no tema
      color: theme.colors.textOnPrimary ?? '#0A0A0A',
      fontWeight: 'bold',
    },
    yesNoContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around', // Ou space-between com padding
    },
    yesNoButton: {
        width: '45%', // Para dar espaço entre eles
        // Herda estilos de optionButton, centraliza o texto
        alignItems: 'center', // Garante que o texto dentro fique centralizado
    },
    daysContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: theme.spacing?.small ?? 8, // Adiciona espaçamento entre botões
    },
    dayButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)', // Ou theme.colors.inputBackground
        paddingVertical: theme.spacing?.small ?? 8,
        paddingHorizontal: theme.spacing?.regular ?? 12, // Um pouco menos horizontal
        borderRadius: theme.borderRadius?.large ?? 20, // Mais arredondado
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)', // Ou theme.colors.border
        alignItems: 'center',
        // marginBottom removido, 'gap' no container cuida disso
        flexBasis: '12%', // Mínimo, pode crescer um pouco
        minWidth: 45, // Garante um tamanho mínimo clicável
    },
    dayButtonSelected: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    dayText: {
        color: theme.colors.text,
        fontSize: theme.typography?.sizes?.small ?? 14,
    },
    dayTextSelected: {
        color: theme.colors.textOnPrimary ?? '#0A0A0A',
        fontWeight: 'bold',
    },
    submitButton: {
      backgroundColor: theme.colors.primary,
      padding: theme.spacing?.regular ?? 16,
      borderRadius: theme.borderRadius?.medium ?? 12,
      alignItems: 'center',
      marginTop: theme.spacing?.medium ?? 16,
    },
    submitButtonDisabled: {
      // Usar cor de fundo desabilitada do tema ou um cinza com opacidade
      backgroundColor: theme.colors.disabledBackground ?? theme.colors.grey ?? 'grey',
      opacity: 0.6,
    },
    submitButtonText: {
      color: theme.colors.textOnPrimary ?? '#0A0A0A',
      fontSize: theme.typography?.sizes?.medium ?? 18,
      fontWeight: 'bold',
    },
    errorText: {
      color: theme.colors.error ?? 'red', // Fallback para vermelho
      textAlign: 'center',
      marginTop: theme.spacing?.regular ?? 16,
    },
  }), [theme]); // Recalcula os estilos APENAS se o objeto 'theme' mudar
  // --- End Styles Definition ---

  // --- Render Helpers ---
  // (As funções renderOptions, renderYesNo, renderDaySelector permanecem as mesmas,
  //  pois elas já usam o objeto 'styles' definido acima)

  // Render Options (String or Number value)
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
                    styles.optionButton, // Base style
                    styles.yesNoButton,  // Width/Alignment adjustments
                    value === true && styles.optionButtonSelected, // Selected style
                ]}
                onPress={() => onSelect(true)}
            >
                <Text style={[ styles.optionText, value === true && styles.optionTextSelected ]}>Sim</Text>
            </TouchableOpacity>
            <TouchableOpacity
                 style={[
                    styles.optionButton, // Base style
                    styles.yesNoButton,  // Width/Alignment adjustments
                    value === false && styles.optionButtonSelected, // Selected style
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
  // --- End Render Helpers ---


  // --- Component Return ---
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }} // Important for KeyboardAvoidingView to work
      >
        <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled" // Good practice for forms
        >
          <Text style={styles.title}>Conte-nos sobre você</Text>
          <Text style={styles.subtitle}>
            Essas informações nos ajudarão a personalizar sua experiência de treino.
          </Text>

          {/* --- Personal Info --- */}
          <Text style={styles.sectionHeader}>Informações Pessoais</Text>
          <View style={styles.section}>
            <Text style={styles.label}>Nome Completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Seu nome"
              placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder direto no TextInput
              value={nome}
              onChangeText={setNome}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.section}>
             <Text style={styles.label}>Data de Nascimento</Text>
             <View style={styles.dateContainer}>
                 <TextInput
                    style={[styles.input, styles.dateInput]} // Combinar estilos
                    placeholder="DD"
                    placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
                    value={diaNascimento}
                    onChangeText={setDiaNascimento}
                    keyboardType="number-pad"
                    maxLength={2}
                 />
                 <TextInput
                    style={[styles.input, styles.dateInput]} // Combinar estilos
                    placeholder="MM"
                    placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
                    value={mesNascimento}
                    onChangeText={setMesNascimento}
                    keyboardType="number-pad"
                    maxLength={2}
                 />
                 <TextInput
                    style={[styles.input, styles.dateInput, styles.yearInput]} // Combinar estilos
                    placeholder="AAAA"
                    placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
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
                        style={styles.input}
                        placeholder="Ex: 75"
                        placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
                        value={peso}
                        onChangeText={setPeso}
                        keyboardType="numeric"
                    />
                 </View>
                 <View style={styles.column}>
                    <Text style={styles.label}>Altura (cm)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex: 180"
                        placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
                        value={altura}
                        onChangeText={setAltura}
                        keyboardType="numeric"
                    />
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
          {temLesoes === true && ( // Renderização condicional
            <>
              <View style={styles.section}>
                <Text style={styles.label}>Quais lesões/restrições? (Opcional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ex: Dor no joelho direito, Hérnia de disco L5"
                    placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
                    value={lesoes}
                    onChangeText={setLesoes}
                 />
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>Descreva brevemente (Opcional)</Text>
                <TextInput
                    style={[styles.input, styles.textArea]} // Combinar estilos
                    placeholder="Ex: Dor ao agachar, evitar impacto"
                    placeholderTextColor={theme.colors.textSecondary ?? '#888'} // <<< Placeholder
                    value={descricaoLesao}
                    onChangeText={setDescricaoLesao}
                    multiline
                 />
              </View>
            </>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            // Combina o estilo base com o desabilitado condicionalmente
            style={[styles.submitButton, (!isFormValid() || loading) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isFormValid() || loading} // Desabilita o toque também
          >
            {loading ? (
              // Usar cor do tema para o ActivityIndicator
              <ActivityIndicator color={theme.colors.textOnPrimary ?? '#0A0A0A'} />
            ) : (
              <Text style={styles.submitButtonText}>Finalizar e Criar Plano</Text>
            )}
          </TouchableOpacity>

          {/* Error Message */}
          {error && <Text style={styles.errorText}>{error as string}</Text>}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// --- REMOVIDO: A definição de 'styles' que estava aqui fora ---

export default QuestionnaireScreen;