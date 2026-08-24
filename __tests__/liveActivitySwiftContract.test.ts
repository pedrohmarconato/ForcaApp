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
  it('mantém cores estruturais e adota a tipografia rounded/numericText do redesenho', () => {
    expect(widgetSwift).toMatch(
      /private let activityBackground = Color\(red: 0\.039, green: 0\.039, blue: 0\.039\)/,
    );
    expect(widgetSwift).toMatch(
      /private let activitySecondary = Color\(red: 0\.545, green: 0\.565, blue: 0\.596\)/,
    );
    // Redesenho do Lock Screen (design aprovado, agosto/2026): tipografia
    // display em .rounded e números com transição numérica — substituem a
    // checagem antiga de .title2/.subheadline soltos no arquivo inteiro,
    // que não discriminava onde a fonte era usada.
    expect(widgetSwift).toContain('design: .rounded');
    expect(widgetSwift).toContain('.contentTransition(.numericText())');
    expect(widgetSwift).toContain('.monospacedDigit()');
  });

  it('mantém timers, intents e decoração da Activity', () => {
    const timers = widgetSwift.match(/Text\(timerInterval: Date\.now\.\.\.restEndsAt, countsDown: true\)/g) ?? [];
    expect(timers.length).toBe(2);
    expect(widgetSwift).toContain('AdjustRestIntent(deltaSeconds: -30)');
    expect(widgetSwift).toContain('SkipRestIntent()');
    expect(widgetSwift).toContain('AdjustRestIntent(deltaSeconds: 30)');
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

  it('adota o redesenho do Lock Screen aprovado (progress bar, botões prominence, sem "Ajustar no app")', () => {
    expect(widgetSwift).toContain('ProgressView(timerInterval:');
    expect(widgetSwift).toContain('.buttonStyle(.borderedProminent)');
    expect(widgetSwift).toContain('.buttonBorderShape(.capsule)');
    // Decisão aprovada (D-redesenho Lock Screen 2026-08): a dica "Ajustar no
    // app" sai da fase .measuring — não sobra em lugar nenhum do arquivo.
    expect(widgetSwift).not.toContain('Ajustar no app');
  });

  it('proíbe .glassEffect / #available(iOS 26 no widget — Live Activity roda por um motor de render (WidgetKit archive-based) que não suporta Liquid Glass em runtime; o modificador compilava mas derrubava a subárvore inteira em silêncio (grupos de reps/carga sumiam do card em iPhone com iOS 26), então o fallback translúcido plano vira o único estilo permitido', () => {
    expect(widgetSwift).not.toContain('glassEffect');
    expect(widgetSwift).not.toContain('#available(iOS 26');
  });

  it('ressuscita prescriptionText() no corpo do lock screen e tira nextUpLine da fase .measuring', () => {
    const corpoLockScreen = widgetSwift.match(
      /private func lockScreenBody\(_ state: SessionActivityAttributes\.ContentState, now: Date\) -> some View \{([\s\S]*?)\nprivate func effectiveState\(/,
    );
    expect(corpoLockScreen).not.toBeNull();
    const corpo = corpoLockScreen![1];

    // prescriptionText() já existia no arquivo (usada por primaryValue, que
    // só a Dynamic Island chama) mas era código morto dentro do lock
    // screen — o redesenho ressuscita a meta prescrita na fase .measuring.
    expect(corpo).toContain('prescriptionText(state)');

    const casoMeasuring = corpo.match(/case \.measuring:([\s\S]*?)case \.readyOvertime:/);
    expect(casoMeasuring).not.toBeNull();
    expect(casoMeasuring![1]).toContain('prescriptionText(state)');
    // Decisão aprovada: nextUpLine() (rodapé "A SEGUIR") não aparece mais
    // na fase .measuring — só em .resting e .readyOvertime.
    expect(casoMeasuring![1]).not.toContain('nextUpLine(state)');
  });
});

// Card maior no Lock Screen (agosto/2026): o dono pediu que o card pare de
// "parecer pequeno" no iPhone 13 sem estourar o teto do sistema (~160pt de
// altura útil na apresentação de Lock Screen). Os blocos abaixo travam o
// ganho de tamanho dos dois heróis (timer de descanso e "PRONTO") com
// asserções >=, não ===, para que uma correção futura possa crescer ainda
// mais sem quebrar o teste — só não pode REGREDIR para o tamanho antigo
// (44pt/34pt) nem reintroduzir glassEffect (proibição já coberta acima,
// nunca revogada por este bloco).
describe('redesenho "card maior" (agosto/2026) crava o ganho de tamanho dos heróis', () => {
  it('herói do timer de descanso (lockScreenRestHero) cresce para >= 52pt em ambos os ramos (com/sem restEndsAt)', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenRestHero\(_ state: SessionActivityAttributes\.ContentState, neon: Color\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    const tamanhos = Array.from(bloco![1].matchAll(/\.font\(\.system\(size: (\d+), weight: \.heavy, design: \.rounded\)\)/g)).map(
      (m) => Number(m[1]),
    );
    // Um tamanho por ramo (restEndsAt presente / "—" de fallback) — se a
    // contagem cair, o fallback perdeu a apresentação heroica.
    expect(tamanhos.length).toBe(2);
    for (const tamanho of tamanhos) {
      expect(tamanho).toBeGreaterThanOrEqual(52);
    }
  });

  it('herói "PRONTO" (fase .readyOvertime) cresce para >= 44pt', () => {
    const bloco = widgetSwift.match(/Text\("PRONTO"\)\s*\n\s*\.font\(\.system\(size: (\d+), weight: \.heavy, design: \.rounded\)\)/);
    expect(bloco).not.toBeNull();
    expect(Number(bloco![1])).toBeGreaterThanOrEqual(44);
  });

  it('cabeçalho comum sai de .caption para .subheadline com minimumScaleFactor (nome de exercício longo não trunca sem chance de encolher)', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenHeaderLine\(_ state: SessionActivityAttributes\.ContentState\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    expect(bloco![1]).toContain('.font(.subheadline)');
    expect(bloco![1]).toMatch(/\.minimumScaleFactor\(0\.\d+\)/);
    expect(bloco![1]).not.toContain('.font(.caption)');
  });

  it('grupos de stepper (.measuring) crescem a área de toque: padding maior e glifos +/- com frame explícito', () => {
    const bloco = widgetSwift.match(
      /private func lockScreenStepperGroup<Content: View>\(@ViewBuilder content: \(\) -> Content\) -> some View \{([\s\S]*?)\n\}/,
    );
    expect(bloco).not.toBeNull();
    expect(bloco![1]).toContain('.padding(.horizontal, 12)');
    expect(bloco![1]).toContain('.padding(.vertical, 8)');

    // Os quatro glifos −/+ (reps e carga) ganham frame explícito >= 28pt —
    // antes eram Text() sem nenhum modificador de tamanho/tap-target.
    const framesDosGlifos = widgetSwift.match(/Text\("[−+]"\)\s*\n\s*\.font\(\.title3\)\s*\n\s*\.fontWeight\(\.bold\)\s*\n\s*\.frame\(width: (\d+), height: (\d+)\)/g) ?? [];
    expect(framesDosGlifos.length).toBe(4);
  });

  it('botões primários (Pular, Concluir série) e valores de stepper crescem — .controlSize(.large) e fonte .title2', () => {
    const usosControlSizeLarge = widgetSwift.match(/\.controlSize\(\.large\)/g) ?? [];
    expect(usosControlSizeLarge.length).toBe(2);

    // Os DOIS valores de stepper (reps e carga) saem de .title3 para
    // .title2 rounded — crescem porque são "lidos de longe" (D-instrução:
    // priorizar números sobre texto secundário). overtimeText (readyOvertime)
    // segue .title3 rounded de propósito — é texto secundário ao lado do
    // herói "PRONTO" e não deveria crescer junto, então continua existindo
    // exatamente 1 uso de .title3 rounded no arquivo.
    const usosTitle2Rounded = widgetSwift.match(/\.font\(\.system\(\.title2, design: \.rounded\)\)/g) ?? [];
    expect(usosTitle2Rounded.length).toBe(2);
    const usosTitle3Rounded = widgetSwift.match(/\.font\(\.system\(\.title3, design: \.rounded\)\)/g) ?? [];
    expect(usosTitle3Rounded.length).toBe(1);
  });

  it('proíbe .glassEffect mesmo depois do redesenho maior — a trava de campo original (subárvore descartada em runtime) continua valendo', () => {
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
