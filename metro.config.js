const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @opentelemetry/api (pulled in by supabase-js) uses dynamic import()
// which Hermes cannot compile. Force Metro to transpile it.
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@opentelemetry/.*)',
];

module.exports = config;
