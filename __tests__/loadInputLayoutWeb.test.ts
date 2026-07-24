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
  idDoExercicioNoCard,
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

describe('gatilho da animação de troca de exercício', () => {
  // Modo de falha real (achado na revisão do PR #40, antes de chegar ao
  // usuário): o gatilho vinha do rascunho, que já aponta para o próximo
  // exercício assim que a última série fecha. Como quem está na tela nesse
  // instante é o card de DESCANSO — que não anima —, os 260ms corriam atrás
  // dele e o card do exercício novo entrava sem transição nenhuma.

  it('segura o gatilho enquanto o descanso está na tela', () => {
    expect(
      idDoExercicioNoCard({ ativo: null, proximo: 'flexao', emDescanso: true }),
    ).toBeNull();
  });

  it('assume o próximo exercício assim que o card animado volta', () => {
    expect(
      idDoExercicioNoCard({ ativo: null, proximo: 'flexao', emDescanso: false }),
    ).toBe('flexao');
  });

  it('a série ativa manda quando existe', () => {
    expect(
      idDoExercicioNoCard({ ativo: 'supino', proximo: 'flexao', emDescanso: false }),
    ).toBe('supino');
  });

  it('sem exercício em jogo não há gatilho', () => {
    expect(
      idDoExercicioNoCard({ ativo: null, proximo: null, emDescanso: false }),
    ).toBeNull();
  });

  it('a sequência real de uma troca com descanso anima UMA vez, no card certo', () => {
    // supino ativo → conclui (descanso, próximo = flexão) → descanso acaba.
    const passos = [
      { ativo: 'supino', proximo: null, emDescanso: false },
      { ativo: null, proximo: 'flexao', emDescanso: true },
      { ativo: 'flexao', proximo: null, emDescanso: false },
    ].map(idDoExercicioNoCard);

    expect(passos).toEqual(['supino', null, 'flexao']);
    // O null no meio é o que impede o gatilho de virar durante o descanso: a
    // troca só é percebida no passo 3, com o card animado na tela.
    const trocas = passos.filter((id, i) => id !== null && i > 0 && passos[i - 1] !== id);
    expect(trocas).toEqual(['flexao']);
  });
});

describe('regra geral: TextInput com flex precisa de minWidth 0', () => {
  // O RNW não reseta min-width em TextInput; qualquer input que dispute espaço
  // numa row repete o bug. A varredura parte do USO — todo estilo aplicado a um
  // <TextInput> — em vez do nome da chave: a primeira versão deste teste só
  // olhava chaves com "Input" no nome e deixou passar `dateCell`, `yearCell`
  // (data de nascimento) e `campo` (chat), que tinham exatamente o mesmo
  // defeito.
  const DIRS = [
    join(__dirname, '..', 'src', 'components', 'session'),
    join(__dirname, '..', 'src', 'components', 'ui'),
    join(__dirname, '..', 'src', 'screens'),
  ];

  /** Nomes de estilo (styles.X) aplicados a algum <TextInput> do arquivo. */
  const estilosDeInput = (conteudo: string): Set<string> => {
    const nomes = new Set<string>();
    const blocos = conteudo.match(/<TextInput[\s\S]*?\/>/g) ?? [];
    for (const bloco of blocos) {
      const refs = bloco.match(/styles\.(\w+)/g) ?? [];
      for (const ref of refs) nomes.add(ref.replace('styles.', ''));
    }
    return nomes;
  };

  it('nenhum estilo aplicado a TextInput com flex esquece o minWidth', () => {
    const infratores: string[] = [];
    let arquivosVarridos = 0;
    let estilosConferidos = 0;

    for (const dir of DIRS) {
      for (const arquivo of readdirSync(dir).filter((f) => /\.tsx$/.test(f))) {
        const conteudo = readFileSync(join(dir, arquivo), 'utf8');
        if (!conteudo.includes('<TextInput')) continue;
        arquivosVarridos += 1;

        for (const nome of estilosDeInput(conteudo)) {
          const def = new RegExp(`\\b${nome}\\s*:\\s*\\{([^}]*)\\}`).exec(conteudo);
          if (!def) continue;
          estilosConferidos += 1;
          const corpo = def[1];
          const temFlex = /\bflex\s*:\s*[\d.]+/.test(corpo);
          const temMinWidth = /\bminWidth\s*:\s*0\b/.test(corpo);
          const temLarguraFixa = /\bwidth\s*:\s*\d/.test(corpo);
          if (temFlex && !temMinWidth && !temLarguraFixa) {
            infratores.push(`${arquivo} → ${nome}`);
          }
        }
      }
    }

    // Guarda contra a varredura silenciosamente parar de varrer (regex que não
    // casa mais, pasta renomeada): um teste que não olha nada passa sempre.
    expect(arquivosVarridos).toBeGreaterThanOrEqual(3);
    expect(estilosConferidos).toBeGreaterThanOrEqual(5);
    expect(infratores).toEqual([]);
  });
});
