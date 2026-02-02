/**
 * Alerith ShadowWire Sidecar - Entry Point
 *
 * Privacy-preserving duel escrow service using ShadowWire ZK transfers.
 *
 * CRITICAL SECURITY NOTES:
 * - Wallet addresses are NEVER stored in plaintext
 * - All amounts are hidden on-chain via ZK proofs
 * - Internal API requires X-Internal-Secret authentication
 * - Uses in-memory storage (no Redis required)
 */

// Load environment variables first
import 'dotenv/config';

import { getConfig, TOKEN_MINIMUM_DISPLAY, SUPPORTED_TOKENS } from './config.js';
import { createServer } from './server.js';
import { shadowWireService } from './services/shadowwire.js';
import { duelEscrowService } from './services/duel-escrow.js';
import { memoryStore } from './services/memory-store.js';
import { accountabilityService } from './services/accountability.js';

// ============================================================================
// Startup
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Alerith ShadowWire Sidecar v2.0.0');
  console.log('  Privacy-Preserving Duel Escrow Service');
  console.log('='.repeat(60));

  const config = getConfig();

  console.log(`\n[Config] Environment: ${config.NODE_ENV}`);
  console.log(`[Config] Network: ${config.SOLANA_NETWORK}`);
  console.log(`[Config] Supported tokens: ${SUPPORTED_TOKENS.join(', ')}`);
  console.log(`[Config] Minimum stakes: ${SUPPORTED_TOKENS.map(t => `${TOKEN_MINIMUM_DISPLAY[t].toLocaleString()} ${t}`).join(', ')}`);
  console.log(`[Config] House fee: ${config.HOUSE_FEE_PERCENT}%`);
  console.log(`[Config] Escrow timeout: ${config.ESCROW_TIMEOUT_SECONDS}s`);

  // Initialize services
  console.log('\n[Services] Initializing...');

  try {
    await shadowWireService.initialize();
    console.log('[Services] ShadowWire service initialized');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Services] FATAL: Failed to initialize ShadowWire: ${message}`);
    console.error('[Services] Check your wallet secrets in .env');
    process.exit(1);
  }

  // Initialize accountability service (for on-chain commitment posting)
  accountabilityService.initialize();
  console.log('[Services] Accountability service initialized');

  // Initialize duel escrow with in-memory storage
  duelEscrowService.initialize();
  console.log('[Services] DuelEscrow service initialized (in-memory storage)');

  // Create and start server
  const app = createServer();

  const server = app.listen(config.PORT, () => {
    console.log(`\n[Server] Listening on port ${config.PORT}`);
    console.log(`[Server] Test page: http://localhost:${config.PORT}/test/duel-stake-test.html`);
    console.log(`[Server] Health: http://localhost:${config.PORT}/health`);
    console.log('\n[Server] Ready to accept requests');
    console.log('='.repeat(60));
  });

  // ============================================================================
  // Graceful Shutdown
  // ============================================================================

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('[Server] HTTP server closed');
    });

    // Shutdown memory store
    memoryStore.shutdown();
    console.log('[MemoryStore] Shutdown complete');

    console.log('[Server] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
    shutdown('unhandledRejection');
  });
}

// ============================================================================
// Run
// ============================================================================

main().catch((error) => {
  console.error('[Server] Fatal error during startup:', error);
  process.exit(1);
});
