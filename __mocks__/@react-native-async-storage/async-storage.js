// __mocks__/@react-native-async-storage/async-storage.js
// Fase 4 (REQ-07): mock manual automático (convenção do Jest — arquivos em
// <rootDir>/__mocks__/<pacote> aplicam-se a TODOS os testes que importam o
// pacote, sem precisar de jest.mock() por arquivo). Necessário porque
// sessionOutboxStorage.ts (novo nesta fase) importa AsyncStorage de verdade,
// e activeSessionStore.ts agora importa sessionOutboxStorage.ts
// transitivamente (via sessionOutboxDrain.ts) — qualquer teste que importe o
// store, direta ou indiretamente, carregava o módulo NATIVO do pacote
// (`[@RNC/AsyncStorage]: NativeModule: AsyncStorage is null`) fora de um
// ambiente React Native real. Reexporta o mock oficial do próprio pacote
// (implementação em memória, documentado em
// react-native-async-storage/async-storage/docs/advanced/jest).
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
