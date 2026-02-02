/**
 * Duel Escrow Service - ShadowWire SDK Integration
 *
 * Uses @radr/shadowwire SDK for:
 * - Shielded balance verification
 * - Stake transfers (ZK proofs)
 * - Winner payouts
 * - House fee collection
 *
 * Uses in-memory storage (no Redis dependency).
 */

import { randomBytes } from 'crypto';
import { getConfig, TOKEN_MINIMUMS, TOKEN_DECIMALS, type SupportedToken } from '../config.js';
import { memoryStore } from './memory-store.js';
import { shadowWireDirect } from './shadowwire-direct.js';
import { generateStealthId, stealthMapping, verifyStealthId } from './stealth.js';
import { accountabilityService } from './accountability.js';
import type {
  DuelId,
  DuelParticipant,
  DuelSession,
  DuelRules,
  CombatSummary,
  StealthId,
  TxSignature,
  WalletAddress,
  CharacterId,
} from '../types/index.js';
import { DuelStatus } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

const DEFAULT_RULES: DuelRules = {
  allowPotions: false,
  allowPrayer: false,
  allowMovement: true,
  noMagic: false,
  noMelee: false,
  noRanged: false,
};

interface CreateDuelParams {
  player1Wallet: WalletAddress;
  player2Wallet: WalletAddress;
  player1CharacterId: CharacterId;
  player2CharacterId: CharacterId;
  player1Name: string;
  player2Name: string;
  stakeAmountSol: number;
  token?: string;
  rules?: Partial<DuelRules>;
}

interface CreateDuelResult {
  success: boolean;
  duel?: DuelSession;
  error?: string;
}

interface LockStakeResult {
  success: boolean;
  txSignature?: TxSignature;
  bothLocked?: boolean;
  error?: string;
}

interface SettleResult {
  success: boolean;
  winnerTxSignature?: TxSignature;
  treasuryTxSignature?: TxSignature;
  winnerPayoutLamports?: bigint;
  houseFeeLamports?: bigint;
  /** Commitment hash (for accountability) */
  commitmentHash?: string;
  /** On-chain tx signature for commitment */
  commitmentTxSignature?: string;
  error?: string;
}

interface RefundResult {
  success: boolean;
  refundTxSignatures?: TxSignature[];
  error?: string;
}

// ============================================================================
// Duel Escrow Service
// ============================================================================

class DuelEscrowService {
  private treasuryWallet: string | null = null;
  private initialized = false;

  /**
   * Initialize the service (no external dependencies)
   */
  initialize(): void {
    if (this.initialized) return;

    // Initialize memory store
    memoryStore.initialize();

    // Initialize ShadowWire Direct client (bypasses broken SDK)
    shadowWireDirect.initialize();

    // Initialize accountability service for commit-hash system
    accountabilityService.initialize();

    // Store treasury wallet for fee collection
    this.treasuryWallet = shadowWireDirect.getTreasuryWallet();

    this.initialized = true;

    console.log('[DuelEscrow] Service initialized with in-memory storage');
    console.log(`[DuelEscrow] Escrow wallet: ${shadowWireDirect.getEscrowWallet()}`);
    console.log(`[DuelEscrow] Treasury wallet: ${this.treasuryWallet}`);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DuelEscrow service not initialized');
    }
  }

  private generateDuelId(): DuelId {
    return randomBytes(16).toString('hex');
  }

  // ==========================================================================
  // Create Duel
  // ==========================================================================

  async createDuel(params: CreateDuelParams): Promise<CreateDuelResult> {
    this.ensureInitialized();
    const config = getConfig();

    const {
      player1Wallet,
      player2Wallet,
      player1CharacterId,
      player2CharacterId,
      player1Name,
      player2Name,
      stakeAmountSol,
      token = 'SOL',
      rules = {},
    } = params;

    const tokenKey = token as SupportedToken;
    const decimals = TOKEN_DECIMALS[tokenKey] || 9;
    const minAmount = TOKEN_MINIMUMS[tokenKey] || 100_000_000;
    const stakeAmountSmallestUnit = Math.floor(stakeAmountSol * Math.pow(10, decimals));

    // Validate stake amount against token-specific minimum
    if (stakeAmountSmallestUnit < minAmount) {
      const minDisplay = minAmount / Math.pow(10, decimals);
      return { success: false, error: `Stake too low. Min: ${minDisplay} ${token}` };
    }

    // NOTE: Balance checks are skipped for hackathon - the client-side SDK handles verification
    // and the actual transfer happens in the browser where WASM works properly.
    // In production, you'd want to verify balances server-side before creating the duel.
    console.log(`[DuelEscrow] Skipping server-side balance checks (client will verify)`);
    console.log(`[DuelEscrow] P1: ${player1Wallet.slice(0, 8)}..., P2: ${player2Wallet.slice(0, 8)}...`);
    console.log(`[DuelEscrow] Stake: ${stakeAmountSol} ${token}`);

    // Generate stealth IDs
    const player1StealthId = stealthMapping.register(player1Wallet);
    const player2StealthId = stealthMapping.register(player2Wallet);

    const duelId = this.generateDuelId();
    const now = Date.now();
    const expiresAt = now + config.escrowTimeoutMs;

    const duel: DuelSession = {
      duelId,
      status: DuelStatus.PENDING_STAKES,
      player1: {
        stealthId: player1StealthId,
        characterId: player1CharacterId,
        characterName: player1Name,
        stakeAmount: BigInt(stakeAmountSmallestUnit),
        stakeLocked: false,
      },
      player2: {
        stealthId: player2StealthId,
        characterId: player2CharacterId,
        characterName: player2Name,
        stakeAmount: BigInt(stakeAmountSmallestUnit),
        stakeLocked: false,
      },
      token,
      houseFeePercent: config.HOUSE_FEE_PERCENT,
      rules: { ...DEFAULT_RULES, ...rules },
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    memoryStore.setDuel(duelId, duel, config.escrowTimeoutMs);

    console.log(`[DuelEscrow] Created duel ${duelId}: ${player1Name} vs ${player2Name}, stake ${stakeAmountSol} SOL`);

    return { success: true, duel };
  }

  // ==========================================================================
  // Lock Stake with Client Transfer
  // ==========================================================================

  /**
   * Record stake lock after client transfers to escrow via ShadowWire SDK.
   * Client calls client.transfer() directly, then notifies us with the tx signature.
   *
   * Flow:
   * 1. Client calls ShadowWire SDK: client.transfer({ sender, recipient: escrowWallet, ... })
   * 2. Client gets txSignature back
   * 3. Client calls this endpoint with the txSignature
   * 4. We record the stake as locked
   */
  async lockStakeWithProof(
    duelId: DuelId,
    playerWallet: WalletAddress,
    paymentProof: string
  ): Promise<LockStakeResult> {
    this.ensureInitialized();

    const duel = await this.getDuel(duelId);
    if (!duel) {
      return { success: false, error: 'Duel not found' };
    }

    if (duel.status !== DuelStatus.PENDING_STAKES) {
      return { success: false, error: `Invalid duel status: ${duel.status}` };
    }

    if (Date.now() > duel.expiresAt) {
      return { success: false, error: 'Duel has expired' };
    }

    // Identify which player
    let player: DuelParticipant;
    let playerNumber: 1 | 2;

    if (verifyStealthId(playerWallet, duel.player1.stealthId)) {
      player = duel.player1;
      playerNumber = 1;
    } else if (verifyStealthId(playerWallet, duel.player2.stealthId)) {
      player = duel.player2;
      playerNumber = 2;
    } else {
      return { success: false, error: 'Player not part of this duel' };
    }

    if (player.stakeLocked) {
      return { success: false, error: 'Stake already locked' };
    }

    console.log(`[DuelEscrow] Recording P${playerNumber} stake lock...`);

    // Parse the payment proof - could be just a tx signature or full proof data
    let txSignature: string;
    try {
      const proofData = JSON.parse(paymentProof);
      // Accept either { txSignature: "..." } or { signature: "..." } or just the raw string
      txSignature = proofData.txSignature || proofData.signature || proofData.tx || paymentProof;
    } catch {
      // If not JSON, treat as raw tx signature
      txSignature = paymentProof;
    }

    // TODO: In production, verify the transfer actually happened by querying ShadowWire
    // For hackathon, we trust the client's tx signature
    console.log(`[DuelEscrow] P${playerNumber} reported tx: ${txSignature.slice(0, 16)}...`);

    // Update duel state
    const now = Date.now();
    player.stakeLocked = true;
    player.lockTxSignature = txSignature;
    player.lockTimestamp = now;
    duel.updatedAt = now;

    const bothLocked = duel.player1.stakeLocked && duel.player2.stakeLocked;
    if (bothLocked) {
      duel.status = DuelStatus.ACTIVE;
      console.log(`[DuelEscrow] Duel ${duelId} is now ACTIVE - both stakes locked`);
    }

    const ttl = duel.expiresAt - Date.now();
    memoryStore.setDuel(duelId, duel, Math.max(ttl, 1000));

    console.log(`[DuelEscrow] P${playerNumber} stake recorded as locked`);

    return {
      success: true,
      txSignature,
      bothLocked,
    };
  }

  // ==========================================================================
  // Settle Duel
  // ==========================================================================

  async settleDuel(
    duelId: DuelId,
    winnerWallet: WalletAddress,
    combatSummary?: CombatSummary,
    gameServerSignature: string = ''
  ): Promise<SettleResult> {
    this.ensureInitialized();
    const config = getConfig();

    const duel = await this.getDuel(duelId);
    if (!duel) {
      return { success: false, error: 'Duel not found' };
    }

    if (duel.status !== DuelStatus.ACTIVE && duel.status !== DuelStatus.PENDING_SETTLEMENT) {
      return { success: false, error: `Invalid duel status: ${duel.status}` };
    }

    // Verify winner is part of duel
    if (
      !verifyStealthId(winnerWallet, duel.player1.stealthId) &&
      !verifyStealthId(winnerWallet, duel.player2.stealthId)
    ) {
      return { success: false, error: 'Winner not part of this duel' };
    }

    // Calculate payouts accounting for ShadowWire deposit fees
    // Each player's deposit was reduced by 0.5% when they transferred to escrow
    const SHADOWWIRE_FEE_PERCENT = 0.5;
    const depositFeeMultiplier = 1 - (SHADOWWIRE_FEE_PERCENT / 100); // 0.995

    const stakePerPlayer = Number(duel.player1.stakeAmount);
    const actualDepositPerPlayer = Math.floor(stakePerPlayer * depositFeeMultiplier);
    const actualTotalPot = actualDepositPerPlayer * 2;

    // House fee is calculated on what's actually in escrow
    const houseFee = Math.floor(actualTotalPot * duel.houseFeePercent / 100);

    // Winner payout is the rest (ShadowWire will take another 0.5% on transfer out)
    const winnerPayout = actualTotalPot - houseFee;

    const lamportsToSol = (l: number) => (l / 1_000_000_000).toFixed(6);
    console.log(`[DuelEscrow] Settling duel ${duelId}:`);
    console.log(`  Original stake per player: ${lamportsToSol(stakePerPlayer)} SOL`);
    console.log(`  After 0.5% deposit fee: ${lamportsToSol(actualDepositPerPlayer)} SOL each`);
    console.log(`  Actual pot in escrow: ${lamportsToSol(actualTotalPot)} SOL`);
    console.log(`  House fee: ${lamportsToSol(houseFee)} SOL (${duel.houseFeePercent}%)`);
    console.log(`  Winner payout (before 0.5% transfer fee): ${lamportsToSol(winnerPayout)} SOL`);

    // Determine winner and loser stealth IDs for commitment
    const winnerStealthId = generateStealthId(winnerWallet);
    const isPlayer1Winner = verifyStealthId(winnerWallet, duel.player1.stealthId);
    const loserStealthId = isPlayer1Winner ? duel.player2.stealthId : duel.player1.stealthId;

    // ==========================================================================
    // ACCOUNTABILITY: Create and post commitment BEFORE settlement
    // ==========================================================================
    // This creates a cryptographic record of what we're about to do.
    // The commitment hash is posted on-chain, proving we committed to this
    // outcome before executing the payout.
    // ==========================================================================

    let commitmentHash: string | undefined;
    let commitmentTxSignature: string | undefined;

    try {
      const commitResult = await accountabilityService.commitToSettlement(
        duelId,
        winnerStealthId,
        loserStealthId,
        gameServerSignature,
        true // Post on-chain
      );

      if (commitResult.success) {
        commitmentHash = commitResult.commitmentHash;
        commitmentTxSignature = commitResult.onChainTxSignature;
        console.log(`[DuelEscrow] Commitment recorded: ${commitmentHash?.slice(0, 16)}...`);
        if (commitmentTxSignature) {
          console.log(`[DuelEscrow] On-chain: ${commitmentTxSignature}`);
        }
      } else {
        console.warn(`[DuelEscrow] Commitment failed (continuing anyway): ${commitResult.error}`);
      }
    } catch (error) {
      // Don't fail settlement if commitment fails - log and continue
      console.warn(`[DuelEscrow] Commitment error (continuing anyway):`, error);
    }

    // Update status to pending settlement - use LONG TTL for recovery
    const SETTLEMENT_TTL = 24 * 60 * 60 * 1000; // 24 hours for recovery
    duel.status = DuelStatus.PENDING_SETTLEMENT;
    duel.winnerStealthId = winnerStealthId;
    duel.updatedAt = Date.now();
    memoryStore.setDuel(duelId, duel, SETTLEMENT_TTL);

    // Also save to a recovery list in case of failures
    memoryStore.addPendingRecovery(duelId);

    // Pay winner via ShadowWire Direct (transfer from escrow) with RETRY logic
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000; // 2 seconds between retries
    let winnerResult: { success: boolean; txSignature?: string; error?: string } = { success: false };
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[DuelEscrow] Winner payout attempt ${attempt}/${MAX_RETRIES}...`);

      winnerResult = await shadowWireDirect.transferFromEscrow(
        winnerWallet,
        winnerPayout,
        duel.token
      );

      if (winnerResult.success) {
        console.log(`[DuelEscrow] Winner payout succeeded on attempt ${attempt}`);
        break;
      }

      lastError = winnerResult.error || 'Unknown error';
      console.error(`[DuelEscrow] Winner payout attempt ${attempt} failed: ${lastError}`);

      // Wait before retry (except on last attempt)
      if (attempt < MAX_RETRIES) {
        console.log(`[DuelEscrow] Waiting ${RETRY_DELAY_MS}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    if (!winnerResult.success) {
      // All retries failed - preserve duel for manual recovery
      console.error(`[DuelEscrow] CRITICAL: Winner payout failed after ${MAX_RETRIES} attempts! Preserving duel for recovery.`);
      duel.status = DuelStatus.ACTIVE;
      duel.updatedAt = Date.now();
      memoryStore.setDuel(duelId, duel, SETTLEMENT_TTL);
      memoryStore.addFailedRecovery(duelId);
      return { success: false, error: `Failed to pay winner after ${MAX_RETRIES} attempts: ${lastError}` };
    }

    // Remove from recovery pending list
    memoryStore.removePendingRecovery(duelId);

    // Pay treasury (house fee) - only if above ShadowWire minimum for this token
    const minTransferForToken = TOKEN_MINIMUMS[duel.token as SupportedToken] || TOKEN_MINIMUMS.SOL;
    let treasuryTxSignature: string | undefined;

    if (houseFee >= minTransferForToken && this.treasuryWallet) {
      // Fee is above minimum, transfer to treasury
      const treasuryResult = await shadowWireDirect.transferToTreasury(houseFee, duel.token);
      if (!treasuryResult.success) {
        console.error(`[DuelEscrow] WARNING: Failed to collect house fee: ${treasuryResult.error}`);
        // Accumulate for later sweep
        this.accumulateDust(houseFee, duel.token);
      } else {
        treasuryTxSignature = treasuryResult.txSignature;
        console.log(`[DuelEscrow] House fee transferred to treasury: ${treasuryResult.txSignature}`);
      }
    } else if (houseFee > 0) {
      // Fee is below minimum, accumulate as dust for later sweep
      this.accumulateDust(houseFee, duel.token);
    }

    duel.status = DuelStatus.SETTLED;
    duel.settlementTxSignatures = [
      winnerResult.txSignature!,
      ...(treasuryTxSignature ? [treasuryTxSignature] : []),
    ];
    duel.combatSummary = combatSummary;
    duel.updatedAt = Date.now();

    // Keep for 24 hours for auditing
    memoryStore.setDuel(duelId, duel, 24 * 60 * 60 * 1000);

    // Cleanup stealth mappings
    stealthMapping.unregister(duel.player1.stealthId);
    stealthMapping.unregister(duel.player2.stealthId);

    console.log(`[DuelEscrow] Duel ${duelId} settled successfully`);

    return {
      success: true,
      winnerTxSignature: winnerResult.txSignature,
      treasuryTxSignature,
      winnerPayoutLamports: BigInt(winnerPayout),
      houseFeeLamports: BigInt(houseFee),
      commitmentHash,
      commitmentTxSignature,
    };
  }

  // ==========================================================================
  // Refund Duel
  // ==========================================================================

  async refundDuel(duelId: DuelId, reason: 'timeout' | 'cancelled' | 'error'): Promise<RefundResult> {
    this.ensureInitialized();

    const duel = await this.getDuel(duelId);
    if (!duel) {
      return { success: false, error: 'Duel not found' };
    }

    if (duel.status === DuelStatus.SETTLED || duel.status === DuelStatus.REFUNDED) {
      return { success: false, error: `Duel already ${duel.status.toLowerCase()}` };
    }

    console.log(`[DuelEscrow] Refunding duel ${duelId} - reason: ${reason}`);

    const refundTxSignatures: TxSignature[] = [];

    // Refund P1 if they locked
    if (duel.player1.stakeLocked) {
      const p1Wallet = stealthMapping.resolve(duel.player1.stealthId);
      if (p1Wallet) {
        const refund = await shadowWireDirect.transferFromEscrow(
          p1Wallet,
          Number(duel.player1.stakeAmount),
          duel.token
        );
        if (refund.success && refund.txSignature) {
          refundTxSignatures.push(refund.txSignature);
          console.log(`[DuelEscrow] Refunded P1`);
        }
      }
    }

    // Refund P2 if they locked
    if (duel.player2.stakeLocked) {
      const p2Wallet = stealthMapping.resolve(duel.player2.stealthId);
      if (p2Wallet) {
        const refund = await shadowWireDirect.transferFromEscrow(
          p2Wallet,
          Number(duel.player2.stakeAmount),
          duel.token
        );
        if (refund.success && refund.txSignature) {
          refundTxSignatures.push(refund.txSignature);
          console.log(`[DuelEscrow] Refunded P2`);
        }
      }
    }

    duel.status = DuelStatus.REFUNDED;
    duel.settlementTxSignatures = refundTxSignatures;
    duel.updatedAt = Date.now();

    memoryStore.setDuel(duelId, duel, 24 * 60 * 60 * 1000);

    stealthMapping.unregister(duel.player1.stealthId);
    stealthMapping.unregister(duel.player2.stealthId);

    console.log(`[DuelEscrow] Duel ${duelId} refunded`);

    return { success: true, refundTxSignatures };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  async getDuel(duelId: DuelId): Promise<DuelSession | null> {
    this.ensureInitialized();
    return memoryStore.getDuel(duelId);
  }

  // ==========================================================================
  // Dust Accumulation (for house fees below 0.1 SOL minimum)
  // ==========================================================================

  /**
   * Accumulate dust (small fees) for later sweep to treasury
   */
  private accumulateDust(amount: number, token: string): void {
    memoryStore.accumulateDust(token, amount);
  }

  /**
   * Get accumulated dust for a token
   */
  async getAccumulatedDust(token: string = 'SOL'): Promise<number> {
    this.ensureInitialized();
    return memoryStore.getDust(token);
  }

  // ==========================================================================
  // Recovery Methods (for stuck funds)
  // ==========================================================================

  /**
   * Get list of failed/stuck duels that need recovery
   */
  async getFailedDuels(): Promise<string[]> {
    this.ensureInitialized();
    return memoryStore.getFailedRecovery();
  }

  /**
   * Get list of duels pending settlement
   */
  async getPendingSettlements(): Promise<string[]> {
    this.ensureInitialized();
    return memoryStore.getPendingRecovery();
  }

  /**
   * Emergency refund - force refund both players regardless of duel status
   * Use this to recover stuck funds
   */
  async emergencyRefund(
    duelId: DuelId,
    player1Wallet: WalletAddress,
    player2Wallet: WalletAddress,
    stakePerPlayerLamports: number,
    token: string = 'SOL'
  ): Promise<{
    success: boolean;
    refunds: { player: string; success: boolean; txSignature?: string; error?: string }[];
    error?: string;
  }> {
    this.ensureInitialized();
    const SHADOWWIRE_FEE_PERCENT = 0.5;
    const depositFeeMultiplier = 1 - (SHADOWWIRE_FEE_PERCENT / 100);

    // Calculate actual amount in escrow per player (after deposit fee)
    const actualPerPlayer = Math.floor(stakePerPlayerLamports * depositFeeMultiplier);

    console.log(`[DuelEscrow] EMERGENCY REFUND for duel ${duelId}`);
    console.log(`  Refunding ${actualPerPlayer} lamports to each player`);

    const refunds: { player: string; success: boolean; txSignature?: string; error?: string }[] = [];

    // Refund player 1
    if (player1Wallet) {
      const result = await shadowWireDirect.transferFromEscrow(player1Wallet, actualPerPlayer, token);
      refunds.push({
        player: 'player1',
        success: result.success,
        txSignature: result.txSignature,
        error: result.error,
      });
      if (result.success) {
        console.log(`[DuelEscrow] Emergency refund P1 success: ${result.txSignature}`);
      } else {
        console.error(`[DuelEscrow] Emergency refund P1 failed: ${result.error}`);
      }
    }

    // Refund player 2
    if (player2Wallet) {
      const result = await shadowWireDirect.transferFromEscrow(player2Wallet, actualPerPlayer, token);
      refunds.push({
        player: 'player2',
        success: result.success,
        txSignature: result.txSignature,
        error: result.error,
      });
      if (result.success) {
        console.log(`[DuelEscrow] Emergency refund P2 success: ${result.txSignature}`);
      } else {
        console.error(`[DuelEscrow] Emergency refund P2 failed: ${result.error}`);
      }
    }

    // Remove from failed list if both succeeded
    const allSuccess = refunds.every(r => r.success);
    if (allSuccess) {
      memoryStore.removeFailedRecovery(duelId);
      memoryStore.removePendingRecovery(duelId);

      // Mark duel as refunded if it still exists
      const duel = await this.getDuel(duelId);
      if (duel) {
        duel.status = DuelStatus.REFUNDED;
        duel.updatedAt = Date.now();
        memoryStore.setDuel(duelId, duel, 24 * 60 * 60 * 1000);
      }
    }

    return {
      success: allSuccess,
      refunds,
      error: allSuccess ? undefined : 'Some refunds failed - check individual results',
    };
  }

  /**
   * Sweep accumulated dust to treasury when it exceeds minimum
   */
  async sweepDustToTreasury(token: string = 'SOL'): Promise<{
    success: boolean;
    amount?: number;
    txSignature?: string;
    error?: string;
  }> {
    this.ensureInitialized();
    const SHADOWWIRE_MIN_TRANSFER = 100_000_000; // 0.1 SOL

    const dustAmount = await this.getAccumulatedDust(token);

    if (dustAmount < SHADOWWIRE_MIN_TRANSFER) {
      const lamportsToSol = (l: number) => (l / 1_000_000_000).toFixed(6);
      return {
        success: false,
        amount: dustAmount,
        error: `Accumulated dust ${lamportsToSol(dustAmount)} SOL is below 0.1 SOL minimum`,
      };
    }

    console.log(`[DuelEscrow] Sweeping ${dustAmount} lamports dust to treasury`);

    const result = await shadowWireDirect.transferToTreasury(dustAmount, token);

    if (result.success) {
      // Reset dust counter
      memoryStore.resetDust(token);
      console.log(`[DuelEscrow] Dust sweep successful: ${result.txSignature}`);
      return {
        success: true,
        amount: dustAmount,
        txSignature: result.txSignature,
      };
    } else {
      return {
        success: false,
        amount: dustAmount,
        error: result.error,
      };
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const duelEscrowService = new DuelEscrowService();
