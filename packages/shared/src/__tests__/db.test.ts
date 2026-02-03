import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase, saveDatabase } from '../db/connection.js';
import { SCHEMA_SQL } from '../db/schema.js';
import type { Database } from 'sql.js';

describe('Database Connection', () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase({ inMemory: true });
  });

  afterEach(() => {
    if (db) {
      closeDatabase(db);
    }
  });

  it('should create in-memory database with schema', () => {
    // テーブルが存在することを確認
    const tables = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = tables[0]?.values.map((row) => row[0]) ?? [];

    expect(tableNames).toContain('theaters');
    expect(tableNames).toContain('movies');
    expect(tableNames).toContain('showtimes');
    expect(tableNames).toContain('scrape_log');
  });

  it('should insert and query theaters', () => {
    db.run(
      "INSERT INTO theaters (name, area, chain) VALUES ('新宿バルト9', '新宿', 'other')"
    );

    const result = db.exec('SELECT * FROM theaters');
    expect(result[0]?.values.length).toBe(1);
    expect(result[0]?.values[0]?.[1]).toBe('新宿バルト9');
    expect(result[0]?.values[0]?.[2]).toBe('新宿');
  });

  it('should insert and query movies', () => {
    db.run("INSERT INTO movies (title, runtime_minutes) VALUES ('ズートピア2', 108)");

    const result = db.exec('SELECT * FROM movies');
    expect(result[0]?.values.length).toBe(1);
    expect(result[0]?.values[0]?.[1]).toBe('ズートピア2');
    expect(result[0]?.values[0]?.[2]).toBe(108);
  });

  it('should insert and query showtimes with foreign keys', () => {
    // 映画館と映画を追加
    db.run("INSERT INTO theaters (name, area) VALUES ('新宿バルト9', '新宿')");
    db.run("INSERT INTO movies (title, runtime_minutes) VALUES ('ズートピア2', 108)");

    // 上映時間を追加
    db.run(`
      INSERT INTO showtimes (theater_id, movie_id, date, start_time, end_time, format)
      VALUES (1, 1, '2026-01-29', '11:00', '12:48', NULL)
    `);

    const result = db.exec(`
      SELECT s.*, t.name as theater_name, m.title as movie_title
      FROM showtimes s
      JOIN theaters t ON s.theater_id = t.id
      JOIN movies m ON s.movie_id = m.id
    `);

    expect(result[0]?.values.length).toBe(1);
    // showtimes: id(0), theater_id(1), movie_id(2), date(3), start_time(4), end_time(5), format(6), audio_type(7)
    // + theater_name(8), movie_title(9)
    expect(result[0]?.values[0]?.[8]).toBe('新宿バルト9');
    expect(result[0]?.values[0]?.[9]).toBe('ズートピア2');
  });

  it('should enforce unique constraint on theaters', () => {
    db.run("INSERT INTO theaters (name, area) VALUES ('新宿バルト9', '新宿')");

    expect(() => {
      db.run("INSERT INTO theaters (name, area) VALUES ('新宿バルト9', '新宿')");
    }).toThrow();
  });

  it('should enforce unique constraint on movies', () => {
    db.run("INSERT INTO movies (title) VALUES ('ズートピア2')");

    expect(() => {
      db.run("INSERT INTO movies (title) VALUES ('ズートピア2')");
    }).toThrow();
  });

  it('should insert scrape log', () => {
    db.run(`
      INSERT INTO scrape_log (area, scraped_at, showtime_count, error)
      VALUES ('新宿', '2026-01-29T05:00:00+09:00', 100, NULL)
    `);

    const result = db.exec('SELECT * FROM scrape_log');
    expect(result[0]?.values.length).toBe(1);
    expect(result[0]?.values[0]?.[1]).toBe('新宿');
    expect(result[0]?.values[0]?.[3]).toBe(100);
  });
});

describe('Schema SQL', () => {
  it('should contain all required tables', () => {
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS theaters');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS movies');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS showtimes');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS scrape_log');
  });

  it('should contain all required indexes', () => {
    expect(SCHEMA_SQL).toContain('CREATE INDEX IF NOT EXISTS idx_showtimes_date');
    expect(SCHEMA_SQL).toContain('CREATE INDEX IF NOT EXISTS idx_theaters_area');
    expect(SCHEMA_SQL).toContain('CREATE INDEX IF NOT EXISTS idx_movies_title');
  });
});
