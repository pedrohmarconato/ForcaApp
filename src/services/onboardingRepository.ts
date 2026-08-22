// src/services/onboardingRepository.ts
// Achado CRÍTICO: QuestionnaireScreen.handleSubmit chamava updateProfile()
// do AuthContext para gravar onboarding_completed=true. updateProfile faz
// setProfile(data) no MESMO estado `profile` que RootNavigator usa no gate
// (MainNavigator vs. OnboardingNavigator) — a gravação trocava de árvore NA
// HORA, desmontando o OnboardingNavigator e o usuário nunca chegava ao
// PostQuestionnaireChat (só existe na árvore de onboarding).
//
// markOnboardingCompleted grava DIRETO no Supabase, sem tocar no estado local
// do AuthContext: o `profile` do contexto continua desatualizado durante a
// sessão (flip em runtime só acontece no fim do chat, via PostQuestionnaireChat).
// O valor true no banco só é lido no próximo cold start (fetchProfile), que é
// quando o questionário deixa de aparecer.

import { supabase } from '../config/supabaseClient';

export type MarkedOnboardingCompleted = {
  id: string;
};

const markOnboardingCompleted = async (
  userId: string,
): Promise<MarkedOnboardingCompleted> => {
  if (!userId) {
    throw new Error('markOnboardingCompleted chamado sem userId.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId)
    .select('id')
    .single();

  if (error) throw error;
  if (!data)
    throw new Error('A atualização de onboarding_completed não retornou dados.');

  return data as MarkedOnboardingCompleted;
};

export const onboardingRepository = { markOnboardingCompleted };
