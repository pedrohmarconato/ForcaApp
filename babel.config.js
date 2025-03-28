//Criar/atualizar babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Removida a entrada 'module:react-native-dotenv'
      'react-native-reanimated/plugin', // Mantenha este, é necessário!
    ],
  };
};
