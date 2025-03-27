import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api/apiClient';
import { ENDPOINTS } from '../../services/api/endpoints';

// Definição de tipos
interface TrainingSession {
  id: string;
  name: string;
  date: string;
  status: 'scheduled' | 'completed' | 'partial' | 'missed';
  exercises: Array<any>;
  [key: string]: any;
}

interface TrainingPlan {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  sessions: Array<TrainingSession>;
  [key: string]: any;
}

interface TrainingState {
  plans: TrainingPlan[];
  currentPlan: TrainingPlan | null;
  sessions: TrainingSession[];
  currentSession: TrainingSession | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// Estado inicial
const initialState: TrainingState = {
  plans: [],
  currentPlan: null,
  sessions: [],
  currentSession: null,
  status: 'idle',
  error: null,
};

// Thunks assíncronos
export const fetchTrainingPlans = createAsyncThunk(
  'training/fetchPlans',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(ENDPOINTS.TRAINING.PLANS);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Falha ao buscar planos de treino');
    }
  }
);

export const fetchTrainingSessions = createAsyncThunk(
  'training/fetchSessions',
  async (filters: { startDate?: string; endDate?: string; status?: string }, { rejectWithValue }) => {
    try {
      let url = ENDPOINTS.TRAINING.SESSIONS;
      
      // Adicionando filtros à URL se fornecidos
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.status) queryParams.append('status', filters.status);
      
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
      
      const response = await apiClient.get(url);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Falha ao buscar sessões de treino');
    }
  }
);

export const recordTrainingSession = createAsyncThunk(
  'training/recordSession',
  async (sessionData: Partial<TrainingSession>, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(ENDPOINTS.TRAINING.SESSIONS, sessionData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Falha ao registrar sessão de treino');
    }
  }
);

// Slice do Redux
const trainingSlice = createSlice({
  name: 'training',
  initialState,
  reducers: {
    setCurrentPlan: (state, action: PayloadAction<TrainingPlan>) => {
      state.currentPlan = action.payload;
    },
    setCurrentSession: (state, action: PayloadAction<TrainingSession>) => {
      state.currentSession = action.payload;
    },
    clearTrainingData: (state) => {
      state.plans = [];
      state.currentPlan = null;
      state.sessions = [];
      state.currentSession = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch training plans
    builder
      .addCase(fetchTrainingPlans.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchTrainingPlans.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.plans = action.payload;
        // Se não houver um plano atual e existirem planos, define o primeiro como atual
        if (!state.currentPlan && action.payload.length > 0) {
          state.currentPlan = action.payload[0];
        }
      })
      .addCase(fetchTrainingPlans.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Fetch training sessions
    builder
      .addCase(fetchTrainingSessions.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchTrainingSessions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.sessions = action.payload;
      })
      .addCase(fetchTrainingSessions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Record training session
    builder
      .addCase(recordTrainingSession.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(recordTrainingSession.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Adiciona a nova sessão à lista ou atualiza existente
        const index = state.sessions.findIndex(session => session.id === action.payload.id);
        if (index >= 0) {
          state.sessions[index] = action.payload;
        } else {
          state.sessions.push(action.payload);
        }
        // Atualiza a sessão atual se