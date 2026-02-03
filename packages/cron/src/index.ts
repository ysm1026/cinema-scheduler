/**
 * Cinema Scheduler Cron Jobs
 *
 * 設定ファイル: config/cron.yaml
 *
 * 定期実行スケジュール:
 *   - スクレイピング: 毎日 06:00（デフォルト）
 *   - スプレッドシートエクスポート: 毎日 07:00（デフォルト）
 */

import cron from 'node-cron';
import { pino } from 'pino';
import { runScrapeJob } from './jobs/scrape.js';
import { runExportJob } from './jobs/export-sheets.js';
import { loadConfig, isGoogleSheetsConfigured } from './config.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/**
 * スクレイピングジョブのラッパー
 */
async function scrapeJobWrapper(): Promise<void> {
  const config = loadConfig();
  const startTime = Date.now();
  logger.info('=== スクレイピングジョブ開始 ===');

  try {
    await runScrapeJob({
      areas: config.scrape.areas,
      days: config.scrape.days,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info({ duration: `${duration}s` }, '=== スクレイピングジョブ完了 ===');
  } catch (error) {
    logger.error({ error }, '=== スクレイピングジョブ失敗 ===');
  }
}

/**
 * エクスポートジョブのラッパー
 */
async function exportJobWrapper(): Promise<void> {
  const startTime = Date.now();
  logger.info('=== エクスポートジョブ開始 ===');

  try {
    await runExportJob();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info({ duration: `${duration}s` }, '=== エクスポートジョブ完了 ===');
  } catch (error) {
    logger.error({ error }, '=== エクスポートジョブ失敗 ===');
  }
}

/**
 * cronスケジューラを開始
 */
function startScheduler(): void {
  const config = loadConfig();

  logger.info({ configFile: 'config/cron.yaml' }, '設定ファイルを読み込みました');

  // スクレイピングジョブをスケジュール
  const scrapeCron = config.schedule.scrape;
  if (cron.validate(scrapeCron)) {
    cron.schedule(scrapeCron, scrapeJobWrapper, {
      timezone: 'Asia/Tokyo',
    });
    logger.info({ schedule: scrapeCron }, 'スクレイピングジョブをスケジュール');
  } else {
    logger.error({ schedule: scrapeCron }, '無効なcron式です');
  }

  // エクスポートジョブをスケジュール（設定が有効な場合のみ）
  if (isGoogleSheetsConfigured(config)) {
    const exportCron = config.schedule.export;
    if (cron.validate(exportCron)) {
      cron.schedule(exportCron, exportJobWrapper, {
        timezone: 'Asia/Tokyo',
      });
      logger.info({ schedule: exportCron }, 'エクスポートジョブをスケジュール');
    } else {
      logger.error({ schedule: exportCron }, '無効なcron式です');
    }
  } else {
    logger.info('Googleスプレッドシート連携が未設定のため、エクスポートジョブはスキップ');
  }

  logger.info('Cronスケジューラを開始しました。Ctrl+Cで終了します。');
}

/**
 * 即時実行モード
 */
async function runNow(jobType: 'scrape' | 'export' | 'all'): Promise<void> {
  if (jobType === 'scrape' || jobType === 'all') {
    await scrapeJobWrapper();
  }
  if (jobType === 'export' || jobType === 'all') {
    await exportJobWrapper();
  }
}

// メイン処理
const args = process.argv.slice(2);

if (args.includes('--run-now')) {
  // 即時実行
  const jobType = args.includes('--scrape')
    ? 'scrape'
    : args.includes('--export')
      ? 'export'
      : 'all';

  runNow(jobType)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  // スケジューラ起動
  startScheduler();
}
