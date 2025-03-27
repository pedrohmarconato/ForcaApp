// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from 'redux';

// Importar reducers (adicionar a medida que forem criados)
// import authReducer from './slices/authSlice';
// import workoutReducer from './slices/workoutSlice';
// import profileReducer from './slices/profileSlice';

// Configuração de persistência
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['auth', 'profile'], // Apenas estes reducers serão persistidos
};

// Combinar reducers
const rootReducer = combineReducers({
  // auth: authReducer,
  // workout: workoutReducer,
  // profile: profileReducer,
});

// Aplicar persistência ao reducer combinado
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Criar e configurar a store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

// Criar persistor
export const persistor = persistStore(store);

// Extrair tipos do RootState e AppDispatch da store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;