/**
 * Alerith ShadowWire Sidecar - Type Definitions
 * All types for privacy-preserving duel escrow system
 */

// ============================================================================
// Stealth Identity Types
// ============================================================================

/** Stealth ID - HMAC-SHA256 hash of wallet address (never store raw wallets) */
export type StealthId = string;

/** Raw Solana wallet address - only used transiently, never persisted */
export type WalletAddress = string;

/** Duel session identifier */
export type DuelId = string;

/** ShadowWire transaction signature */
export type TxSignature = string;

/** Character ID from game server */
export type CharacterId = string;

// ============================================================================
// Duel State Machine
// ============================================================================

export enum DuelStatus {
  /** Waiting for both players to lock stakes */
  PENDING_STAKES = 'PENDING_STAKES',
  /** Both stakes locked, combat can begin */
  ACTIVE = 'ACTIVE',
  /** Combat finished, awaiting settlement */
  PENDING_SETTLEMENT = 'PENDING_SETTLEMENT',
  /** Winner paid, duel complete */
  SETTLED = 'SETTLED',
  /** Timeout or cancellation, refunds issued */
  REFUNDED = 'REFUNDED',
  /** Something went wrong */
  FAILED = 'FAILED',
}

export interface DuelParticipant {
  /** Stealth ID (hashed wallet) - safe to persist */
  stealthId: StealthId;
  /** Character ID from game */
  characterId: CharacterId;
  /** Character name */
  characterName: string;
  /** Stake amount in lamports */
  stakeAmount: bigint;
  /** Whether stake is locked in escrow */
  stakeLocked: boolean;
  /** Lock transaction signature (if locked) */
  lockTxSignature?: TxSignature;
  /** Timestamp when stake was locked */
  lockTimestamp?: number;
  /** ShadowPay authorization ID for this player */
  authorizationId?: number;
}

export interface DuelRules {
  /** Allow potions */
  allowPotions: boolean;
  /** Allow prayer */
  allowPrayer: boolean;
  /** Allow movement */
  allowMovement: boolean;
  /** Restrict magic */
  noMagic: boolean;
  /** Restrict melee */
  noMelee: boolean;
  /** Restrict ranged */
  noRanged: boolean;
}

export interface CombatSummary {
  /** Total combat ticks */
  totalTicks: number;
  /** Player 1 damage dealt */
  player1DamageDealt: number;
  /** Player 2 damage dealt */
  player2DamageDealt: number;
  /** Reason for win */
  winReason: 'death' | 'forfeit' | 'timeout';
}

export interface DuelSession {
  /** Unique duel identifier */
  duelId: DuelId;
  /** Current duel status */
  status: DuelStatus;
  /** Player 1 (challenger) */
  player1: DuelParticipant;
  /** Player 2 (opponent) */
  player2: DuelParticipant;
  /** Token being staked (default: SOL) */
  token: string;
  /** House fee percentage (e.g., 2 for 2%) */
  houseFeePercent: number;
  /** Duel rules */
  rules: DuelRules;
  /** Duel creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Expiration timestamp (deadman's switch) */
  expiresAt: number;
  /** Winner stealth ID (after settlement) */
  winnerStealthId?: StealthId;
  /** Settlement transaction signatures */
  settlementTxSignatures?: TxSignature[];
  /** Combat summary (after settlement) */
  combatSummary?: CombatSummary;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateDuelRequest {
  /** Player 1 wallet address (will be hashed immediately) */
  player1Wallet: WalletAddress;
  /** Player 2 wallet address (will be hashed immediately) */
  player2Wallet: WalletAddress;
  /** Player 1 character ID */
  player1CharacterId: CharacterId;
  /** Player 2 character ID */
  player2CharacterId: CharacterId;
  /** Player 1 character name */
  player1Name: string;
  /** Player 2 character name */
  player2Name: string;
  /** Stake amount in human units (e.g., 1.5 for 1.5 SOL) */
  stakeAmount: number;
  /** Token to stake (default: SOL) */
  token?: string;
  /** Duel rules */
  rules?: Partial<DuelRules>;
}

export interface CreateDuelResponse {
  success: boolean;
  duelId?: DuelId;
  /** Stealth IDs for both players (safe to store/log) */
  player1StealthId?: StealthId;
  player2StealthId?: StealthId;
  /** Stake amount in lamports */
  stakeAmountLamports?: string;
  /** Expiration timestamp */
  expiresAt?: number;
  error?: string;
}

export interface LockStakeRequest {
  /** Duel ID */
  duelId: DuelId;
  /** Player wallet address (verified against duel participants) */
  playerWallet: WalletAddress;
  /** Signed message from player's wallet (for authentication) */
  signedMessage: string;
  /** Original message that was signed */
  message: string;
}

export interface LockStakeResponse {
  success: boolean;
  /** Transaction signature from ShadowWire */
  txSignature?: TxSignature;
  /** Updated duel status */
  duelStatus: DuelStatus;
  /** Whether both players have locked */
  bothLocked: boolean;
  error?: string;
}

export interface SettleDuelRequest {
  /** Duel ID */
  duelId: DuelId;
  /** Winner wallet address */
  winnerWallet: WalletAddress;
  /** Winner character ID */
  winnerCharacterId: CharacterId;
  /** Server authority signature (proves game server is calling) */
  serverSignature: string;
  /** Combat summary for audit trail */
  combatSummary?: CombatSummary;
}

export interface SettleDuelResponse {
  success: boolean;
  /** Winner payout transaction signature */
  winnerTxSignature?: TxSignature;
  /** Treasury fee transaction signature */
  treasuryTxSignature?: TxSignature;
  /** Winner payout amount in lamports */
  winnerPayoutLamports?: string;
  /** Treasury fee in lamports */
  treasuryFeeLamports?: string;
  /** Commitment hash (for accountability verification) */
  commitmentHash?: string;
  /** On-chain commitment transaction signature */
  commitmentTxSignature?: string;
  error?: string;
}

export interface RefundDuelRequest {
  /** Duel ID */
  duelId: DuelId;
  /** Reason for refund */
  reason: 'timeout' | 'cancelled' | 'error';
  /** Server authority signature */
  serverSignature: string;
}

export interface RefundDuelResponse {
  success: boolean;
  /** Refund transaction signatures */
  refundTxSignatures?: TxSignature[];
  error?: string;
}

export interface GetDuelStatusRequest {
  duelId: DuelId;
}

export interface GetDuelStatusResponse {
  success: boolean;
  duel?: {
    duelId: DuelId;
    status: DuelStatus;
    player1StealthId: StealthId;
    player2StealthId: StealthId;
    player1Name: string;
    player2Name: string;
    player1Locked: boolean;
    player2Locked: boolean;
    stakeAmountLamports: string;
    token: string;
    rules: DuelRules;
    expiresAt: number;
    winnerStealthId?: StealthId;
    combatSummary?: CombatSummary;
  };
  error?: string;
}

// ============================================================================
// Authorization Types (Pre-Auth for UX)
// ============================================================================

export interface SpendingAuthorization {
  /** Authorization ID */
  authorizationId: string;
  /** Player stealth ID */
  playerStealthId: StealthId;
  /** Maximum amount per transaction */
  maxAmountPerTx: bigint;
  /** Maximum daily spend */
  maxDailySpend: bigint;
  /** Amount spent today */
  spentToday: bigint;
  /** Created timestamp */
  createdAt: number;
  /** Expires timestamp */
  expiresAt: number;
  /** Whether active */
  isActive: boolean;
}

export interface AuthorizeSpendingRequest {
  /** Player wallet */
  playerWallet: WalletAddress;
  /** Max amount per tx (lamports as string for JSON) */
  maxAmountPerTx: string;
  /** Max daily spend (lamports as string for JSON) */
  maxDailySpend: string;
  /** Valid for seconds */
  validForSeconds: number;
  /** Signed message */
  signedMessage: string;
  /** Original message */
  message: string;
}

export interface AuthorizeSpendingResponse {
  success: boolean;
  authorizationId?: string;
  expiresAt?: number;
  error?: string;
}

export interface RevokeAuthorizationRequest {
  authorizationId: string;
  playerWallet: WalletAddress;
  signedMessage: string;
}

export interface RevokeAuthorizationResponse {
  success: boolean;
  error?: string;
}

/** @deprecated Use AuthorizeSpendingRequest instead */
export interface AuthorizationRequest {
  /** Player wallet address */
  playerWallet: WalletAddress;
  /** Maximum amount per transaction (lamports) */
  maxAmountPerTx: bigint;
  /** Maximum daily spend (lamports) */
  maxDailySpend: bigint;
  /** Authorization validity period (seconds) */
  validForSeconds: number;
  /** Signed authorization message from player */
  signedMessage: string;
  /** Original message that was signed */
  message: string;
}

/** @deprecated Use AuthorizeSpendingResponse instead */
export interface AuthorizationResponse {
  success: boolean;
  /** Authorization ID */
  authorizationId?: string;
  /** Expiration timestamp */
  expiresAt?: number;
  error?: string;
}

// ============================================================================
// Health & Monitoring Types
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    redis: boolean;
    shadowwire: boolean;
    solana: boolean;
  };
  timestamp: number;
}

// ============================================================================
// Internal Service Types
// ============================================================================

export interface ShadowWireTransferParams {
  senderWallet: WalletAddress;
  recipientWallet: WalletAddress;
  amount: number; // Human units
  token: string;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
}

export interface EscrowState {
  duelId: DuelId;
  totalLockedLamports: bigint;
  player1LockedLamports: bigint;
  player2LockedLamports: bigint;
  status: DuelStatus;
}
