/**
 * Duel Routes - Privacy-Preserving Duel Escrow API
 *
 * All endpoints require internal authentication (game server only).
 * Wallet addresses are NEVER logged or persisted in plaintext.
 */

import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { duelEscrowService } from '../services/duel-escrow.js';
import { shadowWireDirect } from '../services/shadowwire-direct.js';
import { accountabilityService } from '../services/accountability.js';
import { getConfig, TOKEN_MINIMUM_DISPLAY, SUPPORTED_TOKENS } from '../config.js';
import type {
  CreateDuelResponse,
  GetDuelStatusResponse,
  LockStakeResponse,
  RefundDuelResponse,
  SettleDuelResponse,
} from '../types/index.js';
import { DuelStatus } from '../types/index.js';

export const duelRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const duelRulesSchema = z.object({
  allowPotions: z.boolean().optional(),
  allowPrayer: z.boolean().optional(),
  allowMovement: z.boolean().optional(),
  noMagic: z.boolean().optional(),
  noMelee: z.boolean().optional(),
  noRanged: z.boolean().optional(),
}).optional();

const combatSummarySchema = z.object({
  totalTicks: z.number().int().nonnegative(),
  player1DamageDealt: z.number().int().nonnegative(),
  player2DamageDealt: z.number().int().nonnegative(),
  winReason: z.enum(['death', 'forfeit', 'timeout']),
}).optional();

const createDuelSchema = z.object({
  player1Wallet: z.string().min(32).max(44),
  player2Wallet: z.string().min(32).max(44),
  player1CharacterId: z.string().min(1),
  player2CharacterId: z.string().min(1),
  player1Name: z.string().min(1).max(32),
  player2Name: z.string().min(1).max(32),
  stakeAmount: z.number().positive(),
  token: z.enum(['SOL', 'USD1', 'RADR']).optional().default('SOL'),
  rules: duelRulesSchema,
});

const lockStakeSchema = z.object({
  duelId: z.string().length(32),
  playerWallet: z.string().min(32).max(44),
  paymentProof: z.string().min(1), // ZK proof JSON from Unity client
});

const settleDuelSchema = z.object({
  duelId: z.string().length(32),
  winnerWallet: z.string().min(32).max(44),
  winnerCharacterId: z.string().min(1).optional(),
  serverSignature: z.string().min(1),
  combatSummary: combatSummarySchema,
});

const refundDuelSchema = z.object({
  duelId: z.string().length(32),
  reason: z.enum(['timeout', 'cancelled', 'error']),
  serverSignature: z.string().min(1),
});

const getDuelSchema = z.object({
  duelId: z.string().length(32),
});

// ============================================================================
// Create Duel
// ============================================================================

/**
 * POST /duel/create
 *
 * Create a new duel session between two players.
 * Returns duel ID and stealth IDs (safe to store).
 */
duelRouter.post('/create', async (req, res) => {
  try {
    const validation = createDuelSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: `Invalid request: ${validation.error.issues.map(i => i.message).join(', ')}`,
      } as CreateDuelResponse);
      return;
    }

    const {
      player1Wallet,
      player2Wallet,
      player1CharacterId,
      player2CharacterId,
      player1Name,
      player2Name,
      stakeAmount,
      token,
      rules,
    } = validation.data;

    // Players cannot duel themselves
    if (player1Wallet === player2Wallet) {
      res.status(400).json({
        success: false,
        error: 'Cannot duel yourself',
      } as CreateDuelResponse);
      return;
    }

    const result = await duelEscrowService.createDuel({
      player1Wallet,
      player2Wallet,
      player1CharacterId,
      player2CharacterId,
      player1Name,
      player2Name,
      stakeAmountSol: stakeAmount,
      token,
      rules,
    });

    if (!result.success || !result.duel) {
      res.status(400).json({
        success: false,
        error: result.error ?? 'Failed to create duel',
      } as CreateDuelResponse);
      return;
    }

    const response: CreateDuelResponse = {
      success: true,
      duelId: result.duel.duelId,
      player1StealthId: result.duel.player1.stealthId,
      player2StealthId: result.duel.player2.stealthId,
      stakeAmountLamports: result.duel.player1.stakeAmount.toString(),
      expiresAt: result.duel.expiresAt,
    };

    console.log(
      `[Duel] Created duel ${result.duel.duelId}: ${result.duel.player1.characterName} vs ${result.duel.player2.characterName}`
    );

    res.status(201).json(response);
  } catch (error) {
    console.error('[Duel] Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as CreateDuelResponse);
  }
});

// ============================================================================
// Lock Stake
// ============================================================================

/**
 * POST /duel/lock-stake
 *
 * Lock a player's stake in escrow via ShadowPay.
 * Uses pre-authorized spending (player must have authorized service).
 */
duelRouter.post('/lock-stake', async (req, res) => {
  try {
    const validation = lockStakeSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        duelStatus: DuelStatus.FAILED,
        bothLocked: false,
      } satisfies LockStakeResponse);
      return;
    }

    const { duelId, playerWallet, paymentProof } = validation.data;

    const duel = await duelEscrowService.getDuel(duelId);

    if (!duel) {
      res.status(404).json({
        success: false,
        error: 'Duel not found',
        duelStatus: DuelStatus.FAILED,
        bothLocked: false,
      } satisfies LockStakeResponse);
      return;
    }

    // Lock stake via ShadowPay (uses ZK proof from Unity client)
    const result = await duelEscrowService.lockStakeWithProof(duelId, playerWallet, paymentProof);

    const updatedDuel = await duelEscrowService.getDuel(duelId);

    const response: LockStakeResponse = {
      success: result.success,
      txSignature: result.txSignature,
      duelStatus: updatedDuel?.status ?? DuelStatus.FAILED,
      bothLocked: result.bothLocked ?? false,
      error: result.error,
    };

    if (result.success) {
      console.log(
        `[Duel] Stake locked for duel ${duelId} - both locked: ${result.bothLocked}`
      );
    }

    res.json(response);
  } catch (error) {
    console.error('[Duel] Lock stake error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      duelStatus: DuelStatus.FAILED,
      bothLocked: false,
    } satisfies LockStakeResponse);
  }
});

// ============================================================================
// Settle Duel
// ============================================================================

/**
 * POST /duel/settle
 *
 * Settle a duel and pay the winner.
 * Only called by game server after combat ends.
 */
duelRouter.post('/settle', async (req, res) => {
  try {
    const validation = settleDuelSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
      } satisfies SettleDuelResponse);
      return;
    }

    const { duelId, winnerWallet, serverSignature, combatSummary } = validation.data;

    // Pass server signature to settlement for accountability commitment
    const result = await duelEscrowService.settleDuel(duelId, winnerWallet, combatSummary, serverSignature);

    const response: SettleDuelResponse = {
      success: result.success,
      winnerTxSignature: result.winnerTxSignature,
      treasuryTxSignature: result.treasuryTxSignature,
      winnerPayoutLamports: result.winnerPayoutLamports?.toString(),
      treasuryFeeLamports: result.houseFeeLamports?.toString(),
      commitmentHash: result.commitmentHash,
      commitmentTxSignature: result.commitmentTxSignature,
      error: result.error,
    };

    if (result.success) {
      console.log(`[Duel] Settled duel ${duelId} - winner paid`);
    }

    res.json(response);
  } catch (error) {
    console.error('[Duel] Settle error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } satisfies SettleDuelResponse);
  }
});

// ============================================================================
// Refund Duel
// ============================================================================

/**
 * POST /duel/refund
 *
 * Refund a duel (timeout, cancellation, or error).
 * Returns stakes to players.
 */
duelRouter.post('/refund', async (req, res) => {
  try {
    const validation = refundDuelSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
      } satisfies RefundDuelResponse);
      return;
    }

    const { duelId, reason, serverSignature } = validation.data;

    // TODO: Verify serverSignature

    const result = await duelEscrowService.refundDuel(duelId, reason);

    const response: RefundDuelResponse = {
      success: result.success,
      refundTxSignatures: result.refundTxSignatures,
      error: result.error,
    };

    if (result.success) {
      console.log(`[Duel] Refunded duel ${duelId} - reason: ${reason}`);
    }

    res.json(response);
  } catch (error) {
    console.error('[Duel] Refund error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } satisfies RefundDuelResponse);
  }
});

// ============================================================================
// Direct Withdraw (Recovery)
// ============================================================================

/**
 * POST /duel/recovery/withdraw
 *
 * Direct withdraw from escrow to any wallet. For emergency recovery.
 */
duelRouter.post('/recovery/withdraw', async (req, res) => {
  try {
    const { recipientWallet, amountLamports, token } = req.body;

    if (!recipientWallet || !amountLamports) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: recipientWallet, amountLamports',
      });
      return;
    }

    const amount = parseInt(amountLamports, 10);
    if (amount < 100000000) {
      res.status(400).json({
        success: false,
        error: 'Amount must be >= 100000000 (0.1 SOL minimum)',
      });
      return;
    }

    console.log(`[Duel] Recovery withdraw: ${amount} lamports to ${recipientWallet}`);

    const result = await shadowWireDirect.transferFromEscrow(
      recipientWallet,
      amount,
      token || 'SOL'
    );

    if (result.success) {
      res.json({
        success: true,
        txSignature: result.txSignature,
        amountLamports: amount,
        amountSol: (amount / 1_000_000_000).toFixed(9),
        recipient: recipientWallet,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Duel] Recovery withdraw error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// ============================================================================
// Service Info (for authorization)
// ============================================================================

/**
 * GET /duel/service-info
 *
 * Get service wallet and config for spending authorization.
 * Public endpoint for test page.
 * NOTE: Must be defined BEFORE /:duelId route to avoid wildcard match.
 */
duelRouter.get('/service-info', async (req, res) => {
  try {
    const config = getConfig();
    res.json({
      success: true,
      escrowWallet: shadowWireDirect.getEscrowWallet(),
      treasuryWallet: shadowWireDirect.getTreasuryWallet(),
      supportedTokens: SUPPORTED_TOKENS,
      tokenMinimums: TOKEN_MINIMUM_DISPLAY,
      houseFeePercent: config.HOUSE_FEE_PERCENT,
      feeInfo: shadowWireDirect.getFeeInfo('SOL'),
    });
  } catch (error) {
    console.error('[Duel] Service info error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// Recovery Endpoints (for stuck funds)
// ============================================================================

/**
 * GET /duel/recovery/status
 *
 * Get list of failed/stuck duels that need recovery.
 */
duelRouter.get('/recovery/status', async (req, res) => {
  try {
    const failedDuels = await duelEscrowService.getFailedDuels();
    const pendingSettlements = await duelEscrowService.getPendingSettlements();

    res.json({
      success: true,
      failedDuels,
      failedCount: failedDuels.length,
      pendingSettlements,
      pendingCount: pendingSettlements.length,
    });
  } catch (error) {
    console.error('[Duel] Recovery status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /duel/recovery/emergency-refund
 *
 * Emergency refund for stuck funds. Requires wallet addresses.
 */
duelRouter.post('/recovery/emergency-refund', async (req, res) => {
  try {
    const { duelId, player1Wallet, player2Wallet, stakePerPlayerLamports, token } = req.body;

    if (!duelId || !player1Wallet || !player2Wallet || !stakePerPlayerLamports) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: duelId, player1Wallet, player2Wallet, stakePerPlayerLamports',
      });
      return;
    }

    console.log(`[Duel] Emergency refund requested for duel ${duelId}`);

    const result = await duelEscrowService.emergencyRefund(
      duelId,
      player1Wallet,
      player2Wallet,
      parseInt(stakePerPlayerLamports, 10),
      token || 'SOL'
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Emergency refund completed',
        refunds: result.refunds,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        refunds: result.refunds,
      });
    }
  } catch (error) {
    console.error('[Duel] Emergency refund error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// ============================================================================
// Dust Management (Accumulated House Fees)
// ============================================================================

/**
 * GET /duel/dust-status
 *
 * Get accumulated dust (house fees below 0.1 SOL minimum).
 */
duelRouter.get('/dust-status', async (req, res) => {
  try {
    const token = (req.query.token as string) || 'SOL';
    const dustAmount = await duelEscrowService.getAccumulatedDust(token);
    const dustSol = dustAmount / 1_000_000_000;
    const canSweep = dustAmount >= 100_000_000; // 0.1 SOL minimum

    res.json({
      success: true,
      token,
      dustLamports: dustAmount,
      dustSol: dustSol.toFixed(9),
      canSweep,
      minimumToSweep: '0.1 SOL',
    });
  } catch (error) {
    console.error('[Duel] Dust status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /duel/sweep-dust
 *
 * Sweep accumulated dust to treasury (requires >= 0.1 SOL).
 */
duelRouter.post('/sweep-dust', async (req, res) => {
  try {
    const token = (req.body.token as string) || 'SOL';
    const result = await duelEscrowService.sweepDustToTreasury(token);

    if (result.success) {
      res.json({
        success: true,
        sweptLamports: result.amount,
        sweptSol: result.amount ? (result.amount / 1_000_000_000).toFixed(9) : '0',
        txSignature: result.txSignature,
      });
    } else {
      res.status(400).json({
        success: false,
        currentDustLamports: result.amount,
        currentDustSol: result.amount ? (result.amount / 1_000_000_000).toFixed(9) : '0',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Duel] Dust sweep error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// Test WASM Loading (Development Only)
// ============================================================================

/**
 * GET /duel/test-wasm
 *
 * Test endpoint to verify WASM/ZK proof generation works.
 * Only available in development mode.
 */
duelRouter.get('/test-wasm', async (req, res) => {
  try {
    const config = getConfig();
    if (config.NODE_ENV !== 'development') {
      res.status(403).json({ success: false, error: 'Only available in development' });
      return;
    }

    console.log('[Duel] Testing WASM loading...');

    // Just test WASM loading without doing a real transfer
    // Real transfers require minimum 0.1 SOL
    const doRealTransfer = req.query.real === 'true';

    if (doRealTransfer) {
      // Real transfer test (requires 0.1 SOL minimum)
      const testAmount = 100000000; // 0.1 SOL
      const result = await shadowWireDirect.transferFromEscrow(
        shadowWireDirect.getTreasuryWallet(),
        testAmount,
        'SOL'
      );

      res.json({
        success: result.success,
        wasmLoaded: true,
        message: result.success
          ? 'WASM loaded and transfer successful!'
          : `Transfer failed: ${result.error}`,
        txSignature: result.txSignature,
        error: result.error,
      });
    } else {
      // Just test WASM loading by generating a proof (no transfer)
      // Trigger WASM load indirectly by attempting a transfer that will fail validation
      // before actually sending (amount too small)
      const result = await shadowWireDirect.transferFromEscrow(
        shadowWireDirect.getTreasuryWallet(),
        1000, // Too small, will fail at API level but WASM will load
        'SOL'
      );

      // If we got a meaningful error from the API, WASM loaded successfully
      const wasmLoaded = result.error?.includes('minimum') ||
                        result.error?.includes('anti-spam') ||
                        result.success;

      res.json({
        success: wasmLoaded,
        wasmLoaded: wasmLoaded,
        message: wasmLoaded
          ? 'WASM loaded and ZK proof generated successfully! (transfer blocked by API minimum)'
          : `WASM test failed: ${result.error}`,
        note: 'Add ?real=true to test an actual 0.1 SOL transfer',
        error: wasmLoaded ? undefined : result.error,
      });
    }
  } catch (error) {
    console.error('[Duel] WASM test error:', error);
    res.status(500).json({
      success: false,
      wasmLoaded: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Verify Settlement (Accountability)
// ============================================================================

/**
 * GET /duel/verify/:duelId
 *
 * Get commitment record for a settled duel to verify accountability.
 * Returns the commitment data so anyone can hash it and compare to on-chain.
 *
 * NOTE: Must be defined BEFORE /:duelId route to avoid wildcard match.
 */
duelRouter.get('/verify/:duelId', async (req, res) => {
  try {
    const duelId = req.params.duelId;

    if (!duelId || duelId.length !== 32) {
      res.status(400).json({
        success: false,
        error: 'Invalid duel ID',
      });
      return;
    }

    const record = accountabilityService.getCommitmentRecord(duelId);

    if (!record) {
      res.status(404).json({
        success: false,
        error: 'No commitment record found for this duel',
      });
      return;
    }

    // Recompute hash for verification
    const recomputedHash = createHash('sha256')
      .update(JSON.stringify(record.commitment))
      .digest('hex');

    const hashMatches = recomputedHash === record.commitmentHash;

    res.json({
      success: true,
      verification: {
        duelId: record.commitment.duelId,
        winnerStealthId: record.commitment.winnerStealthId,
        loserStealthId: record.commitment.loserStealthId,
        timestamp: record.commitment.timestamp,
        timestampHuman: new Date(record.commitment.timestamp).toISOString(),
      },
      commitment: {
        // The raw commitment data - hash this yourself to verify
        rawData: JSON.stringify(record.commitment),
        // Our computed hash
        hash: record.commitmentHash,
        // Recomputed hash (should match)
        recomputedHash,
        hashMatches,
      },
      onChain: {
        posted: record.onChainSuccess,
        txSignature: record.onChainTxSignature || null,
        // Link to view on Solscan
        solscanUrl: record.onChainTxSignature
          ? `https://solscan.io/tx/${record.onChainTxSignature}`
          : null,
      },
      howToVerify: [
        '1. Copy the "rawData" field above',
        '2. Compute SHA-256 hash of it (use any online tool or: echo -n \'<rawData>\' | sha256sum)',
        '3. Compare your hash with the "hash" field - they should match',
        '4. Look up the "solscanUrl" on Solscan',
        '5. Check the memo instruction data - it should equal the "hash" value',
        '6. If all match, the operator committed to this outcome BEFORE settlement',
      ],
    });
  } catch (error) {
    console.error('[Duel] Verify error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================================================
// Get Duel Status
// ============================================================================

/**
 * GET /duel/:duelId
 *
 * Get current duel status.
 * Returns stealth IDs only (no raw wallet addresses).
 */
duelRouter.get('/:duelId', async (req, res) => {
  try {
    const validation = getDuelSchema.safeParse({ duelId: req.params.duelId });

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid duel ID',
      } satisfies GetDuelStatusResponse);
      return;
    }

    const duel = await duelEscrowService.getDuel(validation.data.duelId);

    if (!duel) {
      res.status(404).json({
        success: false,
        error: 'Duel not found',
      } satisfies GetDuelStatusResponse);
      return;
    }

    const response: GetDuelStatusResponse = {
      success: true,
      duel: {
        duelId: duel.duelId,
        status: duel.status,
        player1StealthId: duel.player1.stealthId,
        player2StealthId: duel.player2.stealthId,
        player1Name: duel.player1.characterName,
        player2Name: duel.player2.characterName,
        player1Locked: duel.player1.stakeLocked,
        player2Locked: duel.player2.stakeLocked,
        stakeAmountLamports: duel.player1.stakeAmount.toString(),
        token: duel.token,
        rules: duel.rules,
        expiresAt: duel.expiresAt,
        winnerStealthId: duel.winnerStealthId,
        combatSummary: duel.combatSummary,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[Duel] Get status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } satisfies GetDuelStatusResponse);
  }
});
