// src/constants/cardioModalidades.ts
// Modalidades de cardio oferecidas no questionário (dose declarada, 0021).
//
// Por que uma lista local e não `exerciseCatalogService.getCatalog()`:
//
//  - o serviço do catálogo importa `apiClient`, que importa o cliente Supabase,
//    que LANÇA no import quando as env vars não existem. Puxá-lo para dentro do
//    questionário derrubava a tela inteira em qualquer ambiente sem env (foi o
//    mesmo motivo que fez `classifyApiError` virar módulo próprio no #53);
//  - o questionário roda no onboarding, possivelmente offline e antes de
//    qualquer chamada autenticada: depender de rede para oferecer três chips
//    seria trocar robustez por nada.
//
// O risco de uma lista paralela é DRIFT — o catálogo do backend ganhar uma
// modalidade e esta lista ficar para trás em silêncio. Por isso existe um teste
// (__tests__/cardioModalidadesSincronizadas.test.ts) que lê
// backend/data/catalogo_exercicios.json e falha se o grupo "Cardio" divergir
// desta lista. Drift passa a ser erro de CI, não surpresa em produção.
//
// Os nomes têm de ser IDÊNTICOS aos do catálogo: o backend só escreve no prompt
// as modalidades que resolve pelo catálogo, e um nome fora dele seria descartado
// sem o aluno saber.
export const CARDIO_MODALIDADES = [
  'Caminhada',
  'Corrida',
  'Bicicleta Ergométrica',
  'Elíptico',
  'Remo Ergômetro',
  'Escada Ergométrica',
  'Pular Corda',
  'Cardio Contínuo (LISS)',
  'Cardio Intervalado (HIIT)',
] as const;

export type CardioModalidade = (typeof CARDIO_MODALIDADES)[number];

// Meta de desempenho exige distância real. Modalidade com métrica `tempo` não
// oferece esse campo na execução e criaria uma meta impossível de medir.
// O teste de sincronia também compara este subconjunto ao catálogo do backend.
export const CARDIO_MODALIDADES_COM_DISTANCIA: readonly CardioModalidade[] = [
  'Caminhada',
  'Corrida',
  'Bicicleta Ergométrica',
  'Elíptico',
  'Remo Ergômetro',
  'Cardio Contínuo (LISS)',
];

/** Modalidade válida? Guarda de fronteira antes de gravar troca (Fase 3, D-02). */
export const isCardioModalidade = (v: unknown): v is CardioModalidade =>
  typeof v === 'string' && (CARDIO_MODALIDADES as readonly string[]).includes(v);
