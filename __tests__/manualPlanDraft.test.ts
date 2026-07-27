// Rascunho do plano manual — modos de falha cobertos:
// - fechar o app no meio da edição não pode perder o trabalho;
// - rascunho de outro usuário nunca pode ser carregado pela mesma chave;
// - JSON corrompido/versão desconhecida não vira um plano plausível;
// - limpar após sucesso remove somente o rascunho daquele usuário.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearManualPlanDraft,
  loadManualPlanDraft,
  readManualPlanDraft,
  saveManualPlanDraft,
} from '../src/services/manualPlanDraftStorage';
import {
  createEmptyManualPlanDraft,
  formatWorkDuration,
} from '../src/types/manualPlan';

const mockMemory = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockMemory.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockMemory.delete(key);
  }),
}));

describe('manualPlanDraftStorage', () => {
  beforeEach(() => {
    mockMemory.clear();
    jest.clearAllMocks();
  });

  it('serializa e retoma o rascunho completo por usuário', async () => {
    const draft = createEmptyManualPlanDraft();
    draft.nome = 'Plano que levou vinte minutos';
    draft.treinos.push({
      nome: 'Treino A',
      dia_offset: 0,
      duracao_minutos: 55,
      incluir_aquecimento: true,
      incluir_alongamento: false,
      exercicios: [],
    });

    await saveManualPlanDraft('user-1', draft);

    await expect(loadManualPlanDraft('user-1')).resolves.toEqual(draft);
    await expect(loadManualPlanDraft('user-2')).resolves.toBeNull();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@manual_plan_draft_user-1',
      expect.stringContaining('Plano que levou vinte minutos'),
    );
  });

  it('ignora conteúdo corrompido e versão desconhecida', async () => {
    mockMemory.set('@manual_plan_draft_user-1', '{quebrado');
    await expect(loadManualPlanDraft('user-1')).resolves.toBeNull();

    mockMemory.set(
      '@manual_plan_draft_user-1',
      JSON.stringify({ version: 99, draft: createEmptyManualPlanDraft() }),
    );
    await expect(loadManualPlanDraft('user-1')).resolves.toBeNull();

    mockMemory.set(
      '@manual_plan_draft_user-1',
      JSON.stringify({
        version: 1,
        draft: {
          ...createEmptyManualPlanDraft(),
          treinos: [{ nome: 'parece válido, mas perdeu os campos do contrato' }],
        },
      }),
    );
    await expect(loadManualPlanDraft('user-1')).resolves.toBeNull();
  });

  it('duração decimal é arredondada em vez de invalidar o rascunho inteiro', async () => {
    // Um build anterior aceitava "37,5" no campo de estimativa. Na releitura o
    // rascunho inteiro era rejeitado e o store gravava um plano VAZIO por cima:
    // horas de trabalho sumiam sem mensagem nenhuma.
    const draft = createEmptyManualPlanDraft();
    draft.treinos.push({
      nome: 'Treino A',
      dia_offset: 0,
      duracao_minutos: 37.5 as unknown as number,
      incluir_aquecimento: false,
      incluir_alongamento: false,
      exercicios: [],
    });
    await AsyncStorage.setItem(
      '@manual_plan_draft_user-1',
      JSON.stringify({ version: 1, draft }),
    );

    const recuperado = await loadManualPlanDraft('user-1');
    expect(recuperado).not.toBeNull();
    expect(recuperado?.treinos[0].duracao_minutos).toBe(38);
  });

  it('bytes ilegíveis são sinalizados para não virarem apagamento silencioso', async () => {
    await AsyncStorage.setItem('@manual_plan_draft_user-1', '{isto não é json');

    const resultado = await readManualPlanDraft('user-1');
    expect(resultado.draft).toBeNull();
    expect(resultado.hadStoredBytes).toBe(true);

    const semNada = await readManualPlanDraft('user-2');
    expect(semNada.draft).toBeNull();
    expect(semNada.hadStoredBytes).toBe(false);
  });

  it('limpa só a chave do usuário após salvar com sucesso', async () => {
    await saveManualPlanDraft('user-1', createEmptyManualPlanDraft());
    await saveManualPlanDraft('user-2', createEmptyManualPlanDraft());

    await clearManualPlanDraft('user-1');

    await expect(loadManualPlanDraft('user-1')).resolves.toBeNull();
    await expect(loadManualPlanDraft('user-2')).resolves.not.toBeNull();
  });
});

describe('formatWorkDuration', () => {
  it('mostra segundos abaixo de um minuto e minutos acima', () => {
    // O contrato guarda minutos (0,75 = 45 s) porque é assim que o expansor
    // trabalha. Exibir "0,75 min" transformaria prescrição correta em ruído.
    expect(formatWorkDuration(0.75)).toBe('45 s');
    expect(formatWorkDuration(0.5)).toBe('30 s');
    expect(formatWorkDuration(1)).toBe('1 min');
    expect(formatWorkDuration(15.8)).toBe('15,8 min');
    expect(formatWorkDuration(20)).toBe('20 min');
    expect(formatWorkDuration(null)).toBeNull();
    expect(formatWorkDuration(0)).toBeNull();
  });
});
