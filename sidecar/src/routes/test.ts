/**
 * Test Routes - Devnet Testing Utilities
 *
 * These routes are ONLY available in development/test mode.
 * They allow seeding mock balances for devnet testing.
 *
 * CRITICAL: These routes must NEVER be enabled in production!
 */

import { Router } from 'express';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { shadowWireService, solToLamports } from '../services/shadowwire.js';
import { maskWallet } from '../services/stealth.js';

export const testRouter = Router();

// ============================================================================
// Guard: Only allow in development/test
// ============================================================================

testRouter.use((req, res, next) => {
  const config = getConfig();

  if (config.isProduction) {
    res.status(403).json({
      success: false,
      error: 'Test routes are not available in production',
    });
    return;
  }

  // Allow test routes in development mode for any network
  // This enables testing the mock fallback on mainnet
  if (!config.isDevelopment && config.SOLANA_NETWORK !== 'devnet') {
    res.status(403).json({
      success: false,
      error: 'Test routes are only available in development mode or on devnet',
    });
    return;
  }

  next();
});

// ============================================================================
// Validation Schemas
// ============================================================================

const seedBalanceSchema = z.object({
  wallet: z.string().min(32).max(44),
  amountSol: z.number().positive(),
});

// ============================================================================
// Seed Mock Balance
// ============================================================================

/**
 * POST /test/seed-balance
 *
 * Seed a mock ShadowWire pool balance for devnet testing.
 * This simulates a wallet having deposited to the ShadowWire pool.
 */
testRouter.post('/seed-balance', async (req, res) => {
  try {
    const validation = seedBalanceSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
      });
      return;
    }

    const { wallet, amountSol } = validation.data;
    const amountLamports = solToLamports(amountSol);

    shadowWireService.seedMockBalance(wallet, amountLamports);

    res.json({
      success: true,
      wallet: maskWallet(wallet),
      amountLamports: amountLamports.toString(),
      message: `Seeded ${amountSol} SOL mock balance`,
    });
  } catch (error) {
    console.error('[Test] Seed balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// Get Mock Balances
// ============================================================================

/**
 * GET /test/balances
 *
 * Get all mock balances (for debugging).
 */
testRouter.get('/balances', async (req, res) => {
  try {
    const balances = shadowWireService.getMockBalances();

    const masked: Record<string, string> = {};
    for (const [wallet, balance] of balances) {
      masked[maskWallet(wallet)] = balance.toString();
    }

    res.json({
      success: true,
      balances: masked,
      count: balances.size,
    });
  } catch (error) {
    console.error('[Test] Get balances error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// Clear Mock Balances
// ============================================================================

/**
 * POST /test/clear-balances
 *
 * Clear all mock balances.
 */
testRouter.post('/clear-balances', async (req, res) => {
  try {
    shadowWireService.clearMockBalances();

    res.json({
      success: true,
      message: 'All mock balances cleared',
    });
  } catch (error) {
    console.error('[Test] Clear balances error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// Seed Escrow Balance
// ============================================================================

/**
 * POST /test/seed-escrow
 *
 * Seed the escrow wallet with mock balance.
 * Required before running duel simulations.
 */
testRouter.post('/seed-escrow', async (req, res) => {
  try {
    const escrowWallet = shadowWireService.getEscrowWallet();
    const amountLamports = solToLamports(100); // 100 SOL

    shadowWireService.seedMockBalance(escrowWallet, amountLamports);

    res.json({
      success: true,
      escrowWallet: maskWallet(escrowWallet),
      amountLamports: amountLamports.toString(),
      message: 'Escrow wallet seeded with 100 SOL mock balance',
    });
  } catch (error) {
    console.error('[Test] Seed escrow error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});
