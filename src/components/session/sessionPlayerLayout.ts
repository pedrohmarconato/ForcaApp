// src/components/session/sessionPlayerLayout.ts
// Constantes de layout da linha de medição do SessionPlayer. Vivem fora do
// componente porque o teste de layout precisa delas sem arrastar o store (e,
// com ele, o cliente Supabase) para dentro do jest.

/**
 * Campo de carga dentro do stepper (−/valor/+).
 *
 * `minWidth: 0` é OBRIGATÓRIO, não cosmético: o react-native-web reseta
 * `min-width: 0` em View, mas NÃO em TextInput — o <input> fica com
 * `min-width: auto`, cuja largura intrínseca (size=20 a 24px) é ~278px. Como
 * item de um flex row, ele então se recusa a encolher e empurra o botão "+"
 * para fora da tela no iPhone 13 (medido: borda direita em 548,7px numa tela
 * de 390pt — 158,7pt fora).
 */
export const LOAD_INPUT_STYLE = { flex: 1, minWidth: 0 } as const;

/**
 * Valor central do stepper de reps (−/valor/+), Fase 17 (D-05): mesma classe
 * de bug de largura no react-native-web que motivou `LOAD_INPUT_STYLE` —
 * nome separado (em vez de reaproveitar `LOAD_INPUT_STYLE`) para os dois
 * campos poderem divergir no futuro sem reabrir este arquivo.
 */
export const REPS_INPUT_STYLE = { flex: 1, minWidth: 0 } as const;

/** Proporção do campo de reps na linha de medição. */
export const FIELD_FLEX = 1;

/**
 * Qual exercício está no card ANIMADO neste instante — o gatilho da transição
 * de entrada.
 *
 * Durante o descanso o card na tela é o do timer, que não anima. O rascunho,
 * porém, já aponta para o próximo exercício assim que a última série fecha. Se
 * o gatilho viesse do rascunho, a animação de 260ms correria (e terminaria)
 * atrás do card de descanso, e o exercício novo entraria sem transição nenhuma
 * — exatamente o que o redesign queria resolver. Devolver `null` no descanso
 * segura o gatilho até o card animado voltar à tela.
 */
export const idDoExercicioNoCard = (params: {
  ativo: string | null;
  proximo: string | null;
  emDescanso: boolean;
}): string | null => {
  if (params.emDescanso) return null;
  return params.ativo ?? params.proximo ?? null;
};

/**
 * Proporção do campo de carga. Era 1.8, o que deixava 60,3pt úteis — e "102,5"
 * ocupa 62pt na fonte real (Inter 600 a 24px). Carga de três dígitos com
 * decimal era cortada mesmo depois do minWidth; 2.2 resolve com folga.
 */
export const FIELD_WIDE_FLEX = 2.2;
