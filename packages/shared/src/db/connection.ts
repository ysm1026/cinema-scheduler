import initSqlJs, { type Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_SQL } from './schema.js';
import { runMigrations } from './migrations/index.js';
import { createGcsStorage, type GcsStorageService } from './gcs-storage.js';

const DB_DIR = join(homedir(), '.cinema-scheduler');
const DB_PATH = join(DB_DIR, 'data.db');

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/**
 * sql.jsを初期化する
 */
async function initSQL(): Promise<typeof SQL> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * データベースを開く
 * @param options.readonly 読み取り専用モード（デフォルト: false）
 * @param options.inMemory メモリ上にDBを作成（デフォルト: false）
 */
export async function openDatabase(options?: {
  readonly?: boolean;
  inMemory?: boolean;
}): Promise<Database> {
  const sql = await initSQL();
  if (!sql) {
    throw new Error('Failed to initialize sql.js');
  }

  if (options?.inMemory) {
    const db = new sql.Database();
    db.run(SCHEMA_SQL);
    return db;
  }

  // ディレクトリ作成
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  let db: Database;
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new sql.Database(buffer);
    // 既存DBにマイグレーションを適用
    runMigrations(db);
  } else {
    db = new sql.Database();
    db.run(SCHEMA_SQL);
    // 新規DBにもマイグレーション記録を作成
    runMigrations(db);
    saveDatabase(db);
  }

  return db;
}

/**
 * データベースをファイルに保存する
 */
export function saveDatabase(db: Database): void {
  const data = db.export();
  const buffer = Buffer.from(data);

  // ディレクトリ作成
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  writeFileSync(DB_PATH, buffer);
}

/**
 * データベースをファイルから再読み込みする（同期版）
 * sql.jsが初期化済みであることが前提
 */
export function reloadDatabaseSync(): Database {
  if (!SQL) {
    throw new Error('sql.js is not initialized. Call openDatabase() first.');
  }
  if (!existsSync(DB_PATH)) {
    throw new Error(`Database file not found: ${DB_PATH}`);
  }
  const buffer = readFileSync(DB_PATH);
  return new SQL.Database(buffer);
}

/**
 * データベースを閉じる
 */
export function closeDatabase(db: Database): void {
  db.close();
}

/**
 * データベースファイルのパスを取得
 */
export function getDatabasePath(): string {
  return DB_PATH;
}

/**
 * データベースディレクトリのパスを取得
 */
export function getDatabaseDir(): string {
  return DB_DIR;
}

// --- GCS 対応 ---

export interface GcsCacheInfo {
  generation: string | null;
  lastChecked: Date | null;
  lastUpdated: Date | null;
}

export interface GcsReloadHandle {
  db: Database;
  getCacheInfo: () => GcsCacheInfo;
  stop: () => void;
}

/**
 * GCS から data.db をダウンロードしてメモリ上に開く
 */
export async function openDatabaseFromGcs(
  bucket: string,
  objectName = 'data.db',
  gcsStorage?: GcsStorageService,
): Promise<Database> {
  const sql = await initSQL();
  if (!sql) {
    throw new Error('Failed to initialize sql.js');
  }

  const gcs = gcsStorage ?? createGcsStorage();
  const buffer = await gcs.download(bucket, objectName);
  return new sql.Database(buffer);
}

/**
 * GCS メタデータを定期チェックし、generation 変化時に DB を自動更新する Proxy を作成する
 */
export function createGcsAutoReloadProxy(
  initialDb: Database,
  options: {
    gcsBucket: string;
    gcsObjectName?: string;
    checkIntervalMs?: number;
    gcsStorage?: GcsStorageService;
  },
): GcsReloadHandle {
  const {
    gcsBucket,
    gcsObjectName = 'data.db',
    checkIntervalMs = 300_000,
    gcsStorage,
  } = options;
  const gcs = gcsStorage ?? createGcsStorage();

  let currentDb = initialDb;
  let currentGeneration: string | null = null;
  let lastChecked: Date | null = null;
  let lastUpdated: Date | null = null;

  const proxy = new Proxy(initialDb, {
    get(_target, prop) {
      const value = Reflect.get(currentDb, prop);
      if (typeof value === 'function') {
        return value.bind(currentDb);
      }
      return value;
    },
  });

  async function checkForUpdates(): Promise<void> {
    try {
      const metadata = await gcs.getMetadata(gcsBucket, gcsObjectName);
      lastChecked = new Date();

      if (currentGeneration !== null && metadata.generation !== currentGeneration) {
        const buffer = await gcs.download(gcsBucket, gcsObjectName);
        if (!SQL) throw new Error('sql.js not initialized');
        const oldDb = currentDb;
        currentDb = new SQL.Database(buffer);
        currentGeneration = metadata.generation;
        lastUpdated = metadata.updated;
        try { oldDb.close(); } catch { /* ignore */ }
        console.log(`DB refreshed from GCS (generation: ${currentGeneration})`);
      } else {
        currentGeneration = metadata.generation;
        lastUpdated = metadata.updated;
      }
    } catch (error) {
      console.error('GCS cache check failed:', error);
    }
  }

  // 初回メタデータ取得（非同期、バックグラウンド実行）
  checkForUpdates();

  const intervalId = setInterval(checkForUpdates, checkIntervalMs);

  return {
    db: proxy,
    getCacheInfo: () => ({ generation: currentGeneration, lastChecked, lastUpdated }),
    stop: () => clearInterval(intervalId),
  };
}
