// src/store/slices/userSlice.ts (Atualizado para usar o serviço Axios para Questionnaire)

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// MANTENHA: Seus imports existentes para apiClient e ENDPOINTS, se ainda usar para outros thunks
import { apiClient } from '../../services/api/apiClient';
import { ENDPOINTS } from '../../services/api/endpoints';

// <<< ADICIONE/CONFIRME: Import do serviço específico e da interface do formulário >>>
import { updateUserProfileWithQuestionnaire } from '../../services/userProfileService'; // <<< Ajuste o caminho se necessário
import type { QuestionnaireFormData } from '../../services/userProfileService'; // <<< Importe o tipo ou defina abaixo

// --- Interfaces ---

// MANTENHA: Sua interface UserProfile atual
export interface UserProfile {
    id: string;
    nome_completo?: string;
    data_nascimento?: string; // Ex: YYYY-MM-DD
    genero?: string;
    peso?: number | null; // Use null para consistência
    altura?: number | null; // Use null para consistência
    nivel?: string; // Renomeado de 'experience_level' ?
    objetivos?: Array<{ nome: string; prioridade: number }>;
    lesoes?: Array<any>; // Talvez tipar melhor depois? (ex: { tipo: string, local: string })
    restricoes?: Array<any>; // Talvez tipar melhor?
    historico_treino?: string; // Campo livre?
    // Adicionado com base na lógica anterior - confirme se existem na sua tabela 'profiles'
    questionnaire_completed_at?: string | null;
    updated_at?: string;
    created_at?: string; // Se tiver
    // Use a definição da sua tabela `profiles` como guia
    // [key: string]: any; // Evite usar [key: string]: any se possível
}

// ADICIONE/CONFIRME: Interface para os dados que vêm do formulário QuestionnaireScreen
// (Se já importou de userProfileService, pode remover esta definição)
/*
export interface QuestionnaireFormData {
    nome: string;
    dataNascimento: { dia: string; mes: string; ano: string };
    genero: string | null;
    peso: string; // Vem como string do input
    altura: string; // Vem como string do input
    experienciaTreino: string | null; // Mapeia para 'nivel'?
    objetivo: string | null; // Mapeia para 'objetivos'? (Precisa de conversão?)
    temLesoes: boolean | null;
    lesoes: string; // Mapeia para 'lesoes'?
    descricaoLesao: string; // Campo extra ou parte de 'lesoes'?
    trainingDays: string[]; // Precisa mapear para alguma coluna?
    includeCardio: boolean | null; // Precisa mapear?
    includeStretching: boolean | null; // Precisa mapear?
    averageTrainingTime: number | null; // Precisa mapear?
}
*/

// MANTENHA: Sua interface UserState atual
interface UserState {
    profile: UserProfile | null;
    questionnaireCompleted: boolean;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
}

// MANTENHA: Seu estado inicial atual
const initialState: UserState = {
    profile: null,
    questionnaireCompleted: false,
    status: 'idle',
    error: null,
};

// --- Thunks Assíncronos ---

// MANTENHA: Seu fetchUserProfile atual (se ainda for relevante)
export const fetchUserProfile = createAsyncThunk(
    'user/fetchProfile',
    // Ajuste: Talvez precise do userId aqui também? Se o endpoint for genérico /me, não precisa.
    async (userId: string | undefined, { rejectWithValue }) => {
        try {
            // Adapte o endpoint se ele precisar do ID: `${ENDPOINTS.USER.PROFILE}/${userId}`
            console.log('[userSlice] Fetching user profile...');
            const response = await apiClient.get(ENDPOINTS.USER.PROFILE); // Assume /me ou similar
            return response.data as UserProfile; // Cast para o tipo esperado
        } catch (error: any) {
            console.error('[userSlice] Failed to fetch profile:', error);
            const message = error.response?.data?.message || error.message || 'Falha ao buscar perfil';
            return rejectWithValue(message);
        }
    }
);

// MANTENHA: Seu updateUserProfile atual (se ainda for usado para atualizações parciais fora do questionário)
export const updateUserProfile = createAsyncThunk(
    'user/updateProfile',
    async (profileData: Partial<UserProfile>, { rejectWithValue }) => {
        try {
             // Adapte o endpoint se ele precisar do ID: `${ENDPOINTS.USER.UPDATE_PROFILE}/${profileData.id}`
            console.log('[userSlice] Updating user profile...');
            const response = await apiClient.put(ENDPOINTS.USER.UPDATE_PROFILE, profileData); // Ou PATCH?
            return response.data as UserProfile;
        } catch (error: any) {
            console.error('[userSlice] Failed to update profile:', error);
            const message = error.response?.data?.message || error.message || 'Falha ao atualizar perfil';
            return rejectWithValue(message);
        }
    }
);


// <<< SUBSTITUA: O thunk submitQuestionnaire para usar o novo serviço Axios >>>
export const submitQuestionnaire = createAsyncThunk<
    QuestionnaireFormData, // Tipo do que é retornado em caso de SUCESSO (formData para update local)
    { userId: string; formData: QuestionnaireFormData }, // Tipo do que é passado como argumento (payload)
    { rejectValue: string } // Tipo do que é retornado em caso de REJEIÇÃO
>(
    'user/submitQuestionnaire',
    async ({ userId, formData }, { rejectWithValue }) => {
        try {
            console.log(`[userSlice] Submitting questionnaire via Axios service for user: ${userId}`);
            // Chama o serviço específico que usa Axios e a API REST do Supabase
            await updateUserProfileWithQuestionnaire(userId, formData);

            console.log(`[userSlice] Questionnaire submitted successfully for user: ${userId}`);
            // Retorna o formData original para que o reducer possa fazer uma atualização parcial local
            return formData;

        } catch (err: any) {
            // O erro já vem tratado e formatado do serviço updateUserProfileWithQuestionnaire
            console.error('[userSlice] Failed to submit questionnaire:', err);
            return rejectWithValue(err.message || 'Erro desconhecido ao enviar questionário.');
        }
    }
);

// --- Slice do Redux ---
const userSlice = createSlice({
    name: 'user',
    initialState,
    // MANTENHA: Seus reducers síncronos
    reducers: {
        setProfile: (state, action: PayloadAction<UserProfile>) => {
            state.profile = action.payload;
            // Deriva questionnaireCompleted do perfil recém-setado
            state.questionnaireCompleted = !!state.profile?.questionnaire_completed_at; // Use um campo específico se tiver
        },
        setQuestionnaireCompleted: (state, action: PayloadAction<boolean>) => {
            state.questionnaireCompleted = action.payload;
        },
        clearProfile: (state) => {
            state.profile = null;
            state.questionnaireCompleted = false;
            state.status = 'idle';
            state.error = null;
        },
        // Adicione um clearError se precisar
         clearUserError(state) {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        // --- Fetch profile ---
        builder
            .addCase(fetchUserProfile.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(fetchUserProfile.fulfilled, (state, action: PayloadAction<UserProfile>) => {
                state.status = 'succeeded';
                state.profile = action.payload;
                // <<< AJUSTE: Use um campo mais confiável para verificar se o questionário foi completo >>>
                // Ex: um campo 'questionnaire_completed_at' ou similar que você definiu no serviço
                state.questionnaireCompleted = !!action.payload?.questionnaire_completed_at;
                // Fallback (menos ideal): state.questionnaireCompleted = !!action.payload?.objetivos?.length;
                 console.log('[userSlice] Profile fetched. Questionnaire completed:', state.questionnaireCompleted);
            })
            .addCase(fetchUserProfile.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string;
                state.profile = null; // Limpa em caso de erro ao buscar
                state.questionnaireCompleted = false;
            });

        // --- Update profile --- (Manter se ainda usado)
        builder
            .addCase(updateUserProfile.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(updateUserProfile.fulfilled, (state, action: PayloadAction<UserProfile>) => {
                state.status = 'succeeded';
                // Atualiza o perfil com os dados retornados pela API de update
                state.profile = { ...(state.profile ?? { id: action.payload.id }), ...action.payload };
                // Reavalia questionnaireCompleted se o update puder afetá-lo
                state.questionnaireCompleted = !!state.profile?.questionnaire_completed_at;
                 console.log('[userSlice] Profile updated.');
            })
            .addCase(updateUserProfile.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string;
            });

        // --- Submit questionnaire (Usando o novo Thunk/Serviço) ---
        builder
            .addCase(submitQuestionnaire.pending, (state) => {
                state.status = 'loading';
                state.error = null;
                console.log('[userSlice] submitQuestionnaire pending...');
            })
            .addCase(submitQuestionnaire.fulfilled, (state, action: PayloadAction<QuestionnaireFormData>) => {
                state.status = 'succeeded';
                state.questionnaireCompleted = true; // A submissão bem-sucedida marca como completo
                const formData = action.payload;

                // <<< ATUALIZAÇÃO PARCIAL LOCAL >>>
                // Atualiza o state.profile localmente com base nos dados enviados (formData),
                // já que o serviço não retorna o perfil completo.
                // **Importante:** Mapeie os campos do formData para os campos do UserProfile!
                const partialProfileUpdate: Partial<UserProfile> = {
                    nome_completo: formData.nome, // Mapeamento
                    data_nascimento: `${formData.dataNascimento.ano}-${formData.dataNascimento.mes}-${formData.dataNascimento.dia}`, // Mapeamento + Formatação
                    genero: formData.genero, // Mapeamento
                    peso: parseFloat(formData.peso) || null, // Mapeamento + Conversão
                    altura: parseInt(formData.altura, 10) || null, // Mapeamento + Conversão
                    nivel: formData.experienciaTreino, // Mapeamento (confirme nomes)
                    // objetivo: ? // Precisa converter formData.objetivo (string) para Array<{nome, prioridade}>?
                    // lesoes: ? // Precisa converter formData.lesoes (string) e temLesoes (bool)?
                    questionnaire_completed_at: new Date().toISOString(), // Marca data/hora
                    updated_at: new Date().toISOString(),
                    // Mapeie outros campos relevantes do formData para UserProfile...
                    // Ex: training_days, include_cardio, etc., se existirem em UserProfile
                };

                // Merge com o perfil existente (garantindo que o ID seja mantido)
                state.profile = {
                    ...(state.profile ?? { id: formData.userId }), // Mantém perfil ou usa ID do payload se perfil era null
                     id: state.profile?.id || formData.userId, // Garante que o ID está presente
                     ...partialProfileUpdate // Aplica as atualizações
                 };

                console.log('[userSlice] Questionnaire submitted. Local profile partially updated.');
            })
            .addCase(submitQuestionnaire.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string; // Mensagem de erro já vem do rejectWithValue
                console.error('[userSlice] submitQuestionnaire rejected:', action.payload);
            });
    },
});

// --- Exportando actions e reducer ---
export const {
    setProfile,
    setQuestionnaireCompleted,
    clearProfile,
    clearUserError // Exporta se adicionou
} = userSlice.actions;

export default userSlice.reducer;

// --- Seletores (para acessar o estado na UI) ---
export const selectUserProfile = (state: { user: UserState }) => state.user.profile;
export const selectQuestionnaireCompletedStatus = (state: { user: UserState }) => state.user.questionnaireCompleted;
export const selectUserStatus = (state: { user: UserState }) => state.user.status;
export const selectUserError = (state: { user: UserState }) => state.user.error;
export const selectIsUserLoading = (state: { user: UserState }) => state.user.status === 'loading';