#!/usr/bin/env node

import { Command } from 'commander';
import { pino } from 'pino';
import { AREA_CODES } from './scraper/areas.js';
import { validateAreas, generateDateRange, DEFAULT_CONFIG } from './config.js';
import type { Config } from './config.js';
import { runScraper } from './index.js';

const program = new Command();

program
  .name('cinema-scraper')
  .description('eiga.comから映画館の上映スケジュールをスクレイピングする')
  .version('1.0.0')
  .option(
    '-a, --area <areas>',
    'スクレイピング対象エリア（カンマ区切り）',
    (value) => value.split(',').map((s) => s.trim())
  )
  .option('-d, --days <n>', '何日先までスクレイピングするか（1-7）', parseInt)
  .option('--dry-run', 'DBに保存せずに結果を表示', false)
  .option('-v, --verbose', '詳細ログを出力', false)
  .option('--list-areas', '利用可能なエリア一覧を表示')
  .action(async (options) => {
    // エリア一覧表示
    if (options.listAreas) {
      console.log('利用可能なエリア:');
      for (const [name, code] of Object.entries(AREA_CODES)) {
        console.log(`  ${name} (${code})`);
      }
      process.exit(0);
    }

    // 設定構築
    const config: Config = {
      areas: options.area ?? DEFAULT_CONFIG.areas,
      days: options.days ?? DEFAULT_CONFIG.days,
      dryRun: options.dryRun ?? DEFAULT_CONFIG.dryRun,
      verbose: options.verbose ?? DEFAULT_CONFIG.verbose,
    };

    // ロガー設定
    const logger = pino({
      level: config.verbose ? 'debug' : 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    });

    // エリア検証
    const { valid, invalid } = validateAreas(config.areas);
    if (invalid.length > 0) {
      logger.warn({ invalid }, '無効なエリアが指定されました');
    }
    if (valid.length === 0) {
      logger.error('有効なエリアがありません');
      process.exit(1);
    }

    // 日数検証
    if (config.days < 1 || config.days > 7) {
      logger.error('daysは1-7の範囲で指定してください');
      process.exit(1);
    }

    // 日付範囲生成
    const dateStrings = generateDateRange(config.days);
    const dates = dateStrings.map((d) => new Date(d));

    logger.info({
      areas: valid,
      dates: dateStrings,
      dryRun: config.dryRun,
    }, 'スクレイピング開始');

    if (config.dryRun) {
      logger.info('dry-run モード: DBへの保存はスキップされます');
    }

    // スクレイピング実行
    try {
      const results = await runScraper({
        areas: valid,
        dates,
        dryRun: config.dryRun,
        logger,
      });

      // サマリー表示
      const totalShowtimes = results.reduce((sum, r) => sum + r.showtimeCount, 0);
      const errorCount = results.filter((r) => r.error).length;

      logger.info({
        totalShowtimes,
        successCount: results.length - errorCount,
        errorCount,
      }, 'スクレイピング完了');

      // 結果の詳細表示
      if (config.verbose) {
        for (const result of results) {
          if (result.error) {
            logger.error({ area: result.area, date: result.date, error: result.error }, '失敗');
          } else {
            logger.info({
              area: result.area,
              date: result.date,
              showtimes: result.showtimeCount,
              theaters: result.theaterCount,
              movies: result.movieCount,
            }, '成功');
          }
        }
      }

      // エラーがあった場合は非ゼロで終了
      if (errorCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      logger.error({ error }, '予期しないエラーが発生しました');
      process.exit(1);
    }
  });

program.parse();
