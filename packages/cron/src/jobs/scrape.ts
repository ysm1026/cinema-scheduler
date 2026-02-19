/**
 * 毎日のスクレイピングジョブ
 */

import { pino } from 'pino';
import { runScraper, runChainScrapers, validateAreas, generateDateRange, DEFAULT_CONFIG } from '@cinema-scheduler/scraper';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

export interface ScrapeJobOptions {
  areas?: string[];
  days?: number;
}

/**
 * スクレイピングジョブを実行
 */
export async function runScrapeJob(options: ScrapeJobOptions = {}): Promise<void> {
  const areas = options.areas ?? DEFAULT_CONFIG.areas;
  const days = options.days ?? DEFAULT_CONFIG.days;

  logger.info({ areas, days }, 'スクレイピングジョブ開始');

  // エリア検証
  const { valid, invalid } = validateAreas(areas);
  if (invalid.length > 0) {
    logger.warn({ invalid }, '無効なエリアが指定されました');
  }
  if (valid.length === 0) {
    throw new Error('有効なエリアがありません');
  }

  // 日付範囲生成
  const dateStrings = generateDateRange(days);
  const dates = dateStrings.map((d) => new Date(d));

  try {
    const results = await runScraper({
      areas: valid,
      dates,
      dryRun: false,
      logger,
    });

    // eiga.com サマリー
    const totalShowtimes = results.reduce((sum, r) => sum + r.showtimeCount, 0);
    const errorCount = results.filter((r) => r.error).length;

    logger.info({
      totalShowtimes,
      successCount: results.length - errorCount,
      errorCount,
    }, 'eiga.comスクレイピング完了');

    if (errorCount > 0) {
      logger.warn({ errorCount }, 'エラーが発生したエリアがあります');
    }

    // チェーンスクレイパー実行（cinema_sunshine, toho）
    logger.info('チェーンスクレイパーを開始');
    const chainResults = await runChainScrapers({
      dryRun: false,
      logger,
    });

    const chainShowtimes = chainResults.reduce((sum, r) => sum + r.showtimeCount, 0);
    const chainErrors = chainResults.filter((r) => r.error).length;
    logger.info({
      totalShowtimes: chainShowtimes,
      successCount: chainResults.length - chainErrors,
      errorCount: chainErrors,
    }, 'チェーンスクレイピング完了');

    // 全体サマリー
    logger.info({
      eigacom: totalShowtimes,
      chain: chainShowtimes,
      total: totalShowtimes + chainShowtimes,
    }, 'スクレイピングジョブ完了');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'スクレイピングジョブ失敗');
    throw error;
  }
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  runScrapeJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
