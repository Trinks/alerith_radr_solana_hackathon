/**
 * Authentication Middleware
 *
 * Verifies internal API key for game server → sidecar communication.
 */

import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config.js';

// ============================================================================
// Internal API Key Authentication
// ============================================================================

/**
 * Middleware to verify internal API key.
 * Game servers must include X-Internal-Secret header.
 */
export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const providedKey = req.headers['x-internal-secret'];

  if (!providedKey) {
    res.status(401).json({
      success: false,
      error: 'Missing X-Internal-Secret header',
    });
    return;
  }

  if (providedKey !== config.INTERNAL_API_KEY) {
    console.warn(`[Auth] Invalid internal API key attempt from ${req.ip}`);
    res.status(403).json({
      success: false,
      error: 'Invalid internal API key',
    });
    return;
  }

  next();
}

// ============================================================================
// Rate Limiting
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter.
 * For production, use Redis-based rate limiting.
 */
export function rateLimit(options: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    let entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + options.windowMs };
      rateLimitMap.set(key, entry);
    }

    entry.count++;

    if (entry.count > options.max) {
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// ============================================================================
// Request Logging
// ============================================================================

/**
 * Log incoming requests (sanitized).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    // Never log request bodies (may contain wallet addresses)
    console[level === 'warn' ? 'warn' : 'log'](
      `[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}
