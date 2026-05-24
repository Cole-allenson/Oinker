const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// supabase-js uses dynamic import() for optional otel tracing which Hermes
// cannot compile. Use a custom transformer to replace it with Promise.resolve(null).
config.transformer.babelTransformerPath = require.resolve('./metro-transformer.js');

module.exports = config;
