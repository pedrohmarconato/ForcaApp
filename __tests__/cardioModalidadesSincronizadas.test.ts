// __tests__/cardioModalidadesSincronizadas.test.ts
// A lista de modalidades do questionário (src/constants/cardioModalidades.ts) é
// PARALELA ao catálogo do backend — decisão consciente, porque o serviço de
// catálogo importa o cliente Supabase e derrubaria o onboarding sem env.
//
// O preço dessa decisão é drift: o catálogo ganhar (ou renomear) uma modalidade
// e a tela continuar oferecendo a lista velha, ou pior — oferecer um nome que o
// backend não resolve, e que ele então descarta em silêncio na hora de montar o
// contrato do prompt. Este teste transforma esse drift em falha de CI.

import fs from 'fs';
import path from 'path';

import { CARDIO_MODALIDADES } from '../src/constants/cardioModalidades';

type EntradaCatalogo = { nome?: unknown; grupo_muscular?: unknown };

const carregarCardioDoBackend = (): string[] => {
  const arquivo = path.join(__dirname, '..', 'backend', 'data', 'catalogo_exercicios.json');
  const documento = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as unknown;
  const lista: unknown = Array.isArray(documento)
    ? documento
    : (documento as { exercicios?: unknown })?.exercicios;
  if (!Array.isArray(lista)) {
    throw new Error('catalogo_exercicios.json não tem lista de exercícios reconhecível');
  }
  return (lista as EntradaCatalogo[])
    .filter((e) => e?.grupo_muscular === 'Cardio' && typeof e.nome === 'string')
    .map((e) => e.nome as string);
};

describe('modalidades de cardio da tela × catálogo do backend', () => {
  it('a lista da tela é exatamente o grupo Cardio do catálogo', () => {
    const doBackend = carregarCardioDoBackend();

    // Ordem não importa (a tela decide a ordem de exibição); o CONJUNTO importa.
    expect([...CARDIO_MODALIDADES].sort()).toEqual([...doBackend].sort());
  });

  it('nenhum nome da tela está fora do catálogo (seria descartado no prompt)', () => {
    const doBackend = new Set(carregarCardioDoBackend());
    const forasteiros = CARDIO_MODALIDADES.filter((nome) => !doBackend.has(nome));

    expect(forasteiros).toEqual([]);
  });

  it('nenhuma modalidade do catálogo fica escondida do aluno', () => {
    const daTela = new Set<string>(CARDIO_MODALIDADES);
    const esquecidas = carregarCardioDoBackend().filter((nome) => !daTela.has(nome));

    expect(esquecidas).toEqual([]);
  });
});
