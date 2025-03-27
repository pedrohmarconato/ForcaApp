import { RootState } from '../index';

// Seletores de autenticação
export const selectIsAuthenticated = (state: RootState) => !!state.auth.token;
export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectAuthError = (state: RootState) => state.auth.error;

// Seletores de usuário
export const selectUserProfile = (state: RootState) => state.user.profile;
export const selectQuestionnaireCompleted = (state: RootState) => state.user.questionnaireCompleted;
export const selectUserStatus = (state: RootState) => state.user.status;
export const selectUserError = (state: RootState) => state.user.error;

// Seletores de treino
export const selectTrainingPlans = (state: RootState) => state.training.plans;
export const selectCurrentPlan = (state: RootState) => state.training.currentPlan;
export const selectTrainingSessions = (state: RootState) => state.training.sessions;
export const selectCurrentSession = (state: RootState) => state.training.currentSession;
export const selectTrainingStatus = (state: RootState) => state.training.status;
export const selectTrainingError = (state: RootState) => state.training.error;

// Seletores de UI
export const selectTheme = (state: RootState) => state.ui.theme;
export const selectIsLoading = (state: RootState) => state.ui.isLoading;
export const selectActiveTab = (state: RootState) => state.ui.activeTab;
export const selectToast = (state: RootState) => state.ui.toast;
export const selectModalStack = (state: RootState) => state.ui.modalStack;
export const selectTopModal = (state: RootState) => 
  state.ui.modalStack.length > 0 ? state.ui.modalStack[state.ui.modalStack.length - 1] : null;