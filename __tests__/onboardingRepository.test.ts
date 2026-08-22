// __tests__/onboardingRepository.test.ts
// markOnboardingCompleted grava onboarding_completed=true DIRETO no Supabase,
// sem passar pelo updateProfile/setProfile do AuthContext — ver comentário em
// src/services/onboardingRepository.ts sobre o achado CRÍTICO que isso corrige
// (flip do RootNavigator no meio do onboarding).

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { onboardingRepository } from '../src/services/onboardingRepository';

const fromMock = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('grava onboarding_completed=true filtrando por id do usuário', async () => {
  const query: Record<string, jest.Mock> = {};
  for (const metodo of ['update', 'eq', 'select']) {
    query[metodo] = jest.fn(() => query);
  }
  query.single = jest.fn(async () => ({ data: { id: 'user-1' }, error: null }));
  fromMock.mockReturnValue(query);

  const resultado = await onboardingRepository.markOnboardingCompleted('user-1');

  expect(fromMock).toHaveBeenCalledWith('profiles');
  expect(query.update).toHaveBeenCalledWith({ onboarding_completed: true });
  expect(query.eq).toHaveBeenCalledWith('id', 'user-1');
  expect(resultado).toEqual({ id: 'user-1' });
});

it('propaga o erro do Supabase sem engolir', async () => {
  const query: Record<string, jest.Mock> = {};
  for (const metodo of ['update', 'eq', 'select']) {
    query[metodo] = jest.fn(() => query);
  }
  query.single = jest.fn(async () => ({
    data: null,
    error: { message: 'linha não encontrada', code: 'PGRST116' },
  }));
  fromMock.mockReturnValue(query);

  await expect(onboardingRepository.markOnboardingCompleted('user-1')).rejects.toMatchObject({
    code: 'PGRST116',
  });
});

it('rejeita userId ausente SEM chamar a rede', async () => {
  await expect(onboardingRepository.markOnboardingCompleted('')).rejects.toThrow();
  expect(fromMock).not.toHaveBeenCalled();
});
