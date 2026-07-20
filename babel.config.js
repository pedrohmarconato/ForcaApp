module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Env do app: só EXPO_PUBLIC_* via babel-preset-expo (process.env inline).
    // O react-native-dotenv/@env foi removido — nada mais importa de '@env'.
    // Reanimated 4: o plugin (react-native-worklets/plugin) é injetado
    // automaticamente pelo babel-preset-expo do SDK 54 — não listar aqui.
  };
};