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

const DIRS = [
  join(__dirname, '..', 'src', 'screens'),
  join(__dirname, '..', 'src', 'components'),
  join(__dirname, '..', 'src', 'store'),
];

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

    for (const dir of DIRS) {
      for (const caminho of listarArquivosRecursivo(dir)) {
        const nomeArquivo = caminho.split('/').pop() as string;
        if (PERMITIDOS.has(nomeArquivo)) continue;

        arquivosVarridos += 1;
        const conteudo = readFileSync(caminho, 'utf8');
        if (/\bAlert\s*[.,]/.test(conteudo)) {
          infratores.push(caminho.replace(join(__dirname, '..') + '/', ''));
        }
      }
    }

    // Guarda contra a varredura silenciosamente parar de varrer (regex que não
    // casa mais, pasta renomeada, filtro de extensão errado): um teste que não
    // olha nada passa sempre. Molde loadInputLayoutWeb.test.ts:172.
    expect(arquivosVarridos).toBeGreaterThan(20);
    expect(infratores).toEqual([]);
  });
});
