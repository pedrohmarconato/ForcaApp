import { useSelector, TypedUseSelectorHook } from 'react-redux';
import { RootState } from '../store';

// Hook tipado para selectors
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;