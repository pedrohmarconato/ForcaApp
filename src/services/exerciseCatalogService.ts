// src/services/exerciseCatalogService.ts
// Catálogo canônico do backend para o editor manual. O JSON não é duplicado no
// bundle: AsyncStorage guarda a última versão confirmada e a API revalida por
// ETag em background. Falha sem cache é explícita para não parecer "0 resultados".

import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { ENDPOINTS } from './api/apiClient';

export type CatalogMetric = 'carga_reps' | 'tempo' | 'tempo_distancia';

export type CatalogEntry = {
  chave: string;
  nome: string;
  grupo_muscular: string;
  equipamento: string;
  peso_corporal: boolean;
  incremento_kg: number;
  metrica: CatalogMetric;
};

export type CatalogSearchOptions = {
  incluirCardio: boolean;
  incluirMobilidade: boolean;
  grupo?: string | null;
  equipamento?: string | null;
};

type CatalogPayload = {
  versao: number;
  exercicios: CatalogEntry[];
};

type CatalogMeta = {
  versao: number;
  etag: string | null;
};

const META_KEY = '@exercise_catalog_meta';
const cacheKey = (versao: number): string => `@exercise_catalog_v${versao}`;

export class ExerciseCatalogUnavailableError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'ExerciseCatalogUnavailableError';
    this.originalError = originalError;
  }
}

const normalizar = (texto: string): string =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const metricasValidas = new Set<CatalogMetric>([
  'carga_reps',
  'tempo',
  'tempo_distancia',
]);

const isCatalogEntry = (valor: unknown): valor is CatalogEntry => {
  if (!valor || typeof valor !== 'object') return false;
  const item = valor as Partial<CatalogEntry>;
  return (
    typeof item.chave === 'string' &&
    typeof item.nome === 'string' &&
    typeof item.grupo_muscular === 'string' &&
    typeof item.equipamento === 'string' &&
    typeof item.peso_corporal === 'boolean' &&
    typeof item.incremento_kg === 'number' &&
    metricasValidas.has(item.metrica as CatalogMetric)
  );
};

const parsePayload = (raw: unknown): CatalogPayload | null => {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const payload = parsed as Partial<CatalogPayload>;
  if (
    !Number.isInteger(payload.versao) ||
    (payload.versao ?? 0) < 1 ||
    !Array.isArray(payload.exercicios) ||
    payload.exercicios.length === 0 ||
    !payload.exercicios.every(isCatalogEntry)
  ) {
    return null;
  }
  return payload as CatalogPayload;
};

const parseMeta = (raw: string | null): CatalogMeta | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogMeta>;
    if (!Number.isInteger(parsed.versao) || (parsed.versao ?? 0) < 1) return null;
    if (parsed.etag !== null && typeof parsed.etag !== 'string') return null;
    return { versao: parsed.versao as number, etag: parsed.etag ?? null };
  } catch {
    return null;
  }
};

const etagDaResposta = (headers: unknown): string | null => {
  const h = headers as { etag?: unknown; ETag?: unknown; get?: (key: string) => unknown } | null;
  const valor = h?.etag ?? h?.ETag ?? h?.get?.('etag');
  return typeof valor === 'string' && valor ? valor : null;
};

const buscarNaApi = async (etag?: string | null) => {
  return apiClient.get<CatalogPayload>(ENDPOINTS.EXERCISE_CATALOG, {
    headers: etag ? { 'If-None-Match': etag } : undefined,
    validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
  });
};

const persistirCache = async (
  payload: CatalogPayload,
  etag: string | null,
): Promise<void> => {
  await AsyncStorage.setItem(cacheKey(payload.versao), JSON.stringify(payload));
  await AsyncStorage.setItem(
    META_KEY,
    JSON.stringify({ versao: payload.versao, etag } satisfies CatalogMeta),
  );
};

const revalidarEmBackground = async (meta: CatalogMeta): Promise<void> => {
  try {
    const response = await buscarNaApi(meta.etag);
    if (response.status === 304) return;
    const payload = parsePayload(response.data);
    if (!payload) return;
    await persistirCache(payload, etagDaResposta(response.headers));
  } catch {
    // O chamador já recebeu o cache válido. O interceptor central registra a
    // indisponibilidade; uma revalidação falha não degrada o editor.
  }
};

export const getCatalog = async (): Promise<CatalogEntry[]> => {
  const meta = parseMeta(await AsyncStorage.getItem(META_KEY));
  const cached = meta
    ? parsePayload(await AsyncStorage.getItem(cacheKey(meta.versao)))
    : null;

  if (cached && cached.versao === meta?.versao) {
    void revalidarEmBackground(meta);
    return cached.exercicios;
  }

  try {
    let response = await buscarNaApi(meta?.etag);
    // Metadado sem o payload correspondente é cache corrompido/incompleto. Um
    // 304 não consegue recuperá-lo, então refaz uma única GET sem condição.
    if (response.status === 304) response = await buscarNaApi(null);
    const payload = parsePayload(response.data);
    if (!payload) {
      throw new ExerciseCatalogUnavailableError(
        'A API retornou um catálogo de exercícios inválido.',
      );
    }
    await persistirCache(payload, etagDaResposta(response.headers));
    return payload.exercicios;
  } catch (error) {
    if (error instanceof ExerciseCatalogUnavailableError) throw error;
    throw new ExerciseCatalogUnavailableError(
      'Catálogo de exercícios indisponível e sem cache local.',
      error,
    );
  }
};

export const searchCatalog = (
  query: string,
  entries: CatalogEntry[],
  opts: CatalogSearchOptions,
): CatalogEntry[] => {
  const busca = normalizar(query);
  const grupo = normalizar(opts.grupo ?? '');
  const equipamento = normalizar(opts.equipamento ?? '');

  return entries.filter((entry) => {
    const grupoDoItem = normalizar(entry.grupo_muscular);
    if (!opts.incluirCardio && grupoDoItem === 'cardio') return false;
    if (!opts.incluirMobilidade && grupoDoItem === 'mobilidade') return false;
    if (grupo && grupoDoItem !== grupo) return false;
    if (equipamento && normalizar(entry.equipamento) !== equipamento) return false;
    return !busca || normalizar(entry.nome).includes(busca);
  });
};
