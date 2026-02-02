/**
 * Alerith ShadowWire Sidecar - Configuration
 * Zod-validated environment configuration
 */

import { z } from 'zod';

// ============================================================================
// Environment Schema
// ============================================================================

const envSchema = z.object({
  // Solana Configuration
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta']).default('devnet'),

  // Wallet Secret Keys (base58 encoded)
  ESCROW_WALLET_SECRET: z.string().min(32, 'Escrow wallet secret is required'),
  TREASURY_WALLET_SECRET: z.string().min(32, 'Treasury wallet secret is required'),
  SERVER_AUTHORITY_SECRET: z.string().min(32, 'Server authority secret is required'),

  // Security
  WALLET_PEPPER: z.string().min(32, 'Wallet pepper must be at least 32 characters'),
  INTERNAL_API_KEY: z.string().min(32, 'Internal API key must be at least 32 characters'),

  // Stake Limits
  HOUSE_FEE_PERCENT: z.coerce.number().min(0).max(10).default(2),

  // Timeouts
  ESCROW_TIMEOUT_SECONDS: z.coerce.number().positive().default(1800), // 30 minutes

  // Redis (deprecated - kept for backwards compatibility)
  REDIS_URL: z.string().optional(),

  // Server
  PORT: z.coerce.number().positive().default(3002),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// ============================================================================
// Configuration Type
// ============================================================================

export type EnvConfig = z.infer<typeof envSchema>;

// ============================================================================
// Load and Validate Configuration
// ============================================================================

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    console.error('Configuration validation failed:');
    console.error(errors.join('\n'));
    throw new Error('Invalid configuration. Check environment variables.');
  }

  return result.data;
}

// ============================================================================
// Derived Configuration
// ============================================================================

export interface Config extends EnvConfig {
  // Derived values
  readonly escrowTimeoutMs: number;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly isTest: boolean;
}

function createConfig(env: EnvConfig): Config {
  const LAMPORTS_PER_SOL = 1_000_000_000n;

  return {
    ...env,
    escrowTimeoutMs: env.ESCROW_TIMEOUT_SECONDS * 1000,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  };
}

// ============================================================================
// Singleton Export
// ============================================================================

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = createConfig(loadConfig());
  }
  return _config;
}

// For testing - allows resetting config
export function resetConfig(): void {
  _config = null;
}

// ============================================================================
// Constants
// ============================================================================

export const LAMPORTS_PER_SOL = 1_000_000_000n;

// ShadowWire supported tokens
export const SUPPORTED_TOKENS = ['SOL', 'USD1', 'RADR'] as const;
export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

export const TOKEN_DECIMALS: Record<SupportedToken, number> = {
  SOL: 9,
  USD1: 6,
  RADR: 9,
};

// Minimum amounts per token (in smallest units)
// 10% above ShadowWire minimums to cover fees and ensure refunds work
export const TOKEN_MINIMUMS: Record<SupportedToken, number> = {
  SOL: 110_000_000,           // 0.11 SOL
  USD1: 5_500_000,            // 5.5 USD1
  RADR: 11_000_000_000_000,   // 11,000 RADR
};

// Minimum amounts in display units (for UI)
export const TOKEN_MINIMUM_DISPLAY: Record<SupportedToken, number> = {
  SOL: 0.11,
  USD1: 5.5,
  RADR: 11000,
};

// Token mint addresses for API calls
export const TOKEN_MINTS: Record<SupportedToken, string | null> = {
  SOL: null, // Native, no mint needed
  USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  RADR: 'CzFvsLdUazabdiu9TYXujj4EY495fG7VgJJ3vQs6bonk',
};

// ShadowWire API
export const SHADOWWIRE_API_URL = 'https://shadow.radr.fun/shadowpay';
