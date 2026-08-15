// public/register-sw.js
// Script solto, sem bundler — o passthrough de public/ do Expo copia este
// arquivo verbatim para dist/. Carregado via <script src="/register-sw.js"
// defer> em public/index.html (a CSP de produção proíbe script inline —
// 11-RESEARCH.md Pitfall #4).
//
// Registra /sw.js (gerado pelo workbox generateSW no build) e faz a ponte
// entre o ciclo de vida do service worker e o React: nunca importa a store
// Zustand diretamente (este arquivo não passa pelo Metro), então a
// comunicação é via window CustomEvent nos dois sentidos, seguindo o mesmo
// padrão de host global já usado por alertStore.ts/AlertHost.tsx.
//
// Contrato de eventos:
//   - window despacha 'sw-update-available' quando uma atualização real (não
//     a primeira instalação) fica pronta em `registration.waiting`.
//   - window escuta 'sw-apply-update' (disparado pelo UpdateBanner do Plano
//     11-02 ao tocar "Atualizar") e manda SKIP_WAITING pro worker em espera.
//
// NUNCA auto-reload: o único window.location.reload() deste arquivo só roda
// depois do 'controllerchange' que segue o SKIP_WAITING explícito do
// usuário — nunca automaticamente, mesmo com o app aberto durante um treino.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') {
    return;
  }

  var registration;
  var refreshing = false;

  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    registration = reg;

    // Guarda de condição de corrida: se um worker em espera já existe no
    // momento em que register() resolve (ex.: segunda visita rápida que
    // corre na frente do evento 'updatefound'), o evento pode disparar antes
    // do React montar o listener. Checagem síncrona cobre esse caso.
    if (reg.waiting && navigator.serviceWorker.controller) {
      window.dispatchEvent(new CustomEvent('sw-update-available'));
    }

    reg.addEventListener('updatefound', function () {
      var installing = reg.installing;
      if (!installing) return;

      installing.addEventListener('statechange', function () {
        // controller existente => isto é uma ATUALIZAÇÃO, não a primeira
        // instalação (11-RESEARCH.md Pitfall #7 — sem esta checagem o
        // banner apareceria também na primeira instalação, sem nenhuma
        // versão anterior para atualizar).
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('sw-update-available'));
        }
      });
    });
  });

  window.addEventListener('sw-apply-update', function () {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // Guarda contra reload em loop (11-RESEARCH.md Pitfall #8):
    // 'controllerchange' pode disparar mais de uma vez (múltiplas abas, uma
    // segunda mensagem SKIP_WAITING em trânsito) — reload só roda uma vez.
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();
