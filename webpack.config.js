//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: 'node', // extensions run in a node context

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js'],
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};

const browserConfig = /** @type WebpackConfig */ {
	mode: "none",
	target: "webworker", // web extensions run in a webworker context
	entry: {
	  "web-extension": "./src/web-extension.ts",
	},
	output: {
	  filename: "web-extension.js",
	  // eslint-disable-next-line no-undef
	  path: path.join(__dirname, "./dist"),
	  libraryTarget: "commonjs",
	},
	resolve: {
	  mainFields: ["browser", "module", "main"],
	  extensions: [".ts", ".js"],
	  alias: {
      // replace the node based resolver with the browser version
      "./ModuleResolver": "./BrowserModuleResolver",
	  },
	  fallback: {
      "https": false,
    },
	},
	module: {
	  rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
	  ],
	},
	externals: {
	  vscode: "commonjs vscode", // ignored because it doesn't exist
	},
	performance: {
	  hints: false,
	},
	devtool: "source-map",
};

module.exports = [config, browserConfig];
