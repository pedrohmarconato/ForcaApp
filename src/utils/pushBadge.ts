// src/utils/pushBadge.ts
// Badge do ícone do app (PUSH-04) — Badging API (navigator.setAppBadge/
// clearAppBadge), gated por suporte E permissão de notificação concedida.
//
// Regra do 13-RESEARCH.md (Pitfall 4): o badge nunca é atualizado por um
// push silencioso em segundo plano — só pela própria página recalculando no
// foco. Este util não decide O QUE contar (isso é responsabilidade exclusiva
// de quem chama, ex.: HomeScreen.tsx via `ehHoje`/`todaySession.status`) —
// só decide SE/COMO chamar a API do navegador, com no-op silencioso quando
// a API não existe (iOS < 16.4), quando a permissão não foi concedida
// (default/denied), ou quando a Promise retornada rejeita.
//
// `lib.dom` do TypeScript já tipa `Navigator.setAppBadge`/`clearAppBadge`
// (via `NavigatorBadge`) como sempre presentes (não-opcionais) — por isso o
// guard de RUNTIME abaixo (browsers reais sem suporte, ex. iOS < 16.4, não
// implementam o método mesmo com o tipo declarando-o presente) passa por
// `navigator as unknown as Record<string, unknown>` pontual: usar `'x' in
// navigator` diretamente faria o TS estreitar o ramo "ausente" para `never`
// (já que a interface promete a propriedade sempre presente), quebrando a
// checagem defensiva que o runtime exige.
export const updateTrainingBadge = (pendente: boolean): void => {
  if (typeof navigator === 'undefined' || typeof Notification === 'undefined') {
    return;
  }

  const navegadorDinamico = navigator as unknown as Record<string, unknown>;

  if (!('setAppBadge' in navegadorDinamico) || Notification.permission !== 'granted') {
    return;
  }

  if (pendente) {
    navigator.setAppBadge(1).catch(() => {});
    return;
  }

  if ('clearAppBadge' in navegadorDinamico) {
    navigator.clearAppBadge().catch(() => {});
  } else {
    navigator.setAppBadge(0).catch(() => {});
  }
};
