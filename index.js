const { SourceMapSource, RawSource } = require('webpack-sources'),
      babel = require('babel-core');

class JSONPNamespacePlugin {
  constructor(options) {
    this.options = Object.assign({
      jsregex: /\.js($|\?)/i
    }, options);
  }
  apply(compiler) {
    const { options } = this,
          { jsregex } = options,
          useSourceMap = typeof options.sourceMap === 'undefined' ? !!compiler.options.devtool : options.sourceMap;

    compiler.plugin('compilation', function (compilation) {

      if (useSourceMap) {
        compilation.plugin('build-module', function (module) {
          module.useSourceMap = true;
        });
      }

      compilation.plugin('optimize-chunk-assets', function (chunks, callback) {
        const files = [];

        chunks.forEach(chunk => {
          chunk.files.forEach(file => files.push(file));
        });

        compilation.additionalChunkAssets.forEach(file => files.push(file));

        files.filter(file => jsregex.test(file)).forEach(file => {
          try {
            let asset = compilation.assets[file];

            // use cached asset
            if (asset.__jsonpnsApplied) {
              compilation.assets[file] = asset.__jsonpnsApplied;
              return;
            }

            // read options
            let input, inputSourceMap;
            if (useSourceMap) {
              if (asset.sourceAndMap) {
                let sourceAndMap = asset.sourceAndMap();
                inputSourceMap = sourceAndMap.map;
                input = sourceAndMap.source;
              } else {
                inputSourceMap = asset.map();
                input = asset.source();
              }
            } else {
              input = asset.source();
            }

            // apply transformation
            const result = babel.transform(input, {
              plugins: [
                [TransformWebpackJSONP, options]
              ],
              sourceMaps: useSourceMap,
              compact: false,
              babelrc: false,
              inputSourceMap
            });

            // save result
            asset.__jsonpnsApplied = compilation.assets[file] = (
              result.map
              ? new SourceMapSource(result.code, file, result.map, input, inputSourceMap)
              : new RawSource(result.code)
            );
          } catch (e) {
            compilation.errors.push(e);
          }
        });

        callback();
      })
    });
  }
}

const TransformWebpackJSONP = ({types: t}) => {
  return {
    visitor: {
      Identifier: (path, {opts: options}) => {
        const { parentPath } = path;
        if (isWebpackJSONPVariableDeclaration(path)) {
          if (!isVariableDeclarationReplaced(path)) {
            let ns = parentPath.node.init.property.value;
            if (ns.indexOf('.') > -1) {
              // replace "var parentJsonpFunction = window[...]" with "var parentJsonpFunction = window.*** && window.***.***"
              parentPath.replaceWith(t.variableDeclarator(t.identifier('parentJsonpFunction'), generateSafeAccessor(t, `window.${ns}`)));
            }
          }
        } else if (isWebpackCallbackFunctionDefinition(path)) {
          if (!isPreparationCodeInserted(path)) {
            let assignmentPath = parentPath.parentPath,
                ns = assignmentPath.node.left.property.value;

            if (ns.indexOf('.') > -1) {
              // add code to prepare namespace (if it does not exist)
              const replacements = [],
                    nsPath = `window.${ns}`,
                    nsParts = nsPath.split('.');

              // debugger;
              for (let i = 2; i < nsParts.length; i++) {
                replacements.push(
                  generateNsInitializer(t, nsParts.slice(0, i).join('.'))
                )
              }

              // replace "window['test.namespace'] = function webpackJsonpCallback" with "window.test.namespace = function webpackJsonpCallback"
              replacements.push(
                t.AssignmentExpression('=', generateObjectIdentifier(t, `window.${ns}`), assignmentPath.node.right)
              );

              assignmentPath.replaceWithMultiple(replacements);
            }
          }
        }
      }
    }
  };

  function isWebpackJSONPVariableDeclaration(path) {
    const { node, parentPath } = path;
    return node.name === 'parentJsonpFunction' && parentPath.isVariableDeclarator();
  }

  function isVariableDeclarationReplaced(path) {
    const { node, parentPath } = path;
    return !(parentPath.node.init.type === 'MemberExpression' && parentPath.node.init.computed)
  }

  function isWebpackCallbackFunctionDefinition(path) {
    const { node, parentPath } = path;
    return node.name === 'webpackJsonpCallback' && parentPath.isFunctionExpression();
  }

  function isPreparationCodeInserted(path) {
    const assignmentPath = path.parentPath.parentPath;
    return !(assignmentPath.isAssignmentExpression() && assignmentPath.node.left.computed);
  }

  function generateObjectIdentifier(t, objStr) {
    const propList = objStr.split('.'),
          objName = propList.slice(0, propList.length - 1).join('.'),
          propName = propList[propList.length - 1];

    if (propList.length > 1) {
      return t.memberExpression(
        generateObjectIdentifier(t, objName),
        t.identifier(propName)
      );
    } else {
      return t.identifier(objStr);
    }
  }

  function generateSafeAccessor(t, objStr) {
    const propList = objStr.split('.'),
          prevObj = propList.slice(0, propList.length - 1).join('.');

    if (propList.length > 2) {
      return t.logicalExpression('&&', generateSafeAccessor(t, prevObj), generateObjectIdentifier(t, objStr));
    } else {
      return generateObjectIdentifier(t, objStr); 
    }
  }

  function generateNsInitializer(t, objStr) {
    return t.expressionStatement(
      t.assignmentExpression('=', 
        generateObjectIdentifier(t, objStr),
        t.logicalExpression('||',
          generateObjectIdentifier(t, objStr),
          t.objectExpression([])
        )
      )
    )
  }
}

module.exports = JSONPNamespacePlugin;
