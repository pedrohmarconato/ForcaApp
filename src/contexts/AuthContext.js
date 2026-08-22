// /home/pmarconato/ForcaApp/src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react'; // Adicionado useMemo
import { supabase, storageReady } from '../config/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
// WR-01 (13-REVIEW.md, iteração 2): unsubscribeFromPush existia mas nunca era
// chamado a partir de signOut() — num browser/device compartilhado a
// subscription (escopo origem+SW, não conta) sobrevivia ao logout e podia ser
// reassinada silenciosamente pela próxima conta a ativar notificações no
// mesmo device. isPushSupported/unsubscribeFromPush são web-only (usam
// navigator.serviceWorker) — módulo leve, sem custo de import no nativo.
import { isPushSupported, unsubscribeFromPush } from '../services/pushSubscription';

const AuthContext = createContext(undefined);

// --- Classificação de erros de autenticação (PostgREST/GoTrue) ---

// isClockSkewError vive em services/auth/authErrors (módulo leve, sem
// dependências) para o sessionProbe e os testes unitários usarem a MESMA
// política de skew. Re-exportada aqui para manter o ponto de import histórico.
import { isClockSkewError } from '../services/auth/authErrors';
export { isClockSkewError };

// Sinais de token realmente inválido/expirado — aqui sim o logout é a
// resposta certa. Skew fica explicitamente de fora.
export const isTokenInvalidError = (error) =>
    !isClockSkewError(error) && (
        error?.status === 401 ||
        error?.code === 'PGRST301' ||
        (typeof error?.message === 'string' && error.message.includes('JWT'))
    );

// Espera do retry quando a sonda cai em desvio de relógio.
export const CLOCK_SKEW_RETRY_MS = 2000;

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loadingSession, setLoadingSession] = useState(true);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [errorProfile, setErrorProfile] = useState(null);
    const [initialAuthDone, setInitialAuthDone] = useState(false);
    // profileResolved: false enquanto a primeira resolução de perfil do
    // usuário ATUAL (fetchProfile inicial + a retentativa de PGRST116, se
    // houver — ver fetchProfile) ainda não terminou. O RootNavigator só
    // pode tratar profile===null como "sem perfil -> onboarding" quando
    // este flag está true; do contrário mostra o loading que já existe.
    // Bug que isso fecha: PGRST116 por RLS negando a linha no cold boot com
    // token vencido (verifyTokenValidity não detecta porque sua sonda não
    // filtra por usuário) fazia o app piscar o questionário antes do
    // TOKEN_REFRESHED corrigir o estado segundos depois. Troca de usuário
    // reseta para false (useEffect #1, abaixo).
    const [profileResolved, setProfileResolved] = useState(false);

    // Refs para acessar estado atual dentro do listener sem causar re-run do useEffect
    const userRef = useRef(user);
    const initialAuthDoneRef = useRef(initialAuthDone);
    const sessionRef = useRef(session);
    // profileRef: usado só pela guarda de onboarding em fetchProfile
    // (preserveOnboardingView). Não pode virar dependência do useCallback de
    // fetchProfile — isso o recriaria a cada mudança de perfil e reassinaria
    // o listener onAuthStateChange (useEffect #1 depende de fetchProfile).
    const profileRef = useRef(profile);

    // Atualiza as refs sempre que o estado mudar
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        initialAuthDoneRef.current = initialAuthDone;
    }, [initialAuthDone]);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    useEffect(() => {
        profileRef.current = profile;
    }, [profile]);

    // --- Função handleSessionExpiration ---
    const handleSessionExpiration = useCallback(async () => {
        console.log("[AuthContext] Detectado token expirado. Realizando logout automático.");
        try {
            // Limpar storage primeiro
            await AsyncStorage.removeItem('@userShouldStayLoggedIn');

            // Limpar estados
            setSession(null);
            setUser(null);
            setProfile(null);
            setErrorProfile("Sessão expirada. Por favor, faça login novamente.");

            // Chamada de signOut para o Supabase (mesmo que o token já tenha expirado)
            await supabase.auth.signOut();

            console.log("[AuthContext] Logout por sessão expirada concluído.");
        } catch (error) {
            console.error("[AuthContext] Erro ao limpar sessão expirada:", error);
        } finally {
            // Sempre garantir que o estado de loading é atualizado
            setLoadingSession(false);
            setLoadingProfile(false);

            // Marcar inicialização como concluída
            if (!initialAuthDoneRef.current) {
                setInitialAuthDone(true);
            }
        }
    }, []); // Dependências vazias, pois não usa estado/props externos diretamente

    // --- Função para verificar a validade do token ---
    const verifyTokenValidity = useCallback(async (tokenSession) => {
        if (!tokenSession) return false;

        try {
            console.log("[AuthContext] Verificando validade do token...");

            // Fazer uma requisição simples que requer autenticação
            const probe = () => supabase.from('profiles').select('id').limit(1);
            let { error } = await probe();

            if (error && isClockSkewError(error)) {
                // PGRST303 logo após refresh: espera o relógio do servidor
                // alcançar o iat do token e tenta UMA vez de novo.
                console.log("[AuthContext] Desvio de relógio (JWT issued at future). Retentando...");
                await new Promise((resolve) => setTimeout(resolve, CLOCK_SKEW_RETRY_MS));
                ({ error } = await probe());
            }

            if (error) {
                if (isClockSkewError(error)) {
                    // Skew persistente: o token é criptograficamente válido;
                    // só os relógios divergem. Mantém a sessão.
                    console.warn("[AuthContext] Desvio de relógio persistente; mantendo a sessão.");
                    return true;
                }
                if (isTokenInvalidError(error)) {
                    console.error("[AuthContext] Erro ao verificar token:", error);
                    console.log("[AuthContext] Token inválido/expirado detectado.");
                    return false;
                }
                // Erro que não é de autenticação (RLS, indisponibilidade etc.):
                // não é evidência de sessão inválida.
                console.warn("[AuthContext] Erro não-auth na verificação de token (mantendo sessão):", error?.code ?? error?.message);
            }

            return true;
        } catch (error) {
            // Exceção de transporte (rede fora, timeout) ≠ sessão expirada.
            // Deslogar o usuário offline seria punição por falta de rede.
            console.warn("[AuthContext] Não foi possível verificar o token (rede?). Mantendo sessão:", error?.message ?? error);
            return true;
        }
    }, []); // Dependências vazias

    // --- Função signOut ---
    const signOut = useCallback(async () => {
        console.log("[AuthContext] Tentando signOut.");
        try {
            await AsyncStorage.removeItem('@userShouldStayLoggedIn');
        } catch (e) {
            console.error("[AuthContext] Erro ao remover preferência no logout:", e);
        }

        // WR-01: desativa a push subscription do device best-effort, ANTES
        // de limpar a sessão local — nunca aguardado de forma bloqueante
        // (fire-and-forget, mesmo espírito do aviso de replanejamento em
        // activeSessionStore.ts) e nunca capaz de impedir/atrasar o logout
        // em si (try/catch próprio, sem propagar).
        if (isPushSupported()) {
            unsubscribeFromPush().catch((e) => {
                console.warn("[AuthContext] Falha ao desativar push no logout (não-fatal):", e?.message ?? e);
            });
        }

        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("[AuthContext] Erro no signOut do Supabase:", error.message);
            }
        } catch (e) {
            console.error("[AuthContext] Exceção no signOut do Supabase:", e);
        }

        // Independente de erros, limpar os estados
        setSession(null);
        setUser(null);
        setProfile(null);
        setErrorProfile(null);
    }, []); // Dependências vazias

    // --- Função fetchProfile ---
    // preserveOnboardingView: só `true` no refetch same-user disparado por
    // TOKEN_REFRESHED/USER_UPDATED (useEffect #1, abaixo). Cold start, troca
    // de usuário e chamadas explícitas (refreshProfile, fallback de
    // updateProfile) continuam lendo o banco como está.
    // isRetryAttempt: uso interno — só a própria fetchProfile se chama de
    // novo com `true`, na retentativa de PGRST116 (ver branch abaixo).
    // Nenhum chamador externo deve passar este argumento.
    const fetchProfile = useCallback(async (userId, isInitialFetch = false, preserveOnboardingView = false, isRetryAttempt = false) => {
        if (!userId) {
            console.log("[AuthContext] fetchProfile chamado sem userId.");
            setProfile(null);
            setProfileResolved(true);
            if (isInitialFetch) setLoadingSession(false);
            setLoadingProfile(false);
            return null;
        }

        console.log(`[AuthContext] Buscando perfil para ID: ${userId}. É inicial? ${isInitialFetch}`);
        setLoadingProfile(true);
        if (isInitialFetch) setLoadingSession(true); // Só ativa loading geral se for inicial
        setErrorProfile(null);

        try {
            // Verificar se o token ainda é válido antes de prosseguir.
            // Só quando a ref TEM sessão: no primeiro evento do listener a
            // sessionRef ainda não foi atualizada (só no próximo render) e
            // validar `null` aqui deslogava um usuário com sessão válida.
            // Sem a ref, a própria query de perfil abaixo decide (trata 401).
            if (sessionRef.current) {
                const tokenValido = await verifyTokenValidity(sessionRef.current);
                if (!tokenValido) {
                    console.log("[AuthContext] Token inválido detectado em fetchProfile");
                    await handleSessionExpiration();
                    return null;
                }
            }

            const { data, error, status } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                // Se não for erro de registro não encontrado (PGRST116)
                if (error.code !== 'PGRST116') {
                    console.error("[AuthContext] Erro ao buscar perfil (Supabase):", { status, error });

                    // Verificar explicitamente por indicações de token expirado/inválido
                    // (desvio de relógio transitório fica de fora — não desloga)
                    if (isTokenInvalidError(error)) {
                        console.log("[AuthContext] Token expirado detectado ao buscar perfil");
                        await handleSessionExpiration();
                        return null;
                    }

                    throw error; // Re-lança outros erros
                } else {
                    console.log("[AuthContext] Perfil não encontrado (PGRST116), retornando null.");

                    // PGRST116 aqui pode ser a RLS negando a linha por token
                    // vencido no cold boot — verifyTokenValidity (acima) usa
                    // uma sonda sem .eq('id', userId) e não detecta isso
                    // (achado da auditoria de 19/08). O trigger
                    // on_auth_user_created garante que todo usuário
                    // autenticado TEM uma linha em profiles: PGRST116 aqui
                    // nunca é "conta nova" de verdade. Antes de aceitar a
                    // ausência (que o RootNavigator trata como onboarding),
                    // tenta renovar a sessão UMA vez e refazer o fetch.
                    // isRetryAttempt evita loop — a chamada recursiva já
                    // entra com isRetryAttempt=true e não tenta de novo.
                    if (!isRetryAttempt) {
                        try {
                            const { error: refreshError } = await supabase.auth.refreshSession();
                            if (refreshError) {
                                throw refreshError;
                            }
                            console.log("[AuthContext] Sessão renovada após PGRST116 — refazendo fetch do perfil.");
                            // refreshSession() bem-sucedido emite TOKEN_REFRESHED,
                            // que também dispara o refetch same-user do
                            // listener (useEffect #1, evento TOKEN_REFRESHED
                            // abaixo). É seguro tolerar essa duplicata: as
                            // duas chamadas leem o MESMO estado atual do
                            // banco para o MESMO usuário e convergem para o
                            // mesmo resultado (idempotente) — a pior
                            // consequência é uma leitura a mais, nunca um
                            // estado inconsistente.
                            return await fetchProfile(userId, isInitialFetch, preserveOnboardingView, true);
                        } catch (refreshException) {
                            // Falha do PRÓPRIO refreshSession (rede ou
                            // refresh token inválido) — erro genérico, não
                            // "sem perfil" (não pode virar onboarding).
                            console.warn("[AuthContext] Falha ao renovar sessão após PGRST116:", refreshException?.message ?? refreshException);
                            setErrorProfile("Não foi possível carregar os dados do perfil.");
                            return null;
                        }
                    }

                    console.log("[AuthContext] Perfil não encontrado (PGRST116) após retentativa, aceitando ausência.");
                    setProfile(null); // Garante que o perfil está nulo (fallback assentado)
                    return null;
                }
            }

            console.log("[AuthContext] Perfil encontrado:", data ? data.id : 'null');

            // Invariante: flip de onboarding em runtime só via updateProfile
            // (fim do chat) ou cold start — refetch de token não pode
            // arrancar o usuário do onboarding. O questionário grava
            // onboarding_completed=true direto no banco (onboardingRepository)
            // sem tocar neste estado local; se um TOKEN_REFRESHED/USER_UPDATED
            // no meio do chat relesse o banco puro aqui, o RootNavigator
            // (gate em profile.onboarding_completed) trocaria de árvore.
            const previousProfile = profileRef.current;
            const devePreservarVisaoDeOnboarding =
                preserveOnboardingView &&
                previousProfile?.onboarding_completed === false &&
                data?.onboarding_completed === true;
            const proximoPerfil = devePreservarVisaoDeOnboarding
                ? { ...data, onboarding_completed: false }
                : data;

            if (devePreservarVisaoDeOnboarding) {
                console.log("[AuthContext] Preservando onboarding_completed=false local durante refetch de sessão (evento de token).");
            }

            setProfile(proximoPerfil);
            return proximoPerfil;

        } catch (error) {
            console.error("[AuthContext] Erro na execução de fetchProfile:", error);
            setProfile(null);

            if (isTokenInvalidError(error)) {
                console.log("[AuthContext] Erro 401/JWT detectado ao buscar perfil, tratando como token expirado");
                setErrorProfile("Sessão expirada. Faça login novamente.");
                await handleSessionExpiration();
            } else if (error.code !== 'PGRST116') { // Não mostra erro se for apenas 'perfil não encontrado'
                setErrorProfile("Não foi possível carregar os dados do perfil.");
            }
            return null;
        } finally {
            setLoadingProfile(false);
            // Só desativa o loading geral se for a busca inicial
            if (isInitialFetch) setLoadingSession(false);
            // A resolução (incluindo a retentativa de PGRST116 acima, se
            // houve) terminou para este usuário — só a partir daqui
            // profile===null pode ser lido como "sem perfil" pelo
            // RootNavigator. Roda tanto na chamada de retentativa quanto na
            // original (que a aguarda antes de chegar aqui), então não
            // marca resolvido cedo demais.
            setProfileResolved(true);
            console.log("[AuthContext] fetchProfile finalizado para:", userId);
        }
    }, [handleSessionExpiration, verifyTokenValidity]); // Depende das funções memoizadas

    // --- Função updateProfile ---
    const updateProfile = useCallback(async (updates) => {
        // Usa userRef para pegar o ID mais recente sem adicionar user como dependência
        const currentUserId = userRef.current?.id;
        if (!currentUserId) throw new Error("Usuário não autenticado.");
        if (!updates || Object.keys(updates).length === 0) return profile; // Retorna perfil atual se não houver updates

        console.log("[AuthContext] Tentando atualizar perfil para:", currentUserId, "com dados:", updates);
        setLoadingProfile(true);
        setErrorProfile(null);

        try {
            // Verificar validade do token antes de prosseguir (mesma guarda do
            // fetchProfile: ref defasada/null não é evidência de expiração)
            if (sessionRef.current) {
                const tokenValido = await verifyTokenValidity(sessionRef.current);
                if (!tokenValido) {
                    console.log("[AuthContext] Token inválido detectado em updateProfile");
                    await handleSessionExpiration();
                    throw new Error("Sessão expirada. Faça login novamente.");
                }
            }

            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', currentUserId)
                .select()
                .single();

            if (error) {
                // Verificar se é erro de autenticação (skew transitório não conta)
                if (isTokenInvalidError(error)) {
                    console.log("[AuthContext] Token expirado detectado ao atualizar perfil");
                    await handleSessionExpiration();
                    throw new Error("Sessão expirada. Faça login novamente.");
                }
                throw error; // Re-lança outros erros
            }

            if (data) {
                console.log("[AuthContext] Perfil atualizado com sucesso no backend:", data.id);
                setProfile(data); // Atualiza o estado local
                console.log("[AuthContext] Estado local do perfil atualizado.");
                return data;
            } else {
                console.warn("[AuthContext] Atualização de perfil não retornou dados. Tentando buscar novamente.");
                // Se não retornou dados, busca o perfil atualizado como fallback
                const refreshedProfile = await fetchProfile(currentUserId, false);
                return refreshedProfile;
            }
        } catch (error) {
            console.error("[AuthContext] Erro na execução de updateProfile:", error);

            if (error.message?.includes("Sessão expirada")) {
                setErrorProfile("Sessão expirada. Faça login novamente.");
            } else {
                setErrorProfile("Não foi possível salvar as alterações no perfil.");
            }
            throw error; // Re-lança o erro para o chamador lidar
        } finally {
            setLoadingProfile(false);
            console.log("[AuthContext] updateProfile finalizado para:", currentUserId);
        }
    }, [fetchProfile, profile, handleSessionExpiration, verifyTokenValidity]); // Depende de fetchProfile, profile (para retorno), e validações

    // --- useEffect #1: Listener de Autenticação ---
    useEffect(() => {
        console.log("[AuthContext] Configurando listener onAuthStateChange (UMA VEZ).");
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (_event, currentSession) => {
                // Acessa os valores mais recentes através das refs
                const isInitial = !initialAuthDoneRef.current;
                const previousUserId = userRef.current?.id;

                console.log(`[AuthContext] Evento Auth State Changed: ${_event}. Usuário: ${currentSession?.user?.id ?? 'Nenhum'}. É inicial? ${isInitial}`);

                const currentUser = currentSession?.user ?? null;
                const currentUserId = currentUser?.id;

                // Atualiza os estados de sessão e usuário ANTES de qualquer lógica assíncrona
                setSession(currentSession);
                setUser(currentUser);

                // Lógica principal movida para cá, usando refs quando necessário
                if (currentUserId !== previousUserId) {
                    // Nova resolução começando (login, troca de usuário ou
                    // primeiro evento) — a resolução do usuário anterior não
                    // vale para este.
                    setProfileResolved(false);
                    if (currentUser) {
                        console.log(`[AuthContext] Usuário mudou para ${currentUserId} ou evento inicial. Buscando perfil.`);
                        // Verificar se o token é válido antes de buscar o perfil
                        const tokenValido = await verifyTokenValidity(currentSession);
                        if (!tokenValido) {
                            console.log("[AuthContext] Token inválido detectado ao autenticar via listener");
                            await handleSessionExpiration(); // Limpa tudo
                        } else {
                            // Passa o valor atual de isInitial (lido da ref) para fetchProfile
                            await fetchProfile(currentUserId, isInitial);
                        }
                    } else {
                        console.log("[AuthContext] Usuário deslogado. Limpando perfil.");
                        setProfile(null);
                        setErrorProfile(null);
                        setLoadingProfile(false);
                        // Se for o evento inicial e não há usuário, termina o loading da sessão
                        if (isInitial) setLoadingSession(false);
                    }
                } else if (currentUser && ['TOKEN_REFRESHED', 'USER_UPDATED'].includes(_event)) {
                    console.log(`[AuthContext] Evento '${_event}' para usuário ${currentUserId}. Revalidando/buscando perfil.`);
                    // Revalida o token antes de buscar, por segurança
                    const tokenValido = await verifyTokenValidity(currentSession);
                    if (tokenValido) {
                        // Não é inicial; preserva a visão de onboarding em
                        // progresso (ver comentário/invariante em fetchProfile).
                        await fetchProfile(currentUserId, false, true);
                    } else {
                        console.log(`[AuthContext] Token inválido detectado no evento ${_event}`);
                        await handleSessionExpiration();
                    }
                }

                // Marca que a autenticação inicial foi processada pelo listener
                // Apenas se ainda não foi marcada
                if (isInitial) {
                    console.log("[AuthContext] Marcando initialAuthDone como true via listener.");
                    setInitialAuthDone(true);
                }
            }
        );

        // Cleanup listener na desmontagem
        return () => {
            console.log("[AuthContext] Limpando listener onAuthStateChange.");
            authListener?.subscription?.unsubscribe();
        };
        // fetchProfile, handleSessionExpiration, verifyTokenValidity são estáveis devido ao useCallback
    }, [fetchProfile, handleSessionExpiration, verifyTokenValidity]);

    // --- useEffect #2: Verificação Inicial da Sessão ---
    useEffect(() => {
        // Só executa se a autenticação inicial ainda não foi feita
        if (!initialAuthDoneRef.current) {
            console.log("[AuthContext] Verificando sessão inicial (UMA VEZ).");

            const checkInitialSession = async () => {
                try {
                    // Aguarda a migração da sessão legada (AsyncStorage → SecureStore)
                    // antes de ler a sessão — evita logout falso no primeiro boot pós-update
                    await storageReady;

                    const { data: { session: initialSession }, error } = await supabase.auth.getSession();

                    console.log("[AuthContext] Sessão inicial recuperada:", initialSession ? initialSession.user.id : 'Nenhuma');

                    if (error) {
                        console.error("[AuthContext] Erro ao buscar sessão inicial:", error);
                        setLoadingSession(false); // Libera loading
                        setInitialAuthDone(true); // Marca como feito mesmo com erro
                        return;
                    }

                    if (initialSession) {
                        // Verificar explicitamente se o token ainda é válido
                        const tokenValido = await verifyTokenValidity(initialSession);
                        if (!tokenValido) {
                            console.log("[AuthContext] Token expirado detectado na sessão inicial");
                            await handleSessionExpiration(); // Limpa e marca como feito no finally
                            return;
                        }
                        // Se o token for válido, o listener onAuthStateChange será disparado
                        // e cuidará de setar o usuário/perfil e initialAuthDone.
                        // Não precisamos setar initialAuthDone aqui nesse caso.
                    } else {
                        // Se não houver sessão inicial, marcamos como concluído e liberamos loading
                        console.log("[AuthContext] Nenhuma sessão inicial, finalizando loading inicial e marcando auth como feito.");
                        setLoadingSession(false);
                        setLoadingProfile(false);
                        setInitialAuthDone(true);
                    }
                } catch (error) {
                    console.error("[AuthContext] Erro crítico ao buscar sessão inicial:", error);
                    // Garante que o app não fique preso no loading em caso de erro
                    setLoadingSession(false);
                    setLoadingProfile(false);
                    setInitialAuthDone(true);
                }
            };

            checkInitialSession();
        }
        // handleSessionExpiration e verifyTokenValidity são estáveis
    }, [handleSessionExpiration, verifyTokenValidity]);

    // --- Valor fornecido pelo contexto ---
    // *** CORREÇÃO PRINCIPAL: Memoizar o objeto value ***
    const value = useMemo(() => ({
        session,
        user,
        profile,
        profileResolved,
        // Combina os loadings: está carregando se a auth inicial não terminou OU o perfil está carregando
        loading: !initialAuthDone || loadingProfile,
        loadingSession: !initialAuthDone, // Loading específico da sessão/auth inicial
        loadingProfile, // Loading específico do perfil
        errorProfile,
        // Funções de autenticação (já usam useCallback)
        signIn: async (email, password) => {
            console.log("[AuthContext] Tentando signIn para:", email);
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) console.error("[AuthContext] Erro retornado pelo signIn:", error.message);
            // O listener onAuthStateChange cuidará de atualizar user/profile
            return { data, error };
        },
        signUp: async (email, password, options = {}) => {
            console.log("[AuthContext] Tentando signUp para:", email);
            const { data, error } = await supabase.auth.signUp({ email, password, options });
            if (error) console.error("[AuthContext] Erro no signUp:", error.message);
            // O listener onAuthStateChange cuidará de atualizar user/profile se o signup for bem sucedido
            return { data, error };
        },
        resetPassword: async (email) => {
            console.log("[AuthContext] Tentando resetPassword para:", email);
            const { data, error } = await supabase.auth.resetPasswordForEmail(email);
            if (error) console.error("[AuthContext] Erro no resetPassword:", error.message);
            return { data, error };
        },
        signOut, // Já usa useCallback
        // Funções de perfil (já usam useCallback)
        refreshProfile: async () => {
            // Usa userRef para pegar o ID mais recente
            const currentUserId = userRef.current?.id;
            if (currentUserId) {
                console.log("[AuthContext] Chamada explícita para refreshProfile.");
                await fetchProfile(currentUserId, false); // Não é inicial
            } else {
                console.warn("[AuthContext] refreshProfile chamado sem usuário logado.");
            }
        },
        updateProfile, // Já usa useCallback
    }), [
        // Lista de dependências para o useMemo
        session, user, profile, profileResolved, initialAuthDone, loadingProfile, errorProfile,
        signOut, fetchProfile, updateProfile // Inclui as funções que são parte do valor e podem mudar (embora usem useCallback)
        // signIn, signUp, resetPassword, refreshProfile não precisam estar aqui se suas definições (useCallback) não mudam
    ]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// --- Hook useAuth (sem alterações) ---
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};