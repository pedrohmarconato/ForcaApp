import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './useAppDispatch';
import {
  fetchTrainingPlans,
  fetchTrainingSessions,
  recordTrainingSession,
  setCurrentPlan,
  setCurrentSession,
} from '../store/slices/trainingSlice';
import {
  selectTrainingPlans,
  selectCurrentPlan,
  selectTrainingSessions,
  selectCurrentSession,
  selectTrainingStatus,
  selectTrainingError,
} from '../store/selectors';

export const useTraining = () => {
  const dispatch = useAppDispatch();
  
  // Seletores
  const plans = useAppSelector(selectTrainingPlans);
  const currentPlan = useAppSelector(selectCurrentPlan);
  const sessions = useAppSelector(selectTrainingSessions);
  const currentSession = useAppSelector(selectCurrentSession);
  const status = useAppSelector(selectTrainingStatus);
  const error = useAppSelector(selectTrainingError);
  
  // Métodos
  const getPlans = useCallback(() => dispatch(fetchTrainingPlans()), [dispatch]);
  
  const getSessions = useCallback(
    (filters = {}) => dispatch(fetchTrainingSessions(filters)),
    [dispatch]
  );
  
  const recordSession = useCallback(
    (sessionData) => dispatch(recordTrainingSession(sessionData)),
    [dispatch]
  );
  
  const selectPlan = useCallback(
    (plan) => dispatch(setCurrentPlan(plan)),
    [dispatch]
  );
  
  const selectSession = useCallback(
    (session) => dispatch(setCurrentSession(session)),
    [dispatch]
  );
  
  return {
    plans,
    currentPlan,
    sessions,
    currentSession,
    status,
    error,
    getPlans,
    getSessions,
    recordSession,
    selectPlan,
    selectSession,
    isLoading: status === 'loading',
  };
};