const webpack = require('webpack');
const { RuntimeModule } = webpack;
const { JavascriptModulesPlugin } = webpack.javascript;
const { ReplaceSource } = require('webpack-sources');

class JSONPNamespacePlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('JSONPNamespacePlugin', compilation => {
      if (!isPluginRequired(compilation)) return;
      compilation.hooks.additionalTreeRuntimeRequirements.tap('JSONPNamespacePlugin', (chunk, set) => {
        if (!isEnabledForChunk(compilation, chunk)) return;
        compilation.addRuntimeModule(chunk, new JSONPNamespaceRuntimeModule());
      });
    });

    compiler.hooks.compilation.tap('JSONPNamespacePlugin', compilation => {
      if (!isPluginRequired(compilation)) return;

      JavascriptModulesPlugin.getCompilationHooks(compilation).renderMain.tap('JSONPNamespacePlugin', source => {
        return replaceTemplate(compilation, source);
      });

      JavascriptModulesPlugin.getCompilationHooks(compilation).renderChunk.tap('JSONPNamespacePlugin', source => {
        return replaceTemplate(compilation, source);
      });
    });
  }
}

class JSONPNamespaceRuntimeModule extends RuntimeModule {
  constructor() {
    super('jsonp namespace plugin init');
  }
  generate() {
    const { chunkLoadingGlobal } = this.compilation.outputOptions;
    return chunkLoadingGlobal.split('.').map((item, index, array) => {
      const prop = array.slice(0, index + 1).join('.');
      return index < array.length - 1 ? `self.${prop} = self.${prop} || {};` : ``;
    }).filter(str => str.length).join('\n');
  }
}

const isPluginRequired = (compilation) => {
  const { chunkLoadingGlobal } = compilation.outputOptions;
  return chunkLoadingGlobal.includes('.');
}

const isEnabledForChunk = (compilation, chunk) => {
  const globalChunkLoading = compilation.outputOptions.chunkLoading;
  const options = chunk.getEntryOptions();
  const chunkLoading = (options && options.chunkLoading) || globalChunkLoading;
  return chunkLoading === 'jsonp';
}

const replaceTemplate = (compilation, source) => {
  const { chunkLoadingGlobal } = compilation.outputOptions;
  const expectedTemplate = `self[${JSON.stringify(chunkLoadingGlobal)}] = self[${JSON.stringify(chunkLoadingGlobal)}] || []`;
  const desiredTemplate = `self.${chunkLoadingGlobal} = self.${chunkLoadingGlobal} || []`;

  const matchIndex = source.source().indexOf(expectedTemplate);
  if (matchIndex > -1) {
    source = new ReplaceSource(source);
    source.replace(matchIndex, matchIndex + expectedTemplate.length - 1, desiredTemplate);
  }
  return source;
}

module.exports = JSONPNamespacePlugin;
