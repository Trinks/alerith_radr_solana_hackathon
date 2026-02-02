/**
 * RPC Proxy Routes
 *
 * Proxies Solana RPC requests through the sidecar to avoid browser CORS issues.
 * The public Solana RPC blocks direct browser requests with 403 errors.
 */

import { Router } from 'express';
import { getConfig } from '../config.js';

export const rpcProxyRouter = Router();

// Solana RPC endpoints
const RPC_ENDPOINTS: Record<string, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'devnet': 'https://api.devnet.solana.com',
  'testnet': 'https://api.testnet.solana.com',
};

interface RpcResult {
  error?: { message?: string; code?: number };
  result?: { value?: { blockhash?: string; lastValidBlockHeight?: number } } | string;
}

/**
 * GET /rpc/latest-blockhash
 * Get the latest blockhash for transactions
 */
rpcProxyRouter.get('/latest-blockhash', async (req, res) => {
  try {
    const config = getConfig();
    const rpcUrl = RPC_ENDPOINTS[config.SOLANA_NETWORK] || 'https://api.mainnet-beta.solana.com';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'confirmed' }],
      }),
    });

    const result = await response.json() as RpcResult;

    if (result.error) {
      res.json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    const value = (result.result as { value: { blockhash: string; lastValidBlockHeight: number } }).value;
    res.json({
      success: true,
      blockhash: value.blockhash,
      lastValidBlockHeight: value.lastValidBlockHeight,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get blockhash',
    });
  }
});

/**
 * POST /rpc/solana
 * Proxy Solana JSON-RPC requests
 */
rpcProxyRouter.post('/solana', async (req, res) => {
  try {
    const config = getConfig();
    const rpcUrl = RPC_ENDPOINTS[config.SOLANA_NETWORK] || 'https://api.mainnet-beta.solana.com';

    console.log(`[RPC Proxy] Forwarding request to ${config.SOLANA_NETWORK}`);

    // Forward the JSON-RPC request
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const result = await response.json() as RpcResult;

    // Log method for debugging (not the full payload)
    const method = req.body?.method || 'unknown';
    if (result.error) {
      console.log(`[RPC Proxy] ${method} failed:`, result.error.message || result.error);
    } else {
      console.log(`[RPC Proxy] ${method} success`);
    }

    res.json(result);
  } catch (error) {
    console.error('[RPC Proxy] Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : 'RPC proxy error',
      },
      id: req.body?.id || null,
    });
  }
});

/**
 * POST /rpc/send-transaction
 * Send a signed transaction to Solana network
 */
rpcProxyRouter.post('/send-transaction', async (req, res) => {
  try {
    const { transaction, options } = req.body;

    if (!transaction) {
      res.status(400).json({
        success: false,
        error: 'Missing transaction parameter',
      });
      return;
    }

    const config = getConfig();
    const rpcUrl = RPC_ENDPOINTS[config.SOLANA_NETWORK] || 'https://api.mainnet-beta.solana.com';

    console.log(`[RPC Proxy] Sending transaction to ${config.SOLANA_NETWORK}`);

    const rpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        transaction,
        {
          encoding: 'base64',
          skipPreflight: options?.skipPreflight ?? false,
          preflightCommitment: options?.preflightCommitment ?? 'confirmed',
          maxRetries: options?.maxRetries ?? 3,
        },
      ],
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });

    const result = await response.json() as RpcResult;

    if (result.error) {
      console.log('[RPC Proxy] sendTransaction failed:', result.error);
      res.json({
        success: false,
        error: result.error.message || JSON.stringify(result.error),
        rpcError: result.error,
      });
      return;
    }

    console.log('[RPC Proxy] sendTransaction success:', result.result);
    res.json({
      success: true,
      signature: result.result,
    });
  } catch (error) {
    console.error('[RPC Proxy] sendTransaction error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'RPC proxy error',
    });
  }
});
