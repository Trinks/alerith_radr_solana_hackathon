/**
 * Alerith ShadowWire Sidecar - Express Server
 *
 * Privacy-preserving duel escrow service.
 * Uses in-memory storage (no Redis required).
 */

import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getConfig } from './config.js';
import { requireInternalAuth, requestLogger, rateLimit } from './middleware/auth.js';
import { duelRouter } from './routes/duel.js';
import { createHealthRouter } from './routes/health.js';
import { testRouter } from './routes/test.js';
import { rpcProxyRouter } from './routes/rpc-proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Server Factory
// ============================================================================

export function createServer(): express.Application {
  const app = express();
  const config = getConfig();

  // ============================================================================
  // Static Files (WASM for ShadowWire SDK + Test Pages)
  // ============================================================================

  const publicPath = join(__dirname, '..', 'public');

  // Serve WASM files with correct headers and CORS for cross-origin loading
  app.use('/wasm', (req, res, next) => {
    res.setHeader('Content-Type', 'application/wasm');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    // Allow cross-origin resource sharing for WASM loading from Unity WebGL
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  }, express.static(join(publicPath, 'wasm')));

  // Serve test HTML pages and SDK with relaxed CSP for development
  // Also allow cross-origin loading so Unity WebGL can load the SDK
  app.use('/test', (req, res, next) => {
    // Allow inline scripts, styles, and external connections for test pages
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://shadow.radr.fun https://unpkg.com https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' https://shadow.radr.fun https://*.solana.com wss://*.solana.com https://unpkg.com https://cdn.jsdelivr.net https://api.mainnet-beta.solana.com https://api.devnet.solana.com; " +
      "img-src 'self' data:; " +
      "font-src 'self' data:;"
    );
    // Allow cross-origin resource sharing for SDK loading from Unity WebGL
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  }, express.static(publicPath));

  // Redirect /duel-stake-test to /test/duel-stake-test.html
  app.get('/duel-stake-test', (req, res) => {
    res.redirect('/test/duel-stake-test.html');
  });

  // ============================================================================
  // Security Middleware
  // ============================================================================

  // Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'no-referrer' },
      xssFilter: true,
    })
  );

  app.use(express.json({ limit: '10kb' }));

  // Request logging (sanitized - never logs bodies)
  app.use(requestLogger);

  // CORS for browser-based testing (development only)
  app.use((req, res, next) => {
    // Allow requests from same origin and local development
    const origin = req.headers.origin;
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin === req.headers.host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // In development, allow any origin for testing
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Secret');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // ============================================================================
  // Public Routes (no auth required)
  // ============================================================================

  // Health checks (for load balancers, k8s probes)
  app.use('/health', createHealthRouter());

  // Public duel routes for browser testing (no auth - development only)
  // WARNING: In production, these should be disabled or require auth
  if (config.isDevelopment) {
    app.use('/duel', duelRouter);
    console.log('[Server] Public /duel routes enabled for development testing');
  }

  // RPC Proxy for browser transactions (avoids CORS issues with Solana RPC)
  // WARNING: In production, add rate limiting and authentication
  app.use('/rpc', rpcProxyRouter);
  console.log('[Server] RPC proxy enabled at /rpc');

  // Test routes (devnet only - requires internal auth)
  app.use('/test-api', requireInternalAuth, testRouter);

  // ============================================================================
  // Protected Routes (internal auth required)
  // ============================================================================

  // Rate limiting for API endpoints
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
    })
  );

  // Internal authentication
  app.use('/api', requireInternalAuth);

  // Duel escrow endpoints
  app.use('/api/v1/duel', duelRouter);

  // ============================================================================
  // Error Handling
  // ============================================================================

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
    });
  });

  // Global error handler
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // Never log stack traces in production (may contain sensitive info)
      if (config.isDevelopment) {
        console.error('[Server] Error:', err);
      } else {
        console.error('[Server] Error:', err.message);
      }

      res.status(500).json({
        success: false,
        error: config.isDevelopment ? err.message : 'Internal server error',
      });
    }
  );

  return app;
}
