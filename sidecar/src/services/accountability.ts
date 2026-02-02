/**
 * Accountability Service - Cryptographic Commitment System
 *
 * Provides verifiable accountability for duel settlements:
 * - Creates cryptographic commitments before settlements
 * - Posts commitment hashes on-chain via Solana memo
 * - Maintains local audit log for dispute resolution
 *
 * Privacy-preserving: Uses stealth IDs (not wallet addresses)
 * in commitments, so even if revealed, wallets stay private.
 */

import { createHash, createHmac } from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfig } from '../config.js';
import type { DuelId, StealthId, CombatSummary } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface SettlementCommitment {
  /** Duel identifier */
  duelId: DuelId;
  /** Winner's stealth ID (hashed wallet - can't be reversed) */
  winnerStealthId: StealthId;
  /** Loser's stealth ID */
  loserStealthId: StealthId;
  /** Game server's signature on the settlement request */
  gameServerSignature: string;
  /** Commitment creation timestamp */
  timestamp: number;
  /** Commitment version for future compatibility */
  version: number;
}

export interface CommitmentRecord {
  /** The commitment data */
  commitment: SettlementCommitment;
  /** SHA-256 hash of the commitment */
  commitmentHash: string;
  /** Solana transaction signature (if posted on-chain) */
  onChainTxSignature?: string;
  /** Whether on-chain posting succeeded */
  onChainSuccess: boolean;
  /** Timestamp when record was created */
  recordedAt: number;
}

export interface CommitmentResult {
  success: boolean;
  commitmentHash?: string;
  onChainTxSignature?: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

// Solana Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Current commitment version
const COMMITMENT_VERSION = 1;

// ============================================================================
// Accountability Service
// ============================================================================

class AccountabilityService {
  private connection: Connection | null = null;
  private serverKeypair: Keypair | null = null;
  private initialized = false;

  // Local audit log (in-memory for hackathon, would be persistent in production)
  private auditLog: CommitmentRecord[] = [];

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the accountability service
   */
  initialize(): void {
    if (this.initialized) return;

    const config = getConfig();

    // Initialize Solana connection
    this.connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

    // Load server authority keypair for signing memo transactions
    try {
      const secretKey = bs58.decode(config.SERVER_AUTHORITY_SECRET);
      this.serverKeypair = Keypair.fromSecretKey(secretKey);
      console.log(`[Accountability] Server authority: ${this.serverKeypair.publicKey.toBase58()}`);
    } catch (error) {
      console.error('[Accountability] Failed to load server keypair:', error);
      throw new Error('Invalid SERVER_AUTHORITY_SECRET');
    }

    this.initialized = true;
    console.log('[Accountability] Service initialized');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Accountability service not initialized');
    }
  }

  // ============================================================================
  // Commitment Creation
  // ============================================================================

  /**
   * Create a settlement commitment
   */
  createCommitment(
    duelId: DuelId,
    winnerStealthId: StealthId,
    loserStealthId: StealthId,
    gameServerSignature: string
  ): SettlementCommitment {
    return {
      duelId,
      winnerStealthId,
      loserStealthId,
      gameServerSignature,
      timestamp: Date.now(),
      version: COMMITMENT_VERSION,
    };
  }

  /**
   * Hash a commitment using SHA-256
   */
  hashCommitment(commitment: SettlementCommitment): string {
    const data = JSON.stringify(commitment);
    return createHash('sha256').update(data).digest('hex');
  }

  // ============================================================================
  // On-Chain Posting
  // ============================================================================

  /**
   * Post commitment hash on-chain via Solana memo
   *
   * This creates a permanent, timestamped record that:
   * - Proves the commitment existed at a specific time
   * - Cannot be altered after the fact
   * - Is publicly verifiable by anyone
   */
  async postCommitmentOnChain(commitmentHash: string): Promise<{
    success: boolean;
    txSignature?: string;
    error?: string;
  }> {
    this.ensureInitialized();

    if (!this.connection || !this.serverKeypair) {
      return { success: false, error: 'Service not properly initialized' };
    }

    try {
      // Create memo instruction with the commitment hash (as UTF-8 text)
      // Memo program requires UTF-8 data, so we send the hex string directly
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(commitmentHash, 'utf8'),
      });

      // Build transaction
      const transaction = new Transaction().add(memoInstruction);

      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.serverKeypair.publicKey;

      // Sign transaction
      transaction.sign(this.serverKeypair);

      const txSignature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Wait for confirmation
      await this.connection.confirmTransaction({
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      });

      console.log(`[Accountability] Commitment posted on-chain: ${txSignature}`);

      return { success: true, txSignature };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Accountability] Failed to post on-chain: ${message}`);
      return { success: false, error: message };
    }
  }

  // ============================================================================
  // Full Commitment Flow
  // ============================================================================

  /**
   * Create and record a settlement commitment
   *
   * This is the main method to call before settlement:
   * 1. Creates the commitment data
   * 2. Hashes it
   * 3. Posts hash on-chain (optional, can fail gracefully)
   * 4. Records in local audit log
   */
  async commitToSettlement(
    duelId: DuelId,
    winnerStealthId: StealthId,
    loserStealthId: StealthId,
    gameServerSignature: string,
    postOnChain: boolean = true
  ): Promise<CommitmentResult> {
    this.ensureInitialized();

    const commitment = this.createCommitment(
      duelId,
      winnerStealthId,
      loserStealthId,
      gameServerSignature
    );

    // Hash it
    const commitmentHash = this.hashCommitment(commitment);

    console.log(`[Accountability] Created commitment for duel ${duelId}`);
    console.log(`[Accountability] Hash: ${commitmentHash.slice(0, 16)}...`);

    // Try to post on-chain
    let onChainResult: { success: boolean; txSignature?: string; error?: string } = { success: false };

    if (postOnChain) {
      onChainResult = await this.postCommitmentOnChain(commitmentHash);

      if (!onChainResult.success) {
        console.warn(`[Accountability] On-chain posting failed, continuing with local record only`);
      }
    }

    // Record in audit log (always, regardless of on-chain success)
    const record: CommitmentRecord = {
      commitment,
      commitmentHash,
      onChainTxSignature: onChainResult.txSignature,
      onChainSuccess: onChainResult.success,
      recordedAt: Date.now(),
    };

    this.auditLog.push(record);

    console.log(`[Accountability] Recorded commitment (on-chain: ${onChainResult.success})`);

    return {
      success: true,
      commitmentHash,
      onChainTxSignature: onChainResult.txSignature,
    };
  }

  // ============================================================================
  // Verification & Audit
  // ============================================================================

  /**
   * Verify a commitment matches its hash
   */
  verifyCommitment(commitment: SettlementCommitment, expectedHash: string): boolean {
    const actualHash = this.hashCommitment(commitment);
    return actualHash === expectedHash;
  }

  /**
   * Get commitment record for a duel
   */
  getCommitmentRecord(duelId: DuelId): CommitmentRecord | undefined {
    return this.auditLog.find(record => record.commitment.duelId === duelId);
  }

  /**
   * Get all commitment records (for audit/export)
   */
  getAllRecords(): CommitmentRecord[] {
    return [...this.auditLog];
  }

  /**
   * Get audit log statistics
   */
  getStats(): {
    totalCommitments: number;
    onChainSuccess: number;
    onChainFailed: number;
  } {
    const onChainSuccess = this.auditLog.filter(r => r.onChainSuccess).length;
    return {
      totalCommitments: this.auditLog.length,
      onChainSuccess,
      onChainFailed: this.auditLog.length - onChainSuccess,
    };
  }

  // ============================================================================
  // Server Signature Verification
  // ============================================================================

  /**
   * Verify a game server signature
   *
   * The game server signs: sha256(duelId + winnerWallet + timestamp)
   * This proves the game server authorized this specific settlement.
   */
  verifyServerSignature(
    duelId: DuelId,
    winnerWallet: string,
    timestamp: number,
    signature: string,
    serverPublicKey: string
  ): boolean {
    try {
      // Recreate the message that was signed
      const message = `${duelId}:${winnerWallet}:${timestamp}`;
      const messageBytes = Buffer.from(message);

      // Decode signature and public key
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(serverPublicKey);

      // Verify using nacl (tweetnacl)
      // Note: This is a simplified check - in production you'd use proper Ed25519 verification
      const nacl = require('tweetnacl');
      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
      console.error('[Accountability] Signature verification failed:', error);
      return false;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const accountabilityService = new AccountabilityService();
