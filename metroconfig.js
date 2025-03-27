// metro.config.js
const { getDefaultConfig } = require('@react-native/metro-config');

module.exports = (async () => {
  const defaultConfig = await getDefaultConfig();
  
  return {
    ...defaultConfig,
    resolver: {
      ...defaultConfig.resolver,
      sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs'],
    },
    transformer: {
      ...defaultConfig.transformer,
      babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
  };
})();