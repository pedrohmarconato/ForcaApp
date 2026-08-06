// Edição de plano existente — modos de falha cobertos:
// - importar uma semana progressiva em vez da semana 1 original;
// - perder prescrição, dia, limitação ou regras de progressão na conversão;
// - transformar aquecimento/alongamento injetados em exercícios editáveis e
//   duplicá-los a cada rodada de abrir → salvar → abrir;
// - inventar progressão quando planos antigos têm progression_rules nulo.

import {
  manualDraftFromExistingPlan,
  type ExistingManualPlanMetadata,
} from '../src/services/manualPlanImport';
import type {
  PlannedExercise,
  PlannedSet,
  SessionDetail,
} from '../src/services/trainingRepository';

const plannedSet = (
  partial: Partial<PlannedSet> = {},
): PlannedSet => ({
  id: `set-${Math.random()}`,
  exercise_id: 'exercise',
  set_order: 1,
  target_reps_min: 8,
  target_reps_max: 12,
  target_load_kg: null,
  target_rir: null,
  target_duration_seconds: null,
  target_distance_m: null,
  ...partial,
});

const plannedExercise = (
  exerciseKey: string | null,
  name: string,
  partial: Partial<PlannedExercise> = {},
): PlannedExercise => ({
  id: `exercise-${name}`,
  session_id: 'session-1',
  exercise_order: 1,
  name,
  exercise_key: exerciseKey,
  name_original: name,
  metric: 'carga_reps',
  muscle_group: 'Peito',
  priority: 'primary',
  equipment: 'Barra',
  load_increment_kg: 2.5,
  rest_seconds: 90,
  target_rm_percent: 72.5,
  sets_planned: 4,
  reps_raw: '8-12',
  method: null,
  notes: 'Controle a descida',
  injury_flags: [],
  planned_sets: [plannedSet()],
  ...partial,
});

const sessionWithInjectedBlocks = (
  exercises: PlannedExercise[] = [
    plannedExercise('supino_reto_barra', 'Supino Reto com Barra'),
  ],
): SessionDetail => ({
  id: 'session-1',
  plan_id: 'plan-old',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: 'sexta',
  order_in_week: 1,
  title: 'Treino Push',
  session_type: 'Personalizado',
  scheduled_date: '2026-07-24',
  estimated_minutes: 55,
  status: 'pending',
  muscle_groups: ['Peito'],
  planned_exercises: [
    plannedExercise('aquecimento_articular', 'Aquecimento Articular', {
      exercise_order: 1,
      metric: 'tempo',
      priority: 'accessory',
      sets_planned: 1,
      reps_raw: null,
      planned_sets: [plannedSet({ target_reps_min: null, target_reps_max: null, target_duration_seconds: 300 })],
    }),
    ...exercises.map((exercise, index) => ({ ...exercise, exercise_order: index + 2 })),
    plannedExercise('alongamento_dinamico', 'Alongamento Dinâmico', {
      exercise_order: exercises.length + 2,
      metric: 'tempo',
      priority: 'accessory',
      sets_planned: 1,
      reps_raw: null,
      planned_sets: [plannedSet({ target_reps_min: null, target_reps_max: null, target_duration_seconds: 300 })],
    }),
  ],
});

const metadata: ExistingManualPlanMetadata = {
  id: 'plan-old',
  name: 'Plano do professor',
  duration_weeks: 12,
  progression_rules: [
    {
      tipo: 'delta_series',
      valor: 1,
      semana_inicio: 5,
      semana_fim: 8,
      grupo_alvo: 'todos',
    },
    {
      tipo: 'deload_percentual',
      semana: 4,
      fator_rm: 0.8,
      fator_series: 0.7,
    },
  ],
};

describe('manualDraftFromExistingPlan', () => {
  it('preserva a prescrição da semana 1 e converte os blocos injetados em toggles', () => {
    const imported = manualDraftFromExistingPlan(metadata, [sessionWithInjectedBlocks()]);

    expect(imported.progressionUnavailable).toBe(false);
    expect(imported.draft).toMatchObject({
      nome: 'Plano do professor',
      duracao_semanas: 12,
      progressao: {
        series: { ativa: true, valor: 1, semana_inicio: 5, semana_fim: 8 },
        cardio: null,
        intensidade: null,
        deload: { ativa: true, semana: 4, fator_rm: 0.8, fator_series: 0.7 },
      },
    });
    expect(imported.draft.treinos[0]).toMatchObject({
      nome: 'Treino Push',
      dia_offset: 4,
      duracao_minutos: 55,
      incluir_aquecimento: true,
      incluir_alongamento: true,
    });
    expect(imported.draft.treinos[0].exercicios).toEqual([
      expect.objectContaining({
        exercise_key: 'supino_reto_barra',
        nome: 'Supino Reto com Barra',
        metrica: 'carga_reps',
        equipamento: 'Barra',
        series: 4,
        repeticoes: '8-12',
        tempo_descanso: 90,
        prioridade: 'primario',
        percentual_rm: 72.5,
        observacoes: 'Controle a descida',
        tem_limitacao: false,
      }),
    ]);
  });

  it('não duplica aquecimento nem alongamento após duas rodadas de edição', () => {
    const first = manualDraftFromExistingPlan(metadata, [sessionWithInjectedBlocks()]);

    // Simula o resultado do pipeline ao salvar: os toggles voltam a injetar
    // exatamente um bloco em cada ponta da sessão.
    const second = manualDraftFromExistingPlan(metadata, [
      sessionWithInjectedBlocks([
        plannedExercise(
          first.draft.treinos[0].exercicios[0].exercise_key,
          first.draft.treinos[0].exercicios[0].nome,
        ),
      ]),
    ]);

    expect(second.draft.treinos[0].incluir_aquecimento).toBe(true);
    expect(second.draft.treinos[0].incluir_alongamento).toBe(true);
    expect(second.draft.treinos[0].exercicios).toHaveLength(1);
    expect(second.draft.treinos[0].exercicios[0].exercise_key).toBe('supino_reto_barra');
  });

  it('desliga tudo e sinaliza indisponibilidade quando progression_rules é nulo', () => {
    const imported = manualDraftFromExistingPlan(
      { ...metadata, progression_rules: null },
      [sessionWithInjectedBlocks()],
    );

    expect(imported.progressionUnavailable).toBe(true);
    expect(imported.draft.progressao).toEqual({
      series: null,
      cardio: null,
      intensidade: null,
      deload: null,
    });
  });
});

describe('manualDraftFromExistingPlan — regressões da auditoria', () => {
  it('deriva o dia do rótulo persistido, não da data comprimida da semana 1', () => {
    // A trava que proíbe agendar antes de start_date comprime seg/qua/sex da
    // semana 1 na mesma data quando o plano nasce numa sexta. Derivar o dia
    // dessa data devolvia "sexta/sexta/sexta": o editor mostrava um schedule
    // que o plano não tem e o save morria em "dois treinos no mesmo dia".
    const sessoes: SessionDetail[] = ['segunda', 'quarta', 'sexta'].map((dia, index) => ({
      ...sessionWithInjectedBlocks(),
      id: `session-${index}`,
      day_of_week: dia,
      order_in_week: index + 1,
      title: `Treino ${index + 1}`,
      scheduled_date: '2026-07-24', // sexta: as três colapsaram na mesma data
    }));

    const { draft } = manualDraftFromExistingPlan(metadata, sessoes);

    expect(draft.treinos.map((treino) => treino.dia_offset)).toEqual([0, 2, 4]);
  });

  it('usa a data agendada só quando o rótulo do dia não existe', () => {
    const sessao: SessionDetail = {
      ...sessionWithInjectedBlocks(),
      day_of_week: null,
      scheduled_date: '2026-07-22', // quarta-feira
    };

    const { draft } = manualDraftFromExistingPlan(metadata, [sessao]);

    expect(draft.treinos[0].dia_offset).toBe(2);
  });

  it('isometria curta volta como fração de minuto que o contrato aceita', () => {
    const prancha = plannedExercise('prancha', 'Prancha', {
      metric: 'tempo',
      reps_raw: null,
      planned_sets: [
        plannedSet({
          target_reps_min: null,
          target_reps_max: null,
          target_duration_seconds: 45,
          target_distance_m: 50,
        }),
      ],
    });

    const { draft } = manualDraftFromExistingPlan(metadata, [
      sessionWithInjectedBlocks([prancha]),
    ]);

    const importado = draft.treinos[0].exercicios[0];
    expect(importado.duracao_minutos).toBe(0.75);
    expect(importado.distancia_km).toBe(0.05);
  });

  it('exercício do aluno parecido com aquecimento continua editável', () => {
    // Nome livre "Aquecimento" de 10 min é canonizado para
    // `aquecimento_articular`. Inferindo o toggle só pela chave, o exercício
    // sumia da lista e o pipeline reinjetava o bloco padrão de 5 min por cima.
    const aquecimentoDoAluno = plannedExercise('aquecimento_articular', 'Aquecimento', {
      metric: 'tempo',
      priority: 'primary',
      sets_planned: 1,
      reps_raw: null,
      planned_sets: [
        plannedSet({
          target_reps_min: null,
          target_reps_max: null,
          target_duration_seconds: 600,
        }),
      ],
    });
    const sessao: SessionDetail = {
      ...sessionWithInjectedBlocks(),
      planned_exercises: [
        aquecimentoDoAluno,
        plannedExercise('supino_reto_barra', 'Supino Reto com Barra', { exercise_order: 2 }),
      ],
    };

    const { draft } = manualDraftFromExistingPlan(metadata, [sessao]);

    expect(draft.treinos[0].incluir_aquecimento).toBe(false);
    expect(draft.treinos[0].exercicios.map((e) => e.nome)).toEqual([
      'Aquecimento',
      'Supino Reto com Barra',
    ]);
    expect(draft.treinos[0].exercicios[0].duracao_minutos).toBe(10);
  });

  it('regra com escopo ou janela que o editor não representa vira aviso explícito', () => {
    const comEscopo: ExistingManualPlanMetadata = {
      ...metadata,
      progression_rules: [
        {
          tipo: 'delta_rm_percentual',
          valor: 2.5,
          semana_inicio: 5,
          semana_fim: 12,
          grupo_alvo: 'primario',
        },
      ],
    };

    const { draft, progressionUnavailable, progressionChanges } =
      manualDraftFromExistingPlan(comEscopo, [sessionWithInjectedBlocks()]);

    expect(progressionUnavailable).toBe(false);
    expect(draft.progressao.intensidade).toEqual({ ativa: true, valor: 2.5 });
    expect(progressionChanges.join(' ')).toContain('primario');
    expect(progressionChanges.join(' ')).toContain('semana 5');
  });

  it('regra com campo opcional ausente usa o default do motor em vez de sumir', () => {
    // `deload_percentual` sem fatores é válido no MOLDE_SCHEMA e o expansor
    // aplica 0,8. Descartar a regra fazia o plano novo nascer sem a semana de
    // descarga que o aluno tinha, com o checkbox desmarcado e nenhum aviso.
    const semFatores: ExistingManualPlanMetadata = {
      ...metadata,
      progression_rules: [{ tipo: 'deload_percentual', semana: 4 }],
    };

    const { draft } = manualDraftFromExistingPlan(semFatores, [
      sessionWithInjectedBlocks(),
    ]);

    expect(draft.progressao.deload).toEqual({
      ativa: true,
      semana: 4,
      fator_rm: 0.8,
      fator_series: 0.8,
    });
  });

  it('regra de tipo desconhecido é declarada, nunca silenciada', () => {
    const desconhecida: ExistingManualPlanMetadata = {
      ...metadata,
      progression_rules: [{ tipo: 'delta_inventado', valor: 3 }],
    };

    const { progressionChanges } = manualDraftFromExistingPlan(desconhecida, [
      sessionWithInjectedBlocks(),
    ]);

    expect(progressionChanges.join(' ')).toContain('delta_inventado');
  });
});

describe('manualDraftFromExistingPlan — janela que não cabe no plano', () => {
  it('janela de séries maior que o plano é encaixada e o aviso explica', () => {
    // Plano que prometia 12 semanas mas mapeou 4: a janela 2→8 voltava intacta,
    // o Salvar ficava habilitado e o POST devolvia 400 "progressão termina
    // depois do plano", sem nada na tela apontando o campo.
    const curto: ExistingManualPlanMetadata = {
      ...metadata,
      duration_weeks: 4,
      progression_rules: [
        { tipo: 'delta_series', valor: 1, semana_inicio: 2, semana_fim: 8, grupo_alvo: 'todos' },
        { tipo: 'deload_percentual', semana: 6, fator_rm: 0.8, fator_series: 0.8 },
      ],
    };

    const { draft, progressionChanges } = manualDraftFromExistingPlan(curto, [
      sessionWithInjectedBlocks(),
    ]);

    expect(draft.progressao.series).toEqual({
      ativa: true,
      valor: 1,
      semana_inicio: 2,
      semana_fim: 4,
    });
    expect(draft.progressao.deload?.semana).toBe(4);
    expect(progressionChanges.join(' ')).toContain('não cabe num plano de 4 semanas');
    expect(progressionChanges.join(' ')).toContain('semana de descarga');
  });

  it('plano de uma semana não importa aumento de séries e avisa', () => {
    const umaSemana: ExistingManualPlanMetadata = {
      ...metadata,
      duration_weeks: 1,
      progression_rules: [
        { tipo: 'delta_series', valor: 1, semana_inicio: 1, semana_fim: 1, grupo_alvo: 'todos' },
      ],
    };

    const { draft, progressionChanges } = manualDraftFromExistingPlan(umaSemana, [
      sessionWithInjectedBlocks(),
    ]);

    expect(draft.progressao.series).toBeNull();
    expect(progressionChanges.join(' ')).toContain('só uma semana');
  });
});

describe('estimativa deixada a cargo do servidor', () => {
  it('volta em branco na edição em vez de virar número declarado pelo aluno', () => {
    // O aluno deixa "Estimativa do treino" vazio confiando no placeholder "O
    // servidor estima pelo volume". O servidor calcula (ex.: 36 min) e grava
    // estimated_minutes. Ao reabrir para editar, esse 36 voltava para o campo
    // como se ele tivesse digitado: tirar dois exercícios depois disso não
    // recalculava mais nada, e o plano guardava 36 min para um treino de 19.
    // O molde preserva a distinção — só grava duracao_minutos quando o aluno
    // declarou um. É essa a fonte da verdade na volta.
    const comMolde: ExistingManualPlanMetadata = {
      ...metadata,
      raw_plan: {
        sessoes: [{ nome: 'Treino Push' }], // sem duracao_minutos: o aluno não declarou
      },
    };

    const { draft } = manualDraftFromExistingPlan(comMolde, [
      sessionWithInjectedBlocks(),
    ]);

    expect(draft.treinos[0].duracao_minutos).toBeNull();
  });

  it('estimativa que o aluno declarou continua voltando preenchida', () => {
    const comMolde: ExistingManualPlanMetadata = {
      ...metadata,
      raw_plan: { sessoes: [{ nome: 'Treino Push', duracao_minutos: 55 }] },
    };

    const { draft } = manualDraftFromExistingPlan(comMolde, [
      sessionWithInjectedBlocks(),
    ]);

    expect(draft.treinos[0].duracao_minutos).toBe(55);
  });

  it('plano sem molde legível mantém o comportamento antigo', () => {
    const { draft } = manualDraftFromExistingPlan(metadata, [
      sessionWithInjectedBlocks(),
    ]);

    expect(draft.treinos[0].duracao_minutos).toBe(55);
  });
});
