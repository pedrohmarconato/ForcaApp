// Faixas de tempo por treino oferecidas no questionário.
//
// O valor escolhido vira `tempo_medio_treino_min` e o editor manual o usa como
// estimativa de CADA treino — número que segue para o `estimated_minutes` do
// plano. Por isso ele mora aqui, num módulo sem dependência de tela: é dado de
// contrato, não detalhe de renderização.
//
// Regra: o valor nunca pode prometer mais minutos do que o rótulo anuncia.
// "+90 min" valia 120 — meia hora que ninguém digitou, apresentada depois como
// escolha do aluno. Faixa sem teto declarado vale pelo piso.

export type TimeOption = { label: string; value: number };

export const TIME_OPTIONS: TimeOption[] = [
  { label: '30-45 min', value: 45 },
  { label: '45-60 min', value: 60 },
  { label: '60-90 min', value: 90 },
  { label: '+90 min', value: 90 },
];
