const upstreamTransformer = require('@expo/metro-config/build/babel-transformer');

module.exports.transform = function (params) {
  if (params.filename && params.filename.includes('@supabase/supabase-js')) {
    params = {
      ...params,
      src: params.src.replace(
        /otelModulePromise = import\([\s\S]*?\)\.catch\(\(\) => null\)/,
        'otelModulePromise = Promise.resolve(null)'
      ),
    };
  }
  return upstreamTransformer.transform(params);
};
