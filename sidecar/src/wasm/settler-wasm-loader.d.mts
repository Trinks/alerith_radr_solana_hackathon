/**
 * Type declarations for settler-wasm-loader.mjs
 */

export interface ZKProofResult {
  proof_bytes: Uint8Array;
  commitment_bytes: Uint8Array;
  blinding_factor_bytes: Uint8Array;
}

export function getWasmModule(): Promise<unknown>;
export function generateRangeProof(amount: number, bitLength?: number): Promise<ZKProofResult>;
