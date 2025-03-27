import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api/apiClient';
import { ENDPOINTS } from '../../services/api/endpoints';

// Definição de tipos
interface UserProfile {
  id: string;
  nome_completo?: string;
  data_nascimento?: string;
  genero?: string;
  peso?: number;
  altura?: number;
  nivel?: string;
  objetivos?: Array<{ nome: string; prioridade: number }>;
  lesoes?: Array<any>;
  restricoes?: Array<any>;
  historico_treino?: string;
  [key: string]: any;
}

interface UserState {
  profile: UserProfile | null;
  questionnaireCompleted: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// Estado inicial
const initialState: UserState = {
  profile: null,
  questionnaireCompleted: false,
  status: 'idle',
  error: null,
};

// Thunks assíncronos
export const fetchUserProfile = createAsyncThunk(
  'user/fetchProfile',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(ENDPOINTS.USER.PROFILE);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Falha ao buscar perfil');
    }
  }
);

export const updateUserProfile = createAsyncThunk(
  'user/updateProfile',
  async (profileData: Partial<UserProfile>, { rejectWithValue }) => {
    try {
      const response = await apiClient.put(ENDPOINTS.USER.UPDATE_PROFILE, profileData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Falha ao atualizar perfil');
    }
  }
);

export const submitQuestionnaire = createAsyncThunk(
  'user/submitQuestionnaire',
  async (questionnaireData: any, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(ENDPOINTS.USER.QUESTIONNAIRE, questionnaireData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Falha ao enviar questionário');
    }
  }
);

// Slice do Redux
const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setProfile: (state, action: PayloadAction<UserProfile>) => {
      state.profile = action.payload;
    },
    setQuestionnaireCompleted: (state, action: PayloadAction<boolean>) => {
      state.questionnaireCompleted = action.payload;
    },
    clearProfile: (state) => {
      state.profile = null;
      state.questionnaireCompleted = false;
    },
  },
  extraReducers: (builder) => {
    // Fetch profile
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.profile = action.payload;
        // Verifica se o usuário já preencheu o questionário baseado nos dados do perfil
        state.questionnaireCompleted = !!action.payload?.objetivos?.length;
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Update profile
    builder
      .addCase(updateUserProfile.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.profile = { ...state.profile, ...action.payload };
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Submit questionnaire
    builder
      .addCase(submitQuestionnaire.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(submitQuestionnaire.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.questionnaireCompleted = true;
        // Atualiza o perfil se os dados vieram na resposta
        if (action.payload?.profile) {
          state.profile = action.payload.profile;
        }
      })
      .addCase(submitQuestionnaire.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Exportando actions e reducer
export const { setProfile, setQuestionnaireCompleted, clearProfile } = userSlice.actions;
export default userSlice.reducer;