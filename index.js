class JSONPNamespacePlugin {
  apply(compiler) {
    compiler.plugin('compilation', function(compilation) {
      compilation.mainTemplate.plugin('bootstrap', function(source) {
        const jsonpFunction = this.outputOptions.jsonpFunction,
              defaultTemplate = `window[${JSON.stringify(jsonpFunction)}]`,
              desiredNamespace = `window.${jsonpFunction}`;

        // generate code which will initialize namespace
        let initializeNS = jsonpFunction.split('.').map((item, index, array) => {
          const prop = array.slice(0, index + 1).join('.');
          return index < array.length - 1 ? `window.${prop} = window.${prop} || {};` : ``;
        }).filter(str => str.length).join('\n');

        // prepend namespace initialization code and replace original template parts
        return this.asString([
          initializeNS,
          source.split(defaultTemplate).join(desiredNamespace)
        ]);

      });
    });
  }
}

module.exports = JSONPNamespacePlugin;
