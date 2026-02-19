// @cinema-scheduler/scraper
// eiga.com scraper batch + chain scrapers

import type { Logger } from 'pino';
import type { Database } from 'sql.js';
import { openDatabase, saveDatabase, closeDatabase } from '@cinema-scheduler/shared';
import { createScraper, type ScrapedShowtime, type ScraperConfig } from './scraper/eigacom.js';
import { upsertTheater } from './repository/theater.js';
import { upsertMovie } from './repository/movie.js';
import { upsertShowtime } from './repository/showtime.js';
import { getScrapedTheaterNames } from './repository/showtime.js';
import { addScrapeLog } from './repository/scrape-log.js';
import { createChainScraper, getRegisteredChains } from './scraper/chains/registry.js';
import { getScrapeDates } from './scraper/chains/config-loader.js';
import type { ChainShowtime } from './scraper/chains/types.js';

/**
 * スクレイピング実行オプション
 */
export interface ScrapeOptions {
  areas: string[];
  dates: Date[];
  dryRun: boolean;
  logger: Logger;
  scraperConfig?: ScraperConfig;
  concurrency?: number;
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
  skippedTheaters?: number | undefined;
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
 * タイムアウト付き Promise ラッパー
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * 並列実行ユーティリティ（ワーカープール方式、タスクタイムアウト付き）
 */
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  taskTimeoutMs = 600_000, // 10分
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        try {
          await withTimeout(fn(item), taskTimeoutMs, 'task');
        } catch (error) {
          // タイムアウトでもワーカーは次のタスクに進む（エラーは fn 内で処理済み）
          if (error instanceof Error && error.message.startsWith('Timeout:')) {
            console.error(`[WARN] ${error.message}`);
          }
        }
      }
    },
  );
  await Promise.all(workers);
}

/**
 * メインのスクレイピング実行関数
 */
export async function runScraper(options: ScrapeOptions): Promise<ScrapeResult[]> {
  const { areas, dates, dryRun, logger, scraperConfig, concurrency = 3 } = options;
  const results: ScrapeResult[] = [];

  let db: Database | null = null;

  try {
    // DBを開く（dry-runでない場合）
    if (!dryRun) {
      db = await openDatabase();
      logger.info('データベースに接続しました');
    }

    // スクレイパーを作成・ブラウザを事前初期化
    const scraper = createScraper(scraperConfig);

    try {
      await scraper.launch();

      // (area, date) タスクリストを構築
      // 日付優先でインターリーブ: 同エリアの異日付が同時実行されないようにする
      // これにより同じ映画館URLへの同時アクセスを防ぎ、Playwright のナビゲーション競合を回避
      const tasks: { area: string; date: Date; dateStr: string }[] = [];
      for (const date of dates) {
        for (const area of areas) {
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          tasks.push({ area, date, dateStr });
        }
      }

      logger.info({ taskCount: tasks.length, concurrency }, '並列スクレイピング開始');

      // 並列実行
      await runConcurrent(tasks, concurrency, async (task) => {
        const { area, date, dateStr } = task;
        logger.info({ area, date: dateStr }, 'スクレイピング開始');

        try {
          // 既存データがある映画館をスキップセットとして構築
          let skipTheaters: Set<string> | undefined;
          if (!dryRun && db) {
            const existingTheaters = getScrapedTheaterNames(db, area, dateStr);
            if (existingTheaters.length > 0) {
              skipTheaters = new Set(existingTheaters);
              logger.info(
                { area, date: dateStr, skipCount: existingTheaters.length },
                '既存データのある映画館をスキップ'
              );
            }
          }

          // スクレイピング実行
          const showtimes = await scraper.scrapeArea(area, date, skipTheaters);
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
            skippedTheaters: skipTheaters?.size,
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
      });
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

/**
 * チェーンスクレイピング結果
 */
export interface ChainScrapeResult {
  chain: string;
  date: string;
  showtimeCount: number;
  theaterCount: number;
  movieCount: number;
  error?: string;
}

/**
 * チェーンスクレイピングオプション
 */
export interface ChainScrapeOptions {
  dryRun: boolean;
  logger: Logger;
}

/**
 * ChainShowtime の時刻を "HH:MM" 文字列に変換
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Date を "YYYY-MM-DD" 文字列に変換
 */
function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * チェーンスクレイピング結果をDBに保存する
 */
function saveChainShowtimesToDatabase(
  db: Database,
  showtimes: ChainShowtime[],
  chain: string,
  dateStr: string,
  logger: Logger
): { theaterCount: number; movieCount: number } {
  const theaterIds = new Map<string, number>();
  const movieIds = new Map<string, number>();

  for (const showtime of showtimes) {
    // 映画館のUPSERT（チェーン名をareaとして使用）
    let theaterId = theaterIds.get(showtime.theater);
    if (!theaterId) {
      theaterId = upsertTheater(db, {
        name: showtime.theater,
        area: chain,
        chain: showtime.theaterChain,
      });
      theaterIds.set(showtime.theater, theaterId);
      logger.debug({ theater: showtime.theater }, '映画館を保存');
    }

    // 映画のUPSERT
    let movieId = movieIds.get(showtime.movieTitle);
    if (!movieId) {
      movieId = upsertMovie(db, {
        title: showtime.movieTitle,
      });
      movieIds.set(showtime.movieTitle, movieId);
      logger.debug({ movie: showtime.movieTitle }, '映画を保存');
    }

    // 上映情報のUPSERT
    upsertShowtime(db, {
      theaterId,
      movieId,
      date: dateStr,
      startTime: formatTime(showtime.startTime),
      endTime: formatTime(showtime.endTime),
      ...(showtime.format && { format: showtime.format }),
    });
  }

  return {
    theaterCount: theaterIds.size,
    movieCount: movieIds.size,
  };
}

/**
 * チェーンスクレイパーを実行（cinema_sunshine, toho）
 * 各チェーンの全映画館を順次スクレイピングし、DBに保存する。
 */
export async function runChainScrapers(options: ChainScrapeOptions): Promise<ChainScrapeResult[]> {
  const { dryRun, logger } = options;
  const results: ChainScrapeResult[] = [];

  let db: Database | null = null;

  try {
    if (!dryRun) {
      db = await openDatabase();
      logger.info('チェーンスクレイパー: データベースに接続しました');
    }

    const chains = getRegisteredChains();
    logger.info({ chains }, 'チェーンスクレイパー開始');

    for (const chain of chains) {
      const scraper = await createChainScraper(chain);
      if (!scraper) {
        logger.info({ chain }, 'チェーンが無効またはスクレイパー未登録、スキップ');
        continue;
      }

      try {
        const dates = getScrapeDates(chain);
        logger.info({ chain, dateCount: dates.length }, 'スクレイピング日数');

        for (const date of dates) {
          const dateStr = formatDateStr(date);

          try {
            logger.info({ chain, date: dateStr }, 'チェーンスクレイピング開始');

            const result = await scraper.scrapeSchedule({
              movieTitles: [], // 空配列 = 全映画取得
              date,
            });

            if (!result.ok) {
              logger.error({ chain, date: dateStr, error: result.error }, 'チェーンスクレイプエラー');
              results.push({
                chain,
                date: dateStr,
                showtimeCount: 0,
                theaterCount: 0,
                movieCount: 0,
                error: result.error.type,
              });
              continue;
            }

            const showtimes = result.value;
            logger.info({ chain, date: dateStr, count: showtimes.length }, 'チェーンスクレイピング完了');

            let theaterCount = 0;
            let movieCount = 0;

            if (!dryRun && db) {
              const saveResult = saveChainShowtimesToDatabase(db, showtimes, chain, dateStr, logger);
              theaterCount = saveResult.theaterCount;
              movieCount = saveResult.movieCount;

              addScrapeLog(db, {
                area: `chain:${chain}`,
                showtimeCount: showtimes.length,
              });

              saveDatabase(db);
              logger.info({ chain, date: dateStr, theaterCount, movieCount }, 'チェーンデータをDBに保存');
            }

            results.push({
              chain,
              date: dateStr,
              showtimeCount: showtimes.length,
              theaterCount,
              movieCount,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ chain, date: dateStr, error: errorMessage }, 'チェーンスクレイピングエラー');

            if (!dryRun && db) {
              addScrapeLog(db, {
                area: `chain:${chain}`,
                error: errorMessage,
              });
              saveDatabase(db);
            }

            results.push({
              chain,
              date: dateStr,
              showtimeCount: 0,
              theaterCount: 0,
              movieCount: 0,
              error: errorMessage,
            });
          }
        }
      } finally {
        await scraper.close();
      }
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
