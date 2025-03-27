import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './useAppDispatch';
import { 
  loginUser, 
  registerUser, 
  logoutUser, 
  clearCredentials, 
  clearError 
} from '../store/slices/authSlice';
import { 
  selectIsAuthenticated, 
  selectCurrentUser, 
  selectAuthStatus, 
  selectAuthError 
} from '../store/selectors';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  
  // Seletores
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  
  // Métodos
  const login = useCallback(
    (email: string, password: string) => dispatch(loginUser({ email, password })),
    [dispatch]
  );
  
  const register = useCallback(
    (email: string, password: string, username?: string) => 
      dispatch(registerUser({ email, password, username })),
    [dispatch]
  );
  
  const logout = useCallback(() => dispatch(logoutUser()), [dispatch]);
  
  const resetAuthState = useCallback(() => dispatch(clearCredentials()), [dispatch]);
  
  const resetError = useCallback(() => dispatch(clearError()), [dispatch]);
  
  return {
    isAuthenticated,
    user,
    status,
    error,
    login,
    register,
    logout,
    resetAuthState,
    resetError,
    isLoading: status === 'loading',
  };
};