// __tests__/scheduleShift.test.ts
// Testes do módulo de reancoragem semanal.

import {
  precisaReancorar,
  reancorarSemana,
  type SessaoParaReancorar,
  type PlanoDeReancoragem,
} from '../src/engine/scheduleShift';

// Data de referência: semana 27/07/2026 (seg) a 02/08/2026 (dom)
const SEGUNDA_SEMANA = '2026-07-27';

/** Cria uma sessão de teste com valores padrão. */
const criarSessao = (overrides?: Partial<SessaoParaReancorar>): SessaoParaReancorar => ({
  id: Math.random().toString(36).substring(7),
  status: 'pending',
  scheduledDate: null,
  orderInWeek: 1,
  ...overrides,
});

describe('precisaReancorar', () => {
  it('retorna true quando existe pendente com data anterior a hoje', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27', // segunda da semana
      }),
    ];
    const resultado = precisaReancorar(sessoes, '2026-07-28'); // hoje é terça
    expect(resultado).toBe(true);
  });

  it('retorna false quando pendentes estão no futuro', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-29', // quarta
      }),
    ];
    const resultado = precisaReancorar(sessoes, '2026-07-28'); // hoje é terça
    expect(resultado).toBe(false);
  });

  it('retorna false quando não há pendentes', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        status: 'completed',
        scheduledDate: '2026-07-27',
      }),
    ];
    const resultado = precisaReancorar(sessoes, '2026-07-28');
    expect(resultado).toBe(false);
  });

  it('retorna false quando pendentes não têm data', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: null,
      }),
    ];
    const resultado = precisaReancorar(sessoes, '2026-07-28');
    expect(resultado).toBe(false);
  });

  it('ignora data malformada e não lança', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: 'data-invalida',
      }),
    ];
    const resultado = precisaReancorar(sessoes, '2026-07-28');
    expect(resultado).toBe(false);
  });
});

describe('reancorarSemana', () => {
  it('caso típico de atraso: 5 pendentes caem nos slots da semana, incl. sábado', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-28', // terça
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-29', // quarta
        orderInWeek: 3,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-30', // quinta
        orderInWeek: 4,
      }),
      criarSessao({
        id: 's5',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 5,
      }),
    ];

    // Agenda: segunda a sexta (0, 1, 2, 3, 4)
    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-28'; // hoje é terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots disponíveis: terça (28), quarta (29), quinta (30), sexta (31), sábado (01)
    // s1 (seg) → ter; s2 (ter) → qua; s3 (qua) → qui; s4 (qui) → sex; s5 (sex) → sáb
    expect(resultado.movidas.length).toBe(5);
    expect(resultado.mantidas.length).toBe(0);
    expect(resultado.semEncaixe).toEqual([]);

    // Verifica as datas das movidas
    const movida1 = resultado.movidas.find((m) => m.id === 's1');
    expect(movida1?.para).toBe('2026-07-28'); // terça

    const movida5 = resultado.movidas.find((m) => m.id === 's5');
    expect(movida5?.para).toBe('2026-08-01'); // sábado, fora da agenda
  });

  it('fim de semana absorve o que cabe; o excesso vira semEncaixe', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-31', // sexta
        status: 'completed',
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 3,
      }),
      criarSessao({
        id: 's5',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 4,
      }),
    ];

    // Agenda: segunda a sexta (sem fim de semana marcado)
    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-08-01'; // hoje é sábado
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // O fim de semana é janela de conclusão garantida: sábado (01) e domingo (02)
    // absorvem as duas primeiras atrasadas; só o excesso (4 pendentes - 2 slots)
    // fica sem encaixe. Antes do fix, sáb/dom eram ignorados e as 4 iam para
    // semEncaixe (o bug do trigger: banner Nível 2 com fim de semana em aberto).
    expect(resultado.movidas.length).toBe(2);
    expect(resultado.mantidas.length).toBe(0);
    expect(resultado.semEncaixe).toEqual(['s4', 's5']);

    const movida2 = resultado.movidas.find((m) => m.id === 's2');
    expect(movida2?.para).toBe('2026-08-01'); // sábado

    const movida3 = resultado.movidas.find((m) => m.id === 's3');
    expect(movida3?.para).toBe('2026-08-02'); // domingo
  });

  it('regressão do trigger: sábado em aberto e atrasadas na semana → reancoram para sáb/dom, sem semEncaixe', () => {
    // Cenário do bug reportado: a pessoa não treinou nos dias marcados da
    // semana (seg-sex) e o fim de semana ainda está aberto. Antes do fix,
    // sáb/dom ficavam de fora dos slots e o Nível 2 "A semana fecha com menos
    // volume" disparava mesmo com o fim de semana disponível. Agora o fim de
    // semana inteiro é janela de conclusão garantida.
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-28', // terça (atrasada)
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-29', // quarta (atrasada)
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-30', // quinta (atrasada)
        orderInWeek: 3,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-31', // sexta (atrasada)
        orderInWeek: 4,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-08-01'; // hoje é sábado
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // 4 atrasadas, 2 slots de fim de semana: 2 reancoram e 2 excedem a janela.
    expect(resultado.semEncaixe).toEqual(['s3', 's4']);
    expect(resultado.movidas).toEqual([
      { id: 's1', de: '2026-07-28', para: '2026-08-01' },
      { id: 's2', de: '2026-07-29', para: '2026-08-02' },
    ]);
  });

  it('slot ocupado por sessão fixa não é reatribuído', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-28', // terça
        status: 'completed', // fixa
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-27', // segunda (atraso)
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-29', // quarta
        orderInWeek: 2,
      }),
    ];

    const agenda = [0, 1, 2] as const;
    const hojeISO = '2026-07-28';
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots disponíveis: quarta (29), sábado (01), domingo (02)
    // - segunda (27) está no passado
    // - terça (28) está ocupada por s1 (completed)
    // Logo: s2 → quarta; s3 → sábado (fim de semana é janela de conclusão)
    expect(resultado.movidas.length).toBe(2);
    expect(resultado.semEncaixe.length).toBe(0);

    const movida2 = resultado.movidas.find((m) => m.id === 's2');
    expect(movida2?.para).toBe('2026-07-29'); // quarta

    const movida3 = resultado.movidas.find((m) => m.id === 's3');
    expect(movida3?.para).toBe('2026-08-01'); // sábado, fora da agenda
    expect(resultado.semEncaixe).toEqual([]);
  });

  it('nunca antecipa: pendentes no futuro mantêm suas datas', () => {
    // Teste que verifica que pendentes com data no futuro NÃO são antecipadas
    // mesmo quando há slots livres antes delas.
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-29', // quarta originalmente
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-30', // quinta originalmente
        orderInWeek: 2,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-28'; // terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots: terça (28), quarta (29), quinta (30), sexta (31)
    // Pisos: s1 piso=29 (sua data >= hoje), s2 piso=30
    // s1 com piso 29 → primeiro slot >= 29 é quarta (29) → mantida
    // s2 com piso 30 → primeiro slot >= 30 é quinta (30) → mantida
    // NADA é antecipado, mesmo com terça (28) livre!
    expect(resultado.movidas.length).toBe(0);
    expect(resultado.mantidas).toEqual(['s1', 's2']);
    expect(resultado.semEncaixe.length).toBe(0);
  });

  it('agenda vazia: no-op', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27',
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-28',
        orderInWeek: 2,
      }),
    ];

    const agenda: readonly number[] = [];
    const resultado = reancorarSemana({
      sessoes,
      hojeISO: '2026-07-28',
      agenda: agenda as readonly any[],
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    expect(resultado.movidas.length).toBe(0);
    expect(resultado.mantidas).toEqual(['s1', 's2']);
    expect(resultado.semEncaixe.length).toBe(0);
  });

  it('datas duplicadas: sem repetição na saída', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 3,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 4,
      }),
      criarSessao({
        id: 's5',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 5,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-28'; // terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // 5 pendentes, 5 slots (terça a sábado): todas as 5 movidas, nenhuma semEncaixe
    expect(resultado.movidas.length).toBe(5);
    expect(resultado.semEncaixe.length).toBe(0);

    // Verifica que não há datas repetidas nas movidas
    const datas = resultado.movidas.map((m) => m.para);
    const datasUnicas = new Set(datas);
    expect(datasUnicas.size).toBe(datas.length);
  });

  it('ordem preservada: primeira sessão da fila recebe primeiro slot', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27', // segunda
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-28', // terça
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-29', // quarta
        orderInWeek: 3,
      }),
    ];

    const agenda = [0, 1, 2] as const;
    const hojeISO = '2026-07-28'; // terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots: terça (28), quarta (29), sábado (01)
    // s1 → terça (primeiro slot)
    // s2 → quarta (segundo slot)
    // s3 → sábado (terceiro slot, fim de semana é janela de conclusão)
    expect(resultado.movidas[0]?.id).toBe('s1');
    expect(resultado.movidas[0]?.para).toBe('2026-07-28');
    expect(resultado.movidas[1]?.id).toBe('s2');
    expect(resultado.movidas[1]?.para).toBe('2026-07-29');
    expect(resultado.movidas[2]?.id).toBe('s3');
    expect(resultado.movidas[2]?.para).toBe('2026-08-01');
    expect(resultado.semEncaixe).toEqual([]);
  });

  it('sessões não pendentes nunca aparecem nas listas de saída', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27',
        status: 'completed',
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-28',
        status: 'skipped',
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-29',
        status: 'in_progress',
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-30',
        status: 'pending',
        orderInWeek: 1,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const resultado = reancorarSemana({
      sessoes,
      hojeISO: '2026-07-28',
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    const todasAsIds = [
      ...resultado.movidas.map((m) => m.id),
      ...resultado.mantidas,
      ...resultado.semEncaixe,
    ];
    expect(todasAsIds).not.toContain('s1');
    expect(todasAsIds).not.toContain('s2');
    expect(todasAsIds).not.toContain('s3');
    expect(todasAsIds).toContain('s4');
  });

  it('data malformada na sessão não causa erro', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: 'data-ruim',
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-30',
        orderInWeek: 2,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    expect(() => {
      reancorarSemana({
        sessoes,
        hojeISO: '2026-07-28',
        agenda,
        segundaDaSemanaISO: SEGUNDA_SEMANA,
      });
    }).not.toThrow();
  });

  it('deduplica offsets: agenda [0, 1, 0, 2, 1, 3]', () => {
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27',
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-28',
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-29',
        orderInWeek: 3,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-30',
        orderInWeek: 4,
      }),
    ];

    // Agenda com duplicatas: [0, 1, 0, 2, 1, 3]
    // Deve resultar em slots: segunda, terça, quarta, quinta, sábado, domingo
    // (deduplicado e ordenado, com o fim de semana sempre presente)
    const agenda = [0, 1, 0, 2, 1, 3] as any[];
    const resultado = reancorarSemana({
      sessoes,
      hojeISO: '2026-07-28',
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots: terça (28), quarta (29), quinta (30), sábado (01) (segunda pulada porque no passado)
    expect(resultado.movidas.length).toBe(4);
    expect(resultado.semEncaixe.length).toBe(0);
  });

  it('sem atraso, nada se move: pendentes no futuro permanecem no futuro', () => {
    // Hoje é terça. Três pendentes em quarta, quinta, sexta.
    // Nenhuma foi atrasada, então nenhuma deve se mover.
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-29', // quarta
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-30', // quinta
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 3,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-28'; // terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Nenhuma sessão foi atrasada. Todas têm piso >= sua data.
    // Logo: movidas vazio, mantidas = [s1, s2, s3], semEncaixe vazio.
    expect(resultado.movidas.length).toBe(0);
    expect(resultado.mantidas).toEqual(['s1', 's2', 's3']);
    expect(resultado.semEncaixe.length).toBe(0);
  });

  it('uma atrasada empurra só o necessário: sede/quarta/quinta/sexta', () => {
    // Hoje é terça. Uma em segunda (atrasada), outra em quarta, quinta, sexta.
    // A atrasada empurra para terça, e as demais deslizam se necessário.
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's_atrasada',
        scheduledDate: '2026-07-27', // segunda (atrasada)
        orderInWeek: 0,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-29', // quarta
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-30', // quinta
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 3,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-28'; // terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots: [terça (28), quarta (29), quinta (30), sexta (31)]
    // Pisos: atrasada piso=28, s2 piso=29, s3 piso=30, s4 piso=31
    // atrasada (piso 28) → 1º slot >= 28 é terça (28) → movida (seg→ter)
    // s2 (piso 29) → 1º slot >= 29 é quarta (29) → mantida
    // s3 (piso 30) → 1º slot >= 30 é quinta (30) → mantida
    // s4 (piso 31) → 1º slot >= 31 é sexta (31) → mantida
    expect(resultado.movidas.length).toBe(1);
    expect(resultado.movidas[0]?.id).toBe('s_atrasada');
    expect(resultado.movidas[0]?.de).toBe('2026-07-27');
    expect(resultado.movidas[0]?.para).toBe('2026-07-28');
    expect(resultado.mantidas).toEqual(expect.arrayContaining(['s2', 's3', 's4']));
    expect(resultado.semEncaixe.length).toBe(0);
  });

  it('fila espremida: múltiplas atrasadas empurram até o fim de semana', () => {
    // Hoje é quarta. Pendentes em segunda, terça, quarta, quinta, sexta.
    // Segunda e terça estão atrasadas (pisos 29).
    // Quarta tem piso=29. Quinta tem piso=30. Sexta tem piso=31.
    // Com slots [quarta (29), quinta (30), sexta (31), sábado (01), domingo (02)],
    // todas cabem: o fim de semana absorve o que sobra dos dias da agenda.
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's1',
        scheduledDate: '2026-07-27', // segunda (atrasada)
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's2',
        scheduledDate: '2026-07-28', // terça (atrasada)
        orderInWeek: 2,
      }),
      criarSessao({
        id: 's3',
        scheduledDate: '2026-07-29', // quarta (hoje, não é atrasada)
        orderInWeek: 3,
      }),
      criarSessao({
        id: 's4',
        scheduledDate: '2026-07-30', // quinta
        orderInWeek: 4,
      }),
      criarSessao({
        id: 's5',
        scheduledDate: '2026-07-31', // sexta
        orderInWeek: 5,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-29'; // quarta
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots: [quarta (29), quinta (30), sexta (31), sábado (01), domingo (02)]
    // Pisos: s1 piso=29, s2 piso=29, s3 piso=29, s4 piso=30, s5 piso=31
    // s1 (piso 29) → quarta (29) [movida de segunda]
    // s2 (piso 29) → quinta (30) [movida de terça]
    // s3 (piso 29) → sexta (31) [movida de quarta]
    // s4 (piso 30) → sábado (01) [movida de quinta]
    // s5 (piso 31) → domingo (02) [movida de sexta]
    expect(resultado.movidas.length).toBe(5);
    expect(resultado.semEncaixe).toEqual([]);
  });

  it('sufixo de hora não quebra comparação: completed com T00:00:00', () => {
    // Uma sessão completed tem suffixo de hora (T00:00:00).
    // Sem normalização, seria "2026-07-29T00:00:00" vs slot "2026-07-29".
    // Comparação string falharia, slot erroneamente ficaria disponível,
    // duas sessões na mesma data. Com normalização, deve ocluir corretamente.
    const sessoes: SessaoParaReancorar[] = [
      criarSessao({
        id: 's_completed',
        scheduledDate: '2026-07-29T00:00:00', // quarta com sufixo de hora
        status: 'completed',
      }),
      criarSessao({
        id: 's_pending',
        scheduledDate: '2026-07-27', // segunda (atrasada)
        orderInWeek: 1,
      }),
      criarSessao({
        id: 's_pending2',
        scheduledDate: '2026-07-28', // terça (atrasada)
        orderInWeek: 2,
      }),
    ];

    const agenda = [0, 1, 2, 3, 4] as const;
    const hojeISO = '2026-07-28'; // terça
    const resultado = reancorarSemana({
      sessoes,
      hojeISO,
      agenda,
      segundaDaSemanaISO: SEGUNDA_SEMANA,
    });

    // Slots disponíveis (normalizados): [terça (28), quinta (30), sexta (31)]
    // (quarta (29) é ocupada por s_completed, mesmo com sufixo)
    // Pisos: s_pending piso=28, s_pending2 piso=28
    // s_pending (piso 28) → terça (28) [movida de segunda]
    // s_pending2 (piso 28) → quinta (30) [movida de terça, pulando quarta ocupada]
    const movida1 = resultado.movidas.find((m) => m.id === 's_pending');
    expect(movida1?.para).toBe('2026-07-28'); // terça
    const movida2 = resultado.movidas.find((m) => m.id === 's_pending2');
    expect(movida2?.para).toBe('2026-07-30'); // quinta (quarta está ocupada)
  });
});
