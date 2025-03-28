module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Adicionado plugin dotenv (IMPORTANTE: antes do reanimated)
      [
        'module:react-native-dotenv',
        {
          moduleName: '@env', // Como vamos importar as variáveis (ex: import { SUPABASE_URL } from '@env';)
          path: '.env', // Nome do arquivo onde as variáveis estarão
          safe: false, // Não exige um arquivo .env.safe
          allowUndefined: true, // Permite variáveis não definidas (cuidado!)
        },
      ],
      // Plugin do Reanimated (IMPORTANTE: deve ser o último plugin)
      'react-native-reanimated/plugin',
    ],
  };
};