module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Env do app: só EXPO_PUBLIC_* via babel-preset-expo (process.env inline).
      // O react-native-dotenv/@env foi removido — nada mais importa de '@env'.
      // Plugin do Reanimated (IMPORTANTE: deve ser o último plugin)
      'react-native-reanimated/plugin',
    ],
  };
};