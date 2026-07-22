module.exports = function(api) {
  api.cache(true);
  return {
    // unstable_transformImportMeta: o Zustand v4 usa `import.meta.env.MODE`
    // nos avisos de deprecação. O bundle web do Expo é carregado como script
    // clássico (não ESM), onde `import.meta` é ERRO DE SINTAXE — e um único
    // SyntaxError derruba o app inteiro (tela branca). Esta flag reescreve
    // essas referências. Inofensiva no nativo, onde import.meta também não
    // existe.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // Env do app: só EXPO_PUBLIC_* via babel-preset-expo (process.env inline).
    // O react-native-dotenv/@env foi removido — nada mais importa de '@env'.
    // Reanimated 4: o plugin (react-native-worklets/plugin) é injetado
    // automaticamente pelo babel-preset-expo do SDK 54 — não listar aqui.
  };
};