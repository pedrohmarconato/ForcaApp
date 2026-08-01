// jest.web.config.js
// Treino Conjunto 2.0 — Sprint 02. Projeto Jest SÓ para renderizar os
// componentes React Native de verdade em markup web.
//
// Existe como arquivo NOVO, e não como mudança em `package.json`, porque a
// allowlist do contrato fecha os arquivos existentes que este sprint pode
// tocar. O preset `jest-expo/web` resolve `react-native` para
// `react-native-web`, que é o que permite `renderToStaticMarkup` produzir DOM
// a partir dos MESMOS componentes que o app monta.
//
// Rodar:  npx jest -c jest.web.config.js
// (é o que `scripts/joint-visual-evidence.mjs` chama antes de tirar os PNGs)

module.exports = {
  preset: 'jest-expo/web',
  testMatch: ['<rootDir>/scripts/visual/*.render.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['<rootDir>/scripts/visual/setup.js'],
};
