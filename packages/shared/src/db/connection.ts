import initSqlJs, { type Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_SQL } from './schema.js';

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
  } else {
    db = new sql.Database();
    db.run(SCHEMA_SQL);
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
