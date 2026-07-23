// src/screens/QuestionnaireScreen.tsx
// Tela 02 do fluxo — perfil inicial, na identidade "Força sem ruído".
//
// Onboarding progressivo: o formulário é longo, então a leitura é sustentada
// por seções curtas, rótulos discretos e uma barra de etapa fixa no topo. O
// neon aparece só no progresso e no botão de avançar.
//
// A lógica (validação, storage seguro, expiração de sessão e submissão) é a
// mesma de antes — este arquivo mudou de apresentação, não de comportamento.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getItem as secureGetItem, setItem as secureSetItem, removeLegacyPlaintextCopy } from '../services/auth/secureStorage';
import { probeSessionValidity } from '../services/auth/sessionProbe';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingStackParamList } from '../navigation/OnboardingNavigator';
import { saveQuestionnaireDataAPI } from '../services/api/questionnaireService';
import { resetPostQuestionnaireChatState } from '../services/postQuestionnaireChatStorage';
import theme from '../theme/theme';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import { OptionButton, DayToggle } from '../components/ui/Controls';
import { Notice, ProgressTrack } from '../components/ui/Feedback';

// Tipagem da navegação no fluxo de onboarding
type QuestionnaireNavigationProp = StackNavigationProp<OnboardingStackParamList, 'Questionnaire'>;

// --- Tipos e Constantes ---
type Option = { label: string; value: string };
type DayOption = { label: string; value: string; full: string };
type TimeOption = { label: string; value: number };

const GENDER_OPTIONS: Option[] = [ { label: 'Masculino', value: 'male' }, { label: 'Feminino', value: 'female' }, { label: 'Outro', value: 'other' }, { label: 'Prefiro não dizer', value: 'not_specified'} ];
const EXPERIENCE_LEVELS: Option[] = [ { label: 'Iniciante (Nunca treinei ou < 6 meses)', value: 'beginner' }, { label: 'Intermediário (6 meses - 2 anos)', value: 'intermediate' }, { label: 'Avançado (> 2 anos)', value: 'advanced' } ];
const GOALS: Option[] = [ { label: 'Perda de Peso', value: 'weight_loss' }, { label: 'Ganho de Massa Muscular', value: 'muscle_gain' }, { label: 'Melhorar Condicionamento Físico', value: 'fitness_improvement' }, { label: 'Saúde e Bem-estar', value: 'health_wellness' } ];
// Ordem seg→dom, igual à leitura natural da fileira S T Q Q S S D e à virada
// de semana do app (useDiaLocal: a semana começa na segunda). label, value e
// full precisam apontar para o MESMO dia — já houve deslocamento aqui (o 1º
// "S" gravava domingo) e o plano inteiro saía agendado no dia errado.
const DAYS_OF_WEEK: DayOption[] = [
  { label: 'S', value: 'mon', full: 'Segunda-feira' },
  { label: 'T', value: 'tue', full: 'Terça-feira' },
  { label: 'Q', value: 'wed', full: 'Quarta-feira' },
  { label: 'Q', value: 'thu', full: 'Quinta-feira' },
  { label: 'S', value: 'fri', full: 'Sexta-feira' },
  { label: 'S', value: 'sat', full: 'Sábado' },
  { label: 'D', value: 'sun', full: 'Domingo' },
];
const TIME_OPTIONS: TimeOption[] = [ { label: '30-45 min', value: 45 }, { label: '45-60 min', value: 60 }, { label: '60-90 min', value: 90 }, { label: '+90 min', value: 120 } ];

const STORAGE_KEY_BASE = '@questionnaire_data';
const API_BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1` : '';
if (!API_BASE_URL) { console.error("CRITICAL ERROR: Supabase URL is not configured!"); }

// A gravação do questionário (upsert no PostgREST) vive em
// services/api/questionnaireService.ts — testável e com o UPSERT que faz a
// re-submissão ATUALIZAR a linha em vez de descartar as respostas novas.

const QuestionnaireScreen = () => {
  const navigation = useNavigation<QuestionnaireNavigationProp>();

  // --- Estados ---
  const [isLoading, setIsLoading] = useState(false); // Loading geral (submissão)
  const [error, setError] = useState<string | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(true); // Loading específico do AsyncStorage
  const [dataLoadedFromStorage, setDataLoadedFromStorage] = useState(false); // Indica se a tentativa de carregar do storage já ocorreu

  const { user, session, updateProfile, signOut, loadingSession } = useAuth();
  const userId = user?.id;
  const authToken = session?.access_token;

  // Estados do formulário
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

  // Chave de armazenamento local baseada no userId
  const userStorageKey = useMemo(() => userId ? `${STORAGE_KEY_BASE}_${userId}` : null, [userId]);

  // --- Lidar com expiração da sessão ---
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
    // signOut do AuthContext indisponível (muito improvável): limpa a preferência
    // local. A volta ao login ocorre quando o AuthContext zera a sessão e o
    // RootNavigator troca para o AuthNavigator — sem reset cross-navigator.
    await AsyncStorage.removeItem('@userShouldStayLoggedIn');
    }
    } catch (error) {
    console.error("[QuestionnaireScreen] Erro ao fazer logout via handleSessionExpiration:", error);
    // Sem reset cross-navigator: signOut já limpa o estado mesmo em erro, e o
    // RootNavigator troca para o AuthNavigator ao reavaliar a sessão.
    } finally {
    setIsLoading(false);
    }
    }
    }
    ]
    );
  }, [signOut, navigation]);

  // --- Verificação de sessão válida ---
  // Só um 401/403 real do servidor desloga. Probe inconclusivo (rede fora,
  // config ausente, 5xx, clock skew) mantém a sessão — política do AuthContext.
  useEffect(() => {
    const checkValidSession = async () => {
    if (session && error) { // Se temos sessão mas ocorreu um erro (pode ser de token)
    console.log("[QuestionnaireScreen] Verificando validade da sessão devido a erro anterior...");
    const result = await probeSessionValidity({
    baseUrl: API_BASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    authToken,
    });
    if (result === 'invalid') {
    console.error("[QuestionnaireScreen] Sessão inválida confirmada pelo servidor.");
    handleSessionExpiration(); // Chama a função de logout
    } else if (result === 'indeterminate') {
    console.warn("[QuestionnaireScreen] Probe de sessão inconclusivo (rede/config) — mantendo a sessão.");
    } else {
    console.log("[QuestionnaireScreen] Sessão ainda válida após teste.");
    }
    }
    };
    checkValidSession();
  }, [session, error, authToken, handleSessionExpiration]);

  // --- Carregar Dados Salvos ---
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
        } else {
           // Se ainda está carregando a sessão ou esperando userId
           console.log("[QuestionnaireScreen] Aguardando fim do loading da sessão ou disponibilidade do userId para carregar dados do storage...");
        }
        return; // Sai da função se alguma das condições acima for verdadeira
      }

      console.log(`[QuestionnaireScreen] Iniciando carregamento de dados do AsyncStorage com a chave: ${userStorageKey}`);
      setIsLoadingStorage(true); // Garante que o loading do storage está ativo
      try {
        const savedData = await secureGetItem(userStorageKey);
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
  }, [userId, userStorageKey, loadingSession, dataLoadedFromStorage]);

  // --- Limpar Erro no Foco ---
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { setError(null); });
    return unsubscribe;
  }, [navigation]);

  // --- Handlers ---
  const toggleTrainingDay = (dayValue: string) => { setTrainingDays(prev => ({ ...prev, [dayValue]: !prev[dayValue] })); };
  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);
  // Um bloco só conta como respondido quando passa na MESMA validação que
  // habilita o envio — barra em 100% e botão desabilitado ao mesmo tempo é
  // contradição (a data 99/99/2000 "tinha formato" mas nunca seria aceita).
  const blocosRespondidos = (): boolean[] => {
    const diaNum = parseInt(diaNascimento, 10);
    const mesNum = parseInt(mesNascimento, 10);
    const anoNum = parseInt(anoNascimento, 10);
    const isDateValid = /^\d{1,2}$/.test(diaNascimento) && diaNum > 0 && diaNum <= 31 &&
    /^\d{1,2}$/.test(mesNascimento) && mesNum > 0 && mesNum <= 12 &&
    /^\d{4}$/.test(anoNascimento) && anoNum > 1900 && anoNum <= new Date().getFullYear();

    return [
      !!nome,
      isDateValid,
      !!genero,
      !!peso && /^\d+(\.\d+)?$/.test(peso) && parseFloat(peso) > 0 &&
        !!altura && /^\d+$/.test(altura) && parseInt(altura, 10) > 0,
      !!experienciaTreino,
      !!objetivo,
      getSelectedDays().length > 0,
      averageTrainingTime !== null,
      includeCardio !== null,
      includeStretching !== null,
      temLesoes !== null &&
        (!temLesoes || lesoes.trim() !== '' || descricaoLesao.trim() !== ''),
    ];
  };

  const isFormValid = () => blocosRespondidos().every(Boolean);

  // Progresso real do preenchimento: cada bloco obrigatório validado conta um
  // passo. Não é estimativa — é a contagem dos campos que a validação exige.
  const completude = useMemo(() => {
    const blocos = blocosRespondidos();
    return { respondidos: blocos.filter(Boolean).length, total: blocos.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nome, diaNascimento, mesNascimento, anoNascimento, genero, peso, altura,
    experienciaTreino, objetivo, trainingDays, averageTrainingTime,
    includeCardio, includeStretching, temLesoes, lesoes, descricaoLesao,
  ]);

  // --- handleSubmit ---
  // pularChat=true vem do botão "Gerar treino direto": a persistência é a
  // mesma, só muda o destino — a tela de chat recebe skipChat para disparar
  // a geração sem mostrar a escolha inicial.
  const handleSubmit = async (pularChat: boolean = false) => {
    if (typeof updateProfile !== 'function') { console.error("[QuestionnaireScreen] A função updateProfile não está disponível no AuthContext!"); Alert.alert('Erro Interno', 'Funcionalidade indisponível. Tente novamente mais tarde.'); return; }
    if (!userId || !authToken) { Alert.alert('Erro', 'Usuário não autenticado. Faça login novamente.'); return; }
    if (!userStorageKey) { Alert.alert('Erro Interno', 'Não foi possível determinar o armazenamento local.'); return; }

    if (!isFormValid()) {
    setError('Por favor, preencha todos os campos obrigatórios corretamente.');
    Alert.alert('Campos Incompletos', 'Verifique se todos os campos obrigatórios foram preenchidos corretamente, incluindo data de nascimento, peso e altura válidos.');
    return;
    }

    // O véu bloqueia toques, mas um campo focado continuaria recebendo o
    // teclado: derruba o foco para congelar o formulário por inteiro.
    Keyboard.dismiss();
    setError(null); setIsLoading(true); // Ativa o loading geral para a submissão

    // Prepara os dados para API e Storage
    const formattedDate = `${anoNascimento}-${mesNascimento.padStart(2, '0')}-${diaNascimento.padStart(2, '0')}`;
    const pesoNum = parseFloat(peso) || null;
    const alturaNum = parseInt(altura, 10) || null;
    const lesoesDetalhes = temLesoes ? `${lesoes}${descricaoLesao ? ` (${descricaoLesao})` : ''}`.trim() || null : null;
    const formDataForApi = { usuario_id: userId, data_nascimento: formattedDate, genero: genero, peso_kg: pesoNum, altura_cm: alturaNum, experiencia_treino: experienciaTreino, objetivo: objetivo, tem_lesoes: temLesoes, lesoes_detalhes: lesoesDetalhes, dias_treino: getSelectedDays(), inclui_cardio: includeCardio, inclui_alongamento: includeStretching, tempo_medio_treino_min: averageTrainingTime };
    const formDataForStorage = { ...formDataForApi, nome: nome }; // Inclui o nome para o storage local

    try {
    // 1. Salvar no armazenamento seguro primeiro (para ter backup local criptografado)
    await secureSetItem(userStorageKey, JSON.stringify(formDataForStorage));
    // Remove a cópia legada em texto puro (só no nativo — no web apagaria o
    // que acabou de ser salvo; ver removeLegacyPlaintextCopy)
    await removeLegacyPlaintextCopy(userStorageKey);
    console.log('[QuestionnaireScreen] Dados salvos no armazenamento seguro.');

    // 2. Tentar salvar na API (Supabase)
    try {
      await saveQuestionnaireDataAPI(formDataForApi);
      console.log('[QuestionnaireScreen] Dados salvos na API com sucesso.');
    } catch (apiError: any) {
      // Verificar se é erro de token expirado
      if (apiError.message === 'TOKEN_EXPIRED') {
        console.log('[QuestionnaireScreen] Token expirado detectado durante submissão API');
        handleSessionExpiration(); // Lida com a expiração (mostra alerta e desloga)
        return; // Interrompe a execução do handleSubmit
      }
      // Se for erro 409 (já existe), apenas loga e continua, pois vamos navegar para o chat de qualquer forma
      if (apiError.message === 'QUESTIONNAIRE_ALREADY_EXISTS') {
         console.warn('[QuestionnaireScreen] API indica que o questionário já existe (409). Prosseguindo para o chat.');
      } else {
        // Outros erros da API, lança para o catch externo tratar
        throw apiError;
      }
    }

    // 3. Rodada nova de questionário: a conversa da rodada anterior (inclusive
    // um "encerrado" persistido por geração que falhou) não vale mais. Sem o
    // reset, a tela de chat carrega o estado morto e abre como "Chat finalizado".
    await resetPostQuestionnaireChatState(userId);

    // 4. Navegar para a tela de Chat
    console.log('[QuestionnaireScreen] Navegando para PostQuestionnaireChat...');
    if (pularChat) {
      navigation.navigate('PostQuestionnaireChat', { formData: formDataForStorage, skipChat: true });
    } else {
      navigation.navigate('PostQuestionnaireChat', { formData: formDataForStorage });
    }

    } catch (submissionError: any) {
      console.error('[QuestionnaireScreen] Falha no processo de submissão (fora do erro 409/token):', submissionError);
      let errorMessage = submissionError?.message || 'Erro inesperado ao salvar os dados.';

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
    }
  };

  // --- Blocos de apresentação ---
  const renderOptions = (
    options: Array<Option | TimeOption>,
    selectedValue: string | number | null,
    onSelect: (value: string | number) => void,
    title: string,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.stack}>
        {options.map((option) => (
          <OptionButton
            key={option.value.toString()}
            label={option.label}
            selected={selectedValue === option.value}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
    </View>
  );

  const renderYesNo = (
    value: boolean | null,
    onSelect: (value: boolean) => void,
    title: string,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.pair}>
        <OptionButton label="Sim" centered selected={value === true} onPress={() => onSelect(true)} style={styles.pairItem} />
        <OptionButton label="Não" centered selected={value === false} onPress={() => onSelect(false)} style={styles.pairItem} />
      </View>
    </View>
  );

  const SectionHead = ({ children }: { children: string }) => (
    <Text style={styles.sectionHead} accessibilityRole="header">{children}</Text>
  );

  // Tela de espera: sessão e storage precisam ter terminado antes do formulário
  if (loadingSession || isLoadingStorage) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.accent.main} />
          <Text style={styles.waitingText}>
            {loadingSession ? 'Verificando sessão...' : 'Carregando dados...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.stepBar}>
          <View style={styles.stepMeta}>
            <Text style={styles.stepLabel}>Perfil inicial</Text>
            <Text style={styles.stepLabel}>
              {completude.respondidos} de {completude.total}
            </Text>
          </View>
          <ProgressTrack
            ratio={completude.respondidos / completude.total}
            accessibilityLabel="Progresso do questionário"
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title} accessibilityRole="header">Vamos construir sua base.</Text>
          <Text style={styles.subtitle}>Poucas respostas para um plano realmente pessoal.</Text>

          {error ? <Notice tone="danger" title={error} style={styles.notice} /> : null}

          <SectionHead>Informações pessoais</SectionHead>

          <TextField
            label="Nome completo"
            value={nome}
            onChangeText={setNome}
            autoCapitalize="words"
          />

          <View style={styles.field}>
            <Text style={styles.label}>Data de nascimento</Text>
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.miniInput, styles.dateCell]}
                placeholder="DD"
                accessibilityLabel="Dia de nascimento"
                placeholderTextColor={theme.colors.text.quiet}
                selectionColor={theme.colors.accent.main}
                value={diaNascimento}
                onChangeText={setDiaNascimento}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TextInput
                style={[styles.miniInput, styles.dateCell]}
                placeholder="MM"
                accessibilityLabel="Mês de nascimento"
                placeholderTextColor={theme.colors.text.quiet}
                selectionColor={theme.colors.accent.main}
                value={mesNascimento}
                onChangeText={setMesNascimento}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TextInput
                style={[styles.miniInput, styles.yearCell]}
                placeholder="AAAA"
                accessibilityLabel="Ano de nascimento"
                placeholderTextColor={theme.colors.text.quiet}
                selectionColor={theme.colors.accent.main}
                value={anoNascimento}
                onChangeText={setAnoNascimento}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>

          {renderOptions(GENDER_OPTIONS, genero, (v) => setGenero(v as string), 'Gênero')}

          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Text style={styles.label}>Peso (kg)</Text>
              <TextInput
                style={styles.miniInput}
                placeholder="Ex: 75.5"
                accessibilityLabel="Peso em quilos"
                placeholderTextColor={theme.colors.text.quiet}
                selectionColor={theme.colors.accent.main}
                value={peso}
                onChangeText={setPeso}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.pairItem}>
              <Text style={styles.label}>Altura (cm)</Text>
              <TextInput
                style={styles.miniInput}
                placeholder="Ex: 180"
                accessibilityLabel="Altura em centímetros"
                placeholderTextColor={theme.colors.text.quiet}
                selectionColor={theme.colors.accent.main}
                value={altura}
                onChangeText={setAltura}
                keyboardType="numeric"
              />
            </View>
          </View>

          <SectionHead>Experiência e objetivos</SectionHead>
          {renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string), 'Nível de experiência com treinos?')}
          {renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string), 'Objetivo principal?')}

          <SectionHead>Preferências de treino</SectionHead>
          <View style={styles.field}>
            <Text style={styles.label}>Dias da semana para treinar?</Text>
            <View style={styles.days}>
              {DAYS_OF_WEEK.map((day) => (
                <DayToggle
                  key={day.value}
                  label={day.label}
                  accessibilityLabel={day.full}
                  selected={!!trainingDays[day.value]}
                  onPress={() => toggleTrainingDay(day.value)}
                />
              ))}
            </View>
          </View>
          {renderOptions(TIME_OPTIONS, averageTrainingTime, (v) => setAverageTrainingTime(v as number), 'Tempo médio disponível por treino?')}
          {renderYesNo(includeCardio, setIncludeCardio, 'Incluir cardio no plano?')}
          {renderYesNo(includeStretching, setIncludeStretching, 'Incluir alongamentos no plano?')}

          <SectionHead>Saúde e restrições</SectionHead>
          {renderYesNo(temLesoes, setTemLesoes, 'Possui alguma lesão ou restrição médica?')}
          {temLesoes === true && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Quais lesões ou restrições? (Opcional)</Text>
                <TextInput
                  style={styles.miniInput}
                  placeholder="Ex: Dor no joelho, Hérnia L5"
                  accessibilityLabel="Quais lesões ou restrições"
                  placeholderTextColor={theme.colors.text.quiet}
                  selectionColor={theme.colors.accent.main}
                  value={lesoes}
                  onChangeText={setLesoes}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Descreva brevemente (Opcional)</Text>
                <TextInput
                  style={[styles.miniInput, styles.textArea]}
                  placeholder="Ex: Dor ao agachar, evitar impacto"
                  accessibilityLabel="Descrição da lesão"
                  placeholderTextColor={theme.colors.text.quiet}
                  selectionColor={theme.colors.accent.main}
                  value={descricaoLesao}
                  onChangeText={setDescricaoLesao}
                  multiline
                />
              </View>
            </>
          )}

          <Button
            label="Conversar com IA"
            icon="message-circle"
            onPress={() => handleSubmit(false)}
            loading={isLoading}
            disabled={!isFormValid()}
            style={styles.submit}
          />

          <Button
            label="Gerar treino direto"
            variant="outline"
            icon="zap"
            onPress={() => handleSubmit(true)}
            loading={isLoading}
            disabled={!isFormValid()}
            style={styles.submitDirect}
          />

          <Text style={styles.signature}>Desenvolvido no Brasil</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Véu de salvamento: o payload é capturado no toque em "Conversar com
          IA" — sem bloquear o formulário, uma edição feita durante o await
          apareceria na tela mas nunca chegaria ao banco. */}
      {isLoading ? (
        <View
          style={styles.savingVeil}
          testID="veu-salvando"
          accessibilityLabel="Salvando suas respostas"
        >
          <ActivityIndicator size="large" color={theme.colors.accent.main} />
          <Text style={styles.waitingText}>Salvando suas respostas...</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface.canvas },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  savingVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.88)', // preto da marca com véu
  },
  waitingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },

  stepBar: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  stepMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  stepLabel: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  scroll: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.huge,
  },
  title: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
  },
  subtitle: {
    marginTop: theme.spacing.xxs,
    marginBottom: theme.spacing.xl,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  notice: { marginBottom: theme.spacing.lg },

  sectionHead: {
    marginTop: theme.spacing.xxl,
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semiBold,
  },

  field: { marginBottom: theme.spacing.lg },
  label: {
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
  },
  stack: { gap: theme.spacing.sm },
  pair: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  pairItem: { flex: 1 },

  miniInput: {
    minHeight: theme.hitTarget.compact,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
  },
  textArea: { height: 96, paddingTop: theme.spacing.md, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: theme.spacing.sm },
  dateCell: { flex: 1, textAlign: 'center' },
  yearCell: { flex: 1.35, textAlign: 'center' },

  days: { flexDirection: 'row', gap: theme.spacing.xs },

  submit: { marginTop: theme.spacing.xxl },
  submitDirect: { marginTop: theme.spacing.md },
  signature: {
    marginTop: theme.spacing.xl,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    textAlign: 'center',
  },
});

export default QuestionnaireScreen;
