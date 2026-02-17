/**
 * Cinema Scheduler Cron Jobs
 *
 * setIntervalベースのスケジューラ。
 * macOSのスリープ/ウェイクサイクルでもジョブを見逃さない。
 * 毎分チェックし、指定時刻を過ぎていて当日未実行ならジョブを実行する。
 *
 * 設定ファイル: config/cron.yaml
 */

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

/** YYYY-MM-DD形式のローカル日付を取得 */
function getLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** cron式 "M H * * *" からHH:MMを抽出 */
function parseScheduleTime(cronExpr: string): { hour: number; minute: number } | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const minute = parseInt(parts[0]!, 10);
  const hour = parseInt(parts[1]!, 10);
  if (isNaN(minute) || isNaN(hour)) return null;
  return { hour, minute };
}

/** 現在のローカル時刻がHH:MMを過ぎているか */
function isPastTime(hour: number, minute: number): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hour * 60 + minute;
  return currentMinutes >= targetMinutes;
}

// ジョブの最終実行日（日付文字列）を記録
const lastRunDates: Record<string, string> = {};

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
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, '=== スクレイピングジョブ失敗 ===');
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
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, '=== エクスポートジョブ失敗 ===');
  }
}

/**
 * ジョブをチェックして必要なら実行する
 */
async function checkAndRunJob(
  jobName: string,
  cronExpr: string,
  jobFn: () => Promise<void>
): Promise<void> {
  const schedule = parseScheduleTime(cronExpr);
  if (!schedule) return;

  const today = getLocalDate();

  // 既に今日実行済みならスキップ
  if (lastRunDates[jobName] === today) return;

  // 指定時刻を過ぎていなければスキップ
  if (!isPastTime(schedule.hour, schedule.minute)) return;

  // 実行
  lastRunDates[jobName] = today;
  logger.info({ jobName, date: today, schedule: cronExpr }, 'ジョブ実行開始');
  await jobFn();
}

/** 現在実行中のチェックループか */
let isChecking = false;

/**
 * 定期チェック（毎分）
 */
async function tick(): Promise<void> {
  // 再入防止（前回のジョブがまだ実行中の場合）
  if (isChecking) return;
  isChecking = true;

  try {
    const config = loadConfig();

    // スクレイピングジョブ
    await checkAndRunJob('scrape', config.schedule.scrape, scrapeJobWrapper);

    // エクスポートジョブ
    if (isGoogleSheetsConfigured(config)) {
      await checkAndRunJob('export', config.schedule.export, exportJobWrapper);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, 'スケジューラチェックエラー');
  } finally {
    isChecking = false;
  }
}

/**
 * スケジューラを開始
 */
function startScheduler(): void {
  const config = loadConfig();

  logger.info({ configFile: 'config/cron.yaml' }, '設定ファイルを読み込みました');
  logger.info({ scrape: config.schedule.scrape, export: config.schedule.export }, 'スケジュール設定');

  if (!isGoogleSheetsConfigured(config)) {
    logger.info('Googleスプレッドシート連携が未設定のため、エクスポートジョブはスキップ');
  }

  // 毎分チェック
  setInterval(tick, 60 * 1000);

  // 起動直後にもチェック（スリープ復帰やプロセス再起動時の見逃し対策）
  tick();

  logger.info('スケジューラを開始しました（60秒間隔チェック）。Ctrl+Cで終了します。');
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
