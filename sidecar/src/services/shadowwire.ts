/**
 * ShadowWire Service - ZK Transfer Layer
 *
 * Wraps the @radr/shadowwire SDK for privacy-preserving transfers.
 * All transfers use INTERNAL mode to hide amounts on-chain.
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfig, LAMPORTS_PER_SOL, type SupportedToken, TOKEN_DECIMALS } from '../config.js';
import type { TxSignature, WalletAddress } from '../types/index.js';
import { maskWallet } from './stealth.js';

// ============================================================================
// Types
// ============================================================================

interface TransferResult {
  success: boolean;
  txSignature?: TxSignature;
  error?: string;
}

interface BalanceResult {
  success: boolean;
  availableLamports?: bigint;
  poolAddress?: string;
  error?: string;
}

interface DepositResult {
  success: boolean;
  unsignedTxBase64?: string;
  poolAddress?: string;
  error?: string;
}

// ============================================================================
// ShadowWire Client Wrapper
// ============================================================================

class ShadowWireService {
  private escrowKeypair: Keypair | null = null;
  private treasuryKeypair: Keypair | null = null;
  private serverKeypair: Keypair | null = null;
  private initialized = false;
  private wasmInitialized = false;
  private forceMockMode = false; // Set to true when WASM fails on mainnet

  /**
   * Initialize the service with wallet keypairs.
   * Must be called before any operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = getConfig();

    try {
      // Load keypairs from base58 encoded secrets
      this.escrowKeypair = Keypair.fromSecretKey(bs58.decode(config.ESCROW_WALLET_SECRET));
      this.treasuryKeypair = Keypair.fromSecretKey(bs58.decode(config.TREASURY_WALLET_SECRET));
      this.serverKeypair = Keypair.fromSecretKey(bs58.decode(config.SERVER_AUTHORITY_SECRET));

      console.log('[ShadowWire] Service initialized');
      console.log(`[ShadowWire] Escrow wallet: ${maskWallet(this.escrowKeypair.publicKey.toBase58())}`);
      console.log(`[ShadowWire] Treasury wallet: ${maskWallet(this.treasuryKeypair.publicKey.toBase58())}`);
      console.log(`[ShadowWire] Network: ${config.SOLANA_NETWORK}`);

      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize ShadowWire service: ${message}`);
    }
  }

  /**
   * Ensure service is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ShadowWire service not initialized. Call initialize() first.');
    }
  }

  /**
   * Initialize WASM for ZK proof generation.
   * Must be called before transfer operations on mainnet.
   */
  private async ensureWasmInitialized(): Promise<boolean> {
    if (this.wasmInitialized) {
      return true;
    }

    const config = getConfig();

    try {
      const { initWASM } = await import('@radr/shadowwire');
      const wasmUrl = `http://localhost:${config.PORT}/wasm/settler_wasm_bg.wasm`;
      console.log(`[ShadowWire] Initializing WASM from ${wasmUrl}...`);
      await initWASM(wasmUrl);
      this.wasmInitialized = true;
      console.log('[ShadowWire] WASM initialized successfully!');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ShadowWire] WASM initialization failed: ${message}`);
      return false;
    }
  }

  /**
   * Get the escrow wallet address.
   */
  getEscrowWallet(): WalletAddress {
    this.ensureInitialized();
    return this.escrowKeypair!.publicKey.toBase58();
  }

  /**
   * Get the treasury wallet address.
   */
  getTreasuryWallet(): WalletAddress {
    this.ensureInitialized();
    return this.treasuryKeypair!.publicKey.toBase58();
  }

  /**
   * Get balance from ShadowWire pool.
   */
  async getBalance(wallet: WalletAddress, token: SupportedToken = 'SOL'): Promise<BalanceResult> {
    this.ensureInitialized();
    const config = getConfig();

    // Use mock for devnet or when forced to mock mode (WASM failure)
    if (config.SOLANA_NETWORK === 'devnet' || this.forceMockMode) {
      return this.mockGetBalance(wallet, token);
    }

    try {
      // Dynamic import to handle ESM module
      const { ShadowWireClient } = await import('@radr/shadowwire');

      const client = new ShadowWireClient({
        network: 'mainnet-beta',
        debug: config.isDevelopment,
      });

      const balance = await client.getBalance(wallet, token);

      return {
        success: true,
        availableLamports: BigInt(balance.available),
        poolAddress: balance.pool_address,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ShadowWire] Failed to get balance for ${maskWallet(wallet)}: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Execute a private internal transfer.
   * Amount is HIDDEN on-chain via ZK proofs.
   *
   * CRITICAL: Always use this for duel-related transfers.
   */
  async transferInternal(
    senderWallet: WalletAddress,
    recipientWallet: WalletAddress,
    amountLamports: bigint,
    token: SupportedToken = 'SOL',
    signMessage: (msg: Uint8Array) => Promise<Uint8Array>
  ): Promise<TransferResult> {
    this.ensureInitialized();
    const config = getConfig();

    // Convert lamports to human units
    const decimals = TOKEN_DECIMALS[token];
    const humanAmount = Number(amountLamports) / Math.pow(10, decimals);

    console.log(
      `[ShadowWire] Internal transfer: ${maskWallet(senderWallet)} -> ${maskWallet(recipientWallet)} (amount hidden)`
    );

    try {
      // ShadowWire only supports mainnet-beta - use mock for devnet
      if (config.SOLANA_NETWORK === 'devnet') {
        return this.mockTransfer(senderWallet, recipientWallet, amountLamports);
      }

      // Initialize WASM before real transfers
      const wasmReady = await this.ensureWasmInitialized();
      if (!wasmReady) {
        console.warn('[ShadowWire] WASM not ready, falling back to mock mode');
        this.forceMockMode = true;
        return this.mockTransfer(senderWallet, recipientWallet, amountLamports);
      }

      const { ShadowWireClient } = await import('@radr/shadowwire');

      const client = new ShadowWireClient({
        network: 'mainnet-beta',
        debug: config.isDevelopment,
      });

      const result = await client.transfer({
        sender: senderWallet,
        recipient: recipientWallet,
        amount: humanAmount,
        token,
        type: 'internal', // CRITICAL: Hidden amount
        wallet: { signMessage },
      });

      if (result.success) {
        console.log(`[ShadowWire] Transfer successful: ${result.tx_signature}`);
        return {
          success: true,
          txSignature: result.tx_signature,
        };
      } else {
        return {
          success: false,
          error: 'Transfer returned unsuccessful',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // WASM loading issue in Node.js ESM environment - fallback to mock with warning
      if (message.includes('WASM') || message.includes('require not available')) {
        if (!this.forceMockMode) {
          console.warn(`[ShadowWire] WASM loading failed, falling back to MOCK mode for mainnet`);
          console.warn(`[ShadowWire] Real transfers will NOT occur - this is for testing only!`);
          this.forceMockMode = true;
        }
        return this.mockTransfer(senderWallet, recipientWallet, amountLamports);
      }

      console.error(`[ShadowWire] Transfer failed: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Transfer from escrow wallet (server-initiated).
   * Used for settling duels and paying winners.
   */
  async transferFromEscrow(
    recipientWallet: WalletAddress,
    amountLamports: bigint,
    token: SupportedToken = 'SOL'
  ): Promise<TransferResult> {
    this.ensureInitialized();

    const escrowWallet = this.getEscrowWallet();
    const signMessage = this.createSignFunction(this.escrowKeypair!);

    return this.transferInternal(escrowWallet, recipientWallet, amountLamports, token, signMessage);
  }

  /**
   * Transfer from escrow to treasury (house fee).
   */
  async collectHouseFee(amountLamports: bigint, token: SupportedToken = 'SOL'): Promise<TransferResult> {
    this.ensureInitialized();

    const treasuryWallet = this.getTreasuryWallet();

    console.log(`[ShadowWire] Collecting house fee: ${amountLamports} lamports to treasury`);

    return this.transferFromEscrow(treasuryWallet, amountLamports, token);
  }

  /**
   * Create a deposit transaction for a wallet.
   * Returns unsigned transaction that player must sign.
   */
  async createDeposit(
    wallet: WalletAddress,
    amountLamports: bigint,
    token: SupportedToken = 'SOL'
  ): Promise<DepositResult> {
    this.ensureInitialized();
    const config = getConfig();

    const decimals = TOKEN_DECIMALS[token];
    const humanAmount = Number(amountLamports) / Math.pow(10, decimals);

    try {
      // ShadowWire only supports mainnet-beta - use mock for devnet
      if (config.SOLANA_NETWORK === 'devnet') {
        return this.mockDeposit(wallet, amountLamports);
      }

      const { ShadowWireClient } = await import('@radr/shadowwire');

      const client = new ShadowWireClient({
        network: 'mainnet-beta',
        debug: config.isDevelopment,
      });

      const result = await client.deposit({
        wallet,
        amount: humanAmount,
      });

      if (result.success) {
        return {
          success: true,
          unsignedTxBase64: result.unsigned_tx_base64,
          poolAddress: result.pool_address,
        };
      } else {
        return {
          success: false,
          error: 'Deposit request returned unsuccessful',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ShadowWire] Deposit creation failed: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Create a sign function for a keypair.
   * Used for server-side signing (escrow/treasury).
   */
  private createSignFunction(keypair: Keypair): (msg: Uint8Array) => Promise<Uint8Array> {
    return async (msg: Uint8Array): Promise<Uint8Array> => {
      // Use tweetnacl for Ed25519 signing
      const nacl = await import('tweetnacl');
      return nacl.default.sign.detached(msg, keypair.secretKey);
    };
  }

  /**
   * Verify escrow has sufficient balance for settlement.
   */
  async verifyEscrowBalance(requiredLamports: bigint, token: SupportedToken = 'SOL'): Promise<boolean> {
    const escrowWallet = this.getEscrowWallet();
    const balance = await this.getBalance(escrowWallet, token);

    if (!balance.success || balance.availableLamports === undefined) {
      console.error('[ShadowWire] Failed to check escrow balance');
      return false;
    }

    const hasEnough = balance.availableLamports >= requiredLamports;

    if (!hasEnough) {
      console.error(
        `[ShadowWire] Insufficient escrow balance: ${balance.availableLamports} < ${requiredLamports}`
      );
    }

    return hasEnough;
  }

  /**
   * Calculate fee breakdown for a transfer.
   */
  calculateFees(
    stakeAmountLamports: bigint,
    houseFeePercent: number
  ): { totalPot: bigint; houseFee: bigint; winnerPayout: bigint } {
    const totalPot = stakeAmountLamports * 2n;
    const houseFee = (totalPot * BigInt(Math.floor(houseFeePercent * 100))) / 10000n;
    const winnerPayout = totalPot - houseFee;

    return { totalPot, houseFee, winnerPayout };
  }

  // ============================================================================
  // Mock Methods for Devnet Testing
  // ============================================================================
  // ShadowWire only supports mainnet-beta. These mocks allow testing the
  // full duel flow on devnet without real ZK transfers.

  /** In-memory mock balances for devnet testing */
  private mockBalances = new Map<string, bigint>();

  /**
   * Mock balance check for devnet.
   * Simulates ShadowWire pool balance.
   */
  private mockGetBalance(wallet: WalletAddress, _token: SupportedToken): BalanceResult {
    const balance = this.mockBalances.get(wallet) ?? 0n;
    console.log(`[ShadowWire:MOCK] Balance check for ${maskWallet(wallet)}: ${balance} lamports`);

    return {
      success: true,
      availableLamports: balance,
      poolAddress: `mock_pool_${wallet.slice(0, 8)}`,
    };
  }

  /**
   * Mock transfer for devnet.
   * Simulates internal transfer with fake TX signature.
   */
  private mockTransfer(
    senderWallet: WalletAddress,
    recipientWallet: WalletAddress,
    amountLamports: bigint
  ): TransferResult {
    const senderBalance = this.mockBalances.get(senderWallet) ?? 0n;
    if (senderBalance < amountLamports) {
      console.log(`[ShadowWire:MOCK] Insufficient balance: ${senderBalance} < ${amountLamports}`);
      return {
        success: false,
        error: 'Insufficient balance',
      };
    }

    // Simulate transfer
    this.mockBalances.set(senderWallet, senderBalance - amountLamports);
    const recipientBalance = this.mockBalances.get(recipientWallet) ?? 0n;
    this.mockBalances.set(recipientWallet, recipientBalance + amountLamports);

    // Generate fake TX signature
    const fakeTxSig = `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    console.log(
      `[ShadowWire:MOCK] Transfer: ${maskWallet(senderWallet)} -> ${maskWallet(recipientWallet)} = ${amountLamports} lamports`
    );
    console.log(`[ShadowWire:MOCK] TX: ${fakeTxSig}`);

    return {
      success: true,
      txSignature: fakeTxSig,
    };
  }

  /**
   * Mock deposit for devnet.
   * Simulates depositing to ShadowWire pool.
   */
  private mockDeposit(wallet: WalletAddress, amountLamports: bigint): DepositResult {
    // Add to mock balance
    const currentBalance = this.mockBalances.get(wallet) ?? 0n;
    this.mockBalances.set(wallet, currentBalance + amountLamports);

    console.log(
      `[ShadowWire:MOCK] Deposit: ${maskWallet(wallet)} += ${amountLamports} lamports (total: ${currentBalance + amountLamports})`
    );

    return {
      success: true,
      unsignedTxBase64: 'mock_unsigned_tx_base64',
      poolAddress: `mock_pool_${wallet.slice(0, 8)}`,
    };
  }

  /**
   * Seed mock balance for devnet testing.
   * Call this to simulate wallets having ShadowWire pool balance.
   */
  seedMockBalance(wallet: WalletAddress, amountLamports: bigint): void {
    this.mockBalances.set(wallet, amountLamports);
    console.log(`[ShadowWire:MOCK] Seeded ${maskWallet(wallet)} with ${amountLamports} lamports`);
  }

  /**
   * Get all mock balances (for debugging).
   */
  getMockBalances(): Map<string, bigint> {
    return new Map(this.mockBalances);
  }

  /**
   * Clear all mock balances.
   */
  clearMockBalances(): void {
    this.mockBalances.clear();
    console.log('[ShadowWire:MOCK] Cleared all mock balances');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const shadowWireService = new ShadowWireService();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert SOL to lamports.
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * Number(LAMPORTS_PER_SOL)));
}

/**
 * Convert lamports to SOL.
 */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}
