/**
 * Devnet Setup Script
 *
 * Sets up test wallets and initial balances for devnet testing.
 * Run with: npm run setup:devnet
 */

import 'dotenv/config';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const DEVNET_RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Alerith ShadowWire Sidecar - Devnet Setup');
  console.log('='.repeat(60));

  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // ============================================================================
  // Generate Test Wallets (if not provided)
  // ============================================================================

  console.log('\n[Setup] Generating test wallets...\n');

  // Escrow wallet
  let escrowKeypair: Keypair;
  if (process.env.ESCROW_WALLET_SECRET) {
    escrowKeypair = Keypair.fromSecretKey(bs58.decode(process.env.ESCROW_WALLET_SECRET));
    console.log('[Escrow] Using existing wallet');
  } else {
    escrowKeypair = Keypair.generate();
    console.log('[Escrow] Generated NEW wallet');
    console.log(`  Add to .env: ESCROW_WALLET_SECRET=${bs58.encode(escrowKeypair.secretKey)}`);
  }
  console.log(`  Public key: ${escrowKeypair.publicKey.toBase58()}`);

  // Treasury wallet
  let treasuryKeypair: Keypair;
  if (process.env.TREASURY_WALLET_SECRET) {
    treasuryKeypair = Keypair.fromSecretKey(bs58.decode(process.env.TREASURY_WALLET_SECRET));
    console.log('\n[Treasury] Using existing wallet');
  } else {
    treasuryKeypair = Keypair.generate();
    console.log('\n[Treasury] Generated NEW wallet');
    console.log(`  Add to .env: TREASURY_WALLET_SECRET=${bs58.encode(treasuryKeypair.secretKey)}`);
  }
  console.log(`  Public key: ${treasuryKeypair.publicKey.toBase58()}`);

  // Server authority wallet
  let serverKeypair: Keypair;
  if (process.env.SERVER_AUTHORITY_SECRET) {
    serverKeypair = Keypair.fromSecretKey(bs58.decode(process.env.SERVER_AUTHORITY_SECRET));
    console.log('\n[Server] Using existing wallet');
  } else {
    serverKeypair = Keypair.generate();
    console.log('\n[Server] Generated NEW wallet');
    console.log(`  Add to .env: SERVER_AUTHORITY_SECRET=${bs58.encode(serverKeypair.secretKey)}`);
  }
  console.log(`  Public key: ${serverKeypair.publicKey.toBase58()}`);

  // Test player wallets
  const player1Keypair = Keypair.generate();
  const player2Keypair = Keypair.generate();

  console.log('\n[Test Players] Generated test player wallets');
  console.log(`  Player 1: ${player1Keypair.publicKey.toBase58()}`);
  console.log(`  Player 2: ${player2Keypair.publicKey.toBase58()}`);

  // ============================================================================
  // Request Airdrops
  // ============================================================================

  console.log('\n[Airdrop] Requesting devnet SOL...\n');

  const walletsToFund = [
    { name: 'Escrow', keypair: escrowKeypair, amount: 2 },
    { name: 'Treasury', keypair: treasuryKeypair, amount: 0.5 },
    { name: 'Server', keypair: serverKeypair, amount: 0.5 },
    { name: 'Player 1', keypair: player1Keypair, amount: 5 },
    { name: 'Player 2', keypair: player2Keypair, amount: 5 },
  ];

  for (const { name, keypair, amount } of walletsToFund) {
    try {
      const balance = await connection.getBalance(keypair.publicKey);
      const balanceSol = balance / LAMPORTS_PER_SOL;

      if (balanceSol >= amount) {
        console.log(`[${name}] Already has ${balanceSol.toFixed(4)} SOL - skipping airdrop`);
        continue;
      }

      console.log(`[${name}] Requesting ${amount} SOL airdrop...`);

      const signature = await connection.requestAirdrop(
        keypair.publicKey,
        amount * LAMPORTS_PER_SOL
      );

      await connection.confirmTransaction(signature, 'confirmed');

      const newBalance = await connection.getBalance(keypair.publicKey);
      console.log(`[${name}] New balance: ${(newBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${name}] Airdrop failed: ${message}`);

      if (message.includes('rate limit') || message.includes('429')) {
        console.log('  (Devnet airdrop rate limited - try again later)');
      }
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // ============================================================================
  // Generate Security Secrets
  // ============================================================================

  console.log('\n[Security] Generating security secrets...\n');

  if (!process.env.WALLET_PEPPER) {
    const pepper = [...Array(32)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
    console.log(`Add to .env: WALLET_PEPPER=${pepper}`);
  }

  if (!process.env.INTERNAL_API_KEY) {
    const apiKey = [...Array(32)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
    console.log(`Add to .env: INTERNAL_API_KEY=${apiKey}`);
  }

  // ============================================================================
  // Output Summary
  // ============================================================================

  console.log('\n' + '='.repeat(60));
  console.log('  Setup Complete!');
  console.log('='.repeat(60));

  console.log('\n[Next Steps]');
  console.log('1. Add the generated secrets to your .env file');
  console.log('2. Start the sidecar: npm run dev');
  console.log('3. Run ShadowWire tests: npm run test:shadowwire');
  console.log('4. Simulate a duel: npm run simulate:duel');

  // Output test wallet secrets for scripts
  console.log('\n[Test Wallet Secrets] (save for simulate-duel.ts)');
  console.log(`PLAYER_1_SECRET=${bs58.encode(player1Keypair.secretKey)}`);
  console.log(`PLAYER_2_SECRET=${bs58.encode(player2Keypair.secretKey)}`);
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
