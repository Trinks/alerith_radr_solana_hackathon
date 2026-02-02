/**
 * Health Routes - Service Health Checks
 */

import { Router } from 'express';
import type { HealthStatus } from '../types/index.js';
import { shadowWireService } from '../services/shadowwire.js';
import { memoryStore } from '../services/memory-store.js';

export function createHealthRouter(): Router {
  const router = Router();
  const startTime = Date.now();

  /**
   * GET /health
   *
   * Quick health check for load balancers.
   */
  router.get('/', async (req, res) => {
    try {
      const checks = await runHealthChecks();

      const allHealthy = checks.memoryStore && checks.shadowwire && checks.solana;

      const status: HealthStatus = {
        status: allHealthy ? 'healthy' : 'degraded',
        version: '2.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks: {
          redis: checks.memoryStore, // Backwards compatibility
          shadowwire: checks.shadowwire,
          solana: checks.solana,
        },
        timestamp: Date.now(),
      };

      res.status(allHealthy ? 200 : 503).json(status);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        version: '2.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks: {
          redis: false,
          shadowwire: false,
          solana: false,
        },
        timestamp: Date.now(),
      } satisfies HealthStatus);
    }
  });

  /**
   * GET /health/ready
   *
   * Readiness check - is the service ready to handle requests?
   */
  router.get('/ready', async (req, res) => {
    try {
      const checks = await runHealthChecks();

      // Service is ready if memory store is up (ShadowWire/Solana can be degraded)
      if (checks.memoryStore) {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false, reason: 'Memory store unavailable' });
      }
    } catch {
      res.status(503).json({ ready: false, reason: 'Health check failed' });
    }
  });

  /**
   * GET /health/live
   *
   * Liveness check - is the service alive?
   */
  router.get('/live', (req, res) => {
    res.status(200).json({ alive: true });
  });

  return router;
}

/**
 * Run health checks against dependencies.
 */
async function runHealthChecks(): Promise<{
  memoryStore: boolean;
  shadowwire: boolean;
  solana: boolean;
}> {
  const results = {
    memoryStore: false,
    shadowwire: false,
    solana: false,
  };

  // Check memory store (always healthy for in-memory)
  results.memoryStore = memoryStore.isHealthy();

  // Check ShadowWire (via balance check on escrow wallet)
  try {
    const escrowWallet = shadowWireService.getEscrowWallet();
    const balance = await shadowWireService.getBalance(escrowWallet);
    results.shadowwire = balance.success;
    results.solana = balance.success; // If ShadowWire works, Solana is reachable
  } catch {
    results.shadowwire = false;
    results.solana = false;
  }

  return results;
}
