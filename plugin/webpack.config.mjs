import webpack from 'webpack'
import process from 'node:process'

const { DefinePlugin, ProvidePlugin } = webpack

// This is the production-build subset of Toss's createWebpackConfig contract.
// Keeping it here avoids shipping the helper's legacy Puppeteer test harness,
// which is not used to build or run this worker and currently has no audit fix.
export default {
  mode: 'development',
  entry: './src/index.ts',
  plugins: [
    new DefinePlugin({
      PROFILE: JSON.stringify(process.env.PROFILE),
    }),
    new ProvidePlugin({
      process: 'process/browser',
    }),
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      canvas: false,
    },
    alias: {
      process: 'process/browser',
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
}
