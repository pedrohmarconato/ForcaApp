// src/screens/QuestionnaireScreen.tsx
// Tela 02 do fluxo — anamnese, na Direção 03 ("Força em movimento").
//
// Apresentação nova: stepper conversacional — UMA pergunta por tela, avanço
// automático nas escolhas únicas (280ms depois do toque), Continuar explícito
// nos passos de texto/multi-seleção, progresso pelos módulos do F. Retomada
// inteligente: com rascunho salvo, a tela abre no primeiro passo sem resposta.
//
// A lógica (validação por bloco, storage seguro, expiração de sessão, UPSERT
// via questionnaireService e reset do chat da rodada anterior) é a MESMA de
// antes — este arquivo mudou de apresentação, não de comportamento. Os passos
// mapeiam 1:1 os blocos de `blocosRespondidos()`.

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

import { getItem as secureGetItem, setItem as secureSetItem, removeLegacyPlaintextCopy } from '../services/auth/secureStorage';
import { showAlert } from '../utils/alertShim';
import { probeSessionValidity } from '../services/auth/sessionProbe';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingStackParamList } from '../navigation/OnboardingNavigator';
import { saveQuestionnaireDataAPI } from '../services/api/questionnaireService';
import { CARDIO_MODALIDADES } from '../constants/cardioModalidades';
import { resetPostQuestionnaireChatState } from '../services/postQuestionnaireChatStorage';
import theme from '../theme/theme';
import { easeImpulso } from '../utils/motion';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import NumericField, { numericTextToNumber } from '../components/ui/NumericField';
import { OptionButton, DayToggle } from '../components/ui/Controls';
import { Notice } from '../components/ui/Feedback';
import FModules from '../components/ui/FModules';

// Tipagem da navegação no fluxo de onboarding
type QuestionnaireNavigationProp = StackNavigationProp<OnboardingStackParamList, 'Questionnaire'>;

// --- Tipos e Constantes ---
type Option = { label: string; value: string };
type DayOption = { label: string; value: string; full: string };
type TimeOption = { label: string; value: number };

const GENDER_OPTIONS: Option[] = [ { label: 'Masculino', value: 'male' }, { label: 'Feminino', value: 'female' }, { label: 'Outro', value: 'other' }, { label: 'Prefiro não dizer', value: 'not_specified'} ];
const EXPERIENCE_LEVELS: Option[] = [ { label: 'Iniciante (Nunca treinei ou < 6 meses)', value: 'beginner' }, { label: 'Intermediário (6 meses - 2 anos)', value: 'intermediate' }, { label: 'Avançado (> 2 anos)', value: 'advanced' } ];
const GOALS: Option[] = [ { label: 'Perda de Peso', value: 'weight_loss' }, { label: 'Ganho de Massa Muscular', value: 'muscle_gain' }, { label: 'Melhorar Condicionamento Físico', value: 'fitness_improvement' }, { label: 'Saúde e Bem-estar', value: 'health_wellness' } ];
// Vocabulário FECHADO (REQ-04/05, Fase 2): os 3 `value` são EXATAMENTE os
// literais aceitos pelo CHECK `questionario_cardio_objetivo_check` da
// migration 0033 e pela chave `_TEXTO_OBJETIVO_CARDIO` do backend
// (backend/app.py) — os 3 têm de permanecer idênticos nos 3 lugares.
const CARDIO_OBJETIVOS: Option[] = [
  { label: 'Condicionamento geral', value: 'condicionamento' },
  { label: 'Completar uma corrida de 5km', value: 'completar_5k' },
  { label: 'Emagrecimento', value: 'emagrecimento' },
];
const isCardioObjetivoValido = (valor: unknown): valor is string =>
  typeof valor === 'string' && CARDIO_OBJETIVOS.some((opcao) => opcao.value === valor);
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

import { TIME_OPTIONS } from '../constants/tempoTreino';

const STORAGE_KEY_BASE = '@questionnaire_data';
const API_BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1` : '';
if (!API_BASE_URL) { console.error("CRITICAL ERROR: Supabase URL is not configured!"); }

// Delay do avanço automático: o aluno vê a seleção marcada antes da troca.
const AUTO_ADVANCE_MS = 280;
const TOTAL_STEPS = 11;

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
  // Dose de cardio declarada (0021): dias, minutos e modalidades aceitas. Só
  // existe com includeCardio === true — a constraint
  // questionario_cardio_dose_coerente recusa dose com cardio desligado, então
  // desmarcar TEM de limpar (ver definirIncluiCardio).
  const [cardioDias, setCardioDias] = useState<number | null>(null);
  const [cardioMinutos, setCardioMinutos] = useState<number | null>(null);
  const [cardioModalidades, setCardioModalidades] = useState<string[]>([]);
  // Anamnese de cardio (Fase 2, REQ-04): já pratica corrida/caminhada rápida/
  // pedal/outro cardio hoje? Sinal de experiência — distinto da dose declarada
  // acima (quanto ele PRETENDE fazer no plano) — vai para formDataForApi como
  // cardio_pratica_atualmente e é usado no backend para derivar o nível de
  // cardio e calibrar a dose inicial/teto de progressão.
  const [cardioPraticaAtualmente, setCardioPraticaAtualmente] = useState<boolean | null>(null);
  // Distância confortável hoje (só faz sentido — e só é coerente pela
  // migration 0033 — para quem respondeu que já pratica cardio) e objetivo
  // (vocabulário fechado, CARDIO_OBJETIVOS acima) — os 2 sinais que faltavam
  // para nivel_cardio_declarado() usar a informação completa.
  const [cardioDistanciaConfortavelKm, setCardioDistanciaConfortavelKm] = useState<number | null>(null);
  const [cardioObjetivo, setCardioObjetivo] = useState<string | null>(null);
  const [includeStretching, setIncludeStretching] = useState<boolean | null>(null);
  const [averageTrainingTime, setAverageTrainingTime] = useState<number | null>(null);

  // --- Estado do stepper ---
  const [step, setStep] = useState(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef = useRef(false);
  const stepAnim = useRef(new Animated.Value(1)).current;

  // Chave de armazenamento local baseada no userId
  const userStorageKey = useMemo(() => userId ? `${STORAGE_KEY_BASE}_${userId}` : null, [userId]);

  // --- Lidar com expiração da sessão ---
  const handleSessionExpiration = useCallback(async () => {
    showAlert(
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
          console.log("[QuestionnaireScreen] Sessão carregada, sem usuário. Marcando carregamento do storage como concluído (sem dados).");
          setIsLoadingStorage(false);
          setDataLoadedFromStorage(true);
        }
        return;
      }

      console.log(`[QuestionnaireScreen] Iniciando carregamento de dados do AsyncStorage com a chave: ${userStorageKey}`);
      setIsLoadingStorage(true);
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
          setCardioDias(typeof data.cardio_dias_semana === 'number' ? data.cardio_dias_semana : null);
          setCardioMinutos(
            typeof data.cardio_minutos_sessao === 'number' ? data.cardio_minutos_sessao : null,
          );
          setCardioModalidades(
            Array.isArray(data.cardio_modalidades)
              ? data.cardio_modalidades.filter((m: unknown) => typeof m === 'string')
              : [],
          );
          setCardioPraticaAtualmente(
            typeof data.cardio_pratica_atualmente === 'boolean' ? data.cardio_pratica_atualmente : null,
          );
          setCardioDistanciaConfortavelKm(
            typeof data.cardio_distancia_confortavel_km === 'number'
              ? data.cardio_distancia_confortavel_km
              : null,
          );
          setCardioObjetivo(
            isCardioObjetivoValido(data.cardio_objetivo) ? data.cardio_objetivo : null,
          );
          setIncludeStretching(data.inclui_alongamento !== undefined ? data.inclui_alongamento : null);
          setAverageTrainingTime(data.tempo_medio_treino_min || null);
        } else {
          console.log('[QuestionnaireScreen] Nenhum dado salvo encontrado no AsyncStorage para o usuário:', userId);
        }
      } catch (error) {
        console.error('[QuestionnaireScreen] Erro ao carregar dados salvos do AsyncStorage:', error);
        setError("Erro ao carregar dados salvos localmente.");
      } finally {
        setIsLoadingStorage(false);
        setDataLoadedFromStorage(true);
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

  /**
   * Liga/desliga o cardio. Desligar LIMPA a dose: o banco recusa dose com
   * cardio desligado (questionario_cardio_dose_coerente), e sem limpar aqui o
   * aluno que marca "sim", preenche e volta para "não" veria o questionário
   * inteiro falhar no salvamento por um dado que ele já tinha descartado.
   */
  const definirIncluiCardio = (valor: boolean) => {
    setIncludeCardio(valor);
    if (!valor) {
      setCardioDias(null);
      setCardioMinutos(null);
      setCardioModalidades([]);
      setCardioPraticaAtualmente(null);
      setCardioDistanciaConfortavelKm(null);
      setCardioObjetivo(null);
    }
  };

  const alternarModalidade = (nome: string) => {
    setCardioModalidades((atual) =>
      atual.includes(nome) ? atual.filter((m) => m !== nome) : [...atual, nome],
    );
  };
  const getSelectedDays = () => Object.keys(trainingDays).filter(day => trainingDays[day]);
  const distanciaCardioValida =
    cardioDistanciaConfortavelKm !== null &&
    cardioDistanciaConfortavelKm >= 0 &&
    cardioDistanciaConfortavelKm <= 50;
  const erroDistanciaCardio =
    cardioPraticaAtualmente === true &&
    cardioDistanciaConfortavelKm !== null &&
    !distanciaCardioValida
      ? 'Informe uma distância entre 0 e 50 km.'
      : null;
  // Um bloco só conta como respondido quando passa na MESMA validação que
  // habilita o envio — os gates dos passos usam exatamente estas regras (a
  // data 99/99/2000 "tinha formato" mas nunca seria aceita).
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
      // parseFloat("0,5") === 0 (trunca no separador ",", já que parseFloat só
      // entende "."), então um peso sub-1kg digitado com vírgula travava
      // "Continuar" mesmo passando na regex acima. numericTextToNumber (usado
      // no submit, linha ~444) normaliza "," -> "." antes de converter — usar
      // a mesma função aqui elimina a divergência entre os dois caminhos
      // (WR-05).
      !!peso && /^\d+([.,]\d+)?$/.test(peso) && (numericTextToNumber(peso) ?? 0) > 0 &&
        !!altura && /^\d+$/.test(altura) && parseInt(altura, 10) > 0,
      !!experienciaTreino,
      !!objetivo,
      getSelectedDays().length > 0,
      averageTrainingTime !== null,
      // Cardio: com "sim", a DOSE faz parte da resposta — é o que transforma a
      // preferência em contrato validado no molde. Modalidade segue opcional
      // (vazio = qualquer uma). A anamnese (já pratica hoje? / objetivo)
      // também é obrigatória — são os sinais que o backend usa para derivar o
      // nível. Distância só é exigida de quem já pratica hoje (mesma regra da
      // migration 0033: distância sem prática é incoerente).
      includeCardio !== null &&
        (includeCardio === false ||
          (cardioDias !== null &&
            cardioMinutos !== null &&
            cardioPraticaAtualmente !== null &&
            isCardioObjetivoValido(cardioObjetivo) &&
            (cardioPraticaAtualmente !== true || distanciaCardioValida))),
      includeStretching !== null,
      temLesoes !== null &&
        (!temLesoes || lesoes.trim() !== '' || descricaoLesao.trim() !== ''),
    ];
  };

  const isFormValid = () => blocosRespondidos().every(Boolean);

  // --- Stepper: retomada, avanço e animação -------------------------------
  // Com rascunho salvo, abre no primeiro passo ainda sem resposta válida.
  useEffect(() => {
    if (isLoadingStorage || !dataLoadedFromStorage || resumedRef.current) return;
    resumedRef.current = true;
    const blocos = blocosRespondidos();
    const primeiroPendente = blocos.findIndex((b) => !b);
    setStep(primeiroPendente === -1 ? TOTAL_STEPS - 1 : primeiroPendente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingStorage, dataLoadedFromStorage]);

  // Cada troca de passo entra com o rise da direção (fade + 10px, impulso).
  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: theme.animation.durations.medium,
      easing: easeImpulso,
      useNativeDriver: true,
    }).start();
  }, [step, stepAnim]);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const irPara = (destino: number) => {
    // Navegação manual cancela um avanço automático pendente — sem isso, tocar
    // numa opção e voltar dentro da janela de 280ms pulava uma pergunta.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    Keyboard.dismiss();
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, destino)));
  };

  // Escolha única marca e avança sozinha — o toque já é a resposta.
  const selecionarEAvancar = (aplicar: () => void) => {
    aplicar();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }, AUTO_ADVANCE_MS);
  };

  // --- handleSubmit ---
  // pularChat=true vem do botão "Gerar treino direto": a persistência é a
  // mesma, só muda o destino — a tela de chat recebe skipChat para disparar
  // a geração sem mostrar a escolha inicial.
  const handleSubmit = async (pularChat: boolean = false) => {
    if (typeof updateProfile !== 'function') { console.error("[QuestionnaireScreen] A função updateProfile não está disponível no AuthContext!"); showAlert('Erro Interno', 'Funcionalidade indisponível. Tente novamente mais tarde.'); return; }
    if (!userId || !authToken) { showAlert('Erro', 'Usuário não autenticado. Faça login novamente.'); return; }
    if (!userStorageKey) { showAlert('Erro Interno', 'Não foi possível determinar o armazenamento local.'); return; }

    if (!isFormValid()) {
    setError('Por favor, preencha todos os campos obrigatórios corretamente.');
    showAlert('Campos Incompletos', 'Verifique se todos os campos obrigatórios foram preenchidos corretamente, incluindo data de nascimento, peso e altura válidos.');
    return;
    }

    // O véu bloqueia toques, mas um campo focado continuaria recebendo o
    // teclado: derruba o foco para congelar o formulário por inteiro.
    Keyboard.dismiss();
    setError(null); setIsLoading(true); // Ativa o loading geral para a submissão

    // Prepara os dados para API e Storage
    const formattedDate = `${anoNascimento}-${mesNascimento.padStart(2, '0')}-${diaNascimento.padStart(2, '0')}`;
    // "75,5" tem de chegar como 75.5, não 75 (parseFloat direto trunca na
    // vírgula) — mesma normalização que NumericField já usa nos outros campos
    // decimais do questionário (cardioDistanciaConfortavelKm).
    const pesoNum = numericTextToNumber(peso);
    const alturaNum = parseInt(altura, 10) || null;
    const lesoesDetalhes = temLesoes ? `${lesoes}${descricaoLesao ? ` (${descricaoLesao})` : ''}`.trim() || null : null;
    const formDataForApi = { usuario_id: userId, data_nascimento: formattedDate, genero: genero, peso_kg: pesoNum, altura_cm: alturaNum, experiencia_treino: experienciaTreino, objetivo: objetivo, tem_lesoes: temLesoes, lesoes_detalhes: lesoesDetalhes, dias_treino: getSelectedDays(), inclui_cardio: includeCardio, inclui_alongamento: includeStretching, tempo_medio_treino_min: averageTrainingTime,
      // Defesa em profundidade: mesmo que um estado sobreviva a desmarcar o
      // cardio, a dose NÃO viaja sem cardio — o banco recusaria o INSERT inteiro
      // (questionario_cardio_dose_coerente) e o questionário não salvaria.
      cardio_dias_semana: includeCardio === true ? cardioDias : null,
      cardio_minutos_sessao: includeCardio === true ? cardioMinutos : null,
      cardio_modalidades:
        includeCardio === true && cardioModalidades.length > 0 ? cardioModalidades : null,
      cardio_pratica_atualmente: includeCardio === true ? cardioPraticaAtualmente : null,
      cardio_distancia_confortavel_km:
        includeCardio === true && cardioPraticaAtualmente === true
          ? cardioDistanciaConfortavelKm
          : null,
      cardio_objetivo:
        includeCardio === true && isCardioObjetivoValido(cardioObjetivo)
          ? cardioObjetivo
          : null };
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
        setError('Sua sessão expirou. Por favor, faça login novamente.');
      } else {
        setError(`Erro ao salvar: ${errorMessage}`);
        showAlert('Erro ao Salvar', `Não foi possível salvar seus dados. Detalhes: ${errorMessage}`);
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
  ) => (
    <View style={styles.stack}>
      {options.map((option) => (
        <OptionButton
          key={option.value.toString()}
          label={option.label}
          selected={selectedValue === option.value}
          onPress={() => selecionarEAvancar(() => onSelect(option.value))}
        />
      ))}
    </View>
  );

  const renderYesNo = (
    value: boolean | null,
    onSelect: (value: boolean) => void,
  ) => (
    <View style={styles.pair}>
      <OptionButton label="Sim" centered selected={value === true} onPress={() => selecionarEAvancar(() => onSelect(true))} style={styles.pairItem} />
      <OptionButton label="Não" centered selected={value === false} onPress={() => selecionarEAvancar(() => onSelect(false))} style={styles.pairItem} />
    </View>
  );

  const botaoContinuar = (habilitado: boolean) => (
    <Button
      label="Continuar"
      icon="arrow-right"
      onPress={() => irPara(step + 1)}
      disabled={!habilitado}
      style={styles.continuar}
    />
  );

  // Os passos seguem a MESMA ordem dos blocos de blocosRespondidos().
  const blocos = blocosRespondidos();

  type StepDef = { titulo: string; dica?: string; corpo: React.ReactNode };
  const steps: StepDef[] = [
    {
      titulo: 'Como podemos te chamar?',
      dica: 'Seu plano fala com você pelo nome.',
      corpo: (
        <>
          <TextField
            label="Nome completo"
            value={nome}
            onChangeText={setNome}
            autoCapitalize="words"
          />
          {botaoContinuar(blocos[0])}
        </>
      ),
    },
    {
      titulo: 'Quando você nasceu?',
      dica: 'A idade calibra volume e recuperação.',
      corpo: (
        <>
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
          {botaoContinuar(blocos[1])}
        </>
      ),
    },
    {
      titulo: 'Como você se identifica?',
      corpo: renderOptions(GENDER_OPTIONS, genero, (v) => setGenero(v as string)),
    },
    {
      titulo: 'Seu corpo hoje.',
      dica: 'Base para as cargas iniciais — dá para atualizar depois.',
      corpo: (
        <>
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
                keyboardType="decimal-pad"
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
          {botaoContinuar(blocos[3])}
        </>
      ),
    },
    {
      titulo: 'Há quanto tempo você treina?',
      dica: 'Sem resposta certa — o plano parte de onde você está.',
      corpo: renderOptions(EXPERIENCE_LEVELS, experienciaTreino, (v) => setExperienciaTreino(v as string)),
    },
    {
      titulo: 'Qual é o seu objetivo principal?',
      dica: 'Isso define a estrutura de todo o plano.',
      corpo: renderOptions(GOALS, objetivo, (v) => setObjetivo(v as string)),
    },
    {
      titulo: 'Quais dias você pode treinar?',
      dica: 'O plano respeita a sua semana real — dá para mudar depois.',
      corpo: (
        <>
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
          {botaoContinuar(blocos[6])}
        </>
      ),
    },
    {
      titulo: 'Quanto tempo por treino?',
      dica: 'Num dia mais curto, o app adapta a sessão na hora.',
      corpo: renderOptions(TIME_OPTIONS, averageTrainingTime, (v) => setAverageTrainingTime(v as number)),
    },
    {
      titulo: 'Incluir cardio no plano?',
      dica: 'Com "sim", você define a dose — e o plano é reprovado se não seguir.',
      corpo: (
        <>
          <View style={styles.pair}>
            {/* "Sim" NÃO auto-avança: a dose aparece logo abaixo e o avanço
                automático levaria o aluno embora antes de ele responder. */}
            <OptionButton
              label="Sim"
              centered
              selected={includeCardio === true}
              onPress={() => definirIncluiCardio(true)}
              style={styles.pairItem}
            />
            <OptionButton
              label="Não"
              centered
              selected={includeCardio === false}
              onPress={() => selecionarEAvancar(() => definirIncluiCardio(false))}
              style={styles.pairItem}
            />
          </View>

          {includeCardio === true && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Quantos dias por semana?</Text>
                <View style={styles.doseLinha}>
                  {Array.from(
                    // Nunca oferece mais dias de cardio do que dias de treino:
                    // uma dose impossível de cumprir seria cobrada do molde e
                    // travaria a geração nas duas tentativas.
                    { length: Math.max(1, Math.min(getSelectedDays().length || 3, 7)) },
                    (_, i) => i + 1,
                  ).map((dias) => (
                    <OptionButton
                      key={dias}
                      // Label descritivo em vez de só o número: o OptionButton
                      // deriva o accessibilityLabel do label, e "3" sozinho não
                      // diz nada num leitor de tela.
                      label={dias === 1 ? '1 dia' : `${dias} dias`}
                      centered
                      selected={cardioDias === dias}
                      onPress={() => setCardioDias(dias)}
                      style={styles.doseChip}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Quantos minutos por vez?</Text>
                <View style={styles.doseLinha}>
                  {[10, 15, 20, 30, 45, 60].map((min) => (
                    <OptionButton
                      key={min}
                      label={`${min} min`}
                      centered
                      selected={cardioMinutos === min}
                      onPress={() => setCardioMinutos(min)}
                      style={styles.doseChip}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Prefere alguma modalidade? (opcional)</Text>
                  <View style={styles.doseLinha}>
                    {CARDIO_MODALIDADES.map((nome) => (
                      <OptionButton
                        key={nome}
                        label={nome}
                        selected={cardioModalidades.includes(nome)}
                        onPress={() => alternarModalidade(nome)}
                        style={styles.doseChipLargo}
                      />
                    ))}
                  </View>
                  <Text style={styles.doseNota}>
                    Sem escolher nenhuma, o plano pode usar qualquer uma.
                  </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Já pratica corrida, caminhada rápida, pedal ou outro cardio hoje?
                </Text>
                <View style={styles.pair}>
                  <OptionButton
                    label="Sim, já pratico"
                    centered
                    selected={cardioPraticaAtualmente === true}
                    onPress={() => setCardioPraticaAtualmente(true)}
                    style={styles.pairItem}
                  />
                  <OptionButton
                    label="Não, ainda não"
                    centered
                    selected={cardioPraticaAtualmente === false}
                    onPress={() => setCardioPraticaAtualmente(false)}
                    style={styles.pairItem}
                  />
                </View>
              </View>

              {cardioPraticaAtualmente === true && (
                <View style={styles.field}>
                  <NumericField
                    label="Distância confortável hoje (km)"
                    value={cardioDistanciaConfortavelKm}
                    onChangeNumber={setCardioDistanciaConfortavelKm}
                    error={erroDistanciaCardio}
                    placeholder="Ex: 3,5"
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Qual seu objetivo com o cardio?</Text>
                <View style={styles.stack}>
                  {CARDIO_OBJETIVOS.map((option) => (
                    <OptionButton
                      key={option.value}
                      label={option.label}
                      selected={cardioObjetivo === option.value}
                      onPress={() => setCardioObjetivo(option.value)}
                    />
                  ))}
                </View>
              </View>

              {botaoContinuar(blocos[8])}
            </>
          )}
        </>
      ),
    },
    {
      titulo: 'Incluir alongamentos no plano?',
      corpo: renderYesNo(includeStretching, setIncludeStretching),
    },
    {
      titulo: 'Alguma lesão ou restrição?',
      dica: 'O plano evita o que machuca — seja específico.',
      corpo: (
        <>
          <View style={styles.pair}>
            <OptionButton label="Sim" centered selected={temLesoes === true} onPress={() => setTemLesoes(true)} style={styles.pairItem} />
            <OptionButton label="Não" centered selected={temLesoes === false} onPress={() => setTemLesoes(false)} style={styles.pairItem} />
          </View>
          {temLesoes === true && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Quais lesões ou restrições?</Text>
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

          {error ? <Notice tone="danger" title={error} style={styles.notice} /> : null}

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
            variant="tonal"
            icon="zap"
            onPress={() => handleSubmit(true)}
            loading={isLoading}
            disabled={!isFormValid()}
            style={styles.submitDirect}
          />
        </>
      ),
    },
  ];

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

  const atual = steps[step];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Barra do stepper: voltar · contagem · módulos do F */}
        <View style={styles.stepBar}>
          <Pressable
            onPress={() => irPara(step - 1)}
            disabled={step === 0}
            accessibilityRole="button"
            accessibilityLabel="Voltar uma pergunta"
            accessibilityState={{ disabled: step === 0 }}
            hitSlop={10}
            style={[styles.backBtn, step === 0 && styles.backBtnHidden]}
          >
            <Feather name="chevron-left" size={20} color={theme.colors.text.secondary} />
          </Pressable>
          <Text style={styles.stepCount}>
            Pergunta {step + 1} de {TOTAL_STEPS}
          </Text>
          <FModules
            lit={Math.ceil(((step + 1) / TOTAL_STEPS) * 3)}
            accessibilityLabel={`Progresso: pergunta ${step + 1} de ${TOTAL_STEPS}`}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: stepAnim,
              transform: [
                {
                  translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
                },
              ],
            }}
          >
            <Text style={styles.title} accessibilityRole="header">{atual.titulo}</Text>
            {atual.dica ? <Text style={styles.subtitle}>{atual.dica}</Text> : null}
            <View style={styles.body}>{atual.corpo}</View>
          </Animated.View>
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
  waitingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },

  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
  },
  backBtnHidden: { opacity: 0 },
  stepCount: {
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.micro,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.huge,
  },
  title: {
    marginTop: theme.spacing.lg,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.display,
    fontWeight: theme.typography.fontWeights.semiBold,
    letterSpacing: theme.typography.letterSpacing.display,
    lineHeight: theme.typography.fontSizes.display * theme.typography.lineHeights.tight,
  },
  subtitle: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  body: { marginTop: theme.spacing.xxl },

  stack: { gap: theme.spacing.sm },
  pair: { flexDirection: 'row', gap: theme.spacing.md },
  pairItem: { flex: 1 },
  field: { marginTop: theme.spacing.lg },
  // Dose de cardio: chips que quebram linha (wrap) — a lista de modalidades tem
  // 9 itens e uma linha só empurraria metade fora da tela.
  doseLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  doseChip: { minWidth: 84, flexGrow: 0 },
  doseChipLargo: { flexGrow: 0 },
  doseNota: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
  },
  label: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.quiet,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    letterSpacing: theme.typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  dateRow: { flexDirection: 'row', gap: theme.spacing.md },
  // minWidth 0 obrigatório: são TextInput disputando espaço numa row, e o
  // react-native-web não reseta `min-width` em input (só em View). Sem isto o
  // campo trava na largura intrínseca (~20 caracteres) e o AAAA sai da tela
  // no iPhone 13 — mesmo modo de falha do campo de carga (ver
  // components/session/sessionPlayerLayout e __tests__/loadInputLayoutWeb).
  dateCell: { flex: 1, minWidth: 0 },
  yearCell: { flex: 1.6, minWidth: 0 },
  miniInput: {
    minHeight: theme.hitTarget.regular,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
  },
  textArea: { minHeight: 84, textAlignVertical: 'top', paddingTop: theme.spacing.md },
  days: { flexDirection: 'row', gap: theme.spacing.xs },

  continuar: { marginTop: theme.spacing.xxl },
  notice: { marginTop: theme.spacing.lg },
  submit: { marginTop: theme.spacing.xxl },
  submitDirect: { marginTop: theme.spacing.sm },

  savingVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.88)', // preto da marca com véu
    zIndex: theme.zIndex.modal,
  },
});

export default QuestionnaireScreen;
