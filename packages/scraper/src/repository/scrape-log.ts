import type { Database } from 'sql.js';

/**
 * スクレイピングログの型
 */
export interface ScrapeLog {
  id: number;
  area: string;
  scrapedAt: string;
  showtimeCount: number | null;
  error: string | null;
}

/**
 * スクレイピングログを追加
 * @returns ログID
 */
export function addScrapeLog(
  db: Database,
  log: { area: string; showtimeCount?: number; error?: string }
): number {
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO scrape_log (area, scraped_at, showtime_count, error) VALUES (?, ?, ?, ?)',
    [log.area, now, log.showtimeCount ?? null, log.error ?? null]
  );

  // 挿入されたIDを取得
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const id = stmt.getAsObject()['id'] as number;
  stmt.free();

  return id;
}

/**
 * 最新のスクレイピングログを取得（エリアごと）
 */
export function getLatestScrapeLogByArea(
  db: Database,
  area: string
): ScrapeLog | null {
  const stmt = db.prepare(
    'SELECT * FROM scrape_log WHERE area = ? ORDER BY scraped_at DESC LIMIT 1'
  );
  stmt.bind([area]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      area: string;
      scraped_at: string;
      showtime_count: number | null;
      error: string | null;
    };
    stmt.free();
    return {
      id: row.id,
      area: row.area,
      scrapedAt: row.scraped_at,
      showtimeCount: row.showtime_count,
      error: row.error,
    };
  }

  stmt.free();
  return null;
}

/**
 * 全エリアの最新スクレイピングログを取得
 */
export function getAllLatestScrapeLogs(db: Database): ScrapeLog[] {
  const stmt = db.prepare(`
    SELECT *
    FROM scrape_log sl1
    WHERE id = (
      SELECT id
      FROM scrape_log sl2
      WHERE sl2.area = sl1.area
      ORDER BY scraped_at DESC, id DESC
      LIMIT 1
    )
    ORDER BY area
  `);

  const logs: ScrapeLog[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as {
      id: number;
      area: string;
      scraped_at: string;
      showtime_count: number | null;
      error: string | null;
    };
    logs.push({
      id: row.id,
      area: row.area,
      scrapedAt: row.scraped_at,
      showtimeCount: row.showtime_count,
      error: row.error,
    });
  }
  stmt.free();

  return logs;
}

/**
 * 古いログを削除（指定日数より前のログ）
 * @returns 削除された行数
 */
export function deleteOldScrapeLogs(db: Database, daysToKeep: number): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffDateStr = cutoffDate.toISOString();

  db.run('DELETE FROM scrape_log WHERE scraped_at < ?', [cutoffDateStr]);

  const changesStmt = db.prepare('SELECT changes() as count');
  changesStmt.step();
  const count = changesStmt.getAsObject()['count'] as number;
  changesStmt.free();

  return count;
}
