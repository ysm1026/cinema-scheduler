import type { Database } from 'sql.js';
import { migration001 } from './001_initial.js';

export interface Migration {
  version: number;
  name: string;
  up(db: Database): void;
}

/**
 * 登録されているマイグレーション一覧
 */
export const migrations: Migration[] = [migration001];

/**
 * マイグレーションを実行する
 */
export function runMigrations(db: Database): void {
  // schema_migrationsテーブルが存在するか確認
  const tableExists = db.exec(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'
  `);

  if (tableExists.length === 0 || tableExists[0]?.values.length === 0) {
    // 初回実行: 全マイグレーションを適用
    for (const migration of migrations) {
      migration.up(db);
      db.run(
        `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
        [migration.version, migration.name, new Date().toISOString()]
      );
    }
    return;
  }

  // 適用済みバージョンを取得
  const appliedResult = db.exec('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(
    appliedResult[0]?.values.map((row) => row[0] as number) ?? []
  );

  // 未適用のマイグレーションを実行
  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      migration.up(db);
      db.run(
        `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
        [migration.version, migration.name, new Date().toISOString()]
      );
    }
  }
}

/**
 * 現在のスキーマバージョンを取得
 */
export function getCurrentVersion(db: Database): number {
  const result = db.exec('SELECT MAX(version) FROM schema_migrations');
  return (result[0]?.values[0]?.[0] as number) ?? 0;
}
