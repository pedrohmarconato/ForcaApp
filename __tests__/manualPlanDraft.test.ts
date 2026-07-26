// Rascunho do plano manual — modos de falha cobertos:
// - fechar o app no meio da edição não pode perder o trabalho;
// - rascunho de outro usuário nunca pode ser carregado pela mesma chave;
// - JSON corrompido/versão desconhecida não vira um plano plausível;
// - limpar após sucesso remove somente o rascunho daquele usuário.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearManualPlanDraft,
  loadManualPlanDraft,
  saveManualPlanDraft,
} from '../src/services/manualPlanDraftStorage';
import { createEmptyManualPlanDraft } from '../src/types/manualPlan';

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

  it('limpa só a chave do usuário após salvar com sucesso', async () => {
    await saveManualPlanDraft('user-1', createEmptyManualPlanDraft());
    await saveManualPlanDraft('user-2', createEmptyManualPlanDraft());

    await clearManualPlanDraft('user-1');

    await expect(loadManualPlanDraft('user-1')).resolves.toBeNull();
    await expect(loadManualPlanDraft('user-2')).resolves.not.toBeNull();
  });
});
