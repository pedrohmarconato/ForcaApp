// __tests__/liveActivitySwiftContract.test.ts
// Contrato estrutural ActivityKit/WidgetKit do neon configurável
// (Plano 18-09, D-10/D-01). Por que existe: os dois
// SessionActivityAttributes.swift são duplicados de propósito (app target ×
// widget extension, processos separados) e o drift entre eles só explode na
// hora do build físico ou — pior — no decode de uma Activity publicada pelo
// binário antigo. Este teste lê os quatro arquivos Swift e prova, sem pedir
// Xcode: (a) paridade total dos dois structs com `neonColor: String?`
// opcional ao fim; (b) a ponte Expo (Record + contentState(from:)) encaminha
// o campo; (c) o widget resolve as quatro chaves de D-01 para os canais RGB
// exatos com default yellow para nil/desconhecido; (d) nenhum acento neon
// fixo independente do state sobrevive; (e) layout/tipografia/intents/
// timers/activityBackground/activitySecondary não mudaram; (f) — desde
// 2026-08-24 — o ORÇAMENTO DE ALTURA do card de Lock Screen: soma as
// constantes CGFloat nomeadas que o widget declara e falha se algum dos 3
// estados passar do teto apurado na pesquisa (160pt, HIG) com a margem de
// segurança de 10% exigida; (g) — desde 2026-08-24 (correção de chrome de
// botão) — nenhum botão da apresentação de Lock Screen usa
// .bordered/.borderedProminent/.controlSize/.buttonBorderShape (chrome e
// padding do host real de Live Activity, diferente do que um app comum
// renderiza — o bug de campo que comprimia reps/carga a zero no aparelho do
// dono); todos usam .buttonStyle(.plain) com fundo desenhado à mão.

import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..');
const ler = (caminhoRelativo: string): string =>
  readFileSync(join(repoRoot, caminhoRelativo), 'utf8');

const moduloSwift = ler('modules/live-activity/ios/LiveActivityModule.swift');
const attrsApp = ler('modules/live-activity/ios/SessionActivityAttributes.swift');
const attrsWidget = ler('targets/session-widget/SessionActivityAttributes.swift');
const widgetSwift = ler('targets/session-widget/WidgetLiveActivity.swift');

// Ordem canônica dos campos de SessionActivityAttributes.ContentState (e do
// mapeamento em contentState(from:), que constrói esse mesmo struct e por
// isso segue a MESMA ordem) — D-10 manda neonColor ao fim, para que payloads
// legados (sem o campo) continuem decodificáveis e o memberwise initializer
// trate o opcional com default nil. Os 11 campos de edição-atual/antecipação
// da Fase 17 (currentLoadKg..nextIsBodyweight, merge do WR-01/17) entram na
// MESMA posição em que o SessionActivityAttributes.swift os declara.
const ORDEM_ESPERADA_CONTENT_STATE = [
  'phase',
  'exerciseName',
  'setIndex',
  'setTotal',
  'targetRepsMin',
  'targetRepsMax',
  'targetLoadKg',
  'currentLoadKg',
  'isLoadInherited',
  'loadIncrementKg',
  'currentReps',
  'isRepsInherited',
  'isBodyweight',
  'restEndsAt',
  'blockLabel',
  'blockIndex',
  'blockTotal',
  'nextExerciseName',
  'nextSetIndex',
  'nextSetTotal',
  'nextSuggestedReps',
  'nextSuggestedLoadKg',
  'nextIsBodyweight',
  'neonColor',
] as const;

// LiveActivityContentStateRecord (ponte Expo, LiveActivityModule.swift)
// declara os 11 campos de edição-atual/antecipação todos JUNTOS logo após
// blockTotal — a ordem de @Field não precisa espelhar ContentState (Record
// não é construído posicionalmente, só por rótulo em contentState(from:));
// o contrato real de D-10 é só neonColor ao fim, verificado abaixo.
const ORDEM_ESPERADA_RECORD = [
  'phase',
  'exerciseName',
  'setIndex',
  'setTotal',
  'targetRepsMin',
  'targetRepsMax',
  'targetLoadKg',
  'isBodyweight',
  'restEndsAt',
  'blockLabel',
  'blockIndex',
  'blockTotal',
  'currentLoadKg',
  'isLoadInherited',
  'loadIncrementKg',
  'currentReps',
  'isRepsInherited',
  'nextExerciseName',
  'nextSetIndex',
  'nextSetTotal',
  'nextSuggestedReps',
  'nextSuggestedLoadKg',
  'nextIsBodyweight',
  'neonColor',
] as const;

const camposDoContentState = (src: string): Array<{ nome: string; tipo: string }> => {
  const bloco = src.match(/struct ContentState:[^{]*\{([\s\S]*?)\n    \}/);
  if (!bloco) {
    throw new Error('struct ContentState não encontrado');
  }
  return Array.from(bloco[1].matchAll(/^\s*var (\w+): ([^\n]+)$/gm)).map((m) => ({
    nome: m[1],
    tipo: m[2].trim(),
  }));
};

const camposDoRecord = (src: string): Array<{ nome: string; tipo: string }> => {
  const bloco = src.match(/struct LiveActivityContentStateRecord: Record \{([\s\S]*?)\n\}/);
  if (!bloco) {
    throw new Error('struct LiveActivityContentStateRecord não encontrado');
  }
  return Array.from(bloco[1].matchAll(/@Field var (\w+): ([^=\n]+)/g)).map((m) => ({
    nome: m[1],
    tipo: m[2].trim(),
  }));
};

describe('paridade dos dois SessionActivityAttributes.swift', () => {
  it('são byte a byte idênticos — mudam sempre juntos', () => {
    expect(attrsApp).toBe(attrsWidget);
  });

  it('declaram os campos na ordem canônica, com neonColor String? opcional ao fim', () => {
    for (const [rotulo, src] of [
      ['modules (app)', attrsApp],
      ['targets (widget)', attrsWidget],
    ] as const) {
      const campos = camposDoContentState(src);
      expect(campos.map((c) => c.nome)).toEqual([...ORDEM_ESPERADA_CONTENT_STATE]);
      const ultimo = campos[campos.length - 1];
      expect(ultimo).toEqual({ nome: 'neonColor', tipo: 'String?' });
      expect(campos[0].tipo).toContain('SessionActivityPhase');
    }
  });
});

describe('ponte Expo (LiveActivityModule.swift)', () => {
  it('Record declara todos os campos, com @Field neonColor opcional default nil ao fim', () => {
    const campos = camposDoRecord(moduloSwift);
    expect(campos.map((c) => c.nome)).toEqual([...ORDEM_ESPERADA_RECORD]);
    expect(campos[campos.length - 1]).toEqual({ nome: 'neonColor', tipo: 'String?' });
    expect(moduloSwift).toMatch(/@Field var neonColor: String\? = nil/);
  });

  it('contentState(from:) encaminha neonColor como último argumento', () => {
    const funcao = moduloSwift.match(
      /func contentState\(from record: LiveActivityContentStateRecord\) -> SessionActivityAttributes\.ContentState \{([\s\S]*?)\n  \}/,
    );
    expect(funcao).not.toBeNull();
    const args = Array.from(funcao![1].matchAll(/^\s{6}(\w+): /gm)).map((m) => m[1]);
    expect(args).toEqual([...ORDEM_ESPERADA_CONTENT_STATE]);
    expect(funcao![1]).toMatch(/neonColor: record\.neonColor/);
  });
});

describe('resolver de cor do widget (WidgetLiveActivity.swift)', () => {
  const hexParaCanais = (hex: string): [number, number, number] =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

  // Hexes aprovados em D-01 (18-CONTEXT.md / src/theme/theme.ts NEON_COLORS).
  const HEXES = {
    yellow: '#EBFF00',
    blue: '#00E5FF',
    green: '#39FF14',
    red: '#FF3131',
  } as const;

  let resolver: string;

  beforeAll(() => {
    const bloco = widgetSwift.match(
      /private func neonAccent\(for state: SessionActivityAttributes\.ContentState\) -> Color \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    resolver = bloco![1];
  });

  it('faz switch fechado sobre state.neonColor', () => {
    expect(resolver).toMatch(/switch state\.neonColor/);
  });

  it('cobre exatamente as quatro chaves de D-01 com os canais RGB exatos', () => {
    for (const chave of Object.keys(HEXES) as Array<keyof typeof HEXES>) {
      const caso = resolver.match(
        new RegExp(
          `case "${chave}":\\s*return Color\\(red: ([\\d.]+) / 255\\.0, green: ([\\d.]+) / 255\\.0, blue: ([\\d.]+) / 255\\.0\\)`,
        ),
      );
      expect(caso).not.toBeNull();
      const canais = caso!.slice(1).map(Number);
      expect(canais).toEqual(hexParaCanais(HEXES[chave]));
    }
  });

  it('default converge nil e string desconhecida para yellow', () => {
    const caso = resolver.match(
      /default:\s*return Color\(red: ([\d.]+) \/ 255\.0, green: ([\d.]+) \/ 255\.0, blue: ([\d.]+) \/ 255\.0\)/,
    );
    expect(caso).not.toBeNull();
    expect(caso!.slice(1).map(Number)).toEqual(hexParaCanais(HEXES.yellow));
  });
});

describe('widget consome a cor derivada do ContentState', () => {
  it('não existe constante neon fixa independente do state', () => {
    expect(widgetSwift).not.toMatch(/activityNeon/);
  });

  it('primaryValue e tint dos botões/barra de acento usam a cor do state recebido', () => {
    // resting timer + "Pronto" no primaryValue (usados pela Dynamic Island);
    // 2× dentro de nextUpLine; 1× "let neon = neonAccent(for: state)" no
    // topo do lockScreenBody redesenhado, reaproveitado nas quatro fases —
    // 5 no total.
    const usos = widgetSwift.match(/neonAccent\(for: state\)/g) ?? [];
    expect(usos.length).toBe(5);
  });

  it('símbolo minimal e keylineTint usam a cor de context.state', () => {
    expect(widgetSwift).toMatch(
      /\.foregroundColor\(\s*context\.state\.phase\s*==\s*\.resting\s*\?\s*neonAccent\(for:\s*context\.state\)\s*:\s*activitySecondary\s*\)/,
    );
    expect(widgetSwift).toMatch(/\.keylineTint\(neonAccent\(for: context\.state\)\)/);
    const usos = widgetSwift.match(/neonAccent\(for: context\.state\)/g) ?? [];
    expect(usos.length).toBe(2);
  });
});

describe('layout, tipografia e demais elementos preservados', () => {
  it('mantém cores estruturais e adota a tipografia condensada com contentTransition/numericText', () => {
    expect(widgetSwift).toMatch(
      /private let activityBackground = Color\(red: 0\.039, green: 0\.039, blue: 0\.039\)/,
    );
    expect(widgetSwift).toMatch(
      /private let activitySecondary = Color\(red: 0\.545, green: 0\.565, blue: 0\.596\)/,
    );
    // Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo
    // dono): a tipografia display migra de .rounded para largura condensada
    // (.width(.condensed)) — condensed e rounded são mutuamente excludentes
    // por design (D-especificação), então `design: .rounded` NUNCA MAIS
    // aparece no arquivo.
    expect(widgetSwift).toContain('.width(.condensed)');
    expect(widgetSwift).not.toContain('design: .rounded');
    expect(widgetSwift).toContain('.contentTransition(.numericText())');
    expect(widgetSwift).toContain('.monospacedDigit()');
  });

  it('usa .width(.condensed) largamente nos heróis, cabeçalhos e rótulos do redesenho', () => {
    // Cabeçalho (3x), DESCANSO, timer de descanso (2 ramos), ±30s (1, ver
    // abaixo), PULAR DESCANSO, CONCLUIR SÉRIE, valor+rótulo do stepper (2,
    // definidos uma única vez em lockScreenStepperMetric e reaproveitados
    // nas duas chamadas — reps e carga — pela correção de 2026-08-24 que
    // unificou os dois blocos duplicados numa função só), PRONTO, tempo
    // extra dentro do bloco, A SEGUIR (rótulo+detalhe). Piso ajustado de
    // >=16 para >=14 na correção de 2026-08-24 (DRY-ficação do stepper) e de
    // >=14 para >=13 na correção de chrome de botão do mesmo dia: os chips
    // ±30s (`-30s`/`+30s`) agora chamam `lockScreenAdjustChipLabel` — uma
    // função só, chamada 2× — em vez de declarar o mesmo `.font(...)`
    // inline nos dois Button (reduz a contagem de OCORRÊNCIAS NO
    // CÓDIGO-FONTE sem reduzir o uso real: a função ainda roda 2×).
    const usos = widgetSwift.match(/\.width\(\.condensed\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(13);
  });

  it('mantém timers, intents e decoração da Activity', () => {
    const timers = widgetSwift.match(/Text\(timerInterval: Date\.now\.\.\.restEndsAt, countsDown: true\)/g) ?? [];
    expect(timers.length).toBe(2);
    expect(widgetSwift).toContain('AdjustRestIntent(deltaSeconds: -30)');
    expect(widgetSwift).toContain('SkipRestIntent()');
    expect(widgetSwift).toContain('AdjustRestIntent(deltaSeconds: 30)');
    expect(widgetSwift).toContain('AdjustRepsIntent(deltaReps: -1)');
    expect(widgetSwift).toContain('AdjustRepsIntent(deltaReps: 1)');
    expect(widgetSwift).toContain('AdjustLoadIntent(deltaLoadKg:');
    expect(widgetSwift).toContain('CompleteSetIntent()');
    expect(widgetSwift).toContain('.activityBackgroundTint(activityBackground)');
    expect(widgetSwift).toContain('.activitySystemActionForegroundColor(Color.white)');
    expect(widgetSwift).toContain(
      'widgetURL(URL(string: "forcaapp://home/active-session/\\(context.attributes.sessionLogId)"))',
    );
    expect(widgetSwift).toMatch(
      /Image\(systemName: minimalSymbol\(for: context\.state\)\)/,
    );
  });

  it('redesenho "Identidade Forte": heróis de .resting/.readyOvertime viram blocos neon preenchidos com texto preto — sem "Ajustar no app", sem ProgressView (o bloco já é o sinal)', () => {
    expect(widgetSwift).toContain('private func lockScreenRestNeonBlock');
    expect(widgetSwift).toContain('private func lockScreenReadyNeonBlock');
    // Os dois blocos preenchem um RoundedRectangle(cornerRadius: 16) com a
    // cor neon do state — nunca uma cor fixa (trava de "sem acento fixo" já
    // coberta acima nesta mesma suíte).
    const blocosPreenchidos = Array.from(
      widgetSwift.matchAll(/RoundedRectangle\(cornerRadius: 16\)\s*\n\s*\.fill\(neon\)/g),
    );
    expect(blocosPreenchidos.length).toBe(2);
    expect(widgetSwift).toContain('.foregroundColor(.black)');
    expect(widgetSwift).toContain('Color.black.opacity(0.62)');
    // Decisão de design (registrada no relatório da implementação): a barra
    // de acento neon lateral e a ProgressView linear saem de .resting — o
    // bloco preenchido já carrega toda a identidade visual da fase, uma
    // segunda pista redundaria. Nenhum ProgressView sobra no arquivo.
    expect(widgetSwift).not.toContain('ProgressView');
    // Decisão aprovada (D-redesenho Lock Screen 2026-08, preservada): a
    // dica "Ajustar no app" continua fora da fase .measuring.
    expect(widgetSwift).not.toContain('Ajustar no app');
  });

  it('cabeçalho das 3 fases visíveis vira neon, caixa alta, condensado, com tracking (D-cabeçalho, redesenho "Identidade Forte")', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenHeaderLine\(_ state: SessionActivityAttributes\.ContentState, neon: Color\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    // Correção de orçamento de altura (2026-08-24): o tamanho vira a
    // constante nomeada `headerFontSize` (valor inalterado, 13pt — ver
    // describe "orçamento de altura do Lock Screen" abaixo, que confere o
    // valor declarado).
    expect(bloco![1]).toContain('.font(.system(size: headerFontSize, weight: .semibold).width(.condensed))');
    expect(bloco![1]).toContain('.tracking(1.6)');
    expect(bloco![1]).toContain('.textCase(.uppercase)');
    expect(bloco![1]).toContain('.foregroundColor(neon)');
    expect(bloco![1]).not.toContain('.font(.subheadline)');
    expect(bloco![1]).toContain('.lineLimit(1)');
    expect(bloco![1]).toMatch(/\.minimumScaleFactor\(0\.\d+\)/);
    expect(bloco![1]).toContain('.truncationMode(.tail)');

    // As três chamadas (resting/measuring/readyOvertime) passam `neon`
    // explicitamente — .blockOnly não chama esta função (sem semântica de
    // série) e permanece intocado.
    const chamadas = widgetSwift.match(/lockScreenHeaderLine\(state, neon: neon\)/g) ?? [];
    expect(chamadas.length).toBe(3);
  });

  it('grupo de stepper contornado (stroke, não fill) com padding via constantes nomeadas', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenStepperGroup<Content: View>\(@ViewBuilder content: \(\) -> Content\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    expect(bloco![1]).toContain('.stroke(Color.white.opacity(0.14))');
    expect(bloco![1]).not.toContain('.fill(Color.white.opacity(0.08))');
    // Correção de orçamento de altura (2026-08-24): padding do grupo vira
    // constante nomeada (stepperGroupHorizontalPadding / stepperRowVerticalPadding)
    // em vez de literal — os valores exatos são conferidos no describe de
    // orçamento abaixo.
    expect(bloco![1]).toContain('.padding(.horizontal, stepperGroupHorizontalPadding)');
    expect(bloco![1]).toContain('.padding(.vertical, stepperRowVerticalPadding)');
  });

  it('glifo −/+ do stepper usa stepperGlyphSize (>= 44pt, piso de acessibilidade), desenha o próprio fundo e trava com .fixedSize() — 4 ocorrências (reps e carga)', () => {
    const glifo = widgetSwift.match(
      /private func lockScreenStepperGlyph\(_ symbol: String, neon: Color\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(glifo).not.toBeNull();
    expect(glifo![1]).toContain('.frame(width: stepperGlyphSize, height: stepperGlyphSize)');
    // CORREÇÃO DE CAUSA RAIZ (2026-08-24): estes botões nunca tinham
    // `.buttonStyle()` explícito — o estilo padrão do sistema, dentro do
    // host real de Live Activity, recebe o MESMO chrome/padding do
    // `.bordered` (o `.tint(neon)` que o chamador aplicava só tingia esse
    // chrome). Agora o glifo desenha o próprio fundo e cor — nunca mais
    // delega tamanho/aparência ao sistema.
    expect(glifo![1]).toContain('.foregroundColor(neon)');
    expect(glifo![1]).toContain('.fill(Color.white.opacity(0.10))');

    // Os quatro botões (reps −/+, carga −/+) chamam o glifo passando `neon`
    // e travam o próprio tamanho com `.fixedSize()` — sem isso, o Button
    // aceita a proposta flexível do HStack e cresce além do seu conteúdo
    // (BUG DE CAMPO 2026-08-22/24: sem fixedSize, os botões cresciam e
    // comprimiam o número a zero — quatro elipses de neon, nenhum número,
    // no aparelho).
    const chamadasGlifo = widgetSwift.match(/lockScreenStepperGlyph\("[−+]", neon: neon\)/g) ?? [];
    expect(chamadasGlifo.length).toBe(4);
    const travados = widgetSwift.match(/lockScreenStepperGlyph\("[−+]", neon: neon\)\s*\n\s*\}\s*\n\s*\.fixedSize\(\)/g) ?? [];
    expect(travados.length).toBe(4);
  });

  // BUG DE CAMPO (2026-08-22/24, iPhone 13 / iOS 26): o Button de
  // AdjustRepsIntent/AdjustLoadIntent só tinha `.frame(44×44)` no LABEL, não
  // no próprio Button — nada travava o tamanho do controle, então ele
  // crescia dentro do HStack da linha e comprimia o valor numérico e o
  // rótulo REPS/KG a largura zero (no aparelho: quatro elipses de neon
  // gigantes, nenhum número). A correção original travou o tamanho do
  // Button; ESTA correção (2026-08-24, orçamento de altura) vai além: reps
  // e carga voltam a dividir a MESMA fileira (economia de ~58-68pt de
  // altura — duas fileiras empilhadas custavam ~120pt, uma custa ~62pt) —
  // ver o comentário completo de largura em lockScreenStepperRow no
  // arquivo-fonte. Este bloco trava que a fileira única existe e que os
  // valores permanecem protegidos por layoutPriority(1).
  it('trava a fileira única de steppers (correção de orçamento de altura 2026-08-24): UM lockScreenStepperGroup na fase .measuring, reps e carga na mesma linha, valor protegido por layoutPriority(1)', () => {
    const corpoLockScreen = widgetSwift.match(
      /private func lockScreenBody\(_ state: SessionActivityAttributes\.ContentState, now: Date\) -> some View \{([\s\S]*?)\nprivate func effectiveState\(/,
    );
    expect(corpoLockScreen).not.toBeNull();
    const casoMeasuring = corpoLockScreen![1].match(/case \.measuring:([\s\S]*?)case \.readyOvertime:/);
    expect(casoMeasuring).not.toBeNull();
    const corpo = casoMeasuring![1];

    // A fase .measuring chama a fileira única exatamente uma vez — nenhum
    // segundo lockScreenStepperGroup/VStack empilhando uma segunda fileira
    // sobra no corpo desta fase.
    expect(corpo).toContain('lockScreenStepperRow(state, neon: neon)');
    const chamadasStepperRow = corpo.match(/lockScreenStepperRow\(/g) ?? [];
    expect(chamadasStepperRow.length).toBe(1);

    // A função lockScreenStepperRow, por sua vez, chama lockScreenStepperGroup
    // (o contorno) exatamente uma vez — reps e carga compartilham UM
    // contorno, não dois.
    const funcaoStepperRow = widgetSwift.match(
      /private func lockScreenStepperRow\(_ state: SessionActivityAttributes\.ContentState, neon: Color\) -> some View \{([\s\S]*?)\n\}\n\n\/\/\/ Bloco neon preenchido do herói "PRONTO"/,
    );
    expect(funcaoStepperRow).not.toBeNull();
    const chamadasGroup = funcaoStepperRow![1].match(/lockScreenStepperGroup \{/g) ?? [];
    expect(chamadasGroup.length).toBe(1);

    // Os quatro Adjust*Intent (reps −/+, carga −/+) continuam todos
    // presentes dentro da fileira única — nenhuma ação sumiu na fusão.
    expect(funcaoStepperRow![1]).toContain('AdjustRepsIntent(deltaReps: -1)');
    expect(funcaoStepperRow![1]).toContain('AdjustRepsIntent(deltaReps: 1)');
    expect(funcaoStepperRow![1]).toContain('AdjustLoadIntent(deltaLoadKg: -(state.loadIncrementKg');
    expect(funcaoStepperRow![1]).toContain('AdjustLoadIntent(deltaLoadKg: state.loadIncrementKg');

    // O valor (reps e carga) recebe `.layoutPriority(1)` dentro de
    // lockScreenStepperMetric — chamado 2× (reps, carga) por
    // lockScreenStepperRow, mas declarado uma única vez no arquivo-fonte
    // (DRY: a duplicação inline anterior virou uma função reutilizável).
    const metrica = widgetSwift.match(
      /private func lockScreenStepperMetric\(([\s\S]*?)\n\}/,
    );
    expect(metrica).not.toBeNull();
    expect(metrica![1]).toContain('.layoutPriority(1)');
    // Exclui a própria declaração ("private func lockScreenStepperMetric(")
    // — só conta CHAMADAS (reps e carga, dentro de lockScreenStepperRow).
    const chamadasMetrica = widgetSwift.match(/(?<!func )lockScreenStepperMetric\(\s*\n\s*value:/g) ?? [];
    expect(chamadasMetrica.length).toBe(2);
  });

  it('separa o valor do stepper do rótulo REPS/KG — "40 kg" concatenado não sobrevive; valor e rótulo ficam EMPILHADOS (não lado a lado) dentro de cada métrica', () => {
    expect(widgetSwift).not.toContain(' kg")');

    const metrica = widgetSwift.match(
      /private func lockScreenStepperMetric\(([\s\S]*?)\n\}/,
    );
    expect(metrica).not.toBeNull();
    // VStack(spacing: 0), não HStack — valor em cima, unidade embaixo: é
    // essa pilha vertical que faz a fileira única (reps + carga lado a
    // lado) caber na largura do card (a coluna de cada métrica só precisa
    // ser tão larga quanto o MAIOR dos dois textos, não a soma).
    expect(metrica![1]).toMatch(/VStack\(spacing: 0\) \{/);
    expect(metrica![1]).toContain('Text(value)');
    expect(metrica![1]).toContain('Text(unit)');
    expect(metrica![1]).toContain('.foregroundColor(activitySecondary)');

    // Chamadas com unit: "REPS" e unit: "KG" — nenhuma métrica sumiu.
    expect(widgetSwift).toMatch(/unit: "REPS"/);
    expect(widgetSwift).toMatch(/unit: "KG"/);
  });

  it('"PULAR DESCANSO" e "CONCLUIR SÉRIE" compartilham a mesma faixa desenhada à mão (actionButtonFontSize/actionButtonVerticalPadding), tracking 1.8, sem controlSize/borderedProminent', () => {
    expect(widgetSwift).toMatch(
      /Text\("PULAR DESCANSO"\)\s*\n\s*\.font\(\.system\(size: actionButtonFontSize, weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.tracking\(1\.8\)/,
    );
    expect(widgetSwift).toMatch(
      /Text\("CONCLUIR SÉRIE"\)\s*\n\s*\.font\(\.system\(size: actionButtonFontSize, weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.tracking\(1\.8\)/,
    );
    // Correção de orçamento de altura (2026-08-24): "CONCLUIR SÉRIE" migra
    // de `.buttonStyle(.borderedProminent)` + `.controlSize(.large)`
    // (altura delegada ao sistema, não somável no orçamento) para a MESMA
    // receita de faixa desenhada à mão do botão "PULAR DESCANSO" —
    // `.buttonStyle(.plain)` + `.background(RoundedRectangle...)`. Nenhum
    // dos dois usa mais controlSize ou borderedProminent — a busca exclui
    // comentários citando a história antiga ao checar só os MODIFICADORES
    // realmente aplicados (linhas iniciadas por espaço + ponto, não `///`
    // nem `//`).
    const modificadoresAplicados = widgetSwift
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('//'));
    const corpoSemComentarios = modificadoresAplicados.join('\n');
    expect(corpoSemComentarios).not.toContain('.controlSize(.large)');
    expect(corpoSemComentarios).not.toContain('.buttonStyle(.borderedProminent)');
    // Correção de causa raiz (2026-08-24, chrome de botão do host real de
    // Live Activity): `.buttonBorderShape` saiu de vez do arquivo — inclusive
    // dos chips ±30s, que agora desenham uma Capsule própria em vez de pedir
    // ao sistema um `.roundedRectangle(radius: 12)` (ver describe "nenhum
    // botão... usa estilo/controle do sistema" abaixo).
    expect(widgetSwift).not.toContain('.buttonBorderShape(');
  });

  it('proíbe .glassEffect / #available(iOS 26 no widget — Live Activity roda por um motor de render (WidgetKit archive-based) que não suporta Liquid Glass em runtime; o modificador compilava mas derrubava a subárvore inteira em silêncio (grupos de reps/carga sumiam do card em iPhone com iOS 26), então o fallback plano/contornado vira o único estilo permitido', () => {
    expect(widgetSwift).not.toContain('glassEffect');
    expect(widgetSwift).not.toContain('#available(iOS 26');
  });

  it('card mais alto (agosto/2026, preservado no redesenho "Identidade Forte"): prescriptionText() sai de .measuring e nextUpLine() sai de .resting', () => {
    const corpoLockScreen = widgetSwift.match(
      /private func lockScreenBody\(_ state: SessionActivityAttributes\.ContentState, now: Date\) -> some View \{([\s\S]*?)\nprivate func effectiveState\(/,
    );
    expect(corpoLockScreen).not.toBeNull();
    const corpo = corpoLockScreen![1];

    const casoResting = corpo.match(/case \.resting:([\s\S]*?)case \.measuring:/);
    const casoMeasuring = corpo.match(/case \.measuring:([\s\S]*?)case \.readyOvertime:/);
    const casoReadyOvertime = corpo.match(/case \.readyOvertime:([\s\S]*?)case \.blockOnly:/);
    expect(casoResting).not.toBeNull();
    expect(casoMeasuring).not.toBeNull();
    expect(casoReadyOvertime).not.toBeNull();

    // Decisão aprovada (card mais alto, agosto/2026): a meta prescrita é
    // redundante com os steppers editáveis — prescriptionText() nunca mais
    // aparece dentro de .measuring. A função em si continua existindo (é
    // usada por primaryValue, chamado pela Dynamic Island), só não é mais
    // invocada aqui.
    expect(casoMeasuring![1]).not.toContain('prescriptionText(state)');

    // Decisão aprovada: nextUpLine() (rodapé "A SEGUIR") sai de .resting —
    // o bloco neon do timer de descanso vira o único foco da fase — e
    // continua em .readyOvertime, onde saber o próximo exercício importa
    // fisicamente (D-15).
    expect(casoResting![1]).not.toContain('nextUpLine(state)');
    expect(casoReadyOvertime![1]).toContain('nextUpLine(state)');

    // Redesenho "Identidade Forte": a barra de acento lateral também sai de
    // .resting e .readyOvertime (o bloco neon preenchido já é a identidade);
    // .measuring e .blockOnly continuam com ela.
    expect(casoResting![1]).not.toContain('lockScreenAccentBar(neon)');
    expect(casoReadyOvertime![1]).not.toContain('lockScreenAccentBar(neon)');
    expect(casoMeasuring![1]).toContain('lockScreenAccentBar(neon)');
  });

  it('mantém os intents de ±30s de descanso como chips desenhados à mão ao lado do bloco neon (cápsula, .buttonStyle(.plain), altura 30, padding horizontal 12)', () => {
    const corpoLockScreen = widgetSwift.match(
      /private func lockScreenBody\(_ state: SessionActivityAttributes\.ContentState, now: Date\) -> some View \{([\s\S]*?)\nprivate func effectiveState\(/,
    );
    expect(corpoLockScreen).not.toBeNull();
    const casoResting = corpoLockScreen![1].match(/case \.resting:([\s\S]*?)case \.measuring:/);
    expect(casoResting).not.toBeNull();
    expect(casoResting![1]).toContain('lockScreenRestAdjustButtons()');
    expect(casoResting![1]).toContain('lockScreenSkipRestButton()');

    const bloco = widgetSwift.match(/private func lockScreenRestAdjustButtons\(\) -> some View \{([\s\S]*?)\n\}/);
    expect(bloco).not.toBeNull();
    expect(bloco![1]).toContain('AdjustRestIntent(deltaSeconds: -30)');
    expect(bloco![1]).toContain('AdjustRestIntent(deltaSeconds: 30)');
    // Correção de causa raiz (2026-08-24): `.bordered` + `.controlSize(.small)`
    // + `.buttonBorderShape` saíram — dentro do host real de Live Activity
    // esse trio recebia chrome e padding PRÓPRIOS do sistema (viravam
    // cápsulas enormes que comprimiam os números da linha .measuring a
    // zero no aparelho do dono; o mesmo estilo aqui teria o mesmo risco).
    // `.buttonStyle(.plain)` + a cápsula desenhada em `lockScreenAdjustChipLabel`
    // garantem que o tamanho do controle é exatamente o declarado.
    expect(bloco![1]).toContain('.buttonStyle(.plain)');
    expect(bloco![1]).not.toContain('.buttonStyle(.bordered)');
    expect(bloco![1]).not.toContain('.controlSize(');
    expect(bloco![1]).not.toContain('.buttonBorderShape(');
    expect(bloco![1]).not.toContain('.tint(');
    // O chip .mini da rodada "card mais alto" anterior não sobrevive — os
    // botões voltam a ter uma área de toque maior ao lado do bloco neon.
    expect(widgetSwift).not.toContain('.controlSize(.mini)');

    const rotulo = widgetSwift.match(
      /private func lockScreenAdjustChipLabel\(_ text: String\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(rotulo).not.toBeNull();
    expect(rotulo![1]).toContain('.padding(.horizontal, 12)');
    expect(rotulo![1]).toContain('.frame(height: 30)');
    expect(rotulo![1]).toContain('Capsule()');
    expect(rotulo![1]).toContain('.fill(Color.white.opacity(0.12))');
    expect(rotulo![1]).toContain('.foregroundColor(.white)');
    expect(rotulo![1]).toContain('.font(.system(size: 15, weight: .semibold).width(.condensed))');
  });

  it('nenhum botão da apresentação de Lock Screen usa .bordered/.borderedProminent/.controlSize/.buttonBorderShape — bug de campo: esse chrome do sistema virava cápsulas/círculos gigantes que comprimiam os números a zero no host real de Live Activity, embora renderizassem certo num app comum', () => {
    const semComentarios = widgetSwift
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('//'))
      .join('\n');
    expect(semComentarios).not.toMatch(/\.buttonStyle\(\s*\.bordered\s*\)/);
    expect(semComentarios).not.toMatch(/\.buttonStyle\(\s*\.borderedProminent\s*\)/);
    expect(semComentarios).not.toContain('.controlSize(');
    expect(semComentarios).not.toContain('.buttonBorderShape(');
  });

  it('todo botão da Lock Screen usa .buttonStyle(.plain) — aplicado no próprio Button ou herdado do container (VStack/HStack) que o agrupa — exatamente 4 MODIFICADORES aplicados no arquivo (skip, concluir, grupo ±30s, fileira de steppers; comentários que citam a string ao explicar a correção não contam)', () => {
    const semComentarios = widgetSwift
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('//'))
      .join('\n');
    const usosPlain = semComentarios.match(/\.buttonStyle\(\.plain\)/g) ?? [];
    expect(usosPlain.length).toBe(4);
  });

  it('lockScreenAccentBar não fica mais como filha de HStack ao lado do conteúdo — o Shape sem altura própria aceitava a altura OFERECIDA pelo host de widget (até o envelope de 160pt) em vez da altura RESOLVIDA pelo texto ao lado, virando um risco neon comprido e desalinhado; agora é `.background(alignment: .leading)` do bloco de conteúdo, que propõe o tamanho já resolvido da view base', () => {
    expect(widgetSwift).not.toMatch(/HStack\(alignment: \.top, spacing: 10\) \{\s*\n\s*lockScreenAccentBar\(neon\)/);
    const usosBackground = widgetSwift.match(/\.background\(alignment: \.leading\) \{\s*\n\s*lockScreenAccentBar\(neon\)/g) ?? [];
    expect(usosBackground.length).toBe(2); // .measuring e .blockOnly
  });
});

// Correção de orçamento de altura do Lock Screen (2026-08-24). PESQUISA: a
// especificação de Live Activities da HIG documenta a apresentação
// expandida de Lock Screen com faixa de altura 84–160pt; 160pt (o topo da
// faixa) é o número citado de forma consistente pela comunidade técnica como
// o ponto em que o sistema CORTA (clip) o conteúdo excedente — bate com a
// evidência de campo (foto do dono, iPhone 13/iOS 26: envelope visível de
// ~162pt, a ~2pt do valor pesquisado). Este describe prova, por ARITMÉTICA
// sobre as constantes CGFloat nomeadas que o próprio WidgetLiveActivity.swift
// declara — não sobre um "parece caber" — que os três estados de Lock Screen
// ficam pelo menos 10% abaixo desse teto (<=144pt). A fórmula de altura de
// linha (arredondar para cima de tamanho da fonte × 1.2) é a MESMA usada no
// relatório da correção; qualquer PR que aumente uma constante o suficiente
// para estourar o teto quebra este teste ANTES de chegar a um device físico.
describe('orçamento de altura do Lock Screen (correção 2026-08-24)', () => {
  const extrairConstantes = (src: string): Record<string, number> => {
    const mapa: Record<string, number> = {};
    for (const m of src.matchAll(/private let (\w+): CGFloat = ([\d.]+)/g)) {
      mapa[m[1]] = Number(m[2]);
    }
    return mapa;
  };

  const alturaDeLinha = (tamanhoDaFonte: number): number => Math.ceil(tamanhoDaFonte * 1.2);

  const TETO_APURADO_PT = 160;
  const MARGEM_MINIMA_EXIGIDA = 0.1;
  const TETO_COM_MARGEM_PT = TETO_APURADO_PT * (1 - MARGEM_MINIMA_EXIGIDA); // 144

  // Estimativa NÃO travada em constante nossa: os botões ±30s são
  // `.controlSize(.small)` do sistema (dois empilhados). Nunca é o termo que
  // decide a altura da linha do .resting (o bloco neon é sempre mais alto —
  // ver teste "nunca é o termo decisivo" abaixo), então entra aqui só para
  // documentar a conta, não como piso ajustável.
  const ESTIMATIVA_ADJUST_BUTTONS_PT = 66;

  // Literais fora do escopo desta correção (não estouravam o orçamento antes
  // e continuam com folga depois — não viraram constante para não inflar o
  // arquivo com nomes que ninguém precisa tunar): tempo extra dentro do
  // bloco "PRONTO" (22pt) e a linha "A SEGUIR" de nextUpLine (rótulo 11pt,
  // spacing 2, detalhe 17pt).
  const OVERTIME_TEXT_FONT_SIZE = 22;
  const NEXTUP_LABEL_FONT_SIZE = 11;
  const NEXTUP_INNER_SPACING = 2;
  const NEXTUP_DETAIL_FONT_SIZE = 17;

  let C: Record<string, number>;

  beforeAll(() => {
    C = extrairConstantes(widgetSwift);
  });

  it('declara as 17 constantes de orçamento com os nomes esperados', () => {
    const nomesEsperados = [
      'cardHorizontalPadding',
      'cardVerticalPadding',
      'bodySpacing',
      'headerFontSize',
      'heroLabelFontSize',
      'heroBlockInnerSpacing',
      'restHeroSize',
      'readyHeroSize',
      'neonBlockPaddingTop',
      'neonBlockPaddingBottom',
      'stepperGroupHorizontalPadding',
      'stepperRowVerticalPadding',
      'stepperGlyphSize',
      'stepperValueFontSize',
      'stepperLabelFontSize',
      'actionButtonFontSize',
      'actionButtonVerticalPadding',
    ];
    for (const nome of nomesEsperados) {
      expect(C[nome]).not.toBeUndefined();
    }
  });

  it('stepperGlyphSize nunca regride abaixo do piso de acessibilidade de 44pt (mesmo piso do bug de campo original)', () => {
    expect(C.stepperGlyphSize).toBeGreaterThanOrEqual(44);
  });

  it('heróis (restHeroSize/readyHeroSize) continuam nitidamente maiores que o corpo de texto — nunca regridem a ponto de deixar de ser "herói"', () => {
    expect(C.restHeroSize).toBeGreaterThanOrEqual(C.headerFontSize * 2.5);
    expect(C.readyHeroSize).toBeGreaterThanOrEqual(C.headerFontSize * 2.5);
  });

  it('.resting: soma das constantes fica pelo menos 10% abaixo do teto de 160pt', () => {
    const alturaHeader = alturaDeLinha(C.headerFontSize);
    const alturaRestBlock =
      alturaDeLinha(C.heroLabelFontSize) +
      C.heroBlockInnerSpacing +
      alturaDeLinha(C.restHeroSize) +
      C.neonBlockPaddingTop +
      C.neonBlockPaddingBottom;
    // O bloco neon precisa continuar sendo o termo que decide a altura da
    // linha — se um dia isso deixar de valer, a conta abaixo (que usa só
    // alturaRestBlock) fica otimista e este teste precisa ser revisto.
    expect(alturaRestBlock).toBeGreaterThanOrEqual(ESTIMATIVA_ADJUST_BUTTONS_PT);
    const alturaLinhaBlocoEAjuste = Math.max(alturaRestBlock, ESTIMATIVA_ADJUST_BUTTONS_PT);
    const alturaSkip = alturaDeLinha(C.actionButtonFontSize) + 2 * C.actionButtonVerticalPadding;

    const total =
      2 * C.cardVerticalPadding +
      alturaHeader +
      C.bodySpacing +
      alturaLinhaBlocoEAjuste +
      C.bodySpacing +
      alturaSkip;

    expect(total).toBeLessThanOrEqual(TETO_COM_MARGEM_PT);
  });

  it('.measuring: soma das constantes fica pelo menos 10% abaixo do teto de 160pt (era o estado mais estourado antes da correção)', () => {
    const alturaHeader = alturaDeLinha(C.headerFontSize);
    const alturaInfoColuna = alturaDeLinha(C.stepperValueFontSize) + alturaDeLinha(C.stepperLabelFontSize);
    const alturaFileiraStepper = Math.max(C.stepperGlyphSize, alturaInfoColuna) + 2 * C.stepperRowVerticalPadding;
    const alturaConcluir = alturaDeLinha(C.actionButtonFontSize) + 2 * C.actionButtonVerticalPadding;

    const total =
      2 * C.cardVerticalPadding +
      alturaHeader +
      C.bodySpacing +
      alturaFileiraStepper +
      C.bodySpacing +
      alturaConcluir;

    expect(total).toBeLessThanOrEqual(TETO_COM_MARGEM_PT);
  });

  it('.readyOvertime: soma das constantes fica pelo menos 10% abaixo do teto de 160pt', () => {
    const alturaHeader = alturaDeLinha(C.headerFontSize);
    const alturaReadyBlock =
      Math.max(alturaDeLinha(C.readyHeroSize), alturaDeLinha(OVERTIME_TEXT_FONT_SIZE)) +
      C.neonBlockPaddingTop +
      C.neonBlockPaddingBottom;
    const alturaNextUp =
      alturaDeLinha(NEXTUP_LABEL_FONT_SIZE) + NEXTUP_INNER_SPACING + alturaDeLinha(NEXTUP_DETAIL_FONT_SIZE);

    const total =
      2 * C.cardVerticalPadding +
      alturaHeader +
      C.bodySpacing +
      alturaReadyBlock +
      C.bodySpacing +
      alturaNextUp;

    expect(total).toBeLessThanOrEqual(TETO_COM_MARGEM_PT);
  });
});

// Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo dono):
// os heróis de .resting e .readyOvertime são blocos preenchidos de neon com
// texto PRETO, tipografia condensada em caixa alta. Os tamanhos exatos (antes
// literais >=60pt/>=64pt, agora as constantes restHeroSize/readyHeroSize)
// viraram parte do describe de orçamento de altura acima — este bloco trava
// só a ESTRUTURA/ESTILO que não mudou com a correção de 2026-08-24: preto
// sobre neon, condensado, sem glassEffect.
describe('redesenho "Identidade Forte" (agosto/2026) mantém blocos neon preenchidos e tipografia condensada', () => {
  it('herói do timer de descanso (lockScreenRestHero) usa restHeroSize condensado, preto, em ambos os ramos (com/sem restEndsAt)', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenRestHero\(_ state: SessionActivityAttributes\.ContentState\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    const tamanhos = bloco![1].match(/\.font\(\.system\(size: restHeroSize, weight: \.heavy\)\.width\(\.condensed\)\)/g) ?? [];
    // Um por ramo (restEndsAt presente / "—" de fallback) — se a contagem
    // cair, o fallback perdeu a apresentação heroica.
    expect(tamanhos.length).toBe(2);
    // Preto, não mais neon: o texto vive DENTRO do bloco preenchido a
    // neon — cor neon sobre fundo neon não teria contraste nenhum.
    expect(bloco![1]).toContain('.foregroundColor(.black)');
    expect(bloco![1]).not.toContain('neon');
  });

  it('herói "PRONTO" (fase .readyOvertime) usa readyHeroSize condensado, preto, dentro do bloco neon', () => {
    const bloco = widgetSwift.match(
      /Text\("PRONTO"\)\s*\n\s*\.font\(\.system\(size: readyHeroSize, weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.foregroundColor\(\.black\)/,
    );
    expect(bloco).not.toBeNull();
  });

  it('proíbe .glassEffect mesmo depois da correção de orçamento de altura — a trava de campo original (subárvore descartada em runtime) continua valendo', () => {
    expect(widgetSwift).not.toContain('glassEffect');
  });
});

// Previews de Live Activity para o canvas do Xcode (loop de iteração sem
// resign de dispositivo). O bloco inteiro precisa ficar isolado do binário
// de Release: SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG só existe na
// configuração Debug do target session-widget (project.pbxproj) — por isso
// o teste trava que os #Preview vivem dentro de um único `#if DEBUG` /
// `#endif` e não fora dele, em vez de só checar presença da string em
// qualquer lugar do arquivo.
describe('previews de Live Activity (canvas do Xcode)', () => {
  it('ficam inteiramente dentro de um guard #if DEBUG / #endif — nunca no binário de Release', () => {
    const blocoDebug = widgetSwift.match(/#if DEBUG\n([\s\S]*?)\n#endif/);
    expect(blocoDebug).not.toBeNull();
    const corpo = blocoDebug![1];

    // Nenhum #Preview sobra fora do bloco DEBUG.
    const totalPreviews = (widgetSwift.match(/#Preview\(/g) ?? []).length;
    const previewsNoBloco = (corpo.match(/#Preview\(/g) ?? []).length;
    expect(totalPreviews).toBeGreaterThanOrEqual(3);
    expect(previewsNoBloco).toBe(totalPreviews);
  });

  it('cobre as três fases do Lock Screen (.content) via a API nativa de preview de Live Activity', () => {
    const chamadas = widgetSwift.match(/#Preview\("[^"]+", as: \.content, using: SessionActivityAttributes\([^)]*\)\)/g) ?? [];
    expect(chamadas.length).toBeGreaterThanOrEqual(3);
    expect(widgetSwift).toMatch(/phase: \.resting,[\s\S]*?neonColor: "yellow"/);
    expect(widgetSwift).toMatch(/phase: \.measuring,[\s\S]*?neonColor: "blue"/);
    expect(widgetSwift).toMatch(/phase: \.readyOvertime,[\s\S]*?neonColor: "green"/);
  });
});
