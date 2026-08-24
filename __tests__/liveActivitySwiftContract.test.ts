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
// timers/activityBackground/activitySecondary não mudaram.

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
    // Cabeçalho (3x), DESCANSO, timer de descanso (2 ramos), ±30s (2),
    // PULAR DESCANSO, valor+rótulo dos dois steppers (2+2+2+2), CONCLUIR
    // SÉRIE, PRONTO, tempo extra dentro do bloco, A SEGUIR (rótulo+detalhe).
    const usos = widgetSwift.match(/\.width\(\.condensed\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(16);
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
    expect(bloco![1]).toContain('.font(.system(size: 13, weight: .semibold).width(.condensed))');
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

  it('grupos de stepper viram contornados (stroke, não fill) e mantêm os glifos −/+ em >= 44×44pt', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenStepperGroup<Content: View>\(@ViewBuilder content: \(\) -> Content\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    expect(bloco![1]).toContain('.stroke(Color.white.opacity(0.14))');
    expect(bloco![1]).not.toContain('.fill(Color.white.opacity(0.08))');
    expect(bloco![1]).toContain('.padding(.horizontal, 12)');
    expect(bloco![1]).toContain('.padding(.vertical, 8)');

    // Os quatro glifos −/+ (reps e carga) preservam o ganho de acessibilidade
    // do commit anterior: 44×44pt é o mínimo, nunca regride para 40×40 (a
    // medida da maquete original da variante D) nem para 28×28 (a medida
    // anterior a esse ganho).
    const framesDosGlifos = Array.from(
      widgetSwift.matchAll(/Text\("[−+]"\)\s*\n\s*\.font\(\.title3\)\s*\n\s*\.fontWeight\(\.bold\)\s*\n\s*\.frame\(width: (\d+), height: (\d+)\)/g),
    );
    expect(framesDosGlifos.length).toBe(4);
    for (const [, largura, altura] of framesDosGlifos) {
      expect(Number(largura)).toBeGreaterThanOrEqual(44);
      expect(Number(altura)).toBeGreaterThanOrEqual(44);
    }
  });

  // BUG DE CAMPO (2026-08-22/24, iPhone 13 / iOS 26): o Button de
  // AdjustRepsIntent/AdjustLoadIntent só tinha `.frame(44×44)` no LABEL, não
  // no próprio Button — nada travava o tamanho do controle, então ele
  // crescia dentro do HStack da linha e comprimia o valor numérico e o
  // rótulo REPS/KG a largura zero (no aparelho: quatro elipses de neon
  // gigantes, nenhum número). Este bloco trava especificamente a correção
  // — não pode regredir silenciosamente numa refatoração futura do layout.
  it('trava a correção do bug de campo: botões de stepper com .fixedSize() e valor com .layoutPriority(1), reps/carga empilhados em vez de lado a lado', () => {
    const corpoLockScreen = widgetSwift.match(
      /private func lockScreenBody\(_ state: SessionActivityAttributes\.ContentState, now: Date\) -> some View \{([\s\S]*?)\nprivate func effectiveState\(/,
    );
    expect(corpoLockScreen).not.toBeNull();
    const casoMeasuring = corpoLockScreen![1].match(/case \.measuring:([\s\S]*?)case \.readyOvertime:/);
    expect(casoMeasuring).not.toBeNull();
    const corpo = casoMeasuring![1];

    // Reps e carga ficam em linhas separadas (VStack), uma por valor — não
    // mais lado a lado no mesmo HStack, que é o que deixava pouca largura
    // sobrando para o número mesmo depois do fixedSize. O container
    // imediato dos dois lockScreenStepperGroup precisa ser um VStack —
    // cada linha interna (botão/valor/rótulo/Spacer/botão) continua um
    // HStack, então a trava mira o container que os agrupa, não qualquer
    // HStack(spacing: 8) do arquivo.
    expect(corpo).toMatch(/VStack\(spacing: 8\) \{\s*\n\s*lockScreenStepperGroup \{/);
    expect(corpo).not.toMatch(/HStack\(spacing: 8\) \{\s*\n\s*lockScreenStepperGroup \{/);

    // Cada um dos quatro Button de −/+ trava o próprio tamanho com
    // `.fixedSize()` logo após fechar o corpo do Button (que já contém o
    // `.frame(width: 44, height: 44)` no label, verificado no teste
    // acima) — sem isso, o Button aceita a proposta flexível do HStack e
    // cresce além do seu conteúdo.
    const botoesTravados = Array.from(
      corpo.matchAll(/\.frame\(width: 44, height: 44\)\s*\n\s*\}\s*\n\s*\.fixedSize\(\)/g),
    );
    expect(botoesTravados.length).toBe(4);

    // O valor (reps e carga) recebe `.layoutPriority(1)` — nunca é o
    // primeiro a ceder espaço quando o HStack da linha fica apertado.
    const prioridadeValor = corpo.match(/\.layoutPriority\(1\)/g) ?? [];
    expect(prioridadeValor.length).toBe(2);
  });

  it('separa o valor do stepper do rótulo REPS/KG — "40 kg" concatenado não sobrevive', () => {
    expect(widgetSwift).not.toContain(' kg")');
    expect(widgetSwift).toMatch(
      /Text\("REPS"\)\s*\n\s*\.font\(\.system\(size: 11, weight: \.semibold\)\.width\(\.condensed\)\)\s*\n\s*\.tracking\(2\)\s*\n\s*\.foregroundColor\(activitySecondary\)/,
    );
    expect(widgetSwift).toMatch(
      /Text\("KG"\)\s*\n\s*\.font\(\.system\(size: 11, weight: \.semibold\)\.width\(\.condensed\)\)\s*\n\s*\.tracking\(2\)\s*\n\s*\.foregroundColor\(activitySecondary\)/,
    );
  });

  it('"PULAR DESCANSO" e "CONCLUIR SÉRIE" ficam em caixa alta, condensados, com tracking 1.8', () => {
    expect(widgetSwift).toMatch(
      /Text\("PULAR DESCANSO"\)\s*\n\s*\.font\(\.system\(size: 18, weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.tracking\(1\.8\)/,
    );
    expect(widgetSwift).toMatch(
      /Text\("CONCLUIR SÉRIE"\)\s*\n\s*\.font\(\.system\(size: 19, weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.tracking\(1\.8\)/,
    );
    expect(widgetSwift).toContain('.buttonBorderShape(.roundedRectangle(radius: 14))');
    // .capsule saiu de vez — os dois botões de largura total do redesenho
    // usam cantos arredondados explícitos, não mais cápsula.
    expect(widgetSwift).not.toContain('.buttonBorderShape(.capsule)');
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

  it('mantém os intents de ±30s de descanso como botões contornados ao lado do bloco neon (controlSize .small, borda branca sutil)', () => {
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
    expect(bloco![1]).toContain('.buttonStyle(.bordered)');
    expect(bloco![1]).toContain('.buttonBorderShape(.roundedRectangle(radius: 12))');
    expect(bloco![1]).toContain('.controlSize(.small)');
    // O chip .mini da rodada "card mais alto" anterior não sobrevive — os
    // botões voltam a ter uma área de toque maior ao lado do bloco neon.
    expect(widgetSwift).not.toContain('.controlSize(.mini)');
  });
});

// Redesenho "Identidade Forte" (agosto/2026, variante D aprovada pelo dono):
// os heróis de .resting e .readyOvertime deixam de ser texto neon sobre
// preto e viram blocos preenchidos de neon com texto PRETO, tipografia
// condensada em caixa alta. Os blocos abaixo travam a tipografia e as
// dimensões desse redesenho com asserções >=, não ===, para que uma correção
// futura possa crescer ainda mais sem quebrar o teste — só não pode
// REGREDIR para o tamanho/estilo da rodada anterior (68pt rounded neon, 56pt
// PRONTO rounded neon, glifos < 44pt) nem reintroduzir glassEffect (proibição
// já coberta acima, nunca revogada por este bloco).
describe('redesenho "Identidade Forte" (agosto/2026) crava blocos neon preenchidos e tipografia condensada', () => {
  it('herói do timer de descanso (lockScreenRestHero) usa condensado >= 60pt, preto, em ambos os ramos (com/sem restEndsAt)', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenRestHero\(_ state: SessionActivityAttributes\.ContentState\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    const tamanhos = Array.from(bloco![1].matchAll(/\.font\(\.system\(size: (\d+), weight: \.heavy\)\.width\(\.condensed\)\)/g)).map(
      (m) => Number(m[1]),
    );
    // Um tamanho por ramo (restEndsAt presente / "—" de fallback) — se a
    // contagem cair, o fallback perdeu a apresentação heroica.
    expect(tamanhos.length).toBe(2);
    // Correção de orçamento de altura (2026-08-24): caiu de 76 para 60pt na
    // mesma rodada em que .measuring passou a empilhar reps/carga — 60pt
    // ainda é hero, só não regride abaixo do piso que preserva a
    // identidade visual do bloco neon preenchido.
    for (const tamanho of tamanhos) {
      expect(tamanho).toBeGreaterThanOrEqual(60);
    }
    // Preto, não mais neon: o texto vive DENTRO do bloco preenchido a
    // neon — cor neon sobre fundo neon não teria contraste nenhum.
    expect(bloco![1]).toContain('.foregroundColor(.black)');
    expect(bloco![1]).not.toContain('neon');
  });

  it('herói "PRONTO" (fase .readyOvertime) usa condensado >= 64pt, preto, dentro do bloco neon', () => {
    const bloco = widgetSwift.match(
      /Text\("PRONTO"\)\s*\n\s*\.font\(\.system\(size: (\d+), weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.foregroundColor\(\.black\)/,
    );
    expect(bloco).not.toBeNull();
    expect(Number(bloco![1])).toBeGreaterThanOrEqual(64);
  });

  it('CONCLUIR SÉRIE continua .controlSize(.large); valores de stepper condensados >= 34pt', () => {
    // Só "CONCLUIR SÉRIE" preserva .controlSize(.large) — "PULAR DESCANSO"
    // virou uma faixa de fundo explícito (.buttonStyle(.plain)) sem chrome
    // de sistema, então não usa mais controlSize nenhum.
    const usosControlSizeLarge = widgetSwift.match(/\.controlSize\(\.large\)/g) ?? [];
    expect(usosControlSizeLarge.length).toBe(1);

    // Os DOIS valores de stepper (reps e carga) ficam em condensado preto-
    // sobre-branco >= 34pt — nenhum uso do padrão antigo baseado em
    // text style + design: .rounded sobra para eles. Caiu de 38 para 34pt
    // na correção de orçamento de altura de 2026-08-24 (mesma rodada em
    // que reps/carga passaram a empilhar em vez de ficar lado a lado —
    // ver o teste "trava a correção do bug de campo" acima).
    const usosValorStepper = Array.from(
      widgetSwift.matchAll(
        /\.font\(\.system\(size: (\d+), weight: \.heavy\)\.width\(\.condensed\)\)\s*\n\s*\.monospacedDigit\(\)\s*\n\s*\.foregroundColor\(\.white\)/g,
      ),
    );
    expect(usosValorStepper.length).toBe(2);
    for (const [, tamanho] of usosValorStepper) {
      expect(Number(tamanho)).toBeGreaterThanOrEqual(34);
    }

    // .title3 rounded (usado pelo tempo extra na rodada anterior) não
    // sobra em lugar nenhum — o tempo extra agora mora dentro do bloco
    // neon, condensado e preto.
    const usosTitle3Rounded = widgetSwift.match(/\.font\(\.system\(\.title3, design: \.rounded\)\)/g) ?? [];
    expect(usosTitle3Rounded.length).toBe(0);
  });

  it('proíbe .glassEffect mesmo depois do redesenho "Identidade Forte" — a trava de campo original (subárvore descartada em runtime) continua valendo', () => {
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
