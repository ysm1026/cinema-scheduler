/**
 * Cloud Run Job 用スクレイパーエントリーポイント
 * 既存のスクレイパーを実行し、結果の data.db を GCS にアップロードする
 */

import { pino } from 'pino';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runScraper, validateAreas, generateDateRange, DEFAULT_CONFIG } from '@cinema-scheduler/scraper';
import { getDatabasePath, getDatabaseDir, createGcsStorage, openDatabase, closeDatabase } from '@cinema-scheduler/shared';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

async function main(): Promise<void> {
  const bucket = process.env.CLOUD_STORAGE_BUCKET;
  if (!bucket) {
    logger.error('CLOUD_STORAGE_BUCKET environment variable is required');
    process.exit(1);
  }

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
  const gcs = createGcsStorage();
  const dbDir = getDatabaseDir();
  const dbPath = getDatabasePath();

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  try {
    const buffer = await gcs.download(bucket, objectName);
    writeFileSync(dbPath, buffer);
    logger.info({ sizeBytes: buffer.length }, '既存 DB を GCS からダウンロード');
  } catch {
    logger.info('GCS に既存 DB なし、新規作成');
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

  logger.info({ totalShowtimes, totalSkipped, errorCount }, 'スクレイピング完了');

  // データ完全性チェック（GCS アップロード前）
  logger.info('データ完全性チェック開始');
  const checkDb = await openDatabase({ readonly: true });
  try {
    // チェック 1: 全設定エリアが DB に存在するか
    const stmt = checkDb.prepare('SELECT DISTINCT area FROM theaters');
    const dbAreas = new Set<string>();
    while (stmt.step()) {
      dbAreas.add((stmt.getAsObject() as { area: string }).area);
    }
    stmt.free();

    const missingAreas = valid.filter((a) => !dbAreas.has(a));
    if (missingAreas.length > 0) {
      logger.error(
        { missingAreas, dbAreas: [...dbAreas] },
        'データ完全性チェック失敗: 一部エリアのデータが欠落',
      );
      throw new Error(`データ不完全: ${missingAreas.join(', ')} のデータが欠落しています。GCS アップロードを中止します。`);
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
      { dbAreas: [...dbAreas], currentShowtimeCount, baselineShowtimeCount },
      'データ完全性チェック OK',
    );
  } finally {
    closeDatabase(checkDb);
  }

  // data.db を GCS にアップロード
  const dbBuffer = readFileSync(dbPath);

  logger.info({ bucket, objectName, sizeBytes: dbBuffer.length }, 'GCS アップロード開始');
  await gcs.upload(bucket, objectName, dbBuffer);
  logger.info('GCS アップロード完了');
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
