/**
 * Cloud Run Job 用スクレイパーエントリーポイント
 * 既存のスクレイパーを実行し、結果の data.db を GCS にアップロードする
 */

import { pino } from 'pino';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runScraper, runChainScrapers, validateAreas, generateDateRange, DEFAULT_CONFIG } from '@cinema-scheduler/scraper';
import { getDatabasePath, getDatabaseDir, createGcsStorage, openDatabase, closeDatabase } from '@cinema-scheduler/shared';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

async function main(): Promise<void> {
  const bucket = process.env.CLOUD_STORAGE_BUCKET;
  const skipGcs = !bucket;

  const objectName = process.env.GCS_OBJECT_NAME ?? 'data.db';

  // エリア設定
  const areasEnv = process.env.SCRAPE_AREAS?.split(',').filter(Boolean);
  const areas = areasEnv ?? DEFAULT_CONFIG.areas;
  const days = parseInt(process.env.SCRAPE_DAYS ?? '7', 10);
  const concurrency = parseInt(process.env.SCRAPE_CONCURRENCY ?? '3', 10);

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

  // GCS から既存 DB をダウンロード（重複スキップのため）
  const gcs = skipGcs ? null : createGcsStorage();
  const dbDir = getDatabaseDir();
  const dbPath = getDatabasePath();

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  if (gcs && bucket) {
    try {
      const buffer = await gcs.download(bucket, objectName);
      writeFileSync(dbPath, buffer);
      logger.info({ sizeBytes: buffer.length }, '既存 DB を GCS からダウンロード');
    } catch {
      logger.info('GCS に既存 DB なし、新規作成');
    }
  } else {
    logger.info('GCS スキップ: ローカルモードで実行');
  }

  // ベースライン記録（GCS からダウンロードした DB のショータイム数）
  let baselineShowtimeCount = 0;
  if (existsSync(dbPath)) {
    const baseDb = await openDatabase({ readonly: true });
    try {
      const row = baseDb.exec('SELECT COUNT(*) as cnt FROM showtimes');
      baselineShowtimeCount = (row[0]?.values[0]?.[0] as number) ?? 0;
      logger.info({ baselineShowtimeCount }, 'ベースライン記録');
    } finally {
      closeDatabase(baseDb);
    }
  }

  logger.info({ areas: valid, days, concurrency, bucket }, 'Cloud Run Job スクレイピング開始');

  // スクレイピング実行（ローカルの data.db に保存）
  const results = await runScraper({
    areas: valid,
    dates,
    dryRun: false,
    logger,
    concurrency,
  });

  const totalShowtimes = results.reduce((sum, r) => sum + r.showtimeCount, 0);
  const totalSkipped = results.reduce((sum, r) => sum + (r.skippedTheaters ?? 0), 0);
  const errorCount = results.filter((r) => r.error).length;

  logger.info({ totalShowtimes, totalSkipped, errorCount }, 'eiga.comスクレイピング完了');

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

  logger.info({
    eigacom: totalShowtimes,
    chain: chainShowtimes,
    total: totalShowtimes + chainShowtimes,
  }, '全スクレイピング完了');

  // データ完全性チェック（GCS アップロード前）
  logger.info('データ完全性チェック開始');
  const checkDb = await openDatabase({ readonly: true });
  try {
    // チェック 1: 設定エリアのカバレッジ（小規模エリアは上映データ0件の場合があるため警告のみ）
    const stmt = checkDb.prepare('SELECT DISTINCT area FROM theaters');
    const dbAreas = new Set<string>();
    while (stmt.step()) {
      dbAreas.add((stmt.getAsObject() as { area: string }).area);
    }
    stmt.free();

    const missingAreas = valid.filter((a) => !dbAreas.has(a));
    const missingRatio = missingAreas.length / valid.length;
    if (missingAreas.length > 0) {
      logger.warn(
        { missingAreas, missingCount: missingAreas.length, totalAreas: valid.length, missingRatio: Math.round(missingRatio * 100) + '%' },
        'データ完全性チェック: 一部エリアのデータが欠落（上映情報0件のエリア）',
      );
    }
    // 20%以上のエリアが欠落している場合のみ致命的エラー
    if (missingRatio > 0.2) {
      throw new Error(`データ不完全: ${missingAreas.length}/${valid.length} エリア (${Math.round(missingRatio * 100)}%) が欠落。GCS アップロードを中止します。`);
    }

    // チェック 2: ショータイム数が大幅に減少していないか
    const countRow = checkDb.exec('SELECT COUNT(*) as cnt FROM showtimes');
    const currentShowtimeCount = (countRow[0]?.values[0]?.[0] as number) ?? 0;
    if (baselineShowtimeCount > 0 && currentShowtimeCount < baselineShowtimeCount * 0.5) {
      logger.error(
        { baselineShowtimeCount, currentShowtimeCount },
        'データ完全性チェック失敗: ショータイム数が大幅に減少',
      );
      throw new Error(
        `ショータイム数が大幅に減少: ${baselineShowtimeCount} → ${currentShowtimeCount}。GCS アップロードを中止します。`,
      );
    }

    logger.info(
      { coveredAreas: dbAreas.size, totalAreas: valid.length, currentShowtimeCount, baselineShowtimeCount },
      'データ完全性チェック OK',
    );
  } finally {
    closeDatabase(checkDb);
  }

  // data.db を GCS にアップロード（リトライ付き、失敗してもスクレイピング結果は有効）
  if (gcs && bucket) {
    const dbBuffer = readFileSync(dbPath);
    logger.info({ bucket, objectName, sizeBytes: dbBuffer.length }, 'GCS アップロード開始');

    const maxRetries = 3;
    let uploaded = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await gcs.upload(bucket, objectName, dbBuffer);
        logger.info('GCS アップロード完了');
        uploaded = true;
        break;
      } catch (uploadError) {
        logger.warn({ err: uploadError, attempt, maxRetries }, `GCS アップロード失敗 (${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          const waitSec = attempt * 10;
          logger.info({ waitSec }, 'リトライ待機中...');
          await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
        }
      }
    }
    if (!uploaded) {
      logger.error('GCS アップロード: 全リトライ失敗（スクレイピング結果はローカルDBに保存済み）');
    }
  } else {
    logger.info({ dbPath }, 'GCS スキップ: ローカル DB のみ保存');
  }
}

main()
  .then(() => {
    logger.info('Cloud Run Job 正常終了');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Cloud Run Job 失敗');
    process.exit(1);
  });
