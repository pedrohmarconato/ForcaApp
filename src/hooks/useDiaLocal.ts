// src/hooks/useDiaLocal.ts
// Fonte VIVA do dia local (YYYY-MM-DD) para telas que agregam "a semana".
//
// Um `new Date()` capturado por useMemo congela a referência: a tela aberta no
// domingo às 23:59 continuaria mostrando a semana velha depois da meia-noite
// (achado #7 do review do PR #13). Este hook vira o dia por timer de
// meia-noite e recalcula quando o app volta ao primeiro plano — o caminho
// comum de um app que passou a noite em segundo plano.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Data local (não UTC) no formato YYYY-MM-DD. */
export const chaveDiaLocal = (agora: Date): string => {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
};

export const useDiaLocal = (): string => {
  const [dia, setDia] = useState(() => chaveDiaLocal(new Date()));

  useEffect(() => {
    const atualizar = () => setDia(chaveDiaLocal(new Date()));

    // Margem de 1s após a meia-noite: garante que o relógio já virou mesmo
    // com imprecisão de agendamento do timer.
    let timer: ReturnType<typeof setTimeout>;
    const armarParaMeiaNoite = () => {
      const agora = new Date();
      const meiaNoite = new Date(agora);
      meiaNoite.setHours(24, 0, 0, 0);
      timer = setTimeout(() => {
        atualizar();
        armarParaMeiaNoite();
      }, meiaNoite.getTime() - agora.getTime() + 1000);
    };
    armarParaMeiaNoite();

    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') atualizar();
    });

    return () => {
      clearTimeout(timer);
      assinatura.remove();
    };
  }, []);

  return dia;
};
