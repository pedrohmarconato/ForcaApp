// workbox-config.cjs
// Config do `workbox generateSW` (workbox-cli@7.4.1) que gera dist/sw.js no
// pipeline de build (Fase 11, OFF-01/OFF-02). Precacheia o app shell inteiro
// do Expo web export (JS, HTML, ícones, splash, fontes) e NADA MAIS — zero
// `runtimeCaching`: nenhuma chamada a Supabase/PostgREST/API Flask pode ser
// interceptada pelo service worker (decisão travada em 11-CONTEXT.md — o
// outbox offline-first do v1.0 segue como única camada de retry de dados).
//
// Duas armadilhas confirmadas gerando o dist/ real deste repo nesta pesquisa
// (11-RESEARCH.md Pitfalls #1 e #2) — nunca reverter estes dois valores para
// o default do Workbox:
//   - globIgnores: [] — o default (["**/node_modules/**/*"]) descarta em
//     silêncio as fontes de ícone vendorizadas em
//     dist/assets/node_modules/@expo/vector-icons/.../Fonts/*.ttf.
//   - maximumFileSizeToCacheInBytes >= 3325222 — o bundle web medido em
//     produção é 3.325.222 bytes, acima do default de 2MB do Workbox; sem
//     este aumento o bundle principal seria excluído do precache sem erro
//     visível, e o app shell offline (UAT de modo avião) simplesmente não
//     funcionaria.
module.exports = {
  globDirectory: 'dist',
  globPatterns: ['**/*.{js,html,ico,json,png,ttf}'],
  globIgnores: [],
  swDest: 'dist/sw.js',
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/_expo\//, /^\/api\//],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  inlineWorkboxRuntime: true,
  // Fase 13 (PUSH-01/PUSH-05): injeta os handlers push/notificationclick no
  // topo do sw.js gerado. public/push-handlers.js NÃO passa pelo build (é
  // passthrough de public/, mesmo padrão de register-sw.js) — só a chave
  // abaixo muda aqui, nenhuma das outras acima.
  importScripts: ['push-handlers.js'],
};
