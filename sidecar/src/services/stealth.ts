/**
 * Stealth Service - Wallet Privacy Layer
 *
 * CRITICAL: This service ensures wallet addresses are NEVER stored in plaintext.
 * All wallet addresses are hashed with HMAC-SHA256 using a secret pepper.
 *
 * Security Properties:
 * - Deterministic: Same wallet always produces same stealth ID
 * - One-way: Cannot reverse stealth ID to wallet address
 * - Collision-resistant: Different wallets produce different stealth IDs
 * - Pepper-dependent: Without pepper, stealth IDs are meaningless
 */

import { createHmac, randomBytes } from 'crypto';
import type { StealthId, WalletAddress } from '../types/index.js';
import { getConfig } from '../config.js';

// ============================================================================
// Stealth ID Generation
// ============================================================================

/**
 * Generate a stealth ID from a wallet address.
 * This is the ONLY function that should touch raw wallet addresses.
 *
 * @param wallet - Raw Solana wallet address
 * @returns StealthId - HMAC-SHA256 hash (safe to store/log)
 */
export function generateStealthId(wallet: WalletAddress): StealthId {
  const config = getConfig();

  // Normalize wallet address (trim whitespace, lowercase for consistency)
  const normalizedWallet = wallet.trim();

  // HMAC-SHA256 with secret pepper
  const hmac = createHmac('sha256', config.WALLET_PEPPER);
  hmac.update(normalizedWallet);

  // Return hex-encoded hash (64 characters)
  return hmac.digest('hex');
}

/**
 * Verify that a wallet address matches a stealth ID.
 * Used during authentication/verification flows.
 *
 * @param wallet - Raw wallet address to verify
 * @param stealthId - Expected stealth ID
 * @returns boolean - True if wallet hashes to the stealth ID
 */
export function verifyStealthId(wallet: WalletAddress, stealthId: StealthId): boolean {
  const computed = generateStealthId(wallet);

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(computed, stealthId);
}

/**
 * Constant-time string comparison.
 * Prevents timing attacks that could leak stealth ID information.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// Wallet Address Masking (for logs)
// ============================================================================

/**
 * Mask a wallet address for safe logging.
 * Shows first 4 and last 4 characters only.
 *
 * Example: "7xKX...9fGh"
 *
 * @param wallet - Raw wallet address
 * @returns Masked string safe for logging
 */
export function maskWallet(wallet: WalletAddress): string {
  if (wallet.length <= 8) {
    return '****';
  }
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

// ============================================================================
// Stealth ID Utilities
// ============================================================================

/**
 * Generate a random stealth ID for testing purposes.
 * Should NEVER be used in production for real duels.
 */
export function generateRandomStealthId(): StealthId {
  return randomBytes(32).toString('hex');
}

/**
 * Validate stealth ID format.
 * Must be 64 character hex string.
 */
export function isValidStealthId(id: string): id is StealthId {
  return /^[a-f0-9]{64}$/.test(id);
}

/**
 * Truncate stealth ID for display.
 * Shows first 8 characters only.
 *
 * Example: "a1b2c3d4..."
 */
export function truncateStealthId(stealthId: StealthId): string {
  return `${stealthId.slice(0, 8)}...`;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Generate stealth IDs for multiple wallets.
 * Useful for batch operations.
 */
export function generateStealthIds(wallets: WalletAddress[]): Map<WalletAddress, StealthId> {
  const result = new Map<WalletAddress, StealthId>();

  for (const wallet of wallets) {
    result.set(wallet, generateStealthId(wallet));
  }

  return result;
}

// ============================================================================
// Stealth Mapping Service
// ============================================================================

/**
 * In-memory stealth map for current session.
 * Maps stealth IDs back to wallets for the duration of a duel.
 *
 * SECURITY: This map is NEVER persisted to disk or database.
 * It exists only in memory for active duel sessions.
 */
class StealthMappingService {
  private readonly sessionMap = new Map<StealthId, WalletAddress>();

  /**
   * Register a wallet for the current session.
   * Returns the stealth ID.
   */
  register(wallet: WalletAddress): StealthId {
    const stealthId = generateStealthId(wallet);
    this.sessionMap.set(stealthId, wallet);
    return stealthId;
  }

  /**
   * Resolve a stealth ID to wallet address.
   * Only works for wallets registered in this session.
   */
  resolve(stealthId: StealthId): WalletAddress | undefined {
    return this.sessionMap.get(stealthId);
  }

  /**
   * Check if a stealth ID is registered in this session.
   */
  has(stealthId: StealthId): boolean {
    return this.sessionMap.has(stealthId);
  }

  /**
   * Remove a stealth ID from the session map.
   * Call this when a duel is settled or refunded.
   */
  unregister(stealthId: StealthId): boolean {
    return this.sessionMap.delete(stealthId);
  }

  /**
   * Clear all mappings.
   * Use with caution - only for shutdown or testing.
   */
  clear(): void {
    this.sessionMap.clear();
  }

  /**
   * Get the number of active mappings.
   */
  get size(): number {
    return this.sessionMap.size;
  }
}

// Singleton instance
export const stealthMapping = new StealthMappingService();

// ============================================================================
// Exports
// ============================================================================

export type { StealthId, WalletAddress };
