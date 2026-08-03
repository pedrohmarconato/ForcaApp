// __tests__/musclePriority.test.ts
// COMMIT C — Nível 3 (PRIORIDADE) da escada de reencaixe: motor PURO de
// negligência muscular (sem I/O, testável offline).
//
// Cobre: (a) quem são os grupos negligenciados na semana (sessão devida = data
// ESTRITAMENTE passada e zero séries concluídas, qualquer status); (b) a
// proposta de promover o primário do grupo para o 1º lugar real (depois do
// prefixo de abertura: acessórios medidos por tempo); (c) os invariantes da
// ordem proposta — permutação exata, movimento único, volume intocado.

import {
  gruposNegligenciados,
  promoverPrimarioDoGrupo,
  type GrupoNegligenciado,
  type PropostaPrioridade,
} from '../src/engine/musclePriority';
import type { ReplanExercise, ReplanSession } from '../src/engine/weeklyReplanner';
import { moveItem } from '../src/engine/planReorder';

const HOJE = '2020-01-08';

type Metrica = 'carga_reps' | 'tempo' | 'tempo_distancia';

const ex = (p: {
  id: string;
  nome: string;
  grupo?: string | null;
  prioridade: ReplanExercise['priority'];
  ordem: number;
  series?: number;
  metrica?: Metrica;
}): ReplanExercise => ({
  id: p.id,
  name: p.nome,
  muscleGroup: p.grupo ?? null,
  priority: p.prioridade,
  exerciseOrder: p.ordem,
  sets: Array.from({ length: p.series ?? 1 }, (_, i) => ({
    id: `${p.id}-s${i + 1}`,
    setOrder: i + 1,
  })),
  metric: p.metrica ?? 'carga_reps',
});

const sessao = (p: {
  id: string;
  data: string | null;
  status?: ReplanSession['status'];
  skipSource?: ReplanSession['skipSource'];
  exercicios: ReplanExercise[];
}): ReplanSession => ({
  id: p.id,
  weekNumber: 1,
  title: `Treino ${p.id}`,
  sessionType: 'Hipertrofia',
  scheduledDate: p.data,
  status: p.status ?? 'pending',
  skipSource: p.skipSource,
  estimatedMinutes: 60,
  exercises: p.exercicios,
});

const idsDe = (exercicios: ReplanExercise[]): string[] => exercicios.map((e) => e.id);

// Aquecimento típico do molde manual (manual_plan_builder): acessório, tempo.
const aquecimento = (ordem: number) =>
  ex({ id: `aq${ordem}`, nome: 'Mobilidade', grupo: null, prioridade: 'accessory', ordem, series: 2, metrica: 'tempo' });

describe('gruposNegligenciados', () => {
  it('sessão devida sem execução na semana → grupo negligenciado, com volume planejado da semana inteira', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
      sessao({
        id: 'qui',
        data: '2020-01-09',
        exercicios: [
          ex({ id: 'pul', nome: 'Pulley', grupo: 'Costas', prioridade: 'secondary', ordem: 1, series: 3 }),
        ],
      }),
    ];

    const negligenciados = gruposNegligenciados(semana, {}, HOJE);

    // sériesPlanejadas soma a semana TODA (4 da devida + 3 da futura), não só a devida.
    expect(negligenciados).toEqual([{ grupo: 'Costas', seriesPlanejadas: 7 }]);
  });

  it('grupo com séries executadas em outra sessão NÃO aparece', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
      sessao({
        id: 'ter',
        data: '2020-01-06',
        exercicios: [
          ex({ id: 'pul', nome: 'Pulley', grupo: 'Costas', prioridade: 'secondary', ordem: 1, series: 3 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, { ter: 3 }, HOJE)).toEqual([]);
  });

  it('sessão devida executada pela metade não negligencia (limiar binário em 0)', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, { seg: 1 }, HOJE)).toEqual([]);
  });

  it('plano novo sem nenhuma sessão devida → vazio', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-08',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
      sessao({
        id: 'qui',
        data: '2020-01-09',
        exercicios: [
          ex({ id: 'sup', nome: 'Supino', grupo: 'Peito', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE)).toEqual([]);
  });

  it('sessão de HOJE não é devida (estritamente passada)', () => {
    const semana = [
      sessao({
        id: 'hoje',
        data: HOJE,
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE)).toEqual([]);
  });

  it('sessão devida em status skipped também negligencia (qualquer status)', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        status: 'skipped',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE)).toEqual([{ grupo: 'Costas', seriesPlanejadas: 4 }]);
  });

  it('sessão RECUSADA pelo aluno (skip_source user) NÃO negligencia — recusa com dor não vira promoção de supino (achado nº 4 do review 67)', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        status: 'skipped',
        skipSource: 'user',
        exercicios: [
          ex({ id: 'sup', nome: 'Supino Inclinado', grupo: 'Peito', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE)).toEqual([]);
  });

  it('recusa pelo fechador (skip_source replan) continua negligenciando — é falta não resolvida, não decisão', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        status: 'skipped',
        skipSource: 'replan',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE)).toEqual([{ grupo: 'Costas', seriesPlanejadas: 4 }]);
  });

  it('exercício sem grupo muscular nunca entra na lista', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          aquecimento(1),
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE)).toEqual([{ grupo: 'Costas', seriesPlanejadas: 4 }]);
  });

  it('executedSetsByGroup explícito prevalece sobre a aproximação por sessão', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    // Sem o parâmetro, a aproximação diria "nunca treinou"; o valor explícito manda.
    expect(gruposNegligenciados(semana, {}, HOJE, undefined, { costas: 2 })).toEqual([]);
  });

  it('exercício cortado pela escada de tempo não conta como planejado', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
          ex({ id: 'bar', nome: 'Barra Fixa', grupo: 'Costas', prioridade: 'secondary', ordem: 2, series: 3 }),
        ],
      }),
    ];

    // 'bar' foi cortado: some das séries planejadas e não vira candidato próprio.
    const cortados = { seg: ['bar'] };
    expect(gruposNegligenciados(semana, {}, HOJE, cortados)).toEqual([
      { grupo: 'Costas', seriesPlanejadas: 4 },
    ]);
  });

  it('grupo cujo ÚNICO exercício na devida foi cortado não aparece', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'bar', nome: 'Barra Fixa', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
    ];

    expect(gruposNegligenciados(semana, {}, HOJE, { seg: ['bar'] })).toEqual([]);
  });

  it('saída respeita a ordem de aparição (sessões na ordem, exercícios por exerciseOrder)', () => {
    const semana = [
      sessao({
        id: 'seg',
        data: '2020-01-05',
        exercicios: [
          ex({ id: 'sup', nome: 'Supino', grupo: 'Peito', prioridade: 'primary', ordem: 1, series: 4 }),
        ],
      }),
      sessao({
        id: 'qua',
        data: '2020-01-06',
        exercicios: [
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
          ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 1, series: 2 }),
        ],
      }),
    ];

    const negligenciados = gruposNegligenciados(semana, {}, HOJE);
    // Ordem de aparição = ordem das sessões e, dentro delas, exerciseOrder
    // (não a ordem do array): 'rem' vem antes de 'ros' no array, mas tem ordem 2.
    expect(negligenciados.map((n) => n.grupo)).toEqual(['Peito', 'Bíceps', 'Costas']);
  });
});

describe('promoverPrimarioDoGrupo', () => {
  const negligenciado = (grupo: string, seriesPlanejadas: number): GrupoNegligenciado => ({
    grupo,
    seriesPlanejadas,
  });

  it('propõe o primário para logo depois do prefixo de abertura (invariante 4)', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        aquecimento(1),
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 2, series: 2 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 3, series: 4 }),
        ex({ id: 'tri', nome: 'Tríceps Corda', grupo: 'Tríceps', prioridade: 'accessory', ordem: 4, series: 2 }),
      ],
    });

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)]);

    expect(proposta).not.toBeNull();
    expect(proposta!.exercicio.id).toBe('rem');
    // Destino = FIM do prefixo de abertura: o aquecimento continua primeiro.
    expect(proposta!.ordemProposta).toEqual(['aq1', 'rem', 'ros', 'tri']);
    expect(proposta!.outrosGrupos).toEqual([]);
  });

  it('Tríceps acessório com métrica de carga NÃO faz parte do prefixo de abertura', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        aquecimento(1),
        ex({ id: 'tri', nome: 'Tríceps Corda', grupo: 'Tríceps', prioridade: 'accessory', ordem: 2, series: 2 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 3, series: 4 }),
      ],
    });

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)]);

    // Prefixo = só o aquecimento (o tríceps é acessório, mas medido por carga).
    expect(proposta!.ordemProposta).toEqual(['aq1', 'rem', 'tri']);
  });

  it('sem prefixo de abertura, o destino é o índice 0', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 1, series: 2 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
      ],
    });

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)]);

    expect(proposta!.ordemProposta).toEqual(['rem', 'ros']);
  });

  it('prefixo longo de abertura recebe o primário depois de TODOS os acessórios de tempo', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        aquecimento(1),
        aquecimento(2),
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 3, series: 2 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 4, series: 4 }),
      ],
    });

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)]);

    expect(proposta!.ordemProposta).toEqual(['aq1', 'aq2', 'rem', 'ros']);
  });

  it('primário já no lugar (índice 0 sem prefixo) → null (invariante 5)', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 2, series: 2 }),
      ],
    });

    expect(promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)])).toBeNull();
  });

  it('primário já no lugar (primeiro depois do aquecimento) → null (invariante 5)', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        aquecimento(1),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 3, series: 2 }),
      ],
    });

    expect(promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)])).toBeNull();
  });

  it('sessão sem exercício primário do grupo → null (invariante 7)', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'primary', ordem: 1, series: 2 }),
        ex({ id: 'pul', nome: 'Pulley', grupo: 'Costas', prioridade: 'secondary', ordem: 2, series: 3 }),
      ],
    });

    expect(promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)])).toBeNull();
  });

  it('grupo de maior volume SEM primário na sessão é pulado — o Nível 3 tenta o próximo (achado nº 6 do review 67)', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        // Core tem o MAIOR volume da semana, mas aqui só existe como acessório
        // (prancha) — não há primário de core para promover.
        ex({ id: 'pra', nome: 'Prancha', grupo: 'Core', prioridade: 'accessory', ordem: 1, series: 3 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
      ],
    });

    const negligenciados = [
      negligenciado('Core', 9),
      negligenciado('Costas', 8),
    ];

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, negligenciados);

    // Costas (com primário) é promovido — o grupo de aquecimento não desliga a feature.
    expect(proposta).not.toBeNull();
    expect(proposta!.exercicio.id).toBe('rem');
    expect(proposta!.ordemProposta).toEqual(['rem', 'pra']);
  });

  it('NENHUM candidato com primário na sessão → null (mesmo com grupo de volume alto)', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'pra', nome: 'Prancha', grupo: 'Core', prioridade: 'accessory', ordem: 1, series: 3 }),
        ex({ id: 'pon', nome: 'Ponte', grupo: 'Glúteos', prioridade: 'accessory', ordem: 2, series: 2 }),
      ],
    });

    expect(
      promoverPrimarioDoGrupo(sessaoAlvo, [
        negligenciado('Core', 9),
        negligenciado('Glúteos', 7),
      ]),
    ).toBeNull();
  });

  it('empate de volume entre candidatos com primário mantém ordem de aparição', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'sup', nome: 'Supino', grupo: 'Peito', prioridade: 'primary', ordem: 1, series: 4 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
      ],
    });

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, [
      negligenciado('Costas', 6),
      negligenciado('Peito', 6),
    ]);

    // Empate: quem aparece primeiro nos negligenciados vence (Costas).
    expect(proposta!.exercicio.id).toBe('rem');
  });

  it('sessão de deload → null (não mexe em semana de recuperação)', () => {
    const sessaoDeload = {
      ...sessao({
        id: 'qui',
        data: '2020-01-09',
        exercicios: [
          ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 1, series: 2 }),
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
        ],
      }),
      title: 'Deload A',
    };

    expect(promoverPrimarioDoGrupo(sessaoDeload, [negligenciado('Costas', 7)])).toBeNull();
  });

  it('sessão com um único exercício → null', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 1, series: 4 }),
      ],
    });

    expect(promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)])).toBeNull();
  });

  it('um grupo por sessão: maior volume planejado ganha; demais vão para outrosGrupos', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        aquecimento(1),
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'primary', ordem: 2, series: 2 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 3, series: 4 }),
      ],
    });

    const negligenciados = [
      negligenciado('Bíceps', 6),
      negligenciado('Costas', 10),
    ];

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, negligenciados);

    expect(proposta!.exercicio.id).toBe('rem');
    expect(proposta!.ordemProposta).toEqual(['aq1', 'rem', 'ros']);
    expect(proposta!.outrosGrupos).toEqual([{ grupo: 'Bíceps', seriesPlanejadas: 6 }]);
  });

  it('empate de volume planejado → ordem de aparição nos negligenciados', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'primary', ordem: 1, series: 2 }),
        ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
      ],
    });

    const negligenciados = [
      negligenciado('Costas', 6),
      negligenciado('Bíceps', 6),
    ];

    const proposta = promoverPrimarioDoGrupo(sessaoAlvo, negligenciados);

    expect(proposta!.exercicio.id).toBe('rem');
    expect(proposta!.outrosGrupos).toEqual([{ grupo: 'Bíceps', seriesPlanejadas: 6 }]);
  });

  it('grupo negligenciado que a sessão NÃO treina não é candidato; nenhum candidato → null', () => {
    const sessaoAlvo = sessao({
      id: 'qui',
      data: '2020-01-09',
      exercicios: [
        ex({ id: 'sup', nome: 'Supino', grupo: 'Peito', prioridade: 'primary', ordem: 1, series: 4 }),
      ],
    });

    expect(
      promoverPrimarioDoGrupo(sessaoAlvo, [negligenciado('Costas', 7)]),
    ).toBeNull();
  });

  it('invariantes: permutação exata, movimento único, sessão de entrada intocada', () => {
    const cenarios: ReplanSession[] = [
      sessao({
        id: 'q1',
        data: '2020-01-09',
        exercicios: [
          aquecimento(1),
          ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'secondary', ordem: 2, series: 2 }),
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 3, series: 4 }),
        ],
      }),
      sessao({
        id: 'q2',
        data: '2020-01-09',
        exercicios: [
          ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'primary', ordem: 1, series: 2 }),
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 4 }),
          ex({ id: 'tri', nome: 'Tríceps', grupo: 'Tríceps', prioridade: 'accessory', ordem: 3, series: 2 }),
        ],
      }),
      sessao({
        id: 'q3',
        data: '2020-01-09',
        exercicios: [
          aquecimento(1),
          aquecimento(2),
          ex({ id: 'ros', nome: 'Rosca', grupo: 'Bíceps', prioridade: 'primary', ordem: 3, series: 2 }),
          ex({ id: 'rem', nome: 'Remada Curvada', grupo: 'Costas', prioridade: 'primary', ordem: 4, series: 4 }),
          ex({ id: 'tri', nome: 'Tríceps', grupo: 'Tríceps', prioridade: 'accessory', ordem: 5, series: 2 }),
        ],
      }),
    ];

    for (const alvo of cenarios) {
      const original = alvo.exercises.map((e) => ({ ...e, sets: [...e.sets] }));
      const idsOriginais = idsDe(alvo.exercises);
      const proposta = promoverPrimarioDoGrupo(alvo, [negligenciado('Costas', 7)]);

      expect(proposta).not.toBeNull();

      // Invariante 1: permutação EXATA — mesmos ids, mesma quantidade, sem repetição.
      expect(proposta!.ordemProposta).toHaveLength(idsOriginais.length);
      expect([...proposta!.ordemProposta].sort()).toEqual([...idsOriginais].sort());
      expect(new Set(proposta!.ordemProposta).size).toBe(idsOriginais.length);

      // Invariante 3: movimento único — igual a moveItem(from, destino do prefixo).
      const destino = alvo.exercises.findIndex(
        (e) => e.priority !== 'accessory' || e.metric !== 'tempo',
      );
      const origem = alvo.exercises.findIndex((e) => e.id === proposta!.exercicio.id);
      expect(proposta!.ordemProposta).toEqual(moveItem(idsOriginais, origem, destino));

      // O motor não muta a entrada (volume intocado, invariante 2).
      expect(alvo.exercises.map((e) => ({ ...e, sets: [...e.sets] }))).toEqual(original);
    }
  });
});

describe('excluirSessaoId — a sessão em exibição sai das DEVIDAS, não do molde', () => {
  // A sessão aberta agora não pode se declarar "de fora" (achado nº 5), mas o
  // volume planejado continua sendo o da semana INTEIRA: é ele que desempata
  // qual grupo a sessão promove. Filtrar a sessão da entrada inteira mudava o
  // desempate — sintoma diferente do que o filtro queria corrigir.
  const perdida = sessao({
    id: 'seg',
    data: '2020-01-05',
    exercicios: [
      ex({ id: 'p1', nome: 'Supino', grupo: 'Peito', prioridade: 'primary', ordem: 1, series: 2 }),
      ex({ id: 'p2', nome: 'Puxada', grupo: 'Costas', prioridade: 'primary', ordem: 2, series: 5 }),
    ],
  });
  const exibida = sessao({
    id: 'hoje',
    data: '2020-01-07',
    exercicios: [
      aquecimento(1),
      ex({ id: 'ag', nome: 'Agachamento', grupo: 'Perna', prioridade: 'primary', ordem: 2, series: 2 }),
      ex({ id: 'h1', nome: 'Remada', grupo: 'Costas', prioridade: 'primary', ordem: 3, series: 2 }),
      ex({ id: 'h2', nome: 'Supino Inclinado', grupo: 'Peito', prioridade: 'primary', ordem: 4, series: 6 }),
    ],
  });

  it('a sessão excluída não aparece entre os negligenciados', () => {
    const negl = gruposNegligenciados([perdida, exibida], {}, HOJE, undefined, undefined, 'hoje');
    // Perna e o aquecimento só existem na sessão exibida: não são "falta".
    expect(negl.map((n) => n.grupo).sort()).toEqual(['Costas', 'Peito']);
  });

  it('mas o volume planejado continua contando a semana inteira (inclusive a exibida)', () => {
    const negl = gruposNegligenciados([perdida, exibida], {}, HOJE, undefined, undefined, 'hoje');
    const porGrupo = Object.fromEntries(negl.map((n) => [n.grupo, n.seriesPlanejadas]));
    expect(porGrupo).toEqual({ Peito: 8, Costas: 7 });

    // E o desempate por volume leva ao MESMO grupo que o molde inteiro indica.
    const proposta = promoverPrimarioDoGrupo(exibida, negl);
    expect(proposta!.grupo).toBe('Peito');
    expect(proposta!.exercicio.name).toBe('Supino Inclinado');
  });

  it('sem excluirSessaoId o comportamento antigo segue intacto (nenhum chamador quebra)', () => {
    const negl = gruposNegligenciados([perdida, exibida], {}, HOJE);
    expect(negl.map((n) => n.grupo)).toContain('Perna');
  });

  it('sessão exibida sozinha na semana: nada a propor sobre ela mesma', () => {
    const negl = gruposNegligenciados([exibida], {}, HOJE, undefined, undefined, 'hoje');
    expect(negl).toHaveLength(0);
    expect(promoverPrimarioDoGrupo(exibida, negl)).toBeNull();
  });
});
