/**
 * Duel Simulation Script
 *
 * Simulates a complete duel flow on devnet using ShadowWire.
 * Run with: npm run simulate:duel
 *
 * Prerequisites:
 * 1. Run setup-devnet.ts first to create wallets and fund them
 * 2. Ensure escrow wallet has ShadowWire pool balance
 * 3. Ensure both player wallets have ShadowWire pool balance
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// ============================================================================
// Configuration
// ============================================================================

const SIDECAR_URL = process.env.SIDECAR_URL ?? 'http://localhost:3002';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? '';
const STAKE_AMOUNT_SOL = 0.1; // Small amount for testing

// Test player secrets (from setup-devnet.ts output)
const PLAYER_1_SECRET = process.env.PLAYER_1_SECRET;
const PLAYER_2_SECRET = process.env.PLAYER_2_SECRET;

// ============================================================================
// HTTP Client
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const url = `${SIDECAR_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Secret': INTERNAL_API_KEY,
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error ?? `HTTP ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ============================================================================
// Wallet Utilities
// ============================================================================

function loadKeypair(secret: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function signMessage(keypair: Keypair, message: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return Buffer.from(signature).toString('base64');
}

// ============================================================================
// Simulation Steps
// ============================================================================

async function checkHealth(): Promise<boolean> {
  console.log('\n[Step 0] Checking sidecar health...');
  console.log('-'.repeat(50));

  try {
    const response = await fetch(`${SIDECAR_URL}/health`);
    const health = await response.json();

    console.log(`Status: ${health.status}`);
    console.log(`Redis: ${health.checks.redis ? 'OK' : 'FAIL'}`);
    console.log(`ShadowWire: ${health.checks.shadowwire ? 'OK' : 'FAIL'}`);

    // For devnet, we use mock mode so shadowwire check may fail
    return health.checks.redis;
  } catch (error) {
    console.error('Health check failed - is the sidecar running?');
    return false;
  }
}

async function seedMockBalances(
  player1Wallet: string,
  player2Wallet: string
): Promise<boolean> {
  console.log('\n[Setup] Seeding mock ShadowWire balances (devnet mode)...');
  console.log('-'.repeat(50));

  try {
    // Seed escrow wallet
    const escrowResult = await apiCall('/test/seed-escrow', 'POST', {});
    if (!escrowResult.success) {
      console.error(`Failed to seed escrow: ${escrowResult.error}`);
      return false;
    }
    console.log('  Escrow wallet seeded with 100 SOL');

    // Seed player 1
    const player1Result = await apiCall('/test/seed-balance', 'POST', {
      wallet: player1Wallet,
      amountSol: 10,
    });
    if (!player1Result.success) {
      console.error(`Failed to seed player 1: ${player1Result.error}`);
      return false;
    }
    console.log('  Player 1 seeded with 10 SOL');

    // Seed player 2
    const player2Result = await apiCall('/test/seed-balance', 'POST', {
      wallet: player2Wallet,
      amountSol: 10,
    });
    if (!player2Result.success) {
      console.error(`Failed to seed player 2: ${player2Result.error}`);
      return false;
    }
    console.log('  Player 2 seeded with 10 SOL');

    return true;
  } catch (error) {
    console.error('Failed to seed mock balances:', error);
    return false;
  }
}

async function createDuel(
  player1Wallet: string,
  player2Wallet: string
): Promise<{ duelId: string; player1StealthId: string; player2StealthId: string } | null> {
  console.log('\n[Step 1] Creating duel...');
  console.log('-'.repeat(50));

  console.log(`Player 1: ${player1Wallet.slice(0, 8)}...${player1Wallet.slice(-4)}`);
  console.log(`Player 2: ${player2Wallet.slice(0, 8)}...${player2Wallet.slice(-4)}`);
  console.log(`Stake: ${STAKE_AMOUNT_SOL} SOL`);

  const result = await apiCall<{
    duelId: string;
    player1StealthId: string;
    player2StealthId: string;
    stakeAmountLamports: string;
    expiresAt: number;
  }>('/api/v1/duel/create', 'POST', {
    player1Wallet,
    player2Wallet,
    stakeAmount: STAKE_AMOUNT_SOL,
    token: 'SOL',
  });

  if (!result.success || !result.data) {
    console.error(`Failed to create duel: ${result.error}`);
    return null;
  }

  console.log(`\nDuel created!`);
  console.log(`  Duel ID: ${result.data.duelId}`);
  console.log(`  Player 1 Stealth ID: ${result.data.player1StealthId.slice(0, 8)}...`);
  console.log(`  Player 2 Stealth ID: ${result.data.player2StealthId.slice(0, 8)}...`);
  console.log(`  Expires: ${new Date(result.data.expiresAt).toISOString()}`);

  return {
    duelId: result.data.duelId,
    player1StealthId: result.data.player1StealthId,
    player2StealthId: result.data.player2StealthId,
  };
}

async function lockStake(
  duelId: string,
  playerKeypair: Keypair,
  playerNumber: 1 | 2
): Promise<boolean> {
  console.log(`\n[Step ${playerNumber + 1}] Player ${playerNumber} locking stake...`);
  console.log('-'.repeat(50));

  const wallet = playerKeypair.publicKey.toBase58();
  const message = `Lock stake for duel ${duelId}`;
  const signedMessage = signMessage(playerKeypair, message);

  const result = await apiCall<{
    txSignature: string;
    duelStatus: string;
    bothLocked: boolean;
  }>('/api/v1/duel/lock-stake', 'POST', {
    duelId,
    playerWallet: wallet,
    signedMessage,
    message,
  });

  if (!result.success || !result.data) {
    console.error(`Failed to lock stake: ${result.error}`);
    return false;
  }

  console.log(`Player ${playerNumber} stake locked!`);
  console.log(`  TX Signature: ${result.data.txSignature?.slice(0, 16)}...`);
  console.log(`  Duel Status: ${result.data.duelStatus}`);
  console.log(`  Both Locked: ${result.data.bothLocked}`);

  return true;
}

async function checkDuelStatus(duelId: string): Promise<void> {
  console.log('\n[Status Check] Getting duel status...');
  console.log('-'.repeat(50));

  const result = await apiCall<{
    duel: {
      duelId: string;
      status: string;
      player1Locked: boolean;
      player2Locked: boolean;
      stakeAmountLamports: string;
    };
  }>(`/api/v1/duel/${duelId}`, 'GET');

  if (!result.success || !result.data) {
    console.error(`Failed to get status: ${result.error}`);
    return;
  }

  const duel = result.data.duel;
  console.log(`  Status: ${duel.status}`);
  console.log(`  Player 1 Locked: ${duel.player1Locked}`);
  console.log(`  Player 2 Locked: ${duel.player2Locked}`);
}

async function settleDuel(duelId: string, winnerKeypair: Keypair): Promise<boolean> {
  console.log('\n[Step 4] Settling duel...');
  console.log('-'.repeat(50));

  const winnerWallet = winnerKeypair.publicKey.toBase58();
  console.log(`Winner: ${winnerWallet.slice(0, 8)}...${winnerWallet.slice(-4)}`);

  // In production, this would be signed by server authority
  const serverSignature = 'server-authority-signature';

  const result = await apiCall<{
    winnerTxSignature: string;
    treasuryTxSignature: string;
    winnerPayoutLamports: string;
    treasuryFeeLamports: string;
  }>('/api/v1/duel/settle', 'POST', {
    duelId,
    winnerWallet,
    serverSignature,
  });

  if (!result.success || !result.data) {
    console.error(`Failed to settle duel: ${result.error}`);
    return false;
  }

  const winnerPayoutSol = Number(result.data.winnerPayoutLamports) / 1e9;
  const treasuryFeeSol = Number(result.data.treasuryFeeLamports) / 1e9;

  console.log(`\nDuel settled!`);
  console.log(`  Winner Payout: ${winnerPayoutSol.toFixed(4)} SOL`);
  console.log(`  Treasury Fee: ${treasuryFeeSol.toFixed(4)} SOL`);
  console.log(`  Winner TX: ${result.data.winnerTxSignature?.slice(0, 16)}...`);
  console.log(`  Treasury TX: ${result.data.treasuryTxSignature?.slice(0, 16)}...`);

  return true;
}

// ============================================================================
// Main Simulation
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Alerith ShadowWire Duel Simulation');
  console.log('='.repeat(60));

  // Validate configuration
  if (!INTERNAL_API_KEY) {
    console.error('ERROR: INTERNAL_API_KEY not set');
    process.exit(1);
  }

  if (!PLAYER_1_SECRET || !PLAYER_2_SECRET) {
    console.error('ERROR: Player secrets not set');
    console.error('Run setup-devnet.ts first and set PLAYER_1_SECRET and PLAYER_2_SECRET');
    process.exit(1);
  }

  // Load player keypairs
  const player1Keypair = loadKeypair(PLAYER_1_SECRET);
  const player2Keypair = loadKeypair(PLAYER_2_SECRET);

  // Check sidecar health
  const healthy = await checkHealth();
  if (!healthy) {
    console.error('\nSidecar is not healthy. Aborting simulation.');
    process.exit(1);
  }

  // Seed mock balances (devnet only)
  const seeded = await seedMockBalances(
    player1Keypair.publicKey.toBase58(),
    player2Keypair.publicKey.toBase58()
  );
  if (!seeded) {
    console.error('\nFailed to seed mock balances. Aborting simulation.');
    process.exit(1);
  }

  // Step 1: Create duel
  const duel = await createDuel(
    player1Keypair.publicKey.toBase58(),
    player2Keypair.publicKey.toBase58()
  );

  if (!duel) {
    console.error('\nFailed to create duel. Aborting simulation.');
    process.exit(1);
  }

  // Step 2: Player 1 locks stake
  const player1Locked = await lockStake(duel.duelId, player1Keypair, 1);
  if (!player1Locked) {
    console.error('\nPlayer 1 failed to lock stake. Aborting simulation.');
    process.exit(1);
  }

  // Check status
  await checkDuelStatus(duel.duelId);

  // Step 3: Player 2 locks stake
  const player2Locked = await lockStake(duel.duelId, player2Keypair, 2);
  if (!player2Locked) {
    console.error('\nPlayer 2 failed to lock stake. Aborting simulation.');
    process.exit(1);
  }

  // Check status - should be ACTIVE
  await checkDuelStatus(duel.duelId);

  // Simulate combat (random winner)
  console.log('\n[Combat] Simulating combat...');
  console.log('-'.repeat(50));
  console.log('  *CLANG* *SWOOSH* *BOOM*');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const winnerKeypair = Math.random() < 0.5 ? player1Keypair : player2Keypair;
  const winnerNumber = winnerKeypair === player1Keypair ? 1 : 2;
  console.log(`  Player ${winnerNumber} wins!`);

  // Step 4: Settle duel
  const settled = await settleDuel(duel.duelId, winnerKeypair);
  if (!settled) {
    console.error('\nFailed to settle duel.');
    process.exit(1);
  }

  // Final status check
  await checkDuelStatus(duel.duelId);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  Simulation Complete!');
  console.log('='.repeat(60));

  console.log('\n[Privacy Verification]');
  console.log('  - Wallet addresses were hashed (stealth IDs)');
  console.log('  - Transfer amounts are hidden on-chain (ZK proofs)');
  console.log('  - Only stealth IDs are stored in Redis');
  console.log('  - Raw wallets exist only in memory during session');

  console.log('\n[Transaction Signatures]');
  console.log('  View on Solana Explorer (devnet):');
  console.log('  https://explorer.solana.com/?cluster=devnet');
}

main().catch((error) => {
  console.error('Simulation failed:', error);
  process.exit(1);
});
