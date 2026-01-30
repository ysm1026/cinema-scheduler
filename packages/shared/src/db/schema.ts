/**
 * SQLiteスキーマ定義
 */
export const SCHEMA_SQL = `
-- 映画館マスタ
CREATE TABLE IF NOT EXISTS theaters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  chain TEXT,
  UNIQUE(name, area)
);

-- 映画マスタ
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  runtime_minutes INTEGER
);

-- 上映スケジュール
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
);

-- スクレイピングログ
CREATE TABLE IF NOT EXISTS scrape_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  showtime_count INTEGER,
  error TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_showtimes_date ON showtimes(date);
CREATE INDEX IF NOT EXISTS idx_showtimes_theater_date ON showtimes(theater_id, date);
CREATE INDEX IF NOT EXISTS idx_showtimes_movie_date ON showtimes(movie_id, date);
CREATE INDEX IF NOT EXISTS idx_theaters_area ON theaters(area);
CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
CREATE INDEX IF NOT EXISTS idx_scrape_log_area_time ON scrape_log(area, scraped_at DESC);
`;
