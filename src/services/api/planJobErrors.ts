// src/services/api/planJobErrors.ts
// Módulo sem dependências: telas e testes importam a classe sem arrastar o
// apiClient (e o cliente Supabase) junto.

/**
 * O app perdeu o acompanhamento do job — NÃO significa que a geração falhou.
 * O servidor segue gerando e grava o plano; quem captura este erro precisa
 * procurar o plano salvo antes de reportar falha ao aluno.
 */
export class AcompanhamentoPerdidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcompanhamentoPerdidoError';
  }
}
