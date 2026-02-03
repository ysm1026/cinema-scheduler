/**
 * Googleスプレッドシートへのエクスポートジョブ
 *
 * 設定ファイル (config/cron.yaml):
 *   googleSheets.keyFilePath: サービスアカウントのJSONキーファイルパス
 *   googleSheets.spreadsheetId: 出力先スプレッドシートのID
 */

import * as fs from 'fs';
import * as path from 'path';
import { pino } from 'pino';
import { google, type sheets_v4 } from 'googleapis';
import { openDatabase, closeDatabase } from '@cinema-scheduler/shared';
import { loadConfig } from '../config.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/**
 * 今日の日付をYYYY-MM-DD形式で取得（日本時間）
 */
function getTodayDate(): string {
  const now = new Date();
  // 日本時間（UTC+9）に変換
  const jstOffset = 9 * 60; // 分単位
  const jstDate = new Date(now.getTime() + jstOffset * 60 * 1000);
  return jstDate.toISOString().split('T')[0]!;
}

/**
 * Google Sheets APIクライアントを取得
 */
async function getSheetsClient(keyFilePath: string): Promise<sheets_v4.Sheets> {
  // 相対パスの場合は絶対パスに変換
  const absolutePath = path.isAbsolute(keyFilePath) ? keyFilePath : path.resolve(process.cwd(), keyFilePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`サービスアカウントキーファイルが見つかりません: ${absolutePath}`);
  }

  const keyJson = fs.readFileSync(absolutePath, 'utf-8');
  const credentials = JSON.parse(keyJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * DBから上映データを取得
 */
interface ShowtimeRow {
  date: string;
  area: string;
  theater: string;
  movieTitle: string;
  startTime: string;
  endTime: string;
  format: string | null;
  audioType: string | null;
}

async function getShowtimesFromDB(date?: string): Promise<ShowtimeRow[]> {
  const targetDate = date ?? getTodayDate();
  const db = await openDatabase();

  try {
    const query = `
      SELECT
        s.date,
        t.area,
        t.name as theater,
        m.title as movieTitle,
        s.start_time as startTime,
        s.end_time as endTime,
        s.format,
        s.audio_type as audioType
      FROM showtimes s
      JOIN theaters t ON s.theater_id = t.id
      JOIN movies m ON s.movie_id = m.id
      WHERE s.date = ?
      ORDER BY t.area, t.name, s.start_time
    `;

    const stmt = db.prepare(query);
    stmt.bind([targetDate]);

    const rows: ShowtimeRow[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as ShowtimeRow;
      rows.push(row);
    }
    stmt.free();

    return rows;
  } finally {
    closeDatabase(db);
  }
}

/**
 * スプレッドシートにデータを書き込む
 */
async function writeToSpreadsheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  showtimes: ShowtimeRow[]
): Promise<void> {
  const date = showtimes[0]?.date ?? getTodayDate();
  const sheetName = date; // 日付をシート名に

  // ヘッダー行
  const headers = ['日付', 'エリア', '映画館', '映画', '開始時刻', '終了時刻', 'フォーマット', '音声'];

  // データ行
  const dataRows = showtimes.map((s) => [
    s.date,
    s.area,
    s.theater,
    s.movieTitle,
    s.startTime,
    s.endTime,
    s.format ?? '',
    s.audioType ?? '',
  ]);

  const values = [headers, ...dataRows];

  // シートを作成（既存なら無視）
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName },
            },
          },
        ],
      },
    });
    logger.info({ sheetName }, '新しいシートを作成');
  } catch (error: unknown) {
    // シートが既に存在する場合はクリア
    const isGoogleError = error && typeof error === 'object' && 'code' in error;
    if (isGoogleError && (error as { code: number }).code === 400) {
      logger.info({ sheetName }, 'シートは既存のためクリア');
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
      });
    } else {
      throw error;
    }
  }

  // データを書き込み
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  logger.info({ sheetName, rowCount: dataRows.length }, 'データを書き込み完了');
}

export interface ExportJobOptions {
  date?: string;
  spreadsheetId?: string;
  keyFilePath?: string;
}

/**
 * エクスポートジョブを実行
 */
export async function runExportJob(options: ExportJobOptions = {}): Promise<void> {
  // 設定ファイルから読み込み
  const config = loadConfig();

  const spreadsheetId = options.spreadsheetId ?? config.googleSheets.spreadsheetId;
  const keyFilePath = options.keyFilePath ?? config.googleSheets.keyFilePath;

  if (!spreadsheetId) {
    throw new Error('spreadsheetIdが設定されていません（config/cron.yaml の googleSheets.spreadsheetId）');
  }
  if (!keyFilePath) {
    throw new Error('keyFilePathが設定されていません（config/cron.yaml の googleSheets.keyFilePath）');
  }

  const date = options.date ?? getTodayDate();

  logger.info({ date, spreadsheetId }, 'エクスポートジョブ開始');

  try {
    // DBからデータ取得
    const showtimes = await getShowtimesFromDB(date);

    if (showtimes.length === 0) {
      logger.warn({ date }, 'エクスポート対象のデータがありません');
      return;
    }

    logger.info({ count: showtimes.length }, 'データを取得');

    // Sheets APIクライアント取得
    const sheets = await getSheetsClient(keyFilePath);

    // スプレッドシートに書き込み
    await writeToSpreadsheet(sheets, spreadsheetId, showtimes);

    logger.info({ date, count: showtimes.length }, 'エクスポートジョブ完了');
  } catch (error) {
    logger.error({ error }, 'エクスポートジョブ失敗');
    throw error;
  }
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  runExportJob()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
