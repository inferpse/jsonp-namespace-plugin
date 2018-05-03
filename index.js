const { ReplaceSource } = require('webpack-sources');

class JSONPNamespacePlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('JSONPNamespacePlugin', compilation => {
      const { jsonpFunction } = compilation.outputOptions,
            defaultTemplate = `window[${JSON.stringify(jsonpFunction)}]`,
            desiredNamespace = `window.${jsonpFunction}`;

      // do nothing if "jsonpFunction" does not contain "."
      if (jsonpFunction.indexOf('.') < 0) {
        return;
      }

      // introduce namespace in the beginning of bootstrap section (if not introduced yet)
      compilation.mainTemplate.hooks.bootstrap.tap('JSONPNamespacePlugin', source => {
        if (source.indexOf('webpackJsonpCallback') < 0) {
          // do not introduce namespace for entry points without dynamic chunk loading
          return source;
        } else {
          // generate code which will initialize namespace
          let initializeNS = jsonpFunction.split('.').map((item, index, array) => {
            const prop = array.slice(0, index + 1).join('.');
            return index < array.length - 1 ? `window.${prop} = window.${prop} || {};` : ``;
          }).filter(str => str.length).join('\n');

          // prepend namespace initialization code and replace original template parts
          return [
            initializeNS,
            source.split(defaultTemplate).join(desiredNamespace)
          ].join('')
        }
      });

      // replace usage of JSONP function inside the mainTemplate
      compilation.mainTemplate.hooks.beforeStartup.tap('JSONPNamespacePlugin', source => {
        return source.split(defaultTemplate).join(desiredNamespace);
      });

      // update chunk template as well
      compilation.chunkTemplate.hooks.render.tap('JSONPNamespacePlugin', source => {
        const origTemplate = `(window[${JSON.stringify(jsonpFunction)}] = window[${JSON.stringify(jsonpFunction)}] || []).push(`,
              desiredTemplate = `(window.${jsonpFunction} = window.${jsonpFunction} || []).push(`,
              matchIndex = source.source().indexOf(origTemplate);

        // if chunk contains expected template
        if (matchIndex > -1) {
          source = new ReplaceSource(source);
          source.replace(matchIndex, matchIndex + origTemplate.length - 1, desiredTemplate);
        }

        return source;
      });

    });
  }
}

module.exports = JSONPNamespacePlugin;
