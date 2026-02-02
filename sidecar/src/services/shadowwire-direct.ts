/**
 * ShadowWire Direct API Client
 *
 * Bypasses the @radr/shadowwire SDK's broken CommonJS/ESM interop.
 * Uses a data URL import trick to load the ESM WASM bindings properly.
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getConfig } from '../config.js';
import { randomUUID } from 'crypto';

// ShadowWire API
const API_BASE_URL = 'https://shadow.radr.fun/shadowpay/api';

// Token decimals for conversion
const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USD1: 6,
  RADR: 9,
};

// Minimum amounts per token (in smallest units) - from ShadowWire SDK
const TOKEN_MINIMUMS: Record<string, number> = {
  SOL: 100_000_000,           // 0.1 SOL
  USD1: 5_000_000,            // 5 USD1
  RADR: 10_000_000_000_000,   // 10,000 RADR
};

// Types
export interface TransferResult {
  success: boolean;
  txSignature?: string;
  error?: string;
}

export interface BalanceResult {
  success: boolean;
  balance?: number;
  error?: string;
}

interface ZKProofResult {
  proof_bytes: Uint8Array;
  commitment_bytes: Uint8Array;
  blinding_factor_bytes: Uint8Array;
}

// Loader module interface
interface WasmLoaderModule {
  getWasmModule: () => Promise<unknown>;
  generateRangeProof: (amount: number, bitLength?: number) => Promise<ZKProofResult>;
}

/**
 * Direct ShadowWire client that loads WASM via ESM loader module
 */
class ShadowWireDirectClient {
  private wasmLoader: WasmLoaderModule | null = null;
  private wasmInitialized = false;
  private escrowKeypair: Keypair | null = null;
  private treasuryKeypair: Keypair | null = null;
  private escrowWallet: string = '';
  private treasuryWallet: string = '';
  private initialized = false;

  /**
   * Initialize keypairs from config
   */
  initialize(): void {
    if (this.initialized) return;

    const config = getConfig();

    try {
      const escrowSecret = bs58.decode(config.ESCROW_WALLET_SECRET);
      this.escrowKeypair = Keypair.fromSecretKey(escrowSecret);
      this.escrowWallet = this.escrowKeypair.publicKey.toBase58();
      console.log(`[ShadowWire Direct] Escrow wallet: ${this.escrowWallet}`);
    } catch (error) {
      console.error('[ShadowWire Direct] Failed to load escrow keypair:', error);
      throw new Error('Invalid ESCROW_WALLET_SECRET');
    }

    try {
      const treasurySecret = bs58.decode(config.TREASURY_WALLET_SECRET);
      this.treasuryKeypair = Keypair.fromSecretKey(treasurySecret);
      this.treasuryWallet = this.treasuryKeypair.publicKey.toBase58();
      console.log(`[ShadowWire Direct] Treasury wallet: ${this.treasuryWallet}`);
    } catch (error) {
      console.error('[ShadowWire Direct] Failed to load treasury keypair:', error);
      throw new Error('Invalid TREASURY_WALLET_SECRET');
    }

    this.initialized = true;
    console.log('[ShadowWire Direct] Initialized');
  }

  /**
   * Load WASM module via ESM loader (uses data URL trick for proper ESM loading)
   */
  private async loadWasm(): Promise<void> {
    if (this.wasmInitialized && this.wasmLoader) return;

    try {
      console.log('[ShadowWire Direct] Loading WASM via ESM loader...');

      // Dynamic import of our ESM loader module (.mjs extension ensures ESM treatment)
      const loader = await import('../wasm/settler-wasm-loader.mjs') as WasmLoaderModule;

      // Initialize the WASM module (this handles finding and loading the WASM files)
      await loader.getWasmModule();

      this.wasmLoader = loader;
      this.wasmInitialized = true;

      console.log('[ShadowWire Direct] WASM initialized successfully via ESM loader');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ShadowWire Direct] WASM load failed:', msg);
      throw new Error(`WASM initialization failed: ${msg}`);
    }
  }

  /**
   * Generate ZK range proof using the WASM module
   */
  private async generateProof(amountLamports: number): Promise<{
    proofBytes: string;
    commitmentBytes: string;
    blindingFactorBytes: string;
  }> {
    await this.loadWasm();
    if (!this.wasmLoader) throw new Error('WASM not loaded');

    const result = await this.wasmLoader.generateRangeProof(amountLamports, 64);

    return {
      proofBytes: this.uint8ArrayToHex(result.proof_bytes),
      commitmentBytes: this.uint8ArrayToHex(result.commitment_bytes),
      blindingFactorBytes: this.uint8ArrayToHex(result.blinding_factor_bytes),
    };
  }

  private uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate transfer signature (what wallet.signMessage does)
   */
  private signTransferMessage(keypair: Keypair, transferType: string): { signature: string; message: string } {
    const nonce = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `shadowpay:${transferType}:${nonce}:${timestamp}`;

    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signature = bs58.encode(signatureBytes);

    return { signature, message };
  }

  /**
   * Make HTTP request to ShadowWire API
   */
  private async apiRequest<T>(endpoint: string, method: string, body?: object): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`[ShadowWire Direct] ${method} ${endpoint}`);

    const response = await fetch(url, options);

    // Get response as text first to handle non-JSON responses
    const responseText = await response.text();
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      // API returned non-JSON response
      console.error(`[ShadowWire Direct] API returned non-JSON: ${responseText.slice(0, 200)}`);
      throw new Error(responseText.slice(0, 200) || `HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error((data.error as string) || (data.message as string) || `HTTP ${response.status}`);
    }

    return data as T;
  }

  // Public methods

  getEscrowWallet(): string {
    return this.escrowWallet;
  }

  getTreasuryWallet(): string {
    return this.treasuryWallet;
  }

  /**
   * Get balance from ShadowWire pool
   */
  async getBalance(wallet: string, token: string = 'SOL'): Promise<BalanceResult> {
    try {
      const result = await this.apiRequest<{ available?: number; balance?: number }>(
        `/pool/balance/${wallet}`,
        'GET'
      );
      const balance = result.available ?? result.balance ?? 0;
      return { success: true, balance };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    }
  }

  /**
   * Check if wallet has enough balance
   */
  async hasEnoughBalance(wallet: string, amountLamports: number, token: string = 'SOL'): Promise<boolean> {
    const result = await this.getBalance(wallet, token);
    if (!result.success || result.balance === undefined) return false;
    return result.balance >= amountLamports;
  }

  /**
   * Transfer from escrow to recipient using ZK proof
   */
  async transferFromEscrow(
    recipientWallet: string,
    amountLamports: number,
    token: string = 'SOL'
  ): Promise<TransferResult> {
    if (!this.initialized || !this.escrowKeypair) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      console.log(`[ShadowWire Direct] Transfer ${amountLamports} lamports to ${recipientWallet.slice(0, 8)}...`);

      // Generate ZK proof
      const proof = await this.generateProof(amountLamports);
      console.log('[ShadowWire Direct] Proof generated');

      // Generate signature
      const { signature } = this.signTransferMessage(this.escrowKeypair, 'internal_transfer');
      console.log('[ShadowWire Direct] Signature generated');

      // Generate nonce (API expects u32, not UUID)
      const nonce = Math.floor(Math.random() * 0xFFFFFFFF); // Random u32

      // Call internal transfer API
      const result = await this.apiRequest<{
        success: boolean;
        tx_signature?: string;
        error?: string;
        message?: string;
      }>(
        '/zk/internal-transfer',
        'POST',
        {
          sender_wallet: this.escrowWallet,
          recipient_wallet: recipientWallet,
          token: token,
          nonce: nonce,
          amount: amountLamports,
          proof_bytes: proof.proofBytes,
          commitment: proof.commitmentBytes,
          sender_signature: signature,
        }
      );

      // Log success/fail without full response body
      const txSig = result.tx_signature ? result.tx_signature.slice(0, 20) + '...' : 'N/A';
      console.log(`[ShadowWire Direct] API response: ${result.success ? 'success' : 'failed'}, tx: ${txSig}`);

      if (result.success) {
        console.log(`[ShadowWire Direct] Transfer success: ${result.tx_signature}`);
        return { success: true, txSignature: result.tx_signature };
      } else {
        const errorMsg = result.error || result.message || 'Transfer returned unsuccessful';
        console.log(`[ShadowWire Direct] Transfer failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ShadowWire Direct] Transfer failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Transfer from escrow to treasury (house fee)
   */
  async transferToTreasury(amountLamports: number, token: string = 'SOL'): Promise<TransferResult> {
    return this.transferFromEscrow(this.treasuryWallet, amountLamports, token);
  }

  /**
   * Get fee info per token
   */
  getFeeInfo(token: string = 'SOL'): { feePercent: number; minimumAmount: number } {
    const minimumAmount = TOKEN_MINIMUMS[token] || 100_000_000;
    // Fee percentages from ShadowWire SDK: SOL 0.5%, USD1 1%, RADR 0.3%
    const feePercents: Record<string, number> = { SOL: 0.5, USD1: 1, RADR: 0.3 };
    const feePercent = feePercents[token] || 0.5;
    return { feePercent, minimumAmount };
  }
}

// Singleton export
export const shadowWireDirect = new ShadowWireDirectClient();
