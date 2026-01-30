import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { runMigrations, getCurrentVersion, migrations } from '../db/migrations/index.js';

describe('Migrations', () => {
  let db: Database;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it('should run all migrations on empty database', () => {
    runMigrations(db);

    // テーブルが存在することを確認
    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = tables[0]?.values.map((row) => row[0]) ?? [];

    expect(tableNames).toContain('theaters');
    expect(tableNames).toContain('movies');
    expect(tableNames).toContain('showtimes');
    expect(tableNames).toContain('scrape_log');
    expect(tableNames).toContain('schema_migrations');
  });

  it('should record migration version', () => {
    runMigrations(db);

    const version = getCurrentVersion(db);
    expect(version).toBe(migrations.length);
  });

  it('should not re-run applied migrations', () => {
    // 1回目の実行
    runMigrations(db);

    // データを挿入
    db.run("INSERT INTO theaters (name, area) VALUES ('新宿バルト9', '新宿')");

    // 2回目の実行
    runMigrations(db);

    // データが保持されていることを確認
    const result = db.exec('SELECT COUNT(*) FROM theaters');
    expect(result[0]?.values[0]?.[0]).toBe(1);
  });

  it('should return version 0 for empty database', async () => {
    // schema_migrationsテーブルを作成（マイグレーションを実行せずに）
    db.run(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    const version = getCurrentVersion(db);
    expect(version).toBe(0);
  });
});
