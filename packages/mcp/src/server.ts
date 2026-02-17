#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase, closeDatabase, getDatabasePath, reloadDatabaseSync } from '@cinema-scheduler/shared';
import type { Database } from 'sql.js';
import { statSync } from 'node:fs';
import { registerTools } from './tools/index.js';

const SERVER_NAME = 'cinema-scheduler';
const SERVER_VERSION = '1.0.0';

let db: Database | null = null;

/**
 * DBファイルの変更を検知して自動リロードするProxyを作成する。
 * cronでDBが更新された場合、次のツール呼び出し時に自動的に最新データを読み込む。
 */
function createAutoReloadProxy(initialDb: Database): Database {
  let currentDb = initialDb;
  let lastMtime = 0;

  try {
    lastMtime = statSync(getDatabasePath()).mtimeMs;
  } catch {
    // ignore
  }

  return new Proxy(initialDb, {
    get(_target, prop, _receiver) {
      // prepare/exec 呼び出し時にファイル変更をチェック
      if (prop === 'prepare' || prop === 'exec') {
        try {
          const currentMtime = statSync(getDatabasePath()).mtimeMs;
          if (currentMtime > lastMtime) {
            const oldDb = currentDb;
            currentDb = reloadDatabaseSync();
            lastMtime = currentMtime;
            try {
              oldDb.close();
            } catch {
              // ignore close errors
            }
          }
        } catch {
          // ファイル読み込みエラー時は現在のDBを継続使用
        }
      }

      const value = Reflect.get(currentDb, prop);
      if (typeof value === 'function') {
        return value.bind(currentDb);
      }
      return value;
    },
  });
}

async function main(): Promise<void> {
  try {
    // データベースを開く（読み取り専用）
    const rawDb = await openDatabase({ readonly: true });

    // 自動リロードProxyでラップ
    db = createAutoReloadProxy(rawDb);

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
