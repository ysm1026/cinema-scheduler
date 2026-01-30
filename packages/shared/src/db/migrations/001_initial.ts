import type { Database } from 'sql.js';

/**
 * マイグレーション: 初期スキーマ
 */
export const migration001 = {
  version: 1,
  name: '001_initial',
  up(db: Database): void {
    // 映画館マスタ
    db.run(`
      CREATE TABLE IF NOT EXISTS theaters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        area TEXT NOT NULL,
        chain TEXT,
        UNIQUE(name, area)
      )
    `);

    // 映画マスタ
    db.run(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL UNIQUE,
        runtime_minutes INTEGER
      )
    `);

    // 上映スケジュール
    db.run(`
      CREATE TABLE IF NOT EXISTS showtimes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        theater_id INTEGER NOT NULL,
        movie_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        format TEXT,
        FOREIGN KEY (theater_id) REFERENCES theaters(id),
        FOREIGN KEY (movie_id) REFERENCES movies(id),
        UNIQUE(theater_id, movie_id, date, start_time)
      )
    `);

    // スクレイピングログ
    db.run(`
      CREATE TABLE IF NOT EXISTS scrape_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        area TEXT NOT NULL,
        scraped_at TEXT NOT NULL,
        showtime_count INTEGER,
        error TEXT
      )
    `);

    // インデックス
    db.run('CREATE INDEX IF NOT EXISTS idx_showtimes_date ON showtimes(date)');
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_showtimes_theater_date ON showtimes(theater_id, date)'
    );
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_showtimes_movie_date ON showtimes(movie_id, date)'
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_theaters_area ON theaters(area)');
    db.run('CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title)');
    db.run(
      'CREATE INDEX IF NOT EXISTS idx_scrape_log_area_time ON scrape_log(area, scraped_at DESC)'
    );

    // マイグレーションバージョン管理テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  },
};

export default migration001;
