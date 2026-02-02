/**
 * In-Memory Store - Redis Replacement
 *
 * Provides in-memory storage with TTL support for:
 * - Duel sessions
 * - Dust accumulation
 * - Recovery tracking
 *
 * Note: Data is lost on restart. For production with persistence
 * requirements, consider adding periodic snapshots to disk.
 */

import type { DuelSession } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

interface StoredItem<T> {
  data: T;
  expiresAt: number | null; // null = no expiry
}

// ============================================================================
// Memory Store
// ============================================================================

class MemoryStore {
  // Duel sessions with TTL
  private duels = new Map<string, StoredItem<DuelSession>>();

  // Dust accumulation per token (no TTL)
  private dust = new Map<string, number>();

  // Recovery sets
  private pendingRecovery = new Set<string>();
  private failedRecovery = new Set<string>();

  // Cleanup interval handle
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  // Stats
  private stats = {
    duelsCreated: 0,
    duelsExpired: 0,
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Start the cleanup interval for expired items
   */
  initialize(): void {
    if (this.cleanupInterval) return;

    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60_000);

    console.log('[MemoryStore] Initialized with 60s cleanup interval');
  }

  /**
   * Stop the cleanup interval and clear all data
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.duels.clear();
    this.dust.clear();
    this.pendingRecovery.clear();
    this.failedRecovery.clear();

    console.log('[MemoryStore] Shutdown complete');
  }

  /**
   * Clean up expired items
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, item] of this.duels) {
      if (item.expiresAt !== null && item.expiresAt <= now) {
        this.duels.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.stats.duelsExpired += expiredCount;
      console.log(`[MemoryStore] Cleaned up ${expiredCount} expired duels`);
    }
  }

  // ============================================================================
  // Duel Operations
  // ============================================================================

  /**
   * Store a duel session with TTL
   */
  setDuel(duelId: string, duel: DuelSession, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.duels.set(duelId, { data: duel, expiresAt });
    this.stats.duelsCreated++;
  }

  /**
   * Get a duel session (returns null if expired or not found)
   */
  getDuel(duelId: string): DuelSession | null {
    const item = this.duels.get(duelId);

    if (!item) return null;

    if (item.expiresAt !== null && item.expiresAt <= Date.now()) {
      this.duels.delete(duelId);
      this.stats.duelsExpired++;
      return null;
    }

    return item.data;
  }

  /**
   * Delete a duel session
   */
  deleteDuel(duelId: string): boolean {
    return this.duels.delete(duelId);
  }

  /**
   * Check if a duel exists
   */
  hasDuel(duelId: string): boolean {
    return this.getDuel(duelId) !== null;
  }

  /**
   * Get all active duels (not expired)
   */
  getAllDuels(): DuelSession[] {
    const now = Date.now();
    const result: DuelSession[] = [];

    for (const [key, item] of this.duels) {
      if (item.expiresAt === null || item.expiresAt > now) {
        result.push(item.data);
      }
    }

    return result;
  }

  // ============================================================================
  // Dust Operations (for house fees below minimum)
  // ============================================================================

  /**
   * Add to dust accumulation for a token
   */
  accumulateDust(token: string, amount: number): void {
    const current = this.dust.get(token) || 0;
    this.dust.set(token, current + amount);
  }

  /**
   * Get accumulated dust for a token
   */
  getDust(token: string): number {
    return this.dust.get(token) || 0;
  }

  /**
   * Reset dust for a token (after sweep)
   */
  resetDust(token: string): void {
    this.dust.set(token, 0);
  }

  // ============================================================================
  // Recovery Operations
  // ============================================================================

  /**
   * Add duel to pending recovery
   */
  addPendingRecovery(duelId: string): void {
    this.pendingRecovery.add(duelId);
  }

  /**
   * Remove duel from pending recovery
   */
  removePendingRecovery(duelId: string): void {
    this.pendingRecovery.delete(duelId);
  }

  /**
   * Get all pending recovery duels
   */
  getPendingRecovery(): string[] {
    return Array.from(this.pendingRecovery);
  }

  /**
   * Add duel to failed recovery
   */
  addFailedRecovery(duelId: string): void {
    this.failedRecovery.add(duelId);
  }

  /**
   * Remove duel from failed recovery
   */
  removeFailedRecovery(duelId: string): void {
    this.failedRecovery.delete(duelId);
  }

  /**
   * Get all failed recovery duels
   */
  getFailedRecovery(): string[] {
    return Array.from(this.failedRecovery);
  }

  // ============================================================================
  // Stats & Health
  // ============================================================================

  /**
   * Get store statistics
   */
  getStats(): {
    activeDuels: number;
    duelsCreated: number;
    duelsExpired: number;
    dustTokens: number;
    pendingRecovery: number;
    failedRecovery: number;
  } {
    // Trigger cleanup to get accurate count
    this.cleanup();

    return {
      activeDuels: this.duels.size,
      duelsCreated: this.stats.duelsCreated,
      duelsExpired: this.stats.duelsExpired,
      dustTokens: this.dust.size,
      pendingRecovery: this.pendingRecovery.size,
      failedRecovery: this.failedRecovery.size,
    };
  }

  /**
   * Check if store is healthy (always true for in-memory)
   */
  isHealthy(): boolean {
    return true;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const memoryStore = new MemoryStore();
