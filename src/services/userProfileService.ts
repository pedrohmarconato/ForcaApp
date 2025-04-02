// src/services/userProfileService.ts
import axios, { AxiosError } from 'axios';

// --- IMPORTANTE: Função para obter o Token JWT do usuário ---
// Adapte esta função para buscar o token de onde ele estiver armazenado
// (ex: AsyncStorage, Contexto de Autenticação, estado Redux do Auth)
// Exemplo (você PRECISA implementar isso de verdade):
import { getSupabaseSession } from './authService'; // Exemplo: importando de um serviço de autenticação

async function getUserAuthToken(): Promise<string | null> {
    const session = await getSupabaseSession(); // Ou sua forma de pegar a sessão/token
    return session?.access_token || null;
}
// --- Fim da função de obter token ---

// Interface (mantida igual)
export interface QuestionnaireFormData {
    nome: string;
    dataNascimento: { dia: string; mes: string; ano: string };
    genero: string | null;
    peso: string;
    altura: string;
    experienciaTreino: string | null;
    objetivo: string | null;
    temLesoes: boolean | null;
    lesoes: string;
    descricaoLesao: string;
    trainingDays: string[];
    includeCardio: boolean | null;
    includeStretching: boolean | null;
    averageTrainingTime: number | null;
}

// --- Configuração da API (Use Variáveis de Ambiente!) ---
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const TABLE_NAME = 'profiles'; // <<< CONFIRME O NOME DA SUA TABELA

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase URL ou Anon Key não definidos nas variáveis de ambiente!");
    // Você pode querer lançar um erro aqui para impedir a execução
}

const API_BASE_URL = `${SUPABASE_URL}/rest/v1`;

/**
 * Atualiza o perfil do usuário via API REST do Supabase usando Axios.
 * Faz uma requisição PATCH para a tabela especificada.
 * Lança um erro em caso de falha.
 *
 * Adapte os nomes das colunas ('full_name', 'birth_date', etc.)
 * conforme a estrutura exata da sua tabela 'profiles'.
 */
export const updateUserProfileWithQuestionnaire = async (
    userId: string,
    formData: QuestionnaireFormData
): Promise<void> => { // Mudança: Retorna Promise<void> e lança erro em caso de falha
    if (!userId) {
        console.error("[userProfileService] User ID is required.");
        throw new Error("ID do usuário não fornecido.");
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Configuração do Supabase incompleta.");
    }

    // 1. Obtenha o token de autenticação do usuário
    const authToken = await getUserAuthToken();
    if (!authToken) {
        throw new Error("Usuário não autenticado ou token inválido.");
    }

    // 2. Mapeie os dados do formulário (lógica mantida igual)
    const profileUpdateData = {
        full_name: formData.nome,
        birth_date: `${formData.dataNascimento.ano}-${formData.dataNascimento.mes}-${formData.dataNascimento.dia}`,
        gender: formData.genero,
        weight_kg: parseFloat(formData.peso) || null,
        height_cm: parseInt(formData.altura, 10) || null,
        experience_level: formData.experienciaTreino,
        main_goal: formData.objetivo,
        training_days: formData.trainingDays,
        preferred_training_time_minutes: formData.averageTrainingTime,
        include_cardio: formData.includeCardio,
        include_stretching: formData.includeStretching,
        has_injuries: formData.temLesoes,
        injury_details: formData.temLesoes ? formData.lesoes : null,
        injury_description: formData.temLesoes ? formData.descricaoLesao : null,
        questionnaire_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), // Supabase pode fazer isso automaticamente se configurado
        // Mapeie quaisquer outros campos necessários...
    };

    // 3. Configure a URL e os Headers para Axios
    const requestUrl = `${API_BASE_URL}/${TABLE_NAME}?id=eq.${userId}`; // Filtra pelo ID do usuário
    const headers = {
        'apikey': SUPABASE_ANON_KEY, // Chave pública necessária para identificar o projeto
        'Authorization': `Bearer ${authToken}`, // Token JWT do usuário para permissão de escrita
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal', // Não precisamos que a API retorne o objeto atualizado
    };

    console.log(`[userProfileService] Attempting PATCH to: ${requestUrl}`);
    // console.log("[userProfileService] Data to update:", profileUpdateData); // Descomente para depurar
    // console.log("[userProfileService] Headers:", { ...headers, Authorization: 'Bearer [REDACTED]' }); // Não logue o token

    // 4. Faça a requisição PATCH com Axios
    try {
        await axios.patch(requestUrl, profileUpdateData, { headers });
        console.log("[userProfileService] Profile updated successfully via Axios for user:", userId);
        // Se chegou aqui sem erro, a operação foi bem-sucedida

    } catch (error) {
        console.error("[userProfileService] Axios request failed:", error);
        let errorMessage = "Erro desconhecido ao atualizar perfil.";

        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>; // Tipagem para acessar response
            if (axiosError.response) {
                // O servidor respondeu com um status de erro (4xx, 5xx)
                console.error("[userProfileService] Error Response Data:", axiosError.response.data);
                console.error("[userProfileService] Error Response Status:", axiosError.response.status);
                // Tenta pegar a mensagem de erro específica do Supabase/PostgREST
                errorMessage = axiosError.response.data?.message || `Erro ${axiosError.response.status} ao atualizar perfil.`;
            } else if (axiosError.request) {
                // A requisição foi feita mas não houve resposta
                errorMessage = "Sem resposta do servidor. Verifique a conexão.";
            } else {
                // Erro ao configurar a requisição
                errorMessage = `Erro na configuração da requisição: ${axiosError.message}`;
            }
        } else if (error instanceof Error) {
             // Erro genérico
             errorMessage = error.message;
        }

        // Lança o erro para ser tratado pelo código que chamou (ex: Redux Thunk)
        throw new Error(errorMessage);
    }
};