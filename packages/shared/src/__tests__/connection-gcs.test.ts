import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openDatabaseFromGcs, createGcsAutoReloadProxy, closeDatabase } from '../db/connection.js';
import type { GcsStorageService } from '../db/gcs-storage.js';
import type { Database } from 'sql.js';
import initSqlJs from 'sql.js';
import { SCHEMA_SQL } from '../db/schema.js';

/**
 * テスト用の空 data.db バイナリを生成する
 */
async function createTestDbBuffer(tag?: string): Promise<Buffer> {
  const sql = await initSqlJs();
  const db = new sql.Database();
  db.run(SCHEMA_SQL);
  if (tag) {
    db.run(`INSERT INTO scrape_log (area, scraped_at, showtime_count) VALUES ('${tag}', datetime('now'), 0)`);
  }
  const data = db.export();
  db.close();
  return Buffer.from(data);
}

function createMockGcs(dbBuffer: Buffer, generation = '1000'): GcsStorageService {
  return {
    download: vi.fn().mockResolvedValue(dbBuffer),
    upload: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue({
      updated: new Date('2026-02-13T06:00:00.000Z'),
      generation,
    }),
  };
}

describe('openDatabaseFromGcs', () => {
  it('should download data.db from GCS and open it in memory', async () => {
    const dbBuffer = await createTestDbBuffer();
    const mockGcs = createMockGcs(dbBuffer);

    const db = await openDatabaseFromGcs('test-bucket', 'data.db', mockGcs);

    expect(mockGcs.download).toHaveBeenCalledWith('test-bucket', 'data.db');
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = tables[0]?.values.map((row) => row[0]) ?? [];
    expect(tableNames).toContain('theaters');
    expect(tableNames).toContain('movies');
    expect(tableNames).toContain('showtimes');

    closeDatabase(db);
  });

  it('should use default objectName "data.db"', async () => {
    const dbBuffer = await createTestDbBuffer();
    const mockGcs = createMockGcs(dbBuffer);

    const db = await openDatabaseFromGcs('test-bucket', undefined, mockGcs);

    expect(mockGcs.download).toHaveBeenCalledWith('test-bucket', 'data.db');
    closeDatabase(db);
  });

  it('should propagate GCS download errors', async () => {
    const mockGcs: GcsStorageService = {
      download: vi.fn().mockRejectedValue(new Error('Bucket not found')),
      upload: vi.fn(),
      getMetadata: vi.fn(),
    };

    await expect(openDatabaseFromGcs('bad-bucket', 'data.db', mockGcs)).rejects.toThrow('Bucket not found');
  });
});

describe('createGcsAutoReloadProxy', () => {
  let initialDb: Database;
  let initialBuffer: Buffer;

  beforeEach(async () => {
    initialBuffer = await createTestDbBuffer('initial');
    const sql = await initSqlJs();
    initialDb = new sql.Database(initialBuffer);
  });

  afterEach(() => {
    try { initialDb.close(); } catch { /* may already be closed */ }
  });

  it('should return a proxy that delegates to the initial DB', async () => {
    const mockGcs = createMockGcs(initialBuffer, '1000');
    const handle = createGcsAutoReloadProxy(initialDb, {
      gcsBucket: 'test-bucket',
      checkIntervalMs: 60_000,
      gcsStorage: mockGcs,
    });

    const result = handle.db.exec("SELECT area FROM scrape_log");
    expect(result[0]?.values[0]?.[0]).toBe('initial');

    handle.stop();
  });

  it('should set initial generation after first metadata check', async () => {
    const mockGcs = createMockGcs(initialBuffer, '2000');
    const handle = createGcsAutoReloadProxy(initialDb, {
      gcsBucket: 'test-bucket',
      checkIntervalMs: 60_000,
      gcsStorage: mockGcs,
    });

    // 初回の非同期メタデータ取得を待つ
    await vi.waitFor(() => {
      expect(handle.getCacheInfo().generation).toBe('2000');
    });

    expect(handle.getCacheInfo().lastChecked).toBeInstanceOf(Date);
    expect(handle.getCacheInfo().lastUpdated).toEqual(new Date('2026-02-13T06:00:00.000Z'));

    handle.stop();
  });

  it('should re-download DB when generation changes', async () => {
    const updatedBuffer = await createTestDbBuffer('updated');
    const mockGcs = createMockGcs(initialBuffer, '1000');
    const handle = createGcsAutoReloadProxy(initialDb, {
      gcsBucket: 'test-bucket',
      gcsObjectName: 'data.db',
      checkIntervalMs: 50,
      gcsStorage: mockGcs,
    });

    // 初回チェック完了を待つ
    await vi.waitFor(() => {
      expect(handle.getCacheInfo().generation).toBe('1000');
    });

    // generation を変更し、新しい DB を返す
    (mockGcs.getMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      updated: new Date('2026-02-13T12:00:00.000Z'),
      generation: '2000',
    });
    (mockGcs.download as ReturnType<typeof vi.fn>).mockResolvedValue(updatedBuffer);

    // 次のチェックで更新されるのを待つ
    await vi.waitFor(() => {
      expect(handle.getCacheInfo().generation).toBe('2000');
    });

    // Proxy 経由で新しい DB のデータを確認
    const result = handle.db.exec("SELECT area FROM scrape_log");
    expect(result[0]?.values[0]?.[0]).toBe('updated');

    handle.stop();
  });

  it('should not re-download when generation is unchanged', async () => {
    const mockGcs = createMockGcs(initialBuffer, '1000');
    const handle = createGcsAutoReloadProxy(initialDb, {
      gcsBucket: 'test-bucket',
      checkIntervalMs: 50,
      gcsStorage: mockGcs,
    });

    // 初回チェック完了を待つ
    await vi.waitFor(() => {
      expect(handle.getCacheInfo().generation).toBe('1000');
    });

    // download は初回呼び出しなし（openDatabaseFromGcs 側で呼ぶ想定）
    // 2回目以降のチェックでも download は呼ばれない
    const downloadCallCount = (mockGcs.download as ReturnType<typeof vi.fn>).mock.calls.length;

    // 少し待って、追加の download が発生していないことを確認
    await new Promise((r) => setTimeout(r, 120));

    expect((mockGcs.download as ReturnType<typeof vi.fn>).mock.calls.length).toBe(downloadCallCount);

    handle.stop();
  });

  it('should continue working when metadata check fails', async () => {
    const mockGcs = createMockGcs(initialBuffer, '1000');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handle = createGcsAutoReloadProxy(initialDb, {
      gcsBucket: 'test-bucket',
      checkIntervalMs: 50,
      gcsStorage: mockGcs,
    });

    // 初回チェック完了を待つ
    await vi.waitFor(() => {
      expect(handle.getCacheInfo().generation).toBe('1000');
    });

    // メタデータチェックをエラーにする
    (mockGcs.getMetadata as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    await new Promise((r) => setTimeout(r, 120));

    // DB は引き続き動作する
    const result = handle.db.exec("SELECT area FROM scrape_log");
    expect(result[0]?.values[0]?.[0]).toBe('initial');

    handle.stop();
    consoleSpy.mockRestore();
  });

  it('should stop periodic checks when stop() is called', async () => {
    const mockGcs = createMockGcs(initialBuffer, '1000');
    const handle = createGcsAutoReloadProxy(initialDb, {
      gcsBucket: 'test-bucket',
      checkIntervalMs: 50,
      gcsStorage: mockGcs,
    });

    await vi.waitFor(() => {
      expect(handle.getCacheInfo().generation).toBe('1000');
    });

    handle.stop();

    const callCount = (mockGcs.getMetadata as ReturnType<typeof vi.fn>).mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));

    // stop 後は追加の呼び出しが発生しない
    expect((mockGcs.getMetadata as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
  });
});
