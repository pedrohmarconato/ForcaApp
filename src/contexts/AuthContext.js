// /home/pmarconato/ForcaApp/src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react'; // Adicionado useMemo
import { supabase } from '../config/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loadingSession, setLoadingSession] = useState(true);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [errorProfile, setErrorProfile] = useState(null);
    const [initialAuthDone, setInitialAuthDone] = useState(false);

    // Refs para acessar estado atual dentro do listener sem causar re-run do useEffect
    const userRef = useRef(user);
    const initialAuthDoneRef = useRef(initialAuthDone);
    const sessionRef = useRef(session);

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
            const { error } = await supabase
                .from('profiles')
                .select('id')
                .limit(1);

            if (error) {
                console.error("[AuthContext] Erro ao verificar token:", error);

                // Verificar sinais específicos de token expirado ou inválido
                if (error.status === 401 ||
                    error.code === 'PGRST301' ||
                    error.message?.includes('JWT expired') ||
                    error.message?.includes('JWT')) {
                    console.log("[AuthContext] Token inválido/expirado detectado.");
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error("[AuthContext] Erro ao testar validade do token:", error);
            return false;
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
    const fetchProfile = useCallback(async (userId, isInitialFetch = false) => {
        if (!userId) {
            console.log("[AuthContext] fetchProfile chamado sem userId.");
            setProfile(null);
            if (isInitialFetch) setLoadingSession(false);
            setLoadingProfile(false);
            return null;
        }

        console.log(`[AuthContext] Buscando perfil para ID: ${userId}. É inicial? ${isInitialFetch}`);
        setLoadingProfile(true);
        if (isInitialFetch) setLoadingSession(true); // Só ativa loading geral se for inicial
        setErrorProfile(null);

        try {
            // Verificar se o token ainda é válido antes de prosseguir
            // Acessa a ref da sessão aqui para pegar o valor mais atual sem adicionar como dependência
            const tokenValido = await verifyTokenValidity(sessionRef.current);
            if (!tokenValido) {
                console.log("[AuthContext] Token inválido detectado em fetchProfile");
                await handleSessionExpiration();
                return null;
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
                    if (error.status === 401 ||
                        error.code === 'PGRST301' ||
                        error.message?.includes('JWT expired')) {
                        console.log("[AuthContext] Token expirado detectado ao buscar perfil");
                        await handleSessionExpiration();
                        return null;
                    }

                    throw error; // Re-lança outros erros
                } else {
                    console.log("[AuthContext] Perfil não encontrado (PGRST116), retornando null.");
                    setProfile(null); // Garante que o perfil está nulo
                    return null;
                }
            }

            console.log("[AuthContext] Perfil encontrado:", data ? data.id : 'null');
            setProfile(data);
            return data;

        } catch (error) {
            console.error("[AuthContext] Erro na execução de fetchProfile:", error);
            setProfile(null);

            if (error && (error.status === 401 || error.message?.includes("JWT"))) {
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
            // Verificar validade do token antes de prosseguir
            // Acessa a ref da sessão aqui
            const tokenValido = await verifyTokenValidity(sessionRef.current);
            if (!tokenValido) {
                console.log("[AuthContext] Token inválido detectado em updateProfile");
                await handleSessionExpiration();
                throw new Error("Sessão expirada. Faça login novamente.");
            }

            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', currentUserId)
                .select()
                .single();

            if (error) {
                // Verificar se é erro de autenticação
                if (error.status === 401 ||
                    error.code === 'PGRST301' ||
                    error.message?.includes('JWT expired')) {
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
                        await fetchProfile(currentUserId, false); // Não é inicial
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
        session, user, profile, initialAuthDone, loadingProfile, errorProfile,
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