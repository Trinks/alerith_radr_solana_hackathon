/**
 * Bundle ShadowWire SDK for browser use
 * Run: node scripts/bundle-browser-sdk.js
 * Note: Solana Web3.js is loaded separately via CDN
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function bundle() {
  try {
    await build({
      entryPoints: [join(__dirname, 'browser-sdk-entry.js')],
      bundle: true,
      outfile: join(__dirname, '..', 'public', 'shadowwire-browser.js'),
      format: 'iife',
      globalName: 'ShadowWire',
      platform: 'browser',
      target: ['es2020'],
      minify: false,
      sourcemap: true,
      define: {
        'process.env.NODE_ENV': '"production"',
        'global': 'globalThis',
      },
    });

    console.log('✅ Browser SDK bundled to public/shadowwire-browser.js');
    console.log('   Includes: ShadowWire SDK only');
  } catch (error) {
    console.error('❌ Bundle failed:', error);
    process.exit(1);
  }
}

bundle();
