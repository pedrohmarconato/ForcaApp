// src/services/cardioGoalRepository.ts
// Leitura/escrita das metas de cardio (migration 0022) e das séries de cardio
// que as alimentam.
//
// Mesma disciplina do resto: erro do banco SEMPRE propaga (a tela decide o que
// mostrar), o cliente nunca calcula o que o banco já derivou (o pace é coluna
// gerada) e nada é inventado quando a consulta volta vazia.

import { supabase } from '../config/supabaseClient';
import { toNum, exerciseIdentity } from '../engine/sessionModel';
import type { CardioLog } from '../engine/cardioGoals';
import { isCardioModalidade } from '../constants/cardioModalidades';

const PAGINA = 1000;

/**
 * Séries de CARDIO de sessões concluídas, no formato que o motor de metas
 * consome.
 *
 * Cardio é identificado pelo `muscle_group = 'Cardio'` canônico gravado pelo
 * mapper. Métrica sozinha NÃO basta: `tempo` também mede prancha, aquecimento e
 * mobilidade, que não podem inflar minutos nem dias de cardio.
 */
export const getCardioLogs = async (userId: string): Promise<CardioLog[]> => {
  const linhas: any[] = [];

  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('set_logs')
      .select(
        // Achado 4 (painel adversarial 05-02): `cardio_exercise_swaps` da
        // sessão entra no mesmo select para corrigir identidade/nome de
        // série trocada — mesma fonte que `getSessionLogDetail` usa para o
        // `swappedFrom` do Histórico.
        'actual_duration_seconds, actual_distance_m, completed_at, session_logs!inner(user_id, finished_at, cardio_exercise_swaps(planned_exercise_id, to_modality)), planned_sets!inner(exercise_id, planned_exercises!inner(name, exercise_key, metric, muscle_group))',
      )
      .eq('session_logs.user_id', userId)
      .not('session_logs.finished_at', 'is', null)
      .in('planned_sets.planned_exercises.metric', ['tempo', 'tempo_distancia'])
      .eq('planned_sets.planned_exercises.muscle_group', 'Cardio')
      .not('actual_duration_seconds', 'is', null)
      .order('completed_at', { ascending: false })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;

    const pagina = (data ?? []) as any[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  const logs: CardioLog[] = [];
  for (const linha of linhas) {
    const exercicio = linha?.planned_sets?.planned_exercises;
    const nomePlanejado: string | undefined = exercicio?.name;
    // Defesa local além do filtro PostgREST: um mock, cache ou resposta
    // deformada não transforma prancha/mobilidade em cardio.
    if (!nomePlanejado || exercicio?.muscle_group !== 'Cardio' || !linha?.completed_at) continue;

    // Achado 4: se este planned_exercise foi trocado NESTA sessão, o ponto
    // pertence à modalidade de DESTINO da troca, não à planejada
    // originalmente (mesma semântica de `swappedFrom` em
    // getSessionLogDetail). Modalidade de destino desconhecida (drift entre
    // banco e catálogo do cliente) é DESCARTADA, não coagida — mesmo
    // raciocínio de `isSkipReason`/`isCardioModalidade` no resto do repo.
    const plannedExerciseId: string | null = linha?.planned_sets?.exercise_id ?? null;
    const trocas = (linha?.session_logs?.cardio_exercise_swaps ?? []) as any[];
    const troca = plannedExerciseId
      ? trocas.find(
          (sw) => sw?.planned_exercise_id === plannedExerciseId && isCardioModalidade(sw?.to_modality),
        )
      : undefined;
    const nome = troca ? (troca.to_modality as string) : nomePlanejado;
    // exercise_key do planned_exercise ORIGINAL não se aplica à modalidade de
    // DESTINO da troca — nulo força identidade por nome normalizado, evitando
    // que a série trocada seja identificada pela chave do catálogo errado.
    const exerciseKey = troca ? null : exercicio?.exercise_key ?? null;

    logs.push({
      identity: exerciseIdentity({ exerciseKey, name: nome }),
      name: nome,
      // numeric do PostgREST chega como string: sem coagir, a soma de minutos
      // viraria concatenação de texto.
      durationSeconds: toNum(linha.actual_duration_seconds),
      distanceM: toNum(linha.actual_distance_m),
      completedAt: linha.completed_at,
    });
  }
  return logs;
};
