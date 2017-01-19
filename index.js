var RawSource = require('webpack-sources').RawSource;

var getJsonpNsFunction = 'var getJsonpNsFunction = function(name) { var parts = name.split("."), result = window; for (var i = 0; i < parts.length; i++) { if (result) { result = result[parts[i]]; } } return result; }',
    getJsonpNsObject = 'var getJsonpNsObject = function(name) { var parts = name.split("."), result = window; for (var i = 0; i < parts.length - 1; i++) { var part = parts[i]; result = result[part] = result[part] || {} } return result; };';


function JsonpNamespacePlugin(options) {
  this.options = options || {};
}

JsonpNamespacePlugin.prototype.apply = function(compiler) {
  var options = this.options;
  var jsregex = options.test || /\.js($|\?)/i;

  compiler.plugin('compilation', function (compilation) {
    compilation.plugin('optimize-chunk-assets', function (chunks, callback) {
      const files = [];

      chunks.forEach(function(chunk) {
        chunk.files.forEach(function(file) {
          files.push(file);
        });
      });

      compilation.additionalChunkAssets.forEach(function(file) {
        files.push(file);
      });

      files.filter(function(file) {
        return jsregex.test(file);
      }).forEach(function(file) {
        try {
          var asset = compilation.assets[file];

          // return cached version
          if (asset.__nsapplied) {
            compilation.assets[file] = asset.__nsapplied;
            return;
          }

          // grab source input
          var input = asset.source();

          // replace define and requires
          var result = input
                .replace(/(.*?)(var parentJsonpFunction =)/, ('$1' + getJsonpNsFunction + '\n') + ('$1' + getJsonpNsObject + '\n') + '$1$2')
                .replace(/var parentJsonpFunction = window\["(.*?)"\]/, 'var parentJsonpFunction = getJsonpNsFunction("$1")')
                .replace(/window\["((?:.*\.)(.*))"\] = function webpackJsonpCallback/, 'getJsonpNsObject("$1")["$2"] = function webpackJsonpCallback');

          // save result
          asset.__nsapplied = compilation.assets[file] = new RawSource(result);
        } catch(e) {
          compilation.errors.push(e);
        }
      });

      callback();
    });
  });
};

module.exports = JsonpNamespacePlugin;
