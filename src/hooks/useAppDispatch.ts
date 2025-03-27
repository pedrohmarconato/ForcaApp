import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';

// Hook tipado para dispatch
export const useAppDispatch = () => useDispatch<AppDispatch>();