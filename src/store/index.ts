import { configureStore, combineReducers } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistStore, persistReducer } from 'redux-persist';
import thunk from 'redux-thunk';

// Importação dos reducers
import authReducer from './slices/authSlice';
import userReducer from './slices/userSlice';
import trainingReducer from './slices/trainingSlice';
import uiReducer from './slices/uiSlice';

// Middleware customizado
import { loggerMiddleware } from './middleware/loggerMiddleware';

// Configuração do Redux Persist
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['auth', 'user'], // Apenas estes reducers serão persistidos
};

// Combinando todos os reducers
const rootReducer = combineReducers({
  auth: authReducer,
  user: userReducer,
  training: trainingReducer,
  ui: uiReducer,
});

// Criando o reducer persistente
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configurando a store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }).concat(thunk, loggerMiddleware),
});

// Criando o persistor
export const persistor = persistStore(store);

// Tipos para TypeScript
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;