// src/components/opening/timeline.ts
// Fonte única de tempos, easings e escalas da abertura de cold start.
//
// Origem: protótipo aprovado pelo dono —
//   scratchpad/intro-proto/abertura-v2.html (timeline principal, "peso
//   caindo" do wordmark) e abertura-hold.html (variante de espera: pulso do
//   módulo do topo enquanto o app não está pronto). A função `seek(t)` de
//   cada arquivo é a especificação executável: os componentes desta pasta
//   portam a mesma matemática para worklets Reanimated.
//
// Nenhum componente desta pasta deve ter número mágico — todo tempo, easing
// ou escala usado em ProgressiveSymbol/WordmarkDrop/useOpeningTimeline vem
// daqui, nomeado.

// --- Geometria dos módulos --------------------------------------------
// Extraída sem alteração de src/components/ui/Logo.tsx (viewBox 96×96):
//   top:  M14 14H84L76 34H6Z   -> y 14..34, aresta superior 14..84 (largura 70)
//   mid:  M14 39H68L60 59H6Z   -> y 39..59, aresta superior 14..68 (largura 54)
//   base: M14 64H50L42 84H6Z   -> y 64..84, aresta superior 14..50 (largura 36)
// Os três módulos compartilham a MESMA aresta esquerda antes da inclinação
// (top-left x=14) e o MESMO deslocamento ao inclinar (bottom-left x=6,
// deslocamento -8 ao longo de 20 de altura) — por isso os três, uma vez
// inclinados, alinham a aresta inferior-esquerda na mesma linha vertical.
export const MODULE_SKEW_DX = 8;
export const MODULE_SKEW_DY = 20;
// atan(8/20) ≈ 21.8014...° — negativo porque a aresta inferior desloca para
// a ESQUERDA conforme y cresce.
export const MODULE_SKEW_DEG =
  -(Math.atan(MODULE_SKEW_DX / MODULE_SKEW_DY) * 180) / Math.PI;
export const MODULE_SKEW_TRANSFORM = `${MODULE_SKEW_DEG.toFixed(2)}deg`;

export const MODULE_HEIGHT_UNITS = 20;
export const MODULE_GAP_UNITS = 5; // 39-34 e 64-59
export const MODULE_TOP_WIDTH_UNITS = 70;
export const MODULE_MID_WIDTH_UNITS = 54;
export const MODULE_BASE_WIDTH_UNITS = 36;

// Caixa delimitadora do símbolo inteiro (união dos 3 módulos após a
// inclinação): esquerda = aresta inferior comum (x=6), direita = aresta
// superior do módulo do topo (x=84) -> largura 78; topo do módulo de cima
// (y=14) até base do módulo de baixo (y=84) -> altura 70.
export const MARK_BOUNDING_WIDTH_UNITS = 78;
export const MARK_BOUNDING_HEIGHT_UNITS =
  MODULE_HEIGHT_UNITS * 3 + MODULE_GAP_UNITS * 2; // 70
// Recuo da aresta superior de cada módulo em relação à borda esquerda da
// caixa delimitadora (a aresta inferior, após inclinar, encosta em x=0).
export const MODULE_LEFT_INSET_UNITS = MODULE_SKEW_DX; // 8

// --- Escala responsiva ---------------------------------------------------
export const REFERENCE_SCREEN_WIDTH = 390;
// Teto da escala: acima disso (tablet, ex. 768px de largura) o símbolo e o
// wordmark parariam de crescer proporcionalmente à tela e ficariam grandes
// demais (achado do review adversarial do PR #81) — 1.25 mantém o símbolo
// em até 168*1.25=210px mesmo em telas bem largas.
export const MAX_OPENING_SCALE = 1.25;
// Largura da caixa delimitadora do símbolo numa tela de 390px; proporcional
// em telas menores (ver useSymbolScale em ProgressiveSymbol.tsx).
export const SYMBOL_WIDTH_AT_REFERENCE = 168;
// Tamanho de fonte do wordmark numa tela de 390px — mantém a largura do
// wordmark em ~78% da largura da tela (WORDMARK_MAX_WIDTH_RATIO).
export const WORDMARK_FONT_SIZE_AT_REFERENCE = 100;
export const WORDMARK_MAX_WIDTH_RATIO = 0.78;
export const WORDMARK_LETTER_SPACING_EM = 0.06;
// Gap símbolo -> wordmark ≈ 1 altura de módulo (em unidades da mesma escala
// do símbolo, calculado em ProgressiveSymbol/AppOpening).
export const SYMBOL_TO_WORDMARK_GAP_UNITS = MODULE_HEIGHT_UNITS;

// --- Easings (tuplas cubic-bezier, sem número mágico nos componentes) -----
export const FILL_EASE = [0.2, 0.8, 0.2, 1] as const; // preenchimento dos módulos
export const FALL_EASE = [0.7, 0, 1, 1] as const; // queda das letras
export const LAND_EASE = FILL_EASE; // recuperação do pouso — mesmo ease-out do sistema

// --- Trilha do preenchimento (ms desde o mount) ---------------------------
export const CUT_TO_TRACKS_MS = 120; // corte seco: trilhas grafite aparecem
export const BASE_FILL_START_MS = 160;
export const BASE_FILL_END_MS = 400;
export const MID_FILL_START_MS = 380;
export const MID_FILL_END_MS = 680;
export const TOP_FILL_START_MS = 660;
export const TOP_FILL_END_MS = 1000;

// --- Impacto (1000ms) ------------------------------------------------------
export const IMPACT_MS = TOP_FILL_END_MS;
export const IMPACT_BUMP_PX = 2;
export const IMPACT_BUMP_DURATION_MS = 90;
export const FRAME_DURATION_MS = 1000 / 60;
export const FLASH_FRAME_COUNT = 2;
export const FLASH_DURATION_MS = FRAME_DURATION_MS * FLASH_FRAME_COUNT; // ~33.33ms
export const FLASH_OVERLAY_OPACITY = 0.3; // simula brilho 1.3 (overlay branco)
// Háptico nativo de impacto (medium) — dispara junto do corte seco de cor.
export const IMPACT_HAPTIC_DELAY_MS = IMPACT_MS;

// --- Wordmark "FORÇA" — queda letra a letra --------------------------------
export const LETTERS = ['F', 'O', 'R', 'Ç', 'A'] as const;
export const LETTER_CASCADE_START_MS = 1040;
export const LETTER_CASCADE_STEP_MS = 22;
export const LETTER_FALL_DURATION_MS = 110;
export const LETTER_FALL_START_Y = -34;
export const LETTER_FALL_START_SCALE = 1.14;

export const LETTER_LAND_CRUSH_SCALE_X = 1.08;
export const LETTER_LAND_CRUSH_SCALE_Y = 0.86;
export const LETTER_LAND_CRUSH_HOLD_MS = 50; // esmagamento sustentado
export const LETTER_LAND_OVERSHOOT_SCALE_Y = 1.04;
export const LETTER_LAND_OVERSHOOT_AT_MS = 80; // ponto intermediário (desde o pouso)
export const LETTER_LAND_RECOVER_AT_MS = 150; // recuperação total (desde o pouso)

export const LETTER_START_TIMES_MS: readonly number[] = LETTERS.map(
  (_letter, index) => LETTER_CASCADE_START_MS + index * LETTER_CASCADE_STEP_MS,
);
export const FIRST_LETTER_LAND_MS =
  LETTER_START_TIMES_MS[0] + LETTER_FALL_DURATION_MS; // 1150
export const LAST_LETTER_LAND_MS =
  LETTER_START_TIMES_MS[LETTER_START_TIMES_MS.length - 1] +
  LETTER_FALL_DURATION_MS; // 1238
// Háptico nativo pesado — pouso da última letra ("o peso finalmente aterrissa").
export const LAST_LETTER_HAPTIC_DELAY_MS = LAST_LETTER_LAND_MS;

// --- Tremor de tela: pouso da 1ª e da última letra -------------------------
export const SCREEN_TREMOR_STEPS_PX = [3, -2, 1, 0] as const;
export const SCREEN_TREMOR_STEP_MS = 40;
export const SCREEN_TREMOR_DURATION_MS =
  SCREEN_TREMOR_STEPS_PX.length * SCREEN_TREMOR_STEP_MS; // 160

// Duração do "relógio" visual que dirige módulos + wordmark + tremores +
// flash — cobre do mount até o último evento (tremor da última letra).
export const CLOCK_DURATION_MS =
  LAST_LETTER_LAND_MS + SCREEN_TREMOR_DURATION_MS; // 1398

// --- Saída / espera ---------------------------------------------------------
export const READY_EXIT_MS = 1700; // corte seco de saída, sem fade, quando pronto
// Início do pulso do módulo do topo se o app ainda não está pronto.
export const PULSE_START_MS = 1160;
export const PULSE_PERIOD_MS = 900;
export const PULSE_OPACITY_MIN = 0.7;
export const PULSE_OPACITY_MAX = 1.0;
export const ABSOLUTE_CEILING_MS = 6000; // teto: sai mesmo sem estar pronto

// Escala do símbolo/wordmark a partir da largura da tela — linear até
// MAX_OPENING_SCALE, depois trava (achado do review adversarial do PR #81:
// sem teto, um tablet de 768px levava o símbolo a 331px). Pura (sem
// React/Reanimated) — usada por AppOpening.tsx.
export const computeOpeningScale = (screenWidth: number): number =>
  Math.min(screenWidth / REFERENCE_SCREEN_WIDTH, MAX_OPENING_SCALE);

// --- Geometria derivada (px) -----------------------------------------------
// Converte a geometria em unidades (acima) para pixels, a partir da largura
// alvo do símbolo. Pura (sem Reanimated/React) — usada por
// ProgressiveSymbol.tsx no cálculo do layout de cada módulo.
export type SymbolGeometry = {
  unitScale: number;
  markWidthPx: number;
  markHeightPx: number;
  moduleHeightPx: number;
  moduleGapPx: number;
  leftInsetPx: number;
  topWidthPx: number;
  midWidthPx: number;
  baseWidthPx: number;
};

export const computeSymbolGeometry = (symbolWidthPx: number): SymbolGeometry => {
  const unitScale = symbolWidthPx / MARK_BOUNDING_WIDTH_UNITS;
  return {
    unitScale,
    markWidthPx: symbolWidthPx,
    markHeightPx: MARK_BOUNDING_HEIGHT_UNITS * unitScale,
    moduleHeightPx: MODULE_HEIGHT_UNITS * unitScale,
    moduleGapPx: MODULE_GAP_UNITS * unitScale,
    leftInsetPx: MODULE_LEFT_INSET_UNITS * unitScale,
    topWidthPx: MODULE_TOP_WIDTH_UNITS * unitScale,
    midWidthPx: MODULE_MID_WIDTH_UNITS * unitScale,
    baseWidthPx: MODULE_BASE_WIDTH_UNITS * unitScale,
  };
};
