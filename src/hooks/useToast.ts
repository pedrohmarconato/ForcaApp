import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './useAppDispatch';
import { showToast, hideToast } from '../store/slices/uiSlice';
import { selectToast } from '../store/selectors';

export const useToast = () => {
  const dispatch = useAppDispatch();
  const toast = useAppSelector(selectToast);
  
  const showSuccess = useCallback(
    (message: string) => dispatch(showToast({ message, type: 'success' })),
    [dispatch]
  );
  
  const showError = useCallback(
    (message: string) => dispatch(showToast({ message, type: 'error' })),
    [dispatch]
  );
  
  const showInfo = useCallback(
    (message: string) => dispatch(showToast({ message, type: 'info' })),
    [dispatch]
  );
  
  const showWarning = useCallback(
    (message: string) => dispatch(showToast({ message, type: 'warning' })),
    [dispatch]
  );
  
  const hideMessage = useCallback(() => dispatch(hideToast()), [dispatch]);
  
  return {
    toast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    hideMessage,
  };
};