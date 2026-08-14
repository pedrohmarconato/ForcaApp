// __tests__/alertNoAlertRemanescente.test.ts
// Guarda permanente de regressão (D-08, Fase 9 Plan 04): depois que os 12 call
// sites de Alert.alert migraram para o shim showAlert (Plans 09-01/09-02/09-03),
// nenhum Alert.alert cru pode voltar a existir fora do shim — protege as Fases
// 10-13 (ex.: opt-in de push) de reintroduzir o bug WEB-01 (Alert.alert é no-op
// silencioso no react-native-web).
//
// Molde de varredura recursiva: __tests__/loadInputLayoutWeb.test.ts:120-176
// (readdirSync/readFileSync, coleta de infratores, guarda contra a própria
// varredura silenciosamente parar de varrer).

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Raiz única (não uma lista de subpastas hardcoded, WR-02): varrer src/
// inteiro recursivamente garante que qualquer pasta nova (ex.: um futuro
// src/hooks/useXyz.ts das Fases 10-13) entra automaticamente na varredura,
// sem exigir lembrar de atualizar esta lista a cada pasta criada.
const ROOT_DIR = join(__dirname, '..', 'src');

// Únicos arquivos onde Alert/Alert.alert é esperado: o próprio shim (repasse
// nativo puro, D-03) e o host visual (comentário/JSDoc que documenta o
// substituto de Alert.alert no web).
const PERMITIDOS = new Set(['alertShim.ts', 'AlertHost.tsx']);

const EXTENSOES = /\.(tsx?|jsx?)$/;

/** Lista recursivamente todos os arquivos .tsx?/.jsx? sob `dir`. */
function listarArquivosRecursivo(dir: string): string[] {
  const arquivos: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      arquivos.push(...listarArquivosRecursivo(caminho));
    } else if (EXTENSOES.test(entrada.name)) {
      arquivos.push(caminho);
    }
  }
  return arquivos;
}

describe('guarda: nenhum Alert.alert fora do shim (D-08)', () => {
  it('grep Alert\\. zerado fora de alertShim.ts/AlertHost.tsx', () => {
    const infratores: string[] = [];
    let arquivosVarridos = 0;

    for (const caminho of listarArquivosRecursivo(ROOT_DIR)) {
      const nomeArquivo = caminho.split('/').pop() as string;
      if (PERMITIDOS.has(nomeArquivo)) continue;

      arquivosVarridos += 1;
      const conteudo = readFileSync(caminho, 'utf8');
      if (/\bAlert\s*[.,]/.test(conteudo)) {
        infratores.push(caminho.replace(join(__dirname, '..') + '/', ''));
      }
    }

    // Guarda contra a varredura silenciosamente parar de varrer (regex que não
    // casa mais, pasta renomeada, filtro de extensão errado): um teste que não
    // olha nada passa sempre. Molde loadInputLayoutWeb.test.ts:172.
    expect(arquivosVarridos).toBeGreaterThan(20);
    expect(infratores).toEqual([]);
  });

  it('cobre todas as subpastas de src/, não só as 3 originais (WR-02)', () => {
    // Regressão específica: a versão antiga hardcodeava DIRS = [screens,
    // components, store] e deixava 55+ arquivos em hooks/services/engine/
    // navigation/contexts fora do alcance do guarda — um Alert.alert cru
    // em qualquer uma dessas pastas passaria com check verde. Varrer a
    // partir de ROOT_DIR = src/ deve cobrir todas elas sem listar cada uma
    // manualmente.
    const arquivos = listarArquivosRecursivo(ROOT_DIR);
    const cobreSubpasta = (nome: string) =>
      arquivos.some((caminho) => caminho.includes(`${join('src', nome)}/`));

    for (const subpasta of ['hooks', 'services', 'engine', 'navigation', 'contexts']) {
      expect(cobreSubpasta(subpasta)).toBe(true);
    }
  });
});
