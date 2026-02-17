import type { RequestHandler } from 'express';

export interface AuthConfig {
  apiKeys: string[];
}

/**
 * API キー認証ミドルウェア
 * Authorization: Bearer <api-key> ヘッダーを検証する
 */
export function createAuthMiddleware(config: AuthConfig): RequestHandler {
  const validKeys = new Set(config.apiKeys);

  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: Missing or invalid Authorization header. Use "Bearer <api-key>"' },
        id: null,
      });
      return;
    }

    const apiKey = authHeader.slice(7);
    if (!validKeys.has(apiKey)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: Invalid API key' },
        id: null,
      });
      return;
    }

    next();
  };
}
