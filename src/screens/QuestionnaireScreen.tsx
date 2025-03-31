// src/screens/onboarding/QuestionnaireScreen.tsx (Refatorado e Integrado)

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
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper'; // <<< IMPORTAR useTheme do PAPER
// import { Feather } from '@expo/vector-icons'; // Não usado neste código

import {
  submitQuestionnaire,
  selectUserLoading,
  selectUserError,
  clearUserError,
  selectAuthenticatedUserId,
} from '../store/slices/userSlice'; // <<< CORRIGIDO
import { RootState } from '../store'; // <<< CORRIGIDO (Assumindo que RootState está em src/store/index.ts)

// --- Tipos e Constantes (MANTENHA OS SEUS IGUAIS) ---
type Option = { label: string; value: string };
type DayOption = { label: string; value: string };
type TimeOption = { label: string; value: number };

const GENDER_OPTIONS: Option[] = [ /* ... Mantenha os seus ... */ ];
const EXPERIENCE_LEVELS: Option[] = [ /* ... Mantenha os seus ... */ ];
const GOALS: Option[] = [ /* ... Mantenha os seus ... */ ];
const DAYS_OF_WEEK: DayOption[] = [ /* ... Mantenha os seus ... */ ];
const TIME_OPTIONS: TimeOption[] = [ /* ... Mantenha os seus ... */ ];
// --- Fim Tipos e Constantes ---

const QuestionnaireScreen = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const theme = useTheme(); // <<< OBTIDO DO REACT NATIVE PAPER
  const paperTheme = useTheme(); // Alias para clareza, se preferir

  // --- Seletores Redux ---
  const loadingStatus = useSelector(selectUserLoading); // Obtém 'idle' | 'pending' | 'succeeded' | 'failed'
  const submissionError = useSelector(selectUserError);
  const userIdFromRedux = useSelector(selectAuthenticatedUserId); // Tenta obter ID do Redux

  // --- Contexto de Autenticação (Fallback para obter ID) ---
   const { user } = useAuth(); // Obtém o usuário do contexto
   const userId = userIdFromRedux || user?.id; // Usa ID do Redux ou do Contexto

  // --- Estado do Formulário (MANTENHA OS SEUS IGUAIS) ---
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
  const [lesoes, setLesoes] = useState(''); // Mantido mesmo se temLesoes=false
  const [descricaoLesao, setDescricaoLesao] = useState(''); // Mantido mesmo se temLesoes=false
  const [trainingDays, setTrainingDays] = useState<{ [key: string]: boolean }>({});
  const [includeCardio, setIncludeCardio] = useState<boolean | null>(null);
  const [includeStretching, setIncludeStretching] = useState<boolean | null>(null);
  const [averageTrainingTime, setAverageTrainingTime] = useState<number | null>(null);
  // --- Fim Estado do Formulário ---

  // Limpa o erro ao desmontar a tela ou ao focar nela novamente
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      dispatch(clearUserError());
    });
    return unsubscribe;
  }, [navigation, dispatch]);

  // Exibe alerta de erro vindo do Redux
  useEffect(() => {
      if (loadingStatus === 'failed' && submissionError) {
          Alert.alert('Erro ao Salvar', submissionError);
          dispatch(clearUserError()); // Limpa o erro após exibir
      }
  }, [loadingStatus, submissionError, dispatch]);


  // --- Handlers (Adaptados) ---
  const toggleTrainingDay = (dayValue: string) => {
    setTrainingDays(prev => ({ ...prev, [dayValue]: !prev[dayValue] }));
  };

  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);

  const isFormValid = () => {
    const selectedDaysCount = getSelectedDays().length;
    // Validação básica (ajuste conforme necessidade)
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
        // Opcional: Deslogar o usuário ou navegar para Login
        // Ex: navigation.navigate('Login');
        return;
     }

     if (!isFormValid()) {
      Alert.alert('Campos Incompletos', 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const formData = {
      nome,
      dataNascimento: { dia: diaNascimento, mes: mesNascimento, ano: anoNascimento },
      genero,
      peso,
      altura,
      experienciaTreino,
      objetivo,
      temLesoes,
      lesoes: temLesoes ? lesoes : '', // Envia string vazia se não houver lesões
      descricaoLesao: temLesoes ? descricaoLesao : '', // Envia string vazia se não houver lesões
      trainingDays: getSelectedDays(),
      includeCardio,
      includeStretching,
      averageTrainingTime,
    };

    console.log('[QuestionnaireScreen] Submitting Form Data for user:', userId);
    // Dispatch da action assíncrona
    // O 'unwrap()' pode ser usado para tratar o resultado/erro diretamente aqui,
    // mas como já temos useEffect para erros, apenas despachamos.
    dispatch(submitQuestionnaire({ userId, formData }))
        .unwrap() // Opcional: permite .then() e .catch() aqui
        .then(() => {
            console.log("[QuestionnaireScreen] Dispatch fulfilled, navigating...");
             // Navega SOMENTE se o dispatch for resolvido (sucesso)
            // A navegação pode ser diferente dependendo se você tem um chat pós-questionário
             // navigation.reset({ index: 0, routes: [{ name: 'MainNavigator' }] }); // Navega para Home
             navigation.navigate('PostQuestionnaireChat'); // <<< NAVEGA PARA O CHAT
        })
        .catch((error) => {
             console.error("[QuestionnaireScreen] Dispatch rejected:", error);
             // O erro já deve ser tratado pelo useEffect, mas pode adicionar lógica extra aqui se precisar.
        });
  };
  // --- Fim Handlers ---

  // --- Styles Definition (Adapte cores/fontes conforme seu tema Paper) ---
  const styles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: paperTheme.colors.background, // << USA TEMA PAPER
    },
    scrollContainer: {
      padding: 16, // Use valores fixos ou adapte se seu tema Paper tiver spacing
      paddingBottom: 48,
    },
    title: {
      fontSize: 24, // Adapte aos tamanhos de fonte do seu tema Paper se definidos
      fontWeight: 'bold',
      color: paperTheme.colors.onBackground, // << USA TEMA PAPER
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: paperTheme.colors.onSurfaceVariant, // << USA TEMA PAPER (cor secundária)
      textAlign: 'center',
      marginBottom: 24,
    },
    section: {
      marginBottom: 16,
    },
    sectionHeader: {
      fontSize: 20,
      fontWeight: 'bold',
      color: paperTheme.colors.primary, // << USA TEMA PAPER
      marginBottom: 16,
      marginTop: 8,
      borderBottomWidth: 1,
      borderBottomColor: paperTheme.colors.primary + '50', // Opacidade na cor primária
      paddingBottom: 4,
    },
    label: {
      fontSize: 18,
      color: paperTheme.colors.onSurface, // << USA TEMA PAPER
      marginBottom: 8,
      fontWeight: '600',
    },
    input: {
      backgroundColor: paperTheme.colors.surfaceVariant, // << Fundo sutil do TEMA PAPER
      color: paperTheme.colors.onSurfaceVariant, // << Cor do texto no input
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: paperTheme.roundness, // << Usa roundness do TEMA PAPER
      fontSize: 16,
      borderWidth: 1,
      borderColor: paperTheme.colors.outline, // << Cor da borda do TEMA PAPER
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
      backgroundColor: paperTheme.colors.primary, // << USA TEMA PAPER
      borderColor: paperTheme.colors.primary,
    },
    optionText: {
      color: paperTheme.colors.onSurfaceVariant,
      fontSize: 16,
      textAlign: 'center',
    },
    optionTextSelected: {
      color: paperTheme.colors.onPrimary, // << Cor do texto sobre a cor primária
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
        borderRadius: 20, // Mais arredondado
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
      borderRadius: 12, // Ou paperTheme.roundness * 1.5
      alignItems: 'center',
      marginTop: 16,
    },
    submitButtonDisabled: {
      backgroundColor: paperTheme.colors.surfaceDisabled, // << Cor desabilitada do TEMA PAPER
      opacity: 0.8, // Ajuste a opacidade se necessário
    },
    submitButtonText: {
      color: paperTheme.colors.onPrimary,
      fontSize: 18,
      fontWeight: 'bold',
    },
    errorText: { // Mantido como vermelho explícito para destaque
      color: '#B00020', // Cor de erro padrão do Material Design
      textAlign: 'center',
      marginTop: 16,
      fontSize: 14,
    },
  }), [paperTheme]); // Recalcula estilos se o tema Paper mudar
  // --- Fim Styles Definition ---

    // --- Render Helpers ---
  // (Estas são as definições reais das suas funções)

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
  // --- Fim Render Helpers ---


  // --- Component Return (Adapte os placeholders e use theme do Paper) ---
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

          {/* --- Seções do Formulário (MANTENHA IGUAIS) --- */}
          {/* Use paperTheme.colors.onSurfaceVariant para placeholderTextColor */}
          {/* Ex: placeholderTextColor={paperTheme.colors.onSurfaceVariant} */}

          {/* Informações Pessoais */}
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

          {/* Experiência e Objetivos */}
          <Text style={styles.sectionHeader}>Experiência e Objetivos</Text>
          {renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string), 'Qual seu nível de experiência com treinos?')}
          {renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string), 'Qual seu objetivo principal?')}

          {/* Preferências de Treino */}
          <Text style={styles.sectionHeader}>Preferências de Treino</Text>
          {renderDaySelector()}
          {renderOptions(TIME_OPTIONS, averageTrainingTime, (v) => setAverageTrainingTime(v as number), 'Quanto tempo você tem disponível para treinar em média?')}
          {renderYesNo(includeCardio, setIncludeCardio, 'Gostaria de incluir exercícios de Cardio no seu plano?')}
          {renderYesNo(includeStretching, setIncludeStretching, 'Gostaria de incluir Alongamentos no seu plano?')}

          {/* Saúde e Restrições */}
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


          {/* Botão Submit */}
          <TouchableOpacity
            style={[styles.submitButton, (!isFormValid() || loadingStatus === 'pending') && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isFormValid() || loadingStatus === 'pending'}
          >
            {loadingStatus === 'pending' ? (
              <ActivityIndicator color={paperTheme.colors.onPrimary} /> // << Usa cor do tema
            ) : (
              // <Text style={styles.submitButtonText}>Finalizar e Ir para o Chat</Text> // Texto ajustado
              <Text style={styles.submitButtonText}>Conversar com IA</Text> // Ou algo mais direto
            )}
          </TouchableOpacity>

          {/* Mensagem de erro não é mais necessária aqui, pois é tratada pelo useEffect */}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default QuestionnaireScreen;