// __tests__/exerciseCatalogService.test.ts
// Modos de falha cobertos:
// - busca precisa ignorar acentos e caixa sem depender dos aliases do backend;
// - filtros opcionais de cardio/mobilidade não podem esconder musculação;
// - catálogo em cache mantém o editor útil durante queda de rede;
// - sem rede E sem cache é indisponibilidade explícita, nunca lista vazia.

import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../src/services/api/apiClient';
import {
  ExerciseCatalogUnavailableError,
  getCatalog,
  resolveExerciseName,
  searchCatalog,
  type CatalogEntry,
} from '../src/services/exerciseCatalogService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => null),
}));

jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  ENDPOINTS: {
    EXERCISE_CATALOG: '/exercise-catalog',
    EXERCISE_CATALOG_RESOLVE: '/exercise-catalog/resolve',
  },
}));

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedSetItem = AsyncStorage.setItem as jest.Mock;
const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;

const entries: CatalogEntry[] = [
  {
    chave: 'supino_reto_barra',
    nome: 'Supino Reto com Barra',
    grupo_muscular: 'Peito',
    equipamento: 'Barra',
    peso_corporal: false,
    incremento_kg: 2.5,
    metrica: 'carga_reps',
  },
  {
    chave: 'elevacao_lateral',
    nome: 'Elevação Lateral com Halteres',
    grupo_muscular: 'Ombros',
    equipamento: 'Halteres',
    peso_corporal: false,
    incremento_kg: 1,
    metrica: 'carga_reps',
  },
  {
    chave: 'caminhada',
    nome: 'Caminhada',
    grupo_muscular: 'Cardio',
    equipamento: 'Peso corporal',
    peso_corporal: true,
    incremento_kg: 2.5,
    metrica: 'tempo_distancia',
  },
  {
    chave: 'alongamento_dinamico',
    nome: 'Alongamento Dinâmico',
    grupo_muscular: 'Mobilidade',
    equipamento: 'Peso corporal',
    peso_corporal: true,
    incremento_kg: 2.5,
    metrica: 'tempo',
  },
];

describe('exerciseCatalogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockResolvedValue(null);
    mockedSetItem.mockResolvedValue(null);
  });

  it('busca por nome normalizado, sem acento e sem diferença de caixa', () => {
    expect(searchCatalog('supino', entries, {
      incluirCardio: true,
      incluirMobilidade: true,
    }).map((item) => item.chave)).toEqual(['supino_reto_barra']);

    expect(searchCatalog('ELEVACAO', entries, {
      incluirCardio: true,
      incluirMobilidade: true,
    }).map((item) => item.chave)).toEqual(['elevacao_lateral']);
  });

  it('filtra cardio, mobilidade, grupo e equipamento sem alterar a fonte', () => {
    expect(searchCatalog('', entries, {
      incluirCardio: false,
      incluirMobilidade: false,
    }).map((item) => item.chave)).toEqual([
      'supino_reto_barra',
      'elevacao_lateral',
    ]);

    expect(searchCatalog('', entries, {
      incluirCardio: true,
      incluirMobilidade: true,
      grupo: 'ombros',
      equipamento: 'halteres',
    }).map((item) => item.chave)).toEqual(['elevacao_lateral']);
    expect(entries).toHaveLength(4);
  });

  it('devolve o cache versionado quando a rede falha na revalidação', async () => {
    mockedGetItem.mockImplementation(async (key: string) => {
      if (key === '@exercise_catalog_meta') {
        return JSON.stringify({ versao: 2, etag: '"catalogo-v2-abc"' });
      }
      if (key === '@exercise_catalog_v2') {
        return JSON.stringify({ versao: 2, exercicios: entries });
      }
      return null;
    });
    mockedGet.mockRejectedValue(new Error('rede caiu'));

    await expect(getCatalog()).resolves.toEqual(entries);
    expect(mockedGet).toHaveBeenCalledWith('/exercise-catalog', expect.objectContaining({
      headers: { 'If-None-Match': '"catalogo-v2-abc"' },
    }));
  });

  it('grava resposta da API na chave versionada e guarda o ETag', async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: { versao: 2, exercicios: entries },
      headers: { etag: '"catalogo-v2-abc"' },
    });

    await expect(getCatalog()).resolves.toEqual(entries);
    expect(mockedSetItem).toHaveBeenNthCalledWith(
      1,
      '@exercise_catalog_v2',
      JSON.stringify({ versao: 2, exercicios: entries }),
    );
    expect(mockedSetItem).toHaveBeenNthCalledWith(
      2,
      '@exercise_catalog_meta',
      JSON.stringify({ versao: 2, etag: '"catalogo-v2-abc"' }),
    );
  });

  it('propaga erro distinto de nenhum resultado quando não há rede nem cache', async () => {
    mockedGet.mockRejectedValue(new Error('rede caiu'));

    await expect(getCatalog()).rejects.toBeInstanceOf(ExerciseCatalogUnavailableError);
  });

  it('não transforma resposta remota vazia ou inválida em nenhum resultado', async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      data: { versao: 2, exercicios: [] },
      headers: { etag: '"catalogo-v2-vazio"' },
    });

    await expect(getCatalog()).rejects.toBeInstanceOf(ExerciseCatalogUnavailableError);
  });

  it('falha ao gravar o cache não derruba um fetch bem-sucedido', async () => {
    // Janela anônima do Safari: setItem lança. O catálogo veio da rede inteiro;
    // transformar isso em "catálogo indisponível" apagava o editor sem motivo.
    mockedGet.mockResolvedValue({
      status: 200,
      data: { versao: 2, exercicios: entries },
      headers: { etag: '"catalogo-v2-abc"' },
    });
    mockedSetItem.mockRejectedValue(new Error('QuotaExceededError'));

    await expect(getCatalog()).resolves.toEqual(entries);
  });

  it('encontra o exercício quando o aluno digita as palavras fora de ordem', () => {
    // O resolvedor do backend casa "supino barra" com "Supino Reto com Barra".
    // Com `includes` puro o app dizia "não está na nossa lista" e a métrica
    // escolhida pelo aluno era descartada na gravação.
    expect(searchCatalog('supino barra', entries, {
      incluirCardio: true,
      incluirMobilidade: true,
    }).map((item) => item.chave)).toEqual(['supino_reto_barra']);

    expect(searchCatalog('lateral halter', entries, {
      incluirCardio: true,
      incluirMobilidade: true,
    }).map((item) => item.chave)).toEqual(['elevacao_lateral']);
  });

  it('busca explícita alcança cardio mesmo com a preferência desligada', () => {
    // A preferência do questionário esconde o grupo da navegação, não do que
    // o aluno digitou: era assim que "Corrida" virava nome livre.
    expect(searchCatalog('caminhada', entries, {
      incluirCardio: false,
      incluirMobilidade: false,
    }).map((item) => item.chave)).toEqual(['caminhada']);

    // Sem busca, a preferência continua valendo.
    expect(searchCatalog('', entries, {
      incluirCardio: false,
      incluirMobilidade: false,
    }).map((item) => item.chave)).toEqual(['supino_reto_barra', 'elevacao_lateral']);
  });

  it('resolveExerciseName devolve o item canônico e null offline', async () => {
    mockedPost.mockResolvedValue({
      data: {
        exercicio: {
          chave: 'remada_curvada_barra',
          nome: 'Remada Curvada com Barra',
          grupo_muscular: 'Costas',
          equipamento: 'Barra',
          peso_corporal: false,
          incremento_kg: 2.5,
          metrica: 'carga_reps',
        },
      },
    });
    await expect(resolveExerciseName('Bent Over Row')).resolves.toMatchObject({
      chave: 'remada_curvada_barra',
      metrica: 'carga_reps',
    });

    mockedPost.mockResolvedValue({ data: { exercicio: null } });
    await expect(resolveExerciseName('Rosca escocesa no banco 45')).resolves.toBeNull();

    // Offline não pode virar afirmação: devolve null e o nome livre segue valendo.
    mockedPost.mockRejectedValue(new Error('rede caiu'));
    await expect(resolveExerciseName('Corrida')).resolves.toBeNull();

    // Nome vazio nem chega a consultar o servidor.
    mockedPost.mockClear();
    await expect(resolveExerciseName('   ')).resolves.toBeNull();
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
