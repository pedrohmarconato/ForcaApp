// src/utils/comTimeout.ts
// Limite de tempo para uma promise. Sem teto, uma consulta que nunca resolve
// nem rejeita prende a UI num estado de carregamento infinito.
//
// Usado pelos dois guards de sessão em andamento (Perfil e regeneração):
// depois do teto, a checagem vira erro tratado (fail-closed) com retry.

export const comTimeout = <T,>(promessa: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tempo limite excedido na checagem.')), ms);
  });
  // Se o timeout vencer, a promise original segue no ar; o handler interno do
  // Promise.race já a consome, então não há rejeição não tratada depois.
  return Promise.race([promessa, timeout]).finally(() => clearTimeout(timer));
};

// Orçamento compartilhado das duas checagens de sessão em andamento.
export const GUARD_TIMEOUT_MS = 10000;
