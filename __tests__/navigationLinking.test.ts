// __tests__/navigationLinking.test.ts
// Deep link / URL tipada da sessão ativa (Sprint 1.1):
//  - getStateFromPath: cada URL reconstrói a ABA e o STACK corretos com o
//    sessionId exato;
//  - getPathFromState: ida e volta estáveis (state → URL → state preserva).

import { getStateFromPath, getPathFromState } from '@react-navigation/native';
import { LINKING_CONFIG } from '../src/navigation/linking';

// Shape do estado parcial aninhado devolvido pelo linking:
// { routes: [ { name: 'Home', state: { routes: [ { name, params } ] } } ] }
const rotaAtivaDoStack = (state: any): any => {
  const stack = state.routes[0]?.state;
  return stack?.routes[stack.routes.length - 1];
};

describe('linking: ActiveSession recuperável por URL nos stacks Hoje e Plano', () => {
  it('URL /home/active-session/:id → aba Home, stack ActiveSession, sessionId exato', () => {
    const state = getStateFromPath('/home/active-session/abc123', LINKING_CONFIG);
    expect(state).not.toBeNull();
    expect(state!.routes[0].name).toBe('Home');
    const rota = rotaAtivaDoStack(state);
    expect(rota.name).toBe('ActiveSession');
    expect(rota.params).toEqual({ sessionId: 'abc123' });
  });

  it('URL /training/active-session/:id → aba Training, stack ActiveSession, sessionId exato', () => {
    const state = getStateFromPath('/training/active-session/def456', LINKING_CONFIG);
    expect(state).not.toBeNull();
    expect(state!.routes[0].name).toBe('Training');
    const rota = rotaAtivaDoStack(state);
    expect(rota.name).toBe('ActiveSession');
    expect(rota.params).toEqual({ sessionId: 'def456' });
  });

  it('WorkoutDetail também é tipado nos dois stacks (URL: /home/workout/:id)', () => {
    const state = getStateFromPath('/home/workout/wk-9', LINKING_CONFIG);
    expect(state).not.toBeNull();
    const rota = rotaAtivaDoStack(state);
    expect(rota.name).toBe('WorkoutDetail');
    expect(rota.params).toEqual({ sessionId: 'wk-9' });
  });

  it('ida e volta estável: state → URL → state preserva aba, tela e sessionId', () => {
    const state = getStateFromPath('/training/active-session/xyz789', LINKING_CONFIG)!;
    const url = getPathFromState(state, LINKING_CONFIG);
    expect(url).toContain('training');
    expect(url).toContain('xyz789');

    const deVolta = getStateFromPath(url, LINKING_CONFIG);
    expect(deVolta!.routes[0].name).toBe('Training');
    expect(rotaAtivaDoStack(deVolta).name).toBe('ActiveSession');
    expect(rotaAtivaDoStack(deVolta).params).toEqual({ sessionId: 'xyz789' });
  });

  it('URL de outra tela não vaza para ActiveSession (HomeMain → path vazio)', () => {
    const state = getStateFromPath('/home', LINKING_CONFIG);
    expect(state).not.toBeNull();
    expect(rotaAtivaDoStack(state).name).toBe('HomeMain');
  });
});
