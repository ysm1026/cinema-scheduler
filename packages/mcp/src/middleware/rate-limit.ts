import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

/**
 * IP ベースレート制限ミドルウェア
 */
export function createRateLimitMiddleware(config: RateLimitConfig): RequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      jsonrpc: '2.0',
      error: { code: -32002, message: 'Too Many Requests: Rate limit exceeded' },
      id: null,
    },
  });
}
