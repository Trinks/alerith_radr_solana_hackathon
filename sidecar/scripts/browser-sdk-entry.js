/**
 * Browser SDK Entry Point
 * Exports ShadowWire SDK for browser use
 * Note: Solana Web3.js is loaded separately via CDN
 */

// Import ShadowWire SDK
import {
  ShadowWireClient,
  initWASM,
  isWASMSupported,
  generateRangeProof,
  verifyRangeProof,
  BULLETPROOF_INFO,
} from '@radr/shadowwire';

// Export for browser use
export {
  ShadowWireClient,
  initWASM,
  isWASMSupported,
  generateRangeProof,
  verifyRangeProof,
  BULLETPROOF_INFO,
};
