import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { signIn, signUp, signOut } from '../../services/auth/authService';

// Definição dos tipos
interface AuthState {
  user: any | null;
  token: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// Estado inicial
const initialState: AuthState = {
  user: null,
  token: null,
  status: 'idle',
  error: null,
};

// Thunks assíncronos
export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await signIn(email, password);
      if (!response.success) {
        return rejectWithValue(response.error || 'Falha ao fazer login');
      }
      return {
        user: response.user,
        token: response.data?.session?.access_token,
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async (
    { email, password, username }: { email: string; password: string; username?: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await signUp(email, password, username);
      if (!response.success) {
        return rejectWithValue(response.error || 'Falha ao cadastrar');
      }
      return response.user;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
  try {
    const response = await signOut();
    if (!response.success) {
      return rejectWithValue(response.error || 'Falha ao fazer logout');
    }
    return null;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

// Slice do Redux
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: any; token: string }>) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
    },
    clearCredentials: (state) => {
      state.user = null;
      state.token = null;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Logout
    builder
      .addCase(logoutUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.status = 'idle';
        state.user = null;
        state.token = null;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// Exportando actions e reducer
export const { setCredentials, clearCredentials, setError, clearError } = authSlice.actions;
export default authSlice.reducer;