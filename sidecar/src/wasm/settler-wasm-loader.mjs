/**
 * ESM Wrapper for settler_wasm WASM module
 *
 * This file exists to work around the ESM/CommonJS interop issues
 * with the @radr/shadowwire package. Since this file has .mjs extension,
 * Node.js will always treat it as ESM regardless of the parent package.json.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamically find and load the WASM JS module
async function findAndLoadWasmModule() {
  const basePaths = [
    join(__dirname, '../../node_modules/@radr/shadowwire/wasm'),
    join(__dirname, '../../../node_modules/@radr/shadowwire/wasm'),
    join(process.cwd(), 'node_modules/@radr/shadowwire/wasm'),
  ];

  let wasmJsContent = null;
  let wasmBinary = null;
  let foundPath = '';

  for (const basePath of basePaths) {
    try {
      const jsPath = join(basePath, 'settler_wasm.js');
      const wasmPath = join(basePath, 'settler_wasm_bg.wasm');

      wasmJsContent = readFileSync(jsPath, 'utf-8');
      wasmBinary = readFileSync(wasmPath);
      foundPath = basePath;
      break;
    } catch {
      continue;
    }
  }

  if (!wasmJsContent || !wasmBinary) {
    throw new Error('Could not find @radr/shadowwire WASM files');
  }

  console.log(`[WASM Loader] Found WASM files at ${foundPath}`);

  // Convert the JS module content into a data URL that Node.js will treat as ESM
  // This bypasses the package.json "type" check entirely
  const base64Js = Buffer.from(wasmJsContent).toString('base64');
  const dataUrl = `data:text/javascript;base64,${base64Js}`;

  // Dynamic import from data URL
  const module = await import(dataUrl);

  console.log('[WASM Loader] ESM module loaded via data URL');

  // Initialize with WASM binary
  module.initSync(wasmBinary);

  console.log('[WASM Loader] WASM initialized');

  return module;
}

// Cache the loaded module
let cachedModule = null;

export async function getWasmModule() {
  if (!cachedModule) {
    cachedModule = await findAndLoadWasmModule();
  }
  return cachedModule;
}

export async function generateRangeProof(amount, bitLength = 64) {
  const module = await getWasmModule();
  return module.generate_range_proof(BigInt(amount), bitLength);
}
