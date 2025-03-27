import { Middleware } from 'redux';

export const loggerMiddleware: Middleware = (store) => (next) => (action) => {
  // Ambiente de desenvolvimento apenas
  if (__DEV__) {
    console.group(`ACTION: ${action.type}`);
    console.log('Payload:', action.payload);
    console.log('State antes:', store.getState());
    const result = next(action);
    console.log('State depois:', store.getState());
    console.groupEnd();
    return result;
  }
  return next(action);
};