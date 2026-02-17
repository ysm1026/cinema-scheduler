import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  openDatabaseFromGcs,
  createGcsAutoReloadProxy,
  type GcsReloadHandle,
} from '@cinema-scheduler/shared';
import type { Database } from 'sql.js';
import { registerTools } from './tools/index.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';

const SERVER_NAME = 'cinema-scheduler';
const SERVER_VERSION = '1.0.0';

interface HandlerConfig {
  port: number;
  gcsBucket: string;
  gcsObjectName: string;
  cacheCheckIntervalMs: number;
  apiKeys?: string[];
  corsOrigins?: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

function loadConfig(): HandlerConfig {
  const gcsBucket = process.env.CLOUD_STORAGE_BUCKET;
  if (!gcsBucket) {
    throw new Error('CLOUD_STORAGE_BUCKET environment variable is required for HTTP mode');
  }

  const config: HandlerConfig = {
    port: parseInt(process.env.PORT ?? '8080', 10),
    gcsBucket,
    gcsObjectName: process.env.GCS_OBJECT_NAME ?? 'data.db',
    cacheCheckIntervalMs: parseInt(process.env.DB_CACHE_CHECK_INTERVAL ?? '300000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
  };

  const apiKeys = process.env.API_KEYS?.split(',').filter(Boolean);
  if (apiKeys && apiKeys.length > 0) {
    config.apiKeys = apiKeys;
  }

  const corsOrigins = process.env.CORS_ORIGINS?.split(',').filter(Boolean);
  if (corsOrigins && corsOrigins.length > 0) {
    config.corsOrigins = corsOrigins;
  }

  return config;
}

let gcsHandle: GcsReloadHandle | null = null;
let dbReady = false;

async function main(): Promise<void> {
  const config = loadConfig();

  // GCS から DB をロード
  console.log(`Downloading data.db from gs://${config.gcsBucket}/${config.gcsObjectName}...`);
  const rawDb = await openDatabaseFromGcs(
    config.gcsBucket,
    config.gcsObjectName,
  );
  console.log('Database loaded successfully');

  // GCS 自動リロード Proxy
  gcsHandle = createGcsAutoReloadProxy(rawDb, {
    gcsBucket: config.gcsBucket,
    gcsObjectName: config.gcsObjectName,
    checkIntervalMs: config.cacheCheckIntervalMs,
  });
  const db: Database = gcsHandle.db;
  dbReady = true;

  // Express アプリ
  const app = express();
  app.use(express.json());

  // ヘルスチェック（認証不要）
  app.get('/health', (_req, res) => {
    if (!dbReady) {
      res.status(503).json({ status: 'unavailable', message: 'Database not loaded yet' });
      return;
    }
    const cacheInfo = gcsHandle?.getCacheInfo();
    res.json({
      status: 'ok',
      database: {
        generation: cacheInfo?.generation ?? null,
        lastChecked: cacheInfo?.lastChecked?.toISOString() ?? null,
        lastUpdated: cacheInfo?.lastUpdated?.toISOString() ?? null,
      },
    });
  });

  // CORS
  const allowedOrigins = config.corsOrigins ?? ['*'];
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', allowedOrigins.join(','));
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
    next();
  });

  // 認証ミドルウェア
  if (config.apiKeys && config.apiKeys.length > 0) {
    app.use('/mcp', createAuthMiddleware({ apiKeys: config.apiKeys }));
  }

  // レート制限ミドルウェア
  app.use('/mcp', createRateLimitMiddleware({
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
  }));

  // セッション管理
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // MCP エンドポイント
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId) {
      // 新しいセッションの初期化
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
        onsessionclosed: (sid) => {
          transports.delete(sid);
        },
      });

      const mcpServer = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
      });
      registerTools(mcpServer, db);
      await mcpServer.connect(transport as unknown as Transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Invalid session ID' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Invalid or missing session ID' },
        id: null,
      });
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Invalid or missing session ID' },
        id: null,
      });
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  });

  // サーバー起動
  const httpServer = app.listen(config.port, () => {
    console.log(`MCP HTTP server listening on port ${config.port}`);
  });

  // グレースフルシャットダウン
  const shutdown = () => {
    console.log('Shutting down...');
    gcsHandle?.stop();
    for (const t of transports.values()) {
      t.close();
    }
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Failed to start HTTP server:', error);
  process.exit(1);
});
