import { supabase } from '../config/supabaseClient';
import type { NeonColorKey } from '../theme/theme';

export type SavedNeonPreference = {
  id: string;
  neon_color: unknown;
};

const saveNeonColor = async (
  userId: string,
  neonColor: NeonColorKey,
): Promise<SavedNeonPreference> => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ neon_color: neonColor })
    .eq('id', userId)
    .select('id, neon_color')
    .single();

  if (error) throw error;
  if (!data)
    throw new Error('A preferência neon atualizada não foi retornada.');

  return data as SavedNeonPreference;
};

export const neonPreferenceRepository = { saveNeonColor };
