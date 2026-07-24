// __tests__/loadInputLayoutWeb.test.ts
// Modo de falha real (PWA no iPhone 13, relatado pelo dono em 24/07/2026): o
// "box de peso" saía da tela na sessão ativa.
//
// Causa medida no Chrome com viewport de 390pt (réplica das regras que o
// react-native-web 0.21.2 emite): o RNW reseta `min-width: 0` em View, mas NÃO
// em TextInput — o <input> fica com `min-width: auto`, cuja largura intrínseca
// (size=20 a 24px) é 278px. Como item de flex row com `flex: 1`, ele se recusa
// a encolher abaixo disso e empurra o botão "+" do stepper para fora:
//   borda direita do "+" em 548,7px numa tela de 390pt = 158,7pt FORA da tela.
// Com `minWidth: 0` o input passa a 78,3pt e o stepper inteiro cabe.
//
// O segundo contrato é de conteúdo: 78,3pt de caixa = 60,3pt úteis, e "102,5"
// ocupa 62pt na fonte real (Inter 600 a 24px, medido com canvas). Ou seja, só
// o minWidth ainda cortava carga de três dígitos com decimal — daí o fieldWide
// ir de 1.8 para 2.2.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import theme from '../src/theme/theme';
import {
  FIELD_FLEX,
  FIELD_WIDE_FLEX,
  LOAD_INPUT_STYLE,
} from '../src/components/session/sessionPlayerLayout';

/** iPhone 13 — a tela mais estreita que o dono usa de fato. */
const LARGURA_DA_TELA = 390;

/** Larguras medidas no Chrome com Inter 600 a 24px (fontSizes.display). */
const LARGURA_DO_TEXTO = { '42,5': 50.7, '102,5': 62, '127,5': 58.1 } as const;

/**
 * Largura útil (para texto) do campo de carga, refeita a partir dos tokens
 * reais. Espelha a cadeia: tela → padding do scroll → borda+padding do card →
 * gap da linha → proporção dos campos → botões e gaps do stepper → padding e
 * borda do próprio input.
 */
const larguraUtilDoCampoDeCarga = (larguraDaTela: number): number => {
  const conteudoDaTela = larguraDaTela - 2 * theme.spacing.xl; // styles.scroll
  const interiorDoCard = conteudoDaTela - 2 - 2 * theme.spacing.xl; // borda + padding
  const linha = interiorDoCard - theme.spacing.md; // gap da inputsRow
  const campoDeCarga = linha * (FIELD_WIDE_FLEX / (FIELD_FLEX + FIELD_WIDE_FLEX));
  const caixaDoInput =
    campoDeCarga - 2 * theme.hitTarget.regular - 2 * theme.spacing.xs; // −/+ e gaps
  return caixaDoInput - 2 * theme.spacing.sm - 2; // padding + borda do input
};

describe('campo de carga do SessionPlayer — largura no web', () => {
  it('declara minWidth 0 (sem isso o <input> não encolhe e o "+" sai da tela)', () => {
    expect(LOAD_INPUT_STYLE.minWidth).toBe(0);
    expect(LOAD_INPUT_STYLE.flex).toBe(1);
  });

  it('cabe uma carga de três dígitos com decimal no iPhone 13', () => {
    const util = larguraUtilDoCampoDeCarga(LARGURA_DA_TELA);
    expect(util).toBeGreaterThan(LARGURA_DO_TEXTO['102,5']);
    expect(util).toBeGreaterThan(LARGURA_DO_TEXTO['127,5']);
  });

  it('cabe também numa tela de 360pt (Android estreito), ainda que justo', () => {
    expect(larguraUtilDoCampoDeCarga(360)).toBeGreaterThan(LARGURA_DO_TEXTO['42,5']);
  });

  it('mantém o alvo de toque dos botões −/+ em pelo menos 44pt', () => {
    // Alargar o campo às custas do botão é a saída fácil e errada.
    expect(theme.hitTarget.regular).toBeGreaterThanOrEqual(44);
  });
});

describe('regra geral: TextInput com flex precisa de minWidth 0', () => {
  // O RNW não reseta min-width em TextInput; qualquer input que dispute espaço
  // numa row repete o bug. A varredura impede que um componente novo o
  // reintroduza em silêncio.
  const DIRS = [
    join(__dirname, '..', 'src', 'components', 'session'),
    join(__dirname, '..', 'src', 'screens'),
  ];

  it('nenhum estilo de input com flex esquece o minWidth', () => {
    const infratores: string[] = [];

    for (const dir of DIRS) {
      for (const arquivo of readdirSync(dir).filter((f) => /\.tsx$/.test(f))) {
        const conteudo = readFileSync(join(dir, arquivo), 'utf8');
        if (!conteudo.includes('TextInput')) continue;

        // Estilos cujo nome denuncia um input e que declaram flex numérico.
        const regex = /(\w*[Ii]nput\w*)\s*:\s*\{([^}]*)\}/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(conteudo)) !== null) {
          const [, nome, corpo] = m;
          const temFlex = /\bflex\s*:\s*[\d.]+/.test(corpo);
          const temMinWidth = /\bminWidth\s*:\s*0\b/.test(corpo);
          const temLarguraFixa = /\bwidth\s*:\s*\d/.test(corpo);
          if (temFlex && !temMinWidth && !temLarguraFixa) {
            infratores.push(`${arquivo} → ${nome}`);
          }
        }
      }
    }

    expect(infratores).toEqual([]);
  });
});
