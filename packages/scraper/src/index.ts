// @cinema-scheduler/scraper
// eiga.com scraper batch

import type { Logger } from 'pino';
import type { Database } from 'sql.js';
import { openDatabase, saveDatabase, closeDatabase } from '@cinema-scheduler/shared';
import { createScraper, type ScrapedShowtime, type ScraperConfig } from './scraper/eigacom.js';
import { upsertTheater } from './repository/theater.js';
import { upsertMovie } from './repository/movie.js';
import { upsertShowtime } from './repository/showtime.js';
import { addScrapeLog } from './repository/scrape-log.js';

/**
 * スクレイピング実行オプション
 */
export interface ScrapeOptions {
  areas: string[];
  dates: Date[];
  dryRun: boolean;
  logger: Logger;
  scraperConfig?: ScraperConfig;
}

/**
 * スクレイピング結果
 */
export interface ScrapeResult {
  area: string;
  date: string;
  showtimeCount: number;
  theaterCount: number;
  movieCount: number;
  error?: string;
}

/**
 * スクレイピング結果をDBに保存する
 */
function saveShowtimesToDatabase(
  db: Database,
  showtimes: ScrapedShowtime[],
  logger: Logger
): { theaterCount: number; movieCount: number } {
  const theaterIds = new Map<string, number>();
  const movieIds = new Map<string, number>();

  for (const showtime of showtimes) {
    // 映画館のUPSERT
    const theaterKey = `${showtime.theater}:${showtime.area}`;
    let theaterId = theaterIds.get(theaterKey);
    if (!theaterId) {
      theaterId = upsertTheater(db, {
        name: showtime.theater,
        area: showtime.area,
      });
      theaterIds.set(theaterKey, theaterId);
      logger.debug({ theater: showtime.theater }, '映画館を保存');
    }

    // 映画のUPSERT
    let movieId = movieIds.get(showtime.movieTitle);
    if (!movieId) {
      movieId = upsertMovie(db, {
        title: showtime.movieTitle,
        runtimeMinutes: showtime.runtimeMinutes,
      });
      movieIds.set(showtime.movieTitle, movieId);
      logger.debug({ movie: showtime.movieTitle }, '映画を保存');
    }

    // 上映情報のUPSERT
    const showtimeData = {
      theaterId,
      movieId,
      date: showtime.date,
      startTime: showtime.startTime,
      endTime: showtime.endTime,
      ...(showtime.format && { format: showtime.format }),
    };
    upsertShowtime(db, showtimeData);
  }

  return {
    theaterCount: theaterIds.size,
    movieCount: movieIds.size,
  };
}

/**
 * メインのスクレイピング実行関数
 */
export async function runScraper(options: ScrapeOptions): Promise<ScrapeResult[]> {
  const { areas, dates, dryRun, logger, scraperConfig } = options;
  const results: ScrapeResult[] = [];

  let db: Database | null = null;

  try {
    // DBを開く（dry-runでない場合）
    if (!dryRun) {
      db = await openDatabase();
      logger.info('データベースに接続しました');
    }

    // スクレイパーを作成
    const scraper = createScraper(scraperConfig);

    try {
      for (const area of areas) {
        for (const date of dates) {
          const dateStr = date.toISOString().split('T')[0]!;
          logger.info({ area, date: dateStr }, 'スクレイピング開始');

          try {
            // スクレイピング実行
            const showtimes = await scraper.scrapeArea(area, date);
            logger.info(
              { area, date: dateStr, count: showtimes.length },
              'スクレイピング完了'
            );

            let theaterCount = 0;
            let movieCount = 0;

            // DBに保存（dry-runでない場合）
            if (!dryRun && db) {
              const saveResult = saveShowtimesToDatabase(db, showtimes, logger);
              theaterCount = saveResult.theaterCount;
              movieCount = saveResult.movieCount;

              // ログを記録
              addScrapeLog(db, {
                area,
                showtimeCount: showtimes.length,
              });

              // 定期的に保存
              saveDatabase(db);
              logger.info({ area, date: dateStr }, 'データベースに保存しました');
            }

            results.push({
              area,
              date: dateStr,
              showtimeCount: showtimes.length,
              theaterCount,
              movieCount,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ area, date: dateStr, error: errorMessage }, 'スクレイピングエラー');

            // エラーログをDBに記録
            if (!dryRun && db) {
              addScrapeLog(db, {
                area,
                error: errorMessage,
              });
              saveDatabase(db);
            }

            results.push({
              area,
              date: dateStr,
              showtimeCount: 0,
              theaterCount: 0,
              movieCount: 0,
              error: errorMessage,
            });
          }
        }
      }
    } finally {
      await scraper.close();
    }

    // 最終保存
    if (!dryRun && db) {
      saveDatabase(db);
    }
  } finally {
    if (db) {
      closeDatabase(db);
    }
  }

  return results;
}

// Re-export for convenience
export { EigacomScraper, createScraper, type ScrapedShowtime, type ScraperConfig } from './scraper/eigacom.js';
export * from './scraper/areas.js';
export * from './repository/index.js';
export * from './config.js';
