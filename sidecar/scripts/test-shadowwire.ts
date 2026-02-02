/**
 * ShadowWire SDK Test Script
 *
 * Tests ShadowWire SDK connectivity and basic operations.
 * Run with: npm run test:shadowwire
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// ============================================================================
// Test Configuration
// ============================================================================

const NETWORK = (process.env.SOLANA_NETWORK as 'devnet' | 'mainnet-beta') ?? 'devnet';
const DEBUG = true;

// ============================================================================
// Tests
// ============================================================================

async function testShadowWireConnection(): Promise<boolean> {
  console.log('\n[Test 1] ShadowWire Client Initialization');
  console.log('-'.repeat(50));

  try {
    const { ShadowWireClient } = await import('@radr/shadowwire');

    const client = new ShadowWireClient({
      network: NETWORK,
      debug: DEBUG,
    });

    console.log('[PASS] ShadowWireClient created successfully');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FAIL] Failed to create client: ${message}`);
    return false;
  }
}

async function testGetBalance(): Promise<boolean> {
  console.log('\n[Test 2] Get Pool Balance');
  console.log('-'.repeat(50));

  if (!process.env.ESCROW_WALLET_SECRET) {
    console.log('[SKIP] ESCROW_WALLET_SECRET not set');
    return true;
  }

  try {
    const { ShadowWireClient } = await import('@radr/shadowwire');

    const keypair = Keypair.fromSecretKey(bs58.decode(process.env.ESCROW_WALLET_SECRET));
    const wallet = keypair.publicKey.toBase58();

    console.log(`Checking balance for: ${wallet.slice(0, 8)}...${wallet.slice(-4)}`);

    const client = new ShadowWireClient({
      network: NETWORK,
      debug: DEBUG,
    });

    const balance = await client.getBalance(wallet, 'SOL');

    console.log(`Pool balance:`);
    console.log(`  Available: ${balance.available} lamports`);
    console.log(`  Deposited: ${balance.deposited} lamports`);
    console.log(`  Pool address: ${balance.pool_address}`);

    console.log('[PASS] Balance check successful');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // "Not found" is expected if wallet hasn't deposited to ShadowWire yet
    if (message.includes('not found') || message.includes('404')) {
      console.log('[INFO] Wallet has no ShadowWire pool balance (expected for new wallets)');
      console.log('[PASS] Balance check completed (wallet needs initial deposit)');
      return true;
    }

    console.error(`[FAIL] Balance check failed: ${message}`);
    return false;
  }
}

async function testFeeCalculation(): Promise<boolean> {
  console.log('\n[Test 3] Fee Calculation');
  console.log('-'.repeat(50));

  try {
    const { ShadowWireClient } = await import('@radr/shadowwire');

    const client = new ShadowWireClient({
      network: NETWORK,
    });

    // Test fee percentage
    const feePercent = client.getFeePercentage('SOL');
    console.log(`SOL fee percentage: ${feePercent}%`);

    // Test minimum amount
    const minAmount = client.getMinimumAmount('SOL');
    console.log(`SOL minimum amount: ${minAmount} SOL`);

    // Test fee calculation
    const breakdown = client.calculateFee(1.0, 'SOL');
    console.log(`Fee breakdown for 1 SOL:`);
    console.log(`  Fee: ${breakdown.fee} SOL`);
    console.log(`  Net amount: ${breakdown.netAmount} SOL`);

    console.log('[PASS] Fee calculation successful');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FAIL] Fee calculation failed: ${message}`);
    return false;
  }
}

async function testTokenUtils(): Promise<boolean> {
  console.log('\n[Test 4] Token Utilities');
  console.log('-'.repeat(50));

  try {
    const { TokenUtils } = await import('@radr/shadowwire');

    // Test unit conversion
    const lamports = TokenUtils.toSmallestUnit(1.5, 'SOL');
    console.log(`1.5 SOL = ${lamports} lamports`);

    const sol = TokenUtils.fromSmallestUnit(1500000000, 'SOL');
    console.log(`1500000000 lamports = ${sol} SOL`);

    // Verify round-trip
    const roundTrip = TokenUtils.fromSmallestUnit(TokenUtils.toSmallestUnit(2.5, 'SOL'), 'SOL');

    if (roundTrip === 2.5) {
      console.log('[PASS] Token utilities working correctly');
      return true;
    } else {
      console.error(`[FAIL] Round-trip conversion failed: expected 2.5, got ${roundTrip}`);
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FAIL] Token utilities failed: ${message}`);
    return false;
  }
}

async function testErrorClasses(): Promise<boolean> {
  console.log('\n[Test 5] Error Classes');
  console.log('-'.repeat(50));

  try {
    const {
      ShadowWireError,
      InsufficientBalanceError,
      InvalidAddressError,
      InvalidAmountError,
      RecipientNotFoundError,
    } = await import('@radr/shadowwire');

    // Verify error classes exist
    const errorClasses = [
      { name: 'ShadowWireError', cls: ShadowWireError },
      { name: 'InsufficientBalanceError', cls: InsufficientBalanceError },
      { name: 'InvalidAddressError', cls: InvalidAddressError },
      { name: 'InvalidAmountError', cls: InvalidAmountError },
      { name: 'RecipientNotFoundError', cls: RecipientNotFoundError },
    ];

    for (const { name, cls } of errorClasses) {
      if (typeof cls === 'function') {
        console.log(`  ${name}: Available`);
      } else {
        console.error(`  ${name}: NOT FOUND`);
        return false;
      }
    }

    console.log('[PASS] All error classes available');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FAIL] Error class check failed: ${message}`);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  ShadowWire SDK Test Suite');
  console.log(`  Network: ${NETWORK}`);
  console.log('='.repeat(60));

  const results: { name: string; passed: boolean }[] = [];

  // Run tests
  results.push({
    name: 'Client Initialization',
    passed: await testShadowWireConnection(),
  });

  results.push({
    name: 'Get Balance',
    passed: await testGetBalance(),
  });

  results.push({
    name: 'Fee Calculation',
    passed: await testFeeCalculation(),
  });

  results.push({
    name: 'Token Utilities',
    passed: await testTokenUtils(),
  });

  results.push({
    name: 'Error Classes',
    passed: await testErrorClasses(),
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  Test Results');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const result of results) {
    const status = result.passed ? '[PASS]' : '[FAIL]';
    console.log(`  ${status} ${result.name}`);
  }

  console.log(`\n  Total: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n  ShadowWire SDK is ready for use!');
  } else {
    console.log('\n  Some tests failed. Check the errors above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
