import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Definição de tipos para o estado da UI
interface UIState {
  theme: 'light' | 'dark';
  isLoading: boolean;
  activeTab: string;
  toast: {
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  };
  modalStack: Array<{
    id: string;
    props: any;
  }>;
}

// Estado inicial
const initialState: UIState = {
  theme: 'dark', // Tema padrão baseado na UI existente
  isLoading: false,
  activeTab: 'home',
  toast: {
    visible: false,
    message: '',
    type: 'info',
  },
  modalStack: [],
};

// Slice do Redux
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTab = action.payload;
    },
    showToast: (state, action: PayloadAction<{ message: string; type: 'success' | 'error' | 'info' | 'warning' }>) => {
      state.toast = {
        visible: true,
        message: action.payload.message,
        type: action.payload.type,
      };
    },
    hideToast: (state) => {
      state.toast.visible = false;
    },
    pushModal: (state, action: PayloadAction<{ id: string; props: any }>) => {
      state.modalStack.push(action.payload);
    },
    popModal: (state) => {
      state.modalStack.pop();
    },
    clearModals: (state) => {
      state.modalStack = [];
    },
  },
});

// Exportando actions e reducer
export const {
  setTheme,
  setLoading,
  setActiveTab,
  showToast,
  hideToast,
  pushModal,
  popModal,
  clearModals,
} = uiSlice.actions;
export default uiSlice.reducer;