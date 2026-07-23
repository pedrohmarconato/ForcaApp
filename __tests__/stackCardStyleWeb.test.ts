// __tests__/stackCardStyleWeb.test.ts
// Modo de falha real (PWA, 22/07/2026): no web o card do @react-navigation/stack
// usa minHeight:'100%' por default e o reset do Expo trava o body com
// overflow:hidden — o card estica com o conteúdo, o ScrollView fica sem
// viewport e o scroll morre (usuário não conseguia avançar no questionário).
//
// O contrato aqui: TODO stack navigator declara cardStyle com flex:1
// (stackCardStyle). O teste varre os arquivos de navegação para que um stack
// novo não reintroduza o bug silenciosamente.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { stackCardStyle } from '../src/navigation/navigationStyles';

const NAV_DIR = join(__dirname, '..', 'src', 'navigation');

describe('stackCardStyle — scroll no web', () => {
  it('prende o card à viewport (flex 1) mantendo o fundo do tema', () => {
    expect(stackCardStyle.flex).toBe(1);
    expect(typeof stackCardStyle.backgroundColor).toBe('string');
  });

  it('todo <*.Navigator> de stack usa stackCardStyle no cardStyle', () => {
    const arquivos = readdirSync(NAV_DIR).filter((f) => /\.(tsx|js)$/.test(f) && f !== 'navigationStyles.ts');
    const faltando: string[] = [];

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(join(NAV_DIR, arquivo), 'utf8');
      if (!conteudo.includes('createStackNavigator')) continue;

      // Só os navigators criados com createStackNavigator têm cardStyle —
      // tabs (BottomTab) usam outro mecanismo e ficam fora do contrato.
      const nomesDeStack = [...conteudo.matchAll(/const\s+(\w+)\s*=\s*createStackNavigator/g)].map(
        (m) => m[1],
      );
      for (const nome of nomesDeStack) {
        const aberturas = conteudo.match(new RegExp(`<${nome}\\.Navigator[\\s\\S]*?>`, 'g')) ?? [];
        expect(aberturas.length).toBeGreaterThan(0);
        for (const abertura of aberturas) {
          if (!abertura.includes('stackCardStyle')) {
            faltando.push(`${arquivo}: <${nome}.Navigator sem stackCardStyle`);
          }
        }
      }
    }

    expect(faltando).toEqual([]);
  });
});
