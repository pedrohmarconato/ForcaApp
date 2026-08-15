// public/push-handlers.js
// Script solto, sem bundler — mesmo padrão de register-sw.js: o passthrough
// de public/ do Expo copia este arquivo verbatim para dist/. Injetado no
// topo do sw.js GERADO pelo workbox generateSW via
// `importScripts: ['push-handlers.js']` (workbox-config.cjs) — este arquivo
// em si NÃO passa pelo build.
//
// Registra os listeners 'push'/'notificationclick' DENTRO do escopo do
// service worker (self), não do documento (PUSH-01 restante + PUSH-05).
//
// Regra inegociável (Pitfall 4 de 13-RESEARCH.md, prova em
// __tests__/pushHandlers.test.ts): TODA mensagem 'push' termina em
// self.registration.showNotification(), sem exceção — silent push é
// proibido no iOS Safari e revoga a subscription. Nenhum fetch/XHR próprio
// dentro do listener 'push'.
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'ForçaApp', body: event.data ? event.data.text() : '' };
  }
  var title = data.title || 'ForçaApp';
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' }, // deep link — usado no notificationclick
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// PUSH-05: toque na notificação foca uma janela existente e navega (reusa a
// rota recuperável por URL de linkingConfig.ts — home/active-session/:id),
// ou abre uma nova janela se nenhuma estiver aberta. Nunca deixa o evento
// sem waitUntil.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ('navigate' in client) {
          client.navigate(url);
          if ('focus' in client) {
            return client.focus();
          }
          return client;
        }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    })
  );
});
