#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase, closeDatabase } from '@cinema-scheduler/shared';
import type { Database } from 'sql.js';
import { registerTools } from './tools/index.js';

const SERVER_NAME = 'cinema-scheduler';
const SERVER_VERSION = '1.0.0';

let db: Database | null = null;

async function main(): Promise<void> {
  try {
    // データベースを開く（読み取り専用）
    db = await openDatabase({ readonly: true });

    // MCPサーバーを作成
    const server = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    // ツールを登録
    registerTools(server, db);

    // stdio通信を開始
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // プロセス終了時のクリーンアップ
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  } catch (error) {
    cleanup();
    process.exit(1);
  }
}

function cleanup(): void {
  if (db) {
    closeDatabase(db);
    db = null;
  }
}

main();
