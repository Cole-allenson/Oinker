const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @opentelemetry/api (pulled in by supabase-js) uses dynamic import()
// which Hermes cannot compile. Stub it out entirely.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.includes('@opentelemetry')) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
